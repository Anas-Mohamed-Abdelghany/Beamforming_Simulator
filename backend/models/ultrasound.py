"""
models/ultrasound.py
=====================
Pydantic v2 request / response models for the Ultrasound module.
"""

from pydantic import BaseModel, Field
from typing import Any


# ── Beamforming parameters ────────────────────────────────────────────────────

class BeamParamsModel(BaseModel):
    """7 beamforming parameters exposed to the frontend."""
    frequency_mhz:  float = Field(5.0,    ge=1.0,   le=15.0,  description="Centre frequency (MHz)")
    n_elements:     int   = Field(64,     ge=16,    le=256,   description="Number of transducer elements")
    spacing_mm:     float = Field(0.4,    ge=0.1,   le=1.5,   description="Element pitch (mm)")
    curvature_mm:   float = Field(0.0,    ge=0.0,   le=200.0, description="Array curvature radius (mm); 0=flat")
    focal_depth_mm: float = Field(40.0,   ge=5.0,   le=150.0, description="Focal depth (mm)")
    snr:            float = Field(800.0,  ge=0.0,   le=1000.0,description="SNR linear scale [0–1000]")
    apodization:    str   = Field("hanning", description="Apodization window (none|hanning|hamming|blackman)")


# ── Probe / scan requests ─────────────────────────────────────────────────────

class ProbeRequest(BaseModel):
    """Sent by the frontend whenever the probe position or parameters change."""
    probe_x_cm:  float = Field(4.0, ge=0.0, le=8.0, description="Probe lateral position (cm)")
    probe_y_cm:  float = Field(0.0, ge=0.0, le=8.0, description="Probe depth offset (cm); 0=top")
    angle_deg:   float = Field(0.0, ge=-30.0, le=30.0, description="Steering angle (degrees)")
    beam_params: BeamParamsModel = Field(default_factory=BeamParamsModel)


class BModeRequest(ProbeRequest):
    """Extended request for B-mode scan."""
    aperture_cm: float = Field(4.0, ge=0.5, le=8.0, description="Scan aperture (cm)")
    n_lines:     int   = Field(64,  ge=16,  le=256,  description="Number of scan lines")


# ── Doppler request ───────────────────────────────────────────────────────────

class DopplerRequest(BaseModel):
    velocity_cm_s:  float = Field(60.0, ge=1.0,  le=200.0, description="Blood velocity (cm/s)")
    vessel_angle_deg: float = Field(60.0, ge=0.0, le=89.9,  description="Beam-vessel angle (degrees)")
    frequency_mhz:  float = Field(5.0,  ge=1.0,  le=15.0,  description="Transmit frequency (MHz)")


# ── Ellipse editor request ────────────────────────────────────────────────────

class EditEllipseRequest(BaseModel):
    """Patch a single ellipse in the live phantom session."""
    acoustic_impedance:    float | None = Field(None, ge=0.1, le=10.0)
    attenuation:           float | None = Field(None, ge=0.0, le=10.0)
    reflection_coefficient: float | None = Field(None, ge=0.0, le=1.0)
    label:                 str   | None = None
    is_vessel:             bool  | None = None
