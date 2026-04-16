"""
Connection management — tower assignment, handoff, antenna distribution,
and automatic tower-parameter adjustment.
"""
import math
from typing import Dict, List, Optional

from backend.physics.fiveg.signal_model import signal_strength_dbm, snr_to_noise_floor, compute_snr_db


# ── Utilities ─────────────────────────────────────────────────────────────────

def get_distance(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


# ── Tower assignment ──────────────────────────────────────────────────────────

def assign_towers(users: list, towers: list) -> Dict[str, Optional[str]]:
    """
    For each user, find the best tower (strongest signal within coverage).
    Returns {user_id: tower_id | None}.
    """
    assignments: Dict[str, Optional[str]] = {}
    for u in users:
        best_tower_id = None
        best_sig = -999.0
        for t in towers:
            dist = get_distance(u["x"], u["y"], t["x"], t["y"])
            if dist > t["coverage_radius"]:
                continue
            sig = signal_strength_dbm(
                t["x"], t["y"], u["x"], u["y"],
                t["tx_power"], t["frequency"],
                t["num_antennas"],
            )
            if sig > best_sig:
                best_sig = sig
                best_tower_id = t["id"]
        assignments[u["id"]] = best_tower_id
    return assignments


# ── Handoff with hysteresis ───────────────────────────────────────────────────

def check_handoff(
    user: dict,
    towers: list,
    hysteresis: float = 0.05,
) -> Optional[str]:
    """
    Return the tower_id the user should be connected to.
    Switch only if new tower signal > current * (1 + hysteresis) in linear scale.
    """
    current_id = user.get("connected_tower_id")
    current_tower = next((t for t in towers if t["id"] == current_id), None)

    def _sig(t):
        return signal_strength_dbm(
            t["x"], t["y"], user["x"], user["y"],
            t["tx_power"], t["frequency"], t["num_antennas"],
        )

    def _dbm_to_mw(dbm):
        return 10 ** (dbm / 10.0)

    best_id = None
    best_mw = -1.0

    for t in towers:
        dist = get_distance(user["x"], user["y"], t["x"], t["y"])
        if dist > t["coverage_radius"]:
            continue
        sig_mw = _dbm_to_mw(_sig(t))
        if sig_mw > best_mw:
            best_mw = sig_mw
            best_id = t["id"]

    if best_id is None:
        return None  # no tower in range

    if current_tower is None:
        return best_id  # fresh assignment

    # Still inside current tower?
    cur_dist = get_distance(user["x"], user["y"], current_tower["x"], current_tower["y"])
    if cur_dist > current_tower["coverage_radius"]:
        return best_id  # forced disconnect

    # Hysteresis check
    cur_mw = _dbm_to_mw(_sig(current_tower))
    if best_mw > cur_mw * (1 + hysteresis) and best_id != current_id:
        return best_id

    return current_id  # stay on current


# ── Antenna distribution ─────────────────────────────────────────────────────

def distribute_antennas(tower: dict, connected_users: list) -> Dict[str, int]:
    """
    Divide tower antennas among connected users.
    floor(N/K) each; remainder goes to weakest-signal user.
    """
    K = len(connected_users)
    if K == 0:
        return {}

    N = tower["num_antennas"]
    base = N // K
    remainder = N % K

    # sort by distance descending (weakest first)
    sorted_users = sorted(
        connected_users,
        key=lambda u: get_distance(u["x"], u["y"], tower["x"], tower["y"]),
        reverse=True,
    )

    result = {}
    for i, u in enumerate(sorted_users):
        result[u["id"]] = base + (1 if i < remainder else 0)
    return result


# ── Auto-adjust tower parameters ─────────────────────────────────────────────

def auto_adjust_tower_params(tower: dict, connected_users: list) -> dict:
    """
    Automatically adjust tower Tx power and frequency to maintain good coverage
    for connected users.  Returns a dict of adjustments made:
      {tx_power: new, frequency: new, reason: str}

    Rules:
    • If farthest user is > 70% of coverage radius → boost tx_power (up to 50 dBm)
    • If farthest user is < 30% of coverage radius → reduce tx_power (down to 10 dBm)
    • If multiple users exist and are spread widely → increase frequency for
      narrower beams (up to 60 GHz)
    • If single user → allow lower frequency for wider coverage (min 1 GHz)
    """
    if not connected_users:
        return {
            "tx_power": tower["tx_power"],
            "frequency": tower["frequency"],
            "reason": "no users",
        }

    distances = [
        get_distance(u["x"], u["y"], tower["x"], tower["y"])
        for u in connected_users
    ]
    max_dist = max(distances)
    ratio = max_dist / max(tower["coverage_radius"], 1.0)

    new_tx = tower["tx_power"]
    new_freq = tower["frequency"]
    reasons = []

    # ── Tx power adjustment ───────────────────────────────────────────────
    if ratio > 0.70:
        # User is far — boost power
        boost = min(5.0, 50.0 - new_tx)
        new_tx = min(new_tx + boost, 50.0)
        if boost > 0:
            reasons.append(f"power ↑ {new_tx:.0f} dBm (user far)")
    elif ratio < 0.30:
        # User is close — save power
        drop = min(3.0, new_tx - 10.0)
        new_tx = max(new_tx - drop, 10.0)
        if drop > 0:
            reasons.append(f"power ↓ {new_tx:.0f} dBm (user close)")

    # ── Frequency adjustment ──────────────────────────────────────────────
    if len(connected_users) >= 2:
        # Multiple users → prefer higher freq for narrower beams
        target = min(new_freq + 1e9, 60e9)
        if target != new_freq:
            new_freq = target
            reasons.append(f"freq ↑ {new_freq/1e9:.1f} GHz (multi-user)")
    else:
        # Single user → can afford wider beam at lower freq
        target = max(new_freq - 0.5e9, 1e9)
        if target != new_freq:
            new_freq = target
            reasons.append(f"freq ↓ {new_freq/1e9:.1f} GHz (single-user)")

    return {
        "tx_power": round(new_tx, 1),
        "frequency": round(new_freq, 0),
        "reason": "; ".join(reasons) if reasons else "stable",
    }
