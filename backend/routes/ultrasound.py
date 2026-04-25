"""
routes/ultrasound.py
=====================
FastAPI router for the Ultrasound Imaging module.
Mount at:  /api/ultrasound

Endpoints
---------
GET  /phantom                   → phantom ellipses + label_map
POST /amode                     → A-mode depth/amplitude arrays
POST /bmode                     → B-mode image matrix
POST /doppler                   → Doppler shift (Hz)
PATCH /phantom/ellipse/{idx}    → edit one ellipse property in-session
"""

from fastapi import APIRouter, HTTPException
from typing import Any

from backend.models.ultrasound import (
    BeamParamsModel,
    ProbeRequest,
    BModeRequest,
    DopplerRequest,
    EditEllipseRequest,
)
from backend.physics.ultrasound.phantom_engine import generate_phantom, ELLIPSES_DEFAULT
from backend.physics.ultrasound.imaging import get_a_mode, get_b_mode, get_doppler_shift
from backend.physics.ultrasound.waves import BeamParams

router = APIRouter()

# ── In-memory phantom session ─────────────────────────────────────────────────
# A single shared phantom instance that clients can edit via PATCH.
# Reset on server restart (stateless enough for a simulator).

_session_ellipses: list[dict[str, Any]] = [e.copy() for e in ELLIPSES_DEFAULT]
_session_phantom:  dict[str, Any] = generate_phantom(_session_ellipses)


def _rebuild_phantom():
    """Rasterise the label map after an ellipse edit."""
    global _session_phantom
    _session_phantom = generate_phantom(_session_ellipses)


def _beam_params(bp: BeamParamsModel) -> BeamParams:
    return BeamParams(
        frequency_mhz=bp.frequency_mhz,
        n_elements=bp.n_elements,
        spacing_mm=bp.spacing_mm,
        curvature_mm=bp.curvature_mm,
        focal_depth_mm=bp.focal_depth_mm,
        snr=bp.snr,
        apodization=bp.apodization,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/phantom")
def get_phantom():
    """
    Return the current phantom definition.
    The label_map is a flattened list to reduce JSON payload.
    """
    import numpy as np
    lm = np.array(_session_phantom["label_map"], dtype=np.int32)
    return {
        "ellipses":       _session_phantom["ellipses"],
        "label_map":      lm.tolist(),
        "size":           _session_phantom["size"],
        "width_cm":       _session_phantom["width_cm"],
        "depth_cm":       _session_phantom["depth_cm"],
    }


@router.post("/amode")
def post_amode(req: ProbeRequest):
    """
    Calculate a single A-mode scan line at the given probe position/angle.
    Returns arrays of depths (cm) and amplitudes.
    """
    bp = _beam_params(req.beam_params)
    result = get_a_mode(
        probe_x_cm=req.probe_x_cm,
        probe_y_cm=req.probe_y_cm,
        angle_deg=req.angle_deg,
        phantom=_session_phantom,
        beam_params=bp,
    )
    return result


@router.post("/bmode")
def post_bmode(req: BModeRequest):
    """
    Generate a B-mode image by sweeping n_lines A-mode pulses.
    Returns a 2-D image matrix (depth × lines) normalised to [0, 1].
    """
    bp = _beam_params(req.beam_params)
    result = get_b_mode(
        probe_x_cm=req.probe_x_cm,
        probe_y_cm=req.probe_y_cm,
        aperture_cm=req.aperture_cm,
        n_lines=req.n_lines,
        phantom=_session_phantom,
        beam_params=bp,
    )
    return result


@router.post("/doppler")
def post_doppler(req: DopplerRequest):
    """
    Calculate the Doppler frequency shift for the simulated blood vessel.
    Uses the standard fd = 2 f0 v cos(θ) / c formula.
    """
    result = get_doppler_shift(
        phantom=_session_phantom,
        vessel_velocity_cm_s=req.velocity_cm_s,
        vessel_angle_deg=req.vessel_angle_deg,
        frequency_mhz=req.frequency_mhz,
    )
    return result


@router.patch("/phantom/ellipse/{idx}")
def patch_ellipse(idx: int, req: EditEllipseRequest):
    """
    Update acoustic properties of ellipse at index idx (0-based).
    Triggers a label-map rebuild.
    """
    if idx < 0 or idx >= len(_session_ellipses):
        raise HTTPException(status_code=404, detail=f"Ellipse index {idx} out of range.")

    e = _session_ellipses[idx]
    if req.acoustic_impedance is not None:
        e["acoustic_impedance"] = req.acoustic_impedance
    if req.attenuation is not None:
        e["attenuation"] = req.attenuation
    if req.reflection_coefficient is not None:
        e["reflection_coefficient"] = req.reflection_coefficient
    if req.label is not None:
        e["label"] = req.label
    if req.is_vessel is not None:
        e["is_vessel"] = req.is_vessel

    _rebuild_phantom()
    return {"status": "updated", "ellipse": e}


@router.post("/phantom/reset")
def reset_phantom():
    """Reset the phantom to the default Shepp-Logan configuration."""
    global _session_ellipses, _session_phantom
    _session_ellipses = [e.copy() for e in ELLIPSES_DEFAULT]
    _session_phantom  = generate_phantom(_session_ellipses)
    return {"status": "reset"}
