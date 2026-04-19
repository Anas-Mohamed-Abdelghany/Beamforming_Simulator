"""
routes/doppler.py
=================
FastAPI router — Doppler blood-vessel simulation endpoints.
Mount at:  /api/doppler
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from backend.physics.advanced.doppler_engine import (
    DopplerParams,
    doppler_shift,
    spectral_broadening,
    generate_doppler_spectrum,
    generate_waterfall,
    nyquist_limit,
)

router = APIRouter()


# ── Request model ─────────────────────────────────────────────────────────────

class DopplerRequest(BaseModel):
    velocity_cm_s:   float = Field(60.0,   ge=1.0,  le=150.0)
    angle_deg:       float = Field(60.0,   ge=0.0,  le=89.9)
    frequency_mhz:   float = Field(5.0,    ge=1.0,  le=15.0)
    c_sound:         float = Field(1540.0, ge=1450.0, le=1600.0)
    wall_filter_hz:  float = Field(50.0,   ge=0.0,  le=400.0)
    snr_db:          float = Field(30.0,   ge=0.0,  le=60.0)
    turbulence:      float = Field(0.1,    ge=0.0,  le=1.0)
    prf_hz:          float = Field(10000.0, ge=1000.0, le=50000.0)
    n_points:        int   = Field(256,    ge=64,   le=1024)
    heart_rate_bpm:  float = Field(72.0,   ge=40.0, le=140.0)
    sd_ratio:        float = Field(0.6,    ge=0.1,  le=0.9)
    diameter_mm:     float = Field(6.0,    ge=1.0,  le=25.0)
    waveform_shape:  str   = Field("carotid")
    stenocity:       str   = Field("normal")
    baseline_shift:  float = Field(0.0,    ge=-1.0, le=1.0)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/spectrum")
def get_spectrum(req: DopplerRequest):
    """
    Return the Doppler power spectrum for the given parameters.
    Used by the frequency-shift graph in the frontend.
    """
    params = DopplerParams(
        velocity_cm_s=req.velocity_cm_s,
        angle_deg=req.angle_deg,
        frequency_mhz=req.frequency_mhz,
        c_sound=req.c_sound,
        wall_filter_hz=req.wall_filter_hz,
        snr_db=req.snr_db,
        turbulence=req.turbulence,
        heart_rate_bpm=req.heart_rate_bpm,
        sd_ratio=req.sd_ratio,
        diameter_mm=req.diameter_mm,
        waveform_shape=req.waveform_shape,
        stenocity=req.stenocity,
        baseline_shift=req.baseline_shift
    )
    return generate_doppler_spectrum(params, n_points=req.n_points, prf_hz=req.prf_hz)


@router.post("/waterfall")
def get_waterfall(req: DopplerRequest):
    """
    Return a 2-D pulsatile waterfall matrix [64 frames × n_points].
    Used by the M-mode strip / waterfall display.
    """
    params = DopplerParams(
        velocity_cm_s=req.velocity_cm_s,
        angle_deg=req.angle_deg,
        frequency_mhz=req.frequency_mhz,
        c_sound=req.c_sound,
        wall_filter_hz=req.wall_filter_hz,
        snr_db=req.snr_db,
        turbulence=req.turbulence,
        heart_rate_bpm=req.heart_rate_bpm,
        sd_ratio=req.sd_ratio,
        diameter_mm=req.diameter_mm,
        waveform_shape=req.waveform_shape,
        stenocity=req.stenocity,
        baseline_shift=req.baseline_shift
    )
    return generate_waterfall(params, n_frames=64, n_points=req.n_points, prf_hz=req.prf_hz)


@router.get("/quick")
def quick_doppler(
    velocity: float = Query(60.0,  ge=1.0,  le=150.0, description="cm/s"),
    angle:    float = Query(60.0,  ge=0.0,  le=89.9,  description="degrees"),
    f0_mhz:   float = Query(5.0,   ge=1.0,  le=15.0,  description="MHz"),
    diameter: float = Query(6.0,   ge=1.0,  le=25.0,  description="mm")
):
    """
    Lightweight GET endpoint — returns only the key scalar Doppler values.
    Handy for real-time slider previews without sending a full JSON body.
    """
    params = DopplerParams(
        velocity_cm_s=velocity,
        angle_deg=angle,
        frequency_mhz=f0_mhz,
        diameter_mm=diameter
    )
    fd   = doppler_shift(params)
    sig  = spectral_broadening(params)
    vmax = nyquist_limit(params) * 100.0
    return {
        "peak_fd_hz":       round(fd, 2),
        "sigma_fd_hz":      round(sig, 2),
        "v_nyquist_cm_s":   round(vmax, 2),
        "aliased":          abs(fd) > 5000.0,
        "cos_theta":        round(float(__import__("math").cos(__import__("math").radians(angle))), 4),
    }
