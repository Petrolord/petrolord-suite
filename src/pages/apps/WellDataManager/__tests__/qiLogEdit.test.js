/**
 * QI programme Q1 / A3 (2026-10-06): log editing in Well Data Manager. The
 * maths is the vendored engines' (petrophysics/logEdit.js; oracle goldens
 * there). These gates check the Suite glue: a common grid and resampling,
 * new-curve naming and provenance, unit handling, and the drift correction
 * on TVDSS against the stored vertical checkshots, including a deviated well.
 */
import { commonGrid, resampleTo, prepareSplice, prepareEdits, prepareDrift } from '../services/logEdit';
import { makeWellFrame } from '@/lib/wellDatum';
import { curveOrigin } from '../engine/provenance';

const reg = (id, mnemonic, unit, start, step, n) => ({ id, mnemonic, unit, start_md_m: start, stop_md_m: start + step * (n - 1), step_m: step, n_samples: n });

describe('grid and resampling', () => {
  test('the finest step over the union; values kept at shared depths; nulls never bridged', () => {
    const a = reg('a', 'GR', 'GAPI', 100, 0.5, 21); // 100..110
    const b = reg('b', 'GR', 'GAPI', 105, 0.25, 41); // 105..115
    const g = commonGrid([a, b]);
    expect(g[0]).toBe(100);
    expect(g[1] - g[0]).toBe(0.25);
    expect(g[g.length - 1]).toBe(115);
    const da = Float32Array.from({ length: 21 }, (_, i) => (i === 10 ? NaN : i));
    const r = resampleTo(a, da, g);
    expect(r[g.indexOf(101)]).toBe(2);
    expect(r[g.indexOf(101.25)]).toBeCloseTo(2.5, 9);
    expect(Number.isNaN(r[g.indexOf(104.75)])).toBe(true); // between 4.5 and the null at 105
    expect(Number.isNaN(r[g.indexOf(112)])).toBe(true); // outside the log
  });
});

describe('splice and edits as new curves', () => {
  const a = reg('a', 'GR', 'GAPI', 100, 1, 21);
  const b = reg('b', 'GR:2', 'GAPI', 100, 1, 21);
  const da = Float32Array.from({ length: 21 }, (_, i) => (i <= 12 ? 10 + 0.1 * i : NaN));
  const db = Float32Array.from({ length: 21 }, (_, i) => 12.5 + 0.1 * i);

  test('splice: level matched at the join, named GR_SPL, provenance lists the runs', () => {
    const r = prepareSplice([{ log: a, data: da, top: 100, base: 112 }, { log: b, data: db, top: 110, base: 120 }], { matchWindowM: 3, existingNames: ['GR', 'GR:2'] });
    expect(r.log.mnemonic).toBe('GR_SPL');
    expect(r.joins[0].offset).toBeCloseTo(-2.5, 6);
    expect(r.log.data[15]).toBeCloseTo(10 + 0.1 * 15, 5);
    expect(r.log.provenance.runs.map((x) => x.log_id)).toEqual(['a', 'b']);
    expect(r.log.provenance.operation).toBe('splice');
    expect(curveOrigin({ provenance: r.log.provenance }).title).toMatch(/Computed by Well Data Manager \(splice\)/);
  });
  test('splice refuses runs in different units', () => {
    expect(() => prepareSplice([{ log: a, data: da, top: 100, base: 112 }, { log: { ...b, unit: 'API' }, data: db, top: 110, base: 120 }])).toThrow(/different units/);
  });
  test('edits: the ledger travels; a second edit takes the next free name', () => {
    const r = prepareEdits(a, da, [{ op: 'offset', top: 100, base: 102, value: 1 }], { existingNames: ['GR', 'GR_ED'] });
    expect(r.log.mnemonic).toBe('GR_ED:2');
    expect(r.log.provenance.ledger[0]).toMatchObject({ op: 'offset', changed: 3 });
    expect(r.log.data[0]).toBeCloseTo(11, 6);
    // negative control: the input is untouched
    expect(da[0]).toBeCloseTo(10, 6);
  });
});

describe('sonic drift correction on TVDSS', () => {
  const S = 300; // us/m, a uniform medium
  const KB = 30;
  // vertical checkshot one-way time to a TVDSS (from the datum at 0 TVDSS)
  const twtAt = (tvdss) => 2 * S * tvdss * 1e-3; // ms

  test('a vertical well: a biased sonic in us/ft is corrected and closes on the checkshots; the unit is kept', () => {
    const well = { id: 'w', kb_m: KB, depth_ref_elev_m: KB, depth_ref_kind: 'KB', checkshots: [800, 1000, 1200, 1400].map((t) => ({ tvdss_m: t, twt_ms: twtAt(t) })) };
    const log = reg('dt', 'DT', 'US/F', 800, 0.5, 1401); // 800..1500 m MD
    const data = Float32Array.from({ length: 1401 }, (_, i) => {
      const md = 800 + 0.5 * i;
      const biased = S + (md >= 1000 && md < 1100 ? 10 : 0);
      return biased * 0.3048; // us/ft
    });
    const r = prepareDrift(well, log, data, { existingNames: ['DT'] });
    expect(r.log.mnemonic).toBe('DT_DC');
    expect(r.log.unit).toBe('US/F');
    expect(r.report.usedLevels).toBe(3); // 800 m MD is TVDSS 770: above the sonic's reach? no: 800 MD = 770 TVDSS, so 800 TVDSS is the first level inside
    expect(Math.max(...r.report.drift.map((x) => Math.abs(x.driftMs)))).toBeGreaterThan(0.9);
    expect(r.report.closureMs).toBeLessThan(0.01);
    expect(r.log.provenance.operation).toBe('drift-correction');
  });

  test('a deviated well in a uniform medium has no drift (the slowness is integrated on vertical depth)', () => {
    const deviation = [{ md: 0, inc: 0, azi: 0 }, { md: 900, inc: 0, azi: 0 }, { md: 1100, inc: 45, azi: 90 }, { md: 2500, inc: 45, azi: 90 }];
    const well = { id: 'w', kb_m: KB, depth_ref_elev_m: KB, depth_ref_kind: 'KB', deviation };
    const frame = makeWellFrame(well);
    const shotsMd = [1000, 1400, 1800, 2200];
    well.checkshots = shotsMd.map((m) => { const t = frame.mdToTvdss(m).tvdss; return { tvdss_m: t, twt_ms: twtAt(t) }; });
    const log = reg('dt', 'DT', 'US/M', 950, 0.5, 2701); // 950..2300
    const data = Float32Array.from({ length: 2701 }, () => S);
    const r = prepareDrift(well, log, data);
    for (const d of r.report.drift) expect(Math.abs(d.driftMs)).toBeLessThan(0.01);
    // negative control: along-hole time (slowness x dMD) would show a drift of tens of ms at the deepest level
    const tv = (m) => frame.mdToTvdss(m).tvdss;
    const alongHole = S * (2200 - 1000) * 1e-3;
    const vertical = S * (tv(2200) - tv(1000)) * 1e-3;
    expect(alongHole - vertical).toBeGreaterThan(50);
  });

  test('refusals: too few checkshots, no elevation, an unknown sonic unit', () => {
    const log = reg('dt', 'DT', 'US/M', 800, 1, 101);
    const data = Float32Array.from({ length: 101 }, () => S);
    expect(() => prepareDrift({ checkshots: [{ tvdss_m: 800, twt_ms: 480 }] }, log, data)).toThrow(/at least two checkshot levels/);
    const shots = [{ tvdss_m: 800, twt_ms: 480 }, { tvdss_m: 850, twt_ms: 510 }];
    expect(() => prepareDrift({ checkshots: shots, depth_ref_kind: 'KB', depth_ref_elev_m: null, ground_elev_m: null }, log, data)).toThrow(/elevation/);
    expect(() => prepareDrift({ kb_m: 30, checkshots: shots }, { ...log, unit: 'MS' }, data)).toThrow(/not a slowness/);
  });
});
