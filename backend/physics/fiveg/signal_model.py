"""
Signal propagation model — Free-Space Path Loss, SNR, noise injection.
Distances are in **meters** (1 pixel ≈ 1 m for the 5G scenario).
"""
import math
import numpy as np
from typing import List

C = 3e8  # speed of light


# ── Free-Space Path Loss ──────────────────────────────────────────────────────

def fspl_db(distance_m: float, frequency_hz: float) -> float:
    """
    Free-Space Path Loss in dB.
    FSPL(dB) = 20·log₁₀(d) + 20·log₁₀(f) − 147.55
    """
    if distance_m < 1.0:
        distance_m = 1.0
    return 20 * math.log10(distance_m) + 20 * math.log10(frequency_hz) - 147.55


def signal_strength_dbm(
    tower_x: float, tower_y: float,
    user_x: float, user_y: float,
    tx_power_dbm: float,
    frequency_hz: float,
    num_antennas: int = 1,
    array_gain_linear: float = 1.0,
) -> float:
    """
    Received signal strength in dBm including array gain.
    P_rx = P_tx + G_array(dB) − FSPL
    """
    dist = math.sqrt((user_x - tower_x) ** 2 + (user_y - tower_y) ** 2)
    loss = fspl_db(dist, frequency_hz)
    gain_db = 10 * math.log10(max(array_gain_linear, 1e-12))
    return tx_power_dbm + gain_db - loss


# ── SNR helpers ───────────────────────────────────────────────────────────────

def compute_snr_db(signal_dbm: float, noise_floor_dbm: float) -> float:
    """SNR in dB = signal − noise floor (both in dBm)."""
    return signal_dbm - noise_floor_dbm


def snr_to_noise_floor(snr_value: float) -> float:
    """
    Map the user-facing SNR slider (0 – 1000) to a noise floor in dBm.
    • SNR = 0   → noise floor = −40 dBm  (very noisy)
    • SNR = 1000 → noise floor = −160 dBm (virtually noiseless)
    """
    # linear interpolation
    return -40.0 - (snr_value / 1000.0) * 120.0


# ── Noise injection on a gain profile ─────────────────────────────────────────

def apply_snr_to_profile(
    profile: List[float],
    snr_value: float,
) -> List[float]:
    """
    Add Gaussian noise to a normalised gain profile based on *snr_value* (0–1000).
    Higher SNR → less noise.
    Returns a new list with noise-affected values clipped to [0, 1].
    """
    if snr_value >= 999:
        return list(profile)  # effectively noiseless

    # noise standard deviation: high SNR → tiny sigma
    sigma = 0.5 / (1.0 + snr_value / 10.0)
    arr = np.array(profile, dtype=np.float64)
    noise = np.random.normal(0, sigma, len(arr))
    noisy = arr + noise
    noisy = np.clip(noisy, 0.0, 1.0)
    return noisy.tolist()
