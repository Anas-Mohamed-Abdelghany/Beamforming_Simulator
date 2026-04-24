"""
FastAPI router for the Radar Beamforming Simulator.
Prefix: /api/radar
Endpoints: POST /tick, POST /pattern, POST /delays
"""
from fastapi import APIRouter
from backend.models.radar import (
    RadarTickRequest, RadarTickResponse,
    PatternRequest, PatternResponse,
    DelaysRequest, DelaysResponse,
    GainPoint, DetectionEvent,
    LockSizeRequest, LockSizeResponse, SizedTarget,
)
from backend.physics.fiveg.beam_steering import beam_width_deg
from backend.physics.radar.array_factor import (
    compute_element_delays, grating_lobe_present, side_lobe_level_db,
)
from backend.physics.radar.beam_sweep import BeamSweeper
from backend.physics.radar.detection import build_gain_profile, check_targets

router = APIRouter()
C: float = 3e8


# ── POST /tick ────────────────────────────────────────────────────────────────

@router.post("/tick", response_model=RadarTickResponse)
async def tick(req: RadarTickRequest) -> RadarTickResponse:
    """
    Advance the radar simulation by one frame.

    1. Compute wavelength from frequency.
    2. Advance sweep angle via BeamSweeper.
    3. Build gain profile, compute delays, detect targets.
    4. Return full tick response.
    """
    wavelength = C / req.frequency

    # Create a BeamSweeper seeded at current angle and advance by dt
    sweeper = BeamSweeper(
        start_deg=req.sweep_angle,
        speed_deg_per_sec=req.sweep_speed,
        mode=req.sweep_mode,
        sector_min=req.sector_min,
        sector_max=req.sector_max,
    )
    new_angle = sweeper.tick(req.dt)

    # Beam width
    bw = beam_width_deg(req.num_elements, req.spacing_m, wavelength)

    # Gain profile
    profile_data = build_gain_profile(
        num_elements=req.num_elements,
        spacing_m=req.spacing_m,
        wavelength=wavelength,
        steering_deg=new_angle,
        window_type=req.window_type,
        snr=req.snr,
        resolution_deg=2,
    )
    gain_profile = [GainPoint(angle=p["angle"], gain=p["gain"]) for p in profile_data]

    # Element delays
    delays = compute_element_delays(
        num_elements=req.num_elements,
        spacing_m=req.spacing_m,
        steering_deg=new_angle,
        frequency=req.frequency,
    )

    # Target detection
    targets_dicts = [t.model_dump() for t in req.targets]
    detection_dicts = check_targets(
        targets=targets_dicts,
        sweep_angle_deg=new_angle,
        beam_width_deg_val=bw,
        mode=req.mode,
        array_config={"num_elements": req.num_elements, "spacing_m": req.spacing_m},
        threshold_norm=req.detection_threshold,
        tx_power_dbm=req.tx_power_dbm,
        wavelength=wavelength,
    )
    detections = [DetectionEvent(**d) for d in detection_dicts]

    # Grating lobe check
    grating_warning = grating_lobe_present(req.spacing_m, wavelength, new_angle)

    # Side-lobe level
    sll = side_lobe_level_db(req.num_elements)

    return RadarTickResponse(
        sweep_angle=round(new_angle, 3),
        gain_profile=gain_profile,
        delays=delays,
        detections=detections,
        beam_width=round(bw, 3),
        side_lobe_level_db=sll,
        grating_lobe_warning=grating_warning,
    )


# ── POST /pattern ─────────────────────────────────────────────────────────────

@router.post("/pattern", response_model=PatternResponse)
async def pattern(req: PatternRequest) -> PatternResponse:
    """
    Return full beam pattern without advancing the sweep.

    Called on slider change (not every frame).
    """
    wavelength = C / req.frequency

    profile_data = build_gain_profile(
        num_elements=req.num_elements,
        spacing_m=req.spacing_m,
        wavelength=wavelength,
        steering_deg=req.steering_deg,
        window_type=req.window_type,
        snr=req.snr,
        resolution_deg=2,
    )
    gain_profile = [GainPoint(angle=p["angle"], gain=p["gain"]) for p in profile_data]

    bw = beam_width_deg(req.num_elements, req.spacing_m, wavelength)
    grating_warning = grating_lobe_present(req.spacing_m, wavelength, req.steering_deg)
    sll = side_lobe_level_db(req.num_elements)

    return PatternResponse(
        gain_profile=gain_profile,
        beam_width=round(bw, 3),
        side_lobe_level_db=sll,
        grating_lobe_warning=grating_warning,
    )


# ── POST /delays ──────────────────────────────────────────────────────────────

@router.post("/delays", response_model=DelaysResponse)
async def delays(req: DelaysRequest) -> DelaysResponse:
    """Return per-element time delays for the given configuration."""
    delay_list = compute_element_delays(
        num_elements=req.num_elements,
        spacing_m=req.spacing_m,
        steering_deg=req.steering_deg,
        frequency=req.frequency,
    )
    return DelaysResponse(delays=delay_list)


# ── POST /lock-size ───────────────────────────────────────────────────────────────

@router.post("/lock-size", response_model=LockSizeResponse)
async def lock_size(req: LockSizeRequest) -> LockSizeResponse:
    """
    Evaluate targets for lock-and-size.

    When a target has been consecutively detected enough times,
    the beam automatically narrows to "size" it (estimate angular extent).
    """
    from backend.m3_radar.sizing_logic import (
        compute_lock_beam_params,
        evaluate_lock_candidates,
        estimate_target_size,
        sizing_scan_sector,
    )

    wavelength = C / req.frequency

    # Compute wide/narrow beam parameters
    beam_params = compute_lock_beam_params(
        base_num_elements=req.num_elements,
        spacing_m=req.spacing_m,
        wavelength=wavelength,
        lock_factor=req.lock_factor,
    )

    # Determine which targets qualify for lock
    detection_history = {
        t.id: t.consecutive_detections for t in req.targets
    }
    locked_ids = evaluate_lock_candidates(
        targets=[t.model_dump() for t in req.targets],
        detection_history=detection_history,
        consecutive_threshold=req.consecutive_threshold,
    )

    # Build sizing results for all targets
    sizing_results = []
    for t in req.targets:
        is_locked = t.id in locked_ids
        result = SizedTarget(
            target_id=t.id,
            locked=is_locked,
            wide_beam_width=beam_params["wide_beam_width"],
            narrow_beam_width=beam_params["narrow_beam_width"],
            effective_elements=beam_params["effective_elements"],
        )

        if is_locked:
            import math
            target_angle = math.degrees(math.atan2(t.x, t.y))  # PPI convention: 0°=North
            size_info = estimate_target_size(
                target_angle_deg=target_angle,
                sweep_angle_deg=target_angle,  # locked onto target
                narrow_beam_width_deg=beam_params["narrow_beam_width"],
                gain_at_target=0.95,  # assume high gain when locked
            )
            sector = sizing_scan_sector(
                target_angle_deg=target_angle,
                narrow_beam_width_deg=beam_params["narrow_beam_width"],
            )
            result.size_category = size_info["size_category"]
            result.estimated_extent_deg = size_info["estimated_extent_deg"]
            result.scan_sector_min = sector[0]
            result.scan_sector_max = sector[1]

        sizing_results.append(result)

    return LockSizeResponse(
        locked_target_ids=locked_ids,
        sizing_results=sizing_results,
    )
