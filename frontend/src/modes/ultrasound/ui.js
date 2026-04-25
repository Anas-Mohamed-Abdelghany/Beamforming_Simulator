/**
 * modes/ultrasound/ui.js
 * ======================
 * Default parameter state and slider/select definitions for the Ultrasound
 * mode sidebar.  No React — pure data, imported by UltrasoundMode.jsx.
 */

// ── Default parameter objects ─────────────────────────────────────────────────

export const DEFAULT_BEAM = {
  frequency_mhz:  5.0,
  n_elements:     64,
  spacing_mm:     0.4,
  curvature_mm:   0.0,
  focal_depth_mm: 40.0,
  snr:            800.0,
  apodization:    'hanning',
};

export const DEFAULT_PROBE = {
  probe_x_cm: 4.0,
  probe_y_cm: 0.0,
  angle_deg:  0.0,
};

export const DEFAULT_BMODE = {
  aperture_cm: 4.0,
  n_lines:     64,
};

export const DEFAULT_DOPPLER = {
  velocity_cm_s:   60.0,
  vessel_angle_deg: 60.0,
  frequency_mhz:   5.0,
};

// ── Slider definitions ────────────────────────────────────────────────────────

/** @typedef {{ key: string, label: string, min: number, max: number, step: number, unit: string }} SliderDef */

/** @type {SliderDef[]} */
export const BEAM_SLIDERS = [
  { key: 'frequency_mhz',  label: 'Frequency',    min: 1.0,  max: 15.0,  step: 0.5,  unit: 'MHz', decimals: 1 },
  { key: 'n_elements',     label: 'Elements',     min: 16,   max: 256,   step: 8,    unit: '',    decimals: 0 },
  { key: 'spacing_mm',     label: 'Pitch',        min: 0.1,  max: 1.5,   step: 0.05, unit: 'mm',   decimals: 2 },
  { key: 'curvature_mm',   label: 'Curvature',    min: 0.0,  max: 200.0, step: 5.0,  unit: 'mm',   decimals: 0 },
  { key: 'focal_depth_mm', label: 'Focal Depth',  min: 5.0,  max: 150.0, step: 5.0,  unit: 'mm',   decimals: 0 },
  { key: 'snr',            label: 'SNR',          min: 0,    max: 1000,  step: 10,   unit: '',    decimals: 0 },
];

/** Supported apodization windows */
export const APODIZATION_OPTIONS = ['none', 'hanning', 'hamming', 'blackman'];

/** @type {SliderDef[]} */
export const DOPPLER_SLIDERS = [
  { key: 'velocity_cm_s',    label: 'Blood Vel.',  min: 1.0,  max: 200.0, step: 1.0,  unit: 'cm/s', decimals: 0 },
  { key: 'vessel_angle_deg', label: 'Angle θ',     min: 0.0,  max: 89.0,  step: 1.0,  unit: '°',    decimals: 0 },
];

/** @type {SliderDef[]} */
export const PROBE_SLIDERS = [
  { key: 'angle_deg', label: 'Steer Angle', min: -30.0, max: 30.0, step: 1.0, unit: '°', decimals: 0 },
];

/** @type {SliderDef[]} */
export const BMODE_SLIDERS = [
  { key: 'aperture_cm', label: 'Aperture', min: 0.5, max: 8.0, step: 0.5, unit: 'cm', decimals: 1 },
  { key: 'n_lines',     label: 'Lines',    min: 16,  max: 128, step: 8,   unit: '',   decimals: 0 },
];

// ── Colour map: label index → RGBA ────────────────────────────────────────────
// Matches the Shepp-Logan tissue types in phantom_engine.py (1-indexed).

export const TISSUE_COLORS = [
  'rgba(0,0,0,0)',           // 0  background (transparent)
  'rgba(80,60,40,0.55)',     // 1  Soft Tissue
  'rgba(110,80,50,0.45)',    // 2  Parenchyma
  'rgba(230,230,230,0.75)',  // 3  Calcification
  'rgba(20,120,200,0.35)',   // 4  Cyst A
  'rgba(200,50,50,0.65)',    // 5  Blood Vessel
  'rgba(240,210,120,0.50)',  // 6  Fat
  'rgba(60,140,60,0.55)',    // 7  Muscle
  'rgba(30,100,180,0.30)',   // 8  Cyst B
  'rgba(255,180,80,0.70)',   // 9  Nodule
  'rgba(90,70,55,0.50)',     // 10 Deep Tissue
];
