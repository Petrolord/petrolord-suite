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
