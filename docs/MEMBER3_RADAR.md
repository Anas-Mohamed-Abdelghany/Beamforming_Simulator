# 👤 Member 3 — Radar Beamforming Mode

> **Rule: NO physics math in the frontend. All array factor, radar equation, beam sweep, and detection logic lives in the backend.**
> Your frontend calls the API and renders the results.

---

## 📁 Your Files

### Backend (physics — yours to implement)
```
backend/physics/radar/
├── array_factor.py   ← Array factor formula, beam width, side lobes, grating lobe check
├── beam_sweep.py     ← BeamSweeper class, sweep angle progression
├── detection.py      ← Target detection logic, detection history ring buffer
└── radar_equation.py ← Received power, SNR, detection threshold

backend/models/radar.py      ← Pydantic request/response schemas
backend/routes/radar.py      ← FastAPI endpoints for radar
```

### Frontend (rendering + UI — yours to implement)
```
frontend/src/modes/radar/
├── renderer.js       ← PPI canvas, phosphor effect, polar pattern canvas
├── simulator.js      ← Calls API each tick, manages sweep animation state
├── ui.js             ← Control wiring helpers
└── RadarMode.jsx     ← React root component

frontend/src/scenarios/
└── radar_tracking.json
```

---

## 📦 BACKEND Deliverables

### `physics/radar/array_factor.py`
```python
# Formula: |Σ exp(j·n·π·d/λ·(sin θ − sin θ₀))| / N
def array_factor(theta_deg: float, num_elements: int, spacing_m: float,
                 wavelength: float, steering_deg: float) -> float: ...  # [0, 1]

def beam_width_deg(num_elements: int, spacing_m: float, wavelength: float) -> float: ...

def side_lobe_level(num_elements: int) -> float: ...  # dB, ≈ −13.5 dB uniform

def grating_lobe_present(spacing_m: float, wavelength: float,
                          steering_deg: float) -> bool: ...

def compute_element_delays(num_elements: int, spacing_m: float,
                           steering_deg: float, frequency: float) -> list[float]:
    # delay_i = i * spacing * sin(steering_deg * π/180) / c
```

### `physics/radar/beam_sweep.py`
```python
class BeamSweeper:
    def __init__(self, min_deg: float, max_deg: float, speed_deg_per_sec: float): ...
    def tick(self, dt: float) -> float:
        # Advances angle, bounces at limits, returns current angle
    def get_sweep_angles(self, beam_width_deg: float) -> dict:
        # Returns {"min": float, "mid": float, "max": float}
```

### `physics/radar/radar_equation.py`
```python
def received_power(tx_power: float, gain: float, rcs: float,
                   range_m: float, wavelength: float) -> float: ...  # watts

def is_detected(received_power: float, threshold: float) -> bool: ...
```

### `physics/radar/detection.py`
```python
def check_targets(targets: list, sweep_angle: float, beam_width: float,
                  mode: str, array_config: dict, threshold: float) -> list[dict]:
    # mode: "phased_array" | "rotating_line"
    # Returns list of detection events: [{target_id, angle, confidence}]

def build_gain_profile(num_elements: int, spacing_m: float,
                       wavelength: float, steering_deg: float,
                       angle_range=(-90, 90), steps=180) -> list[dict]:
    # Returns [{angle, gain}] for the full beam pattern
```

### `models/radar.py` — Pydantic schemas
```python
class Target(BaseModel):
    id: str; x: float; y: float; rcs: float

class RadarTickRequest(BaseModel):
    num_elements: int
    spacing_m: float
    frequency: float
    sweep_angle: float        # current angle (frontend tracks this with dt from API)
    sweep_speed: float
    sweep_min: float; sweep_max: float
    mode: str                 # "phased_array" | "rotating_line"
    targets: list[Target]
    detection_threshold: float
    dt: float

class RadarTickResponse(BaseModel):
    sweep_angle: float        # updated angle after dt
    gain_profile: list        # [{angle, gain}] full beam pattern
    delays: list[float]       # per-element delays
    detections: list          # [{target_id, x, y, angle, confidence, timestamp}]
    beam_width: float
    side_lobe_level: float
    grating_lobe_warning: bool
```

### `routes/radar.py` — API endpoints
```
POST /api/radar/tick
  Body: RadarTickRequest
  Returns: RadarTickResponse
  → Called every animation frame

POST /api/radar/pattern
  Body: { num_elements, spacing_m, frequency, steering_deg }
  Returns: { gain_profile: [{angle, gain}], beam_width, side_lobe_level, grating_lobe_warning }
  → Called on slider change (not every frame)

POST /api/radar/delays
  Body: { num_elements, spacing_m, steering_deg, frequency }
  Returns: { delays: float[] }
```

---

## 📦 FRONTEND Deliverables

### `renderer.js`
```js
class RadarRenderer {
  constructor(canvas) {}
  // Phosphor effect: fill rgba(0,0,0,0.03) each frame — trails fade over ~2s
  clear(alpha) {}
  setFadeRate(alpha) {}
  drawRangeRings(numRings, maxRange) {}
  drawAzimuthLines() {}
  drawBeamLobe(centerAngle, gainProfile, maxRange) {}
  // gainProfile = [{angle, gain}] from API → filled polygon
  drawTarget(x, y, detected, age) {}
  drawArrayElements(elements, delays) {}
  polarToCanvas(rangePx, angleDeg) {}  // → {x, y}
  startLoop(cb) {}
  stopLoop() {}
}

class PolarPatternRenderer {
  constructor(canvas) {}
  drawPolarPattern(gainProfile, color) {}   // [{angle, gain}] as polar curve
  overlayCurrentAngle(angleDeg) {}
}
```

### `simulator.js`
```js
// Frontend tracks dt locally, sends it to API each tick
// API returns new sweep_angle + all computed data
class RadarSimulator {
  constructor(apiClient) {}
  setConfig(config) {}
  addTarget(x, y, rcs) {}
  removeTarget(id) {}
  setMode(mode) {}   // 'phased_array' | 'rotating_line'
  async tick(dt) {}  // calls POST /api/radar/tick, returns render state
  async updatePattern() {}  // calls POST /api/radar/pattern on slider change
}
```

### `RadarMode.jsx` — React component
- Main PPI canvas (dark green theme)
- Comparison mode toggle (phased array left, rotating line right)
- Polar beam pattern canvas (small, below PPI)
- Control sliders: Elements, Spacing, Frequency, Sweep speed, Min/Max angle, Threshold
- Scan mode: Forward-only / Bounce / Full 360°
- Click PPI to place targets; per-target RCS slider; remove button
- Live info panel: sweep angle, beam width, side lobe level, grating lobe warning (red)
- Detection log: `[HH:MM:SS] Target #2 at 47° — DETECTED`
- Exposes `applyScenario(obj)` / `extractScenario()` via ref

---

## 📦 Scenario JSON

### `radar_tracking.json`
```json
{
  "label": "Multi-Target Air Defense Radar", "mode": "radar", "version": "1.0",
  "arrayConfig": { "numElements": 32, "spacing": 0.5 },
  "frequency": 3000000000,
  "sweepRange": { "min": -60, "max": 60 },
  "sweepSpeed": 30, "detectionThreshold": 0.5,
  "targets": [
    { "x": 150, "y": -80, "rcs": 10 },
    { "x": -60, "y": 120, "rcs": 2 },
    { "x": 200, "y": 50,  "rcs": 25 }
  ]
}
```

---

## ✅ Acceptance Checklist
- [ ] `POST /api/radar/tick` returns correct sweep angle, gain profile, and detections
- [ ] Side lobe detection works at lowered threshold (tested in `detection.py`)
- [ ] Grating lobe warning triggers correctly in `array_factor.py`
- [ ] Frontend phosphor trail fades correctly (~2 seconds) using only canvas alpha clearing
- [ ] Beam lobe polygon drawn from `gain_profile[]` returned by API
- [ ] No array factor / radar equation math in any frontend file
- [ ] Comparison mode (phased array vs rotating line) works side-by-side
- [ ] `applyScenario()` / `extractScenario()` work correctly
