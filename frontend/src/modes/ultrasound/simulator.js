/**
 * modes/ultrasound/simulator.js
 * ==============================
 * Fetch API wrappers for the Ultrasound backend.
 * All calls hit  /api/ultrasound/*  via the Vite dev proxy (or direct BASE_URL).
 *
 * Every exported function returns a Promise<object>.
 * Errors surface as rejected Promises with { error: string }.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/ultrasound`;

// ── Generic fetch helper ──────────────────────────────────────────────────────

async function _post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

async function _get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

async function _patch(path, body) {
  const res = await fetch(`${API}${path}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch the phantom definition (ellipses + label_map).
 * @returns {Promise<{ellipses, label_map, size, width_cm, depth_cm}>}
 */
export async function fetchPhantom() {
  return _get('/phantom');
}

/**
 * Fetch A-mode scan line.
 * @param {object} probe  - { probe_x_cm, probe_y_cm, angle_deg }
 * @param {object} beamParams - beam parameter object
 * @returns {Promise<{depths_cm, amplitudes, depth_cm}>}
 */
export async function fetchAMode(probe, beamParams) {
  return _post('/amode', {
    probe_x_cm:  probe.probe_x_cm,
    probe_y_cm:  probe.probe_y_cm,
    angle_deg:   probe.angle_deg,
    beam_params: beamParams,
  });
}

/**
 * Fetch B-mode image.
 * @param {object} probe   - { probe_x_cm, probe_y_cm, angle_deg }
 * @param {object} beamParams
 * @param {number} aperture_cm
 * @param {number} n_lines
 * @returns {Promise<{image, width_cm, depth_cm, n_lines, n_samples}>}
 */
export async function fetchBMode(probe, beamParams, aperture_cm, n_lines) {
  return _post('/bmode', {
    probe_x_cm:  probe.probe_x_cm,
    probe_y_cm:  probe.probe_y_cm,
    angle_deg:   probe.angle_deg,
    beam_params: beamParams,
    aperture_cm,
    n_lines,
  });
}

/**
 * Fetch Doppler shift.
 * @param {number} velocity_cm_s
 * @param {number} vessel_angle_deg
 * @param {number} frequency_mhz
 * @returns {Promise<{fd_hz, velocity_cm_s, angle_deg, frequency_mhz, cos_theta, vessel_label}>}
 */
export async function fetchDoppler(velocity_cm_s, vessel_angle_deg, frequency_mhz) {
  return _post('/doppler', { velocity_cm_s, vessel_angle_deg, frequency_mhz });
}

/**
 * Edit a phantom ellipse (0-based index).
 * @param {number} idx
 * @param {object} props - subset of { acoustic_impedance, attenuation, reflection_coefficient, label, is_vessel }
 */
export async function patchEllipse(idx, props) {
  return _patch(`/phantom/ellipse/${idx}`, props);
}

/**
 * Reset phantom to defaults.
 */
export async function resetPhantom() {
  const res = await fetch(`${API}/phantom/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Reset failed');
  return res.json();
}

// ── Debounce utility ──────────────────────────────────────────────────────────

/**
 * Returns a debounced version of fn that fires after `delay` ms of inactivity.
 * Useful for slider / mouse-move events.
 * @param {Function} fn
 * @param {number}   delay  ms
 */
export function debounce(fn, delay = 100) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
