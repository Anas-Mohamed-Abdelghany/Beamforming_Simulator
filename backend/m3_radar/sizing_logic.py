"""
m3_radar/sizing_logic.py — Lock-and-Size Detection Logic

Wide-beam detection vs Narrow-beam sizing.
When a target is initially detected during the wide sweep, the system can
"lock" onto it by narrowing the beam (increasing effective element count)
and re-scanning a small sector around the detection angle.

This module provides the sizing logic:
  1. Determine if a target qualifies for lock (consecutive detections).
  2. Compute the narrowed beam parameters for sizing mode.
  3. Estimate target angular extent (apparent size) from the narrow beam.
"""
import math
from typing import Dict, Any, List, Optional, Tuple

from backend.physics.fiveg.beam_steering import beam_width_deg
from backend.physics.radar.radar_equation import is_detected


C: float = 3e8


def compute_lock_beam_params(
    base_num_elements: int,
    spacing_m: float,
    wavelength: float,
    lock_factor: float = 3.0,
) -> Dict[str, float]:
    """
    Compute narrowed beam parameters for "sizing" mode.

    When the radar locks onto a detected target, it conceptually
    narrows the beam by using a higher effective element count
    (or equivalently, applying a tighter weighting).

    Parameters
    ----------
    base_num_elements : int
        Normal wide-scan element count.
    spacing_m : float
        Element spacing in metres.
    wavelength : float
        Signal wavelength in metres.
    lock_factor : float
        Factor by which the beam narrows (default 3x).

    Returns
    -------
    dict
        {
            "wide_beam_width": float,   # HPBW in wide mode [deg]
            "narrow_beam_width": float, # HPBW in lock/size mode [deg]
            "effective_elements": int,  # equivalent element count for sizing
        }
    """
    wide_bw = beam_width_deg(base_num_elements, spacing_m, wavelength)
    narrow_bw = wide_bw / lock_factor
    # Effective elements to achieve narrow_bw (inverse relation: BW ∝ 1/N)
    effective_n = int(base_num_elements * lock_factor)

    return {
        "wide_beam_width": round(wide_bw, 3),
        "narrow_beam_width": round(narrow_bw, 3),
        "effective_elements": effective_n,
    }


def evaluate_lock_candidates(
    targets: List[Dict[str, Any]],
    detection_history: Dict[str, int],
    consecutive_threshold: int = 2,
) -> List[str]:
    """
    Return IDs of targets that qualify for "lock" (have been detected
    at least `consecutive_threshold` times in recent sweeps).

    Parameters
    ----------
    targets : list of dict
        Current targets with "id" keys.
    detection_history : dict
        Mapping from target_id → consecutive detection count.
    consecutive_threshold : int
        Minimum consecutive detections to trigger lock.

    Returns
    -------
    list of str
        Target IDs that should enter lock/sizing mode.
    """
    return [
        t["id"]
        for t in targets
        if detection_history.get(t["id"], 0) >= consecutive_threshold
    ]


def estimate_target_size(
    target_angle_deg: float,
    sweep_angle_deg: float,
    narrow_beam_width_deg: float,
    gain_at_target: float,
) -> Dict[str, float]:
    """
    Estimate the apparent angular extent of a target using the narrow beam.

    Uses gain response to estimate if the target fills part of the narrow beam
    (large target) or is a point target (small target).

    Parameters
    ----------
    target_angle_deg : float
        Target's bearing angle in degrees.
    sweep_angle_deg : float
        Current beam steering angle in degrees.
    narrow_beam_width_deg : float
        HPBW of the narrowed beam in degrees.
    gain_at_target : float
        Normalised gain [0, 1] at the target's angle.

    Returns
    -------
    dict
        {
            "angular_offset_deg": float,
            "estimated_extent_deg": float,  # apparent angular size
            "size_category": str,           # "point" | "small" | "medium" | "large"
        }
    """
    offset = abs(target_angle_deg - sweep_angle_deg) % 360.0
    if offset > 180.0:
        offset = 360.0 - offset

    # Use gain response width to infer target extent
    # A point target shows a beam-width response; an extended target shows wider
    # Here we use a simplified model:
    if gain_at_target > 0.9:
        extent = narrow_beam_width_deg * 0.2  # point-like
        category = "point"
    elif gain_at_target > 0.7:
        extent = narrow_beam_width_deg * 0.5
        category = "small"
    elif gain_at_target > 0.4:
        extent = narrow_beam_width_deg * 1.0
        category = "medium"
    else:
        extent = narrow_beam_width_deg * 2.0
        category = "large"

    return {
        "angular_offset_deg": round(offset, 3),
        "estimated_extent_deg": round(extent, 3),
        "size_category": category,
    }


def sizing_scan_sector(
    target_angle_deg: float,
    narrow_beam_width_deg: float,
    margin_factor: float = 3.0,
) -> Tuple[float, float]:
    """
    Compute the sector bounds for a sizing scan centered on a locked target.

    Parameters
    ----------
    target_angle_deg : float
        Target bearing in degrees.
    narrow_beam_width_deg : float
        Narrow beam HPBW in degrees.
    margin_factor : float
        Multiplier for scan margin around target.

    Returns
    -------
    tuple[float, float]
        (sector_min_deg, sector_max_deg)
    """
    margin = narrow_beam_width_deg * margin_factor
    return (
        round(target_angle_deg - margin, 2),
        round(target_angle_deg + margin, 2),
    )
