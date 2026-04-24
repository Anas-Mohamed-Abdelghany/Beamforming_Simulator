# 👤 Member 1 — Ultrasound Beamforming Mode (Fully Self-Contained)

> **Stack:** Full-Stack — Physics math + Canvas rendering + Ultrasound UI + Ultrasound logic  
> **Zero dependencies on other members.** You own everything needed for your mode end-to-end.

---

## 📁 Your Folder Structure

```
modes/ultrasound/
├── physics.js       ← wave math, delays, interference (yours only)
├── renderer.js      ← canvas drawing utilities (yours only)
├── simulator.js     ← simulation logic
├── ui.js            ← control panel wiring
└── index.html       ← your mode's panel markup
scenarios/
└── ultrasound_cardiac.json
└── ultrasound_vascular.json
```

> Other members have their own `physics.js` and `renderer.js` inside their own folders. No sharing, no waiting.

---

## 📦 Deliverable 1 — Ultrasound Physics Engine
**File:** `modes/ultrasound/physics.js`

### Tasks:

- [ ] **Wave class**
  - `Wave(frequency, amplitude, speed)` — sinusoidal propagation
  - `valueAt(x, y, sourceX, sourceY, t, delay, phase)` → amplitude at point with attenuation `1/r`

- [ ] **Delay calculator**
  - `computeSteeringDelay(elementX, steeringAngleDeg, frequency, soundSpeed)` → seconds
  - `computeFocalDelay(elementX, focalX, focalY, soundSpeed)` → seconds for focus mode

- [ ] **Interference engine**
  - `sumAmplitudes(elements[], targetX, targetY, t)` → superimposed value at a grid point
  - `buildAmplitudeGrid(elements[], gridW, gridH, t)` → 2D array of amplitudes for heatmap

- [ ] **Array geometry**
  - `buildLinearArray(numElements, spacingMm)` → `[{x, y}]` in mm
  - `buildCurvedArray(numElements, radiusMm, arcDeg)` → `[{x, y}]` in mm

---

## 📦 Deliverable 2 — Ultrasound Renderer
**File:** `modes/ultrasound/renderer.js`

### Tasks:

- [ ] **`UltrasoundRenderer` class** wrapping a `<canvas>` element
  - `clear()`
  - `drawElement(x, y, delayColor)` — probe element dot
  - `drawWavefront(cx, cy, radius, opacity)` — expanding ring
  - `drawIntensityHeatmap(amplitudeGrid[][], colormap)` — fill canvas with color-mapped values
  - `drawBeamLine(fromX, fromY, toX, toY, intensity)` — thick focused beam
  - `worldToCanvas(wx, wy)` / `canvasToWorld(cx, cy)` — coordinate mapping

- [ ] **Animation loop**
  - `startLoop(tickCallback)` / `stopLoop()` using `requestAnimationFrame`
  - Passes `dt` (delta time in seconds) to the callback

- [ ] **Colormaps** — implement `jet` and `hot` as value→`rgba` functions

---

## 📦 Deliverable 3 — Ultrasound Simulation Logic
**File:** `modes/ultrasound/simulator.js`

### Tasks:

- [ ] **`UltrasoundSimulator` class**
  - Config: `numElements`, `spacing`, `geometry`, `frequency`, `soundSpeed`, `steeringAngle`, `focalDepth`
  - `setGeometry(type, n, spacing, curvature)` — rebuilds element array
  - `computeDelays()` — per-element firing delays
  - `tick(t)` — updates wavefront ring radii, returns render state

- [ ] **Wavefront animation state**
  - Each element emits a new ring every period `T = 1/f` (capped visually at ~10 Hz)
  - Ring radius grows at `soundSpeed × time_since_emit`
  - Rings fade linearly from opacity 0.8 → 0 over one wavelength of travel

- [ ] **Beam formation**
  - Evaluate `buildAmplitudeGrid` on a 200×150 tissue volume every frame
  - Find beam centroid (max amplitude column) for overlay line

- [ ] **Three synchronized panel states** returned from `tick()`:
  1. Element positions + current ring radii + delays (for element panel)
  2. Amplitude grid (for interference panel)
  3. Beam centroid path (for beam profile panel)

---

## 📦 Deliverable 4 — Ultrasound UI & Controls
**File:** `modes/ultrasound/ui.js` + `modes/ultrasound/index.html`

### Tasks:

- [ ] **Three side-by-side canvas panels:**
  1. Element emissions (probe + wavefronts)
  2. Interference heatmap (tissue volume)
  3. Beam profile (1D lateral intensity at focal depth)

- [ ] **Control sliders** (all real-time, no submit button):
  - Number of elements: 4–128
  - Element spacing: 0.1–2.0 mm
  - Frequency: 1–15 MHz
  - Steering angle: −60° to +60°
  - Focal depth: 10–200 mm
  - Array type toggle: Linear / Curved → reveals curvature radius slider (20–200 mm)

- [ ] **Scenario load/save** (self-contained, no dependency on Member 4):
  - "Save" → `JSON.stringify(currentConfig)` → download as `.json`
  - "Load" → file picker → `JSON.parse` → apply to controls

---

## 📦 Deliverable 5 — Predefined Scenarios
**Files:** `scenarios/ultrasound_cardiac.json`, `scenarios/ultrasound_vascular.json`

```json
// ultrasound_cardiac.json
{
  "label": "Cardiac Imaging",
  "mode": "ultrasound",
  "arrayConfig": { "geometry": "curved", "numElements": 64, "spacing": 0.5, "curvature": 60 },
  "frequency": 3500000, "steeringAngle": 15, "focalDepth": 80, "soundSpeed": 1540
}

// ultrasound_vascular.json
{
  "label": "Vascular / Carotid Imaging",
  "mode": "ultrasound",
  "arrayConfig": { "geometry": "linear", "numElements": 128, "spacing": 0.3, "curvature": 0 },
  "frequency": 7500000, "steeringAngle": 0, "focalDepth": 35, "soundSpeed": 1540
}
```

---

## ✅ Acceptance Checklist

- [ ] Mode runs at ≥ 30 FPS standalone (open `modes/ultrasound/index.html` directly)
- [ ] All 3 panels update in sync on every slider change
- [ ] Wavefront rings visibly shift phase with steering angle changes
- [ ] Curved and linear arrays both render without crash
- [ ] Save → re-load restores all control values exactly
- [ ] No errors when elements = 4 (minimum) or 128 (maximum)
