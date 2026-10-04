/**
 * The results CSV of Reservoir Simulation Studio (SIM-U1-009; RL7, RL12).
 * Built in the app from the run's summary.json, in the display units, so it
 * holds what the Results charts show: `#` lines with the case, the run, the
 * deck SHA-256, the simulator, the deck unit system and the display units,
 * and whether the series was thinned; then a header row and a units row;
 * then one row per plotted time step with the calendar date and the
 * simulator day. Before, the button fetched the worker's CSV: FIELD numbers
 * with no units row, thinned above 5,000 points without saying so.
 *
 * Pure.
 */
import { fieldRows, wellRows, summaryUnitSystem, dayToIso } from './series.js';
import { vectorView, displayUnitsLine } from './simUnits.js';
import { VECTOR_META } from '@/components/simstudio/resultAdapters';

const csvCell = (v) => {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const t = typeof v === 'number' ? String(parseFloat(v.toPrecision(8))) : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * @param {{summary: object, run?: object, caseRow?: object, system?: string, deckSystem?: ?string}} a
 * @returns {string}
 */
export function buildResultsCsv({ summary, run = null, caseRow = null, system = 'oilfield', deckSystem = null }) {
  const us = summaryUnitSystem(summary, deckSystem);
  const opts = { deckSystem: us.system, system };
  const st = summary?.steps;
  const head = [
    `# Reservoir Simulation Studio results: case "${caseRow?.name || ''}", run ${run?.id || ''}`,
    `# Simulator: OPM Flow ${summary?.opm_version || ''}; deck SHA-256 ${summary?.deck_sha256 || run?.deck_sha256 || ''}`,
    `# Deck unit system: ${us.system} (${us.basis}); values below in ${displayUnitsLine(system)}`,
    st
      ? `# Rows: ${st.points} of ${st.time_steps} simulator time steps${st.stride > 1 ? ` (thinned: 1 time step in ${st.stride})` : ' (all)'}; ${st.report_steps ?? ''} report steps`
      : `# Rows: ${summary?.days?.length || 0} points (the worker build that ran this did not record whether they were thinned)`,
    '# date is the run start plus the simulator day (UTC); rates are surface rates; pressure is absolute',
  ];
  const fieldKeys = Object.keys(VECTOR_META).filter((k) => /^F/.test(k) && Array.isArray(summary?.field?.[k]));
  const histKeys = Object.keys(summary?.field || {}).filter((k) => /H$/.test(k) && fieldKeys.includes(k.slice(0, -1)));
  const cols = [];
  for (const k of [...fieldKeys, ...histKeys]) {
    const v = vectorView(k, us.system, system);
    cols.push({ name: k, unit: v.label, rows: fieldRows(summary, k.endsWith('H') ? k.slice(0, -1) : k, opts), key: k.endsWith('H') ? 'observed' : 'value' });
  }
  const wellBases = ['WOPR', 'WWPR', 'WGPR', 'WBHP', 'WWCT', 'WWIR', 'WGIR'];
  for (const base of wellBases) {
    const rows = wellRows(summary, base, opts);
    const v = vectorView(base, us.system, system);
    for (const [well, entry] of Object.entries(summary?.wells || {})) {
      if (Array.isArray(entry[base])) cols.push({ name: `${base}:${well}`, unit: v.label, rows, key: well });
    }
  }
  const lines = [...head];
  lines.push(['date', 'days', ...cols.map((c) => c.name)].map(csvCell).join(','));
  lines.push(['', 'days', ...cols.map((c) => c.unit)].map(csvCell).join(','));
  (summary?.days || []).forEach((day, i) => {
    lines.push([dayToIso(summary, day) || '', day, ...cols.map((c) => c.rows[i]?.[c.key])].map(csvCell).join(','));
  });
  return `${lines.join('\n')}\n`;
}
