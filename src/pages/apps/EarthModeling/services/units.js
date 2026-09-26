// Display units for Earth Modeling (EM0, 2026-09-06). The engine keeps
// metres positive-down and cubic metres; these helpers convert at the
// edge. Depth follows the account's Geoscience depth unit (the Mapping
// MS5 setting) with a browser fallback; volume units are a display
// choice of their own. Pure, no I/O.

import { toDisplay } from '@/components/wells/depthModes';

export const DEPTH_UNIT_KEY = 'em.depthUnit';
export const VOLUME_UNITS_KEY = 'em.volumeUnits';

export const M3_PER_ACRE_FT = 1233.48183754752;
export const M3_PER_BBL = 0.158987294928;

/** Volume unit sets: bulk and net rock volume, pore and hydrocarbon pore volume. */
export const VOLUME_UNIT_SETS = Object.freeze({
  metric: { key: 'metric', label: 'metric (10^6 m3)', rock: '10^6 m3', pore: '10^6 m3', oil: '10^6 sm3', gas: '10^6 sm3' },
  field: { key: 'field', label: 'field (acre-ft, MMbbl)', rock: 'acre-ft', pore: 'MMbbl', oil: 'MMstb', gas: 'Bscf' },
});
export const VOLUME_COLUMNS = Object.freeze({
  bulk_m3: 'rock', net_m3: 'rock', pore_m3: 'pore', hcpv_m3: 'pore',
  // T1 (EM-T1-001): split HCPV and in-place volumes at surface conditions
  oil_hcpv_m3: 'pore', gas_hcpv_m3: 'pore', stoiip_m3: 'oil', giip_m3: 'gas',
});
export const SCF_PER_SM3 = 35.3146667;

/** Read a remembered display choice; `fallback` when absent or blocked. */
export function readSetting(key, allowed, fallback) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}

/** Cubic metres to the display value of a volume column. */
export function volumeValue(m3, column, units = 'metric') {
  if (!Number.isFinite(m3)) return null;
  const kind = VOLUME_COLUMNS[column] || 'rock';
  if (units === 'field') {
    if (kind === 'rock') return m3 / M3_PER_ACRE_FT;
    if (kind === 'gas') return (m3 * SCF_PER_SM3) / 1e9;
    return m3 / M3_PER_BBL / 1e6; // pore MMbbl, oil MMstb
  }
  return m3 / 1e6;
}

/** Formatted volume, three decimals in metric, one in field rock units. */
export function fmtVolume(m3, column, units = 'metric') {
  const v = volumeValue(m3, column, units);
  if (v === null) return '—';
  const kind = VOLUME_COLUMNS[column] || 'rock';
  return v.toFixed(units === 'field' && kind === 'rock' ? 1 : 3);
}

/** Header unit for a volume column. */
export function volumeUnitLabel(column, units = 'metric') {
  const set = VOLUME_UNIT_SETS[units] || VOLUME_UNIT_SETS.metric;
  return set[VOLUME_COLUMNS[column] || 'rock'];
}

/** A depth (metres) in the display unit with `digits`. */
export const fmtDepth = (m, unit = 'm', digits = 2) => (Number.isFinite(m) ? toDisplay(m, unit).toFixed(digits) : '—');
