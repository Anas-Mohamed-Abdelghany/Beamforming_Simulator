"""
physics/ultrasound/waves.py
============================
Beamforming signal-processing utilities.

The 7 controllable parameters (all exposed in BeamParams):
  1. frequency_mhz    — centre frequency in MHz
  2. n_elements       — number of transducer elements
  3. spacing_mm       — element pitch in mm
  4. curvature_mm     — array curvature radius (0 = flat)
  5. focal_depth_mm   — focal depth in mm
  6. snr              — Signal-to-Noise Ratio on a [0, 1000] linear scale
                        (mapped internally to dB: 0 → 0 dB, 1000 → 60 dB)
  7. apodization      — window name ('none'|'hanning'|'hamming'|'blackman')
"""

import math
import numpy as np
from dataclasses import dataclass, field

from .array_geometry import (
    get_element_positions,
    steering_delays,
    get_apodization,
    C_SOUND_M_S,
)

# ── Parameter model ───────────────────────────────────────────────────────────

@dataclass
class BeamParams:
    frequency_mhz:  float = 5.0      # 1 – 15 MHz
    n_elements:     int   = 64       # 16 – 256
    spacing_mm:     float = 0.4      # 0.1 – 1.5 mm
    curvature_mm:   float = 0.0      # 0 = flat, >0 = convex radius
    focal_depth_mm: float = 40.0     # 5 – 150 mm
    snr:            float = 800.0    # 0 – 1000 linear
    apodization:    str   = "hanning"

    # Derived
    @property
    def frequency_hz(self) -> float:
        return self.frequency_mhz * 1e6

    @property
    def wavelength_mm(self) -> float:
        """λ in mm for f0 in MHz, c = 1540 m/s."""
        return (C_SOUND_M_S / self.frequency_hz) * 1_000.0

    @property
    def snr_db(self) -> float:
        """Convert [0, 1000] linear SNR to dB (0 → 0 dB, 1000 → 60 dB)."""
        val = max(1e-6, float(self.snr))
        return (val / 1000.0) * 60.0

    @property
    def noise_amplitude(self) -> float:
        """RMS noise amplitude for unit-peak signal."""
        snr_linear = 10.0 ** (self.snr_db / 20.0)
        return 1.0 / max(1e-9, snr_linear)


# ── Beam-width & f-number ─────────────────────────────────────────────────────

def f_number(aperture_mm: float, focal_depth_mm: float) -> float:
    """F/# = focal_depth / aperture. Lower → tighter focus."""
    if aperture_mm <= 0:
        return 1e6
    return focal_depth_mm / aperture_mm


def lateral_beam_width_mm(params: BeamParams) -> float:
    """
    Approximate -6 dB lateral beam width at the focal depth.
      beam_width ≈ λ · F/#
    """
    aperture_mm = params.n_elements * params.spacing_mm
    fn = f_number(aperture_mm, params.focal_depth_mm)
    return params.wavelength_mm * fn


def axial_resolution_mm(params: BeamParams) -> float:
    """
    Approximate axial resolution = c / (2 · BW).
    Assuming 50 % fractional bandwidth around f0.
    """
    bw_hz = 0.5 * params.frequency_hz
    return (C_SOUND_M_S / (2.0 * bw_hz)) * 1_000.0  # → mm


# ── Lateral gain profile ──────────────────────────────────────────────────────

def lateral_gain(
    lateral_offset_mm: np.ndarray,
    params: BeamParams,
) -> np.ndarray:
    """
    Vectorised version of lateral gain. Returns array of same shape as lateral_offset_mm.
    """
    bw = lateral_beam_width_mm(params)
    if bw <= 0:
        return np.ones_like(lateral_offset_mm, dtype=float)

    # Normalised lateral distance
    u = lateral_offset_mm / (bw / 2.0)

    # Main-lobe Gaussian approximation
    main_lobe = np.exp(-0.5 * (u ** 2) * 2.77)

    # Side-lobe suppression
    side_lobe_dB = {
        "none":     13.0,
        "hanning":  32.0,
        "hamming":  41.0,
        "blackman": 57.0,
    }.get(params.apodization.lower(), 32.0)
    side_lobe_amp = 10.0 ** (-side_lobe_dB / 20.0)

    side_lobe = side_lobe_amp * np.abs(np.sin(np.pi * u))

    return np.minimum(1.0, main_lobe + side_lobe)


# ── Depth gain compensation ───────────────────────────────────────────────────

def depth_gain(depth_mm: np.ndarray, params: BeamParams) -> np.ndarray:
    """
    Vectorised depth-gain profile.
    """
    attenuation_db_per_cm_per_mhz = 0.5
    path_cm = 2.0 * depth_mm / 10.0
    att_db = attenuation_db_per_cm_per_mhz * params.frequency_mhz * path_cm
    att_gain = 10.0 ** (-att_db / 20.0)

    delta = depth_mm - params.focal_depth_mm
    focus_zone_mm = params.focal_depth_mm * 0.2
    if focus_zone_mm > 0:
        focus_gain = np.exp(-0.5 * (delta / focus_zone_mm) ** 2)
        focus_gain = 0.3 + 0.7 * focus_gain
    else:
        focus_gain = np.ones_like(depth_mm)

    return att_gain * focus_gain


# ── Main apply_beamforming helper ─────────────────────────────────────────────

def apply_beamforming(
    raw_amplitudes: np.ndarray,
    depths_mm: np.ndarray,
    lateral_offsets_mm: np.ndarray | None,
    params: BeamParams,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """
    Apply all 7 beamforming parameters to a raw reflection amplitude array.

    Parameters
    ----------
    raw_amplitudes      : (N,) reflectivity values (0–1) along a scan line.
    depths_mm           : (N,) depth in mm for each sample.
    lateral_offsets_mm  : (N,) lateral distance from scan-line centre, or None.
    params              : BeamParams instance.
    rng                 : numpy random Generator (for reproducible noise).

    Returns
    -------
    processed : (N,) processed amplitudes, ready for envelope-detection display.
    """
    if rng is None:
        rng = np.random.default_rng(42)

    out = raw_amplitudes.astype(float).copy()
    N = len(out)

    # 1. Depth-dependent gain (focal depth, tissue attenuation)
    out *= depth_gain(depths_mm, params)

    # 2. Lateral beam-width / side-lobe shaping
    if lateral_offsets_mm is not None:
        out *= lateral_gain(lateral_offsets_mm, params)

    # 3. Apodization element-count influence:
    #    more elements → lower effective noise floor by sqrt(N) coherent sum
    element_gain = math.sqrt(params.n_elements) / math.sqrt(64.0)   # ref 64 elem
    out *= element_gain

    # 4. Add Gaussian noise scaled by SNR parameter
    noise = rng.normal(0.0, params.noise_amplitude, N)
    out += noise

    # 5. Clamp to non-negative (envelope detection)
    out = np.clip(out, 0.0, None)

    return out
