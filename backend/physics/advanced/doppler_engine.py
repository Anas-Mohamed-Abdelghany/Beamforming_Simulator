"""
doppler_engine.py
=================
Blood-vessel Doppler ultrasound simulation.

Physics core:
    f_d = (2 * v * cos(θ)) / c * f₀

where
    v   = blood velocity  [m/s]
    θ   = vessel angle to beam axis  [degrees → radians]
    c   = speed of sound in soft tissue  [m/s]  (default 1540)
    f₀  = transducer centre frequency  [Hz]

Additional outputs
    - Spectral broadening  σ_f  
    - Signal-to-noise ratio
    - A simulated Doppler power-spectrum array
    - Wall-filter model
    - Reynolds Number and turbulence profile
    - Pulsatile wave profiling (Carotid, Femoral, Aortic)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List

import numpy as np

# ── Constants ────────────────────────────────────────────────────────────────
C_TISSUE = 1540.0           # m/s  — speed of sound in soft tissue
VESSEL_NOISE_FLOOR = -60.0  # dBFS — baseline noise floor

# ── Parameter model ──────────────────────────────────────────────────────────

@dataclass
class DopplerParams:
    """All user-controllable Doppler parameters."""

    # Param 1 – Blood peak velocity  [cm/s → converted to m/s internally]
    velocity_cm_s: float = 60.0          # 1–150 cm/s

    # Param 2 – Vessel angle relative to beam  [degrees]
    angle_deg: float = 60.0             # 0–89°  (90° → no detectable Doppler)

    # Param 3 – Transducer centre frequency  [MHz]
    frequency_mhz: float = 5.0          # 1–15 MHz

    # Param 4 – Speed of sound (tissue type)  [m/s]
    c_sound: float = C_TISSUE           # 1450–1600 m/s

    # Param 5 – Wall-filter cutoff  [Hz]
    wall_filter_hz: float = 50.0        # 0–400 Hz

    # Param 6 – SNR / gain  [dB]
    snr_db: float = 30.0                # 0–60 dB

    # Param 7 – Spectral spread factor (turbulence index 0–1)
    turbulence: float = 0.1             # 0 = laminar, 1 = fully turbulent

    # ADVANCED PARAMS
    heart_rate_bpm: float = 72.0
    sd_ratio: float = 0.6
    diameter_mm: float = 6.0
    waveform_shape: str = 'carotid'
    stenocity: str = 'normal'
    baseline_shift: float = 0.0         # -1.0 to 1.0

    @property
    def velocity_m_s(self) -> float:
        v = self.velocity_cm_s / 100.0
        if self.stenocity == 'stenotic':
            v *= 2.5  # Stenosis drastically increases peak velocity
        return v

    @property
    def angle_rad(self) -> float:
        return math.radians(self.angle_deg)

    @property
    def f0_hz(self) -> float:
        return self.frequency_mhz * 1e6


# ── Core physics ─────────────────────────────────────────────────────────────

def doppler_shift(params: DopplerParams) -> float:
    """
    Return the peak Doppler shift frequency [Hz].

        f_d = (2 * v * cos(θ) * f₀) / c
    """
    return (2.0 * params.velocity_m_s * math.cos(params.angle_rad) * params.f0_hz) / params.c_sound


def nyquist_limit(params: DopplerParams, prf_hz: float = 10_000.0) -> float:
    """Maximum unambiguous velocity for a given PRF [m/s]."""
    return (prf_hz * params.c_sound) / (4.0 * params.f0_hz)


def reynolds_number(params: DopplerParams) -> float:
    """
    Calculate Reynolds Number for blood flow.
    Re = (density * velocity * diameter) / viscosity
    density of blood ≈ 1060 kg/m^3
    viscosity of blood ≈ 0.0035 Pa.s
    """
    rho = 1060.0
    mu = 0.0035
    d_m = params.diameter_mm / 1000.0
    return (rho * params.velocity_m_s * d_m) / mu


def spectral_broadening(params: DopplerParams, beam_width_deg: float = 5.0) -> float:
    """
    Estimate σ of the Doppler spectrum [Hz].
    Accounts for turbulent plug profile when Re > 2300.
    """
    # Geometric broadening — finite beam width contribution
    delta_angle = math.radians(beam_width_deg / 2.0)
    f_peak = doppler_shift(params)
    geom_sigma = abs(f_peak * math.tan(params.angle_rad) * math.tan(delta_angle))

    # Trigger turbulent plug profile if Re > 2300
    re = reynolds_number(params)
    effective_turbulence = params.turbulence
    if re > 2300.0:
        effective_turbulence = max(effective_turbulence, min(1.0, re / 5000.0))

    turb_velocity = effective_turbulence * params.velocity_m_s
    turb_sigma = (2.0 * turb_velocity * params.f0_hz) / params.c_sound

    return math.sqrt(geom_sigma**2 + turb_sigma**2)


# ── Spectrum generation ───────────────────────────────────────────────────────

def generate_doppler_spectrum(
    params: DopplerParams,
    n_points: int = 256,
    prf_hz: float = 10_000.0,
) -> dict:
    """Produce a simulated Doppler power spectrum."""
    f_peak = doppler_shift(params)
    sigma  = max(spectral_broadening(params), 20.0)

    f_max = prf_hz / 2.0
    
    # Baseline shift: shift the frequency window based on baseline [-1.0, 1.0]
    shift = params.baseline_shift
    f_low = -f_max * (1.0 + shift)
    f_high = f_max * (1.0 - shift)
    
    freqs = np.linspace(f_low, f_high, n_points)

    signal_power = np.exp(-0.5 * ((freqs - f_peak) / sigma) ** 2)

    wall_mask = np.abs(freqs) < params.wall_filter_hz
    signal_power[wall_mask] = 0.0

    noise_linear = 10.0 ** (VESSEL_NOISE_FLOOR / 10.0)
    snr_linear   = 10.0 ** (params.snr_db / 10.0)
    total_power  = signal_power / snr_linear + noise_linear
    power_db     = 10.0 * np.log10(np.maximum(total_power, 1e-12))

    # Aliasing occurs if peak outside our shifted frequency window
    aliased = f_peak < f_low or f_peak > f_high
    re = reynolds_number(params)

    return {
        "freqs_hz":     freqs.tolist(),
        "power_db":     power_db.tolist(),
        "peak_fd":      round(f_peak, 2),
        "sigma_fd":     round(sigma, 2),
        "v_peak_cm_s":  round(params.velocity_m_s * 100, 2),
        "v_nyquist_cm_s": round(nyquist_limit(params, prf_hz) * 100.0, 2),
        "aliased":      aliased,
        "angle_deg":    params.angle_deg,
        "f0_mhz":       params.frequency_mhz,
        "snr_db":       params.snr_db,
        "reynolds":     round(re, 1)
    }


# ── Waterfall / M-mode strip ──────────────────────────────────────────────────

def generate_waterfall(
    params: DopplerParams,
    n_frames: int = 64,
    n_points: int = 128,
    prf_hz: float = 10_000.0,
) -> dict:
    """Generate a 2-D waterfall array with specific pulsatile waveforms."""
    heart_rate_hz = params.heart_rate_bpm / 60.0
    t_frames = np.linspace(0, n_frames / 15.0, n_frames)
    
    period = 1.0 / heart_rate_hz
    v_envelope = np.zeros_like(t_frames)
    
    for i, t in enumerate(t_frames):
        phase = (t % period) / period
        v = 0.0
        if params.waveform_shape == 'carotid':
            if phase < 0.15: v = 0.4 + 0.6 * (phase / 0.15)
            elif phase < 0.4: v = 1.0 - 0.5 * ((phase - 0.15) / 0.25)
            else: v = 0.5 - 0.1 * ((phase - 0.4) / 0.6)
            
        elif params.waveform_shape == 'aortic':
            if phase < 0.15: v = phase / 0.15
            elif phase < 0.25: v = 1.0 - 1.2 * ((phase - 0.15) / 0.1)
            elif phase < 0.4: v = -0.2 + 0.2 * ((phase - 0.25) / 0.15)
            else: v = 0.0
            
        elif params.waveform_shape == 'femoral':
            if phase < 0.2: v = phase / 0.2
            elif phase < 0.35: v = 1.0 - 1.3 * ((phase - 0.2) / 0.15)
            elif phase < 0.5: v = -0.3 + 0.4 * ((phase - 0.35) / 0.15)
            else: v = 0.1 - 0.1 * ((phase - 0.5) / 0.5)
            
        elif params.waveform_shape == 'portal_vein':
             v = 0.8 + 0.1 * np.sin(2 * np.pi * phase)
             
        elif params.waveform_shape == 'umbilical':
             v = 0.6 + 0.4 * np.sin(2 * np.pi * phase)
             
        else: # continuous
            v = 1.0
            
        v_envelope[i] = v

    # Sys/Dia metrics
    s_peak = float(np.max(v_envelope))
    d_trough = float(np.min(v_envelope))
    mean_v = float(np.mean(np.abs(v_envelope)))
    ri = (s_peak - d_trough) / s_peak if s_peak != 0 else 0.0
    pi = (s_peak - d_trough) / mean_v if mean_v != 0 else 0.0

    matrix = []
    base_spec = generate_doppler_spectrum(params, n_points=n_points, prf_hz=prf_hz)
    
    for scale in v_envelope:
        p = DopplerParams(
            velocity_cm_s=params.velocity_cm_s * scale,
            angle_deg=params.angle_deg,
            frequency_mhz=params.frequency_mhz,
            c_sound=params.c_sound,
            wall_filter_hz=params.wall_filter_hz,
            snr_db=params.snr_db,
            turbulence=params.turbulence,
            heart_rate_bpm=params.heart_rate_bpm,
            sd_ratio=params.sd_ratio,
            diameter_mm=params.diameter_mm,
            waveform_shape=params.waveform_shape,
            stenocity=params.stenocity,
            baseline_shift=params.baseline_shift
        )
        spec = generate_doppler_spectrum(p, n_points=n_points, prf_hz=prf_hz)
        matrix.append(spec["power_db"])

    return {
        "matrix":   matrix,
        "freqs_hz": base_spec["freqs_hz"],
        "n_frames": n_frames,
        "metrics": {
            "ri": round(ri, 2),
            "pi": round(pi, 2)
        }
    }
