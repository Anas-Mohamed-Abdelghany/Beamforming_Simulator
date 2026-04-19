"""
advanced_math.py
================
DAS (Delay-and-Sum) vs MVDR (Minimum Variance Distortionless Response)
beamforming comparison engine.

DAS  — conventional matched-filter beamformer; robust, wide main lobe.
MVDR — adaptive (Capon) beamformer; narrow lobe, deep nulls, but sensitive
        to steering-vector errors.

Outputs compared:
    • Beam pattern  B(θ) [dB] for both methods
    • Main-lobe width (−3 dB beamwidth)
    • Peak side-lobe level [dB]
    • Null depths at interference angles
    • Resolution / contrast figure-of-merit
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

# ── Parameter model ──────────────────────────────────────────────────────────

@dataclass
class AdvancedParams:
    """7 user-controllable advanced-beamforming parameters."""

    # Param 1 – Number of array elements
    n_elements: int = 16                  # 4–64

    # Param 2 – Element spacing (d / λ)
    d_over_lambda: float = 0.5            # 0.25–1.0

    # Param 3 – Steering angle  [degrees]
    steering_deg: float = 0.0            # −60 to +60

    # Param 4 – Noise power  σ² (linear, relative units)
    noise_power: float = 0.01            # 0.001–1.0

    # Param 5 – Number of interferers
    n_interferers: int = 2               # 0–5

    # Param 6 – Interferer power (relative to signal, linear)
    interferer_power: float = 10.0       # 1–1000

    # Param 7 – Diagonal loading factor (MVDR regularisation)
    diag_load: float = 1e-3             # 1e-5–0.1

    # Fixed interferer angles for reproducibility
    interferer_angles_deg: List[float] = None

    def __post_init__(self):
        if self.interferer_angles_deg is None:
            self.interferer_angles_deg = [-30.0, 20.0, 45.0, -15.0, 35.0][: self.n_interferers]


# ── Steering / array vectors ─────────────────────────────────────────────────

def steering_vector(n: int, d_lam: float, theta_deg: float) -> np.ndarray:
    """Return complex ULA steering vector (n × 1)."""
    theta = math.radians(theta_deg)
    idx   = np.arange(n)
    return np.exp(1j * 2 * np.pi * d_lam * idx * math.sin(theta))


# ── Covariance matrix ────────────────────────────────────────────────────────

def sample_covariance(params: AdvancedParams, n_snapshots: int = 256) -> np.ndarray:
    """
    Build the array covariance matrix R from:
        R = σ²I  +  Σ_k  P_k  a_k  a_k^H
    (theoretical / model-based — no actual snapshot data needed)
    """
    N  = params.n_elements
    R  = params.noise_power * np.eye(N, dtype=complex)

    angles = params.interferer_angles_deg[: params.n_interferers]
    for ang in angles:
        a = steering_vector(N, params.d_over_lambda, ang)
        R = R + params.interferer_power * np.outer(a, a.conj())

    return R


# ── DAS beamformer ────────────────────────────────────────────────────────────

def das_pattern(params: AdvancedParams, thetas_deg: np.ndarray) -> np.ndarray:
    """
    DAS (matched-filter) beam pattern.

        w_DAS = a(θ_s) / N

    Returns array of linear power values for each theta.
    """
    N  = params.n_elements
    a_s = steering_vector(N, params.d_over_lambda, params.steering_deg)
    w   = a_s / N                              # normalised DAS weights

    R   = sample_covariance(params)
    out = np.empty(len(thetas_deg))

    for i, ang in enumerate(thetas_deg):
        a = steering_vector(N, params.d_over_lambda, ang)
        # Power = |w^H a|² / (w^H R w)  — normalised
        num = abs(w.conj() @ a) ** 2
        den = (w.conj() @ R @ w).real
        out[i] = num / max(den, 1e-30)

    return out


# ── MVDR beamformer ───────────────────────────────────────────────────────────

def mvdr_pattern(params: AdvancedParams, thetas_deg: np.ndarray) -> np.ndarray:
    """
    MVDR (Capon) adaptive beam pattern.

        w_MVDR = R⁻¹ a(θ_s) / (a(θ_s)^H R⁻¹ a(θ_s))

    Diagonal loading for numerical stability:  R_loaded = R + δ I
    """
    N   = params.n_elements
    R   = sample_covariance(params)
    R_L = R + params.diag_load * np.eye(N, dtype=complex)

    try:
        R_inv = np.linalg.inv(R_L)
    except np.linalg.LinAlgError:
        R_inv = np.eye(N, dtype=complex)

    a_s = steering_vector(N, params.d_over_lambda, params.steering_deg)
    denom = (a_s.conj() @ R_inv @ a_s).real
    w = R_inv @ a_s / max(denom, 1e-30)

    out = np.empty(len(thetas_deg))
    for i, ang in enumerate(thetas_deg):
        a    = steering_vector(N, params.d_over_lambda, ang)
        num  = abs(w.conj() @ a) ** 2
        den  = (w.conj() @ R @ w).real
        out[i] = num / max(den, 1e-30)

    return out


# ── Pattern metrics ───────────────────────────────────────────────────────────

def _beamwidth_3db(thetas: np.ndarray, pattern_db: np.ndarray) -> float:
    """Estimate −3 dB half-power beamwidth [degrees]."""
    peak_db = pattern_db.max()
    mask    = pattern_db >= (peak_db - 3.0)
    indices = np.where(mask)[0]
    if len(indices) < 2:
        return 0.0
    return float(thetas[indices[-1]] - thetas[indices[0]])


def _peak_sidelobe(thetas: np.ndarray, pattern_db: np.ndarray, bw_deg: float, steer_deg: float) -> float:
    """Peak side-lobe level relative to main-lobe peak [dB]."""
    peak_db  = pattern_db.max()
    main_half = max(bw_deg / 2.0, 2.0)
    sl_mask  = np.abs(thetas - steer_deg) > main_half
    sl       = pattern_db[sl_mask]
    return float(sl.max() - peak_db) if len(sl) else -60.0


def pattern_metrics(thetas: np.ndarray, pattern_db: np.ndarray, steer_deg: float) -> dict:
    bw  = _beamwidth_3db(thetas, pattern_db)
    psl = _peak_sidelobe(thetas, pattern_db, bw, steer_deg)
    peak = float(pattern_db.max())
    return {"beamwidth_3db": round(bw, 2), "peak_sidelobe_db": round(psl, 2), "peak_db": round(peak, 2)}


# ── Full comparison payload ───────────────────────────────────────────────────

def compare_das_mvdr(params: AdvancedParams, n_points: int = 361) -> dict:
    """
    Main entry-point.  Returns a JSON-serialisable dict containing:
        - theta grid
        - DAS and MVDR dB patterns
        - metrics for each
        - interferer locations
    """
    thetas = np.linspace(-90, 90, n_points)

    das_lin  = das_pattern(params,  thetas)
    mvdr_lin = mvdr_pattern(params, thetas)

    # Normalise to 0 dB at steering direction
    eps = 1e-30
    das_db   = 10 * np.log10(np.maximum(das_lin,  eps))
    mvdr_db  = 10 * np.log10(np.maximum(mvdr_lin, eps))

    das_db  -= das_db.max()
    mvdr_db -= mvdr_db.max()

    das_metrics  = pattern_metrics(thetas, das_db,  params.steering_deg)
    mvdr_metrics = pattern_metrics(thetas, mvdr_db, params.steering_deg)

    # MVDR improvement metrics
    bw_ratio      = das_metrics["beamwidth_3db"] / max(mvdr_metrics["beamwidth_3db"], 0.01)
    psl_reduction = das_metrics["peak_sidelobe_db"] - mvdr_metrics["peak_sidelobe_db"]

    return {
        "thetas_deg":      thetas.tolist(),
        "das_db":          das_db.tolist(),
        "mvdr_db":         mvdr_db.tolist(),
        "das_metrics":     das_metrics,
        "mvdr_metrics":    mvdr_metrics,
        "bw_ratio":        round(bw_ratio, 2),
        "psl_reduction_db": round(psl_reduction, 2),
        "interferer_angles": params.interferer_angles_deg[: params.n_interferers],
        "steering_deg":    params.steering_deg,
        "n_elements":      params.n_elements,
        "noise_power":     params.noise_power,
    }
