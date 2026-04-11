# 👤 Member 1 — Ultrasound Beamforming Mode

> **Rule: NO physics math in the frontend. All wave math, delay calculation, and interference computation lives in the backend.**
> Your frontend calls the API and renders the results. Your backend computes everything.

---

## 📁 Your Files

### Backend (physics — yours to implement)
```
backend/physics/ultrasound/
├── waves.py           ← Wave class, sinusoidal propagation, attenuation
├── delays.py          ← Steering delay, focal delay calculators
├── interference.py    ← Amplitude summation, grid computation
└── array_geometry.py  ← Linear and curved array builders

backend/models/ultrasound.py   ← Pydantic request/response schemas
backend/routes/ultrasound.py   ← FastAPI endpoints for ultrasound
```

### Frontend (rendering + UI — yours to implement)
```
frontend/src/modes/ultrasound/
├── renderer.js        ← Canvas2D drawing (uses data from API)
├── simulator.js       ← Calls API, manages animation state
├── ui.js              ← Slider/control wiring helpers
└── UltrasoundMode.jsx ← React root component for this mode

frontend/src/scenarios/
├── ultrasound_cardiac.json
└── ultrasound_vascular.json
```

---

## 📦 BACKEND Deliverables

### `physics/ultrasound/waves.py`
```python
class Wave:
    def __init__(self, frequency: float, amplitude: float, speed: float): ...
    def value_at(self, x, y, source_x, source_y, t, delay, phase) -> float:
        # sinusoidal with 1/r attenuation
```

### `physics/ultrasound/delays.py`
```python
def compute_steering_delay(element_x: float, steering_angle_deg: float,
                           frequency: float, sound_speed: float) -> float: ...

def compute_focal_delay(element_x: float, focal_x: float,
                        focal_y: float, sound_speed: float) -> float: ...
```

### `physics/ultrasound/interference.py`
```python
def sum_amplitudes(elements: list, target_x: float, target_y: float, t: float) -> float: ...

def build_amplitude_grid(elements: list, grid_w: int, grid_h: int, t: float) -> list[list[float]]:
    # Returns 2D grid of amplitude values for heatmap rendering
```

### `physics/ultrasound/array_geometry.py`
```python
def build_linear_array(num_elements: int, spacing_mm: float) -> list[dict]:
    # Returns [{"x": float, "y": float}, ...]

def build_curved_array(num_elements: int, radius_mm: float, arc_deg: float) -> list[dict]: ...
```

### `models/ultrasound.py`  — Pydantic schemas
```python
class UltrasoundRequest(BaseModel):
    num_elements: int
    spacing_mm: float
    geometry: str          # "linear" | "curved"
    curvature_mm: float
    frequency: float
    sound_speed: float
    steering_angle: float
    focal_depth: float
    t: float               # current time for animation frame

class UltrasoundResponse(BaseModel):
    elements: list         # [{x, y, delay}]
    amplitude_grid: list   # 2D float array
    beam_centroid: dict    # {x, y}
    ring_states: list      # [{cx, cy, radius, opacity}]
```

### `routes/ultrasound.py` — API endpoints
```
POST /api/ultrasound/compute
  Body: UltrasoundRequest
  Returns: UltrasoundResponse
  → Computes one animation frame worth of data

POST /api/ultrasound/delays
  Body: { num_elements, spacing_mm, geometry, steering_angle, focal_depth, sound_speed }
  Returns: { delays: float[] }
  → Just the per-element delays (called on slider change)

POST /api/ultrasound/geometry
  Body: { geometry, num_elements, spacing_mm, curvature_mm }
  Returns: { elements: [{x, y}] }
  → Just the array geometry (called when array type changes)
```

---

## 📦 FRONTEND Deliverables

### `renderer.js`
```js
class UltrasoundRenderer {
  constructor(canvas) {}
  clear() {}
  drawElement(x, y, delayColor) {}           // probe element dot
  drawWavefront(cx, cy, radius, opacity) {}  // expanding ring
  drawIntensityHeatmap(grid, colormap) {}    // 'jet' or 'hot' colormap
  drawBeamLine(fromX, fromY, toX, toY) {}
  worldToCanvas(wx, wy) {}
  canvasToWorld(cx, cy) {}
  startLoop(tickCallback) {}                 // requestAnimationFrame loop, passes dt
  stopLoop() {}
}
```

### `simulator.js`
```js
// Calls the backend API every frame (or on slider change)
// Manages local animation state (ring timers, etc.)
class UltrasoundSimulator {
  constructor(apiClient) {}
  setConfig(config) {}         // triggers delay recompute via API
  async tick(t) {}             // calls POST /api/ultrasound/compute, returns render state
  async updateGeometry() {}    // calls POST /api/ultrasound/geometry
  async updateDelays() {}      // calls POST /api/ultrasound/delays
}
```

### `UltrasoundMode.jsx` — React component
- 3 side-by-side canvas panels:
  - Panel 1: Element emissions + wavefront rings
  - Panel 2: Interference heatmap
  - Panel 3: Beam profile (1D lateral intensity at focal depth)
- Control sliders (all real-time):

| Slider | Range |
|--------|-------|
| Number of elements | 4 – 128 |
| Element spacing | 0.1 – 2.0 mm |
| Frequency | 1 – 15 MHz |
| Steering angle | −60° to +60° |
| Focal depth | 10 – 200 mm |
| Array type | Linear / Curved |
| Curvature radius | 20 – 200 mm |

- Exposes `applyScenario(obj)` and `extractScenario()` via ref for Member 4's shell.

---

## 📦 Scenario JSON Files

### `ultrasound_cardiac.json`
```json
{
  "label": "Cardiac Imaging", "mode": "ultrasound", "version": "1.0",
  "arrayConfig": { "geometry": "curved", "numElements": 64, "spacing": 0.5, "curvature": 60 },
  "frequency": 3500000, "steeringAngle": 15, "focalDepth": 80, "soundSpeed": 1540
}
```

### `ultrasound_vascular.json`
```json
{
  "label": "Vascular / Carotid Imaging", "mode": "ultrasound", "version": "1.0",
  "arrayConfig": { "geometry": "linear", "numElements": 128, "spacing": 0.3, "curvature": 0 },
  "frequency": 7500000, "steeringAngle": 0, "focalDepth": 35, "soundSpeed": 1540
}
```

---

## ✅ Acceptance Checklist
- [ ] `POST /api/ultrasound/compute` returns valid data for all slider combinations
- [ ] Frontend renders 3 panels using only API response data (no local math)
- [ ] Sliders trigger API calls; canvas updates within 100ms
- [ ] Curved and linear arrays both work without crash
- [ ] `applyScenario()` / `extractScenario()` work correctly
- [ ] No physics math (sin, cos, wave equations) anywhere in the frontend files
