// WITSML 1.4.1.1 files (upgrade U2-011): the trajectory, log and mudLog
// objects written and read as files, so a live well can hand its survey,
// its depth data and its lithology intervals to (and take them from) any
// system that speaks the standard, with no live server (that is U2-014).
//
// Written: the 1series namespace, the plural root (trajectorys, logs,
// mudLogs), version 1.4.1.1, every quantity with its uom. Read: the same
// three objects from version 1.3.1 or 1.4.1 files, whatever the namespace
// prefix; every value is converted by the uom the file declares (a length
// or an angle with no uom is refused, never assumed); a 2.0 file, another
// object or broken XML is refused with the reason. A log becomes the table
// the import door already takes (services/mudlogImport.js), so columns and
// units are still checked by the user; a trajectory becomes stations for
// the Surveys door; mudLog intervals become cuttings descriptions through
// the description vocabulary, and the ones that do not fit are listed.
//
// The element names, their order and the enumerated values written
// (typeTrajStation unknown, aziRef grid north, indexType measured depth,
// typeLithology cuttings, the uom strings) were checked against the
// published Energistics 1.4.1.1 XSD files (obj_, grp_ and cs_ schemas for
// trajectory, log and mudLog, and enumValues.xml). The files are round-trip
// tested here; they have not been run through a schema validator or loaded
// into a third-party WITSML store, and the upgrade document says so. A
// lithology outside the standard's list is written by its Suite name.
// Pure apart from DOMParser (present in the browser and in jsdom).

import { resolveLithology } from '@/lib/wellsite/descriptionVocabulary';

export const WITSML_NS = 'http://www.witsml.org/schemas/1series';
export const WITSML_VERSION = '1.4.1.1';
const NULL = '-999.25';

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uid = (v) => esc(String(v || 'x').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 64));
const num = (v, dp = 4) => (Number.isFinite(v) ? String(Number(v.toFixed(dp))) : '');
const head = (root) => `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${WITSML_NS}" version="${WITSML_VERSION}">`;
const names = (well) => `    <nameWell>${esc(well.name)}</nameWell>\n    <nameWellbore>${esc(well.name)}</nameWellbore>`;
const ids = (well, objUid) => `uidWell="${uid(well.geo_well_id || well.id)}" uidWellbore="${uid(well.id)}" uid="${uid(objUid)}"`;

/** The survey in use as a WITSML trajectory (MD and TVD in metres, angles in degrees, azimuths from grid north). */
export function trajectoryXml({ well, listing, version = 'survey' }) {
  if (!listing || listing.length < 2) throw new Error('There is no survey to export.');
  const st = listing.map((s, i) => [
    `    <trajectoryStation uid="st-${i + 1}">`,
    '      <typeTrajStation>unknown</typeTrajStation>',
    `      <md uom="m">${num(s.md)}</md>`,
    `      <tvd uom="m">${num(s.tvd)}</tvd>`,
    `      <incl uom="dega">${num(s.inc)}</incl>`,
    `      <azi uom="dega">${num(s.azi)}</azi>`,
    '    </trajectoryStation>',
  ].join('\n'));
  return [
    head('trajectorys'),
    `  <trajectory ${ids(well, `traj-${version}`)}>`,
    names(well),
    `    <name>${esc(`${well.name} ${version}`)}</name>`,
    `    <mdMn uom="m">${num(listing[0].md)}</mdMn>`,
    `    <mdMx uom="m">${num(listing[listing.length - 1].md)}</mdMx>`,
    '    <aziRef>grid north</aziRef>',
    ...st,
    '  </trajectory>',
    '</trajectorys>',
    '',
  ].join('\n');
}

/** Canonical curve keys to WITSML mnemonics and uoms (the canonical frame of the import door). */
export const LOG_CURVES = Object.freeze([
  { key: 'rop', mnemonic: 'ROP', unit: 'm/h' }, { key: 'wob', mnemonic: 'WOB', unit: 'kN' }, { key: 'rpm', mnemonic: 'RPM', unit: 'rpm' },
  { key: 'torque', mnemonic: 'TQ', unit: 'kN.m' }, { key: 'spp', mnemonic: 'SPP', unit: 'kPa' }, { key: 'flow', mnemonic: 'FLOWIN', unit: 'm3/min' },
  { key: 'spm', mnemonic: 'SPM', unit: 'spm' }, { key: 'mw', mnemonic: 'MWIN', unit: 'kg/m3' }, { key: 'ecd', mnemonic: 'ECD', unit: 'kg/m3' },
  { key: 'total_gas', mnemonic: 'TGAS', unit: '%' }, { key: 'c1', mnemonic: 'C1', unit: 'ppm' }, { key: 'c2', mnemonic: 'C2', unit: 'ppm' }, { key: 'c3', mnemonic: 'C3', unit: 'ppm' },
  { key: 'ic4', mnemonic: 'IC4', unit: 'ppm' }, { key: 'nc4', mnemonic: 'NC4', unit: 'ppm' }, { key: 'ic5', mnemonic: 'IC5', unit: 'ppm' }, { key: 'nc5', mnemonic: 'NC5', unit: 'ppm' },
]);

/** The data rows (imported and typed) as a depth-indexed WITSML log. */
export function logXml({ well, points }) {
  const pts = (points || []).filter((p) => Number.isFinite(p.mdM));
  const curves = LOG_CURVES.filter((c) => pts.some((p) => Number.isFinite(p.values[c.key])));
  if (!pts.length || !curves.length) throw new Error('There are no data rows to export.');
  const info = [{ mnemonic: 'MD', unit: 'm' }, ...curves].map((c, i) => [
    `    <logCurveInfo uid="${c.mnemonic}">`,
    `      <mnemonic>${c.mnemonic}</mnemonic>`,
    `      <unit>${esc(c.unit)}</unit>`,
    ...(i === 0 ? [] : [`      <nullValue>${NULL}</nullValue>`]),
    '      <typeLogData>double</typeLogData>',
    '    </logCurveInfo>',
  ].join('\n'));
  const rows = pts.map((p) => `      <data>${[num(p.mdM), ...curves.map((c) => (Number.isFinite(p.values[c.key]) ? num(p.values[c.key], 6) : NULL))].join(',')}</data>`);
  return [
    head('logs'),
    `  <log ${ids(well, 'log-mudlog')}>`,
    names(well),
    `    <name>${esc(`${well.name} mudlogging data`)}</name>`,
    '    <indexType>measured depth</indexType>',
    `    <startIndex uom="m">${num(pts[0].mdM)}</startIndex>`,
    `    <endIndex uom="m">${num(pts[pts.length - 1].mdM)}</endIndex>`,
    '    <direction>increasing</direction>',
    '    <indexCurve>MD</indexCurve>',
    `    <nullValue>${NULL}</nullValue>`,
    ...info,
    '    <logData>',
    `      <mnemonicList>${['MD', ...curves.map((c) => c.mnemonic)].join(',')}</mnemonicList>`,
    `      <unitList>${['m', ...curves.map((c) => c.unit)].join(',')}</unitList>`,
    ...rows,
    '    </logData>',
    '  </log>',
    '</logs>',
    '',
  ].join('\n');
}

/** The current cuttings descriptions as a WITSML mudLog (one geologyInterval each, lithologies with their percentages). */
export function mudLogXml({ well, descriptions, textOf = () => '' }) {
  const ds = (descriptions || []).filter((r) => Number.isFinite(r.md_calc_m) && Number.isFinite(r.md2_calc_m) && r.md2_calc_m > r.md_calc_m).sort((a, b) => a.md_calc_m - b.md_calc_m);
  if (!ds.length) throw new Error('There are no cuttings descriptions to export.');
  const intervals = ds.map((r, i) => {
    const comps = ((r.payload && r.payload.components) || []).filter((c) => c.lithology);
    return [
      `    <geologyInterval uid="gi-${i + 1}">`,
      '      <typeLithology>cuttings</typeLithology>',
      `      <mdTop uom="m">${num(r.md_calc_m)}</mdTop>`,
      `      <mdBottom uom="m">${num(r.md2_calc_m)}</mdBottom>`,
      ...comps.map((c, j) => [
        `      <lithology uid="gi-${i + 1}-l${j + 1}">`,
        `        <type>${esc((resolveLithology(c.lithology) || { name: c.lithology }).name.toLowerCase())}</type>`,
        `        <codeLith>${esc(c.lithology)}</codeLith>`,
        `        <lithPc uom="%">${num(c.percent, 2)}</lithPc>`,
        '      </lithology>',
      ].join('\n')),
      `      <description>${esc(textOf(r))}</description>`,
      '    </geologyInterval>',
    ].join('\n');
  });
  return [
    head('mudLogs'),
    `  <mudLog ${ids(well, 'mudlog-cuttings')}>`,
    names(well),
    `    <name>${esc(`${well.name} cuttings descriptions`)}</name>`,
    `    <startMd uom="m">${num(ds[0].md_calc_m)}</startMd>`,
    `    <endMd uom="m">${num(ds[ds.length - 1].md2_calc_m)}</endMd>`,
    ...intervals,
    '  </mudLog>',
    '</mudLogs>',
    '',
  ].join('\n');
}

// ---- reading -----------------------------------------------------------------

const LENGTH = { m: 1, ft: 0.3048, ftus: 0.3048006096012192, km: 1000, cm: 0.01, in: 0.0254 };
const ANGLE = { dega: 1, deg: 1, rad: 180 / Math.PI, grad: 0.9, gon: 0.9 };
const local = (el) => (el.localName || el.nodeName.replace(/^.*:/, ''));
const kids = (el, name) => Array.from(el.children || []).filter((c) => local(c) === name);
const kid = (el, name) => kids(el, name)[0] || null;
const text = (el, name) => { const k = kid(el, name); return k ? (k.textContent || '').trim() : null; };

function measure(el, name, table, what, where) {
  const k = kid(el, name);
  if (!k) return { ok: false, reason: `${where} has no ${name}` };
  const v = Number((k.textContent || '').trim());
  const uom = (k.getAttribute('uom') || '').trim();
  if (!Number.isFinite(v)) return { ok: false, reason: `${where}: ${name} is not a number` };
  if (!uom) return { ok: false, reason: `${where}: ${name} has no uom, so the ${what} unit is not known` };
  const f = table[uom.toLowerCase()];
  if (f == null) return { ok: false, reason: `${where}: ${name} is in ${uom}, which is not a ${what} unit this reader knows` };
  return { ok: true, value: v * f, uom };
}

/** Parse a WITSML file: the object kind, its version and its objects (elements). Refuses what it cannot read, with the reason. */
export function parseWitsml(xmlText) {
  const raw = String(xmlText || '').replace(/^﻿/, '').trim();
  if (!raw) throw new Error('The file is empty.');
  if (!raw.startsWith('<')) throw new Error('This is not an XML file.');
  if (typeof DOMParser === 'undefined') throw new Error('This browser cannot read XML files.');
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  const root = doc.documentElement;
  if (!root || local(root) === 'parsererror' || doc.getElementsByTagName('parsererror').length) throw new Error('The XML is not well formed: the file is damaged or cut short.');
  const rootName = local(root);
  const KINDS = { trajectorys: 'trajectory', trajectory: 'trajectory', logs: 'log', log: 'log', mudLogs: 'mudLog', mudLog: 'mudLog' };
  const kind = KINDS[rootName];
  if (!kind) {
    if (/^(Trajectory|Log|ChannelSet|WellboreGeology|EnergisticsResource)/.test(rootName)) throw new Error(`This is a WITSML 2.0 ${rootName} file. This reader takes the 1.4.1.1 (and 1.3.1.1) trajectory, log and mudLog objects; ask for a 1.4.1.1 export.`);
    throw new Error(`The file holds ${rootName}, which is not a WITSML trajectory, log or mudLog.`);
  }
  const version = (root.getAttribute('version') || '').trim() || null;
  if (version && !/^1\.[34]\./.test(version)) throw new Error(`This file says WITSML version ${version}. This reader takes versions 1.3.1 and 1.4.1.`);
  const objects = rootName === kind ? [root] : kids(root, kind);
  if (!objects.length) throw new Error(`The file has no ${kind} in it.`);
  return { kind, version, objects, notes: version ? [] : ['The file does not state its WITSML version; it is read as 1.4.1.'] };
}

/** Stations of the first trajectory: MD in metres, angles in degrees, by each value's own uom. */
export function trajectoryFromWitsml(parsed) {
  if (parsed.kind !== 'trajectory') throw new Error('This file is not a WITSML trajectory.');
  const t = parsed.objects[0];
  const stations = []; const skipped = [];
  kids(t, 'trajectoryStation').forEach((s, i) => {
    const where = `station ${i + 1}`;
    const md = measure(s, 'md', LENGTH, 'length', where);
    const inc = measure(s, 'incl', ANGLE, 'angle', where);
    const azi = measure(s, 'azi', ANGLE, 'angle', where);
    const bad = [md, inc, azi].find((x) => !x.ok);
    if (bad) { skipped.push({ line: i + 1, text: where, reason: bad.reason.replace(`${where}: `, '').replace(`${where} `, '') }); return; }
    stations.push({ md: Number(md.value.toFixed(4)), inc: inc.value, azi: azi.value, line: i + 1 });
  });
  stations.sort((a, b) => a.md - b.md);
  const ref = (text(t, 'aziRef') || '').toLowerCase();
  const azimuthRef = /grid/.test(ref) ? 'grid' : /true/.test(ref) ? 'true' : /magnetic/.test(ref) ? 'magnetic' : null;
  const notes = [...parsed.notes];
  if (parsed.objects.length > 1) notes.push(`The file holds ${parsed.objects.length} trajectories; the first is read.`);
  if (!azimuthRef) notes.push('The file does not say what north its azimuths are measured from: declare it.');
  return { name: text(t, 'name') || text(t, 'nameWell') || 'trajectory', stations, skipped, azimuthRef, mdUnit: 'm', notes };
}

/** A log as the table the mudlog import door takes (columns, the units the file declares, rows). */
export function logTableFromWitsml(parsed) {
  if (parsed.kind !== 'log') throw new Error('This file is not a WITSML log.');
  const log = parsed.objects[0];
  const data = kid(log, 'logData');
  if (!data) throw new Error('The log has no logData: it is a header with no rows.');
  let columns = (text(data, 'mnemonicList') || '').split(',').map((c) => c.trim()).filter(Boolean);
  let units = (text(data, 'unitList') || '').split(',').map((c) => c.trim());
  const infos = kids(log, 'logCurveInfo');
  if (!columns.length) { columns = infos.map((c) => text(c, 'mnemonic') || c.getAttribute('uid') || ''); units = infos.map((c) => text(c, 'unit') || ''); }
  if (!columns.length) throw new Error('The log does not name its curves (no mnemonicList and no logCurveInfo).');
  const nullValue = text(log, 'nullValue');
  const nulls = new Set([nullValue, ...infos.map((c) => text(c, 'nullValue'))].filter((v) => v != null && v !== ''));
  const rows = kids(data, 'data').map((d, i) => ({ line: i + 1, cells: (d.textContent || '').split(',').map((c) => { const v = c.trim(); return v === '' || nulls.has(v) ? '' : v; }) }));
  if (!rows.length) throw new Error('The log has no data rows.');
  const indexType = (text(log, 'indexType') || '').toLowerCase();
  const notes = [...parsed.notes, `WITSML log ${text(log, 'name') || ''} read: ${columns.length} curve(s), ${rows.length} row(s), index ${indexType || 'not stated'}.`.replace('  ', ' ')];
  if (parsed.objects.length > 1) notes.push(`The file holds ${parsed.objects.length} logs; the first is read.`);
  return { format: 'witsml', delim: 'witsml', columns, units: columns.map((_, i) => units[i] || null), rows, commaDecimal: false, headerLines: 0, nullValue: nullValue != null ? Number(nullValue) : null, notes, indexType };
}

/**
 * mudLog geology intervals as cuttings description candidates.
 * @returns {{ name, intervals: {mdTopM, mdBaseM, components, comment}[], skipped: {line, text, reason}[], notes }}
 */
export function intervalsFromWitsml(parsed) {
  if (parsed.kind !== 'mudLog') throw new Error('This file is not a WITSML mudLog.');
  const m = parsed.objects[0];
  const intervals = []; const skipped = [];
  kids(m, 'geologyInterval').forEach((g, i) => {
    const where = `interval ${i + 1}`;
    const top = measure(g, 'mdTop', LENGTH, 'length', where);
    const base = measure(g, 'mdBottom', LENGTH, 'length', where);
    const bad = [top, base].find((x) => !x.ok);
    const fail = (reason) => skipped.push({ line: i + 1, text: where, reason });
    if (bad) { fail(bad.reason.replace(`${where}: `, '').replace(`${where} `, '')); return; }
    if (!(base.value > top.value)) { fail('its base is not below its top'); return; }
    const liths = kids(g, 'lithology');
    if (!liths.length) { fail('it has no lithology'); return; }
    const components = []; let unknown = null; let pcMissing = false;
    for (const l of liths) {
      const name = text(l, 'codeLith') || text(l, 'type') || '';
      const res = resolveLithology(name) || resolveLithology(text(l, 'type') || '');
      const pcEl = kid(l, 'lithPc');
      const pc = pcEl ? Number((pcEl.textContent || '').trim()) * ((pcEl.getAttribute('uom') || '%').toLowerCase() === 'euc' ? 100 : 1) : NaN;
      if (!res) { unknown = name || '(none)'; break; }
      if (!Number.isFinite(pc)) pcMissing = true;
      components.push({ lithology: res.code, percent: pc });
    }
    if (unknown) { fail(`the lithology "${unknown}" is not in the description vocabulary`); return; }
    if (pcMissing) { if (components.length === 1) components[0].percent = 100; else { fail('a lithology has no percentage'); return; } }
    const sum = components.reduce((a, c) => a + c.percent, 0);
    if (Math.abs(sum - 100) > 5) { fail(`its lithology percentages add up to ${sum}, they must add up to 100`); return; }
    intervals.push({ mdTopM: Number(top.value.toFixed(4)), mdBaseM: Number(base.value.toFixed(4)), components, comment: text(g, 'description') || '', line: i + 1 });
  });
  intervals.sort((a, b) => a.mdTopM - b.mdTopM);
  const notes = [...parsed.notes];
  if (parsed.objects.length > 1) notes.push(`The file holds ${parsed.objects.length} mud logs; the first is read.`);
  return { name: text(m, 'name') || 'mud log', intervals, skipped, notes };
}

/** Record parameters for imported intervals: cuttings descriptions marked as externally sourced. */
export function descriptionRecordsFromIntervals(intervals, { fileName }) {
  return intervals.map((iv) => ({
    kind: 'observation', subtype: 'cuttings_description',
    depth: { value: iv.mdTopM, unit: 'm', reference: 'MD', datum: 'KB', kind: 'lagged_sample' },
    depth2: { value: iv.mdBaseM, unit: 'm', reference: 'MD', datum: 'KB', kind: 'lagged_sample' },
    payload: { components: iv.components.map((c) => ({ lithology: c.lithology, percent: c.percent })), comment: iv.comment, mode: 'import', source: 'external', source_file: fileName || null },
  }));
}

/** Hand a text file to the browser as a download (no-op without a document). */
export function downloadText(name, body, type = 'application/xml') {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
