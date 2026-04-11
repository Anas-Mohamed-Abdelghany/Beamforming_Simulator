# Beamforming Simulator

A 2D web-based simulator for Ultrasound, 5G, and Radar beamforming.

## Architecture
- **Frontend:** React 18 + Vite (rendering & UI only — zero physics math)
- **Backend:** FastAPI (ALL physics, math, and computation)

## Key Rule
> Physics stays in the backend. Frontend only renders what the API returns.

## Structure
```
beamforming-simulator/
├── frontend/src/
│   ├── modes/ultrasound/   ← Member 1 (renderer, simulator, UI)
│   ├── modes/5g/           ← Member 2 (renderer, simulator, UI)
│   ├── modes/radar/        ← Member 3 (renderer, simulator, UI)
│   ├── components/         ← Member 4 (shared UI components)
│   ├── engine/             ← Member 4 (apiClient, scenario, multi-array)
│   └── advanced/           ← Member 4 (AI vs Classical panel)
└── backend/
    ├── physics/ultrasound/ ← Member 1 (waves, delays, interference, geometry)
    ├── physics/fiveg/      ← Member 2 (antenna, beam steering, signal, connection)
    ├── physics/radar/      ← Member 3 (array factor, sweep, detection, radar eq.)
    ├── physics/advanced/   ← Member 4 (DAS, MVDR, comparison)
    ├── models/             ← Pydantic schemas (one per mode)
    └── routes/             ← FastAPI endpoints (one per mode)
```

## Getting Started

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Member Guides
- `docs/MEMBER1_ULTRASOUND.md`
- `docs/MEMBER2_5G.md`
- `docs/MEMBER3_RADAR.md`
- `docs/MEMBER4_SHELL.md`
