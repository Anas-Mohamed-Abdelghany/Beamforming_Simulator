/**
 * 5G Canvas Renderer — draws towers, users, beams, connectivity lines,
 * interference heatmap, and beam-profile polar plots.
 */

const TOWER_COLORS = ['#f59e0b', '#8b5cf6', '#22d3ee', '#ec4899', '#10b981'];
const USER_COLORS  = ['#3b82f6', '#ec4899', '#f59e0b', '#22d3ee', '#8b5cf6'];

export class FiveGRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.animationFrame = null;
    this.lastTime = 0;
    // camera defaults — world origin at canvas centre
    this.camera = { x: 400, y: 350, zoom: 1 };
    this._time = 0;  // for animations
  }

  /* ── Coordinate transforms ─────────────────────────────────────────── */

  worldToCanvas(wx, wy) {
    return {
      cx: (wx - this.camera.x) * this.camera.zoom + this.canvas.width / 2,
      cy: (wy - this.camera.y) * this.camera.zoom + this.canvas.height / 2,
    };
  }

  canvasToWorld(cx, cy) {
    return {
      wx: (cx - this.canvas.width / 2) / this.camera.zoom + this.camera.x,
      wy: (cy - this.canvas.height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  /* ── Clear ──────────────────────────────────────────────────────────── */

  clear() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    // Subtle grid
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(42, 49, 72, 0.3)';
    this.ctx.lineWidth = 0.5;
    const gridSize = 50 * this.camera.zoom;
    const offX = (this.canvas.width / 2 - this.camera.x * this.camera.zoom) % gridSize;
    const offY = (this.canvas.height / 2 - this.camera.y * this.camera.zoom) % gridSize;
    for (let x = offX; x < width; x += gridSize) {
      this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, height); this.ctx.stroke();
    }
    for (let y = offY; y < height; y += gridSize) {
      this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(width, y); this.ctx.stroke();
    }
    this.ctx.restore();
  }

  /* ── Interference heatmap ───────────────────────────────────────────── */

  drawInterferenceMap(grid, step) {
    if (!grid || grid.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let ri = 0; ri < grid.length; ri++) {
      for (let ci = 0; ci < grid[ri].length; ci++) {
        const wx = ci * step;
        const wy = ri * step;
        const { cx, cy } = this.worldToCanvas(wx, wy);
        const sz = step * this.camera.zoom;
        const v = grid[ri][ci];
        // cold-to-hot colour map
        const r = Math.floor(v * 255);
        const g = Math.floor(v * 100);
        const b = Math.floor((1 - v) * 180);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(cx, cy, sz, sz);
      }
    }
    ctx.restore();
  }

  /* ── Coverage circle ────────────────────────────────────────────────── */

  drawCoverageCircle(tower, index) {
    const pt = this.worldToCanvas(tower.x, tower.y);
    const r = tower.coverage_radius * this.camera.zoom;
    const ctx = this.ctx;
    const color = TOWER_COLORS[index % TOWER_COLORS.length];
    ctx.save();

    // Gradient fill
    const grad = ctx.createRadialGradient(pt.cx, pt.cy, 0, pt.cx, pt.cy, r);
    grad.addColorStop(0, color + '10');
    grad.addColorStop(0.7, color + '08');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.arc(pt.cx, pt.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Border ring
    ctx.beginPath();
    ctx.arc(pt.cx, pt.cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  /* ── Tower ──────────────────────────────────────────────────────────── */

  drawTower(tower, index, isSelected, update) {
    const pt = this.worldToCanvas(tower.x, tower.y);
    const ctx = this.ctx;
    const color = TOWER_COLORS[index % TOWER_COLORS.length];
    ctx.save();
    ctx.translate(pt.cx, pt.cy);

    // Glow
    if (isSelected) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
    }

    // Tower triangle
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(12, 12);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Antenna dots on top
    const antCount = Math.min(tower.num_antennas, 8);
    for (let i = 0; i < antCount; i++) {
      const ax = -6 + (12 / (antCount - 1 || 1)) * i;
      ctx.beginPath();
      ctx.arc(ax, -20, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Label
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Tower ${index + 1}`, 0, 28);

    // Auto-update badge
    if (update && update.reason && update.reason !== 'stable' && update.reason !== 'no users') {
      ctx.font = '500 9px system-ui, sans-serif';
      ctx.fillStyle = '#f59e0b';
      const lines = update.reason.split(';').map(s => s.trim());
      lines.forEach((line, i) => {
        ctx.fillText(line, 0, 40 + i * 11);
      });
    }

    // Param overlay
    ctx.font = '400 9px Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`${tower.num_antennas}ant · ${(tower.frequency/1e9).toFixed(1)}G · ${tower.tx_power}dBm`, 0, -28);

    ctx.restore();
  }

  /* ── User ───────────────────────────────────────────────────────────── */

  drawUser(user, index, isSelected, isConnected, connectedTowerIndex) {
    const pt = this.worldToCanvas(user.x, user.y);
    const ctx = this.ctx;
    const baseColor = USER_COLORS[index % USER_COLORS.length];
    ctx.save();
    ctx.translate(pt.cx, pt.cy);

    // Pulse ring when selected
    if (isSelected) {
      const pulse = 0.5 + 0.5 * Math.sin(this._time * 4);
      ctx.beginPath();
      ctx.arc(0, 0, 16 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = baseColor + '60';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // User dot
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(0, -2, 0, 0, 0, 7);
    grad.addColorStop(0, isConnected ? '#ffffff' : '#888888');
    grad.addColorStop(1, isConnected ? baseColor : '#555555');
    ctx.fillStyle = grad;
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = baseColor;
    ctx.fillText(`User ${index + 1}`, 0, -14);

    // Movement hint
    if (isSelected) {
      ctx.font = '400 8px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('WASD / ↑↓←→', 0, 20);
    }

    ctx.restore();
  }

  /* ── All connectivity lines (each tower ↔ each user, based on distance) */

  drawAllConnectivityLines(allConnectivity, towers, users) {
    if (!allConnectivity || allConnectivity.length === 0) return;
    const ctx = this.ctx;

    for (const link of allConnectivity) {
      const tower = towers[link.tower_idx];
      const user = users[link.user_idx];
      if (!tower || !user) continue;

      const pt1 = this.worldToCanvas(tower.x, tower.y);
      const pt2 = this.worldToCanvas(user.x, user.y);
      const color = TOWER_COLORS[link.tower_idx % TOWER_COLORS.length];

      // Opacity and thickness based on distance — closer = brighter/thicker
      const ratio = Math.min(link.distance / tower.coverage_radius, 1.0);
      const isPrimary = link.is_primary;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pt1.cx, pt1.cy);
      ctx.lineTo(pt2.cx, pt2.cy);

      if (isPrimary) {
        // Primary connection: bright, thick, animated dash
        ctx.strokeStyle = color + 'dd';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -this._time * 40;
      } else if (link.in_range) {
        // In range but not primary: dimmer, thinner, slower dash
        const alpha = Math.max(0.15, 0.6 * (1 - ratio));
        const alphaHex = Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.strokeStyle = color + alphaHex;
        ctx.lineWidth = 1.0;
        ctx.setLineDash([4, 8]);
        ctx.lineDashOffset = -this._time * 15;
      } else {
        // Out of range: very faint dotted line
        ctx.strokeStyle = 'rgba(100,100,120,0.08)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 10]);
      }

      ctx.stroke();
      ctx.setLineDash([]);

      // Distance label on the line midpoint for in-range connections
      if (link.in_range) {
        const mx = (pt1.cx + pt2.cx) / 2;
        const my = (pt1.cy + pt2.cy) / 2;
        ctx.font = '500 8px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = isPrimary ? (color + 'cc') : 'rgba(200,200,220,0.3)';
        ctx.fillText(`${Math.round(link.distance)}m`, mx, my - 4);
      }

      ctx.restore();
    }
  }

  /* ── Placement overlay ─────────────────────────────────────────────── */

  drawPlacementOverlay(towersPlaced, totalTowers = 3) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Semi-transparent overlay
    ctx.save();
    ctx.fillStyle = 'rgba(13, 15, 20, 0.5)';
    ctx.fillRect(0, 0, w, h);

    // Instruction text
    ctx.textAlign = 'center';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillStyle = '#61dafb';
    ctx.fillText(`Place Tower ${towersPlaced + 1} of ${totalTowers}`, w / 2, h / 2 - 20);

    ctx.font = '400 14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232,236,244,0.6)';
    ctx.fillText('Click anywhere on the canvas to place a 5G tower', w / 2, h / 2 + 10);

    ctx.font = '400 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(136,146,168,0.5)';
    ctx.fillText(`${towersPlaced}/${totalTowers} towers placed`, w / 2, h / 2 + 35);

    // Draw already-placed towers
    ctx.restore();
  }

  /* ── Beam lobe ──────────────────────────────────────────────────────── */

  drawBeamLobe(tower, beam, towerIndex) {
    if (!beam || !beam.gain_profile_noisy || beam.gain_profile_noisy.length === 0) return;
    const pt = this.worldToCanvas(tower.x, tower.y);
    const ctx = this.ctx;
    const color = TOWER_COLORS[towerIndex % TOWER_COLORS.length];
    const maxR = tower.coverage_radius * this.camera.zoom * 0.6;
    const step = 3; // degrees per sample

    ctx.save();
    ctx.translate(pt.cx, pt.cy);
    ctx.beginPath();
    ctx.moveTo(0, 0);

    const profile = beam.gain_profile_noisy;
    for (let i = 0; i < profile.length; i++) {
      const angleDeg = i * step;
      const rad = angleDeg * Math.PI / 180;
      const r = profile[i] * maxR;
      ctx.lineTo(r * Math.cos(rad), r * Math.sin(rad));
    }
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxR);
    grad.addColorStop(0, color + '50');
    grad.addColorStop(0.6, color + '20');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    // Outline
    ctx.strokeStyle = color + '80';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Steering direction indicator
    const steerRad = beam.steering_angle * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(maxR * 0.9 * Math.cos(steerRad), maxR * 0.9 * Math.sin(steerRad));
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  /* ── Beam profile polar plot (on a separate canvas) ─────────────────── */

  drawBeamProfilePolar(canvas, profiles) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy) - 24;

    // Background rings
    ctx.save();
    for (let i = 1; i <= 4; i++) {
      const r = (i / 4) * maxR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(42, 49, 72, 0.6)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // Cross-hairs
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
    ctx.strokeStyle = 'rgba(42, 49, 72, 0.4)';
    ctx.stroke();
    // Labels
    ctx.font = '9px Consolas, monospace';
    ctx.fillStyle = 'rgba(136,146,168,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('0°', cx + maxR + 12, cy + 3);
    ctx.fillText('90°', cx, cy + maxR + 14);
    ctx.fillText('180°', cx - maxR - 14, cy + 3);
    ctx.fillText('270°', cx, cy - maxR - 8);

    // Draw each profile
    if (!profiles || profiles.length === 0) {
      ctx.fillStyle = 'rgba(136,146,168,0.4)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('No active beams', cx, cy);
      ctx.restore();
      return;
    }

    profiles.forEach((prof, pi) => {
      const color = TOWER_COLORS[pi % TOWER_COLORS.length];
      const gains = prof.gains_noisy || prof.gains;
      if (!gains || gains.length === 0) return;

      ctx.beginPath();
      for (let i = 0; i < gains.length; i++) {
        const angleDeg = (prof.angles_deg ? prof.angles_deg[i] : i * 3);
        const rad = angleDeg * Math.PI / 180;
        const r = gains[i] * maxR;
        const px = cx + r * Math.cos(rad);
        const py = cy + r * Math.sin(rad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = color + '15';
      ctx.fill();

      // Window label
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(`T${pi+1}: ${prof.window_type}`, 8, 14 + pi * 13);
    });

    ctx.restore();
  }

  /* ── Animation loop ─────────────────────────────────────────────────── */

  startLoop(cb) {
    const loop = (timestamp) => {
      const dt = timestamp - this.lastTime;
      this.lastTime = timestamp;
      this._time += dt / 1000;
      cb(dt);
      this.animationFrame = requestAnimationFrame(loop);
    };
    this.lastTime = performance.now();
    this.animationFrame = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  }
}
