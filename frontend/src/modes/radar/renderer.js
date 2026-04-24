/**
 * renderer.js
 * ─────────────
 * Two canvas renderers:
 *   RadarRenderer        → main PPI display (Plan Position Indicator)
 *   PolarPatternRenderer → beam gain pattern (small side display)
 *
 * All coordinates are in CANVAS pixels.
 * The radar origin maps to canvas centre.
 */

export class RadarRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} maxRangeM  — the physical range [m] that maps to canvas radius
   */
  constructor(canvas, maxRangeM = 300) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.maxRangeM = maxRangeM
  }

  /** @returns {number} pixels per metre */
  get pixelsPerMetre() {
    return this._maxRadius / this.maxRangeM
  }

  /** @returns {number} max radius in pixels (half the smaller canvas dimension) */
  get _maxRadius() {
    return Math.min(this.canvas.width, this.canvas.height) / 2 * 0.92
  }

  /** @returns {{x: number, y: number}} canvas centre */
  get _centre() {
    return { x: this.canvas.width / 2, y: this.canvas.height / 2 }
  }

  /**
   * Dim the canvas by painting a translucent black rect — creates phosphor trail.
   * alpha ~0.03–0.06 gives a ~1.5–2 second decay at 60 fps.
   * @param {number} alpha
   */
  fadeFrame(alpha = 0.04) {
    const ctx = this.ctx
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * Draw N evenly-spaced concentric range rings with labels.
   * @param {number} numRings
   */
  drawRangeRings(numRings = 5) {
    const ctx = this.ctx
    const c = this._centre
    const maxR = this._maxRadius

    ctx.strokeStyle = 'rgba(0, 200, 80, 0.25)'
    ctx.lineWidth = 1
    ctx.font = '10px Consolas, monospace'
    ctx.fillStyle = 'rgba(0, 200, 80, 0.4)'

    for (let i = 1; i <= numRings; i++) {
      const r = (i / numRings) * maxR
      const rangeLabel = Math.round((i / numRings) * this.maxRangeM)

      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillText(`${rangeLabel}m`, c.x + r + 4, c.y - 4)
    }
  }

  /**
   * Draw azimuth lines every 30°.
   */
  drawAzimuthLines() {
    const ctx = this.ctx
    const c = this._centre
    const maxR = this._maxRadius

    ctx.strokeStyle = 'rgba(0, 200, 80, 0.15)'
    ctx.lineWidth = 1
    ctx.font = '9px Consolas, monospace'
    ctx.fillStyle = 'rgba(0, 200, 80, 0.35)'

    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg - 90) * Math.PI / 180  // 0° = up (north)
      const ex = c.x + Math.cos(rad) * maxR
      const ey = c.y + Math.sin(rad) * maxR

      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(ex, ey)
      ctx.stroke()

      // Label
      const lx = c.x + Math.cos(rad) * (maxR + 14)
      const ly = c.y + Math.sin(rad) * (maxR + 14)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${deg}°`, lx, ly)
    }
  }

  /**
   * Draw the current beam lobe as a filled semi-transparent polygon.
   * gainProfile: [{angle, gain}] from the backend.
   * The polygon sweeps from radar origin, with each point at
   * distance = gain * maxRangeM * radiusScaleFactor.
   * @param {Array<{angle: number, gain: number}>} gainProfile
   * @param {string} color
   */
  drawBeamLobe(gainProfile, color = 'rgba(139,92,246,0.4)') {
    if (!gainProfile || gainProfile.length === 0) return
    const ctx = this.ctx
    const c = this._centre
    const maxR = this._maxRadius

    ctx.beginPath()
    ctx.moveTo(c.x, c.y)

    for (let i = 0; i < gainProfile.length; i++) {
      const p = gainProfile[i]
      const rad = (p.angle - 90) * Math.PI / 180
      const dist = p.gain * maxR * 0.8
      const px = c.x + Math.cos(rad) * dist
      const py = c.y + Math.sin(rad) * dist
      if (i === 0) {
        ctx.lineTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    }

    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  /**
   * Draw a sweep line at currentAngleDeg, length = maxRadius.
   * @param {number} angleDeg
   * @param {string} color
   */
  drawSweepLine(angleDeg, color = '#8b5cf6') {
    const ctx = this.ctx
    const c = this._centre
    const maxR = this._maxRadius
    const rad = (angleDeg - 90) * Math.PI / 180

    const endX = c.x + Math.cos(rad) * maxR
    const endY = c.y + Math.sin(rad) * maxR

    // Glow effect
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = 12

    ctx.beginPath()
    ctx.moveTo(c.x, c.y)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.restore()

    // Brighter leading edge
    const grad = ctx.createLinearGradient(c.x, c.y, endX, endY)
    grad.addColorStop(0, 'rgba(139,92,246,0.0)')
    grad.addColorStop(0.7, 'rgba(139,92,246,0.3)')
    grad.addColorStop(1, 'rgba(139,92,246,0.8)')
    ctx.beginPath()
    ctx.moveTo(c.x, c.y)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = grad
    ctx.lineWidth = 3
    ctx.stroke()
  }

  /**
   * Draw a target on the PPI.
   * detected=true → bright blip; detected=false → dim dot.
   * rcs controls the blip radius (larger RCS → bigger blip).
   * ageMs: how many ms since last detection (fades older blips).
   * @param {number} xM
   * @param {number} yM
   * @param {boolean} detected
   * @param {number} rcs
   * @param {number} ageMs
   */
  drawTarget(xM, yM, detected, rcs, ageMs = 0) {
    const { cx, cy } = this.metresToCanvas(xM, yM)
    const ctx = this.ctx
    const blipR = Math.max(4, Math.min(20, rcs * 2))

    if (detected) {
      // Bright blip with glow
      const ageFade = Math.max(0.2, 1.0 - ageMs / 5000)

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, blipR * 2)
      gradient.addColorStop(0, `rgba(97, 218, 251, ${ageFade})`)
      gradient.addColorStop(0.5, `rgba(97, 218, 251, ${ageFade * 0.5})`)
      gradient.addColorStop(1, `rgba(97, 218, 251, 0)`)

      ctx.beginPath()
      ctx.arc(cx, cy, blipR * 2, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()

      // Core blip
      ctx.beginPath()
      ctx.arc(cx, cy, blipR, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(97, 218, 251, ${ageFade})`
      ctx.fill()
    } else {
      // Dim dot
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(90, 100, 120, 0.5)'
      ctx.fill()
    }
  }

  /**
   * Draw the array element positions as small tick marks at canvas centre.
   * delays: per-element time delays in seconds (longer delay → warmer colour).
   * @param {number} numElements
   * @param {number} spacingM
   * @param {Array<number>} delays
   */
  drawArrayElements(numElements, spacingM, delays) {
    const ctx = this.ctx
    const c = this._centre
    const ppm = this.pixelsPerMetre
    const totalW = (numElements - 1) * spacingM * ppm

    // Find max delay for colour mapping
    const maxDelay = delays && delays.length > 0
      ? Math.max(...delays.map(d => Math.abs(d)))
      : 1

    for (let i = 0; i < numElements; i++) {
      const x = c.x - totalW / 2 + i * spacingM * ppm
      const y = c.y

      // Colour by delay magnitude
      let t = 0
      if (delays && delays[i] !== undefined && maxDelay > 0) {
        t = Math.abs(delays[i]) / maxDelay
      }
      const r = Math.round(60 + t * 195)
      const g = Math.round(218 - t * 130)
      const b = Math.round(251 - t * 200)

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.fillRect(x - 1, y - 4, 2, 8)
    }
  }

  /**
   * Convert physical metres to canvas coords. Origin = centre.
   * @param {number} xM
   * @param {number} yM
   * @returns {{cx: number, cy: number}}
   */
  metresToCanvas(xM, yM) {
    const c = this._centre
    const ppm = this.pixelsPerMetre
    return {
      cx: c.x + xM * ppm,
      cy: c.y - yM * ppm,  // y inverted
    }
  }

  /**
   * Convert polar (range in metres, angle in degrees) to canvas coords.
   * @param {number} rangeM
   * @param {number} angleDeg
   * @returns {{cx: number, cy: number}}
   */
  polarToCanvas(rangeM, angleDeg) {
    const xM = rangeM * Math.cos(angleDeg * Math.PI / 180)
    const yM = rangeM * Math.sin(angleDeg * Math.PI / 180)
    return this.metresToCanvas(xM, yM)
  }
}


export class PolarPatternRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
  }

  /** @returns {number} drawing radius */
  get _radius() {
    return Math.min(this.canvas.width, this.canvas.height) / 2 * 0.9
  }

  /** @returns {{x: number, y: number}} centre */
  get _centre() {
    return { x: this.canvas.width / 2, y: this.canvas.height / 2 }
  }

  /**
   * Draw the full polar gain pattern.
   * gainProfile: [{angle, gain}] — gain in [0,1].
   * The pattern is drawn as a closed polygon; axis goes from -180 to +180.
   * Include concentric reference rings at 0.25, 0.5, 0.75, 1.0.
   * @param {Array<{angle: number, gain: number}>} gainProfile
   * @param {string} color
   */
  drawPolarPattern(gainProfile, color = '#8b5cf6') {
    if (!gainProfile || gainProfile.length === 0) return
    const ctx = this.ctx
    const c = this._centre
    const maxR = this._radius

    // Reference rings
    ctx.strokeStyle = 'rgba(42, 49, 72, 0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 4])
    for (const frac of [0.25, 0.5, 0.75, 1.0]) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, maxR * frac, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Ring labels
    ctx.font = '8px Consolas, monospace'
    ctx.fillStyle = 'rgba(90, 100, 120, 0.6)'
    ctx.textAlign = 'left'
    for (const frac of [0.25, 0.5, 0.75, 1.0]) {
      ctx.fillText(`${frac.toFixed(2)}`, c.x + 2, c.y - maxR * frac + 8)
    }

    // Axis lines
    ctx.strokeStyle = 'rgba(42, 49, 72, 0.3)'
    ctx.lineWidth = 1
    for (let deg = 0; deg < 360; deg += 90) {
      const rad = (deg - 90) * Math.PI / 180
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(c.x + Math.cos(rad) * maxR, c.y + Math.sin(rad) * maxR)
      ctx.stroke()
    }

    // Pattern polygon fill
    ctx.beginPath()
    for (let i = 0; i < gainProfile.length; i++) {
      const p = gainProfile[i]
      const rad = (p.angle - 90) * Math.PI / 180
      const dist = p.gain * maxR
      const px = c.x + Math.cos(rad) * dist
      const py = c.y + Math.sin(rad) * dist
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()

    // Fill with transparency
    const fillColor = color.startsWith('#')
      ? `${color}30`
      : color.replace(/[\d.]+\)$/, '0.15)')
    ctx.fillStyle = fillColor
    ctx.fill()

    // Stroke outline
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  /**
   * Overlay a radial line at angleDeg (current sweep direction).
   * @param {number} angleDeg
   */
  overlayCurrentAngle(angleDeg) {
    const ctx = this.ctx
    const c = this._centre
    const maxR = this._radius
    const rad = (angleDeg - 90) * Math.PI / 180

    ctx.beginPath()
    ctx.moveTo(c.x, c.y)
    ctx.lineTo(c.x + Math.cos(rad) * maxR, c.y + Math.sin(rad) * maxR)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Small dot at end
    ctx.beginPath()
    ctx.arc(
      c.x + Math.cos(rad) * maxR,
      c.y + Math.sin(rad) * maxR,
      3, 0, Math.PI * 2
    )
    ctx.fillStyle = '#f59e0b'
    ctx.fill()
  }

  /** Clear and redraw background. */
  clear() {
    const ctx = this.ctx
    ctx.fillStyle = '#0d0f14'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
