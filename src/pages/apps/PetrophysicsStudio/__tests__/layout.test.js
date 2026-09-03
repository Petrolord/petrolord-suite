// PS4: layout schema + track resolution — missing-curve tolerance,
// fill rebinding, param-bound thresholds, clone-on-edit for built-ins,
// migration fallback and built-in refresh.

import {
  buildDefaultLayouts, migrateLayouts, updateTemplate, activeTemplate,
} from '../layout/layoutSchema';
import { resolveTracks } from '../layout/resolveTracks';

const d = Float64Array.from([1, 2, 3]);
const fullCtx = {
  curves: { GR: d, RHOB: d, NPHI: d, RT: d, DT: d },
  outputs: { PHIE: d, VSH: d, SW: d, PAY: d },
  faciesData: d,
  facies: [{ name: 'A', color: '#111111' }],
  params: { cutPhi: 0.08, grClean: 20 },
};

test('default template resolves fully with a complete workspace', () => {
  const tpl = activeTemplate(buildDefaultLayouts());
  const tracks = resolveTracks(tpl, fullCtx);
  expect(tracks.map((t) => t.key)).toEqual(
    ['t-gr', 't-rt', 't-dn', 't-phi', 't-vsh', 't-sw', 't-pay', 't-facies'],
  );
  const dn = tracks.find((t) => t.key === 't-dn');
  expect(dn.fills[0]).toMatchObject({ mode: 'crossover', a: 1, b: 0 });
  const gr = tracks.find((t) => t.key === 't-gr');
  expect(gr.fills[0]).toMatchObject({ mode: 'threshold', value: 20, side: 'above' });
});

test('missing curves drop cleanly: curve, its fills, then the track', () => {
  const tpl = activeTemplate(buildDefaultLayouts());
  const ctx = { ...fullCtx, curves: { GR: d, RHOB: d }, outputs: {}, faciesData: null };
  const tracks = resolveTracks(tpl, ctx);
  expect(tracks.map((t) => t.key)).toEqual(['t-gr', 't-dn']);
  const dn = tracks.find((t) => t.key === 't-dn');
  expect(dn.curves).toHaveLength(1); // NPHI absent
  expect(dn.fills).toHaveLength(0);  // crossover lost a leg
});

test('non-finite threshold param drops the fill, not the track', () => {
  const tpl = activeTemplate(buildDefaultLayouts());
  const tracks = resolveTracks(tpl, { ...fullCtx, params: {} });
  const gr = tracks.find((t) => t.key === 't-gr');
  expect(gr.fills).toHaveLength(0);
  expect(gr.curves).toHaveLength(1);
});

test('editing a built-in forks it and moves the active id (clone-on-edit)', () => {
  const layouts = buildDefaultLayouts();
  const next = updateTemplate(layouts, 'std-triple-combo', (t) => ({ ...t, name: t.name, tracks: t.tracks.slice(0, 2) }));
  expect(next.templates).toHaveLength(layouts.templates.length + 1);
  const fork = activeTemplate(next);
  expect(fork.builtin).toBe(false);
  expect(fork.name).toBe('Standard triple combo (edited)');
  expect(fork.tracks).toHaveLength(2);
  // the built-in itself is untouched
  expect(next.templates.find((t) => t.id === 'std-triple-combo').tracks.length).toBeGreaterThan(2);
  // editing the fork mutates in place (no second fork)
  const next2 = updateTemplate(next, fork.id, (t) => ({ ...t, name: 'Mine' }));
  expect(next2.templates).toHaveLength(next.templates.length);
  expect(activeTemplate(next2).name).toBe('Mine');
});

test('migrateLayouts: garbage falls back to defaults; user templates survive; built-ins refresh', () => {
  expect(migrateLayouts(null).activeTemplateId).toBe('std-triple-combo');
  expect(migrateLayouts({}).templates.length).toBeGreaterThan(0);
  const custom = { id: 'mine', name: 'Mine', builtin: false, tracks: [] };
  const stale = {
    version: 1,
    activeTemplateId: 'mine',
    templates: [{ id: 'std-triple-combo', name: 'OLD STALE COPY', builtin: true, tracks: [] }, custom],
  };
  const m = migrateLayouts(stale);
  expect(m.activeTemplateId).toBe('mine');
  expect(m.templates.find((t) => t.id === 'mine')).toEqual(custom);
  // the stored stale built-in was replaced by the code's copy
  expect(m.templates.find((t) => t.id === 'std-triple-combo').name).toBe('Standard triple combo');
});

test('log:<MNEMONIC> addresses draw raw registry curves; several of one type share a track', () => {
  const tpl = {
    id: 't', name: 't', tracks: [{
      id: 't-res', title: 'Resistivity', type: 'curves', scale: 'log', min: 0.2, max: 2000,
      curves: [
        { source: 'log:A16H', color: '#111' },
        { source: 'log:A34H', color: '#222', label: 'deep' },
        { source: 'log:P40H:2', color: '#333' },
        { source: 'log:MISSING', color: '#444' },
        { source: 'input:RT', color: '#555' },
      ],
      fills: [{ mode: 'crossover', a: 'log:A16H', b: 'log:A34H', positiveColor: '#0f0', negativeColor: '#f00', opacity: 0.2 }],
    }],
  };
  const tracks = resolveTracks(tpl, { curves: {}, outputs: {}, logs: { A16H: d, A34H: d, 'P40H:2': d }, params: {} });
  expect(tracks).toHaveLength(1);
  expect(tracks[0].curves.map((c) => c.name)).toEqual(['A16H', 'deep', 'P40H:2']);
  expect(tracks[0].fills[0]).toMatchObject({ mode: 'crossover', a: 0, b: 1 });
});

test('topStyles ride in layouts without a migration: show-all, per-name colour and hidden, visibleTops', async () => {
  const { getTopStyles, setTopStyle, setShowAllTops, visibleTops } = await import('../layout/layoutSchema');
  let l = buildDefaultLayouts();
  expect(getTopStyles(l)).toEqual({ showAll: true, byName: {} });
  l = setTopStyle(l, ' Top  Sand A ', { color: '#123456' });
  l = setTopStyle(l, 'Top Shale', { hidden: true });
  expect(getTopStyles(l).byName).toEqual({ 'top sand a': { color: '#123456' }, 'top shale': { hidden: true } });
  const tops = [{ id: 1, name: 'Top Sand A', md_m: 2010 }, { id: 2, name: 'top shale', md_m: 2030 }];
  expect(visibleTops(tops, l).map((t) => t.id)).toEqual([1]);
  l = setTopStyle(l, 'Top Shale', { hidden: false });
  expect(visibleTops(tops, l)).toHaveLength(2);
  l = setShowAllTops(l, false);
  expect(visibleTops(tops, l)).toEqual([]);
  // migrateLayouts keeps the preferences
  expect(getTopStyles(migrateLayouts(JSON.parse(JSON.stringify(l)))).showAll).toBe(false);
});

// ---- PT6: fills v2 ------------------------------------------------------------
test('lithology quicklook resolves a two-colour cutoff and a GR ramp; t-dn keeps its leg order with the standard colours', () => {
  const layouts = buildDefaultLayouts();
  expect(layouts.version).toBe(2);
  expect(layouts.templates.map((t) => t.id)).toEqual(['std-triple-combo', 'quicklook', 'lithology-quicklook']);
  const litho = layouts.templates.find((t) => t.id === 'lithology-quicklook');
  const tracks = resolveTracks(litho, fullCtx);
  expect(tracks.map((t) => t.key)).toEqual(['l-gr', 'l-litho', 'l-rt', 'l-dn']);
  expect(tracks[0].fills[0]).toMatchObject({ mode: 'threshold', value: 75, side: 'below', color: '#fde047', color2: '#9ca3af' });
  expect(tracks[1].fills[0]).toMatchObject({ mode: 'ramp', a: 0, fillTo: 'track' });
  expect(tracks[1].fills[0].stops).toHaveLength(2);
  const dn = resolveTracks(activeTemplate(layouts), fullCtx).find((t) => t.key === 't-dn');
  expect(dn.fills[0]).toMatchObject({ mode: 'crossover', a: 1, b: 0, positiveColor: '#facc15', negativeColor: '#9ca3af' });
});

test('ramp fills drop when the leg is missing or fewer than two distinct stops remain; v1 thresholds keep resolving without color2', () => {
  const tpl = { id: 't', name: 't', tracks: [{
    id: 'x', title: 'x', type: 'curves', scale: 'linear', min: 0, max: 150,
    curves: [{ source: 'input:GR', color: '#000' }, { source: 'input:RT', color: '#111' }],
    fills: [
      { mode: 'ramp', a: 'input:RT', stops: [{ value: 0, color: '#000' }, { value: 1, color: '#fff' }] },
      { mode: 'ramp', a: 'input:GR', stops: [{ value: 5, color: '#000' }, { value: 5, color: '#fff' }] },
      { mode: 'ramp', a: 'input:GR', stops: [{ value: 150, color: '#fff' }, { value: 0, color: '#000' }] },
      { mode: 'threshold', a: 'input:GR', threshold: { value: 75 }, side: 'above', color: '#abc', opacity: 0.2 },
    ],
  }] };
  const out = resolveTracks(tpl, { curves: { GR: d }, outputs: {}, params: {} });
  expect(out[0].fills).toHaveLength(2);
  expect(out[0].fills[0].stops.map((s) => s.value)).toEqual([0, 150]);
  expect(out[0].fills[1].color2).toBeUndefined();
});

test('migrateLayouts stamps version 2, keeps a v1 user fork byte-identical and adds the lithology built-in', () => {
  const fork = { id: 'mine', name: 'Mine', builtin: false, tracks: [{ id: 'a', title: 'a', type: 'curves', width: 1, scale: 'linear', min: 0, max: 1, curves: [{ source: 'input:GR', color: '#000' }], fills: [{ mode: 'threshold', a: 'input:GR', threshold: { param: 'grClean' }, side: 'above', color: '#a3a065', opacity: 0.22 }] }] };
  const m = migrateLayouts({ version: 1, activeTemplateId: 'mine', templates: [JSON.parse(JSON.stringify(fork))] });
  expect(m.version).toBe(2);
  expect(m.templates.map((t) => t.id)).toEqual(['std-triple-combo', 'quicklook', 'lithology-quicklook', 'mine']);
  expect(m.templates.find((t) => t.id === 'mine')).toEqual(fork);
  expect(m.activeTemplateId).toBe('mine');
});
