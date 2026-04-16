"""Pydantic schemas for the 5G Beamforming Simulator."""
from pydantic import BaseModel
from typing import List, Optional


# ── Request payloads ──────────────────────────────────────────────────────────

class TowerConfig(BaseModel):
    id: str
    x: float
    y: float
    num_antennas: int = 32           # Param 1
    coverage_radius: float = 300.0   # Param 2  (metres)
    frequency: float = 28e9          # Param 3  (Hz)
    tx_power: float = 30.0           # Param 4  (dBm)
    snr: float = 100.0               # Param 5  (0 – 1000)
    window_type: str = "rectangular" # Param 6
    orientation: float = 0.0         # Param 7  (deg)


class UserState(BaseModel):
    id: str
    x: float
    y: float
    speed: float = 150.0
    connected_tower_id: Optional[str] = None


class FiveGTickRequest(BaseModel):
    towers: List[TowerConfig]
    users: List[UserState]


class HeatmapRequest(BaseModel):
    towers: List[TowerConfig]
    users: List[UserState]
    width: int = 900
    height: int = 700


class BeamRequest(BaseModel):
    tower: TowerConfig
    user: UserState


# ── Response payloads ─────────────────────────────────────────────────────────

class BeamInfo(BaseModel):
    tower_id: str
    user_id: str
    steering_angle: float
    beam_width: float
    gain_profile: List[float]       # normalised values every 3°
    gain_profile_noisy: List[float] # with SNR noise applied


class ConnectionInfo(BaseModel):
    user_id: str
    tower_id: str
    snr_db: float
    signal_dbm: float
    distance_m: float
    antennas_assigned: int


class HandoffEvent(BaseModel):
    user_id: str
    from_tower: Optional[str]
    to_tower: Optional[str]


class TowerUpdate(BaseModel):
    """Reports auto-adjusted parameters for a tower (visible to user)."""
    tower_id: str
    tx_power: float
    frequency: float
    reason: str


class BeamProfile(BaseModel):
    """Polar beam-profile data for the side viewer."""
    tower_id: str
    user_id: str
    angles_deg: List[float]
    gains: List[float]
    gains_noisy: List[float]
    window_type: str


class FiveGTickResponse(BaseModel):
    beams: List[BeamInfo]
    connections: List[ConnectionInfo]
    handoff_events: List[HandoffEvent]
    tower_updates: List[TowerUpdate]
    beam_profiles: List[BeamProfile]


class HeatmapResponse(BaseModel):
    grid: List[List[float]]
    step: int


class SingleBeamResponse(BaseModel):
    steering_angle: float
    beam_width: float
    gain_profile: List[float]
    delays: List[float]
