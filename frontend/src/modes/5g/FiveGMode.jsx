import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FiveGRenderer } from './renderer';
import { FiveGSimulator } from './simulator';
import { FiveGUITools } from './ui';

const TOWER_NAMES = ['Tower 1', 'Tower 2', 'Tower 3'];
const TOWER_COLORS = ['#f59e0b', '#8b5cf6', '#22d3ee'];
const WINDOW_OPTIONS = ['rectangular', 'hamming', 'hanning', 'blackman', 'kaiser', 'chebyshev', 'taylor'];

export default function FiveGMode() {
  const canvasRef = useRef(null);
  const profileCanvasRef = useRef(null);
  const simRef = useRef(null);
  const rendererRef = useRef(null);
  const uiRef = useRef(null);

  // Force re-render trigger
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick(t => t + 1), []);

  // ── State ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('placing');
  const [towersPlaced, setTowersPlaced] = useState(0);
  const [towerParams, setTowerParams] = useState([]);
  const [connections, setConnections] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [towerUpdates, setTowerUpdates] = useState({});
  const [selectedUser, setSelectedUser] = useState(0);
  const [selectedTower, setSelectedTower] = useState(-1);

  // Sync state from simulator
  const syncState = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setPhase(sim.phase);
    setTowersPlaced(sim.towersPlaced);
    setTowerParams(sim.towers.map(t => ({ ...t })));
    setConnections([...sim.connections]);
    setHandoffs([...sim.handoffEvents]);
    setTowerUpdates({ ...sim.towerUpdates });
    setSelectedUser(sim.selectedUserIndex);
    setSelectedTower(sim.selectedTowerIndex);
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const renderer = new FiveGRenderer(canvas);
    const sim = new FiveGSimulator('/api/5g');
    const ui = new FiveGUITools(canvas, sim, renderer);

    rendererRef.current = renderer;
    simRef.current = sim;
    uiRef.current = ui;

    syncState();

    // Resize profile canvas
    const resizeProfile = () => {
      const pc = profileCanvasRef.current;
      if (pc && pc.parentElement) {
        const w = pc.parentElement.clientWidth;
        pc.width = w;
        pc.height = w;
      }
    };
    resizeProfile();
    window.addEventListener('resize', resizeProfile);

    // ── Render loop ─────────────────────────────────────────────────────
    let frameCount = 0;
    renderer.startLoop((dt) => {
      renderer.clear();
      ui.updateMovement(dt);
      sim.update(dt);

      if (sim.phase === 'placing') {
        // Draw any already-placed towers
        sim.towers.forEach((t, i) => {
          renderer.drawCoverageCircle(t, i);
          renderer.drawTower(t, i, false, null);
        });
        // Draw placement instruction overlay
        renderer.drawPlacementOverlay(sim.towersPlaced);

        // Sync React state to update sidebar
        if (frameCount % 6 === 0) syncState();
        frameCount++;
        return;
      }

      // ── Running phase ─────────────────────────────────────────────────

      // Draw interference heatmap
      if (sim.interferenceMap) {
        renderer.drawInterferenceMap(sim.interferenceMap, sim.interferenceStep);
      }

      // Draw coverage circles
      sim.towers.forEach((t, i) => renderer.drawCoverageCircle(t, i));

      // Draw beam lobes
      sim.beams.forEach(b => {
        const tIdx = sim.towers.findIndex(t => t.id === b.tower_id);
        if (tIdx >= 0) renderer.drawBeamLobe(sim.towers[tIdx], b, tIdx);
      });

      // Draw ALL connectivity lines (each tower ↔ each user, highlighted by distance)
      renderer.drawAllConnectivityLines(sim.allConnectivity, sim.towers, sim.users);

      // Draw towers
      sim.towers.forEach((t, i) => {
        const update = sim.towerUpdates[t.id];
        renderer.drawTower(t, i, i === sim.selectedTowerIndex, update);
      });

      // Draw users
      sim.users.forEach((u, i) => {
        const isSelected = i === sim.selectedUserIndex;
        const isConnected = !!u.connected_tower_id;
        renderer.drawUser(u, i, isSelected, isConnected);
      });

      // Draw beam profile on side panel (every 3 frames)
      if (frameCount % 3 === 0) {
        renderer.drawBeamProfilePolar(profileCanvasRef.current, sim.beamProfiles);
      }

      // Sync React state every ~200ms
      if (frameCount % 12 === 0) {
        syncState();
      }

      frameCount++;
    });

    return () => {
      renderer.stopLoop();
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('resize', resizeProfile);
    };
  }, [syncState]);

  // ── Tower param change handler ────────────────────────────────────────
  const handleParam = (tIdx, param, value) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.setTowerParam(tIdx, param, value);
    syncState();
  };

  // ── User pill click ───────────────────────────────────────────────────
  const selectUser = (idx) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.selectedUserIndex = idx;
    sim.selectedTowerIndex = -1;
    syncState();
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="fiveg-layout">

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="fiveg-sidebar">

        <div className="sidebar-header">
          <h1>5G Beamforming</h1>
          <div className="subtitle">3 Towers · 2 Users · Real-time Steering</div>
        </div>

        {/* Placement status */}
        {phase === 'placing' && (
          <div className="sidebar-section">
            <h3>Setup Phase</h3>
            <div style={{ fontSize: '13px', color: '#61dafb', marginBottom: '8px' }}>
              Click on the canvas to place tower {towersPlaced + 1} of 3
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {towersPlaced}/3 towers placed. Users will appear after all towers are placed.
            </div>
          </div>
        )}

        {/* User select — only when running */}
        {phase === 'running' && (
          <div className="sidebar-section">
            <h3>Active Users</h3>
            <div className="user-pills">
              {[0, 1].map(i => (
                <button key={i} className={`user-pill ${selectedUser === i ? 'active' : ''}`} onClick={() => selectUser(i)}>
                  User {i + 1} {i === 0 ? '(WASD)' : '(↑↓←→)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tower parameter cards */}
        {towerParams.map((t, i) => (
          <div className="sidebar-section" key={t.id} style={{ paddingBottom: '10px' }}>
            <div className={`tower-card ${selectedTower === i ? 'selected' : ''}`}>
              <div className="tower-card-header">
                <div className="tower-dot" style={{ background: TOWER_COLORS[i] }}></div>
                <span>{TOWER_NAMES[i]}</span>
                {towerUpdates[t.id] && towerUpdates[t.id].reason !== 'stable' && towerUpdates[t.id].reason !== 'no users' && (
                  <div className="auto-badge">AUTO</div>
                )}
              </div>

              {phase === 'running' && (<>
              {/* Param 1: Antenna Count */}
              <div className="param-row">
                <label>Antennas</label>
                <input type="range" min="4" max="128" step="4" value={t.num_antennas} onChange={e => handleParam(i, 'num_antennas', parseInt(e.target.value))} />
                <span className="param-val">{t.num_antennas}</span>
              </div>

              {/* Param 2: Coverage Radius */}
              <div className="param-row">
                <label>Radius</label>
                <input type="range" min="100" max="800" step="25" value={t.coverage_radius} onChange={e => handleParam(i, 'coverage_radius', parseFloat(e.target.value))} />
                <span className="param-val">{t.coverage_radius}m</span>
              </div>

              {/* Param 3: Frequency */}
              <div className="param-row">
                <label>Frequency</label>
                <input type="range" min="1" max="60" step="0.5" value={t.frequency / 1e9} onChange={e => handleParam(i, 'frequency', parseFloat(e.target.value) * 1e9)} />
                <span className="param-val">{(t.frequency / 1e9).toFixed(1)}G</span>
              </div>

              {/* Param 4: Tx Power */}
              <div className="param-row">
                <label>Tx Power</label>
                <input type="range" min="10" max="50" step="1" value={t.tx_power} onChange={e => handleParam(i, 'tx_power', parseFloat(e.target.value))} />
                <span className="param-val">{t.tx_power}dBm</span>
              </div>

              {/* Param 5: SNR */}
              <div className="param-row">
                <label>SNR</label>
                <input type="range" min="0" max="1000" step="10" value={t.snr} onChange={e => handleParam(i, 'snr', parseFloat(e.target.value))} />
                <span className="param-val">{t.snr}</span>
              </div>

              {/* Param 6: Window */}
              <div className="param-row">
                <label>Window</label>
                <select value={t.window_type} onChange={e => handleParam(i, 'window_type', e.target.value)}>
                  {WINDOW_OPTIONS.map(w => <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>)}
                </select>
              </div>

              {/* Param 7: Orientation */}
              <div className="param-row">
                <label>Orient°</label>
                <input type="range" min="0" max="360" step="5" value={t.orientation} onChange={e => handleParam(i, 'orientation', parseFloat(e.target.value))} />
                <span className="param-val">{t.orientation}°</span>
              </div>

              {/* Auto-update reason */}
              {towerUpdates[t.id] && towerUpdates[t.id].reason !== 'stable' && towerUpdates[t.id].reason !== 'no users' && (
                <div style={{ fontSize: '9px', color: '#f59e0b', marginTop: '6px', fontStyle: 'italic' }}>
                  ⚡ {towerUpdates[t.id].reason}
                </div>
              )}
              </>)}
            </div>
          </div>
        ))}

        {/* Live connections — only when running */}
        {phase === 'running' && (
          <div className="sidebar-section">
            <h3>Live Connections</h3>
            {connections.length === 0 && <div className="text-muted text-sm">No active links</div>}
            {connections.map(c => {
              const tIdx = towerParams.findIndex(t => t.id === c.tower_id);
              const uIdx = simRef.current?.users.findIndex(u => u.id === c.user_id) ?? -1;
              return (
                <div className="conn-card" key={c.user_id + c.tower_id}>
                  <div>
                    <span className="conn-label">User {uIdx + 1}</span>
                    <span style={{ color: TOWER_COLORS[tIdx] || '#888' }}> → {TOWER_NAMES[tIdx] || '?'}</span>
                  </div>
                  <div>
                    <span className="conn-metric" style={{ marginRight: '8px' }}>SNR {c.snr_db}dB</span>
                    <span className="conn-metric">🔗{c.antennas_assigned}ant</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Handoff log — only when running */}
        {phase === 'running' && (
          <div className="sidebar-section">
            <h3>Handoff Events</h3>
            <div className="handoff-log">
              {handoffs.length === 0 && <div className="text-muted">No handoffs yet</div>}
              {handoffs.slice(0, 20).map((h, i) => {
                const fromIdx = towerParams.findIndex(t => t.id === h.from_tower);
                const toIdx = towerParams.findIndex(t => t.id === h.to_tower);
                const uIdx = simRef.current?.users.findIndex(u => u.id === h.user_id) ?? -1;
                return (
                  <div className="handoff-entry" key={i}>
                    User {uIdx + 1}: {fromIdx >= 0 ? TOWER_NAMES[fromIdx] : 'None'} <span className="arrow">→</span> {toIdx >= 0 ? TOWER_NAMES[toIdx] : 'None'}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="keyboard-hint">
          {phase === 'placing'
            ? <div>🖱️ Click canvas to place towers</div>
            : <>
                <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> User 1</div>
                <div><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> User 2</div>
                <div><kbd>Tab</kbd> Switch highlight</div>
              </>
          }
        </div>
      </div>

      {/* ═══ MAIN CANVAS ═══ */}
      <div className="fiveg-canvas-area">
        <canvas ref={canvasRef} />
      </div>

      {/* ═══ RIGHT PANEL — Beam Profile ═══ */}
      <div className="fiveg-right-panel">
        <div className="panel-header">
          <h2>Beam Profile</h2>
        </div>
        <div style={{ padding: '8px' }}>
          <canvas ref={profileCanvasRef} className="beam-profile-canvas" />
        </div>
        <div className="profile-info">
          <div className="mb-2">Polar plot of active beam patterns with current windowing applied.</div>
          {connections.map(c => {
            const tIdx = towerParams.findIndex(t => t.id === c.tower_id);
            const uIdx = simRef.current?.users.findIndex(u => u.id === c.user_id) ?? -1;
            return (
              <div key={c.user_id} className="mb-2">
                <span style={{ color: TOWER_COLORS[tIdx] }}>■</span>{' '}
                {TOWER_NAMES[tIdx]} → User {uIdx + 1}:{' '}
                <span>{c.signal_dbm}dBm</span> · <span>{c.distance_m}m</span>
              </div>
            );
          })}
        </div>
        <div className="profile-info" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Interference Map</div>
          <div>The heatmap on the main canvas shows constructive (hot) and destructive (cold) interference zones from all active beams.</div>
        </div>
      </div>
    </div>
  );
}
