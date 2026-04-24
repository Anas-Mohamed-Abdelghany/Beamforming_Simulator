"""
Radar-specific array-factor helpers.
Delegates AF and beam-width to the 5G module (same physics, different scale).
Adds radar-only additions: element delay calculation and grating-lobe check.
"""
import math
from typing import List

from backend.physics.fiveg.beam_steering import array_factor, beam_width_deg  # noqa: F401

C: float = 3e8  # speed of light


def compute_element_delays(
    num_elements: int,
    spacing_m: float,
    steering_deg: float,
    frequency: float,
) -> List[float]:
    """
    Return per-element time delay [seconds] for beam steering.

    τ_n = n · d · sin(θ₀) / c

    Parameters
    ----------
    num_elements : int
        Number of antenna elements.
    spacing_m : float
        Inter-element spacing in metres.
    steering_deg : float
        Steering angle in degrees.
    frequency : float
        Carrier frequency in Hz (unused in delay calc, kept for API consistency).

    Returns
    -------
    List[float]
        Per-element time delays in seconds.
    """
    steer_rad = math.radians(steering_deg)
    sin_steer = math.sin(steer_rad)
    return [n * spacing_m * sin_steer / C for n in range(num_elements)]


def grating_lobe_present(
    spacing_m: float,
    wavelength: float,
    steering_deg: float,
) -> bool:
    """
    Return True if d/λ > 1 / (1 + |sin θ₀|).

    Grating lobes appear when the element spacing exceeds this critical value
    relative to the wavelength and steering angle.

    Parameters
    ----------
    spacing_m : float
        Inter-element spacing in metres.
    wavelength : float
        Signal wavelength in metres.
    steering_deg : float
        Steering angle in degrees.

    Returns
    -------
    bool
        True if a grating lobe is present.
    """
    sin_steer = abs(math.sin(math.radians(steering_deg)))
    critical = 1.0 / (1.0 + sin_steer)
    return (spacing_m / wavelength) > critical


def side_lobe_level_db(num_elements: int) -> float:
    """
    Approximate first-side-lobe level in dB for a uniform rectangular window.

    For a rectangular (uniform) aperture the first side-lobe level is
    approximately −13.26 dB regardless of the number of elements.

    Parameters
    ----------
    num_elements : int
        Number of antenna elements (unused — SLL is constant for rectangular).

    Returns
    -------
    float
        Side-lobe level in dB (always −13.26).
    """
    return -13.26
