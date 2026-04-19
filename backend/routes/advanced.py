"""
routes/advanced.py
==================
FastAPI router — DAS vs MVDR advanced beamforming comparison.
Mount at:  /api/advanced
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional

from backend.physics.advanced.advanced_math import AdvancedParams, compare_das_mvdr

router = APIRouter()


# ── Request model ─────────────────────────────────────────────────────────────

class AdvancedRequest(BaseModel):
    n_elements:          int   = Field(16,    ge=4,    le=64)
    d_over_lambda:       float = Field(0.5,   ge=0.25, le=1.0)
    steering_deg:        float = Field(0.0,   ge=-60.0, le=60.0)
    noise_power:         float = Field(0.01,  ge=1e-4, le=1.0)
    n_interferers:       int   = Field(2,     ge=0,    le=5)
    interferer_power:    float = Field(10.0,  ge=1.0,  le=1000.0)
    diag_load:           float = Field(1e-3,  ge=1e-6, le=0.5)
    interferer_angles:   Optional[List[float]] = None
    n_points:            int   = Field(361,   ge=91,   le=721)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/compare")
def compare(req: AdvancedRequest):
    """
    Full DAS vs MVDR beam-pattern comparison.

    Returns:
        - theta grid  [−90 … +90 degrees]
        - DAS dB pattern
        - MVDR dB pattern
        - Per-method metrics (−3 dB beamwidth, peak SLL)
        - MVDR improvement ratios
    """
    params = AdvancedParams(
        n_elements=req.n_elements,
        d_over_lambda=req.d_over_lambda,
        steering_deg=req.steering_deg,
        noise_power=req.noise_power,
        n_interferers=req.n_interferers,
        interferer_power=req.interferer_power,
        diag_load=req.diag_load,
        interferer_angles_deg=req.interferer_angles,
    )
    return compare_das_mvdr(params, n_points=req.n_points)


@router.get("/defaults")
def get_defaults():
    """Return the default parameter set for the frontend sliders."""
    p = AdvancedParams()
    return {
        "n_elements":       p.n_elements,
        "d_over_lambda":    p.d_over_lambda,
        "steering_deg":     p.steering_deg,
        "noise_power":      p.noise_power,
        "n_interferers":    p.n_interferers,
        "interferer_power": p.interferer_power,
        "diag_load":        p.diag_load,
    }
