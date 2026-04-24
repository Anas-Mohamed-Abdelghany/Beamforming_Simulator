"""
m3_radar/phased_logic.py — 360° Electronic Steering Math

Re-exports and aliases from backend.physics.radar for the spec naming convention.
All core math lives in backend/physics/radar/.
"""
from backend.physics.radar.array_factor import (     # noqa: F401
    compute_element_delays,
    grating_lobe_present,
    side_lobe_level_db,
)
from backend.physics.radar.beam_sweep import BeamSweeper  # noqa: F401
from backend.physics.radar.detection import (             # noqa: F401
    build_gain_profile,
    check_targets,
)
from backend.physics.fiveg.beam_steering import (         # noqa: F401
    array_factor,
    beam_width_deg,
)

__all__ = [
    "compute_element_delays",
    "grating_lobe_present",
    "side_lobe_level_db",
    "BeamSweeper",
    "build_gain_profile",
    "check_targets",
    "array_factor",
    "beam_width_deg",
]
