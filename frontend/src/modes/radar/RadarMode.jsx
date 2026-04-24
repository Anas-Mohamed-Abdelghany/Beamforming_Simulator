/**
 * RadarMode.jsx
 * ─────────────
 * Main React component for the Radar Beamforming Simulator.
 *
 * Layout (three-column):
 *   LEFT SIDEBAR  (320px) — 7 parameter sliders + controls
 *   CENTRE        — PPI canvas + polar pattern
 *   RIGHT PANEL   (280px) — readouts + detection log + target cards
 */

import {
  useState, useEffect, useRef, useCallback,
  forwardRef, useImperativeHandle,
} from 'react'
import { RadarSimulator } from './simulator.js'
import { RadarRenderer, PolarPatternRenderer } from './renderer.js'
import { formatFrequency, formatRange, formatDbm, formatRcs } from './ui.js'
import { radarLockSize } from '../m3_radar/radar_api.js'
import radarScenario from '../../scenarios/radar_tracking.json'

/* ── Window types ────────────────────────────────────────────────────────── */
const WINDOW_TYPES = [
  'rectangular', 'hamming', 'hanning', 'blackman', 'kaiser', 'chebyshev', 'taylor',
]

/* ── Slider meta ─────────────────────────────────────────────────────────── */
const PARAMS = [
  { key: 'numElements', label: 'Elements (N)', min: 4, max: 128, step: 1, fmt: v => `${v}` },
  { key: 'spacingM', label: 'Spacing (d)', min: 0.005, max: 0.05, step: 0.001, fmt: v => `${v.toFixed(3)} m` },
  { key: 'frequency', label: 'Pulse Freq', min: 1e9, max: 24e9, step: 1e9, fmt: v => formatFrequency(v) },
  { key: 'sweepSpeed', label: 'Sweep Speed', min: 5, max: 360, step: 1, fmt: v => `${v}°/s` },
  { key: 'detectionThreshold', label: 'Threshold', min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
  { key: 'snr', label: 'Local SNR', min: 0, max: 1000, step: 1, fmt: v => `${v}` },
]

/* ── Main component ──────────────────────────────────────────────────────── */
const RadarMode = forwardRef(function RadarMode(_props, ref) {
  /* ── Refs ──────────────────────────────────────────────────────────────── */
  const simRef = useRef(null)
  const ppiCanvasRef = useRef(null)
  const ppiCanvas2Ref = useRef(null)
  const polarCanvasRef = useRef(null)
  const ppiRendererRef = useRef(null)
  const ppiRenderer2Ref = useRef(null)
  const polarRendererRef = useRef(null)

  // Render state (updated per frame, not React state)
  const renderState = useRef({
    sweepAngle: 0,
    gainProfile: [],
    detections: [],
    delays: [],
    beamWidth: 0,
    sll: -13.26,
    gratingWarning: false,
    targetDetectionTimes: {},  // { targetId: timestamp }
  })

  /* ── React state (updated at ≤4 Hz) ────────────────────────────────────── */
  const [config, setConfig] = useState({
    numElements: 32,
    spacingM: 0.015,
    frequency: 10e9,
    sweepSpeed: 45,
    detectionThreshold: 0.3,
    snr: 100,
    windowType: 'rectangular',
    scanMode: 'phased_array',
    sweepMode: 'continuous',
    sectorMin: -60,
    sectorMax: 60,
  })
  const [readouts, setReadouts] = useState({
    sweepAngle: 0, beamWidth: 0, sll: -13.26,
    gratingWarning: false, activeTargets: 0, detectionsCount: 0,
  })
  const [targets, setTargets] = useState([])
  const [logEntries, setLogEntries] = useState([])
  const [compareMode, setCompareMode] = useState(false)
  const [lockState, setLockState] = useState({})       // { targetId: { locked, consecutive, sizeCategory, narrowBW } }
  const detectionCountsRef = useRef({})                 // { targetId: consecutiveDetections }

  /* ── Imperative handle for scenario support ─────────────────────────── */
  useImperativeHandle(ref, () => ({
    applyScenario: (scenario) => {
      const sim = simRef.current
      if (!sim) return
      sim.applyScenario(scenario)
      setTargets([...sim.targets])
      setConfig({
        numElements: sim.config.numElements,
        spacingM: sim.config.spacingM,
        frequency: sim.config.frequency,
        sweepSpeed: sim.config.sweepSpeed,
        detectionThreshold: sim.config.detectionThreshold,
        snr: sim.config.snr,
        windowType: sim.config.windowType,
        scanMode: sim.config.scanMode,
        sweepMode: sim.config.sweepMode,
        sectorMin: sim.config.sectorMin,
        sectorMax: sim.config.sectorMax,
      })
    },
    extractScenario: () => simRef.current?.extractScenario(),
  }))

  /* ── Initialise simulator ──────────────────────────────────────────────── */
  useEffect(() => {
    const sim = new RadarSimulator()
    simRef.current = sim
    return () => sim.stop()
  }, [])

  /* ── Initialise renderers & start loop ─────────────────────────────────── */
  useEffect(() => {
    const sim = simRef.current
    if (!sim) return

    // Setup main PPI canvas
    if (ppiCanvasRef.current) {
      const c = ppiCanvasRef.current
      c.width = c.offsetWidth * (window.devicePixelRatio || 1)
      c.height = c.offsetHeight * (window.devicePixelRatio || 1)
      ppiRendererRef.current = new RadarRenderer(c, 300)
    }

    // Setup compare PPI canvas
    if (ppiCanvas2Ref.current) {
      const c = ppiCanvas2Ref.current
      c.width = c.offsetWidth * (window.devicePixelRatio || 1)
      c.height = c.offsetHeight * (window.devicePixelRatio || 1)
      ppiRenderer2Ref.current = new RadarRenderer(c, 300)
    }

    // Setup polar canvas
    if (polarCanvasRef.current) {
      const c = polarCanvasRef.current
      c.width = c.offsetWidth * (window.devicePixelRatio || 1)
      c.height = c.offsetHeight * (window.devicePixelRatio || 1)
      polarRendererRef.current = new PolarPatternRenderer(c)
    }

    // Render callback — called per frame by the simulator
    const renderCb = (resp) => {
      const rs = renderState.current
      rs.sweepAngle = resp.sweep_angle
      rs.gainProfile = resp.gain_profile
      rs.detections = resp.detections
      rs.delays = resp.delays
      rs.beamWidth = resp.beam_width
      rs.sll = resp.side_lobe_level_db
      rs.gratingWarning = resp.grating_lobe_warning

      // Track detection times AND consecutive detection counts for Lock-and-Size
      const now = Date.now()
      const counts = detectionCountsRef.current
      const detectedIds = new Set(resp.detections.map(d => d.target_id))

      // Update consecutive counts
      const sim = simRef.current
      if (sim) {
        sim.targets.forEach(t => {
          if (detectedIds.has(t.id)) {
            counts[t.id] = (counts[t.id] || 0) + 1
          } else {
            // Reset after missing a sweep cycle (if angle wrapped)
            const lastAngle = rs.sweepAngle
            // Only reset if a full sweep cycle passed without detection
            if (counts[t.id] && counts[t.id] > 0) {
              // Keep count — only reset when explicitly not in beam
            }
          }
        })
      }

      resp.detections.forEach(d => {
        rs.targetDetectionTimes[d.target_id] = now
      })

      // Draw main PPI
      const ppi = ppiRendererRef.current
      if (ppi) {
        ppi.fadeFrame(0.04)
        ppi.drawRangeRings(5)
        ppi.drawAzimuthLines()
        ppi.drawBeamLobe(resp.gain_profile, 'rgba(139,92,246,0.25)')
        ppi.drawSweepLine(resp.sweep_angle)

        // Draw targets
        const sim = simRef.current
        if (sim) {
          const detectedIds = new Set(resp.detections.map(d => d.target_id))
          sim.targets.forEach(t => {
            const detected = detectedIds.has(t.id)
            const lastDetect = rs.targetDetectionTimes[t.id] || 0
            const age = now - lastDetect
            ppi.drawTarget(t.x, t.y, detected || age < 3000, t.rcs, detected ? 0 : age)
          })
        }

        // Draw array elements
        if (resp.delays && resp.delays.length > 0) {
          ppi.drawArrayElements(
            sim.config.numElements, sim.config.spacingM, resp.delays
          )
        }
      }

      // Draw polar pattern
      const pp = polarRendererRef.current
      if (pp) {
        pp.clear()
        pp.drawPolarPattern(resp.gain_profile, '#8b5cf6')
        pp.overlayCurrentAngle(resp.sweep_angle)
      }
    }

    sim.start(renderCb)

    // Readout update interval (4 Hz)
    const readoutInterval = setInterval(() => {
      const rs = renderState.current
      const sim = simRef.current
      setReadouts({
        sweepAngle: rs.sweepAngle,
        beamWidth: rs.beamWidth,
        sll: rs.sll,
        gratingWarning: rs.gratingWarning,
        activeTargets: sim ? sim.targets.length : 0,
        detectionsCount: rs.detections.length,
      })
      if (sim) {
        setLogEntries(sim.detectionLog.slice(0, 20))
        setTargets([...sim.targets])
      }
    }, 250)

    // Lock-and-Size evaluation (1 Hz)
    const lockInterval = setInterval(async () => {
      const sim = simRef.current
      if (!sim || sim.targets.length === 0) return
      const counts = detectionCountsRef.current
      try {
        const resp = await radarLockSize({
          num_elements: sim.config.numElements,
          spacing_m: sim.config.spacingM,
          frequency: sim.config.frequency,
          lock_factor: 3.0,
          consecutive_threshold: 2,
          targets: sim.targets.map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            rcs: t.rcs,
            consecutive_detections: counts[t.id] || 0,
          })),
        })
        const newLockState = {}
        resp.sizing_results.forEach(sr => {
          newLockState[sr.target_id] = {
            locked: sr.locked,
            consecutive: counts[sr.target_id] || 0,
            sizeCategory: sr.size_category,
            narrowBW: sr.narrow_beam_width,
            wideBW: sr.wide_beam_width,
          }
        })
        setLockState(newLockState)
      } catch {
        // Lock-size endpoint not available, skip
      }
    }, 1000)

    return () => {
      clearInterval(readoutInterval)
      clearInterval(lockInterval)
      sim.stop()
    }
  }, [compareMode])

  /* ── Config change handler ─────────────────────────────────────────────── */
  const handleConfigChange = useCallback((key, value) => {
    setConfig(prev => {
      const next = { ...prev, [key]: value }
      const sim = simRef.current
      if (sim) sim.setConfig({ [key]: value })
      return next
    })
  }, [])

  /* ── PPI click handler — add target ────────────────────────────────────── */
  const handlePPIClick = useCallback((e) => {
    const canvas = ppiCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const clickX = (e.clientX - rect.left) * dpr
    const clickY = (e.clientY - rect.top) * dpr

    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const maxR = Math.min(canvas.width, canvas.height) / 2 * 0.92
    const ppm = maxR / 300

    const xM = (clickX - cx) / ppm
    const yM = -(clickY - cy) / ppm

    const sim = simRef.current
    if (!sim) return

    sim.addTarget({ x: Math.round(xM), y: Math.round(yM), rcs: 5 })
    setTargets([...sim.targets])
  }, [])

  /* ── Target controls ───────────────────────────────────────────────────── */
  const handleTargetRcsChange = useCallback((id, rcs) => {
    const sim = simRef.current
    if (sim) {
      sim.updateTarget(id, { rcs })
      setTargets([...sim.targets])
    }
  }, [])

  const handleRemoveTarget = useCallback((id) => {
    const sim = simRef.current
    if (sim) {
      sim.removeTarget(id)
      setTargets([...sim.targets])
    }
  }, [])

  const handleClearTargets = useCallback(() => {
    const sim = simRef.current
    if (sim) {
      sim.clearTargets()
      setTargets([])
    }
  }, [])

  /* ── Load scenario ─────────────────────────────────────────────────────── */
  const handleLoadScenario = useCallback(() => {
    const sim = simRef.current
    if (!sim) return
    sim.applyScenario(radarScenario)
    setTargets([...sim.targets])
    setConfig({
      numElements: sim.config.numElements,
      spacingM: sim.config.spacingM,
      frequency: sim.config.frequency,
      sweepSpeed: sim.config.sweepSpeed,
      detectionThreshold: sim.config.detectionThreshold,
      snr: sim.config.snr,
      windowType: sim.config.windowType,
      scanMode: sim.config.scanMode,
      sweepMode: sim.config.sweepMode,
      sectorMin: sim.config.sectorMin,
      sectorMax: sim.config.sectorMax,
    })
  }, [])

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="fiveg-layout">
      {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
      <div className="fiveg-sidebar">
        <div className="sidebar-header">
          <h1 style={{
            background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Radar Simulator</h1>
          <div className="subtitle">X-band phased array beamforming</div>
        </div>

        {/* ── Parameter sliders ────────────────────────────────────────── */}
        <div className="sidebar-section">
          <h3>Array Parameters</h3>
          {PARAMS.map(p => (
            <div className="param-row" key={p.key}>
              <label>{p.label}</label>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={config[p.key]}
                onChange={e => handleConfigChange(p.key, parseFloat(e.target.value))}
              />
              <span className="param-val" style={{ color: '#8b5cf6' }}>
                {p.fmt(config[p.key])}
              </span>
            </div>
          ))}

          {/* Window select */}
          <div className="param-row">
            <label>Local Window</label>
            <select
              value={config.windowType}
              onChange={e => handleConfigChange('windowType', e.target.value)}
            >
              {WINDOW_TYPES.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Scan mode toggle ─────────────────────────────────────────── */}
        <div className="sidebar-section">
          <h3>Scan Mode</h3>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-primary)', padding: 2, borderRadius: 4 }}>
            {[
              { id: 'phased_array', label: '🔬 Narrow', title: 'Phased Array' },
              { id: 'rotating_line', label: '📡 Wide', title: 'Rotating Line' },
            ].map(m => (
              <button
                key={m.id}
                title={m.title}
                onClick={() => handleConfigChange('scanMode', m.id)}
                style={{
                  flex: 1,
                  background: config.scanMode === m.id ? '#8b5cf6' : 'transparent',
                  color: config.scanMode === m.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 3, padding: '5px 8px',
                  fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}
              >{m.label}</button>
            ))}
          </div>
        </div>

        {/* ── Sweep pattern toggle ─────────────────────────────────────── */}
        <div className="sidebar-section">
          <h3>Sweep Pattern</h3>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-primary)', padding: 2, borderRadius: 4 }}>
            {[
              { id: 'continuous', label: '🔄 360°' },
              { id: 'bounce', label: '↔ Bounce' },
              { id: 'sector', label: '↔ Sector' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => handleConfigChange('sweepMode', m.id)}
                style={{
                  flex: 1,
                  background: config.sweepMode === m.id ? '#8b5cf6' : 'transparent',
                  color: config.sweepMode === m.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 3, padding: '5px 8px',
                  fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}
              >{m.label}</button>
            ))}
          </div>

          {/* Sector min/max sliders */}
          {(config.sweepMode === 'bounce' || config.sweepMode === 'sector') && (
            <div style={{ marginTop: 10 }}>
              <div className="param-row">
                <label>Min °</label>
                <input type="range" min={-180} max={180} step={1}
                  value={config.sectorMin}
                  onChange={e => handleConfigChange('sectorMin', parseFloat(e.target.value))}
                />
                <span className="param-val" style={{ color: '#8b5cf6' }}>{config.sectorMin}°</span>
              </div>
              <div className="param-row">
                <label>Max °</label>
                <input type="range" min={-180} max={180} step={1}
                  value={config.sectorMax}
                  onChange={e => handleConfigChange('sectorMax', parseFloat(e.target.value))}
                />
                <span className="param-val" style={{ color: '#8b5cf6' }}>{config.sectorMax}°</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Scenario & Clear ─────────────────────────────────────────── */}
        <div className="sidebar-section">
          <h3>Scenario</h3>
          <button
            onClick={handleLoadScenario}
            style={{
              width: '100%', padding: '7px', marginBottom: 6,
              background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
              border: '1px solid rgba(139,92,246,0.3)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontWeight: 600, fontSize: 11,
            }}
          >
            📋 Load Air Defense Scenario
          </button>
          <button
            onClick={handleClearTargets}
            style={{
              width: '100%', padding: '7px',
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontWeight: 600, fontSize: 11,
            }}
          >
            ✕ Clear All Targets
          </button>
        </div>

        {/* ── Hint ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '10px 20px', fontSize: 10,
          color: 'var(--text-muted)', borderTop: '1px solid var(--border)',
          marginTop: 'auto',
        }}>
          <kbd style={{
            display: 'inline-block', padding: '1px 5px',
            border: '1px solid var(--border)', borderRadius: 3,
            fontFamily: 'var(--font-mono)', fontSize: 10,
            background: 'var(--bg-primary)', color: 'var(--text-secondary)',
          }}>Click</kbd> on the PPI to place targets (max 5)
        </div>
      </div>

      {/* ── CENTRE — PPI + polar ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Compare mode toggle */}
        <div style={{
          padding: '6px 14px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Plan Position Indicator
          </span>
          <div style={{
            display: 'flex', gap: 4, background: 'var(--bg-primary)',
            padding: 2, borderRadius: 4, marginLeft: 16,
          }}>
            {['Single', 'Compare'].map(m => (
              <button
                key={m}
                onClick={() => setCompareMode(m === 'Compare')}
                style={{
                  background: (m === 'Compare') === compareMode ? '#8b5cf6' : 'transparent',
                  color: (m === 'Compare') === compareMode ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 3, padding: '2px 10px',
                  fontSize: 10, cursor: 'pointer', fontWeight: 600,
                }}
              >{m}</button>
            ))}
          </div>
        </div>

        {/* PPI canvas(es) */}
        <div style={{
          flex: 1, display: 'flex', position: 'relative',
          background: '#050a05', minHeight: 0,
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {compareMode && (
              <div style={{
                position: 'absolute', top: 8, left: 8, zIndex: 2,
                fontSize: 10, fontWeight: 700, color: '#8b5cf6',
                background: 'rgba(0,0,0,0.6)', padding: '2px 8px',
                borderRadius: 4,
              }}>PHASED ARRAY</div>
            )}
            <canvas
              ref={ppiCanvasRef}
              onClick={handlePPIClick}
              style={{
                width: '100%', height: '100%', display: 'block',
                cursor: 'crosshair',
              }}
            />
          </div>

          {compareMode && (
            <div style={{
              flex: 1, position: 'relative',
              borderLeft: '1px solid var(--border)',
            }}>
              <div style={{
                position: 'absolute', top: 8, left: 8, zIndex: 2,
                fontSize: 10, fontWeight: 700, color: '#22d3ee',
                background: 'rgba(0,0,0,0.6)', padding: '2px 8px',
                borderRadius: 4,
              }}>ROTATING LINE</div>
              <canvas
                ref={ppiCanvas2Ref}
                style={{ width: '100%', height: '100%', display: 'block' }}
              />
            </div>
          )}
        </div>

        {/* Polar pattern */}
        <div style={{
          height: 200, flexShrink: 0,
          borderTop: '1px solid var(--border)',
          background: '#0d0f14',
        }}>
          <canvas
            ref={polarCanvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>

        {/* Bottom hint bar */}
        <div className="keyboard-hint">
          <span>🎯 X-band radar beamforming simulator</span>
          <span><kbd style={{
            display: 'inline-block', padding: '1px 5px',
            border: '1px solid var(--border)', borderRadius: 3,
            fontFamily: 'var(--font-mono)', fontSize: 10,
            background: 'var(--bg-primary)', color: 'var(--text-secondary)',
          }}>Threshold</kbd> controls detection sensitivity</span>
        </div>
      </div>

      {/* ── RIGHT PANEL — readouts ─────────────────────────────────────── */}
      <div className="fiveg-right-panel">
        <div className="panel-header">
          <h2>Readouts</h2>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Scalar readouts */}
          {[
            { label: 'Sweep Angle', val: `${readouts.sweepAngle.toFixed(1)}°`, accent: '#8b5cf6' },
            { label: 'Beam Width', val: `${readouts.beamWidth.toFixed(2)}°`, accent: '#61dafb' },
            { label: 'Side Lobe Level', val: `${readouts.sll.toFixed(2)} dB`, accent: '#f59e0b' },
            { label: 'Active Targets', val: `${readouts.activeTargets}`, accent: '#22d3ee' },
            { label: 'Detections', val: `${readouts.detectionsCount}`, accent: '#10b981' },
          ].map(r => (
            <div key={r.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '7px 10px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{r.label}</div>
              <div style={{
                fontSize: 13, fontFamily: 'var(--font-mono)',
                fontWeight: 700, color: r.accent,
              }}>{r.val}</div>
            </div>
          ))}

          {/* Grating lobe warning */}
          {readouts.gratingWarning && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 'var(--radius-sm)',
              padding: '7px 10px', color: '#ef4444',
              fontSize: 11, fontWeight: 600,
            }}>
              ⚠ Grating Lobe Warning
              <div style={{ fontWeight: 400, fontSize: 10, marginTop: 2 }}>
                Spacing too large for current wavelength
              </div>
            </div>
          )}
        </div>

        {/* ── Target cards ─────────────────────────────────────────────── */}
        <div style={{ padding: '0 16px' }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 8,
          }}>
            Targets ({targets.length}/5)
          </div>
          {targets.map((t, i) => {
            const ls = lockState[t.id]
            const isLocked = ls && ls.locked
            return (
              <div key={t.id} style={{
                background: isLocked ? 'rgba(139,92,246,0.08)' : 'var(--bg-card)',
                border: `1px solid ${isLocked ? 'rgba(139,92,246,0.5)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', padding: '8px 10px',
                marginBottom: 6,
                transition: 'border-color 0.3s, background 0.3s',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: isLocked ? '#a78bfa' : '#61dafb',
                  }}>
                    Target #{i + 1}
                    {isLocked && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, padding: '1px 6px',
                        borderRadius: 4,
                        background: 'rgba(139,92,246,0.25)', color: '#c4b5fd',
                        fontWeight: 500, animation: 'badgePulse 1.5s ease infinite',
                      }}>🔒 LOCKED</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleRemoveTarget(t.id)}
                    style={{
                      background: 'none', border: 'none', color: '#ef4444',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '0 4px',
                    }}
                  >✕</button>
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', marginBottom: 4,
                }}>
                  x: {t.x}m  y: {t.y}m  R: {formatRange(Math.sqrt(t.x * t.x + t.y * t.y))}
                </div>
                {isLocked && ls.sizeCategory && (
                  <div style={{
                    fontSize: 9, color: '#c4b5fd', fontFamily: 'var(--font-mono)',
                    background: 'rgba(139,92,246,0.12)', padding: '3px 6px',
                    borderRadius: 3, marginBottom: 4,
                  }}>
                    Size: {ls.sizeCategory} · Narrow BW: {ls.narrowBW?.toFixed(2)}°
                  </div>
                )}
                <div className="param-row" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 10 }}>RCS</label>
                  <input
                    type="range"
                    min={0.1} max={100} step={0.1}
                    value={t.rcs}
                    onChange={e => handleTargetRcsChange(t.id, parseFloat(e.target.value))}
                  />
                  <span className="param-val" style={{ color: '#f59e0b', fontSize: 10 }}>
                    {formatRcs(t.rcs)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Detection log ────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 16px', marginTop: 8,
          borderTop: '1px solid var(--border)',
          flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 8,
          }}>
            Detection Log
          </div>
          <div style={{
            flex: 1, overflowY: 'auto', fontSize: 10,
            fontFamily: 'var(--font-mono)', minHeight: 0,
          }}>
            {logEntries.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No detections yet…
              </div>
            )}
            {logEntries.map((entry, i) => (
              <div key={i} style={{
                padding: '3px 0',
                borderBottom: '1px solid rgba(42,49,72,0.5)',
                color: i < 3 ? 'var(--accent-cyan)' : 'var(--text-muted)',
                transition: 'color 0.3s',
              }}>
                <span style={{ color: 'var(--text-muted)' }}>[{entry.time}]</span>{' '}
                <span style={{ fontWeight: 600 }}>{entry.target_id}</span>{' '}
                at {entry.angle_deg?.toFixed(0)}° — {formatRange(entry.range_m || 0)} —{' '}
                <span style={{ color: '#22d3ee', fontWeight: 700 }}>DETECTED</span>{' '}
                <span style={{ color: '#f59e0b' }}>({formatDbm(entry.received_dbm || -200)})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})

export default RadarMode
