/**
 * 5G UI input handler — keyboard movement, user/tower selection, tower placement.
 *
 * Controls:
 *   WASD        → move User 1
 *   Arrow keys  → move User 2
 *   Tab         → switch selected user highlight
 *   Click       → place tower (during placement) / select user or tower (during running)
 */

export class FiveGUITools {
  constructor(canvas, simulator, renderer) {
    this.canvas = canvas;
    this.sim = simulator;
    this.renderer = renderer;
    this.activeKeys = {};
    this._bindEvents();
  }

  /* ── Event binding ───────────────────────────────────────────────────── */

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      this.activeKeys[e.key.toLowerCase()] = true;
      if (e.key === 'Tab') {
        e.preventDefault();
        this.sim.selectedUserIndex = this.sim.selectedUserIndex === 0 ? 1 : 0;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.activeKeys[e.key.toLowerCase()] = false;
    });

    this.canvas.addEventListener('mousedown', (e) => this._onClick(e));
  }

  /* ── Click handler ──────────────────────────────────────────────────── */

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { wx, wy } = this.renderer.canvasToWorld(cx, cy);

    // ── Placement phase: place towers on click ──────────────────────────
    if (this.sim.phase === 'placing') {
      this.sim.placeTower(wx, wy);
      return;
    }

    // ── Running phase: select user or tower ─────────────────────────────
    // Find closest user
    let bestUserIdx = -1;
    let bestUserDist = 30;
    this.sim.users.forEach((u, i) => {
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d < bestUserDist) { bestUserDist = d; bestUserIdx = i; }
    });

    // Find closest tower
    let bestTowerIdx = -1;
    let bestTowerDist = 30;
    this.sim.towers.forEach((t, i) => {
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d < bestTowerDist) { bestTowerDist = d; bestTowerIdx = i; }
    });

    if (bestUserIdx >= 0 && (bestTowerIdx < 0 || bestUserDist < bestTowerDist)) {
      this.sim.selectedUserIndex = bestUserIdx;
      this.sim.selectedTowerIndex = -1;
    } else if (bestTowerIdx >= 0) {
      this.sim.selectedTowerIndex = bestTowerIdx;
    } else {
      this.sim.selectedTowerIndex = -1;
    }
  }

  /* ── Per-frame movement update ───────────────────────────────────────── */

  updateMovement(dt) {
    if (this.sim.phase !== 'running') return;

    const speed1 = (this.sim.users[0]?.speed || 150) * dt / 1000;
    const speed2 = (this.sim.users[1]?.speed || 150) * dt / 1000;

    // User 1 — WASD (always active)
    let dx1 = 0, dy1 = 0;
    if (this.activeKeys['w']) dy1 -= speed1;
    if (this.activeKeys['s']) dy1 += speed1;
    if (this.activeKeys['a']) dx1 -= speed1;
    if (this.activeKeys['d']) dx1 += speed1;
    if (dx1 || dy1) this.sim.moveUser(0, dx1, dy1);

    // User 2 — Arrow keys
    let dx2 = 0, dy2 = 0;
    if (this.activeKeys['arrowup']) dy2 -= speed2;
    if (this.activeKeys['arrowdown']) dy2 += speed2;
    if (this.activeKeys['arrowleft']) dx2 -= speed2;
    if (this.activeKeys['arrowright']) dx2 += speed2;
    if (dx2 || dy2) this.sim.moveUser(1, dx2, dy2);
  }
}
