// Project Data Inventory as CSV: one file, one section per part (wells,
// seismic, interpretations, items outside Petrolord, readiness, notes),
// depths in the project's unit. Pure.

import { STATUS } from './status';
import { fmtDepth } from './coverage';
import { fmtBytes } from './seismic';
import { LEVEL } from './readiness';
import { SEVERITY_LABEL } from './rules';

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (arr) => arr.map(cell).join(',');
const pct = (f) => (Number.isFinite(f) ? `${Math.round(f * 100)}%` : '');

export function inventoryCsv(inv, { projectName = '', generatedAt = new Date() } = {}) {
  const u = inv.unit;
  const out = [];
  out.push(line(['Project Data Inventory', projectName]));
  out.push(line(['Generated', generatedAt.toISOString().slice(0, 16).replace('T', ' ')]));
  out.push(line(['Readiness score', `${inv.summary.score}/100`]));
  out.push('');
  out.push(line(['WELLS']));
  out.push(line(['Well', 'Interval', `Interval top (${u} MD)`, `Interval base (${u} MD)`,
    ...inv.columns.flatMap((c) => [`${c.groupLabel}: ${c.label}`, `${c.label} coverage`]), 'Remarks']));
  for (const r of inv.rows) {
    out.push(line([
      r.wellName, r.interval?.label || '', r.interval ? fmtDepth(r.interval.top, u, 1) : '', r.interval ? fmtDepth(r.interval.base, u, 1) : '',
      ...inv.columns.flatMap((c) => {
        const x = r.cells[c.key];
        return [STATUS[x.status]?.label || x.status, x.count != null ? `${x.count} plugs` : pct(x.coverage)];
      }),
      r.remark,
    ]));
  }
  out.push('');
  out.push(line(['SEISMIC']));
  out.push(line(['Name', 'Type', 'Domain', 'Format', 'Bits', 'Inlines', 'Crosslines', 'Traces', 'Bin (m)', 'Area (km2)', 'Sample rate (ms)', 'Record length', 'CRS', 'Size']));
  for (const v of inv.seismic.rows) {
    out.push(line([
      v.name, v.type, v.domain || '', v.format || '', v.bits || '',
      v.il ? `${v.il.min}-${v.il.max}` : '', v.xl ? `${v.xl.min}-${v.xl.max}` : '', v.traces || '',
      v.binIl ? `${v.binIl.toFixed(1)} x ${v.binXl.toFixed(1)}` : (v.binWidthM ? `offset bin ${v.binWidthM}` : ''),
      v.areaKm2 ? v.areaKm2.toFixed(1) : '', v.dtMs ?? '', v.recordMs != null ? `${Math.round(v.recordMs)} ${v.recordUnit}` : '', v.crs || '', fmtBytes(v.bytes),
    ]));
  }
  out.push('');
  out.push(line(['INTERPRETATIONS']));
  out.push(line(['Item', 'State', 'Count', 'Detail']));
  for (const r of inv.interpretations) out.push(line([r.label, STATUS[r.status]?.label || r.status, r.count ?? '', r.text]));
  out.push('');
  out.push(line(['ITEMS OUTSIDE PETROLORD']));
  out.push(line(['Kind', 'Title', 'Well', 'State', 'Source', 'Date', 'Note']));
  for (const m of inv.manual) out.push(line([m.kindLabel, m.title, m.well, m.stateLabel, m.source, m.date, m.note]));
  out.push('');
  out.push(line(['READINESS']));
  out.push(line(['Workflow', 'Level', 'Reason']));
  for (const w of inv.readiness.workflows) out.push(line([w.label, LEVEL[w.level].label, w.reason]));
  out.push('');
  out.push(line(['NOTES']));
  out.push(line(['Severity', 'Area', 'Finding', 'Impact', 'Workaround', 'Uncertainty', 'Mitigation', 'Dismissed', 'Comment']));
  for (const f of inv.findings) {
    out.push(line([SEVERITY_LABEL[f.severity], f.area, f.title, f.impact, f.workaround, f.uncertainty, f.mitigation, f.dismissed ? 'yes' : '', f.comment]));
  }
  return `${out.join('\n')}\n`;
}
