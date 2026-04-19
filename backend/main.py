"""
main.py  — Beamforming Simulator API entry-point
=================================================
Includes routers from all four team members:
    /api/5g        — M1  5G beamforming
    /api/ultrasound — M2  Ultrasound imaging   (placeholder prefix)
    /api/radar      — M3  Radar beamforming    (placeholder prefix)
    /api/doppler    — M4  Doppler blood-vessel
    /api/advanced   — M4  DAS vs MVDR comparison
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Member routers ─────────────────────────────────────────────────────────
from backend.routes.fiveg    import router as fiveg_router
from backend.routes.doppler  import router as doppler_router
from backend.routes.advanced import router as advanced_router

# Optional — comment out until M2/M3 create their routers
# from backend.routes.ultrasound import router as ultrasound_router
# from backend.routes.radar      import router as radar_router

# ── App setup ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Beamforming Simulator API",
    description="Multi-mode beamforming simulator: 5G, Ultrasound, Radar, Doppler, DAS/MVDR.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ───────────────────────────────────────────────────────
app.include_router(fiveg_router,    prefix="/api/5g",       tags=["5G Beamforming"])
app.include_router(doppler_router,  prefix="/api/doppler",  tags=["Doppler"])
app.include_router(advanced_router, prefix="/api/advanced", tags=["DAS vs MVDR"])

# Uncomment when M2/M3 are ready:
# app.include_router(ultrasound_router, prefix="/api/ultrasound", tags=["Ultrasound"])
# app.include_router(radar_router,      prefix="/api/radar",      tags=["Radar"])


@app.get("/health")
def health_check():
    return {"status": "ok", "modes": ["5g", "doppler", "advanced"]}
