/**
 * radar_api.js — Spec-named API wrapper for radar fetch calls.
 *
 * Provides convenience functions for all radar endpoints.
 * Wraps the shared apiClient.
 */
import { postJSON } from '../../engine/apiClient.js'

/**
 * Send a radar tick to the backend (per-frame update).
 * @param {object} body  — full RadarTickRequest payload
 * @returns {Promise<object>}
 */
export async function radarTick(body) {
  return postJSON('/api/radar/tick', body)
}

/**
 * Fetch a beam pattern snapshot (no sweep advance).
 * @param {object} body  — PatternRequest payload
 * @returns {Promise<object>}
 */
export async function radarPattern(body) {
  return postJSON('/api/radar/pattern', body)
}

/**
 * Fetch per-element time delays.
 * @param {object} body  — DelaysRequest payload
 * @returns {Promise<object>}
 */
export async function radarDelays(body) {
  return postJSON('/api/radar/delays', body)
}

/**
 * Evaluate targets for Lock-and-Size.
 * Sends detection history and returns sizing results.
 * @param {object} body  — LockSizeRequest payload
 * @returns {Promise<object>}
 */
export async function radarLockSize(body) {
  return postJSON('/api/radar/lock-size', body)
}
