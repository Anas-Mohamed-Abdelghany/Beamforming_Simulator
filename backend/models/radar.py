"""Pydantic schemas for the Radar Beamforming Simulator."""
from pydantic import BaseModel
from typing import List, Optional


# ── Request payloads ──────────────────────────────────────────────────────────

class Target(BaseModel):
    """A radar target with position and radar cross-section."""
    id: str
    x: float          # metres, relative to radar at origin
    y: float
    rcs: float = 1.0  # radar cross-section [m²]; maps to apparent size


class RadarTickRequest(BaseModel):
    """Per-frame tick request containing full radar state."""
    # Array config
    num_elements: int = 32          # Param 1: 4–128
    spacing_m: float = 0.015        # Param 2: element spacing [m] (default λ/2 at 10 GHz)
    frequency: float = 10e9         # Param 3: carrier frequency [Hz]
    tx_power_dbm: float = 43.0      # fixed at 43 dBm for now (not user-facing)

    # Sweep state (frontend sends its local clock's dt each frame)
    sweep_angle: float = 0.0        # current angle [deg] — frontend tracks this
    sweep_speed: float = 45.0       # Param 4: [deg/s]
    sweep_mode: str = "continuous"   # "continuous" | "bounce" | "sector"
    sector_min: float = -60.0
    sector_max: float = 60.0

    # Scan mode
    mode: str = "phased_array"      # "phased_array" | "rotating_line"

    # Quality
    detection_threshold: float = 0.3   # Param 5: [0, 1]
    snr: float = 100.0                  # Param 6: SNR [0, 1000]
    window_type: str = "rectangular"    # Param 7: apodization window
    pulse_frequency: float = 1000.0     # PRF in Hz (pulse repetition freq)

    targets: List[Target] = []
    dt: float = 0.016               # seconds since last tick (≈60 fps)


class PatternRequest(BaseModel):
    """Request for a full beam pattern (no sweep advance)."""
    num_elements: int = 32
    spacing_m: float = 0.015
    frequency: float = 10e9
    steering_deg: float = 0.0
    window_type: str = "rectangular"
    snr: float = 100.0


class DelaysRequest(BaseModel):
    """Request for per-element time delays."""
    num_elements: int = 32
    spacing_m: float = 0.015
    steering_deg: float = 0.0
    frequency: float = 10e9


# ── Response payloads ─────────────────────────────────────────────────────────

class DetectionEvent(BaseModel):
    """A single target detection event."""
    target_id: str
    x: float
    y: float
    angle_deg: float
    range_m: float
    received_dbm: float
    confidence: float           # 0–1


class GainPoint(BaseModel):
    """A single point in the gain profile."""
    angle: float
    gain: float


class RadarTickResponse(BaseModel):
    """Response for each simulation tick."""
    sweep_angle: float              # updated angle after applying dt
    gain_profile: List[GainPoint]   # full 360° pattern at current steering
    delays: List[float]             # per-element time delays [s]
    detections: List[DetectionEvent]
    beam_width: float               # HPBW [deg]
    side_lobe_level_db: float
    grating_lobe_warning: bool


class PatternResponse(BaseModel):
    """Response for beam pattern query."""
    gain_profile: List[GainPoint]
    beam_width: float
    side_lobe_level_db: float
    grating_lobe_warning: bool


class DelaysResponse(BaseModel):
    """Response for element delay query."""
    delays: List[float]


# ── Lock and Size ─────────────────────────────────────────────────────────────

class LockTarget(BaseModel):
    """A target that has been detected and is a candidate for sizing lock."""
    id: str
    x: float
    y: float
    rcs: float
    consecutive_detections: int = 0


class LockSizeRequest(BaseModel):
    """Request for Lock-and-Size evaluation."""
    num_elements: int = 32
    spacing_m: float = 0.015
    frequency: float = 10e9
    targets: List[LockTarget] = []
    lock_factor: float = 3.0          # beam narrowing factor
    consecutive_threshold: int = 2    # detections needed to trigger lock


class SizedTarget(BaseModel):
    """A single target's sizing result after lock."""
    target_id: str
    locked: bool
    wide_beam_width: float
    narrow_beam_width: float
    effective_elements: int
    size_category: Optional[str] = None
    estimated_extent_deg: Optional[float] = None
    scan_sector_min: Optional[float] = None
    scan_sector_max: Optional[float] = None


class LockSizeResponse(BaseModel):
    """Response for Lock-and-Size evaluation."""
    locked_target_ids: List[str]
    sizing_results: List[SizedTarget]
