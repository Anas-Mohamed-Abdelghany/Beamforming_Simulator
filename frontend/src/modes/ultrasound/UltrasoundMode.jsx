/**
 * modes/ultrasound/UltrasoundMode.jsx
 * =====================================
 * Main React component for the Ultrasound Imaging mode.
 *
 * Layout (3 panes):
 *   LEFT   — control sidebar (beamforming sliders, Doppler controls)
 *   CENTER — Phantom Map canvas (draggable probe, hover tooltip, click-to-edit)
 *   RIGHT  — A-mode waveform (top) + B-mode image (bottom)
 *
 * Data flow:
 *   1. On mount  → fetchPhantom() → store ellipses
 *   2. On probe move / param change → fetchAMode() + fetchBMode() (debounced)
 *   3. On Doppler param change → fetchDoppler() (debounced)
 *   4. On ellipse edit + Save → patchEllipse() → re-fetch phantom → re-scan
 */

import { useState, useEffect, useRef } from 'react';
import {
  fetchPhantom, fetchAMode, fetchBMode, fetchDoppler,
  patchEllipse, resetPhantom, debounce,
} from './simulator.js';
import { drawPhantom, drawAMode, drawBMode } from './renderer.js';
import {
  DEFAULT_BEAM, DEFAULT_PROBE, DEFAULT_BMODE, DEFAULT_DOPPLER,
  BEAM_SLIDERS, PROBE_SLIDERS, BMODE_SLIDERS, DOPPLER_SLIDERS,
  APODIZATION_OPTIONS,
} from './ui.js';

// ── Styled helpers (inline — reuse CSS vars from index.css) ───────────────────
const S = {
  layout: {
    display: 'flex', width: '100%', height: '100%', overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  sidebar: {
    width: 260, minWidth: 260, background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)', display: 'flex',
    flexDirection: 'column', overflowY: 'auto',
  },
  sideHeader: {
    padding: '14px 16px 10px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  sideTitle: {
    fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em',
    background: 'linear-gradient(135deg,#22d3ee,#3b82f6)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  sideSubtitle: { fontSize: 10, color: 'var(--text-muted)', marginTop: 2 },
  section: {
    padding: '10px 14px', borderBottom: '1px solid var(--border)',
  },
  sectionTitle: {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--text-secondary)', marginBottom: 8,
  },
  paramRow: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  label: {
    fontSize: 10, color: 'var(--text-secondary)', minWidth: 72, flexShrink: 0,
  },
  val: {
    fontSize: 10, fontFamily: 'var(--font-mono)', color: '#22d3ee',
    minWidth: 48, textAlign: 'right',
  },
  input: {
    flex: 1, height: 4, WebkitAppearance: 'none', appearance: 'none',
    background: 'var(--border)', borderRadius: 2, outline: 'none', cursor: 'pointer',
  },
  select: {
    flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '3px 6px', fontSize: 10, outline: 'none', cursor: 'pointer',
  },
  btn: (accent = '#22d3ee') => ({
    width: '100%', padding: '6px 0', borderRadius: 6, border: 'none',
    background: `${accent}22`, color: accent, fontSize: 11, fontWeight: 600,
    cursor: 'pointer', letterSpacing: '0.03em', marginTop: 6,
    transition: 'background .2s',
  }),
  center: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    position: 'relative',
  },
  canvasWrap: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  canvas: { display: 'block', width: '100%', height: '100%' },
  tooltip: {
    position: 'absolute', background: 'rgba(20,24,36,0.95)',
    border: '1px solid #22d3ee', borderRadius: 8, padding: '8px 12px',
    fontSize: 11, color: 'var(--text-primary)', pointerEvents: 'none',
    boxShadow: '0 0 16px rgba(34,211,238,0.2)', zIndex: 10,
    lineHeight: 1.6, minWidth: 160,
  },
  right: {
    width: 300, minWidth: 300, background: 'var(--bg-secondary)',
    borderLeft: '1px solid var(--border)', display: 'flex',
    flexDirection: 'column', overflow: 'hidden',
  },
  panelHeader: {
    padding: '10px 14px 6px', borderBottom: '1px solid var(--border)',
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--text-secondary)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  dopplerBadge: (hz) => ({
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    color: hz > 0 ? '#4ade80' : '#ef4444',
    background: 'rgba(0,0,0,0.3)', padding: '2px 7px', borderRadius: 4,
  }),
  editPanel: {
    position: 'absolute', top: 8, right: 8, zIndex: 20,
    background: 'rgba(20,24,36,0.97)', border: '1px solid #22d3ee',
    borderRadius: 10, padding: '14px 16px', minWidth: 220,
    boxShadow: '0 0 24px rgba(34,211,238,0.18)',
  },
  editTitle: {
    fontSize: 12, fontWeight: 700, color: '#22d3ee', marginBottom: 10,
  },
  editRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, gap: 8,
  },
  editLabel: { fontSize: 10, color: 'var(--text-secondary)', minWidth: 80 },
  editInput: {
    width: 80, background: 'var(--bg-primary)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px',
    fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'right',
    outline: 'none',
  },
  editBtns: { display: 'flex', gap: 8, marginTop: 10 },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function UltrasoundMode() {
  // ── State
  const [phantom,    setPhantom]    = useState(null);
  const [aData,      setAData]      = useState(null);
  const [bData,      setBData]      = useState(null);
  const [doppler,    setDoppler]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const [beam,    setBeam]    = useState({ ...DEFAULT_BEAM });
  const [probe,   setProbe]   = useState({ ...DEFAULT_PROBE });
  const [bmode,   setBmode]   = useState({ ...DEFAULT_BMODE });
  const [dop,     setDop]     = useState({ ...DEFAULT_DOPPLER });

  const [hoveredIdx,  setHoveredIdx]  = useState(null);
  const [hoveredPos,  setHoveredPos]  = useState({ x: 0, y: 0 });
  const [editIdx,     setEditIdx]     = useState(null);
  const [editVals,    setEditVals]    = useState({});
  const [dragging,    setDragging]    = useState(false);

  // ── Canvas refs
  const phantomRef = useRef(null);
  const amodeRef   = useRef(null);
  const bmodeRef   = useRef(null);

  // ── Stable debounced scan via useRef
  const scanRef = useRef(null);
  useEffect(() => {
    const fn = debounce(async (probeState, beamState, bmodeState) => {
      try {
        const [aRes, bRes] = await Promise.all([
          fetchAMode(probeState, beamState),
          fetchBMode(probeState, beamState, bmodeState.aperture_cm, bmodeState.n_lines),
        ]);
        setAData(aRes);
        setBData(bRes);
      } catch (e) {
        console.warn('Scan error:', e.message);
      }
    }, 150);
    scanRef.current = fn;
  }, []);

  const dopplerRef = useRef(null);
  useEffect(() => {
    const fn = debounce(async (dopState, freqMhz) => {
      try {
        const res = await fetchDoppler(
          dopState.velocity_cm_s,
          dopState.vessel_angle_deg,
          freqMhz,
        );
        setDoppler(res);
      } catch (e) {
        console.warn('Doppler error:', e.message);
      }
    }, 150);
    dopplerRef.current = fn;
  }, []);

  // ── Initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const ph = await fetchPhantom();
        setPhantom(ph);
        const [aRes, bRes, dRes] = await Promise.all([
          fetchAMode(DEFAULT_PROBE, DEFAULT_BEAM),
          fetchBMode(DEFAULT_PROBE, DEFAULT_BEAM, DEFAULT_BMODE.aperture_cm, DEFAULT_BMODE.n_lines),
          fetchDoppler(DEFAULT_DOPPLER.velocity_cm_s, DEFAULT_DOPPLER.vessel_angle_deg, DEFAULT_BEAM.frequency_mhz),
        ]);
        setAData(aRes);
        setBData(bRes);
        setDoppler(dRes);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Re-scan whenever beam/probe/bmode changes
  useEffect(() => {
    if (phantom && scanRef.current) scanRef.current(probe, beam, bmode);
  }, [probe, beam, bmode, phantom]);

  // ── Re-fetch Doppler on dop/beam.frequency_mhz change
  useEffect(() => {
    if (phantom && dopplerRef.current) dopplerRef.current(dop, beam.frequency_mhz);
  }, [dop, beam.frequency_mhz, phantom]);

  // ── Draw phantom canvas
  useEffect(() => {
    const canvas = phantomRef.current;
    if (!canvas || !phantom) return;
    if (canvas.width < 10) canvas.width  = canvas.offsetWidth  || 400;
    if (canvas.height < 10) canvas.height = canvas.offsetHeight || 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const probeNorm = {
      x_norm: probe.probe_x_cm / (phantom.width_cm  || 8),
      y_norm: 0.01,
    };
    drawPhantom(ctx, phantom.ellipses, W, H, hoveredIdx, probeNorm, probe.angle_deg);
  }, [phantom, hoveredIdx, probe]);

  // ── Draw A-mode canvas
  useEffect(() => {
    const canvas = amodeRef.current;
    if (!canvas) return;
    if (canvas.width < 10) canvas.width  = canvas.offsetWidth  || 300;
    if (canvas.height < 10) canvas.height = canvas.offsetHeight || 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (aData) {
      drawAMode(ctx, aData.depths_cm, aData.amplitudes, canvas.width, canvas.height);
    }
  }, [aData]);

  // ── Draw B-mode canvas
  useEffect(() => {
    const canvas = bmodeRef.current;
    if (!canvas) return;
    if (canvas.width < 10) canvas.width  = canvas.offsetWidth  || 300;
    if (canvas.height < 10) canvas.height = canvas.offsetHeight || 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (bData) {
      drawBMode(ctx, bData.image, canvas.width, canvas.height,
                bData.width_cm, bData.depth_cm);
    }
  }, [bData]);

  // ── Size canvases to their container on mount & resize
  useEffect(() => {
    function resizeAll() {
      for (const ref of [phantomRef, amodeRef, bmodeRef]) {
        const c = ref.current;
        if (!c) continue;
        const rect = c.getBoundingClientRect();
        if (rect.width > 0)  c.width  = Math.round(rect.width);
        if (rect.height > 0) c.height = Math.round(rect.height);
      }
    }
    resizeAll();
    const ro = new ResizeObserver(resizeAll);
    for (const ref of [phantomRef, amodeRef, bmodeRef]) {
      if (ref.current) ro.observe(ref.current);
    }
    return () => ro.disconnect();
  }, []);

  // ── Phantom canvas — hit test (which ellipse is at normalised x,y?)
  function ellipseAt(normX, normY) {
    if (!phantom) return null;
    for (let i = phantom.ellipses.length - 1; i >= 0; i--) {
      const e   = phantom.ellipses[i];
      const cos = Math.cos(e.angle_deg * Math.PI / 180);
      const sin = Math.sin(e.angle_deg * Math.PI / 180);
      const dx  = normX - e.centre_x;
      const dy  = normY - e.centre_y;
      const u   =  dx * cos + dy * sin;
      const v   = -dx * sin + dy * cos;
      if ((u / e.semi_x) ** 2 + (v / e.semi_y) ** 2 <= 1.0) return i;
    }
    return null;
  }

  // ── Probe mouse drag helpers
  function canvasNorm(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      nx: (clientX - rect.left)  / rect.width,
      ny: (clientY - rect.top)   / rect.height,
    };
  }

  function handlePhantomMouseDown(e) {
    setDragging(true);
    setEditIdx(null);
    moveProbe(e);
  }

  function handlePhantomMouseMove(e) {
    const canvas = phantomRef.current;
    if (!canvas || !phantom) return;
    const { nx, ny } = canvasNorm(canvas, e.clientX, e.clientY);

    // Hover detection
    const idx = ellipseAt(nx, ny);
    setHoveredIdx(idx);
    setHoveredPos({ x: e.clientX, y: e.clientY });

    // Drag probe
    if (dragging) moveProbe(e);
  }

  function moveProbe(e) {
    const canvas = phantomRef.current;
    if (!canvas || !phantom) return;
    const { nx } = canvasNorm(canvas, e.clientX, e.clientY);
    const newX = Math.max(0, Math.min(phantom.width_cm, nx * phantom.width_cm));
    setProbe(p => ({ ...p, probe_x_cm: +newX.toFixed(2) }));
  }

  function handlePhantomMouseUp() { setDragging(false); }

  function handlePhantomClick(e) {
    const canvas = phantomRef.current;
    if (!canvas || !phantom) return;
    const { nx, ny } = canvasNorm(canvas, e.clientX, e.clientY);
    const idx = ellipseAt(nx, ny);
    if (idx !== null) {
      const el = phantom.ellipses[idx];
      setEditIdx(idx);
      setEditVals({
        acoustic_impedance:    el.acoustic_impedance,
        attenuation:           el.attenuation,
        reflection_coefficient: el.reflection_coefficient,
        label:                 el.label,
      });
    }
  }

  // ── Edit panel save
  async function handleEditSave() {
    if (editIdx === null) return;
    try {
      await patchEllipse(editIdx, {
        acoustic_impedance:    parseFloat(editVals.acoustic_impedance),
        attenuation:           parseFloat(editVals.attenuation),
        reflection_coefficient: parseFloat(editVals.reflection_coefficient),
        label:                 editVals.label,
      });
      const ph = await fetchPhantom();
      setPhantom(ph);
      setEditIdx(null);
    } catch (e) {
      console.error('Edit failed:', e.message);
    }
  }

  async function handleReset() {
    try {
      await resetPhantom();
      const ph = await fetchPhantom();
      setPhantom(ph);
      setEditIdx(null);
      setBeam({ ...DEFAULT_BEAM });
      setBmode({ ...DEFAULT_BMODE });
      setProbe({ ...DEFAULT_PROBE });
      setDop({ ...DEFAULT_DOPPLER });
    } catch (e) {
      console.error('Reset failed:', e.message);
    }
  }

  // ── Slider change handlers
  function onBeam(key, val) {
    const v = key === 'n_elements' ? parseInt(val, 10) : parseFloat(val);
    setBeam(b => ({ ...b, [key]: v }));
  }
  function onProbeSlider(key, val) {
    setProbe(p => ({ ...p, [key]: parseFloat(val) }));
  }
  function onBmode(key, val) {
    const v = key === 'n_lines' ? parseInt(val, 10) : parseFloat(val);
    setBmode(b => ({ ...b, [key]: v }));
  }
  function onDop(key, val) {
    setDop(d => ({ ...d, [key]: parseFloat(val) }));
  }

  // ── Render helpers
  function SliderRow({ def, value, onChange }) {
    return (
      <div style={S.paramRow}>
        <span style={S.label}>{def.label}</span>
        <input
          id={`us-slider-${def.key}`}
          type="range"
          min={def.min} max={def.max} step={def.step}
          value={value}
          onChange={e => onChange(def.key, e.target.value)}
          style={S.input}
        />
        <span style={S.val}>{typeof value === 'number' ? value.toFixed(def.step < 1 ? 1 : 0) : value}{def.unit}</span>
      </div>
    );
  }

  // ── Error / loading states
  if (error) {
    return (
      <div style={{ ...S.layout, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 36 }}>⚠️</div>
        <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 600 }}>Backend unreachable</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, maxWidth: 340, textAlign: 'center' }}>{error}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          Start the server:&nbsp;<code style={{ color: '#22d3ee' }}>uvicorn backend.main:app --reload</code>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...S.layout, alignItems: 'center', justifyContent: 'center', gap: 12, flexDirection: 'column' }}>
        <div style={{ fontSize: 32 }}>🩺</div>
        <div style={{ color: '#22d3ee', fontSize: 13, fontWeight: 600, animation: 'badgePulse 1.2s ease infinite' }}>
          Loading Ultrasound Module…
        </div>
      </div>
    );
  }

  // ── Main render
  return (
    <div id="ultrasound-mode" style={S.layout}>

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════════ */}
      <div style={S.sidebar}>
        <div style={S.sideHeader}>
          <div style={S.sideTitle}>🩺 Ultrasound</div>
          <div style={S.sideSubtitle}>Imaging Simulator · M2</div>
        </div>

        {/* Probe section */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Probe · Scan Line</div>
          {PROBE_SLIDERS.map(def => (
            <SliderRow key={def.key} def={def} value={probe[def.key]} onChange={onProbeSlider} />
          ))}
          <div style={{ ...S.paramRow, marginTop: 4 }}>
            <span style={S.label}>Position X</span>
            <span style={{ ...S.val, flex: 1, textAlign: 'left', paddingLeft: 8 }}>
              {probe.probe_x_cm.toFixed(2)} cm
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>(drag on map)</span>
          </div>
        </div>

        {/* Beamforming parameters */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Beamforming · 7 Parameters</div>
          {BEAM_SLIDERS.map(def => (
            <SliderRow key={def.key} def={def} value={beam[def.key]} onChange={onBeam} />
          ))}
          <div style={S.paramRow}>
            <span style={S.label}>Apodization</span>
            <select
              id="us-apodization"
              value={beam.apodization}
              onChange={e => setBeam(b => ({ ...b, apodization: e.target.value }))}
              style={S.select}
            >
              {APODIZATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* B-mode */}
        <div style={S.section}>
          <div style={S.sectionTitle}>B-Mode Scan</div>
          {BMODE_SLIDERS.map(def => (
            <SliderRow key={def.key} def={def} value={bmode[def.key]} onChange={onBmode} />
          ))}
        </div>

        {/* Doppler */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Doppler · Blood Vessel</div>
          {DOPPLER_SLIDERS.map(def => (
            <SliderRow key={def.key} def={def} value={dop[def.key]} onChange={onDop} />
          ))}
          {doppler && (
            <div style={{
              marginTop: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 6,
              padding: '6px 10px', fontSize: 10, fontFamily: 'var(--font-mono)',
              border: '1px solid var(--border)',
            }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Doppler Result</div>
              <div style={{ color: '#4ade80' }}>fd = <strong>{doppler.fd_hz.toFixed(1)} Hz</strong></div>
              <div style={{ color: 'var(--text-secondary)' }}>
                cos θ = {doppler.cos_theta.toFixed(3)} · f₀ = {doppler.frequency_mhz} MHz
              </div>
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                v = {doppler.velocity_cm_s} cm/s · θ = {doppler.angle_deg}°
              </div>
            </div>
          )}
        </div>

        {/* Reset */}
        <div style={{ marginTop: 24 }}>
          <button id="us-reset-btn" style={S.btn('#ef4444')} onClick={handleReset}>
            ↺ Reset All
          </button>
        </div>
      </div>

      {/* ══ CENTER — PHANTOM MAP ══════════════════════════════════════════════ */}
      <div style={S.center}>
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Phantom Map
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Drag to move probe · Hover to inspect · Click to edit
          </span>
        </div>

        <div
          style={S.canvasWrap}
          onMouseDown={handlePhantomMouseDown}
          onMouseMove={handlePhantomMouseMove}
          onMouseUp={handlePhantomMouseUp}
          onMouseLeave={() => { setDragging(false); setHoveredIdx(null); }}
          onClick={handlePhantomClick}
        >
          <canvas
            id="us-phantom-canvas"
            ref={phantomRef}
            style={{ ...S.canvas, cursor: dragging ? 'grabbing' : 'crosshair' }}
          />

          {/* Hover tooltip */}
          {hoveredIdx !== null && phantom && (
            <div style={{
              ...S.tooltip,
              left: Math.min(hoveredPos.x - (phantomRef.current?.getBoundingClientRect().left || 0) + 12, 220),
              top:  hoveredPos.y - (phantomRef.current?.getBoundingClientRect().top  || 0) + 12,
            }}>
              <div style={{ fontWeight: 700, color: '#22d3ee', marginBottom: 4 }}>
                {phantom.ellipses[hoveredIdx]?.label}
              </div>
              <div>Z = <strong>{phantom.ellipses[hoveredIdx]?.acoustic_impedance} MRayl</strong></div>
              <div>Att = <strong>{phantom.ellipses[hoveredIdx]?.attenuation} dB/cm/MHz</strong></div>
              <div>RC = <strong>{phantom.ellipses[hoveredIdx]?.reflection_coefficient}</strong></div>
              {phantom.ellipses[hoveredIdx]?.is_vessel && (
                <div style={{ color: '#ef4444', marginTop: 4, fontWeight: 600 }}>🩸 Blood Vessel</div>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 4 }}>Click to edit</div>
            </div>
          )}

          {/* Edit panel */}
          {editIdx !== null && phantom && (
            <div style={S.editPanel} onClick={e => e.stopPropagation()}>
              <div style={S.editTitle}>
                ✏️ Edit — {phantom.ellipses[editIdx]?.label}
              </div>
              {[
                { key: 'acoustic_impedance',    label: 'Impedance (MRayl)', step: 0.01 },
                { key: 'attenuation',           label: 'Attenuation (dB/cm/MHz)', step: 0.1 },
                { key: 'reflection_coefficient', label: 'Reflection Coeff.', step: 0.001 },
              ].map(({ key, label }) => (
                <div style={S.editRow} key={key}>
                  <span style={S.editLabel}>{label}</span>
                  <input
                    id={`us-edit-${key}`}
                    type="number"
                    value={editVals[key] ?? ''}
                    step="any"
                    onChange={e => setEditVals(v => ({ ...v, [key]: e.target.value }))}
                    style={S.editInput}
                  />
                </div>
              ))}
              <div style={{ ...S.editRow }}>
                <span style={S.editLabel}>Label</span>
                <input
                  id="us-edit-label"
                  type="text"
                  value={editVals.label ?? ''}
                  onChange={e => setEditVals(v => ({ ...v, label: e.target.value }))}
                  style={{ ...S.editInput, width: 110, textAlign: 'left' }}
                />
              </div>
              <div style={S.editBtns}>
                <button id="us-edit-save" style={S.btn('#22d3ee')} onClick={handleEditSave}>
                  ✓ Save
                </button>
                <button id="us-edit-cancel" style={S.btn('#5a6478')} onClick={() => setEditIdx(null)}>
                  ✕ Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Probe position readout bar */}
        <div style={{
          padding: '5px 14px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)', fontSize: 10,
          color: 'var(--text-muted)', display: 'flex', gap: 20,
          fontFamily: 'var(--font-mono)',
        }}>
          <span>x = <span style={{ color: '#22d3ee' }}>{probe.probe_x_cm.toFixed(2)} cm</span></span>
          <span>θ  = <span style={{ color: '#22d3ee' }}>{probe.angle_deg}°</span></span>
          <span>f₀ = <span style={{ color: '#22d3ee' }}>{beam.frequency_mhz} MHz</span></span>
          <span>F/# = <span style={{ color: '#22d3ee' }}>
            {(beam.focal_depth_mm / (beam.n_elements * beam.spacing_mm)).toFixed(2)}
          </span></span>
          {doppler && (
            <span>fd = <span style={{ color: '#4ade80' }}>{doppler.fd_hz.toFixed(1)} Hz</span></span>
          )}
        </div>
      </div>

      {/* ══ RIGHT PANEL — A-mode + B-mode ════════════════════════════════════ */}
      <div style={S.right}>
        {/* A-mode */}
        <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
          A-Mode · Amplitude vs Depth
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
          <canvas
            id="us-amode-canvas"
            ref={amodeRef}
            style={S.canvas}
          />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* B-mode */}
        <div style={{
          padding: '8px 14px 6px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            B-Mode · Reconstructed Image
          </span>
          {doppler && (
            <span style={S.dopplerBadge(doppler.fd_hz)}>
              fd {doppler.fd_hz > 0 ? '+' : ''}{doppler.fd_hz.toFixed(0)} Hz
            </span>
          )}
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
          <canvas
            id="us-bmode-canvas"
            ref={bmodeRef}
            style={S.canvas}
          />
        </div>
      </div>
    </div>
  );
}
