# 👤 Member 2 — 5G Beamforming & User Tracking Mode (Fully Self-Contained)

> **Stack:** Full-Stack — Physics math + Canvas rendering + 5G logic + 5G UI  
> **Zero dependencies on other members.** You own everything needed for your mode end-to-end.

---

## 📁 Your Folder Structure

```
modes/5g/
├── physics.js       ← antenna math, beam steering, signal model (yours only)
├── renderer.js      ← canvas drawing utilities (yours only)
├── simulator.js     ← towers, users, connection logic
├── ui.js            ← control panel + interactive canvas tools
└── index.html       ← your mode's panel markup
scenarios/
└── 5g_urban.json
```

> You have your own `physics.js` and `renderer.js`. No waiting on Member 1 or anyone else.

---

## 📦 Deliverable 1 — 5G Physics Engine
**File:** `modes/5g/physics.js`

### Tasks:

- [ ] **Antenna element model**
  - `buildLinearAntenna(numElements, spacingM, centerX, centerY)` → `[{x, y}]`
  - Element spacing in meters; scale to canvas pixels via a world-to-canvas factor

- [ ] **Beam steering**
  - `computeSteeringAngle(towerX, towerY, userX, userY)` → angle in degrees
  - `computeAntennaDelay(elementX, elementY, steeringAngleDeg, frequency)` → delay in seconds
  - `arrayFactor(theta, numElements, spacingM, wavelength, steeringAngleDeg)` → normalized gain [0,1]

- [ ] **Signal model**
  - `signalStrength(towerX, towerY, userX, userY, txPower, frequency)` → dBm (free-space path loss)
  - `snr(signalDbm, noiseFloorDbm)` → SNR in dB

- [ ] **Beam width**
  - `beamWidthDeg(numElements, spacingM, wavelength)` → HPBW in degrees
  - Used to draw the visual beam lobe width on canvas

---

## 📦 Deliverable 2 — 5G Renderer
**File:** `modes/5g/renderer.js`

### Tasks:

- [ ] **`FiveGRenderer` class** wrapping a `<canvas>` element
  - `clear()`
  - `drawTower(x, y, color, label)` — antenna tower icon
  - `drawCoverageCircle(x, y, radius, color, opacity)`
  - `drawUser(x, y, id, selected, connected)` — dot + optional highlight ring
  - `drawBeamLobe(towerX, towerY, steeringAngle, beamWidthDeg, rangePixels, color)` — fan shape
  - `drawAntennaEmission(elementX, elementY, steeringAngle, phaseOffset)` — small arc per antenna
  - `drawSignalHeatmap(grid[][], bounds)` — background signal strength map
  - `worldToCanvas(wx, wy)` / `canvasToWorld(cx, cy)`

- [ ] **Animation loop**
  - `startLoop(cb)` / `stopLoop()` with `requestAnimationFrame`
  - Passes `dt` to callback

- [ ] **Beam lobe drawing**
  - Use `arrayFactor(theta)` to compute radial extent at each angle
  - Draw as a filled polygon: iterate angles in ±60° from steering, plot `gain × maxRange` as radius
  - Fill with semi-transparent tower color; stroke with solid line

---

## 📦 Deliverable 3 — 5G Simulation Logic
**Files:** `modes/5g/simulator.js`

### Tasks:

- [ ] **`Tower` class**
  - `constructor(x, y, numAntennas, coverageRadius, frequency)`
  - `getAntennaPositions()` → element array centered at tower
  - `addUser(user)` / `removeUser(user)` — manages served users list
  - `distributeAntennas()` → assigns `floor(N/K)` antennas per user (remainder to lowest SNR user)
  - `computeBeamForUser(user)` → `{ steeringAngle, beamWidth, delays[] }`

- [ ] **`MobileUser` class**
  - `constructor(x, y, id)`
  - `moveTo(x, y)` / `setVelocity(vx, vy)` / `tick(dt)`
  - `connectedTower` property (null if unconnected)

- [ ] **`FiveGSimulator` class**
  - `placeTower(x, y)` / `removeTower(id)`
  - `placeUser(x, y)` / `removeUser(id)`
  - `selectUser(id)` — marks user as keyboard-controlled
  - `tick(dt)` — moves users, runs connection logic, recomputes beams
  - Returns render state: `{ towers[], users[], beams[], heatmapDirty }`

- [ ] **Connection management**
  - User connects to nearest tower whose coverage circle contains them
  - Hysteresis: 5% margin — user must exit coverage + 5% before disconnect
  - On overlap: stays on current tower until forced disconnect
  - Fires `handoff` event `{ userId, fromTowerId, toTowerId }` on switch

- [ ] **Antenna distribution**
  - K users in range of a tower with N antennas: each gets `floor(N/K)` antennas
  - Leftover antennas go to user with lowest SNR
  - Minimum 1 antenna per user guaranteed

- [ ] **Signal heatmap** (computed every 500 ms, not every frame)
  - Grid of `signalStrength` values from all towers combined (max-of-towers per cell)
  - Returns 2D array; renderer draws it as background

---

## 📦 Deliverable 4 — 5G UI & Interaction
**File:** `modes/5g/ui.js` + `modes/5g/index.html`

### Tasks:

- [ ] **Canvas interaction toolbar** (mutually exclusive tool modes):
  - 🏗️ Place Tower — click canvas → new tower appears
  - 👤 Place User — click canvas → new user appears
  - 🗑️ Delete — click tower or user → removes it
  - 👆 Select — click user to select for keyboard movement

- [ ] **Keyboard movement** for selected user:
  - Arrow keys / WASD → move at configurable speed
  - Speed slider: 1–200 px/s equivalent

- [ ] **Auto-wander toggle** — unselected users move randomly, bounce off walls

- [ ] **Control panel sliders:**
  - Antennas per tower: 4–64
  - Coverage radius: 50–500 canvas units
  - Frequency: 1–100 GHz (affects path loss and beam width)
  - Tx power: 10–50 dBm

- [ ] **Info panel** (read-only, updates live):
  - Per user: connected tower, SNR, antennas assigned, beam angle
  - Per tower: number of active users, total antennas in use

- [ ] **Event log** — scrolling list showing handoff events with timestamp

- [ ] **Scenario load/save** (self-contained):
  - Save → extract current towers + users config → download as `.json`
  - Load → file picker → parse → recreate towers and users

---

## 📦 Deliverable 5 — Predefined Scenario
**File:** `scenarios/5g_urban.json`

```json
{
  "label": "Urban Multi-User Deployment",
  "mode": "5g",
  "towers": [
    { "x": 200, "y": 200, "numAntennas": 32, "coverageRadius": 300 },
    { "x": 600, "y": 200, "numAntennas": 32, "coverageRadius": 300 },
    { "x": 400, "y": 500, "numAntennas": 64, "coverageRadius": 400 }
  ],
  "users": [
    { "x": 250, "y": 300 },
    { "x": 550, "y": 250 },
    { "x": 380, "y": 480 },
    { "x": 450, "y": 150 }
  ],
  "frequency": 28000000000,
  "txPower": 30,
  "description": "Three 5G towers in a dense urban triangle, four users testing handoff and multi-beam allocation."
}
```

---

## ✅ Acceptance Checklist

- [ ] Mode runs at ≥ 30 FPS standalone (open `modes/5g/index.html` directly)
- [ ] Placing 3 towers + 4 users works without crash
- [ ] Two users in same tower range → 2 distinct beam lobes drawn
- [ ] Moving user out of coverage → handoff event fires and log updates
- [ ] Keyboard movement works on selected user while simulation continues
- [ ] Antenna count reassigns correctly as users enter/leave coverage
- [ ] Heatmap toggles on/off without FPS drop below 30
- [ ] Save → reload restores all towers and users at correct positions
