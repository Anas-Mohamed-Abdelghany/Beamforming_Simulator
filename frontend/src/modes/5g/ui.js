/**
 * 5G UI input handler — keyboard movement, user/tower selection, tower placement.
 *
 * Controls (BOTH configurations move the SELECTED user):
 *   WASD        → move selected user
 *   Arrow keys  → move selected user
 *   Tab         → cycle to next user
 *   1-5 keys    → select user directly
 *   Click       → place tower (config) / select user or tower (running)
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

      // Tab: cycle selected user
      if (e.key === 'Tab') {
        e.preventDefault();
        const totalUsers = this.sim.users.length;
        if (totalUsers > 0) {
          this.sim.selectedUserIndex = (this.sim.selectedUserIndex + 1) % totalUsers;
          this.sim.selectedTowerIndex = -1;
        }
      }

      // Number keys 1-5: directly select user
      const numKey = parseInt(e.key);
      if (numKey >= 1 && numKey <= 5 && numKey <= this.sim.users.length) {
        this.sim.selectedUserIndex = numKey - 1;
        this.sim.selectedTowerIndex = -1;
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

    const selectedIdx = this.sim.selectedUserIndex;
    const user = this.sim.users[selectedIdx];
    if (!user) return;

    const speed = (user.speed || 150) * dt / 1000;

    // Both WASD and Arrow keys move the SELECTED user
    let dx = 0, dy = 0;
    if (this.activeKeys['w'] || this.activeKeys['arrowup']) dy -= speed;
    if (this.activeKeys['s'] || this.activeKeys['arrowdown']) dy += speed;
    if (this.activeKeys['a'] || this.activeKeys['arrowleft']) dx -= speed;
    if (this.activeKeys['d'] || this.activeKeys['arrowright']) dx += speed;
    if (dx || dy) this.sim.moveUser(selectedIdx, dx, dy);
  }
}
