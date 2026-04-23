/**
 * simulator.js
 * ─────────────
 * RadarSimulator manages the animation loop and API communication.
 * It owns NO physics — it only sends state to the backend and stores results.
 *
 * Usage:
 *   const sim = new RadarSimulator()
 *   sim.setConfig({ numElements: 32, ... })
 *   sim.addTarget({ id, x, y, rcs })
 *   sim.start(renderCallback)
 *   sim.stop()
 */
import { postJSON } from '../../engine/apiClient.js'

export class RadarSimulator {
  constructor() {
    this.config = {
      numElements: 32,
      spacingM: 0.015,
      frequency: 10e9,
      sweepSpeed: 45,
      sweepMode: 'continuous',
      sectorMin: -60,
      sectorMax: 60,
      scanMode: 'phased_array',
      detectionThreshold: 0.3,
      snr: 100,
      windowType: 'rectangular',
    }
    this.targets = []           // [{ id, x, y, rcs }]
    this.sweepAngle = 0         // local angle, updated by server response
    this.lastTick = null        // timestamp for dt calculation
    this._rafId = null
    this._renderCb = null
    this.lastResponse = null    // last RadarTickResponse from backend
    this.detectionLog = []      // capped at 200 entries
  }

  setConfig(partial) { Object.assign(this.config, partial) }

  addTarget(target) {
    // target: { id?: string, x: number, y: number, rcs: number }
    // auto-generate id if missing
    const id = target.id || `t${Date.now()}`
    // Enforce cap of 5 targets — remove oldest if at capacity
    if (this.targets.length >= 5) {
      this.targets.shift()
    }
    this.targets.push({ ...target, id })
    return id
  }

  removeTarget(id) {
    this.targets = this.targets.filter(t => t.id !== id)
  }

  updateTarget(id, partial) {
    const t = this.targets.find(t => t.id === id)
    if (t) Object.assign(t, partial)
  }

  clearTargets() { this.targets = [] }

  start(renderCallback) {
    this._renderCb = renderCallback
    this.lastTick = performance.now()
    this._loop()
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = null
  }

  async _loop() {
    const now = performance.now()
    const dt = Math.min((now - this.lastTick) / 1000, 0.1)  // cap at 100ms
    this.lastTick = now

    try {
      const resp = await this._tick(dt)
      this.sweepAngle = resp.sweep_angle
      this.lastResponse = resp

      // Log detections
      resp.detections.forEach(d => {
        const entry = {
          time: new Date().toLocaleTimeString(),
          ...d,
        }
        this.detectionLog.unshift(entry)
      })
      if (this.detectionLog.length > 200) this.detectionLog.length = 200

      if (this._renderCb) this._renderCb(resp)
    } catch {
      // Backend unreachable — continue loop silently
    }

    this._rafId = requestAnimationFrame(() => this._loop())
  }

  async _tick(dt) {
    const body = {
      num_elements: this.config.numElements,
      spacing_m: this.config.spacingM,
      frequency: this.config.frequency,
      sweep_angle: this.sweepAngle,
      sweep_speed: this.config.sweepSpeed,
      sweep_mode: this.config.sweepMode,
      sector_min: this.config.sectorMin,
      sector_max: this.config.sectorMax,
      mode: this.config.scanMode,
      detection_threshold: this.config.detectionThreshold,
      snr: this.config.snr,
      window_type: this.config.windowType,
      targets: this.targets,
      dt,
    }
    return postJSON('/api/radar/tick', body)
  }

  async fetchPattern() {
    return postJSON('/api/radar/pattern', {
      num_elements: this.config.numElements,
      spacing_m: this.config.spacingM,
      frequency: this.config.frequency,
      steering_deg: this.sweepAngle,
      window_type: this.config.windowType,
      snr: this.config.snr,
    })
  }

  applyScenario(scenario) {
    if (scenario.arrayConfig) {
      this.setConfig({
        numElements: scenario.arrayConfig.numElements ?? this.config.numElements,
        spacingM: scenario.arrayConfig.spacing ?? this.config.spacingM,
      })
    }
    if (scenario.frequency) this.setConfig({ frequency: scenario.frequency })
    if (scenario.sweepRange) {
      this.setConfig({
        sectorMin: scenario.sweepRange.min,
        sectorMax: scenario.sweepRange.max,
      })
    }
    if (scenario.sweepSpeed) this.setConfig({ sweepSpeed: scenario.sweepSpeed })
    if (scenario.detectionThreshold !== undefined)
      this.setConfig({ detectionThreshold: scenario.detectionThreshold })

    this.clearTargets()
    ;(scenario.targets ?? []).forEach(t => this.addTarget(t))
  }

  extractScenario() {
    return {
      label: 'Custom Radar Scenario',
      mode: 'radar',
      version: '1.0',
      arrayConfig: {
        numElements: this.config.numElements,
        spacing: this.config.spacingM,
      },
      frequency: this.config.frequency,
      sweepRange: { min: this.config.sectorMin, max: this.config.sectorMax },
      sweepSpeed: this.config.sweepSpeed,
      detectionThreshold: this.config.detectionThreshold,
      targets: this.targets.map(({ x, y, rcs }) => ({ x, y, rcs })),
    }
  }
}
