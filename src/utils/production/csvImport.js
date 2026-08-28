// Production data spine (P1) CSV importers. Suite-side by design, like
// the VRR importer it is modeled on: papaparse and file quirks stay at
// the boundary; the po_* tables hold normalized rows.
//
// Two parsers:
//   parseDailyProductionCSV — the po_daily_production ledger schema
//     { date, well, oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf,
//       hours_on } (VRR ledger units: liquids bbl/stb, gas Mscf)
//   parseWellTestCSV — the po_well_tests schema
//     { date, well, duration_hours, oil_rate_stbd, water_rate_stbd,
//       gas_rate_mscfd, thp_psia, choke_64ths }
//
// Date machinery (order inference, normalization) is imported from the
// VRR importer rather than re-derived. Alias matching is claim-once,
// most-specific-first, per the DCA csvParser lesson: injection columns
// resolve BEFORE their production twins so 'water' can never claim
// 'water_inj'.
import Papa from 'papaparse';
import { inferDateOrder, normalizeDate } from '@/utils/vrr/csvImport';

// ---- shared machinery ------------------------------------------------------

// Claim-once alias match over the actual headers, in alias-table order.
export function claimColumns(aliasTable, headers) {
  const mapping = {};
  const claimed = new Set();
  aliasTable.forEach(({ key, aliases }) => {
    for (const alias of aliases) {
      const found = headers.find(
        (h) => !claimed.has(h) && String(h).toLowerCase().includes(alias),
      );
      if (found) {
        mapping[key] = found;
        claimed.add(found);
        break;
      }
    }
  });
  return mapping;
}

function parseCsv(text) {
  const parsed = Papa.parse(String(text ?? '').replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => String(h).trim(),
  });
  return {
    data: parsed.data || [],
    headers: (parsed.meta?.fields || []).filter(Boolean),
  };
}

// Volumes and rates land in the ledger units: liquids bbl/stb (or
// stb/d), gas Mscf (or Mscf/d). Same header heuristics as VRR.
export function detectScale(header, kind) {
  const h = String(header || '').toLowerCase();
  if (kind === 'gas') {
    if (/bscf|bcf/.test(h)) return 1e6;
    if (/mmscf|mmcf/.test(h)) return 1000;
    if (/mscf|mcf/.test(h)) return 1;
    if (/scf/.test(h)) return 0.001;
    return 1;
  }
  if (kind === 'liquid') {
    if (/mmbbl|mmstb/.test(h)) return 1e6;
    if (/mbbl|mstb/.test(h)) return 1000;
    return 1;
  }
  return 1;
}

// Normalize a ledger/test date to a full 'YYYY-MM-DD'. Month-only values
// ('2025-01') become the first of the month; the caller warns once.
function normalizeFullDate(value, order, state) {
  const d = normalizeDate(value, order);
  if (!d) return null;
  if (/^\d{4}-\d{2}$/.test(d)) {
    state.monthly += 1;
    return `${d}-01`;
  }
  return d;
}

// ---- daily production ledger ----------------------------------------------

export const DAILY_ALIASES = [
  { key: 'date', aliases: ['prod_date', 'date', 'month', 'period', 'time'] },
  { key: 'well', aliases: ['well_name', 'wellname', 'well', 'uwi', 'api'] },
  { key: 'hours_on', aliases: ['hours_on', 'hrs_on', 'on_hours', 'uptime_hours', 'on_time', 'uptime', 'hours', 'hrs'] },
  { key: 'winj_stb', aliases: ['water_inj', 'winj', 'inj_bbl', 'inj_water', 'wtr_inj', 'wi'] },
  { key: 'ginj_mscf', aliases: ['gas_inj', 'ginj', 'inj_gas', 'gi'] },
  { key: 'oil_stb', aliases: ['oil_stb', 'oil_bbl', 'oil_prod', 'oil_rate', 'bopd', 'oil'] },
  { key: 'water_stb', aliases: ['water_stb', 'water_bbl', 'water_prod', 'water_rate', 'bwpd', 'water'] },
  { key: 'gas_mscf', aliases: ['gas_mscf', 'gas_mcf', 'gas_prod', 'gas_rate', 'gas'] },
];

const DAILY_VOLUME_KINDS = {
  oil_stb: 'liquid',
  water_stb: 'liquid',
  winj_stb: 'liquid',
  gas_mscf: 'gas',
  ginj_mscf: 'gas',
};
const DAILY_VOLUME_KEYS = Object.keys(DAILY_VOLUME_KINDS);

/**
 * Parse a daily (or monthly) per-well production/injection CSV into
 * po_daily_production rows. Returns { rows, report } — never throws on
 * data problems; every drop or adjustment is accounted for in the
 * report (nothing silent).
 */
export function parseDailyProductionCSV(text) {
  const report = {
    totalRows: 0,
    imported: 0,
    skipped: [],       // [{row, reason}] (1-based data-row numbers)
    warnings: [],
    negativesZeroed: 0,
    hoursClamped: 0,
    colMap: {},
    unitScales: {},
  };

  const { data, headers } = parseCsv(text);
  report.totalRows = data.length;
  if (!data.length) {
    report.warnings.push('No data rows found in the file.');
    return { rows: [], report };
  }

  const colMap = claimColumns(DAILY_ALIASES, headers);
  report.colMap = colMap;

  if (!colMap.date) {
    report.warnings.push('No date column recognized. Expected a header like "date", "month" or "period".');
    return { rows: [], report };
  }
  if (!DAILY_VOLUME_KEYS.some((k) => colMap[k])) {
    report.warnings.push('No production or injection volume columns recognized.');
    return { rows: [], report };
  }
  if (!colMap.well) {
    report.warnings.push('No well column recognized; all rows imported as one field-level well "FIELD".');
  }

  DAILY_VOLUME_KEYS.forEach((k) => {
    if (colMap[k]) report.unitScales[k] = detectScale(colMap[k], DAILY_VOLUME_KINDS[k]);
  });
  Object.entries(report.unitScales).forEach(([k, scale]) => {
    if (scale !== 1) {
      report.warnings.push(`${colMap[k]}: values scaled x${scale} to ${DAILY_VOLUME_KINDS[k] === 'gas' ? 'Mscf' : 'bbl'}.`);
    }
  });

  const { order, ambiguous } = inferDateOrder(data.map((r) => r[colMap.date]));
  if (ambiguous && data.some((r) => /^\d{1,2}[/.]\d{1,2}[/.]\d{4}$/.test(String(r[colMap.date] ?? '').trim()))) {
    report.warnings.push('Day/month order in dates is ambiguous; day-first (DD/MM/YYYY) assumed.');
  }

  const dateState = { monthly: 0 };
  const rows = [];
  data.forEach((raw, i) => {
    const date = normalizeFullDate(raw[colMap.date], order, dateState);
    if (!date) {
      report.skipped.push({ row: i + 1, reason: `Unparseable date "${raw[colMap.date] ?? ''}"` });
      return;
    }
    const well = colMap.well ? String(raw[colMap.well] ?? '').trim() : 'FIELD';
    if (!well) {
      report.skipped.push({ row: i + 1, reason: 'Blank well name' });
      return;
    }
    const row = { date, well, oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 0, ginj_mscf: 0, hours_on: null };
    DAILY_VOLUME_KEYS.forEach((k) => {
      if (!colMap[k]) return;
      const n = parseFloat(raw[colMap[k]]);
      if (!Number.isFinite(n)) return; // blank = 0, the ledger convention
      if (n < 0) {
        report.negativesZeroed += 1;
        return;
      }
      row[k] = n * (report.unitScales[k] || 1);
    });
    if (colMap.hours_on) {
      const h = parseFloat(raw[colMap.hours_on]);
      if (Number.isFinite(h) && h >= 0) {
        if (h > 24) {
          report.hoursClamped += 1;
          row.hours_on = 24;
        } else {
          row.hours_on = h;
        }
      }
    }
    rows.push(row);
  });

  report.imported = rows.length;
  if (dateState.monthly > 0) {
    report.warnings.push(`${dateState.monthly} monthly date${dateState.monthly === 1 ? '' : 's'} stored as the first of the month.`);
  }
  if (report.negativesZeroed > 0) {
    report.warnings.push(`${report.negativesZeroed} negative volume value${report.negativesZeroed === 1 ? '' : 's'} zeroed.`);
  }
  if (report.hoursClamped > 0) {
    report.warnings.push(`${report.hoursClamped} hours-on value${report.hoursClamped === 1 ? '' : 's'} above 24 clamped to 24.`);
  }
  return { rows, report };
}

// Template CSV in the canonical daily ledger schema.
export function dailyProductionTemplateCSV() {
  const header = 'date,well,oil_stb,water_stb,gas_mscf,winj_stb,ginj_mscf,hours_on';
  const rows = [
    '2025-01-01,P-1,1200,300,900,0,0,24',
    '2025-01-01,P-2,800,150,500,0,0,24',
    '2025-01-01,I-1,0,0,0,2500,0,24',
    '2025-01-02,P-1,1180,320,880,0,0,24',
    '2025-01-02,P-2,0,0,0,0,0,0',
    '2025-01-02,I-1,0,0,0,2500,0,24',
  ];
  return [header, ...rows].join('\n');
}

// ---- field totals (P3 allocation basis) ------------------------------------

export const FIELD_TOTAL_ALIASES = [
  { key: 'date', aliases: ['prod_date', 'date', 'month', 'period', 'time'] },
  { key: 'oil_stb', aliases: ['oil_stb', 'oil_bbl', 'oil_prod', 'oil_total', 'oil_sales', 'oil_rate', 'bopd', 'oil'] },
  { key: 'water_stb', aliases: ['water_stb', 'water_bbl', 'water_prod', 'water_total', 'water_rate', 'bwpd', 'water'] },
  { key: 'gas_mscf', aliases: ['gas_mscf', 'gas_mcf', 'gas_prod', 'gas_total', 'gas_sales', 'gas_rate', 'gas'] },
];

const FIELD_TOTAL_KINDS = {
  oil_stb: 'liquid',
  water_stb: 'liquid',
  gas_mscf: 'gas',
};
const FIELD_TOTAL_KEYS = Object.keys(FIELD_TOTAL_KINDS);

/**
 * Parse a metered field/separator/export total CSV into po_field_totals
 * rows: one row per DATE (no well column — this is the commingled
 * measurement the wells are allocated from). Returns { rows, report }
 * on the daily-ledger recipe; nothing is dropped silently.
 */
export function parseFieldTotalsCSV(text) {
  const report = {
    totalRows: 0,
    imported: 0,
    skipped: [],
    warnings: [],
    negativesZeroed: 0,
    duplicateDates: 0,
    colMap: {},
    unitScales: {},
  };

  const { data, headers } = parseCsv(text);
  report.totalRows = data.length;
  if (!data.length) {
    report.warnings.push('No data rows found in the file.');
    return { rows: [], report };
  }

  const colMap = claimColumns(FIELD_TOTAL_ALIASES, headers);
  report.colMap = colMap;

  if (!colMap.date) {
    report.warnings.push('No date column recognized. Expected a header like "date", "month" or "period".');
    return { rows: [], report };
  }
  if (!FIELD_TOTAL_KEYS.some((k) => colMap[k])) {
    report.warnings.push('No oil, water or gas total columns recognized.');
    return { rows: [], report };
  }

  FIELD_TOTAL_KEYS.forEach((k) => {
    if (colMap[k]) report.unitScales[k] = detectScale(colMap[k], FIELD_TOTAL_KINDS[k]);
  });
  Object.entries(report.unitScales).forEach(([k, scale]) => {
    if (scale !== 1) {
      report.warnings.push(`${colMap[k]}: values scaled x${scale} to ${FIELD_TOTAL_KINDS[k] === 'gas' ? 'Mscf' : 'bbl'}.`);
    }
  });

  const { order, ambiguous } = inferDateOrder(data.map((r) => r[colMap.date]));
  if (ambiguous && data.some((r) => /^\d{1,2}[/.]\d{1,2}[/.]\d{4}$/.test(String(r[colMap.date] ?? '').trim()))) {
    report.warnings.push('Day/month order in dates is ambiguous; day-first (DD/MM/YYYY) assumed.');
  }

  const dateState = { monthly: 0 };
  const seen = new Set();
  const rows = [];
  data.forEach((raw, i) => {
    const date = normalizeFullDate(raw[colMap.date], order, dateState);
    if (!date) {
      report.skipped.push({ row: i + 1, reason: `Unparseable date "${raw[colMap.date] ?? ''}"` });
      return;
    }
    if (seen.has(date)) report.duplicateDates += 1;
    seen.add(date);
    const row = { date, oil_stb: 0, water_stb: 0, gas_mscf: 0 };
    FIELD_TOTAL_KEYS.forEach((k) => {
      if (!colMap[k]) return;
      const n = parseFloat(raw[colMap[k]]);
      if (!Number.isFinite(n)) return; // blank = 0, the ledger convention
      if (n < 0) {
        report.negativesZeroed += 1;
        return;
      }
      row[k] = n * (report.unitScales[k] || 1);
    });
    rows.push(row);
  });

  report.imported = rows.length;
  if (dateState.monthly > 0) {
    report.warnings.push(`${dateState.monthly} monthly date${dateState.monthly === 1 ? '' : 's'} stored as the first of the month.`);
  }
  if (report.negativesZeroed > 0) {
    report.warnings.push(`${report.negativesZeroed} negative value${report.negativesZeroed === 1 ? '' : 's'} zeroed.`);
  }
  if (report.duplicateDates > 0) {
    report.warnings.push(`${report.duplicateDates} repeated date${report.duplicateDates === 1 ? '' : 's'} in the file; the last row for each date wins.`);
  }
  return { rows, report };
}

// Template CSV in the canonical field-totals schema.
export function fieldTotalsTemplateCSV() {
  const header = 'date,oil_stb,water_stb,gas_mscf';
  const rows = [
    '2025-01-01,1900,430,1350',
    '2025-01-02,1850,450,1320',
    '2025-01-03,1875,445,1330',
  ];
  return [header, ...rows].join('\n');
}

// ---- well tests ------------------------------------------------------------

export const WELL_TEST_ALIASES = [
  { key: 'date', aliases: ['test_date', 'date', 'time'] },
  { key: 'well', aliases: ['well_name', 'wellname', 'well', 'uwi', 'api'] },
  { key: 'duration_hours', aliases: ['duration_hours', 'test_hours', 'duration', 'hours', 'hrs'] },
  { key: 'thp_psia', aliases: ['thp', 'whp', 'ftp', 'tubing_pressure', 'wellhead_pressure'] },
  { key: 'choke_64ths', aliases: ['choke', 'bean'] },
  { key: 'oil_rate_stbd', aliases: ['oil_rate', 'qo', 'bopd', 'oil'] },
  { key: 'water_rate_stbd', aliases: ['water_rate', 'qw', 'bwpd', 'water'] },
  { key: 'gas_rate_mscfd', aliases: ['gas_rate', 'qg', 'mscfd', 'mcfd', 'gas'] },
];

const TEST_RATE_KINDS = {
  oil_rate_stbd: 'liquid',
  water_rate_stbd: 'liquid',
  gas_rate_mscfd: 'gas',
};
const TEST_RATE_KEYS = Object.keys(TEST_RATE_KINDS);

/**
 * Parse a well-test CSV into po_well_tests rows. Rates land in stb/d
 * and Mscf/d, pressures psia. Returns { tests, report }.
 */
export function parseWellTestCSV(text) {
  const report = {
    totalRows: 0,
    imported: 0,
    skipped: [],
    warnings: [],
    negativesZeroed: 0,
    colMap: {},
    unitScales: {},
  };

  const { data, headers } = parseCsv(text);
  report.totalRows = data.length;
  if (!data.length) {
    report.warnings.push('No data rows found in the file.');
    return { tests: [], report };
  }

  const colMap = claimColumns(WELL_TEST_ALIASES, headers);
  report.colMap = colMap;

  if (!colMap.date || !colMap.well) {
    report.warnings.push('Need a test date column and a well column.');
    return { tests: [], report };
  }
  if (!TEST_RATE_KEYS.some((k) => colMap[k])) {
    report.warnings.push('No rate columns recognized (oil, water or gas).');
    return { tests: [], report };
  }

  TEST_RATE_KEYS.forEach((k) => {
    if (colMap[k]) report.unitScales[k] = detectScale(colMap[k], TEST_RATE_KINDS[k]);
  });
  Object.entries(report.unitScales).forEach(([k, scale]) => {
    if (scale !== 1) {
      report.warnings.push(`${colMap[k]}: values scaled x${scale} to ${TEST_RATE_KINDS[k] === 'gas' ? 'Mscf/d' : 'stb/d'}.`);
    }
  });

  const { order } = inferDateOrder(data.map((r) => r[colMap.date]));
  const dateState = { monthly: 0 };
  const tests = [];
  data.forEach((raw, i) => {
    const date = normalizeFullDate(raw[colMap.date], order, dateState);
    if (!date) {
      report.skipped.push({ row: i + 1, reason: `Unparseable date "${raw[colMap.date] ?? ''}"` });
      return;
    }
    const well = String(raw[colMap.well] ?? '').trim();
    if (!well) {
      report.skipped.push({ row: i + 1, reason: 'Blank well name' });
      return;
    }
    const test = {
      date,
      well,
      duration_hours: null,
      oil_rate_stbd: 0,
      water_rate_stbd: 0,
      gas_rate_mscfd: 0,
      thp_psia: null,
      choke_64ths: null,
    };
    let anyRate = false;
    TEST_RATE_KEYS.forEach((k) => {
      if (!colMap[k]) return;
      const n = parseFloat(raw[colMap[k]]);
      if (!Number.isFinite(n)) return;
      if (n < 0) {
        report.negativesZeroed += 1;
        return;
      }
      test[k] = n * (report.unitScales[k] || 1);
      anyRate = true;
    });
    if (!anyRate) {
      report.skipped.push({ row: i + 1, reason: 'No usable rate value' });
      return;
    }
    ['duration_hours', 'thp_psia', 'choke_64ths'].forEach((k) => {
      if (!colMap[k]) return;
      const n = parseFloat(raw[colMap[k]]);
      if (Number.isFinite(n) && n > 0) test[k] = n;
    });
    tests.push(test);
  });

  report.imported = tests.length;
  if (report.negativesZeroed > 0) {
    report.warnings.push(`${report.negativesZeroed} negative rate value${report.negativesZeroed === 1 ? '' : 's'} zeroed.`);
  }
  return { tests, report };
}

// Template CSV in the canonical well-test schema.
export function wellTestTemplateCSV() {
  const header = 'test_date,well,duration_hours,oil_rate_stbd,water_rate_stbd,gas_rate_mscfd,thp_psia,choke';
  const rows = [
    '2025-01-15,P-1,6,1250,310,940,320,32',
    '2025-02-12,P-1,8,1190,360,900,305,32',
    '2025-01-20,P-2,6,820,140,510,410,24',
  ];
  return [header, ...rows].join('\n');
}
