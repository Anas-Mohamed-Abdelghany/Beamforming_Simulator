"""
FastAPI router for the 5G Beamforming Simulator.
Endpoints: /tick, /heatmap, /beam
"""
import math
from fastapi import APIRouter
from backend.models.fiveg import (
    FiveGTickRequest, FiveGTickResponse,
    BeamInfo, ConnectionInfo, HandoffEvent, TowerUpdate, BeamProfile,
    HeatmapRequest, HeatmapResponse,
    BeamRequest, SingleBeamResponse,
)
from backend.physics.fiveg.antenna import build_ula, apply_window
from backend.physics.fiveg.beam_steering import (
    compute_steering_angle, compute_element_phases,
    compute_gain_profile, beam_width_deg, compute_interference_map,
)
from backend.physics.fiveg.signal_model import (
    signal_strength_dbm, snr_to_noise_floor, compute_snr_db,
    apply_snr_to_profile,
)
from backend.physics.fiveg.connection import (
    check_handoff, distribute_antennas, get_distance, auto_adjust_tower_params,
)

router = APIRouter()
C = 3e8


# ── POST /tick ────────────────────────────────────────────────────────────────

@router.post("/tick", response_model=FiveGTickResponse)
async def tick(req: FiveGTickRequest):
    towers_dict = {t.id: t.model_dump() for t in req.towers}
    users_list = [u.model_dump() for u in req.users]

    handoff_events: list[HandoffEvent] = []
    beams: list[BeamInfo] = []
    connections: list[ConnectionInfo] = []
    tower_updates: list[TowerUpdate] = []
    beam_profiles: list[BeamProfile] = []

    # ── 1. Handoff & assignment ───────────────────────────────────────────
    for user in users_list:
        new_tower_id = check_handoff(user, list(towers_dict.values()))
        old_id = user.get("connected_tower_id")
        if old_id != new_tower_id:
            handoff_events.append(HandoffEvent(
                user_id=user["id"],
                from_tower=old_id,
                to_tower=new_tower_id,
            ))
        user["connected_tower_id"] = new_tower_id

    # ── 2. Per-tower processing ───────────────────────────────────────────
    for tower_id, tower in towers_dict.items():
        connected = [u for u in users_list if u.get("connected_tower_id") == tower_id]
        ant_dist = distribute_antennas(tower, connected)

        # Auto-adjust params
        adj = auto_adjust_tower_params(tower, connected)
        if adj["reason"] != "stable" and adj["reason"] != "no users":
            tower_updates.append(TowerUpdate(
                tower_id=tower_id,
                tx_power=adj["tx_power"],
                frequency=adj["frequency"],
                reason=adj["reason"],
            ))

        wavelength = C / tower["frequency"]
        spacing = wavelength / 2.0

        for uid, n_ant in ant_dist.items():
            if n_ant <= 0:
                continue
            user = next(u for u in users_list if u["id"] == uid)

            # Metrics
            steer = compute_steering_angle(tower["x"], tower["y"], user["x"], user["y"])
            bw = beam_width_deg(n_ant, spacing, wavelength)
            dist = get_distance(tower["x"], tower["y"], user["x"], user["y"])

            # Apodization weights
            weights = apply_window(n_ant, tower.get("window_type", "rectangular"))

            # Gain profile (3° resolution → 120 values)
            profile = compute_gain_profile(n_ant, spacing, wavelength, steer, weights, resolution_deg=3)

            # Noisy profile
            snr_val = tower.get("snr", 100)
            profile_noisy = apply_snr_to_profile(profile, snr_val)

            # Signal strength & SNR
            nf = snr_to_noise_floor(snr_val)
            sig = signal_strength_dbm(
                tower["x"], tower["y"], user["x"], user["y"],
                tower["tx_power"], tower["frequency"], n_ant,
            )
            snr_db = compute_snr_db(sig, nf)

            connections.append(ConnectionInfo(
                user_id=uid,
                tower_id=tower_id,
                snr_db=round(snr_db, 1),
                signal_dbm=round(sig, 1),
                distance_m=round(dist, 1),
                antennas_assigned=n_ant,
            ))

            beams.append(BeamInfo(
                tower_id=tower_id,
                user_id=uid,
                steering_angle=round(steer, 2),
                beam_width=round(bw, 2),
                gain_profile=profile,
                gain_profile_noisy=profile_noisy,
            ))

            # Beam profile for polar viewer
            angles_deg = list(range(0, 360, 3))
            beam_profiles.append(BeamProfile(
                tower_id=tower_id,
                user_id=uid,
                angles_deg=angles_deg,
                gains=profile,
                gains_noisy=profile_noisy,
                window_type=tower.get("window_type", "rectangular"),
            ))

    return FiveGTickResponse(
        beams=beams,
        connections=connections,
        handoff_events=handoff_events,
        tower_updates=tower_updates,
        beam_profiles=beam_profiles,
    )


# ── POST /heatmap ─────────────────────────────────────────────────────────────

@router.post("/heatmap", response_model=HeatmapResponse)
async def heatmap(req: HeatmapRequest):
    users_list = [u.model_dump() for u in req.users]
    step = 20

    towers_data = []
    for t in req.towers:
        td = t.model_dump()
        wl = C / td["frequency"]
        spacing = wl / 2.0

        tower_beams = []
        connected = [u for u in users_list if u.get("connected_tower_id") == td["id"]]
        # If no explicit connections, steer towards all users in range
        if not connected:
            for u in users_list:
                dist = get_distance(td["x"], td["y"], u["x"], u["y"])
                if dist <= td["coverage_radius"]:
                    connected.append(u)

        weights = apply_window(td["num_antennas"], td.get("window_type", "rectangular"))
        ant_dist = distribute_antennas(td, connected) if connected else {}

        for uid, n_ant in ant_dist.items():
            user = next(u for u in users_list if u["id"] == uid)
            steer = compute_steering_angle(td["x"], td["y"], user["x"], user["y"])
            tower_beams.append({
                "num_antennas": n_ant,
                "spacing": spacing,
                "wavelength": wl,
                "steering_angle": steer,
                "weights": apply_window(n_ant, td.get("window_type", "rectangular")),
            })

        td["beams"] = tower_beams
        towers_data.append(td)

    # Average SNR across towers for heatmap noise
    avg_snr = sum(t.snr for t in req.towers) / max(len(req.towers), 1)

    grid = compute_interference_map(towers_data, req.width, req.height, step, snr=avg_snr)
    return HeatmapResponse(grid=grid, step=step)


# ── POST /beam ────────────────────────────────────────────────────────────────

@router.post("/beam", response_model=SingleBeamResponse)
async def beam(req: BeamRequest):
    t = req.tower.model_dump()
    u = req.user.model_dump()
    wl = C / t["frequency"]
    spacing = wl / 2.0

    steer = compute_steering_angle(t["x"], t["y"], u["x"], u["y"])
    bw = beam_width_deg(t["num_antennas"], spacing, wl)

    elements = build_ula(t["num_antennas"], spacing, t["x"], t["y"], t.get("orientation", 0))
    delays = compute_element_phases(elements, steer, wl)

    weights = apply_window(t["num_antennas"], t.get("window_type", "rectangular"))
    profile = compute_gain_profile(t["num_antennas"], spacing, wl, steer, weights, resolution_deg=3)

    return SingleBeamResponse(
        steering_angle=round(steer, 2),
        beam_width=round(bw, 2),
        gain_profile=profile,
        delays=delays,
    )
