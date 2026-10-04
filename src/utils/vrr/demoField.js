/**
 * The second sample of the Voidage Replacement Monitor (VRR-U2-005): a
 * 24-month demo field beside the template ledger. The template stays the
 * engine fixture the T1 test pins (3 months, 4 wells); this one shows what
 * the template cannot: free gas once the pressure falls below the bubble
 * point, a producer below its solution GOR (so the per-well free gas differs
 * from the field figure), water injection ramping up, gas injection from the
 * ninth month, quarterly pressure surveys, two patterns with an allocation,
 * a stated datum, and registry locations for the bubble map.
 *
 * Illustrative volumes, built by rule (no random numbers), so every number
 * of the sample can be reproduced:
 *   oil rate of producer k   q0_k exp(-0.025 t) BOPD, t = month index 0..23
 *   water cut                min(0.65, wc0_k + 0.018 t)
 *   produced GOR             550 scf/STB until month 5, then 550 (1 + g_k (t - 5)) for the
 *                            producers that see free gas; DP-5 stays at 480 (below Rs 550)
 *   water injection          WI-1 and WI-2 from month 2, ramping to 3,400 and 3,000 BWPD by month 8;
 *                            WI-3 from month 12 at 2,000 BWPD
 *   gas injection            GI-1 from month 8 at 2,000 Mscf/d
 *   monthly volume           rate x the calendar days of the month
 * The FVF set is the app's starting set (Bo 1.25, Bw 1.02, Bg 0.9 RB/Mscf,
 * Rs 550 scf/STB), stated in the sample note as illustrative.
 *
 * Pure.
 */

export const DEMO_NOTE = 'The built-in 24-month demo field of the app (6 producers, 3 water injectors, 1 gas injector, January 2024 to December 2025; illustrative volumes built by rule, with free gas, gas injection, quarterly surveys and two patterns).';

const START_YEAR = 2024;
const MONTHS = 24;
const monthLabel = (t) => {
  const y = START_YEAR + Math.floor(t / 12);
  const m = (t % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
};
const daysIn = (t) => {
  const y = START_YEAR + Math.floor(t / 12);
  const m = (t % 12) + 1;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const r0 = (v) => Math.round(v);

/** Producers: initial oil rate (BOPD), initial water cut, GOR growth per month after month 5 (0: stays at 550). */
export const DEMO_PRODUCERS = Object.freeze([
  { well: 'DP-1', q0: 1800, wc0: 0.04, g: 0.06 },
  { well: 'DP-2', q0: 1500, wc0: 0.06, g: 0.05 },
  { well: 'DP-3', q0: 1300, wc0: 0.08, g: 0.04 },
  { well: 'DP-4', q0: 1100, wc0: 0.05, g: 0.03 },
  { well: 'DP-5', q0: 900, wc0: 0.10, g: null }, // below its solution GOR (480)
  { well: 'DP-6', q0: 700, wc0: 0.12, g: 0.02 },
]);

const waterInjRate = (well, t) => {
  if (well === 'WI-1') return t < 2 ? 0 : Math.min(3400, 1200 + (t - 2) * 2200 / 6);
  if (well === 'WI-2') return t < 2 ? 0 : Math.min(3000, 1000 + (t - 2) * 2000 / 6);
  if (well === 'WI-3') return t < 12 ? 0 : 2000;
  return 0;
};

/** The ledger rows of the demo field (one row per well per month, volumes). */
export function demoFieldRows() {
  const rows = [];
  for (let t = 0; t < MONTHS; t += 1) {
    const date = monthLabel(t);
    const days = daysIn(t);
    for (const p of DEMO_PRODUCERS) {
      const oil = p.q0 * Math.exp(-0.025 * t);
      const wc = Math.min(0.65, p.wc0 + 0.018 * t);
      const water = oil * wc / (1 - wc);
      const gor = p.g == null ? 480 : t <= 5 ? 550 : 550 * (1 + p.g * (t - 5));
      rows.push({ date, well: p.well, oil_stb: r0(oil * days), water_stb: r0(water * days), gas_mscf: r0(oil * gor * days / 1000), winj_stb: 0, ginj_mscf: 0 });
    }
    for (const w of ['WI-1', 'WI-2', 'WI-3']) {
      const q = waterInjRate(w, t);
      if (q > 0) rows.push({ date, well: w, oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: r0(q * days), ginj_mscf: 0 });
    }
    if (t >= 8) rows.push({ date, well: 'GI-1', oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 0, ginj_mscf: r0(2000 * days) });
  }
  return rows;
}

/** Quarterly average reservoir pressure surveys (psia): a fall below the bubble point, then a partial recovery. */
export const DEMO_SURVEYS = Object.freeze([
  { date: '2024-01-15', p_psia: 3050 },
  { date: '2024-04-15', p_psia: 2880 },
  { date: '2024-07-15', p_psia: 2700 },
  { date: '2024-10-15', p_psia: 2560 },
  { date: '2025-01-15', p_psia: 2480 },
  { date: '2025-04-15', p_psia: 2470 },
  { date: '2025-07-15', p_psia: 2520 },
  { date: '2025-10-15', p_psia: 2580 },
  { date: '2025-12-15', p_psia: 2610 },
]);

export const DEMO_PATTERNS = Object.freeze([
  { id: 'demo-west', name: 'West', producers: ['DP-1', 'DP-2', 'DP-3'] },
  { id: 'demo-east', name: 'East', producers: ['DP-4', 'DP-5', 'DP-6'] },
]);
export const DEMO_ALLOCATION = Object.freeze({
  'WI-1': { 'DP-1': '0.4', 'DP-2': '0.35', 'DP-3': '0.25' },
  'WI-2': { 'DP-4': '0.4', 'DP-5': '0.3', 'DP-6': '0.3' },
  'WI-3': { 'DP-2': '0.3', 'DP-3': '0.2', 'DP-4': '0.3', 'DP-5': '0.2' },
  'GI-1': { 'DP-1': '0.5', 'DP-2': '0.5' },
});

/** Surface locations of the demo wells for the wells registry (EPSG:26332, metres): a line drive. */
export const DEMO_LOCATIONS = Object.freeze([
  ['DP-1', 502000, 121500], ['DP-2', 502800, 121500], ['DP-3', 503600, 121500],
  ['DP-4', 502000, 120300], ['DP-5', 502800, 120300], ['DP-6', 503600, 120300],
  ['WI-1', 502400, 122200], ['WI-2', 503200, 119600], ['WI-3', 502800, 120900], ['GI-1', 502400, 121900],
]);

/**
 * The demo field as project inputs (merge over defaultInputs()).
 * @returns {object}
 */
export function demoFieldInputs() {
  const rows = demoFieldRows();
  const wells = new Set(rows.map((r) => r.well));
  return {
    mode: 'imported',
    wellRows: rows,
    pressureSurveys: DEMO_SURVEYS.map((s) => ({ ...s })),
    patterns: DEMO_PATTERNS.map((p) => ({ ...p, producers: [...p.producers] })),
    allocation: JSON.parse(JSON.stringify(DEMO_ALLOCATION)),
    datum: { depth: '8200', reference: 'TVDSS, the demo field datum (stated, no correction applied)' },
    sampleNote: DEMO_NOTE,
    importInfo: {
      kind: 'ledger', file: 'the demo field', sample: DEMO_NOTE,
      rowsRead: rows.length, skipped: 0, wells: wells.size, firstDate: rows[0].date, lastDate: rows[rows.length - 1].date,
      readBack: [], notUsed: [], warnings: [], units: { oil_stb: 'bbl', water_stb: 'bbl', gas_mscf: 'Mscf', winj_stb: 'bbl', ginj_mscf: 'Mscf' },
    },
    wellMap: null,
  };
}
