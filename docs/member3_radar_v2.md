# 👤 Member 3 — Radar Beamforming Mode (Fully Self-Contained)

> **Stack:** Full-Stack — Physics math + Canvas rendering + Radar logic + Radar UI  
> **Zero dependencies on other members.** You own everything needed for your mode end-to-end.

---

## 📁 Your Folder Structure

```
modes/radar/
├── physics.js       ← array factor, beam pattern, sweep math (yours only)
├── renderer.js      ← PPI display, phosphor effect, polar plots (yours only)
├── simulator.js     ← sweep engine, target detection, history
├── ui.js            ← control panel wiring
└── index.html       ← your mode's panel markup
scenarios/
└── radar_tracking.json
```

> You have your own `physics.js` and `renderer.js`. No waiting on Member 1 or anyone else.

---

## 📦 Deliverable 1 — Radar Physics Engine
**File:** `modes/radar/physics.js`

### Tasks:

- [ ] **Array factor**
  - `arrayFactor(thetaDeg, numElements, spacingM, wavelength, steeringDeg)` → normalized gain [0,1]
  - Formula: `|Σ exp(j·n·π·spacing/λ·(sin θ − sin θ₀))| / N`
  - Evaluate over full −90° to +90° range for beam pattern plotting

- [ ] **Per-element delays**
  - `computeElementDelays(numElements, spacingM, steeringDeg, frequency)` → `delay[]` in seconds
  - `delay_i = i · spacing · sin(steeringDeg·π/180) / c`

- [ ] **Beam properties**
  - `beamWidthDeg(numElements, spacingM, wavelength)` → HPBW
  - `sideLobeLevel(numElements)` → first side lobe level in dB (approx −13.5 dB for uniform)
  - `gratingLobePresent(spacingM, wavelength, steeringDeg)` → boolean

- [ ] **Simplified radar equation**
  - `receivedPower(txPower, gain, rcs, range, wavelength)` → watts
  - `isDetected(receivedPower, threshold)` → boolean

- [ ] **Beam sweep**
  - `BeamSweeper(minDeg, maxDeg, speedDegPerSec)` class
  - `tick(dt)` → updates `currentAngle`, bounces at limits
  - `getSweepAngles(currentAngle, beamWidthDeg)` → `[angleMin, angleMid, angleMax]` for lobe drawing

---

## 📦 Deliverable 2 — Radar Renderer
**File:** `modes/radar/renderer.js`

### Tasks:

- [ ] **`RadarRenderer` class** wrapping a `<canvas>` element
  - `clear(alpha)` — partial clear with alpha for phosphor trail effect
  - `drawRangeRings(numRings, maxRange)` — concentric circles with km labels
  - `drawAzimuthLines()` — N/S/E/W guides + 30° tick marks
  - `drawBeamLobe(centerAngle, gainProfile[], maxRange)` — filled polygon lobe
  - `drawTarget(x, y, detected, age)` — detection dot, size/opacity based on age
  - `drawArrayElements(elements[], currentDelays[])` — element row with color-coded delays
  - `polarToCanvas(rangePx, angleDeg)` → `{x, y}` from center

- [ ] **Phosphor trail effect**
  - Each frame: fill canvas with `rgba(0,0,0,0.03)` before drawing new content
  - Old draws fade over ~2 seconds — classic radar screen look
  - Configurable via `setFadeRate(alpha)` method

- [ ] **Polar beam pattern plot** (separate small canvas)
  - `drawPolarPattern(gainByAngle[], color)` — plots normalized gain as a polar curve
  - `overlayCurrentAngle(angleDeg)` — draws a radial marker at current sweep angle
  - Supports two overlaid patterns simultaneously (DAS vs rotating-line comparison)

- [ ] **Animation loop**
  - `startLoop(cb)` / `stopLoop()` using `requestAnimationFrame`

---

## 📦 Deliverable 3 — Radar Simulation Logic
**File:** `modes/radar/simulator.js`

### Tasks:

- [ ] **`Target` class**
  - `constructor(x, y, rcs)` — position in canvas world coords, RCS in m²
  - `id`, `lastDetectedAt`, `detectionCount`

- [ ] **`RadarSimulator` class**
  - Config: `numElements`, `spacing`, `frequency`, `sweepSpeed`, `sweepMin`, `sweepMax`
  - `addTarget(x, y, rcs)` / `removeTarget(id)` / `moveTarget(id, x, y)`
  - `setMode(mode)` — `'beamforming'` or `'rotating_line'`
  - `tick(dt)` — advances sweep, checks all targets, records detections
  - Returns render state: `{ sweepAngle, lobeGainProfile[], detectionHistory[], elements[], delays[] }`

- [ ] **Detection logic**
  - Beamforming mode: detected if `arrayFactor(targetAngle) > threshold AND receivedPower > threshold`
  - Rotating-line mode: detected if `|targetAngle − sweepAngle| < 2°`
  - Side lobe detection: possible in beamforming mode when `arrayFactor` at target > 0.3

- [ ] **Detection history ring buffer**
  - Store last 200 entries: `{ x, y, timestamp, confidence }`
  - Opacity = `1 − (now − timestamp) / fadeTime`; entries older than 3s dropped

- [ ] **Comparison mode**
  - Both modes sweep simultaneously, returning separate render states for side-by-side display

---

## 📦 Deliverable 4 — Radar UI & Controls
**File:** `modes/radar/ui.js` + `modes/radar/index.html`

### Tasks:

- [ ] **Main PPI display** — full circular radar screen in dark green theme

- [ ] **Comparison panel** (toggle button):
  - Left: beamforming radar (lobe sweep)
  - Right: rotating-line radar
  - Same targets on both simultaneously

- [ ] **Beam pattern polar plot** — small canvas below PPI showing gain curve live

- [ ] **Control sliders:** Elements (4–64), Spacing (0.1–2.0 λ), Frequency (1–100 GHz), Sweep speed (5–360 °/s), Sweep min/max angle, Detection threshold (0.1–1.0)

- [ ] **Scan mode selector:** Forward-only / Bounce / Full 360°

- [ ] **Target management:** Click PPI to place targets; per-target RCS slider; remove button

- [ ] **Info panel (live):** Current angle, beam width (°), side lobe level (dB), grating lobe warning (red when spacing > λ/2)

- [ ] **Detection log** — `[HH:MM:SS] Target #2 at 47° — DETECTED`

- [ ] **Scenario load/save** (self-contained, no dependency on other members):
  - Save → download current config as `.json`
  - Load → file picker → restore state

---

## 📦 Deliverable 5 — Predefined Scenario
**File:** `scenarios/radar_tracking.json`

```json
{
  "label": "Multi-Target Air Defense Radar",
  "mode": "radar",
  "arrayConfig": { "numElements": 32, "spacing": 0.5 },
  "frequency": 3000000000,
  "sweepRange": { "min": -60, "max": 60 },
  "sweepSpeed": 30,
  "detectionThreshold": 0.5,
  "targets": [
    { "x": 150, "y": -80, "rcs": 10 },
    { "x": -60, "y": 120, "rcs": 2 },
    { "x": 200, "y": 50,  "rcs": 25 }
  ]
}
```

---

## ✅ Acceptance Checklist

- [ ] Mode runs at ≥ 30 FPS standalone (open `modes/radar/index.html` directly)
- [ ] Beam lobe shape with visible side lobes clearly differs from the rotating line
- [ ] Phosphor trail fades over ~2 seconds correctly
- [ ] Target detected when main lobe crosses it; side lobes only at lowered threshold
- [ ] Comparison mode shows both displays side by side on identical targets
- [ ] Grating lobe warning triggers when spacing > λ/2
- [ ] Detection log populates in real time
- [ ] Save → reload restores all config and target positions exactly
- [ ] No crash when 0 targets present or all removed mid-sweep
