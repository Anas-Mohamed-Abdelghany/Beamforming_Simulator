"""
physics/ultrasound/imaging.py
==============================
A-mode, B-mode, and Doppler physics for the ultrasound simulator.

Units throughout:
  - Depth / position : cm (physical world).
  - Phantom pixels   : normalised [0, 1] then converted via width_cm/depth_cm.
  - Impedance        : MRayl.
  - Frequency        : MHz.
  - Speed of sound   : 1540 m/s = 154 000 cm/s.
"""

import math
import numpy as np
from typing import Any

from .waves import BeamParams, apply_beamforming
from .phantom_engine import generate_phantom

# ── Constants ────────────────────────────────────────────────────────────────
C_CM_S = 154_000.0          # speed of sound in cm/s
BACKGROUND_Z = 0.0          # acoustic impedance of air / coupling medium (MRayl)
DEPTH_SAMPLES = 512         # A-mode sample count


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_impedance_profile(
    probe_x_cm: float,
    angle_deg: float,
    phantom: dict[str, Any],
) -> np.ndarray:
    """
    Cast a single ray from the probe and return the impedance at each depth
    sample.  Returns array shape (DEPTH_SAMPLES,).
    """
    label_map = phantom["label_map"]
    size  = phantom["size"]
    W_cm  = phantom["width_cm"]
    D_cm  = phantom["depth_cm"]

    depth_cm = np.linspace(0.0, D_cm, DEPTH_SAMPLES)  # (N,)

    # Lateral offset due to steering angle along each depth step
    tan_a  = math.tan(math.radians(angle_deg))
    x_cm   = probe_x_cm + depth_cm * tan_a            # (N,)

    # Convert physical cm → pixel indices
    px = np.clip((x_cm / W_cm * size).astype(int), 0, size - 1)
    pz = np.clip((depth_cm / D_cm * size).astype(int), 0, size - 1)

    # Lookup tissue label at each sample
    labels = label_map[pz, px]   # (N,)

    # Convert label → acoustic impedance
    ellipses = phantom["ellipses"]
    z_profile = np.full(DEPTH_SAMPLES, BACKGROUND_Z, dtype=float)
    for i in range(DEPTH_SAMPLES):
        lbl = int(labels[i])
        if lbl > 0:
            z_profile[i] = ellipses[lbl - 1]["acoustic_impedance"]

    return z_profile, depth_cm


def _impedance_to_reflections(z_profile: np.ndarray) -> np.ndarray:
    """
    Convert an acoustic impedance profile into reflection coefficient amplitudes.
    RC = |Z2 - Z1| / (Z2 + Z1)  at each interface.
    """
    rc = np.zeros_like(z_profile)
    for i in range(1, len(z_profile)):
        z1 = z_profile[i - 1]
        z2 = z_profile[i]
        denom = z1 + z2
        if denom > 0:
            rc[i] = abs(z2 - z1) / denom
    return rc


# ── A-mode ────────────────────────────────────────────────────────────────────

def get_a_mode(
    probe_x_cm: float,
    probe_y_cm: float,     # currently unused — probe is at the top of phantom
    angle_deg: float,
    phantom: dict[str, Any],
    beam_params: BeamParams,
) -> dict[str, Any]:
    """
    Generate a single A-mode (amplitude vs depth) scan line.

    Returns
    -------
    {
        "depths_cm"   : list[float],
        "amplitudes"  : list[float],
        "depth_cm"    : float,
    }
    """
    rng = np.random.default_rng(seed=int(probe_x_cm * 1000) % (2**31))

    z_profile, depths_cm = _get_impedance_profile(probe_x_cm, angle_deg, phantom)
    raw_rc = _impedance_to_reflections(z_profile)

    # Lateral offsets are zero for an on-axis scan line
    lateral_offsets = np.zeros(DEPTH_SAMPLES)

    # Apply all 7 beamforming parameters
    amplitudes = apply_beamforming(
        raw_amplitudes=raw_rc,
        depths_mm=depths_cm * 10.0,           # cm → mm
        lateral_offsets_mm=lateral_offsets,
        params=beam_params,
        rng=rng,
    )

    return {
        "depths_cm":  depths_cm.tolist(),
        "amplitudes": amplitudes.tolist(),
        "depth_cm":   float(phantom["depth_cm"]),
    }


# ── B-mode ────────────────────────────────────────────────────────────────────

def get_b_mode(
    probe_x_cm: float,
    probe_y_cm: float,
    aperture_cm: float,
    n_lines: int,
    phantom: dict[str, Any],
    beam_params: BeamParams,
) -> dict[str, Any]:
    """
    Generate a B-mode image by sweeping n_lines A-mode pulses across aperture_cm.

    Returns
    -------
    {
        "image"     : list[list[float]],   # (n_lines × DEPTH_SAMPLES), values [0,1]
        "width_cm"  : float,
        "depth_cm"  : float,
        "n_lines"   : int,
        "n_samples" : int,
    }
    """
    half = aperture_cm / 2.0
    x_positions = np.linspace(probe_x_cm - half, probe_x_cm + half, n_lines)

    image_lines: list[np.ndarray] = []
    rng = np.random.default_rng(42)

    for i, x in enumerate(x_positions):
        lateral_offset = float(x - probe_x_cm)
        z_profile, depths_cm = _get_impedance_profile(x, 0.0, phantom)
        raw_rc = _impedance_to_reflections(z_profile)

        lateral_offsets = np.full(DEPTH_SAMPLES, lateral_offset * 10.0)  # mm

        amps = apply_beamforming(
            raw_amplitudes=raw_rc,
            depths_mm=depths_cm * 10.0,
            lateral_offsets_mm=lateral_offsets,
            params=beam_params,
            rng=rng,
        )
        image_lines.append(amps)

    image = np.column_stack(image_lines)   # (DEPTH_SAMPLES, n_lines)

    # Log-compression and normalisation to [0, 1]
    eps = 1e-9
    image_db = 20.0 * np.log10(image + eps)
    dyn_range_db = 60.0
    image_db = np.clip(image_db - image_db.max(), -dyn_range_db, 0.0)
    image_norm = (image_db + dyn_range_db) / dyn_range_db   # [0, 1]

    return {
        "image":     image_norm.tolist(),
        "width_cm":  float(aperture_cm),
        "depth_cm":  float(phantom["depth_cm"]),
        "n_lines":   n_lines,
        "n_samples": DEPTH_SAMPLES,
    }


# ── Doppler ────────────────────────────────────────────────────────────────────

def get_doppler_shift(
    phantom: dict[str, Any],
    vessel_velocity_cm_s: float,
    vessel_angle_deg: float,
    frequency_mhz: float,
) -> dict[str, Any]:
    """
    Calculate the Doppler frequency shift for the simulated blood vessel.

    Formula:  fd = 2 · f0 · v · cos(θ) / c

    Parameters
    ----------
    phantom               : phantom dict (to locate is_vessel ellipse)
    vessel_velocity_cm_s  : blood flow speed in cm/s
    vessel_angle_deg      : angle between probe beam and vessel wall (degrees)
    frequency_mhz         : transmit frequency in MHz

    Returns
    -------
    {
        "fd_hz"           : float,   Doppler shift in Hz
        "velocity_cm_s"   : float,
        "angle_deg"       : float,
        "frequency_mhz"   : float,
        "cos_theta"       : float,
        "vessel_label"    : str,
    }
    """
    f0_hz  = frequency_mhz * 1e6                # Hz
    v_cm_s = float(vessel_velocity_cm_s)
    v_m_s  = v_cm_s / 100.0                     # m/s
    theta  = math.radians(float(vessel_angle_deg))

    c_m_s  = C_CM_S / 100.0                     # 1540 m/s

    cos_theta = math.cos(theta)
    fd_hz = (2.0 * f0_hz * v_m_s * cos_theta) / c_m_s

    # Find vessel label from phantom
    vessel_label = "Blood Vessel"
    for e in phantom.get("ellipses", []):
        if e.get("is_vessel", False):
            vessel_label = e.get("label", "Blood Vessel")
            break

    return {
        "fd_hz":          round(fd_hz, 4),
        "velocity_cm_s":  round(v_cm_s, 2),
        "angle_deg":      round(float(vessel_angle_deg), 2),
        "frequency_mhz":  round(frequency_mhz, 2),
        "cos_theta":      round(cos_theta, 4),
        "vessel_label":   vessel_label,
    }
