/**
 * 5G Simulator — exactly 3 towers (user-placed) + 2 users,
 * sends state to backend each tick, receives beams/connections/updates.
 */

const DEFAULT_TOWER_CFG = { num_antennas: 32, coverage_radius: 300, frequency: 28e9, tx_power: 30, snr: 100, window_type: 'rectangular', orientation: 0 };

const USER_DEFAULTS = [
  { x: 260, y: 310 },
  { x: 580, y: 260 },
];

let _idCounter = 0;
function uid(prefix) { return `${prefix}_${++_idCounter}`; }

export class FiveGSimulator {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl || '/api/5g';

    // ── Towers — empty until user places them ───────────────────────────
    this.towers = [];
    this.maxTowers = 3;

    // ── Users — appear after all 3 towers are placed ────────────────────
    this.users = [];

    // ── Phase tracking ──────────────────────────────────────────────────
    this.phase = 'placing';  // 'placing' | 'running'
    this.towersPlaced = 0;

    // ── Server state ────────────────────────────────────────────────────
    this.beams = [];
    this.connections = [];
    this.handoffEvents = [];
    this.towerUpdates = {};      // tower_id → latest TowerUpdate
    this.beamProfiles = [];
    this.interferenceMap = null;
    this.interferenceStep = 20;

    // ── All tower-user distance-based connectivity info ──────────────────
    this.allConnectivity = [];   // [{tower_id, tower_idx, user_id, user_idx, distance, in_range}]

    // ── Selection ───────────────────────────────────────────────────────
    this.selectedUserIndex = 0;  // 0 or 1
    this.selectedTowerIndex = -1;

    // ── Timing control ──────────────────────────────────────────────────
    this._tickAccum = 0;
    this._heatmapAccum = 0;
    this._tickPending = false;
    this._hmPending = false;
  }

  /* ── Tower placement ─────────────────────────────────────────────────── */

  placeTower(x, y) {
    if (this.towers.length >= this.maxTowers) return false;
    this.towers.push({
      id: uid('t'),
      x, y,
      ...DEFAULT_TOWER_CFG,
    });
    this.towersPlaced = this.towers.length;

    // When 3 towers placed, spawn users and start simulation
    if (this.towers.length === this.maxTowers) {
      this._spawnUsers();
      this.phase = 'running';
    }
    return true;
  }

  _spawnUsers() {
    this.users = USER_DEFAULTS.map((cfg) => ({
      id: uid('u'),
      x: cfg.x,
      y: cfg.y,
      speed: 150,
      connected_tower_id: null,
    }));
  }

  /* ── User movement (local only) ──────────────────────────────────────── */

  moveUser(index, dx, dy) {
    const u = this.users[index];
    if (!u) return;
    u.x += dx;
    u.y += dy;
    // Clamp to world bounds
    u.x = Math.max(0, Math.min(900, u.x));
    u.y = Math.max(0, Math.min(700, u.y));
  }

  /* ── Tower param setters ─────────────────────────────────────────────── */

  setTowerParam(towerIndex, paramName, value) {
    const t = this.towers[towerIndex];
    if (!t) return;
    t[paramName] = value;
  }

  /* ── Compute all tower-user connectivity info ──────────────────────── */

  _computeAllConnectivity() {
    this.allConnectivity = [];
    this.towers.forEach((t, tIdx) => {
      this.users.forEach((u, uIdx) => {
        const dx = t.x - u.x;
        const dy = t.y - u.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const inRange = distance <= t.coverage_radius;
        this.allConnectivity.push({
          tower_id: t.id,
          tower_idx: tIdx,
          user_id: u.id,
          user_idx: uIdx,
          distance,
          in_range: inRange,
          is_primary: u.connected_tower_id === t.id,
        });
      });
    });
  }

  /* ── API calls ───────────────────────────────────────────────────────── */

  async tick() {
    if (this._tickPending || this.phase !== 'running') return;
    this._tickPending = true;
    try {
      const res = await fetch(`${this.apiBaseUrl}/tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          towers: this.towers,
          users: this.users,
        }),
      });
      const data = await res.json();

      this.beams = data.beams || [];
      this.connections = data.connections || [];
      this.beamProfiles = data.beam_profiles || [];

      // Handoffs
      const newH = data.handoff_events || [];
      if (newH.length > 0) {
        this.handoffEvents = [...newH, ...this.handoffEvents].slice(0, 50);
      }

      // Tower updates
      for (const tu of (data.tower_updates || [])) {
        this.towerUpdates[tu.tower_id] = tu;
      }

      // Sync user connection ids
      for (const c of this.connections) {
        const u = this.users.find(u => u.id === c.user_id);
        if (u) u.connected_tower_id = c.tower_id;
      }
      // Clear disconnected
      for (const u of this.users) {
        if (!this.connections.find(c => c.user_id === u.id)) {
          u.connected_tower_id = null;
        }
      }

      // Recompute all connectivity info for rendering
      this._computeAllConnectivity();

    } catch (err) {
      console.error('5G tick error:', err);
    } finally {
      this._tickPending = false;
    }
  }

  async refreshHeatmap(width, height) {
    if (this._hmPending || this.phase !== 'running') return;
    this._hmPending = true;
    try {
      const res = await fetch(`${this.apiBaseUrl}/heatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          towers: this.towers,
          users: this.users,
          width: width || 900,
          height: height || 700,
        }),
      });
      const data = await res.json();
      this.interferenceMap = data.grid;
      this.interferenceStep = data.step || 20;
    } catch (err) {
      console.error('5G heatmap error:', err);
    } finally {
      this._hmPending = false;
    }
  }

  /* ── Frame update (called from render loop) ──────────────────────────── */

  update(dt) {
    if (this.phase !== 'running') return;

    this._tickAccum += dt;
    this._heatmapAccum += dt;

    // ~10 Hz API ticks
    if (this._tickAccum > 100) {
      this._tickAccum = 0;
      this.tick();
    }

    // Heatmap every 800ms
    if (this._heatmapAccum > 800) {
      this._heatmapAccum = 0;
      this.refreshHeatmap();
    }
  }
}
