// VRR Monitor per-well CSV importer (V2). Suite-side by design: papaparse
// stays out of the pure engines package — this module parses and
// normalizes real field files into the vrrLedger.js row schema
// { date, well, oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf },
// and the engine does the math.
//
// Recipe: the DCA csvParser claim-once alias detection + the MBAL DataHub
// unit auto-scaling and date-order inference, applied to the ledger schema.
import Papa from 'papaparse';

// Alias resolution order matters and is claim-once: injection columns
// resolve BEFORE their production twins so 'water_inj' can never be
// claimed by the water-production aliases ('water' is a substring of
// 'water_inj'), mirroring the csvParser cum-after-rates lesson.
export const COLUMN_ALIASES = [
  { key: 'date', aliases: ['prod_date', 'date', 'month', 'period', 'time'] },
  { key: 'well', aliases: ['well_name', 'wellname', 'well', 'uwi', 'api'] },
  { key: 'winj_stb', aliases: ['water_inj', 'winj', 'inj_bbl', 'inj_water', 'wtr_inj', 'wi'] },
  { key: 'ginj_mscf', aliases: ['gas_inj', 'ginj', 'inj_gas', 'gi'] },
  { key: 'oil_stb', aliases: ['oil_stb', 'oil_bbl', 'oil_prod', 'oil_rate', 'bopd', 'np', 'oil'] },
  { key: 'water_stb', aliases: ['water_stb', 'water_bbl', 'water_prod', 'water_rate', 'bwpd', 'wp', 'water'] },
  { key: 'gas_mscf', aliases: ['gas_mscf', 'gas_mcf', 'gas_prod', 'gas_rate', 'gp', 'gas'] },
];

const GAS_KEYS = new Set(['gas_mscf', 'ginj_mscf']);
const LIQUID_KEYS = new Set(['oil_stb', 'water_stb', 'winj_stb']);

// Unit scale from header text, per column kind. Gas lands in Mscf
// (Mcf == Mscf, thousand cubic feet); liquids land in stb/bbl.
export function detectUnitScale(header, key) {
  const h = String(header || '').toLowerCase();
  if (GAS_KEYS.has(key)) {
    if (/bscf|bcf/.test(h)) return 1e6;
    if (/mmscf|mmcf/.test(h)) return 1000;
    if (/mscf|mcf/.test(h)) return 1;
    if (/scf/.test(h)) return 0.001;
    return 1; // Mscf / Mcf default
  }
  if (LIQUID_KEYS.has(key)) {
    if (/mmbbl|mmstb/.test(h)) return 1e6;
    if (/mbbl|mstb/.test(h)) return 1000;
    return 1; // bbl / stb default
  }
  return 1;
}

// Claim-once alias match over the actual headers, most-specific-first
// within each key's alias list.
export function detectColumns(headers) {
  const mapping = {};
  const claimed = new Set();
  COLUMN_ALIASES.forEach(({ key, aliases }) => {
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

// Date-order inference for slash/dot dates: scan all values; any first
// part > 12 proves day-first, any second part > 12 proves month-first.
// Ambiguous files default to day-first with a warning in the report.
export function inferDateOrder(values) {
  let sawDayFirst = false;
  let sawMonthFirst = false;
  values.forEach((v) => {
    const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(String(v ?? '').trim());
    if (!m) return;
    if (parseInt(m[1], 10) > 12) sawDayFirst = true;
    if (parseInt(m[2], 10) > 12) sawMonthFirst = true;
  });
  if (sawDayFirst && !sawMonthFirst) return { order: 'DMY', ambiguous: false };
  if (sawMonthFirst && !sawDayFirst) return { order: 'MDY', ambiguous: false };
  return { order: 'DMY', ambiguous: true };
}

// Normalize one date value to 'YYYY-MM-DD' (or 'YYYY-MM'), or null.
export function normalizeDate(value, order = 'DMY') {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s);
  if (m) {
    const mm = m[2].padStart(2, '0');
    if (parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12) return null;
    return m[3] ? `${m[1]}-${mm}-${m[3].padStart(2, '0')}` : `${m[1]}-${mm}`;
  }
  m = /^(\d{4})[/.](\d{1,2})(?:[/.](\d{1,2}))?$/.exec(s);
  if (m) {
    const mm = m[2].padStart(2, '0');
    if (parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12) return null;
    return m[3] ? `${m[1]}-${mm}-${m[3].padStart(2, '0')}` : `${m[1]}-${mm}`;
  }
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    const [day, month] = order === 'MDY' ? [b, a] : [a, b];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

const VOLUME_KEYS = ['oil_stb', 'water_stb', 'gas_mscf', 'winj_stb', 'ginj_mscf'];

/**
 * Parse a per-well production/injection CSV into vrrLedger rows.
 * Returns { rows, report } — never throws on data problems; every drop or
 * adjustment is accounted for in the report (nothing silent).
 */
export function parseVrrWellCSV(text) {
  const report = {
    totalRows: 0,
    imported: 0,
    skipped: [],       // [{row, reason}] (1-based data-row numbers)
    warnings: [],
    negativesZeroed: 0,
    colMap: {},
    unitScales: {},
  };

  const parsed = Papa.parse(String(text ?? '').replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => String(h).trim(),
  });
  const data = parsed.data || [];
  const headers = (parsed.meta?.fields || []).filter(Boolean);
  report.totalRows = data.length;

  if (!data.length) {
    report.warnings.push('No data rows found in the file.');
    return { rows: [], report };
  }

  const colMap = detectColumns(headers);
  report.colMap = colMap;

  if (!colMap.date) {
    report.warnings.push('No date column recognized. Expected a header like "date", "month" or "period".');
    return { rows: [], report };
  }
  const anyVolume = VOLUME_KEYS.some((k) => colMap[k]);
  if (!anyVolume) {
    report.warnings.push('No production or injection volume columns recognized.');
    return { rows: [], report };
  }
  if (!colMap.well) {
    report.warnings.push('No well column recognized; all rows imported as one field-level well "FIELD".');
  }

  VOLUME_KEYS.forEach((k) => {
    if (colMap[k]) report.unitScales[k] = detectUnitScale(colMap[k], k);
  });
  Object.entries(report.unitScales).forEach(([k, scale]) => {
    if (scale !== 1) report.warnings.push(`${colMap[k]}: values scaled x${scale} to ${GAS_KEYS.has(k) ? 'Mscf' : 'bbl'}.`);
  });

  const { order, ambiguous } = inferDateOrder(data.map((r) => r[colMap.date]));
  if (ambiguous && data.some((r) => /^\d{1,2}[/.]\d{1,2}[/.]\d{4}$/.test(String(r[colMap.date] ?? '').trim()))) {
    report.warnings.push('Day/month order in dates is ambiguous; day-first (DD/MM/YYYY) assumed.');
  }

  const rows = [];
  data.forEach((raw, i) => {
    const date = normalizeDate(raw[colMap.date], order);
    if (!date) {
      report.skipped.push({ row: i + 1, reason: `Unparseable date "${raw[colMap.date] ?? ''}"` });
      return;
    }
    const well = colMap.well ? String(raw[colMap.well] ?? '').trim() : 'FIELD';
    if (!well) {
      report.skipped.push({ row: i + 1, reason: 'Blank well name' });
      return;
    }
    const row = { date, well, oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 0, ginj_mscf: 0 };
    VOLUME_KEYS.forEach((k) => {
      if (!colMap[k]) return;
      const n = parseFloat(raw[colMap[k]]);
      if (!Number.isFinite(n)) return; // blank = 0, the engine convention
      if (n < 0) {
        report.negativesZeroed += 1;
        return;
      }
      row[k] = n * (report.unitScales[k] || 1);
    });
    rows.push(row);
  });

  report.imported = rows.length;
  if (report.negativesZeroed > 0) {
    report.warnings.push(`${report.negativesZeroed} negative volume value${report.negativesZeroed === 1 ? '' : 's'} zeroed.`);
  }
  return { rows, report };
}

// --- Pressure survey CSV (V3) ---
// Columns: a date and a reservoir pressure (psia). Same alias/claim-once
// and date machinery as the well ledger.
export const PRESSURE_ALIASES = [
  { key: 'date', aliases: ['survey_date', 'date', 'month', 'period', 'time'] },
  { key: 'p_psia', aliases: ['p_psia', 'pressure', 'psia', 'res_press', 'reservoir_pressure', 'pres', 'press', 'bhp'] },
];

export function parsePressureCSV(text) {
  const report = { totalRows: 0, imported: 0, skipped: [], warnings: [], colMap: {} };
  const parsed = Papa.parse(String(text ?? '').replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => String(h).trim(),
  });
  const data = parsed.data || [];
  const headers = (parsed.meta?.fields || []).filter(Boolean);
  report.totalRows = data.length;

  const colMap = {};
  const claimed = new Set();
  PRESSURE_ALIASES.forEach(({ key, aliases }) => {
    for (const alias of aliases) {
      const found = headers.find((h) => !claimed.has(h) && String(h).toLowerCase().includes(alias));
      if (found) { colMap[key] = found; claimed.add(found); break; }
    }
  });
  report.colMap = colMap;
  if (!colMap.date || !colMap.p_psia) {
    report.warnings.push('Need a date column and a pressure column (psia).');
    return { surveys: [], report };
  }

  const { order } = inferDateOrder(data.map((r) => r[colMap.date]));
  const surveys = [];
  data.forEach((raw, i) => {
    const date = normalizeDate(raw[colMap.date], order);
    const p = parseFloat(raw[colMap.p_psia]);
    if (!date) { report.skipped.push({ row: i + 1, reason: `Unparseable date "${raw[colMap.date] ?? ''}"` }); return; }
    if (!Number.isFinite(p) || p <= 0) { report.skipped.push({ row: i + 1, reason: `Unusable pressure "${raw[colMap.p_psia] ?? ''}"` }); return; }
    surveys.push({ date, p_psia: p });
  });
  report.imported = surveys.length;
  return { surveys, report };
}

// Template CSV in the canonical schema. The sample volumes ARE the engine
// fixture (test-data/waterflood/vrr-ledger-fixture.json), so loading the
// template reproduces the jest-pinned oracle numbers end to end.
export function vrrTemplateCSV() {
  const header = 'date,well,oil_stb,water_stb,gas_mscf,winj_stb,ginj_mscf';
  const rows = [
    '2025-01-01,P-1,10000,2000,6000,0,0',
    '2025-01-01,P-2,5000,1000,2000,0,0',
    '2025-01-01,I-1,0,0,0,15000,0',
    '2025-01-01,I-2,0,0,0,0,3000',
    '2025-02-01,P-1,9000,2500,5000,0,0',
    '2025-02-01,P-2,4500,1500,1800,0,0',
    '2025-02-01,I-1,0,0,0,18000,0',
    '2025-02-01,I-2,0,0,0,0,2000',
    '2025-03-01,P-1,8000,3000,4200,0,0',
    '2025-03-01,P-2,4000,2000,1500,0,0',
    '2025-03-01,I-1,0,0,0,20000,0',
    '2025-03-01,I-2,0,0,0,0,1000',
  ];
  return [header, ...rows].join('\n');
}
