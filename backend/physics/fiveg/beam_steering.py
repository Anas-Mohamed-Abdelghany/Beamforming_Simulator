"""
Beam steering, array factor (with apodization weights), and interference-map
computation.  All heavy math stays server-side.
"""
import math
import numpy as np
from typing import List, Optional

C = 3e8  # speed of light (m/s)


# ── Steering angle ────────────────────────────────────────────────────────────

def compute_steering_angle(
    tower_x: float, tower_y: float,
    user_x: float, user_y: float,
) -> float:
    """Return angle from tower to user in *degrees* (standard math convention)."""
    return math.degrees(math.atan2(user_y - tower_y, user_x - tower_x))


# ── Per-element phase shifts ──────────────────────────────────────────────────

def compute_element_phases(
    elements: List[dict],
    steering_angle_deg: float,
    wavelength: float,
) -> List[float]:
    """
    Compute the required phase shift (radians) for each element to steer the
    main lobe toward *steering_angle_deg*.
    """
    k = 2 * math.pi / wavelength
    steer_rad = math.radians(steering_angle_deg)
    cos_s = math.cos(steer_rad)
    sin_s = math.sin(steer_rad)

    phases = []
    for el in elements:
        # progressive phase = -k * (x·cos θ + y·sin θ)
        phase = -k * (el["x"] * cos_s + el["y"] * sin_s)
        phases.append(phase)

    # normalise so first element has 0 phase
    if phases:
        base = phases[0]
        phases = [p - base for p in phases]

    return phases


# ── Array factor ──────────────────────────────────────────────────────────────

def array_factor(
    theta_deg: float,
    num_elements: int,
    spacing_m: float,
    wavelength: float,
    steering_angle_deg: float,
    weights: Optional[List[float]] = None,
) -> float:
    """
    Compute normalised array factor AF(θ) ∈ [0, 1] for a ULA with optional
    apodization *weights*.
    """
    if num_elements <= 1:
        return 1.0

    k = 2 * math.pi / wavelength
    theta_rad = math.radians(theta_deg)
    steer_rad = math.radians(steering_angle_deg)

    psi = k * spacing_m * (math.cos(theta_rad) - math.cos(steer_rad))

    if weights is None:
        # Uniform (rectangular) weighting — closed-form
        if abs(psi) < 1e-12:
            return 1.0
        af = math.sin(num_elements * psi / 2) / (num_elements * math.sin(psi / 2))
        return abs(af)
    else:
        # Weighted sum
        af_complex = 0.0 + 0.0j
        for n_idx in range(num_elements):
            af_complex += weights[n_idx] * np.exp(1j * n_idx * psi)
        af_abs = abs(af_complex)
        # normalise by sum of weights
        w_sum = sum(abs(w) for w in weights)
        return af_abs / w_sum if w_sum > 0 else 0.0


def compute_gain_profile(
    num_elements: int,
    spacing_m: float,
    wavelength: float,
    steering_angle_deg: float,
    weights: Optional[List[float]] = None,
    resolution_deg: int = 3,
) -> List[float]:
    """
    Compute normalised gain values for angles 0..359 at *resolution_deg* steps.
    Returns list of floats ∈ [0, 1].
    """
    profile = []
    for angle in range(0, 360, resolution_deg):
        af = array_factor(angle, num_elements, spacing_m, wavelength,
                          steering_angle_deg, weights)
        profile.append(af)
    return profile


# ── Beam width ────────────────────────────────────────────────────────────────

def beam_width_deg(num_elements: int, spacing_m: float, wavelength: float) -> float:
    """Half-Power Beamwidth (HPBW) in degrees for a broadside ULA."""
    if num_elements <= 1:
        return 360.0
    hpbw_rad = 0.886 * wavelength / (num_elements * spacing_m)
    return math.degrees(hpbw_rad)


# ── 2D Interference / constructive-destructive map ────────────────────────────

def compute_interference_map(
    towers_data: list,
    grid_w: int,
    grid_h: int,
    step: int = 15,
    snr: float = 100.0,
) -> List[List[float]]:
    """
    Compute a 2-D grid of summed beam intensity from all towers.
    Each tower entry: {x, y, frequency, steering_angles: [{angle, num_antennas,
    spacing, weights}]}
    Returns grid[y][x] with values in [0, 1] (normalised).
    SNR noise is applied so it reflects on the interference map output.
    """
    rows = list(range(0, grid_h, step))
    cols = list(range(0, grid_w, step))
    grid = np.zeros((len(rows), len(cols)), dtype=np.float64)

    for tower in towers_data:
        tx, ty = tower["x"], tower["y"]
        for beam in tower.get("beams", []):
            n_el = beam["num_antennas"]
            spacing = beam["spacing"]
            wl = beam["wavelength"]
            steer = beam["steering_angle"]
            weights = beam.get("weights")
            cov_r = tower.get("coverage_radius", 500)

            for ri, gy in enumerate(rows):
                for ci, gx in enumerate(cols):
                    dist = math.sqrt((gx - tx) ** 2 + (gy - ty) ** 2)
                    if dist > cov_r or dist < 1:
                        continue
                    obs_angle = math.degrees(math.atan2(gy - ty, gx - tx))
                    af = array_factor(obs_angle, n_el, spacing, wl, steer, weights)
                    # distance attenuation
                    attenuation = 1.0 / (1.0 + (dist / cov_r) ** 2)
                    grid[ri, ci] += af * attenuation

    # Apply SNR noise to the grid
    if snr < 1000:
        noise_std = 1.0 / (1.0 + snr * 0.05)
        noise = np.random.normal(0, noise_std, grid.shape)
        grid = grid + noise
        grid = np.clip(grid, 0, None)

    # normalise to [0, 1]
    mx = np.max(grid)
    if mx > 0:
        grid = grid / mx

    return grid.tolist()
