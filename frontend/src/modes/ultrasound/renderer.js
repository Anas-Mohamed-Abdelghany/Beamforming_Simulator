/**
 * modes/ultrasound/renderer.js
 * =============================
 * Pure Canvas 2D drawing utilities.  No React, no dependencies.
 * All functions receive a CanvasRenderingContext2D and data objects.
 *
 * Colour palette mirrors the global CSS variables from index.css:
 *   --bg-primary  #0d0f14   --accent-cyan  #22d3ee
 *   --border      #2a3148   --accent-green #22d3ee
 */

// ── Colour constants ──────────────────────────────────────────────────────────
const C_BG      = '#0d0f14';
const C_GRID    = 'rgba(42,49,72,0.6)';
const C_CYAN    = '#22d3ee';
const C_BLUE    = '#3b82f6';
const C_RED     = '#ef4444';
const C_ORANGE  = '#f59e0b';
const C_GREEN   = '#4ade80';
const C_TEXT    = '#8892a8';
const C_WHITE   = '#e8ecf4';

// ── Phantom map ───────────────────────────────────────────────────────────────

/**
 * Draw the phantom as coloured ellipses on top of a dark background.
 * We draw from the ellipse descriptors (not label_map) for smooth rendering.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array}  ellipses  - array of ellipse dicts from backend
 * @param {number} W  - canvas width  (px)
 * @param {number} H  - canvas height (px)
 * @param {number|null} hoveredIdx - 0-based index of hovered ellipse, or null
 * @param {object|null} probe  - { x_norm, y_norm } normalised probe position
 * @param {number} steerAngle - probe steering angle in degrees
 */
export function drawPhantom(ctx, ellipses, W, H, hoveredIdx, probe, steerAngle = 0) {
  // Background
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, W, H);

  // Grid
  _drawGrid(ctx, W, H, 8, 8);

  if (!ellipses || ellipses.length === 0) return;

  // Draw ellipses in order (background first, details on top)
  for (let i = 0; i < ellipses.length; i++) {
    const e = ellipses[i];
    const isHovered  = i === hoveredIdx;
    const isVessel   = !!e.is_vessel;
    _drawEllipse(ctx, e, W, H, isHovered, isVessel);
  }

  // Probe + beam
  if (probe) {
    _drawProbe(ctx, probe.x_norm, probe.y_norm, steerAngle, W, H);
  }

  // Depth ruler on the left
  _drawRuler(ctx, W, H, 8.0);
}

function _drawGrid(ctx, W, H, cols, rows) {
  ctx.strokeStyle = C_GRID;
  ctx.lineWidth   = 0.5;
  for (let c = 1; c < cols; c++) {
    const x = (c / cols) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = (r / rows) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

const ELLIPSE_PALETTE = [
  // each entry: [fill rgba, stroke hex]
  ['rgba(255,255,255,1.0)',  '#ffffff'],   // 0 soft tissue
  ['rgba(100,100,100,1.0)',  '#888888'],   // 1 parenchyma (inner brain)
  ['rgba(255,255,255,1.0)',  '#ffffff'],   // 2 calcification (outer skull) - used for idx 0
  ['rgba(40,40,40,1.0)',     '#222222'],   // 3 cyst A (ventricle)
  ['rgba(200,100,100,1.0)',  '#ef4444'],   // 4 blood vessel
  ['rgba(130,130,130,1.0)',  '#999999'],   // 5 fat
  ['rgba(130,130,130,1.0)',  '#999999'],   // 6 muscle
  ['rgba(40,40,40,1.0)',     '#222222'],   // 7 cyst B (ventricle)
  ['rgba(130,130,130,1.0)',  '#999999'],   // 8 nodule
  ['rgba(130,130,130,1.0)',  '#999999'],   // 9 deep tissue
];

function _drawEllipse(ctx, e, W, H, isHovered, isVessel) {
  const cx = e.centre_x * W;
  const cy = e.centre_y * H;
  const rx = e.semi_x   * W;
  const ry = e.semi_y   * H;
  const angle = (e.angle_deg || 0) * Math.PI / 180;

  // Pick colour by label index (fall back gracefully)
  const palIdx   = Math.min(
    ELLIPSE_PALETTE.length - 1,
    Math.max(0, (e._palette_idx !== undefined ? e._palette_idx : 0))
  );

  // Since we don't have _palette_idx on the raw objects, derive from label name
  const labelColours = {
    'Soft Tissue': 0, 'Parenchyma': 1, 'Calcification': 2,
    'Cyst A': 3, 'Blood Vessel': 4, 'Fat': 5,
    'Muscle': 6, 'Cyst B': 7, 'Nodule': 8, 'Deep Tissue': 9,
  };
  const pIdx = labelColours[e.label] ?? 0;
  const [fillColor, strokeColor] = ELLIPSE_PALETTE[pIdx];

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Fill
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Stroke
  ctx.strokeStyle = isHovered ? C_CYAN : (isVessel ? C_RED : strokeColor);
  ctx.lineWidth   = isHovered ? 2.5  : (isVessel ? 1.5 : 1.0);
  ctx.stroke();

  // Vessel pulsing glow
  if (isVessel) {
    ctx.shadowColor = C_RED;
    ctx.shadowBlur  = 10;
    ctx.stroke();
    ctx.shadowBlur  = 0;
  }

  ctx.restore();
}

function _drawProbe(ctx, xNorm, yNorm, steerDeg, W, H) {
  const px     = xNorm * W;
  const py     = yNorm * H;
  const probeW = 40;
  const probeH = 12;

  // Beam cone
  const steerRad  = steerDeg * Math.PI / 180;
  const coneDepth = H * 0.65;
  const coneHalf  = coneDepth * Math.tan(steerRad + Math.PI / 8);

  const gradient = ctx.createLinearGradient(px, py, px, py + coneDepth);
  gradient.addColorStop(0,   'rgba(34,211,238,0.20)');
  gradient.addColorStop(0.5, 'rgba(34,211,238,0.08)');
  gradient.addColorStop(1,   'rgba(34,211,238,0.00)');

  ctx.beginPath();
  ctx.moveTo(px - probeW / 2, py);
  ctx.lineTo(px + steerDeg / 30 * coneDepth - coneHalf, py + coneDepth);
  ctx.lineTo(px + steerDeg / 30 * coneDepth + coneHalf, py + coneDepth);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Probe body (rect at top)
  const grad2 = ctx.createLinearGradient(px - probeW / 2, py - probeH, px + probeW / 2, py);
  grad2.addColorStop(0, '#22d3ee');
  grad2.addColorStop(1, '#3b82f6');

  ctx.beginPath();
  const rX = px - probeW / 2;
  const rY = py - probeH;
  const rad = 4;
  ctx.moveTo(rX + rad, rY);
  ctx.lineTo(rX + probeW - rad, rY);
  ctx.quadraticCurveTo(rX + probeW, rY, rX + probeW, rY + rad);
  ctx.lineTo(rX + probeW, rY + probeH - rad);
  ctx.quadraticCurveTo(rX + probeW, rY + probeH, rX + probeW - rad, rY + probeH);
  ctx.lineTo(rX + rad, rY + probeH);
  ctx.quadraticCurveTo(rX, rY + probeH, rX, rY + probeH - rad);
  ctx.lineTo(rX, rY + rad);
  ctx.quadraticCurveTo(rX, rY, rX + rad, rY);
  ctx.closePath();
  ctx.fillStyle = grad2;
  ctx.fill();

  // Centre scan-line
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + steerDeg / 30 * coneDepth, py + coneDepth);
  ctx.strokeStyle = 'rgba(34,211,238,0.5)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function _drawRuler(ctx, W, H, depthCm) {
  const steps = 8;
  ctx.font      = '9px Consolas, monospace';
  ctx.fillStyle = C_TEXT;
  for (let i = 0; i <= steps; i++) {
    const y   = (i / steps) * H;
    const val = (i / steps) * depthCm;
    ctx.fillText(`${val.toFixed(0)}cm`, 4, y + 3);
    ctx.beginPath();
    ctx.moveTo(20, y); ctx.lineTo(W, y);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(42,49,72,0.5)' : 'transparent';
    ctx.lineWidth = 0.3;
    ctx.stroke();
  }
}

// ── A-mode waveform ───────────────────────────────────────────────────────────

/**
 * Draw the A-mode waveform on a canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} depths_cm     - depth values
 * @param {number[]} amplitudes    - amplitude values [0, ...]
 * @param {number} W  canvas width
 * @param {number} H  canvas height
 */
export function drawAMode(ctx, depths_cm, amplitudes, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, W, H);

  if (!depths_cm || depths_cm.length === 0) {
    _noDataLabel(ctx, W, H, 'No A-mode data');
    return;
  }

  const maxDepth = depths_cm[depths_cm.length - 1] || 8.0;
  const maxAmp   = Math.max(...amplitudes, 0.01);
  const N        = depths_cm.length;

  // Grid
  _drawGrid(ctx, W, H, 10, 8);

  // Axis labels
  ctx.font      = '9px Consolas, monospace';
  ctx.fillStyle = C_TEXT;
  ctx.fillText('Depth (cm)', W / 2 - 28, H - 4);
  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Amplitude', -28, 0);
  ctx.restore();

  // Waveform path
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const x = (depths_cm[i] / maxDepth) * (W - 30) + 20;
    const y = H - (amplitudes[i] / maxAmp) * (H - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else          ctx.lineTo(x, y);
  }

  // Glowing cyan stroke
  ctx.shadowColor = C_CYAN;
  ctx.shadowBlur  = 6;
  ctx.strokeStyle = C_CYAN;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Fill below waveform
  ctx.lineTo((depths_cm[N - 1] / maxDepth) * (W - 30) + 20, H - 10);
  ctx.lineTo(20, H - 10);
  ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
  fillGrad.addColorStop(0, 'rgba(34,211,238,0.20)');
  fillGrad.addColorStop(1, 'rgba(34,211,238,0.00)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Depth tick marks
  ctx.fillStyle = C_TEXT;
  ctx.font      = '8px Consolas, monospace';
  for (let cm = 0; cm <= maxDepth; cm += 2) {
    const x = (cm / maxDepth) * (W - 30) + 20;
    ctx.fillText(`${cm}`, x - 4, H - 2);
    ctx.beginPath();
    ctx.moveTo(x, H - 10); ctx.lineTo(x, H - 15);
    ctx.strokeStyle = C_GRID;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }
}

// ── B-mode image ──────────────────────────────────────────────────────────────

/**
 * Draw the B-mode grayscale image on a canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} image  - [n_samples][n_lines], values [0, 1]
 * @param {number} W    canvas width
 * @param {number} H    canvas height
 * @param {number} widthCm
 * @param {number} depthCm
 */
export function drawBMode(ctx, image, W, H, widthCm, depthCm) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (!image || image.length === 0 || W === 0 || H === 0) {
    _noDataLabel(ctx, W, H, 'No B-mode data');
    return;
  }

  const nSamples = image.length;       // rows (depth)
  const nLines   = image[0].length;    // columns (lateral)

  // Build ImageData using a temporary off-screen canvas element
  const offscreen = document.createElement('canvas');
  offscreen.width  = nLines;
  offscreen.height = nSamples;
  const offCtx    = offscreen.getContext('2d');
  const imgData   = offCtx.createImageData(nLines, nSamples);
  const data      = imgData.data;

  for (let row = 0; row < nSamples; row++) {
    for (let col = 0; col < nLines; col++) {
      const val  = Math.min(1, Math.max(0, image[row][col]));
      const gray = Math.round(val * 255);
      const idx  = (row * nLines + col) * 4;
      data[idx]     = gray;
      data[idx + 1] = gray;
      data[idx + 2] = gray;
      data[idx + 3] = 255;
    }
  }
  offCtx.putImageData(imgData, 0, 0);

  // Scale to canvas
  const marginL = 24, marginB = 18;
  ctx.drawImage(offscreen, marginL, 0, W - marginL, H - marginB);

  // Lateral axis
  ctx.font      = '8px Consolas, monospace';
  ctx.fillStyle = C_TEXT;
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const x   = marginL + (i / steps) * (W - marginL);
    const val = ((i / steps) - 0.5) * widthCm;
    ctx.fillText(`${val.toFixed(1)}`, x - 8, H - 4);
  }
  ctx.fillText('Lateral (cm)', W / 2 - 30, H - 4);

  // Depth axis
  for (let i = 0; i <= 4; i++) {
    const y   = (i / 4) * (H - marginB);
    const val = (i / 4) * depthCm;
    ctx.fillText(`${val.toFixed(0)}`, 2, y + 4);
  }

  // Border glow
  ctx.strokeStyle = 'rgba(34,211,238,0.25)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(marginL, 0, W - marginL, H - marginB);
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _noDataLabel(ctx, W, H, msg) {
  ctx.font      = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(88,100,120,0.8)';
  ctx.textAlign = 'center';
  ctx.fillText(msg, W / 2, H / 2);
  ctx.textAlign = 'left';
}
