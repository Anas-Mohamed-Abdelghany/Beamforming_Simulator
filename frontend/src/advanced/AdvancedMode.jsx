/**
 * AdvancedMode.jsx
 * ────────────────
 * DAS vs MVDR beamforming research comparison panel.
 *
 * Layout:
 *   LEFT SIDEBAR  — 7 parameter sliders
 *   CENTRE        — Polar beam-pattern canvas + Cartesian pattern
 *   RIGHT PANEL   — Metrics table + improvement badges
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const API = 'http://localhost:8000/api/advanced'

/* ── Defaults ────────────────────────────────────────────────────────────── */
const DEFAULTS = {
  n_elements:       16,
  d_over_lambda:    0.5,
  steering_deg:     0.0,
  noise_power:      0.01,
  n_interferers:    2,
  interferer_power: 10.0,
  diag_load:        0.001,
}

const PARAM_META = [
  { key: 'n_elements',       label: 'Array Elements',   unit: '',   min: 4,    max: 64,  step: 1,     decimals: 0, isInt: true },
  { key: 'd_over_lambda',    label: 'Spacing (d/λ)',    unit: 'λ',  min: 0.25, max: 1.0, step: 0.05,  decimals: 2 },
  { key: 'steering_deg',     label: 'Steering Angle',  unit: '°',  min: -60,  max: 60,  step: 1,     decimals: 0 },
  { key: 'noise_power',      label: 'Noise Power',     unit: '',   min: 0.001,max: 1.0, step: 0.001, decimals: 3 },
  { key: 'n_interferers',    label: 'Interferers',     unit: '',   min: 0,    max: 5,   step: 1,     decimals: 0, isInt: true },
  { key: 'interferer_power', label: 'Interferer Pwr',  unit: '×',  min: 1,    max: 100, step: 1,     decimals: 0 },
  { key: 'diag_load',        label: 'Diag Load (δ)',   unit: '',   min: 0.0001, max: 0.5, step: 0.0005, decimals: 4 },
]

const DAS_COLOR  = '#61dafb'
const MVDR_COLOR = '#f59e0b'
const INT_COLOR  = '#ef4444'
const STEER_COLOR = '#22d3ee'

/* ── Local DAS pattern synthesis ─────────────────────────────────────────── */
function synthLocal(params) {
  const N = params.n_elements
  const d = params.d_over_lambda
  const steer = (params.steering_deg * Math.PI) / 180
  const n_points = 361
  const thetas = Array.from({ length: n_points }, (_, i) => -90 + i * (180 / (n_points - 1)))

  const AF = theta_deg => {
    const theta = (theta_deg * Math.PI) / 180
    const psi = Math.PI * 2 * d * (Math.sin(theta) - Math.sin(steer))
    if (Math.abs(psi) < 1e-10) return 1
    return Math.sin(N * psi / 2) / (N * Math.sin(psi / 2))
  }

  const das = thetas.map(t => AF(t) ** 2)
  const dasMax = Math.max(...das)

  // Interference notches for MVDR (simplified: deeper nulls at interferer angles)
  const intAngles = [-30, 20, 45, -15, 35].slice(0, params.n_interferers)
  const mvdr = thetas.map((t, i) => {
    let val = das[i] / dasMax
    intAngles.forEach(ang => {
      const dist = Math.abs(t - ang)
      if (dist < 12) val *= (dist / 12) ** 2 * 0.05
    })
    return val
  })
  const mvdrMax = Math.max(...mvdr)

  const eps = 1e-12
  const dasDb  = das.map(v => 10 * Math.log10(Math.max(v / dasMax, eps)))
  const mvdrDb = mvdr.map(v => 10 * Math.log10(Math.max(v / mvdrMax, eps)))

  const bw3 = arr => {
    const peak = Math.max(...arr)
    const passing = thetas.filter((_, i) => arr[i] >= peak - 3)
    return passing.length > 1 ? passing[passing.length - 1] - passing[0] : 0
  }
  const psl = (arr, steerDeg, bw) => {
    const peak = Math.max(...arr)
    const sl = arr.filter((_, i) => Math.abs(thetas[i] - steerDeg) > bw / 2 + 1)
    return sl.length ? Math.max(...sl) - peak : -60
  }

  const dasBw = bw3(dasDb); const mvdrBw = bw3(mvdrDb)
  const dasPsl = psl(dasDb, params.steering_deg, dasBw)
  const mvdrPsl = psl(mvdrDb, params.steering_deg, mvdrBw)

  return {
    thetas_deg: thetas,
    das_db: dasDb,
    mvdr_db: mvdrDb,
    das_metrics:  { beamwidth_3db: +dasBw.toFixed(2),  peak_sidelobe_db: +dasPsl.toFixed(2)  },
    mvdr_metrics: { beamwidth_3db: +mvdrBw.toFixed(2), peak_sidelobe_db: +mvdrPsl.toFixed(2) },
    bw_ratio: +(dasBw / Math.max(mvdrBw, 0.01)).toFixed(2),
    psl_reduction_db: +(dasPsl - mvdrPsl).toFixed(2),
    interferer_angles: intAngles,
    steering_deg: params.steering_deg,
    n_elements: N,
  }
}

/* ── Cartesian pattern canvas ─────────────────────────────────────────────── */
function drawCartesian(canvas, data) {
  if (!canvas || !data) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0d0f14'
  ctx.fillRect(0, 0, W, H)

  const thetas = data.thetas_deg
  const dasDb  = data.das_db
  const mvdrDb = data.mvdr_db
  const n = thetas.length
  const FLOOR = -60

  // Grid
  ctx.strokeStyle = 'rgba(42,49,72,.5)'
  ctx.lineWidth = 1
  ;[-10, -20, -30, -40, -50].forEach(db => {
    const y = ((db - 0) / FLOOR) * (H - 30) + 10
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 10, y); ctx.stroke()
    ctx.fillStyle = '#5a6478'; ctx.font = '9px Consolas'
    ctx.textAlign = 'right'
    ctx.fillText(`${db}`, 36, y + 3)
  })
  ;[-60, -30, 0, 30, 60].forEach(ang => {
    const x = 40 + ((ang + 90) / 180) * (W - 50)
    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, H - 20); ctx.stroke()
    ctx.fillStyle = '#5a6478'; ctx.textAlign = 'center'
    ctx.fillText(`${ang}°`, x, H - 6)
  })

  // Interferer markers
  data.interferer_angles.forEach(ang => {
    const x = 40 + ((ang + 90) / 180) * (W - 50)
    ctx.strokeStyle = 'rgba(239,68,68,.4)'
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, H - 20); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = INT_COLOR; ctx.textAlign = 'center'; ctx.font = '9px Consolas'
    ctx.fillText('↑ INT', x, H - 20)
  })

  // Steering marker
  const sx = 40 + ((data.steering_deg + 90) / 180) * (W - 50)
  ctx.strokeStyle = 'rgba(34,211,238,.3)'
  ctx.setLineDash([4, 2]); ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(sx, 10); ctx.lineTo(sx, H - 20); ctx.stroke()
  ctx.setLineDash([])

  const toXY = (thetaDeg, db) => {
    const x = 40 + ((thetaDeg + 90) / 180) * (W - 50)
    const y = ((Math.max(db, FLOOR) - 0) / FLOOR) * (H - 30) + 10
    return [x, y]
  }

  // DAS line
  ctx.strokeStyle = DAS_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  thetas.forEach((t, i) => {
    const [x, y] = toXY(t, dasDb[i])
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // MVDR line
  ctx.strokeStyle = MVDR_COLOR
  ctx.lineWidth = 1.5
  ctx.beginPath()
  thetas.forEach((t, i) => {
    const [x, y] = toXY(t, mvdrDb[i])
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Legend
  ctx.font = 'bold 11px system-ui'
  ctx.fillStyle = DAS_COLOR;  ctx.textAlign = 'left'; ctx.fillText('— DAS',  W - 90, 20)
  ctx.fillStyle = MVDR_COLOR; ctx.fillText('— MVDR', W - 90, 34)
}

/* ── Polar pattern canvas ─────────────────────────────────────────────────── */
function drawPolar(canvas, data) {
  if (!canvas || !data) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0d0f14'
  ctx.fillRect(0, 0, W, H)

  const cx = W / 2, cy = H / 2
  const R = Math.min(W, H) * 0.42

  // Polar grid rings
  ctx.strokeStyle = 'rgba(42,49,72,.5)'; ctx.lineWidth = 1
  ;[1, 0.5, 0.25, 0.1].forEach(r => {
    ctx.beginPath(); ctx.arc(cx, cy, R * r, 0, 2 * Math.PI); ctx.stroke()
    ctx.fillStyle = '#5a6478'; ctx.font = '8px Consolas'; ctx.textAlign = 'left'
    ctx.fillText(r === 1 ? '0dB' : `${Math.round(10 * Math.log10(r))}`, cx + R * r + 2, cy)
  })
  // Radial lines
  ;[-90, -60, -30, 0, 30, 60, 90].forEach(ang => {
    const rad = (ang * Math.PI) / 180
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.lineTo(cx + R * Math.sin(rad), cy - R * Math.cos(rad)); ctx.stroke()
  })

  const toPolar = (thetaDeg, db, floor = -40) => {
    const lin = Math.max(0, (Math.max(db, floor) - floor) / (-floor))
    const rad = (thetaDeg * Math.PI) / 180
    return [cx + R * lin * Math.sin(rad), cy - R * lin * Math.cos(rad)]
  }

  const thetas = data.thetas_deg

  // DAS
  ctx.strokeStyle = DAS_COLOR; ctx.lineWidth = 1.5; ctx.beginPath()
  thetas.forEach((t, i) => {
    const [x, y] = toPolar(t, data.das_db[i])
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.closePath(); ctx.stroke()

  // MVDR
  ctx.strokeStyle = MVDR_COLOR; ctx.lineWidth = 1.5; ctx.beginPath()
  thetas.forEach((t, i) => {
    const [x, y] = toPolar(t, data.mvdr_db[i])
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.closePath(); ctx.stroke()

  // Interferer markers
  data.interferer_angles.forEach(ang => {
    const rad = (ang * Math.PI) / 180
    ctx.strokeStyle = 'rgba(239,68,68,.5)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(cx, cy)
    ctx.lineTo(cx + R * Math.sin(rad), cy - R * Math.cos(rad)); ctx.stroke()
    ctx.setLineDash([])
  })
}

/* ── SliderRow ─────────────────────────────────────────────────────────── */
function SliderRow({ meta, value, onChange }) {
  return (
    <div className="param-row">
      <label>{meta.label}</label>
      <input type="range" min={meta.min} max={meta.max} step={meta.step} value={value}
        onChange={e => onChange(meta.key, meta.isInt ? parseInt(e.target.value) : parseFloat(e.target.value))} />
      <span className="param-val">{value.toFixed(meta.decimals)}{meta.unit}</span>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function AdvancedMode() {
  const [params, setParams] = useState(DEFAULTS)
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)

  const cartRef  = useRef(null)
  const polarRef = useRef(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/compare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, n_points: 361 })
      })
      const d = await res.json()
      setData(d)
    } catch {
      // Synthesise locally if backend not available
      setData(synthLocal(params))
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => { fetchData() }, [params])

  useEffect(() => {
    if (cartRef.current)  drawCartesian(cartRef.current,  data)
    if (polarRef.current) drawPolar(polarRef.current, data)
  }, [data])

  const update = (key, val) => setParams(p => ({ ...p, [key]: val }))

  const m = data

  return (
    <div className="fiveg-layout">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
      <div className="fiveg-sidebar">
        <div className="sidebar-header">
          <h1>DAS vs MVDR</h1>
          <div className="subtitle">Adaptive beamforming comparison</div>
        </div>

        <div className="sidebar-section">
          <h3>Array Parameters</h3>
          {PARAM_META.map(meta => (
            <SliderRow key={meta.key} meta={meta} value={params[meta.key]} onChange={update} />
          ))}
        </div>

        {/* Method description */}
        <div className="sidebar-section">
          <h3>Methods</h3>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <div style={{ color: DAS_COLOR, fontWeight: 600, marginBottom: 4 }}>DAS (Delay & Sum)</div>
            Matched-filter beamformer. Fixed weights aligned to steering direction. Simple, robust, wide main lobe.
            <div style={{ color: MVDR_COLOR, fontWeight: 600, margin: '8px 0 4px' }}>MVDR / Capon</div>
            Adaptive weights minimise output power while maintaining unity gain at θ_s. Narrows beam, places nulls at interferers. Sensitive to covariance estimation errors → diagonal loading (δ).
          </div>
        </div>

        {loading && (
          <div style={{ padding: '8px 20px', fontSize: 11, color: 'var(--accent-orange)' }}>
            Computing…
          </div>
        )}
      </div>

      {/* ── CENTRE ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Section header */}
        <div style={{
          padding: '8px 14px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Beam Pattern
          </span>
          <span style={{ fontSize: 10, color: DAS_COLOR }}>— DAS</span>
          <span style={{ fontSize: 10, color: MVDR_COLOR }}>— MVDR</span>
          <span style={{ fontSize: 10, color: INT_COLOR  }}>↑ Interferers</span>
        </div>

        {/* Cartesian pattern (top 2/3) */}
        <div style={{ flex: 3, position: 'relative', background: 'var(--bg-primary)' }}>
          <canvas ref={cartRef} width={860} height={320}
            style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        {/* Polar label */}
        <div style={{
          padding: '6px 14px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Polar View
          </span>
        </div>

        {/* Polar pattern (bottom 1/3) */}
        <div style={{ flex: 2, position: 'relative', background: 'var(--bg-primary)' }}>
          <canvas ref={polarRef} width={860} height={220}
            style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div className="keyboard-hint">
          <span>Steer: <kbd>{params.steering_deg}°</kbd></span>
          <span>Elements: <kbd>{params.n_elements}</kbd></span>
          <span>Interferers: <kbd>{params.n_interferers}</kbd> at fixed angles</span>
        </div>
      </div>

      {/* ── RIGHT PANEL — metrics ──────────────────────────────────────── */}
      <div className="fiveg-right-panel">
        <div className="panel-header"><h2>Metrics</h2></div>

        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Per-method comparison table */}
          {[
            { label: '−3 dB Beamwidth', das: m?.das_metrics.beamwidth_3db, mvdr: m?.mvdr_metrics.beamwidth_3db, unit: '°', lower: true },
            { label: 'Peak SLL', das: m?.das_metrics.peak_sidelobe_db, mvdr: m?.mvdr_metrics.peak_sidelobe_db, unit: 'dB', lower: true },
          ].map(row => (
            <div key={row.label} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{row.label}</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                <span style={{ color: DAS_COLOR, flex: 1 }}>
                  DAS: {row.das != null ? `${row.das}${row.unit}` : '—'}
                </span>
                <span style={{ color: MVDR_COLOR, flex: 1 }}>
                  MVDR: {row.mvdr != null ? `${row.mvdr}${row.unit}` : '—'}
                </span>
              </div>
            </div>
          ))}

          {/* Improvement badges */}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            MVDR Improvement
          </div>

          <div style={{
            background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Beamwidth ratio (DAS/MVDR)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: MVDR_COLOR, fontFamily: 'var(--font-mono)' }}>
              {m?.bw_ratio != null ? `${m.bw_ratio}×` : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>narrower main lobe</div>
          </div>

          <div style={{
            background: 'rgba(97,218,251,.08)',
            border: '1px solid rgba(97,218,251,.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>SLL reduction</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: DAS_COLOR, fontFamily: 'var(--font-mono)' }}>
              {m?.psl_reduction_db != null ? `${m.psl_reduction_db} dB` : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>lower side-lobes</div>
          </div>

          {/* Interferer list */}
          {m?.interferer_angles?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Interferer Angles
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {m.interferer_angles.map((a, i) => (
                  <span key={i} style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: 'rgba(239,68,68,.1)',
                    border: '1px solid rgba(239,68,68,.3)',
                    color: INT_COLOR,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                  }}>
                    {a > 0 ? '+' : ''}{a}°
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Diagonal loading info */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            fontSize: 10,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}>
            <span style={{ color: MVDR_COLOR, fontWeight: 600 }}>δ (diag. load)</span> = {params.diag_load}<br />
            Stabilises R⁻¹ when snapshots are limited. Larger δ → more DAS-like behaviour.
          </div>
        </div>
      </div>
    </div>
  )
}
