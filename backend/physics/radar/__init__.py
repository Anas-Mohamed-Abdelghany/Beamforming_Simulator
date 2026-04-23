"""
Radar physics package — public API.

Re-exports key functions and classes for convenient top-level imports.
"""
from backend.physics.radar.array_factor import (
    compute_element_delays,
    grating_lobe_present,
    side_lobe_level_db,
)
from backend.physics.radar.beam_sweep import BeamSweeper
from backend.physics.radar.radar_equation import (
    received_power_w,
    power_to_dbm,
    threshold_dbm,
    is_detected,
)
from backend.physics.radar.detection import (
    build_gain_profile,
    check_targets,
)

__all__ = [
    "compute_element_delays",
    "grating_lobe_present",
    "side_lobe_level_db",
    "BeamSweeper",
    "received_power_w",
    "power_to_dbm",
    "threshold_dbm",
    "is_detected",
    "build_gain_profile",
    "check_targets",
]
