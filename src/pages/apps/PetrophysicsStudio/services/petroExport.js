// Deliverable assembly (Petrophysics Studio PS2, audit A1): the curves
// CSV, the zone-summary CSV and the LAS 2.0 file for the current
// interpretation. Pure builders returning strings — the dialog owns
// the save — so every deliverable is jest-testable against the
// analytic type well. LAS writing goes through the round-trip-gated
// engines writer (parseLas(writeLas(x)) is bit-identical after the
// float32 cast).

import { writeLas } from '../../WellDataManager/engine/lasWrite';
import { makeDepthFrame, M_PER_FT } from '../../WellDataManager/engine/checkshots';
import { PIPELINE_VERSION } from '../engine/pipeline';

// canonical registry units for the mapped inputs (SI at import) and
// the published outputs — used when the inventory has no unit string
const CANONICAL_UNITS = {
  DEPT: 'M', GR: 'API', RHOB: 'G/CC', NPHI: 'V/V', DT: 'US/M', RT: 'OHM.M',
  VSH: 'V/V', PHIE: 'V/V', SW: 'V/V', PAY: 'FLAG',
};
const OUTPUT_KEYS = ['VSH', 'PHIE', 'SW', 'PAY'];
const OUTPUT_DESCR = {
  VSH: 'Shale volume', PHIE: 'Effective porosity', SW: 'Water saturation', PAY: 'Net-pay flag (1 = pay)',
};

const num = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(7))) : '');

// ---- depth options (PT2, 2026-09-03) ---------------------------------------
// Every deliverable stays metres MD by default (byte-identical to before).
// With options, depths convert to feet (LAS unit string 'F', which the
// reader maps back to metres) and TVD / TVDSS columns join MD, derived
// through the well's survey and KB by the same frame the checkshot door
// uses: TVD below KB (the axis label's definition), TVDSS = TVD - KB, a
// well without a survey is vertical (noted), beyond the last station the
// final tangent continues (noted).

export const DEPTH_COLUMN_KEYS = ['md', 'tvd', 'tvdss'];
const DEPTH_MNEMONIC = { md: 'MD', tvd: 'TVD', tvdss: 'TVDSS' };
const DEPTH_DESCR = { md: 'Measured depth below KB', tvd: 'True vertical depth below KB', tvdss: 'True vertical depth subsea (below datum)' };

const normOpts = (opts) => {
  if (!opts) return null;
  const columns = (opts.columns && opts.columns.length ? opts.columns : ['md']).filter((c) => DEPTH_COLUMN_KEYS.includes(c));
  const primary = columns.includes(opts.primary) ? opts.primary : columns[0];
  return { depthUnit: opts.depthUnit === 'ft' ? 'ft' : 'm', columns, primary, well: opts.well || null };
};
const unitStr = (u) => (u === 'ft' ? 'F' : 'M');
const unitTxt = (u) => (u === 'ft' ? 'ft' : 'm');
const conv = (v, u) => (u === 'ft' ? v / M_PER_FT : v);

/**
 * Depth columns for an export: the primary first (as DEPT), the others as
 * MD / TVD / TVDSS curves, all in the requested unit.
 * @returns {{ordered: Array<{key, mnemonic, unit, descr, data}>, notes: string[], frame}}
 */
export function depthColumns(depthM, { well = null, depthUnit = 'm', columns = ['md'], primary = 'md' } = {}) {
  const o = normOpts({ well, depthUnit, columns, primary });
  const frame = makeDepthFrame({ deviation: well?.deviation, kbM: well?.kb_m ?? 0, tdMdM: well?.td_md_m });
  const notes = [];
  const needsFrame = o.columns.some((c) => c !== 'md');
  if (needsFrame && frame.isVertical) notes.push('No deviation survey: TVD assumes a vertical well (TVD = MD).');
  const n = depthM.length;
  const cols = {};
  cols.md = depthM;
  if (needsFrame) {
    const tvd = new Float64Array(n);
    const tvdss = new Float64Array(n);
    let extrapolated = 0;
    for (let i = 0; i < n; i++) {
      const md = depthM[i];
      if (!Number.isFinite(md)) { tvd[i] = NaN; tvdss[i] = NaN; continue; }
      let r;
      try { r = frame.mdToTvdss(md); } catch (e) { tvd[i] = NaN; tvdss[i] = NaN; continue; }
      tvd[i] = r.tvd;
      tvdss[i] = r.tvdss;
      if (r.extrapolated) extrapolated++;
    }
    if (extrapolated) notes.push(`${extrapolated} samples lie below the last survey station; TVD there follows the final tangent.`);
    cols.tvd = tvd;
    cols.tvdss = tvdss;
    if (o.columns.includes('tvdss')) notes.push(`TVDSS uses KB ${Number(well?.kb_m ?? 0)} m.`);
  }
  const order = [o.primary, ...o.columns.filter((c) => c !== o.primary)];
  const ordered = order.map((key, i) => {
    const src = cols[key];
    const data = o.depthUnit === 'ft' ? Float64Array.from(src, (v) => conv(v, 'ft')) : src;
    return {
      key: i === 0 ? 'DEPT' : DEPTH_MNEMONIC[key],
      depthKey: key,
      mnemonic: i === 0 ? 'DEPT' : DEPTH_MNEMONIC[key],
      unit: unitStr(o.depthUnit),
      descr: `${DEPTH_DESCR[key]}${i === 0 ? ' (primary depth)' : ''}`,
      data,
    };
  });
  return { ordered, notes, frame, opts: o };
}

/** Ordered export columns: depth, mapped inputs, computed outputs. */
export function exportColumns(wellData, outputs) {
  const cols = [];
  for (const { key, log } of wellData.inventory) {
    if (!wellData.curves[key]) continue;
    cols.push({
      key,
      unit: log?.unit || CANONICAL_UNITS[key] || '',
      descr: log?.description || '',
      data: wellData.curves[key],
    });
  }
  for (const key of OUTPUT_KEYS) {
    if (outputs?.[key]) {
      cols.push({ key, unit: CANONICAL_UNITS[key], descr: OUTPUT_DESCR[key], data: outputs[key] });
    }
  }
  return cols;
}

/** Curves CSV: one header row "KEY (UNIT)", NaN as empty cells. */
export function curvesCsv(wellData, outputs, opts = null) {
  let cols = exportColumns(wellData, outputs);
  if (!cols.length) throw new Error('Nothing to export — no curves loaded.');
  const o = normOpts(opts);
  if (o) {
    const depthIdx = cols.findIndex((c) => c.key === 'DEPT');
    if (depthIdx >= 0) {
      const { ordered } = depthColumns(cols[depthIdx].data, o);
      cols = [...ordered.map((d) => ({ key: d.key, unit: d.unit, descr: d.descr, data: d.data })), ...cols.filter((_, i) => i !== depthIdx)];
    }
  }
  const n = cols[0].data.length;
  const lines = [cols.map((c) => (c.unit ? `${c.key} (${c.unit})` : c.key)).join(',')];
  for (let i = 0; i < n; i++) {
    lines.push(cols.map((c) => num(c.data[i])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Zone-summary CSV from the live ZoneManager summaries. */
export function zonesCsv(zones, summaries, opts = null) {
  const rows = zones.filter((z) => summaries[z.id]);
  if (!rows.length) throw new Error('No zone summaries to export — add a zone first.');
  const o = normOpts(opts);
  if (!o) {
    const lines = ['zone,top_m,base_m,gross_m,net_m,ntg,phi_avg,vsh_avg,sw_avg'];
    for (const z of rows) {
      const s = summaries[z.id];
      lines.push([
        `"${String(z.name).replace(/"/g, '""')}"`,
        num(z.top_md_m), num(z.base_md_m),
        num(s.gross_m), num(s.net_m), num(s.ntg),
        num(s.phi_avg), num(s.vsh_avg), num(s.sw_avg),
      ].join(','));
    }
    return `${lines.join('\n')}\n`;
  }
  const u = unitTxt(o.depthUnit);
  const frame = makeDepthFrame({ deviation: o.well?.deviation, kbM: o.well?.kb_m ?? 0, tdMdM: o.well?.td_md_m });
  const depthOf = (md, key) => {
    if (key === 'md') return conv(md, o.depthUnit);
    try {
      const r = frame.mdToTvdss(md);
      return conv(key === 'tvd' ? r.tvd : r.tvdss, o.depthUnit);
    } catch (e) { return NaN; }
  };
  const header = ['zone'];
  for (const key of o.columns) header.push(`top_${key}_${u}`, `base_${key}_${u}`);
  header.push(`gross_${u}`, `net_${u}`, 'ntg', 'phi_avg', 'vsh_avg', 'sw_avg');
  const lines = [header.join(',')];
  for (const z of rows) {
    const s = summaries[z.id];
    const cells = [`"${String(z.name).replace(/"/g, '""')}"`];
    for (const key of o.columns) cells.push(num(depthOf(z.top_md_m, key)), num(depthOf(z.base_md_m, key)));
    cells.push(num(conv(s.gross_m, o.depthUnit)), num(conv(s.net_m, o.depthUnit)), num(s.ntg), num(s.phi_avg), num(s.vsh_avg), num(s.sw_avg));
    lines.push(cells.join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** LAS 2.0 text: depth + inputs + computed outputs, with the full
 *  parameter set and provenance in ~Parameter. */
export function buildLas(wellData, outputs, params, { wellName, projectId, well = null, depthUnit, columns, primary } = {}) {
  const cols = exportColumns(wellData, outputs);
  const depthIdx = cols.findIndex((c) => c.key === 'DEPT');
  if (depthIdx < 0) throw new Error('Cannot export LAS without a depth curve.');
  const o = depthUnit || columns || primary ? normOpts({ well, depthUnit, columns, primary }) : null;
  let ordered;
  const paramRows = Object.entries(params)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .map(([name, value]) => ({ name, value, descr: 'interpretation parameter' }));
  paramRows.push(
    { name: 'ENGINE', value: 'petrophysics-studio', descr: 'computing engine' },
    { name: 'PIPEVER', value: PIPELINE_VERSION, descr: 'pipeline version' },
    { name: 'PROJECT', value: projectId || '', descr: 'project id' },
  );
  if (o) {
    const dc = depthColumns(cols[depthIdx].data, o);
    ordered = [...dc.ordered.map((d) => ({ key: d.mnemonic, unit: d.unit, descr: d.descr, data: d.data })), ...cols.filter((_, i) => i !== depthIdx)];
    paramRows.push(
      { name: 'DEPTREF', value: DEPTH_MNEMONIC[o.primary], descr: 'depth reference of the DEPT curve' },
      { name: 'EKB', value: Number(conv(o.well?.kb_m ?? 0, o.depthUnit).toFixed(4)), unit: unitStr(o.depthUnit), descr: 'KB elevation above datum' },
      { name: 'DEPTHSRC', value: dc.frame.isVertical ? 'vertical assumption' : 'deviation survey, minimum curvature', descr: 'how TVD was derived' },
    );
  } else {
    ordered = [cols[depthIdx], ...cols.filter((_, i) => i !== depthIdx)];
  }
  return writeLas({
    wellName: wellName || '',
    serviceCompany: 'Petrolord Suite',
    depthUnit: ordered[0].unit || 'M',
    curves: ordered.map((c) => ({
      mnemonic: c.key, unit: c.unit, descr: c.descr, data: c.data,
    })),
    params: paramRows,
  });
}

/** Filesystem-safe deliverable base name. */
export const exportBaseName = (wellName) => String(wellName || 'well')
  .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'well';

/**
 * Compose the live track canvas into a titled, logo-stamped PNG blob
 * (PS4). The canvas already holds the full DPR-scaled render; a
 * branded header band goes above it and the suite watermark in the
 * bottom-right corner (skipped silently if the asset fails to load).
 */
export function trackPlotPng({ canvas, title }) {
  return new Promise((resolve, reject) => {
    const scale = (canvas.width / (canvas.clientWidth || canvas.width)) || 1;
    const headerH = Math.round(34 * scale);
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height + headerH;
    const ctx = out.getContext('2d');
    // white header band with a slate rule, matching the white track canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, headerH);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, headerH - Math.max(1, Math.round(scale)), out.width, Math.max(1, Math.round(scale)));
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.round(12 * scale)}px sans-serif`;
    ctx.fillText(title, Math.round(10 * scale), Math.round(22 * scale));
    ctx.drawImage(canvas, 0, headerH);

    const finish = () => out.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the track plot PNG.'));
    }, 'image/png');

    const logo = new Image();
    logo.onload = () => {
      const h = Math.round(28 * scale);
      const w = Math.round(h * (logo.naturalWidth / (logo.naturalHeight || 1)));
      ctx.globalAlpha = 0.7;
      ctx.drawImage(logo, out.width - w - Math.round(8 * scale), out.height - h - Math.round(8 * scale), w, h);
      ctx.globalAlpha = 1;
      finish();
    };
    logo.onerror = finish;
    logo.src = '/petrolord-chart-watermark.png';
  });
}
