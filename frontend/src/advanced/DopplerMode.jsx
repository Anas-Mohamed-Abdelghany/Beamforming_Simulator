/**
 * DopplerMode.jsx
 * ───────────────
 * Doppler blood-vessel simulator.
 *
 * Layout (same structure as FiveGMode):
 *   LEFT SIDEBAR  — 7 parameter sliders
 *   CENTRE        — Live Doppler spectrum canvas + waterfall strip
 *   RIGHT PANEL   — Key scalar readouts + formula display
 *
 * Physics:   f_d = (2 · v · cos θ · f₀) / c
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import presetsData from '../scenarios/vessel_presets.json'

const API = 'http://localhost:8000/api/doppler'
const C = 1540        // m/s — default speed of sound

/* ── Colour helpers ───────────────────────────────────────────────────────── */
const dBtoColour = (db, floor = -60) => {
  const t = Math.max(0, Math.min(1, (db - floor) / (-floor)))
  // Black → deep blue → cyan → white
  if (t < 0.33) {
    const s = t / 0.33
    return `rgb(${Math.round(s * 30)}, ${Math.round(s * 60)}, ${Math.round(s * 160)})`
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33
    return `rgb(${Math.round(30 + s * 30)}, ${Math.round(60 + s * 158)}, ${Math.round(160 + s * 91)})`
  } else {
    const s = (t - 0.66) / 0.34
    return `rgb(${Math.round(60 + s * 195)}, ${Math.round(218 + s * 37)}, ${Math.round(251)})`
  }
}

/* ── Default params (matching DopplerParams dataclass) ──────────────────── */
const DEFAULTS = {
  velocity_cm_s: 60,
  angle_deg: 60,
  frequency_mhz: 5,
  c_sound: 1540,
  wall_filter_hz: 50,
  snr_db: 30,
  turbulence: 0.1,
  prf_hz: 10000,
  heart_rate_bpm: 72,
  sd_ratio: 0.6,
  diameter_mm: 6.0,
  waveform_shape: 'carotid',
  stenocity: 'normal',
  baseline_shift: 0.0,
}

const PARAM_META = [
  { key: 'velocity_cm_s', label: 'Blood Velocity', unit: 'cm/s', min: 1, max: 150, step: 1, decimals: 0 },
  { key: 'angle_deg', label: 'Vessel Angle', unit: '°', min: 0, max: 89, step: 1, decimals: 0 },
  { key: 'diameter_mm', label: 'Diameter', unit: 'mm', min: 1, max: 25, step: 0.5, decimals: 1 },
  { key: 'heart_rate_bpm', label: 'Heart Rate', unit: 'bpm', min: 40, max: 140, step: 1, decimals: 0 },
  { key: 'sd_ratio', label: 'S/D Ratio', unit: '', min: 0.1, max: 0.9, step: 0.05, decimals: 2 },
  { key: 'frequency_mhz', label: 'Freq (f₀)', unit: 'MHz', min: 1, max: 15, step: 0.5, decimals: 1 },
  { key: 'c_sound', label: 'Sound Speed', unit: 'm/s', min: 1450, max: 1600, step: 5, decimals: 0 },
  { key: 'wall_filter_hz', label: 'Wall Filter', unit: 'Hz', min: 0, max: 400, step: 10, decimals: 0 },
  { key: 'snr_db', label: 'SNR', unit: 'dB', min: 0, max: 60, step: 1, decimals: 0 },
  { key: 'turbulence', label: 'Turbulence', unit: '', min: 0, max: 1, step: 0.01, decimals: 2 },
]

/* ── Local physics (instant feedback while API call is in-flight) ─────── */
function localDopplerShift(params) {
  const v = params.velocity_cm_s / 100
  const theta = (params.angle_deg * Math.PI) / 180
  const f0 = params.frequency_mhz * 1e6
  return (2 * v * Math.cos(theta) * f0) / params.c_sound
}

/* ── Spectrum canvas renderer ─────────────────────────────────────────────── */
function drawSpectrum(canvas, data, params) {
  if (!canvas || !data) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const bg = '#0d0f14'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const freqs = data.freqs_hz
  const power = data.power_db
  const n = freqs.length
  const fMax = params.prf_hz / 2
  const FLOOR = -60

  // Grid
  ctx.strokeStyle = 'rgba(42,49,72,0.6)'
  ctx.lineWidth = 1
  const gridFreqs = [-4000, -3000, -2000, -1000, 0, 1000, 2000, 3000, 4000]
  gridFreqs.forEach(f => {
    const x = ((f + fMax) / (2 * fMax)) * W
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  })
  const gridDBs = [0, -10, -20, -30, -40, -50, -60]
  gridDBs.forEach(db => {
    const y = ((db - 0) / FLOOR) * H
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  })

  // Spectrum fill
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W
    const db = Math.max(power[i], FLOOR)
    const y = ((db - 0) / FLOOR) * H
    if (i === 0) ctx.lineTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgba(97,218,251,0.85)')
  grad.addColorStop(0.5, 'rgba(59,130,246,0.4)')
  grad.addColorStop(1, 'rgba(97,218,251,0.02)')
  ctx.fillStyle = grad
  ctx.fill()

  // Spectrum line
  ctx.beginPath()
  ctx.strokeStyle = '#61dafb'
  ctx.lineWidth = 1.5
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W
    const db = Math.max(power[i], FLOOR)
    const y = ((db - 0) / FLOOR) * H
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()

  // Peak fd marker
  const peakFd = data.peak_fd
  const px = ((peakFd + fMax) / (2 * fMax)) * W
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
  ctx.setLineDash([])

  // Wall filter zone
  const wfHz = params.wall_filter_hz
  if (wfHz > 0) {
    const x1 = ((-wfHz + fMax) / (2 * fMax)) * W
    const x2 = ((wfHz + fMax) / (2 * fMax)) * W
    ctx.fillStyle = 'rgba(239,68,68,0.07)'
    ctx.fillRect(x1, 0, x2 - x1, H)
    ctx.strokeStyle = 'rgba(239,68,68,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, H); ctx.stroke()
  }

  // Zero line
  const zx = (fMax / (2 * fMax)) * W
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(zx, 0); ctx.lineTo(zx, H); ctx.stroke()

  // Axis labels
  ctx.font = '10px Consolas, monospace'
  ctx.fillStyle = '#5a6478'
  ctx.textAlign = 'center'
  gridFreqs.forEach(f => {
    const x = ((f + fMax) / (2 * fMax)) * W
    ctx.fillText(f >= 0 ? `+${f / 1000}k` : `${f / 1000}k`, x, H - 4)
  })
  ctx.textAlign = 'left'
  gridDBs.slice(0, -1).forEach(db => {
    const y = ((db - 0) / FLOOR) * H
    ctx.fillText(`${db}`, 4, y - 2)
  })

  // Aliasing warning
  if (data.aliased) {
    ctx.fillStyle = '#ef4444'
    ctx.font = 'bold 12px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('⚠ ALIASED — increase PRF', W / 2, 20)
  }
}

/* ── Waterfall canvas renderer ───────────────────────────────────────────── */
function drawWaterfall(canvas, matrix, freqsHz, prf) {
  if (!canvas || !matrix || !matrix.length) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  const nFrames = matrix.length
  const nPoints = matrix[0].length
  const FLOOR = -60

  ctx.clearRect(0, 0, W, H)

  const rowH = H / nFrames
  const colW = W / nPoints

  for (let row = 0; row < nFrames; row++) {
    for (let col = 0; col < nPoints; col++) {
      ctx.fillStyle = dBtoColour(matrix[row][col], FLOOR)
      ctx.fillRect(col * colW, row * rowH, Math.ceil(colW) + 1, Math.ceil(rowH) + 1)
    }
  }
}

/* ── Color & Power Canvas renderer ───────────────────────────────────────── */
function drawColorOverlay(canvas, params, volumeScale, mode, fd) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  ctx.fillStyle = '#050608'
  ctx.fillRect(0, 0, W, H)

  const cx = W / 2
  const cy = H / 2

  const D = Math.max(30, (params.diameter_mm / 10) * 150)
  const angRad = (params.angle_deg * Math.PI) / 180

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-angRad)

  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-W, -D / 2); ctx.lineTo(W, -D / 2);
  ctx.moveTo(-W, D / 2); ctx.lineTo(W, D / 2);
  ctx.stroke()

  if (volumeScale > 0.02) {
    const isToward = fd > 0
    const density = Math.min(1.0, volumeScale * 3.0)

    const g = ctx.createLinearGradient(0, -D / 2, 0, D / 2)

    let midColor;
    if (mode === 'color') {
      const baseColor = isToward ? "239, 68, 68" : "59, 130, 246"
      midColor = `rgba(${baseColor}, ${density * 0.9})`
    } else {
      midColor = `rgba(245, 158, 11, ${density * 0.9})`
    }

    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.2, midColor)
    g.addColorStop(0.5, mode === 'color' && density > 0.6 ? `rgba(255,255,255,${density})` : midColor)
    g.addColorStop(0.8, midColor)
    g.addColorStop(1, 'rgba(0,0,0,0)')

    ctx.fillStyle = g
    ctx.fillRect(-W, -D / 2 + 2, W * 2, D - 4)
  }
  ctx.restore()

  ctx.font = 'bold 12px system-ui'
  ctx.fillStyle = mode === 'color' ? '#fff' : '#f59e0b'
  ctx.fillText(`${mode.toUpperCase()} DOPPLER`, 16, 24)
}

/* ── Param slider row ─────────────────────────────────────────────────────── */
function SliderRow({ meta, value, onChange }) {
  return (
    <div className="param-row">
      <label>{meta.label}</label>
      <input
        type="range"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={value}
        onChange={e => onChange(meta.key, parseFloat(e.target.value))}
      />
      <span className="param-val">{value.toFixed(meta.decimals)}{meta.unit}</span>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function DopplerMode() {
  const [params, setParams] = useState(DEFAULTS)
  const [specData, setSpec] = useState(null)
  const [wfData, setWf] = useState(null)
  const [loading, setLoading] = useState(false)

  const [displayMode, setDisplayMode] = useState('spectral')
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [activePreset, setActivePreset] = useState('')

  const specCanvasRef = useRef(null)
  const wfCanvasRef = useRef(null)

  // Audio Refs
  const audioCtxRef = useRef(null)
  const oscRef = useRef(null)
  const gainRef = useRef(null)
  const frameRef = useRef(0)

  // Live local calc (instantaneous)
  const fd_local = localDopplerShift(params)
  const cosTheta = Math.cos((params.angle_deg * Math.PI) / 180).toFixed(4)

  // Fetch from backend
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const body = { ...params, n_points: 256 }
      const [sRes, wRes] = await Promise.all([
        fetch(`${API}/spectrum`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        fetch(`${API}/waterfall`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      ])
      if (!sRes.ok || !wRes.ok) throw new Error('API Error')
      const sData = await sRes.json()
      const wData = await wRes.json()
      setSpec(sData)
      setWf(wData)
    } catch {
      // Backend not running — synthesise data locally
      synthLocal()
    } finally {
      setLoading(false)
    }
  }, [params])

  // Local synthesis when backend unavailable
  const synthLocal = useCallback(() => {
    const n = 256
    const fMax = params.prf_hz / 2
    const freqs = Array.from({ length: n }, (_, i) => -fMax + (i / (n - 1)) * 2 * fMax)
    const fd = localDopplerShift(params)
    const sigma = Math.max(60, Math.abs(fd) * params.turbulence * 0.3 + 40)
    const noiseLin = Math.pow(10, -60 / 10)
    const snrLin = Math.pow(10, params.snr_db / 10)
    const power = freqs.map(f => {
      const walled = Math.abs(f) < params.wall_filter_hz
      const sig = walled ? 0 : Math.exp(-0.5 * ((f - fd) / sigma) ** 2)
      const tot = sig / snrLin + noiseLin
      return 10 * Math.log10(Math.max(tot, 1e-12))
    })
    const synth = { freqs_hz: freqs, power_db: power, peak_fd: fd, sigma_fd: sigma, aliased: Math.abs(fd) > fMax }
    setSpec(synth)

    // Simple waterfall
    const nFrames = 64
    const matrix = []
    const hr = 1.2
    for (let r = 0; r < nFrames; r++) {
      const t = r / 15
      const vScale = 0.4 + 0.6 * Math.max(0, Math.sin(2 * Math.PI * hr * t)) ** 2
      const fdR = fd * vScale
      const row = freqs.map(f => {
        const walled = Math.abs(f) < params.wall_filter_hz
        const sig = walled ? 0 : Math.exp(-0.5 * ((f - fdR) / sigma) ** 2)
        const tot = sig / snrLin + noiseLin
        return 10 * Math.log10(Math.max(tot, 1e-12))
      })
      matrix.push(row)
    }
    setWf({ matrix, freqs_hz: freqs, n_frames: nFrames })
  }, [params])

  useEffect(() => { fetchData() }, [params])

  useEffect(() => {
    if (specCanvasRef.current && displayMode === 'spectral') {
      drawSpectrum(specCanvasRef.current, specData, params)
    }
  }, [specData, params, displayMode])

  useEffect(() => {
    if (wfCanvasRef.current && wfData) drawWaterfall(wfCanvasRef.current, wfData.matrix, wfData.freqs_hz, params.prf_hz)
  }, [wfData])

  const update = (key, val) => setParams(p => ({ ...p, [key]: val }))

  const loadPreset = (presetId) => {
    setActivePreset(presetId)
    if (!presetId) return
    const pt = presetsData.presets.find(p => p.id === presetId)
    if (pt) {
      setParams(p => ({
        ...p,
        velocity_cm_s: pt.velocity_cm_s,
        angle_deg: pt.angle_deg,
        frequency_mhz: pt.frequency_mhz,
        wall_filter_hz: pt.wall_filter_hz,
        diameter_mm: pt.diameter_mm,
        waveform_shape: pt.waveform_shape,
        sd_ratio: pt.sd_ratio,
        turbulence: p.stenocity === 'stenotic' ? pt.turbulance_stenotic : pt.turbulance_normal
      }))
    }
  }

  const fixPrf = () => {
    const safePrf = Math.max(1000, Math.min(50000, 2.5 * Math.abs(fd_local)));
    update('prf_hz', Math.round(safePrf / 100) * 100)
  }

  const toggleAudio = () => {
    if (!audioEnabled) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new Ctx()
      oscRef.current = audioCtxRef.current.createOscillator()
      oscRef.current.type = 'triangle'
      gainRef.current = audioCtxRef.current.createGain()
      gainRef.current.gain.value = 0
      oscRef.current.connect(gainRef.current)
      gainRef.current.connect(audioCtxRef.current.destination)
      oscRef.current.start()
      setAudioEnabled(true)
    } else {
      if (audioCtxRef.current) audioCtxRef.current.close()
      setAudioEnabled(false)
    }
  }

  // Animation Loop for Color Canvas && Audio Whoosh
  useEffect(() => {
    let tid;
    const renderFrame = () => {
      if (!wfData || !wfData.matrix) return;
      frameRef.current = (frameRef.current + 1) % wfData.n_frames;

      const c_frame = wfData.matrix[frameRef.current]
      let totalPwr = 0
      c_frame.forEach(db => { if (db > -50) totalPwr += Math.pow(10, db / 10) })
      const normVol = Math.min(1.0, totalPwr * 0.005)

      if (audioEnabled && audioCtxRef.current) {
        const pitch = Math.min(1500, Math.max(200, Math.abs(fd_local) * 0.5))
        oscRef.current.frequency.setTargetAtTime(pitch, audioCtxRef.current.currentTime, 0.05)
        gainRef.current.gain.setTargetAtTime(normVol * 0.3, audioCtxRef.current.currentTime, 0.05)
      }

      if (displayMode === 'color' || displayMode === 'power') {
        drawColorOverlay(specCanvasRef.current, params, normVol, displayMode, fd_local)
      }
    }
    tid = setInterval(renderFrame, 66)
    return () => clearInterval(tid)
  }, [wfData, displayMode, audioEnabled, fd_local, params])

  return (
    <div className="fiveg-layout">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
      <div className="fiveg-sidebar">
        <div className="sidebar-header">
          <h1>Doppler Simulator</h1>
          <div className="subtitle">Blood-vessel frequency-shift analysis</div>
        </div>

        <div className="sidebar-section">
          <h3>Presets</h3>
          <select
            value={activePreset}
            onChange={e => loadPreset(e.target.value)}
            style={{ width: '100%', padding: '6px', background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 10 }}
          >
            <option value="">-- Select Vessel --</option>
            {presetsData.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
            <input type="checkbox" checked={params.stenocity === 'stenotic'} onChange={e => {
              update('stenocity', e.target.checked ? 'stenotic' : 'normal')
              if (activePreset) loadPreset(activePreset)
            }} />
            <label style={{ color: 'var(--text-secondary)' }}>Stenotic Variant</label>
          </div>
        </div>

        <div className="sidebar-section">
          <h3>Parameters</h3>
          {PARAM_META.map(m => (
            <SliderRow key={m.key} meta={m} value={params[m.key]} onChange={update} />
          ))}
        </div>

        <div className="sidebar-section">
          <h3>PRF / Sampling</h3>
          <div className="param-row">
            <label>PRF</label>
            <input type="range" min={1000} max={50000} step={500} value={params.prf_hz}
              onChange={e => update('prf_hz', parseFloat(e.target.value))} />
            <span className="param-val">{(params.prf_hz / 1000).toFixed(1)}kHz</span>
          </div>
          <div className="param-row">
            <label>Baseline</label>
            <input type="range" min={-0.8} max={0.8} step={0.1} value={params.baseline_shift}
              onChange={e => update('baseline_shift', parseFloat(e.target.value))} />
            <span className="param-val">{params.baseline_shift > 0 ? '+' : ''}{params.baseline_shift}</span>
          </div>
          <button
            onClick={fixPrf}
            style={{ marginTop: 12, width: '100%', padding: '6px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
          >
            Auto-Fix Aliasing
          </button>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PRF Budget:</div>
            <div style={{ width: '100%', height: 6, background: '#2a3148', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
              <div style={{ width: `${Math.min(100, (Math.abs(fd_local) / (params.prf_hz / 2)) * 100)}%`, height: '100%', background: Math.abs(fd_local) > params.prf_hz / 2 ? '#ef4444' : '#10b981' }} />
            </div>
          </div>
        </div>

        {/* Live formula readout */}
        <div className="sidebar-section" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <h3>Formula</h3>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 2 }}>
            f<sub>d</sub> = (2·v·cosθ·f₀) / c
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.8 }}>
            v = {params.velocity_cm_s} cm/s<br />
            cosθ = {cosTheta}<br />
            f₀ = {params.frequency_mhz} MHz<br />
            c = {params.c_sound} m/s
          </div>
          <div style={{
            marginTop: 8,
            padding: '6px 10px',
            background: 'rgba(97,218,251,.08)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(97,218,251,.2)',
            color: 'var(--accent-cyan)',
            fontWeight: 700,
            fontSize: 13,
          }}>
            f<sub>d</sub> = {fd_local >= 0 ? '+' : ''}{(fd_local / 1000).toFixed(3)} kHz
          </div>
        </div>
      </div>

      {/* ── CENTRE CANVAS AREA ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Spectrum label */}
        <div style={{
          padding: '8px 14px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {displayMode === 'spectral' ? 'Doppler Power Spectrum' : 'Vessel Cross-Section'}
          </span>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-primary)', padding: 2, borderRadius: 4, marginLeft: 16 }}>
            {['spectral', 'color', 'power'].map(m => (
              <button
                key={m}
                onClick={() => setDisplayMode(m)}
                style={{
                  background: displayMode === m ? 'var(--accent-blue)' : 'transparent',
                  color: displayMode === m ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer', textTransform: 'uppercase', fontWeight: 600
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={toggleAudio}
            style={{
              marginLeft: 16, background: audioEnabled ? '#10b981' : 'var(--bg-card)', color: '#fff',
              border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600
            }}
          >
            {audioEnabled ? '🔊 Audio On' : '🔇 Audio Off'}
          </button>

          {loading && <span style={{ fontSize: 10, color: 'var(--accent-orange)', marginLeft: 'auto' }}>updating…</span>}
        </div>

        {/* Spectrum canvas */}
        <div style={{ flex: 3, position: 'relative', background: 'var(--bg-primary)' }}>
          <canvas ref={specCanvasRef} width={900} height={300}
            style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {/* Waterfall label */}
        <div style={{
          padding: '6px 14px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Pulsatile Waterfall  (3 heartbeats · 72 bpm)
          </span>
        </div>

        {/* Waterfall canvas */}
        <div style={{ flex: 1, position: 'relative', background: '#050608', minHeight: 80 }}>
          <canvas ref={wfCanvasRef} width={900} height={128}
            style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {/* Bottom hint */}
        <div className="keyboard-hint">
          <span>🫀 Simulating pulsatile blood flow</span>
          <span><kbd>Wall Filter</kbd> removes low-velocity clutter</span>
          <span><kbd>Turbulence</kbd> broadens spectral envelope</span>
        </div>
      </div>

      {/* ── RIGHT PANEL — scalar readouts ─────────────────────────────── */}
      <div className="fiveg-right-panel">
        <div className="panel-header">
          <h2>Readouts</h2>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Peak f_d', val: specData ? `${(specData.peak_fd / 1000).toFixed(3)} kHz` : `${(fd_local / 1000).toFixed(3)} kHz`, accent: '#61dafb' },
            { label: 'Spectral σ', val: specData ? `${(specData.sigma_fd / 1).toFixed(1)} Hz` : '—', accent: '#8b5cf6' },
            { label: 'V peak', val: `${params.velocity_cm_s} cm/s`, accent: '#22d3ee' },
            { label: 'V Nyquist', val: specData ? `${specData.v_nyquist_cm_s} cm/s` : '—', accent: '#f59e0b' },
            { label: 'Reynolds (Re)', val: specData?.reynolds ? specData.reynolds : '—', accent: specData?.reynolds > 2300 ? '#ef4444' : '#10b981' },
            { label: 'Resistive Ind', val: wfData?.metrics ? wfData.metrics.ri : '—', accent: '#ec4899' },
            { label: 'Pulsatility Ind', val: wfData?.metrics ? wfData.metrics.pi : '—', accent: '#f43f5e' },
            { label: 'Vessel angle', val: `${params.angle_deg}°  (cos = ${cosTheta})`, accent: '#a855f7' },
            { label: 'Wall filter', val: `±${params.wall_filter_hz} Hz`, accent: '#ef4444' },
          ].map(r => (
            <div key={r.label} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{r.label}</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: r.accent }}>{r.val}</div>
            </div>
          ))}

          {specData?.aliased && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
              color: '#ef4444',
              fontSize: 11,
              fontWeight: 600,
            }}>
              ⚠ Aliasing detected<br />
              <span style={{ fontWeight: 400, fontSize: 10 }}>Increase PRF or reduce velocity / angle</span>
            </div>
          )}
        </div>

        {/* Vessel diagram */}
        <div style={{ padding: '0 16px 16px', marginTop: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Geometry</div>
          <svg viewBox="0 0 200 160" style={{ width: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            {/* Ultrasound beam */}
            <line x1="100" y1="10" x2="100" y2="140" stroke="#61dafb" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
            <text x="105" y="20" fill="#61dafb" fontSize="9" fontFamily="monospace">Beam</text>

            {/* Vessel */}
            {(() => {
              const ang = params.angle_deg
              const rad = (ang * Math.PI) / 180
              const cx = 100, cy = 80
              const len = 70
              const dx = Math.cos(rad) * len
              const dy = Math.sin(rad) * len
              return (
                <g>
                  <line x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} stroke="#22d3ee" strokeWidth="16" opacity="0.15" />
                  <line x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} stroke="#22d3ee" strokeWidth="2" />

                  {/* Flow profile (Laminar vs Turbulent Plug) */}
                  <g transform={`rotate(${ang}, ${cx + dx}, ${cy + dy})`}>
                    {specData?.reynolds > 2300 ? (
                      <polygon points={`${cx + dx},${cy + dy} ${cx + dx - 15},${cy + dy - 6} ${cx + dx - 15},${cy + dy + 6}`} fill="#ef4444" />
                    ) : (
                      <path d={`M ${cx + dx} ${cy + dy} Q ${cx + dx - 20} ${cy + dy} ${cx + dx - 15} ${cy + dy - 6} L ${cx + dx - 15} ${cy + dy + 6} Z`} fill="#3b82f6" opacity="0.8" />
                    )}
                  </g>

                  {/* Angle arc */}
                  <path
                    d={`M 100 ${cy} A 30 30 0 0 1 ${100 + 30 * Math.cos(rad)} ${cy + 30 * Math.sin(rad)}`}
                    fill="none" stroke="#f59e0b" strokeWidth="1"
                  />
                  <text x="112" y={cy + 20} fill="#f59e0b" fontSize="9" fontFamily="monospace">{ang}°</text>
                </g>
              )
            })()}

            <text x="10" y="155" fill="#5a6478" fontSize="8" fontFamily="monospace">
              f_d = {(fd_local / 1000).toFixed(2)}kHz
            </text>
          </svg>
        </div>
      </div>
    </div>
  )
}
