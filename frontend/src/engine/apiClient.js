/**
 * apiClient.js — shared fetch wrapper for BeamSim backend.
 * Base URL read from import.meta.env.VITE_API_URL or defaults to
 * 'http://localhost:8000'.
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * POST JSON to a backend endpoint.
 * @param {string} path  e.g. '/api/radar/tick'
 * @param {object} body  will be JSON-serialised
 * @returns {Promise<object>} parsed JSON response
 */
export async function postJSON(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * GET from a backend endpoint.
 * @param {string} path
 * @returns {Promise<object>}
 */
export async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
