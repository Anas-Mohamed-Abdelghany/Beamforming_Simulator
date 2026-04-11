# 👤 Member 4 — App Shell, Backend Core, Scenario Engine, Advanced Panel & Integration

> **You own:** the FastAPI app entry point, shared backend infrastructure, the React app shell,
> shared UI components, the scenario engine, the AI vs Classical panel, and integration week.
> Physics for the Advanced panel (DAS/MVDR math) also lives in YOUR backend files.

---

## 📁 Your Files

### Backend (yours to implement)
```
backend/main.py                         ← FastAPI app, CORS, router registration
backend/app/config.py                   ← Settings, env vars

backend/physics/advanced/
├── das.py                              ← Delay-and-Sum beam pattern
├── mvdr.py                             ← MVDR/Capon adaptive weights
└── comparison.py                       ← Combined comparison + trade-off data

backend/models/scenario.py              ← Scenario Pydantic schemas
backend/models/advanced.py             ← DAS/MVDR request/response schemas

backend/routes/health.py                ← GET /health
backend/routes/scenarios.py            ← Scenario CRUD endpoints
backend/routes/advanced.py             ← DAS vs MVDR computation endpoints
```

### Frontend (yours to implement)
```
frontend/src/main.jsx                   ← ReactDOM entry point
frontend/src/App.jsx                    ← Tab navigation, mode switching, keyboard shortcuts
frontend/src/App.css                    ← Global theme, layout, CSS variables
frontend/src/index.css                  ← Reset/base

frontend/src/components/
├── LabeledSlider.jsx
├── ToggleGroup.jsx
├── CollapsiblePanel.jsx
├── StatusBar.jsx
├── ToastNotification.jsx
├── ModalOverlay.jsx
└── index.js                            ← Re-exports all components

frontend/src/engine/
├── apiClient.js                        ← Centralized fetch wrapper for all API calls
├── scenario.js                         ← Scenario registry, file I/O, validation
└── multi_array.js                      ← Multi-array manager (mode-agnostic)

frontend/src/advanced/
└── AiVsClassicalPanel.jsx              ← Calls backend, renders polar comparison

frontend/src/scenarios/
└── 5g_suburb.json                      ← Your predefined scenario
```

---

## 📦 BACKEND Deliverables

### `main.py` — FastAPI app
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# Import and include all routers: health, ultrasound, fiveg, radar, scenarios, advanced
# Set up CORS for frontend origin (http://localhost:5173)
```

### `app/config.py` — Settings
```python
from pydantic_settings import BaseSettings
class Settings(BaseSettings):
    APP_ENV: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    class Config:
        env_file = ".env"
settings = Settings()
```

### `physics/advanced/das.py`
```python
def das_pattern(num_elements: int, spacing_m: float,
                wavelength: float, steering_deg: float,
                angle_range=(-90, 90), steps=360) -> list[dict]:
    # Delay-and-Sum: uniform weights, computes |AF(θ)|² at each angle
    # Returns [{angle: float, gain: float}]
    # Document: wide beam, high side lobes, O(N) cost, real-time capable
```

### `physics/advanced/mvdr.py`
```python
def mvdr_weights(steering_vec: list, noise_power: float,
                 num_elements: int) -> list[complex]:
    # Simplified MVDR: R = I * noise_power (identity covariance)
    # w = R⁻¹ · a / (aᴴ · R⁻¹ · a)
    # Document: adaptive weights, suppresses interference, needs matrix inversion

def mvdr_pattern(num_elements: int, spacing_m: float, wavelength: float,
                 steering_deg: float, noise_power: float,
                 angle_range=(-90, 90), steps=360) -> list[dict]:
    # Returns [{angle: float, gain: float}]
```

### `physics/advanced/comparison.py`
```python
def theoretical_beam_width(num_elements: int, spacing_m: float,
                           wavelength: float, steering_deg: float) -> float:
    # Formula: 0.886 * λ / (N * d * cos(θ)) in degrees

def grating_lobe_angles(spacing_m: float, wavelength: float,
                        steering_deg: float) -> list[float]:
    # Returns angles where grating lobes appear (when spacing > λ/2)

def comparison_table() -> list[dict]:
    # Returns structured trade-off data for DAS / MVDR / AI methods
```

### `models/advanced.py` — Pydantic schemas
```python
class AdvancedRequest(BaseModel):
    num_elements: int
    spacing_m: float
    frequency: float
    steering_deg: float
    noise_power: float = 1.0

class AdvancedResponse(BaseModel):
    das_pattern: list         # [{angle, gain}]
    mvdr_pattern: list        # [{angle, gain}]
    beam_width_das: float
    beam_width_mvdr: float
    grating_lobe_angles: list[float]
    comparison_table: list[dict]
```

### `models/scenario.py` — Pydantic schemas
```python
class ScenarioBase(BaseModel):
    label: str
    mode: str   # "ultrasound" | "5g" | "radar"
    version: str = "1.0"
    data: dict  # mode-specific payload
```

### `routes/health.py`
```
GET /health → { "status": "ok", "version": "1.0" }
```

### `routes/scenarios.py`
```
GET    /api/scenarios           → list all scenarios
GET    /api/scenarios/{id}      → get one
POST   /api/scenarios           → save scenario (body: ScenarioBase)
DELETE /api/scenarios/{id}      → delete
```

### `routes/advanced.py`
```
POST /api/advanced/compare
  Body: AdvancedRequest
  Returns: AdvancedResponse
  → Computes DAS and MVDR patterns + comparison data in one call
```

---

## 📦 FRONTEND Deliverables

### `engine/apiClient.js`
```js
// Centralized fetch wrapper — all API calls go through here
const API_BASE = import.meta.env.VITE_API_BASE_URL

export async function post(endpoint, body) {}  // POST with JSON body
export async function get(endpoint) {}          // GET request

// Pre-built helpers used by all mode simulators:
export const ultrasoundApi = {
  compute: (body) => post('/ultrasound/compute', body),
  delays:  (body) => post('/ultrasound/delays', body),
  geometry:(body) => post('/ultrasound/geometry', body),
}
export const fivegApi = {
  tick:    (body) => post('/5g/tick', body),
  heatmap: (body) => post('/5g/heatmap', body),
}
export const radarApi = {
  tick:    (body) => post('/radar/tick', body),
  pattern: (body) => post('/radar/pattern', body),
}
export const advancedApi = {
  compare: (body) => post('/advanced/compare', body),
}
```

### `engine/scenario.js`
```js
// Validation
function validateScenario(obj) {}  // → { valid, errors[] }

// Serialization
function scenarioToJSON(obj) {}    // → pretty JSON string
function scenarioFromJSON(str) {}  // → validated object or throws

// Browser file I/O
function downloadScenario(scenario, filename) {}  // Blob download
function uploadScenario() {}                      // → Promise<scenario>

class ScenarioRegistry {
  register(scenario) {}
  getAll() {}
  getByMode(mode) {}   // 'ultrasound' | '5g' | 'radar'
}
```

### `engine/multi_array.js`
```js
class ArrayUnit {
  constructor(id, x, y, orientationDeg, config) {}
  setSteeringAngle(deg) {}
}

class MultiArrayManager {
  addUnit(x, y, orientationDeg, config) {}  // → id
  removeUnit(id) {}
  getUnits() {}
  onCanvasClick(x, y) {}   // → places unit, returns id
  onCanvasDrag(id, x, y) {} // → moves unit
}
```

### Shared Components (`components/`)

```jsx
// LabeledSlider.jsx
// Props: label, min, max, step, unit, value, onChange (debounced 16ms)
export function LabeledSlider({ label, min, max, step, unit, value, onChange }) {}

// ToggleGroup.jsx
// Props: options (string[]), selected, onChange
export function ToggleGroup({ options, selected, onChange }) {}

// CollapsiblePanel.jsx
// Props: title, children
export function CollapsiblePanel({ title, children }) {}

// StatusBar.jsx — fixed bottom bar: Mode | FPS | Elements | Beam angle
export function StatusBar({ mode, elementCount, beamAngle }) {}

// ToastNotification.jsx — Props: message, duration (ms)
export function ToastNotification({ message, duration }) {}

// ModalOverlay.jsx — Props: title, children, isOpen, onClose
export function ModalOverlay({ title, children, isOpen, onClose }) {}
```

### CSS Theme in `App.css`
```css
:root {
  --color-primary: #00c8ff;
  --color-accent:  #ff6b35;
  --bg-dark:       #0d1117;
  --bg-panel:      #161b22;
  --text:          #e6edf3;
  --text-dim:      #8b949e;
}
```

### `App.jsx` — App Shell
- Top nav: `Ultrasound | 5G | Radar | Advanced` tabs
- Left sidebar 280px (scrollable), main canvas area fills rest
- Mode switching: hides/shows mode containers; persists to `localStorage`
- Keyboard shortcuts: `1/2/3` switch modes, `Space` pause, `R` reset, `P` perf HUD, `?` help
- Performance HUD overlay (FPS, canvas resolution)
- Plugin interface:
```js
App.registerMode({ id, label, start(), stop(), reset(), applyScenario(), extractScenario() })
```

### `advanced/AiVsClassicalPanel.jsx`
- Calls `POST /api/advanced/compare` on every slider change
- Renders polar plot canvas: DAS (blue) vs MVDR (orange) overlaid
- Sliders: Elements (4–32), Spacing, Steering angle, Noise power
- Beam width formula result shown live
- Grating lobe demo (highlights appear when spacing > λ/2)
- Comparison table (styled HTML): DAS vs MVDR vs AI/DL

### `scenarios/5g_suburb.json`
```json
{
  "label": "Suburban Coverage & Handoff Test", "mode": "5g", "version": "1.0",
  "towers": [
    { "x": 100, "y": 300, "numAntennas": 16, "coverageRadius": 250 },
    { "x": 500, "y": 300, "numAntennas": 16, "coverageRadius": 250 }
  ],
  "users": [{ "x": 290, "y": 310 }, { "x": 310, "y": 290 }],
  "frequency": 3500000000, "txPower": 30
}
```

---

## 📦 Integration Week Tasks
- [ ] Register all 3 modes in `App.jsx` via `App.registerMode(...)`
- [ ] Wire scenario engine: preload all 5 JSONs into `ScenarioRegistry` on app startup
- [ ] Confirm each mode's `applyScenario()` / `extractScenario()` round-trips cleanly
- [ ] Wire multi-array module into Ultrasound as optional "Add Unit" button
- [ ] Verify all backend routes return 200 for happy-path inputs
- [ ] Create `docs/KNOWN_ISSUES.md` for any remaining bugs

---

## ✅ Acceptance Checklist
- [ ] `GET /health` returns 200
- [ ] `POST /api/advanced/compare` returns both DAS and MVDR patterns
- [ ] `GET /api/scenarios` returns array (even if empty, not 500)
- [ ] CORS allows `http://localhost:5173`
- [ ] All 6 shared components render without errors
- [ ] `apiClient.js` used by all mode simulators (no raw fetch() calls in mode files)
- [ ] `App.jsx` renders all 4 tabs before modes are wired in
- [ ] All 5 scenario JSONs load via `ScenarioRegistry` without validation errors
