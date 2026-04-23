"""
Radar range equation — received power and detection logic.
Distances are in metres; power in watts and dBm.
"""
import math
from typing import Tuple

C: float = 3e8  # speed of light


def received_power_w(
    tx_power_dbm: float,
    num_elements: int,
    rcs_m2: float,
    range_m: float,
    wavelength: float,
) -> float:
    """
    Radar range equation — received power in watts.

    P_r = (P_t · G² · λ² · σ) / ((4π)³ · R⁴)

    G = num_elements (linear approximation for phased array gain).
    Guards against R < 1 m to avoid division by zero.

    Parameters
    ----------
    tx_power_dbm : float
        Transmit power in dBm.
    num_elements : int
        Number of array elements (used as linear gain G).
    rcs_m2 : float
        Radar cross-section of the target in m².
    range_m : float
        Range to target in metres.
    wavelength : float
        Signal wavelength in metres.

    Returns
    -------
    float
        Received power in watts.
    """
    # Convert dBm to watts: P_t = 10^((dBm - 30) / 10)
    p_t = 10.0 ** ((tx_power_dbm - 30.0) / 10.0)

    # Clamp range to avoid division by zero
    r = max(range_m, 1.0)

    g = float(num_elements)
    numerator = p_t * (g ** 2) * (wavelength ** 2) * rcs_m2
    denominator = ((4.0 * math.pi) ** 3) * (r ** 4)

    return numerator / denominator


def power_to_dbm(power_w: float) -> float:
    """
    Convert watts to dBm.

    Clamps negative/zero power to -200 dBm.

    Parameters
    ----------
    power_w : float
        Power in watts.

    Returns
    -------
    float
        Power in dBm.
    """
    if power_w <= 0:
        return -200.0
    return 10.0 * math.log10(power_w) + 30.0


def threshold_dbm(threshold_norm: float) -> float:
    """
    Map normalised threshold [0, 1] to dBm.

    threshold_norm=0 → -130 dBm (very sensitive)
    threshold_norm=1 → -70 dBm  (insensitive)
    Linear interpolation.

    Parameters
    ----------
    threshold_norm : float
        Normalised detection threshold in [0, 1].

    Returns
    -------
    float
        Detection threshold in dBm.
    """
    return -130.0 + threshold_norm * 60.0


def is_detected(
    tx_power_dbm: float,
    num_elements: int,
    rcs_m2: float,
    range_m: float,
    wavelength: float,
    threshold_norm: float,
) -> Tuple[bool, float]:
    """
    Determine whether a target is detected based on the radar range equation.

    Parameters
    ----------
    tx_power_dbm : float
        Transmit power in dBm.
    num_elements : int
        Number of array elements.
    rcs_m2 : float
        Radar cross-section in m².
    range_m : float
        Range to target in metres.
    wavelength : float
        Signal wavelength in metres.
    threshold_norm : float
        Normalised detection threshold [0, 1].

    Returns
    -------
    tuple[bool, float]
        (detected, received_dbm) — whether detected and the received power in dBm.
    """
    p_r = received_power_w(tx_power_dbm, num_elements, rcs_m2, range_m, wavelength)
    rx_dbm = power_to_dbm(p_r)
    thresh = threshold_dbm(threshold_norm)
    detected = rx_dbm >= thresh
    return (detected, rx_dbm)
