/**
 * ui.js — helper to wire DOM sliders to a RadarSimulator instance.
 * This keeps RadarMode.jsx clean of repetitive event-handler boilerplate.
 */

/**
 * Format a frequency in Hz to a human-readable string.
 * e.g. 10e9 → "10.0 GHz", 500e6 → "500 MHz"
 * @param {number} hz
 * @returns {string}
 */
export function formatFrequency(hz) {
  if (hz >= 1e9) {
    return `${(hz / 1e9).toFixed(1)} GHz`
  }
  if (hz >= 1e6) {
    return `${(hz / 1e6).toFixed(1)} MHz`
  }
  if (hz >= 1e3) {
    return `${(hz / 1e3).toFixed(1)} kHz`
  }
  return `${hz.toFixed(0)} Hz`
}

/**
 * Format a range in metres.
 * e.g. 1500 → "1.50 km", 250 → "250 m"
 * @param {number} m
 * @returns {string}
 */
export function formatRange(m) {
  if (m >= 1000) {
    return `${(m / 1000).toFixed(2)} km`
  }
  return `${m.toFixed(0)} m`
}

/**
 * Format time delay in nanoseconds.
 * e.g. 0.0000000015 → "1.50 ns"
 * @param {number} s
 * @returns {string}
 */
export function formatDelay(s) {
  const ns = s * 1e9
  return `${ns.toFixed(2)} ns`
}

/**
 * Format dBm value.
 * @param {number} dbm
 * @returns {string}
 */
export function formatDbm(dbm) {
  return `${dbm.toFixed(1)} dBm`
}

/**
 * Format RCS in m².
 * e.g. 0.5 → "0.50 m²", 100 → "100 m²"
 * @param {number} rcs
 * @returns {string}
 */
export function formatRcs(rcs) {
  if (rcs >= 10) {
    return `${rcs.toFixed(0)} m²`
  }
  return `${rcs.toFixed(2)} m²`
}
