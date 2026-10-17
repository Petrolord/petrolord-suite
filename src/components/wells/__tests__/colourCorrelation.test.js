// Geoscience showcase polish (2026-10-17): the colourful correlation panel.
//  - faciesPalette: name-aware facies colours, stable fallback per code
//  - a `log` strip draws a registry code curve (RP_FACIES) with its names,
//    legend and run labels; 0 and nulls blank; wrong grid draws nothing
//  - the Correlation colour template and its ramp preset
//  - section wells read published registry logs for output: tracks
//  - zone tint strength

import { faciesColor, codeCategories, pickCodeLog, isCodeLog, CATEGORY_COLORS } from '../faciesPalette';
import { resolveTracks } from '../layout/resolveTracks';
import { buildDefaultTemplates, migrateLayouts, STRIP_SOURCES, RAMP_PRESETS } from '../layout/layoutSchema';
import { publishedOutputs } from '../section/useSectionWells';
import { zoneAlphaHex } from '../section/CrossSection';
import { paintStripLegend, paintStripRunLabels, textOn } from '../trackPainter';

const depth = Float64Array.from({ length: 10 }, (_, i) => 1500 + i);
const codes = Float32Array.from([1, 1, 1, 2, 2, 0, NaN, 3, 3, 3]);
const rpRow = {
  mnemonic: 'RP_FACIES', unit: 'CODE',
  provenance: { kind: 'facies', codes: [{ code: 1, name: 'Hydrocarbon sand' }, { code: 2, name: 'Brine sand' }, { code: 3, name: 'Shale' }] },
};

test('facies colours follow the name, and unnamed codes keep one palette colour each', () => {
  expect(faciesColor('Hydrocarbon sand', 1)).toBe('#ea580c');
  expect(faciesColor('Gas', 9)).toBe('#ea580c');
  expect(faciesColor('Brine sand', 2)).toBe('#2563eb');
  expect(faciesColor('Shale', 3)).toBe('#7c8a6a');
  expect(faciesColor('Channel sand', 4)).toBe('#facc15');
  expect(faciesColor('Limestone', 5)).toBe('#06b6d4');
  expect(faciesColor('', 1)).toBe(CATEGORY_COLORS[0]);
  expect(faciesColor('Facies X', 2)).toBe(faciesColor('Facies Y', 2));
  expect(faciesColor('', 1)).not.toBe(faciesColor('', 2));
});

test('code categories carry names, colours and counts; samples map to category indexes', () => {
  const { categories, index } = codeCategories(rpRow, codes);
  expect(categories.map((c) => [c.code, c.name, c.count])).toEqual([[1, 'Hydrocarbon sand', 3], [2, 'Brine sand', 2], [3, 'Shale', 3]]);
  expect(Array.from(index).slice(0, 5)).toEqual([0, 0, 0, 1, 1]);
  expect(Number.isNaN(index[5])).toBe(true); // 0 = inside no class
  expect(Number.isNaN(index[6])).toBe(true); // null
  // a code with no name in the provenance is still drawn, as "Code n"
  const extra = codeCategories(rpRow, Float32Array.from([4, 1]));
  expect(extra.categories.map((c) => c.name)).toEqual(['Hydrocarbon sand', 'Brine sand', 'Shale', 'Code 4']);
});

test('the code log picked is RP_FACIES first, any CODE / facies log otherwise, or the named one', () => {
  const rows = [{ mnemonic: 'GR', unit: 'GAPI' }, { mnemonic: 'LITH', unit: 'CODE' }, rpRow];
  const logs = { GR: [1], LITH: [1], RP_FACIES: [1] };
  expect(pickCodeLog(rows, logs).mnemonic).toBe('RP_FACIES');
  expect(pickCodeLog(rows, logs, 'LITH').mnemonic).toBe('LITH');
  expect(pickCodeLog(rows.slice(0, 2), logs).mnemonic).toBe('LITH');
  expect(pickCodeLog([{ mnemonic: 'GR', unit: 'GAPI' }], logs)).toBeNull();
  expect(isCodeLog({ mnemonic: 'X', provenance: { kind: 'facies' } })).toBe(true);
  expect(isCodeLog({ mnemonic: 'GR', unit: 'GAPI' })).toBe(false);
});

const tpl = (source) => ({ id: 't', name: 't', tracks: [{ id: 's', title: 'Facies', type: 'strip', width: 0.5, source }] });

test('a log strip resolves the registry code curve with legend and run labels', () => {
  const [strip] = resolveTracks(tpl('log'), { curves: { DEPT: depth }, logs: { RP_FACIES: codes }, logRows: [rpRow], outputs: {}, depth });
  expect(strip.type).toBe('strip');
  expect(strip.labels).toEqual(['Hydrocarbon sand', 'Brine sand', 'Shale']);
  expect(strip.colors).toEqual(['#ea580c', '#2563eb', '#7c8a6a']);
  expect(strip.legend).toBe(true);
  expect(strip.runLabels).toBe(true);
  expect(strip.curves[0].name).toBe('RP_FACIES');
  // negative controls: no code log, or a curve on another depth grid, draws no strip
  expect(resolveTracks(tpl('log'), { curves: { DEPT: depth }, logs: { GR: codes }, logRows: [{ mnemonic: 'GR', unit: 'GAPI' }], outputs: {}, depth })).toEqual([]);
  expect(resolveTracks(tpl('log'), { curves: { DEPT: depth }, logs: { RP_FACIES: codes.slice(0, 4) }, logRows: [rpRow], outputs: {}, depth })).toEqual([]);
  expect(resolveTracks(tpl('log:RP_FACIES'), { curves: { DEPT: depth }, logs: { RP_FACIES: codes }, logRows: [rpRow], outputs: {}, depth })).toHaveLength(1);
});

test('the editor lists the facies curve source; the Correlation colour template is built in and survives migration', () => {
  expect(STRIP_SOURCES.find((s) => s.value === 'log').label).toMatch(/Facies curve/);
  const t = buildDefaultTemplates().find((x) => x.id === 'correlation-colour');
  expect(t.name).toBe('Correlation colour');
  expect(t.builtin).toBe(true);
  expect(t.tracks.map((x) => x.id)).toEqual(['c-gr', 'c-facies', 'c-rt', 'c-dn', 'c-phi']);
  expect(t.tracks[0].fills[0]).toMatchObject({ mode: 'ramp', fillTo: 'right', stops: RAMP_PRESETS.sandShale.stops });
  expect(RAMP_PRESETS.sandShale.stops[0].color).toBe('#fde047');
  expect(t.tracks[1]).toMatchObject({ type: 'strip', source: 'log' });
  const old = { version: 2, activeTemplateId: 'quicklook', templates: buildDefaultTemplates().filter((x) => x.id !== 'correlation-colour') };
  expect(migrateLayouts(old).templates.some((x) => x.id === 'correlation-colour')).toBe(true);
  // the existing built-ins are unchanged
  expect(buildDefaultTemplates().map((x) => x.id)).toEqual(['std-triple-combo', 'quicklook', 'borehole-qc', 'lithology-quicklook', 'correlation-colour']);
});

test('section wells read published PHIE/VSH/SW/KPERM/PAY logs as outputs, on their own grid only', () => {
  const phie = Float32Array.from(depth, () => 0.2);
  const out = publishedOutputs({ curves: { DEPT: depth }, logs: { PHIE: phie, SW: phie, GR: phie, VSH: phie.slice(0, 3) } });
  expect(Object.keys(out).sort()).toEqual(['PHIE', 'SW']);
  const t = buildDefaultTemplates().find((x) => x.id === 'correlation-colour');
  const tracks = resolveTracks(t, { curves: { DEPT: depth, GR: phie, RT: phie, RHOB: phie, NPHI: phie }, logs: {}, logRows: [], outputs: out, params: {}, depth });
  expect(tracks.map((x) => x.key)).toEqual(['c-gr', 'c-rt', 'c-dn', 'c-phi']);
  // negative control: with outputs {} (before this change) the porosity track drops
  expect(resolveTracks(t, { curves: { DEPT: depth, GR: phie }, logs: {}, outputs: {}, params: {}, depth }).map((x) => x.key)).toEqual(['c-gr']);
});

test('zone tint strength: light is the historic alpha, bold is stronger', () => {
  expect(zoneAlphaHex('light')).toBe('1f');
  expect(zoneAlphaHex(undefined)).toBe('1f');
  expect(zoneAlphaHex('bold')).toBe('55');
});

const recCtx = () => {
  const calls = [];
  return {
    calls,
    ctx: new Proxy({ measureText: (s) => ({ width: String(s).length * 5 }) }, {
      get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])),
      set: (t, k, v) => { t[k] = v; return true; },
    }),
  };
};

test('the strip legend draws a chip and a name per category; runs tall enough are labelled', () => {
  const [strip] = resolveTracks(tpl('log'), { curves: { DEPT: depth }, logs: { RP_FACIES: codes }, logRows: [rpRow], outputs: {}, depth });
  const a = recCtx();
  paintStripLegend(a.ctx, { track: strip, x0: 0, w: 120, headerH: 50 });
  expect(a.calls.filter((c) => c[0] === 'fillRect')).toHaveLength(3);
  expect(a.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual(['Hydrocarbon sand', 'Brine sand', 'Shale']);
  const narrow = recCtx();
  paintStripLegend(narrow.ctx, { track: strip, x0: 0, w: 30, headerH: 50 });
  expect(narrow.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual(['HS', 'BS', 'S']);
  const b = recCtx();
  paintStripRunLabels(b.ctx, { track: strip, depth, yOf: (d) => (d - 1500) * 40, i0: 0, i1: 9, x0: 0, w: 40 });
  expect(b.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])).toEqual(['Hydrocarbon sand', 'Brine sand', 'Shale']);
  expect(textOn('#facc15')).toBe('#111827');
  expect(textOn('#2563eb')).toBe('#ffffff');
});
