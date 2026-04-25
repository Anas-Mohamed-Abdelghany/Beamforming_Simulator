"""
physics/ultrasound/array_geometry.py
=====================================
Transducer array element positions and steering delay calculations.
All spatial units: mm.  Time units: seconds.
Speed of sound: 1540 m/s (default soft-tissue value).
"""

import math
import numpy as np

C_SOUND_M_S = 1540.0          # m/s — soft tissue
C_SOUND_MM_S = C_SOUND_M_S * 1_000.0  # mm/s


# ── Element positions ─────────────────────────────────────────────────────────

def get_element_positions(
    n_elements: int,
    spacing_mm: float,
    curvature_mm: float = 0.0,
) -> np.ndarray:
    """
    Return (n_elements, 2) array of (x, z) element centres in mm.

    Parameters
    ----------
    n_elements  : number of transducer elements
    spacing_mm  : centre-to-centre pitch in mm
    curvature_mm: radius of curvature (0 => flat linear array).
                  Positive = convex outward (probe surface curves away from tissue).

    Returns
    -------
    positions : shape (n_elements, 2), columns = [x_mm, z_mm]
                x is the lateral axis, z is the axial (depth) axis.
                For a flat array all z values are 0.
    """
    n = int(n_elements)
    indices = np.arange(n) - (n - 1) / 2.0       # centre at 0

    if curvature_mm <= 0.0:
        # Flat linear array
        x = indices * spacing_mm
        z = np.zeros(n)
    else:
        # Curved (convex) array — arc of given radius
        R = float(curvature_mm)
        total_arc = spacing_mm * (n - 1)          # total arc length in mm
        half_angle = total_arc / (2.0 * R)        # half subtended angle (rad)
        angles = np.linspace(-half_angle, half_angle, n)
        x = R * np.sin(angles)
        z = R * (1.0 - np.cos(angles))            # bow of the arc, z ≥ 0

    return np.column_stack([x, z])


# ── Steering delays ───────────────────────────────────────────────────────────

def steering_delays(
    positions: np.ndarray,
    focal_depth_mm: float,
    angle_deg: float = 0.0,
    c_mm_s: float = C_SOUND_MM_S,
) -> np.ndarray:
    """
    Calculate transmit time-delay (seconds) for each element so that the beam
    focuses at (focal_x_mm, focal_depth_mm) in the image plane.

    Parameters
    ----------
    positions     : (n_elements, 2) element positions from get_element_positions().
    focal_depth_mm: axial depth of the focal point in mm.
    angle_deg     : steering angle in degrees (0 = straight ahead).
    c_mm_s        : speed of sound in mm/s.

    Returns
    -------
    delays : (n_elements,) array of transmit delays in seconds.
             Apply as phase shifts: exp(-j * 2π * f0 * delay).
    """
    focal_x_mm = focal_depth_mm * math.tan(math.radians(angle_deg))
    focal_point = np.array([focal_x_mm, focal_depth_mm])   # (x, z)

    # Distance from each element to the focal point
    diff = focal_point[np.newaxis, :] - positions           # (n, 2)
    distances = np.sqrt((diff ** 2).sum(axis=1))            # (n,)

    # Reference = smallest distance; positive delay = element fired later
    t = distances / c_mm_s
    delays = t.max() - t                                     # (n,)
    return delays


# ── Apodization windows ───────────────────────────────────────────────────────

APODIZATION_WINDOWS = {
    "none":      lambda n: np.ones(n),
    "hanning":   np.hanning,
    "hamming":   np.hamming,
    "blackman":  np.blackman,
}


def get_apodization(n_elements: int, window_name: str = "hanning") -> np.ndarray:
    """
    Return amplitude weights (n_elements,) for the chosen apodisation window.
    Normalised so that max weight = 1.
    """
    name = window_name.lower()
    fn = APODIZATION_WINDOWS.get(name, APODIZATION_WINDOWS["hanning"])
    w = fn(int(n_elements)).astype(float)
    if w.max() > 0:
        w /= w.max()
    return w
