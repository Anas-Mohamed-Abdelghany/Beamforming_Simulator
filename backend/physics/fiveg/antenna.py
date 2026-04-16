"""
Antenna geometry builder and apodization / windowing for side-lobe control.
All physics math lives here — NO trig in the frontend.
"""
import math
import numpy as np
from typing import List, Dict

# ── Geometry ──────────────────────────────────────────────────────────────────

def build_ula(
    num_elements: int,
    spacing_m: float,
    center_x: float,
    center_y: float,
    orientation_deg: float = 0.0,
) -> List[Dict[str, float]]:
    """
    Build a Uniform Linear Array (ULA) centred at (center_x, center_y).
    The array is rotated by *orientation_deg* (0 → horizontal).
    Returns [{"x": float, "y": float}, ...].
    """
    if num_elements <= 0:
        return []

    elements = []
    total_length = (num_elements - 1) * spacing_m
    ori_rad = math.radians(orientation_deg)
    cos_o = math.cos(ori_rad)
    sin_o = math.sin(ori_rad)

    for i in range(num_elements):
        offset = -total_length / 2 + i * spacing_m
        x = center_x + offset * cos_o
        y = center_y + offset * sin_o
        elements.append({"x": x, "y": y})

    return elements


# ── Apodization / Windowing ───────────────────────────────────────────────────

WINDOW_TYPES = [
    "rectangular",
    "hamming",
    "hanning",
    "blackman",
    "kaiser",
    "chebyshev",
    "taylor",
]


def apply_window(num_elements: int, window_type: str = "rectangular") -> List[float]:
    """
    Return amplitude weights for *num_elements* using the selected window.
    All windows are normalised so max == 1.
    """
    wt = window_type.lower().strip()
    n = num_elements

    if n <= 1:
        return [1.0]

    if wt == "hamming":
        w = np.hamming(n)
    elif wt == "hanning":
        w = np.hanning(n)
    elif wt == "blackman":
        w = np.blackman(n)
    elif wt == "kaiser":
        w = np.kaiser(n, beta=6.0)
    elif wt == "chebyshev":
        # Dolph-Chebyshev with 60 dB side-lobe attenuation
        w = _chebyshev_window(n, at_db=60)
    elif wt == "taylor":
        w = _taylor_window(n, nbar=4, sll_db=-30)
    else:  # rectangular
        w = np.ones(n)

    # Normalise
    mx = np.max(np.abs(w))
    if mx > 0:
        w = w / mx

    return w.tolist()


# ── Helper windows ────────────────────────────────────────────────────────────

def _chebyshev_window(n: int, at_db: float = 60) -> np.ndarray:
    """Dolph-Chebyshev window using numpy's chebwin when available, else fallback."""
    try:
        from numpy.lib import stride_tricks  # noqa – just checking numpy version
        # numpy >= 1.20 has np.kaiser but not chebwin; use scipy-free formula
    except Exception:
        pass
    # Manual Dolph-Chebyshev via cosine series
    r = 10 ** (at_db / 20.0)
    order = n - 1
    x0 = np.cosh(np.arccosh(r) / order)
    k = np.arange(n)
    w = np.zeros(n)
    for i in range(n):
        total = 0.0
        for m in range(1, order + 1):
            val = np.cos(2 * np.pi * m * (i - order / 2) / n)
            total += _cheb_poly(order, x0 * np.cos(np.pi * m / n)) * val
        w[i] = total
    w = np.abs(w)
    return w


def _cheb_poly(order: int, x: float) -> float:
    """Evaluate Chebyshev polynomial of first kind of given order at x."""
    if abs(x) <= 1:
        return float(np.cos(order * np.arccos(x)))
    else:
        return float(np.cosh(order * np.arccosh(abs(x))))


def _taylor_window(n: int, nbar: int = 4, sll_db: float = -30) -> np.ndarray:
    """One-parameter Taylor window approximation."""
    a = np.arccosh(10 ** (-sll_db / 20)) / np.pi
    w = np.zeros(n)
    for i in range(n):
        xi = 2.0 * i / (n - 1) - 1.0  # normalised position [-1, 1]
        val = 1.0
        for m in range(1, nbar):
            num = 1.0
            den = 1.0
            for p in range(1, nbar):
                num *= 1 - (m / (a * np.sqrt((nbar - 0.5) ** 2 + p ** 2))) ** 2 if p != m else 1
                den *= 1 - (m / p) ** 2 if p != m else 1
            coeff = ((-1) ** (m + 1)) * (num / den) if den != 0 else 0
            val += 2 * coeff * np.cos(2 * np.pi * m * xi / 2)
        w[i] = val
    w = np.abs(w)
    return w
