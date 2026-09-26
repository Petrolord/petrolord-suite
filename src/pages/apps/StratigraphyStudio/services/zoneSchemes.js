// Biozone schemes (Stratigraphy T1 ST-T1-001, 2026-09-26). The Studio
// ships no zone ages of its own: zone calibrations differ between
// timescales and operators (planktonic foraminifera, calcareous
// nannofossils, the Niger Delta palynological and foraminiferal zones), so
// the user imports the scheme their company uses as a CSV with its source,
// and the Studio dates biozone intervals from it. Pure, no I/O except the
// remembered schemes in this browser.

export const ZONE_SCHEMES_KEY = 'strat.zoneSchemes';

const splitCsv = (line) => {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i += 1; } else q = !q; } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

/**
 * CSV with a header naming scheme, zone, top_ma, base_ma and source (any
 * order, case-insensitive). Ages in Ma, base older than top.
 * @returns {{zones: Array<{scheme, zone, top_ma, base_ma, source}>, problems: string[]}}
 */
export function parseZoneSchemeCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) throw new Error('The zone scheme file is empty.');
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const col = (name) => head.indexOf(name);
  for (const need of ['scheme', 'zone', 'top_ma', 'base_ma', 'source']) {
    if (col(need) < 0) throw new Error(`The zone scheme needs a "${need}" column (header: scheme, zone, top_ma, base_ma, source).`);
  }
  const zones = []; const problems = [];
  lines.slice(1).forEach((line, k) => {
    const c = splitCsv(line);
    const row = k + 2;
    const zone = { scheme: c[col('scheme')], zone: c[col('zone')], top_ma: Number(c[col('top_ma')]), base_ma: Number(c[col('base_ma')]), source: c[col('source')] };
    if (!zone.scheme || !zone.zone) { problems.push(`Row ${row}: scheme and zone are required.`); return; }
    if (!Number.isFinite(zone.top_ma) || !Number.isFinite(zone.base_ma)) { problems.push(`Row ${row}: ${zone.zone} ages must be numbers in Ma.`); return; }
    if (!(zone.base_ma > zone.top_ma)) { problems.push(`Row ${row}: ${zone.zone} base (${zone.base_ma} Ma) must be older than its top (${zone.top_ma} Ma).`); return; }
    if (!zone.source) { problems.push(`Row ${row}: ${zone.zone} needs a source (the chart or paper the ages come from).`); return; }
    zones.push(zone);
  });
  return { zones, problems };
}

const key = (s) => String(s || '').trim().toLowerCase();

/**
 * Date biozone intervals from the scheme: an interval whose scheme and code
 * match a zone takes the zone's top and base ages; intervals already dated
 * keep their ages unless `overwrite`.
 * @param {Array} intervals registry interval rows (kind biozone_interval)
 * @returns {{rows: Array, filled: number, unmatched: string[]}}
 */
export function fillBiozoneAges(intervals, zones, { overwrite = false } = {}) {
  const idx = new Map(zones.map((z) => [`${key(z.scheme)}|${key(z.zone)}`, z]));
  let filled = 0; const unmatched = [];
  const rows = (intervals || []).map((iv) => {
    const p = iv.properties || {};
    const z = idx.get(`${key(p.scheme)}|${key(iv.code)}`);
    if (!z) { unmatched.push(`${p.scheme ? `${p.scheme} ` : ''}${iv.code || '(no code)'}`); return iv; }
    if (!overwrite && Number.isFinite(p.age_top_ma) && Number.isFinite(p.age_base_ma)) return iv;
    filled += 1;
    return { ...iv, properties: { ...p, age_top_ma: z.top_ma, age_base_ma: z.base_ma, age_source: z.source } };
  });
  return { rows, filled, unmatched };
}

export function loadZoneSchemes() {
  try { const v = JSON.parse(localStorage.getItem(ZONE_SCHEMES_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveZoneSchemes(zones) {
  try { localStorage.setItem(ZONE_SCHEMES_KEY, JSON.stringify(zones)); } catch { /* private mode */ }
}
