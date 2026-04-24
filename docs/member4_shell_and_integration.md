# 👤 Member 4 — App Shell, Scenario System, Multi-Array & Advanced Features

> **Stack:** Full-Stack — App navigation + Shared UI components + Scenario engine + Multi-array logic + AI vs Classical panel + Integration coordinator  
> **Zero dependencies on other members during development.** Each mode plugs into your shell via a simple interface on integration day.

---

## 📁 Your Folder Structure

```
app/
├── index.html       ← main entry point, mode switcher, layout shell
├── app.js           ← navigation, keyboard shortcuts, performance HUD
├── app.css          ← global theme, layout, shared component styles
├── components.js    ← reusable UI components (shared with all modes)
engine/
├── scenario.js      ← scenario file engine (load, save, validate, registry)
├── multi_array.js   ← multi-array manager (mode-agnostic)
advanced/
├── ai_vs_classical.js        ← MVDR vs DAS comparison logic
└── ai_vs_classical_panel.js  ← interactive comparison UI
scenarios/
└── 5g_suburb.json   ← your own predefined scenario (4th scenario)
```

> You do **not** write physics or rendering code. Your work is architecture, UX, and the advanced analysis panel.

---

## 📦 Deliverable 1 — Shared UI Component Library
**Files:** `app/components.js` + `app/app.css`  
**No dependencies on any other member.**

Other members can optionally import these. They are not required to — but having them ready means a unified look on integration day.

### Tasks:

- [ ] **`LabeledSlider(label, min, max, step, unit, value, onChange)`**
  - Factory function returning a `<div>` DOM node (no framework)
  - Shows: label · current value with unit · range input in one row
  - Change events debounced to 16 ms

- [ ] **`ToggleGroup(options[], selected, onChange)`**
  - Segmented button bar; active option highlighted
  - Emits selected string on click

- [ ] **`CollapsiblePanel(title, contentEl)`**
  - Header with chevron; click toggles body with CSS transition

- [ ] **`StatusBar()`**
  - Fixed bottom bar: current mode name | FPS | active elements count | beam angle
  - FPS computed from `requestAnimationFrame` timestamps every 500 ms

- [ ] **`ToastNotification(message, duration)`**
  - Slide-in toast, auto-dismiss after `duration` ms (default 3000)

- [ ] **`ModalOverlay(title, contentEl)`**
  - `open()` / `close()` API; backdrop click closes

- [ ] **CSS theme variables**
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
  - All components use only these variables — one place to change the whole theme

---

## 📦 Deliverable 2 — App Shell & Navigation
**Files:** `app/index.html`, `app/app.js`, `app/app.css`  
**No dependencies on mode logic.**

### Tasks:

- [ ] **Layout**
  - Top nav bar: `Ultrasound | 5G | Radar | Advanced` tabs
  - Left sidebar: 280 px, scrollable controls panel per mode
  - Center: main canvas area (fills remaining width)
  - On screens < 900 px: sidebar collapses to icon rail

- [ ] **Mode switching**
  - Clicking a tab hides all mode containers, shows selected one
  - Active mode persists in `localStorage` — refresh restores last mode
  - Mode switch fires `CustomEvent('modechange', { detail: { mode } })` — modes listen and pause/resume their animation loops

- [ ] **Keyboard shortcuts**
  - `1` / `2` / `3` → switch modes
  - `Space` → pause/resume current mode animation
  - `R` → reset current mode to defaults
  - `P` → toggle performance HUD overlay
  - `?` → show shortcuts cheat sheet in `ModalOverlay`

- [ ] **Performance HUD** (`P` key)
  - Overlay: FPS, active wave count, canvas resolution, memory estimate

- [ ] **Mode plugin interface** — each mode registers itself:
  ```js
  // Each mode calls this on load:
  App.registerMode({
    id: 'ultrasound',         // matches tab id
    label: 'Ultrasound',
    start() {},               // called when tab becomes active
    stop() {},                // called when tab is hidden
    reset() {},               // R key
    applyScenario(s) {},      // load scenario into this mode
    extractScenario() {}      // get current state as scenario object
  });
  ```
  - App shell calls these hooks; mode internals stay encapsulated
  - Each mode registers itself independently — no ordering dependency

---

## 📦 Deliverable 3 — Scenario File Engine
**File:** `engine/scenario.js`  
**No dependencies on any other member.**

### Tasks:

- [ ] **Schema validation**
  ```js
  function validateScenario(obj) {} // returns { valid: bool, errors: string[] }
  // Required fields: label, mode, arrayConfig, frequency
  // mode must be: 'ultrasound' | '5g' | 'radar'
  ```

- [ ] **Serialization**
  - `scenarioToJSON(obj)` → pretty-printed JSON string with `"version": "1.0"`
  - `scenarioFromJSON(str)` → validated object or throws descriptive error

- [ ] **Browser file I/O** (no server needed)
  - `downloadScenario(scenario, filename)` → triggers browser download via `Blob`
  - `uploadScenario()` → `Promise<scenario>` using `<input type="file">` + `FileReader`

- [ ] **Scenario registry**
  ```js
  class ScenarioRegistry {
    register(scenario) {}        // add to in-memory list
    getAll() {}                  // all scenarios
    getByMode(mode) {}           // filtered by mode string
    getByLabel(label) {}         // single lookup
    remove(label) {}
  }
  ```

- [ ] **Preload built-in scenarios** at app startup:
  - `scenarios/ultrasound_cardiac.json` (Member 1)
  - `scenarios/ultrasound_vascular.json` (Member 1)
  - `scenarios/5g_urban.json` (Member 2)
  - `scenarios/radar_tracking.json` (Member 3)
  - `scenarios/5g_suburb.json` (yours — see below)

- [ ] **Scenario UI** (wired into `ModalOverlay`):
  - "Load Scenario" button → modal listing all registered scenarios grouped by mode
  - Click a scenario → calls `App.currentMode.applyScenario(scenario)`
  - "Save Scenario" → prompts for label → calls `App.currentMode.extractScenario()` → download

---

## 📦 Deliverable 4 — Your Predefined Scenario
**File:** `scenarios/5g_suburb.json`

```json
{
  "label": "Suburban Coverage & Handoff Test",
  "mode": "5g",
  "version": "1.0",
  "towers": [
    { "x": 100, "y": 300, "numAntennas": 16, "coverageRadius": 250 },
    { "x": 500, "y": 300, "numAntennas": 16, "coverageRadius": 250 }
  ],
  "users": [
    { "x": 290, "y": 310 },
    { "x": 310, "y": 290 }
  ],
  "frequency": 3500000000,
  "txPower": 30,
  "description": "Two overlapping suburban towers. Users near the handoff boundary demonstrate connection persistence and switching behavior."
}
```

---

## 📦 Deliverable 5 — Multi-Array Support Module
**File:** `engine/multi_array.js`  
**No dependencies on other members.**

All three modes can optionally use this to support placing multiple independent phased array units.

### Tasks:

- [ ] **`ArrayUnit` class**
  ```js
  class ArrayUnit {
    constructor(id, x, y, orientationDeg, config) {}
    setSteeringAngle(deg) {}
    getElements() {}                      // [{x, y, delay, phase}]
    getBeamContribution(px, py, t) {}    // amplitude contribution at point
  }
  ```

- [ ] **`MultiArrayManager` class**
  ```js
  class MultiArrayManager {
    addUnit(x, y, orientationDeg, config) {}  // returns id
    removeUnit(id) {}
    getUnits() {}
    getCombinedAmplitude(px, py, t) {}        // sum of all units
    tick(dt) {}
  }
  ```

- [ ] **Canvas interaction helper**
  - `onCanvasClick(x, y)` → places new unit at clicked position, returns unit id
  - `onCanvasDrag(id, x, y)` → moves unit; returns updated unit
  - Returns events only — no DOM manipulation

- [ ] **Visual helper**
  - `drawUnit(ctx, unit, selected)` — draws element row + orientation arrow using raw Canvas2D
  - Each unit gets a color from a 6-color palette; selected unit gets bounding box

---

## 📦 Deliverable 6 — Advanced: AI vs Classical Beamforming Panel
**Files:** `advanced/ai_vs_classical.js`, `advanced/ai_vs_classical_panel.js`  
**No dependencies on any other member.** Uses Canvas2D directly.

### Tasks:

#### Research documentation (in-code JSDoc + UI tooltips)

- [ ] Document **Delay-and-Sum (DAS)**: uniform weighting, wide beam, high side lobes, real-time capable
- [ ] Document **MVDR / Capon**: adaptive weights suppress interference, narrower beam, needs matrix inversion
- [ ] Document **AI-based methods**: DL for DOA estimation, RL for 5G beam management — trade-offs in latency and training data

#### Simulated MVDR implementation

- [ ] `mvdrWeights(steeringVec, noisePower, numElements)` → complex weight array
  - Simplified: `w = R⁻¹ · a / (aᴴ · R⁻¹ · a)` where `R = I·noisePower` (identity covariance)
  - Apply weights to modify `arrayFactor` computation

- [ ] `dasPattern(numElements, spacing, wavelength, steeringDeg)` → `{angle, gain}[]`
- [ ] `mvdrPattern(numElements, spacing, wavelength, steeringDeg, noisePower)` → `{angle, gain}[]`

#### Interactive comparison widget (Canvas2D polar plot)

- [ ] Polar plot canvas showing DAS (blue) vs MVDR (orange) beam patterns overlaid
- [ ] Sliders: elements (4–32), spacing, steering angle, noise power
- [ ] All patterns update in real time on slider change

#### Configuration trade-off explorer

- [ ] **Beam width scaling** — slider for N elements → shows `0.886λ / (N·d·cos θ)` formula result live
- [ ] **Grating lobe demo** — slider for spacing → shows grating lobes appear when `d > λ/2`
- [ ] **Side lobe level** — slider for N → shows first SLL in dB

#### Comparison table (rendered as styled HTML)

| Criterion | Delay-and-Sum | MVDR/Capon | AI/DL-based |
|-----------|:---:|:---:|:---:|
| Beam width | Wide | Narrow | Adaptive |
| Side lobe level | Moderate | Low | Very low |
| Interference rejection | Poor | Excellent | Context-dependent |
| Computational cost | Low | Medium | High |
| Needs training data | No | No | Yes |
| Real-time capable | Yes | Yes (small arrays) | Hardware-dependent |
| Model error robustness | High | Medium | High (if well-trained) |

---

## 📦 Deliverable 7 — Integration Week
**Role:** Merge coordinator. You merge all branches and validate the complete system.

### Integration tasks:

- [ ] **Wire all modes into app shell**
  - Each mode calls `App.registerMode({...})` — confirm hooks work for all three
  - Test `start()` / `stop()` on tab switch; confirm animation loops pause correctly

- [ ] **Wire scenario system**
  - Confirm each mode implements `applyScenario()` and `extractScenario()`
  - Test all 5 predefined scenarios load without errors

- [ ] **Wire multi-array** into at least Ultrasound mode as optional "Add Unit" button

- [ ] **Wire shared UI components** — replace any plain `<input>` fallbacks in modes 1–3 with `LabeledSlider` etc. (only if time allows; functional first)

- [ ] **End-to-end test checklist** (`tests/integration_checklist.md`):
  - All 3 modes switch without console errors
  - All 5 scenarios load and restore state
  - FPS ≥ 30 in all modes under normal load
  - Keyboard shortcuts work from any mode
  - Save → upload scenario round-trip works

- [ ] **Bug triage** — fix cross-module bugs; document remaining issues in `KNOWN_ISSUES.md`

---

## ✅ Acceptance Checklist

- [ ] App shell loads all 3 mode containers on startup with no console errors
- [ ] Mode tabs switch instantly; animation loops pause/resume correctly
- [ ] All 5 scenario JSONs pass `validateScenario()` without errors
- [ ] Download + re-upload of a custom scenario restores state exactly
- [ ] MVDR polar pattern visibly narrower than DAS pattern in comparison panel
- [ ] Grating lobe explorer shows lobes appearing when slider crosses λ/2
- [ ] `MultiArrayManager` correctly sums contributions from 2 units
- [ ] Integration checklist fully passed
- [ ] `KNOWN_ISSUES.md` completed honestly
