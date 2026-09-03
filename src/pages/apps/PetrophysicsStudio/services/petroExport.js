// Deliverable assembly (Petrophysics Studio PS2, audit A1): the curves
// CSV, the zone-summary CSV and the LAS 2.0 file for the current
// interpretation. Pure builders returning strings — the dialog owns
// the save — so every deliverable is jest-testable against the
// analytic type well. LAS writing goes through the round-trip-gated
// engines writer (parseLas(writeLas(x)) is bit-identical after the
// float32 cast).

import { writeLas } from '../../WellDataManager/engine/lasWrite';
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
export function curvesCsv(wellData, outputs) {
  const cols = exportColumns(wellData, outputs);
  if (!cols.length) throw new Error('Nothing to export — no curves loaded.');
  const n = cols[0].data.length;
  const lines = [cols.map((c) => (c.unit ? `${c.key} (${c.unit})` : c.key)).join(',')];
  for (let i = 0; i < n; i++) {
    lines.push(cols.map((c) => num(c.data[i])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Zone-summary CSV from the live ZoneManager summaries. */
export function zonesCsv(zones, summaries) {
  const rows = zones.filter((z) => summaries[z.id]);
  if (!rows.length) throw new Error('No zone summaries to export — add a zone first.');
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

/** LAS 2.0 text: depth + inputs + computed outputs, with the full
 *  parameter set and provenance in ~Parameter. */
export function buildLas(wellData, outputs, params, { wellName, projectId }) {
  const cols = exportColumns(wellData, outputs);
  const depthIdx = cols.findIndex((c) => c.key === 'DEPT');
  if (depthIdx < 0) throw new Error('Cannot export LAS without a depth curve.');
  const ordered = [cols[depthIdx], ...cols.filter((_, i) => i !== depthIdx)];
  const paramRows = Object.entries(params)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .map(([name, value]) => ({ name, value, descr: 'interpretation parameter' }));
  paramRows.push(
    { name: 'ENGINE', value: 'petrophysics-studio', descr: 'computing engine' },
    { name: 'PIPEVER', value: PIPELINE_VERSION, descr: 'pipeline version' },
    { name: 'PROJECT', value: projectId || '', descr: 'project id' },
  );
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
