"""
Target detection and beam-pattern computation.

Builds the full 360° gain profile for the current steering angle and evaluates
which targets are currently illuminated and detected by the beam.
"""
import math
from typing import Any, List, Dict

from backend.physics.fiveg.beam_steering import array_factor, beam_width_deg
from backend.physics.fiveg.antenna import apply_window
from backend.physics.fiveg.signal_model import apply_snr_to_profile
from backend.physics.radar.radar_equation import is_detected
from backend.physics.radar.array_factor import (
    grating_lobe_present,
    side_lobe_level_db,
    compute_element_delays,
)

C: float = 3e8


def build_gain_profile(
    num_elements: int,
    spacing_m: float,
    wavelength: float,
    steering_deg: float,
    window_type: str = "rectangular",
    snr: float = 100.0,
    resolution_deg: int = 2,
) -> List[Dict[str, float]]:
    """
    Compute the full 360° gain profile for the current steering angle.

    Steps:
    1. Get apodization weights via apply_window().
    2. For each angle in range(-180, 180, resolution_deg):
       compute AF via array_factor(theta, N, d, λ, steering, weights).
    3. Apply SNR noise via apply_snr_to_profile().
    4. Return list of {"angle": float, "gain": float} sorted by angle.

    Parameters
    ----------
    num_elements : int
        Number of antenna elements.
    spacing_m : float
        Inter-element spacing in metres.
    wavelength : float
        Signal wavelength in metres.
    steering_deg : float
        Current steering angle in degrees.
    window_type : str
        Apodization window type.
    snr : float
        SNR value (0–1000) for noise injection.
    resolution_deg : int
        Angular resolution in degrees.

    Returns
    -------
    List[dict]
        List of {"angle": float, "gain": float} sorted by angle.
    """
    weights = apply_window(num_elements, window_type)

    angles = list(range(-180, 180, resolution_deg))
    raw_gains: List[float] = []

    for angle in angles:
        af = array_factor(
            angle, num_elements, spacing_m, wavelength, steering_deg, weights
        )
        raw_gains.append(af)

    # Apply SNR noise
    noisy_gains = apply_snr_to_profile(raw_gains, snr)

    return [{"angle": float(a), "gain": g} for a, g in zip(angles, noisy_gains)]


def _angle_diff(a: float, b: float) -> float:
    """
    Compute the minimal angular difference in degrees, accounting for wrap-around.

    Parameters
    ----------
    a : float
        First angle in degrees.
    b : float
        Second angle in degrees.

    Returns
    -------
    float
        Absolute angular difference in degrees (0–180).
    """
    diff = (a - b) % 360.0
    if diff > 180.0:
        diff = 360.0 - diff
    return diff


def check_targets(
    targets: List[Dict[str, Any]],
    sweep_angle_deg: float,
    beam_width_deg_val: float,
    mode: str,
    array_config: Dict[str, Any],
    threshold_norm: float,
    tx_power_dbm: float = 43.0,
    wavelength: float = 0.03,
) -> List[Dict[str, Any]]:
    """
    Evaluate which targets are currently in the beam AND detected.

    Parameters
    ----------
    targets : list of dict
        Each dict: {"id": str, "x": float, "y": float, "rcs": float}.
        Target positions in metres relative to radar origin (0, 0).
    sweep_angle_deg : float
        Current beam steering angle in degrees.
    beam_width_deg_val : float
        Current beam HPBW in degrees.
    mode : str
        "phased_array" or "rotating_line". In "rotating_line" mode,
        use a wider beam width: max(beam_width_deg_val * 3, 30).
    array_config : dict
        {"num_elements": int, "spacing_m": float}
    threshold_norm : float
        Detection threshold [0, 1].
    tx_power_dbm : float
        Transmit power in dBm (default 43 dBm ≈ 20 W peak).
    wavelength : float
        Signal wavelength in metres.

    Returns
    -------
    list of dict
        Detection events: [{"target_id", "x", "y", "angle_deg",
        "range_m", "received_dbm", "confidence"}]
    """
    # Determine effective beam width
    if mode == "rotating_line":
        effective_bw = max(beam_width_deg_val * 3.0, 30.0)
    else:
        effective_bw = beam_width_deg_val

    num_elements = array_config.get("num_elements", 32)
    detections: List[Dict[str, Any]] = []

    for target in targets:
        tx = target.get("x", 0.0)
        ty = target.get("y", 0.0)
        rcs = target.get("rcs", 1.0)
        target_id = target.get("id", "unknown")

        # 1. Compute target angle and range
        # Use atan2(x, y) to match PPI convention: 0° = North (up), CW positive
        target_angle = math.degrees(math.atan2(tx, ty))
        target_range = math.sqrt(tx ** 2 + ty ** 2)

        if target_range < 1.0:
            continue  # too close to origin

        # 2. Check angular illumination (with ±180° wrap)
        angular_diff = _angle_diff(target_angle, sweep_angle_deg)
        if angular_diff > effective_bw / 2.0:
            continue  # not illuminated

        # 3. Check detection via radar range equation
        detected, rx_dbm = is_detected(
            tx_power_dbm, num_elements, rcs, target_range, wavelength, threshold_norm
        )

        if not detected:
            continue

        # 4. Compute confidence: how far above threshold (clamped 0–1)
        from backend.physics.radar.radar_equation import threshold_dbm as thresh_fn

        thresh_val = thresh_fn(threshold_norm)
        if rx_dbm >= thresh_val:
            # confidence based on margin above threshold
            margin = rx_dbm - thresh_val
            confidence = min(1.0, margin / 30.0)  # 30 dB above = full confidence
        else:
            confidence = 0.0

        detections.append({
            "target_id": target_id,
            "x": tx,
            "y": ty,
            "angle_deg": round(target_angle, 2),
            "range_m": round(target_range, 2),
            "received_dbm": round(rx_dbm, 2),
            "confidence": round(confidence, 3),
        })

    return detections
