# 👤 Member 2 — 5G Beamforming & User Tracking Mode

> **Rule: NO physics math in the frontend. All antenna math, beam steering, and signal models live in the backend.**
> Your frontend calls the API and renders the results.

---

## 📁 Your Files

### Backend (physics — yours to implement)
```
backend/physics/fiveg/
├── antenna.py        ← Antenna geometry builder, array factor
├── beam_steering.py  ← Steering angle, per-element delays, beam width
├── signal_model.py   ← Free-space path loss, SNR, signal strength (dBm)
└── connection.py     ← Tower-user association, handoff hysteresis logic

backend/models/fiveg.py      ← Pydantic request/response schemas
backend/routes/fiveg.py      ← FastAPI endpoints for 5G
```

### Frontend (rendering + UI — yours to implement)
```
frontend/src/modes/5g/
├── renderer.js       ← Canvas2D drawing (towers, users, beam lobes)
├── simulator.js      ← Calls API, manages user positions & animation
├── ui.js             ← Canvas interaction tool helpers
└── FiveGMode.jsx     ← React root component

frontend/src/scenarios/
└── 5g_urban.json
```

---

## 📦 BACKEND Deliverables

### `physics/fiveg/antenna.py`
```python
def build_linear_antenna(num_elements: int, spacing_m: float,
                         center_x: float, center_y: float) -> list[dict]:
    # Returns [{"x": float, "y": float}, ...]
```

### `physics/fiveg/beam_steering.py`
```python
def compute_steering_angle(tower_x, tower_y, user_x, user_y) -> float: ...  # degrees

def compute_antenna_delay(element_x, element_y,
                          steering_angle_deg, frequency) -> float: ...  # seconds

def array_factor(theta, num_elements, spacing_m, wavelength,
                 steering_angle_deg) -> float: ...  # [0, 1]

def beam_width_deg(num_elements, spacing_m, wavelength) -> float: ...  # HPBW
```

### `physics/fiveg/signal_model.py`
```python
def signal_strength(tower_x, tower_y, user_x, user_y,
                    tx_power, frequency) -> float: ...  # dBm (free-space path loss)

def snr(signal_dbm: float, noise_floor_dbm: float) -> float: ...  # dB
```

### `physics/fiveg/connection.py`
```python
def assign_tower(user: dict, towers: list) -> dict | None:
    # Returns nearest tower whose coverage contains the user

def distribute_antennas(tower: dict, users: list) -> dict:
    # floor(N/K) per user, remainder to lowest-SNR user
    # Returns { user_id: antenna_count }

def check_handoff(user: dict, towers: list, hysteresis=0.05) -> dict | None:
    # Returns new tower if handoff should occur (5% margin rule)
```

### `models/fiveg.py` — Pydantic schemas
```python
class TowerConfig(BaseModel):
    id: str
    x: float; y: float
    num_antennas: int
    coverage_radius: float
    frequency: float

class UserState(BaseModel):
    id: str
    x: float; y: float
    connected_tower_id: str | None

class FiveGTickRequest(BaseModel):
    towers: list[TowerConfig]
    users: list[UserState]
    tx_power: float
    noise_floor: float = -100.0

class FiveGTickResponse(BaseModel):
    beams: list          # [{tower_id, user_id, steering_angle, beam_width, gain_profile[]}]
    connections: list    # [{user_id, tower_id, snr, antennas_assigned}]
    handoff_events: list # [{user_id, from_tower, to_tower}]
    heatmap: list | None # 2D signal strength grid (computed every 500ms)
```

### `routes/fiveg.py` — API endpoints
```
POST /api/5g/tick
  Body: FiveGTickRequest
  Returns: FiveGTickResponse
  → Called every animation frame with current tower/user positions

POST /api/5g/heatmap
  Body: { towers, width, height, tx_power, frequency }
  Returns: { grid: float[][] }
  → Heavy computation, called every 500ms not every frame

POST /api/5g/beam
  Body: { tower, user, num_antennas, frequency }
  Returns: { steering_angle, beam_width, delays[], gain_profile[] }
  → Single beam calculation
```

---

## 📦 FRONTEND Deliverables

### `renderer.js`
```js
class FiveGRenderer {
  constructor(canvas) {}
  clear() {}
  drawTower(x, y, color, label) {}
  drawCoverageCircle(x, y, radius, color, opacity) {}
  drawUser(x, y, id, selected, connected) {}
  drawBeamLobe(towerX, towerY, steeringAngle, gainProfile, maxRange, color) {}
  // gainProfile[] from API → filled polygon lobe shape
  drawAntennaEmission(elementX, elementY, steeringAngle, phaseOffset) {}
  drawSignalHeatmap(grid, bounds) {}
  worldToCanvas(wx, wy) {}
  canvasToWorld(cx, cy) {}
  startLoop(cb) {}   // passes dt
  stopLoop() {}
}
```

### `simulator.js`
```js
// Manages user positions locally (movement is pure UI state)
// Sends positions to API each tick to get beam/connection data back
class FiveGSimulator {
  constructor(apiClient) {}
  placeTower(x, y, config) {}
  removeTower(id) {}
  placeUser(x, y) {}
  removeUser(id) {}
  selectUser(id) {}
  moveSelectedUser(dx, dy) {}         // local position update only
  async tick(dt) {}                   // sends state to API, gets beams/connections back
  async refreshHeatmap() {}           // calls /api/5g/heatmap every 500ms
}
```

### `FiveGMode.jsx` — React component
- One main interactive canvas
- Toolbar: Place Tower / Place User / Delete / Select
- Keyboard movement (WASD / arrows) for selected user
- Auto-wander toggle for unselected users
- Control sliders: Antennas per tower, Coverage radius, Frequency, Tx power, Speed
- Live info panel: per-user SNR, tower, antennas assigned; per-tower user count
- Handoff event log (scrolling)
- Exposes `applyScenario(obj)` / `extractScenario()` via ref

---

## 📦 Scenario JSON

### `5g_urban.json`
```json
{
  "label": "Urban Multi-User Deployment", "mode": "5g", "version": "1.0",
  "towers": [
    { "x": 200, "y": 200, "numAntennas": 32, "coverageRadius": 300 },
    { "x": 600, "y": 200, "numAntennas": 32, "coverageRadius": 300 },
    { "x": 400, "y": 500, "numAntennas": 64, "coverageRadius": 400 }
  ],
  "users": [{ "x": 250, "y": 300 }, { "x": 550, "y": 250 },
            { "x": 380, "y": 480 }, { "x": 450, "y": 150 }],
  "frequency": 28000000000, "txPower": 30
}
```

---

## ✅ Acceptance Checklist
- [ ] `POST /api/5g/tick` returns beams + connections for any tower/user layout
- [ ] Handoff fires correctly with 5% hysteresis (tested in backend unit logic)
- [ ] Antenna distribution: floor(N/K) per user, verified in `connection.py`
- [ ] Frontend renders beam lobes using only `gain_profile[]` from API
- [ ] No `sin`, `cos`, path-loss formula anywhere in frontend files
- [ ] Keyboard movement + auto-wander work smoothly
- [ ] `applyScenario()` / `extractScenario()` work correctly
