"""
physics/ultrasound/phantom_engine.py
======================================
Shepp-Logan style ultrasound phantom generator.

Each ellipse carries:
  - centre_x, centre_y  (normalised [0,1] in the phantom square)
  - semi_x, semi_y      (normalised radii)
  - angle_deg           (rotation angle in degrees)
  - acoustic_impedance  (MRayl; water ≈ 1.48, soft tissue ≈ 1.6–1.7)
  - attenuation         (dB / cm / MHz)
  - reflection_coefficient  (0 – 1, approximate)
  - label               (human-readable name)
  - is_vessel           (bool — designates the simulated blood vessel)

The label_map is a 2-D integer array where each pixel holds the index
(1-based) of the ellipse it belongs to, or 0 for background.
"""

import math
import numpy as np
from typing import Any

# ── Default ellipse table (Shepp-Logan style) ─────────────────────────────────
#   (cx, cy, rx, ry, angle°, Z_MRayl, att_dB_cm_MHz, RC, label, is_vessel)
#   cx/cy/rx/ry are all in normalised [0,1] phantom coordinates.

ELLIPSES_DEFAULT: list[dict[str, Any]] = [
    # 1. Outer skull
    {
        "centre_x": 0.50, "centre_y": 0.50,
        "semi_x":   0.345, "semi_y":  0.46,
        "angle_deg": 0.0,
        "acoustic_impedance":   .1,  # Bone
        "attenuation":           2.5,
        "reflection_coefficient": 0.35,
        "label": "Calcification",
        "is_vessel": False,
    },
    # 2. Inner brain tissue
    {
        "centre_x": 0.50, "centre_y": 0.5092,
        "semi_x":   0.3312, "semi_y": 0.437,
        "angle_deg": 0.0,
        "acoustic_impedance":    0.54, # Soft tissue
        "attenuation":           0.6,
        "reflection_coefficient": 0.015,
        "label": "Parenchyma",
        "is_vessel": False,
    },
    # 3. Right ventricle (left on image)
    {
        "centre_x": 0.61, "centre_y": 0.50,
        "semi_x":   0.055, "semi_y":  0.155,
        "angle_deg": -18.0,
        "acoustic_impedance":    1.48, # Fluid
        "attenuation":           0.0,
        "reflection_coefficient": 0.005,
        "label": "Cyst A",
        "is_vessel": False,
    },
    # 4. Left ventricle
    {
        "centre_x": 0.39, "centre_y": 0.50,
        "semi_x":   0.08, "semi_y":   0.205,
        "angle_deg": 18.0,
        "acoustic_impedance":    1.48, # Fluid
        "attenuation":           0.0,
        "reflection_coefficient": 0.005,
        "label": "Cyst B",
        "is_vessel": False,
    },
    # 5. Tumor 1
    {
        "centre_x": 0.50, "centre_y": 0.325,
        "semi_x":   0.105, "semi_y":  0.125,
        "angle_deg": 0.0,
        "acoustic_impedance":    1.62, # Dense tissue
        "attenuation":           0.8,
        "reflection_coefficient": 0.04,
        "label": "Nodule",
        "is_vessel": False,
    },
    # 6. Tumor 2
    {
        "centre_x": 0.50, "centre_y": 0.45,
        "semi_x":   0.023, "semi_y":  0.023,
        "angle_deg": 0.0,
        "acoustic_impedance":    1.62,
        "attenuation":           0.8,
        "reflection_coefficient": 0.04,
        "label": "Muscle",
        "is_vessel": False,
    },
    # 7. Tumor 3
    {
        "centre_x": 0.50, "centre_y": 0.55,
        "semi_x":   0.023, "semi_y":  0.023,
        "angle_deg": 0.0,
        "acoustic_impedance":    1.62,
        "attenuation":           0.8,
        "reflection_coefficient": 0.04,
        "label": "Fat",
        "is_vessel": False,
    },
    # 8. Detail 1 (Blood Vessel for Doppler)
    {
        "centre_x": 0.46, "centre_y": 0.8025,
        "semi_x":   0.023, "semi_y":  0.0115,
        "angle_deg": 0.0,
        "acoustic_impedance":    1.61, # Blood
        "attenuation":           0.1,
        "reflection_coefficient": 0.008,
        "label": "Blood Vessel",
        "is_vessel": True,
    },
    # 9. Detail 2
    {
        "centre_x": 0.50, "centre_y": 0.8025,
        "semi_x":   0.0115, "semi_y": 0.0115,
        "angle_deg": 0.0,
        "acoustic_impedance":    1.62,
        "attenuation":           0.8,
        "reflection_coefficient": 0.04,
        "label": "Deep Tissue",
        "is_vessel": False,
    },
    # 10. Detail 3
    {
        "centre_x": 0.53, "centre_y": 0.8025,
        "semi_x":   0.0115, "semi_y": 0.023,
        "angle_deg": 0.0,
        "acoustic_impedance":    1.62,
        "attenuation":           0.8,
        "reflection_coefficient": 0.04,
        "label": "Soft Tissue",
        "is_vessel": False,
    },
]


# ── Pixel-level rasteriser ────────────────────────────────────────────────────

def _point_in_ellipse(
    px: float, py: float,
    cx: float, cy: float,
    rx: float, ry: float,
    cos_a: float, sin_a: float,
) -> bool:
    """
    Test whether (px, py) lies inside a rotated ellipse.
    """
    dx = px - cx
    dy = py - cy
    # Rotate point into ellipse-local frame
    u =  dx * cos_a + dy * sin_a
    v = -dx * sin_a + dy * cos_a
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0


def _build_label_map(ellipses: list[dict], size: int) -> np.ndarray:
    """
    Render ellipses onto a size×size integer label map.
    Ellipses are drawn in order; later ones paint over earlier ones.
    index 0 = background, index 1..N = ellipse indices (1-based).
    """
    label_map = np.zeros((size, size), dtype=np.int32)

    # Pre-compute trig
    trig = []
    for e in ellipses:
        a = math.radians(e["angle_deg"])
        trig.append((math.cos(a), math.sin(a)))

    # Coordinate grids (normalised 0→1)
    xs = (np.arange(size) + 0.5) / size   # (size,)
    ys = (np.arange(size) + 0.5) / size   # (size,)

    for idx, (e, (cos_a, sin_a)) in enumerate(zip(ellipses, trig), start=1):
        cx, cy = e["centre_x"], e["centre_y"]
        rx, ry = e["semi_x"],   e["semi_y"]

        # Vectorised ellipse test
        dx = xs[np.newaxis, :] - cx   # (1, size)   → broadcast to (size, size)
        dy = ys[:, np.newaxis] - cy   # (size, 1)

        u =  dx * cos_a + dy * sin_a
        v = -dx * sin_a + dy * cos_a

        inside = (u / rx) ** 2 + (v / ry) ** 2 <= 1.0
        label_map[inside] = idx

    return label_map


# ── Public API ────────────────────────────────────────────────────────────────

def generate_phantom(
    ellipses: list[dict] | None = None,
    size: int = 512,
) -> dict[str, Any]:
    """
    Generate a Shepp-Logan style ultrasound phantom.

    Parameters
    ----------
    ellipses : list of ellipse dicts (uses ELLIPSES_DEFAULT if None).
    size     : pixel resolution of the label map (NxN).

    Returns
    -------
    dict with:
        "ellipses"  : list[dict]  — ellipse property table
        "label_map" : np.ndarray  — size×size integer label map
        "size"      : int
        "width_cm"  : float  — physical phantom width  (8 cm default)
        "depth_cm"  : float  — physical phantom height (8 cm default)
    """
    if ellipses is None:
        ellipses = [e.copy() for e in ELLIPSES_DEFAULT]

    label_map = _build_label_map(ellipses, size)

    return {
        "ellipses":  ellipses,
        "label_map": label_map,
        "size":      size,
        "width_cm":  8.0,   # medical scale: 8 cm field-of-view
        "depth_cm":  8.0,
    }
