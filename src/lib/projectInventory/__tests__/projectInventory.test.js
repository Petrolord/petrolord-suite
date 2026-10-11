// Project Data Inventory: the pure core (columns, coverage, hole condition,
// cell states, seismic rows, rules, readiness, saved state, CSV). Every
// expectation is built into the fixture (a curve with a known gap, a
// caliper with a known washout share, a survey outline a well sits outside
// of) and every rule has a negative control: the same project with the gap
// closed raises nothing.
import {
  buildInventory, familyOfLog, derivationOf, metadataCoverage, sampleCoverage, holeCondition, inferBitSize,
  resolveInterval, wellRow, volumeRow, volumeType, seismicSummary, surveyGeometry, readiness, runRules,
  sanitiseInventoryState, setCellOverride, upsertManual, setNote, manualHas, isBlankInventoryState, inventoryCsv,
  RULES, twtAtMd, COLUMNS, STATUS, STATUS_ORDER,
} from '..';

const STEP = 0.5;
const grid = (top, base) => Math.round((base - top) / STEP) + 1;
let nextId = 0;
const log = (mnemonic, top, base, extra = {}) => ({
  id: `l${nextId++}`, mnemonic, unit: extra.unit || '', start_md_m: top, stop_md_m: base, step_m: STEP, n_samples: grid(top, base), null_count: 0, provenance: {}, ...extra,
});
const values = (n, f) => Float32Array.from({ length: n }, (_, i) => f(i));
const ZONES = [{ name: 'SAND A', top_md_m: 2000, base_md_m: 2100 }, { name: 'SAND B', top_md_m: 2300, base_md_m: 2350 }];
const datum = { depth_ref_kind: 'KB', depth_ref_elev_m: 30, kb_m: 30 };
const survey = [{ md: 0, inc: 0, azi: 0 }, { md: 2600, inc: 0, azi: 0 }];
const checkshots = [{ md_m: 500, tvdss_m: 470, twt_ms: 500 }, { md_m: 1500, tvdss_m: 1470, twt_ms: 1300 }, { md_m: 2500, tvdss_m: 2470, twt_ms: 1950 }];
const tie = (corr) => ({ rows: [], provenance: { qc: { mean_corr: corr, bulk_shift_ms: 4, volume: 'Keta full', wavelet: { peak_hz: 30, phase_deg: 0, dt_ms: 2, samples: [0, 0.2, 1, 0.2, 0] } } } });
const full = (top = 1800, base = 2600) => ['GR', 'SP', 'PEF', 'RT', 'RXO', 'NPHI', 'RHOB', 'DT', 'DTSM', 'CALI', 'DRHO'].map((m) => log(m, top, base))
  .concat([log('VSH', top, base, { provenance: { computed: true, engine: 'petrophysics-studio' } }), log('PHIE', top, base, { provenance: { computed: true, engine: 'petrophysics-studio' } }), log('SW', top, base, { provenance: { computed: true, engine: 'petrophysics-studio' } })]);

function fixture() {
  nextId = 0;
  const A = {
    well: { id: 'a', name: 'KETA-1', ...datum, deviation: survey, checkshots, checkshots_derived: tie(0.82), surface_x: 500, surface_y: 500, crs: 'EPSG:32630', td_md_m: 2600 },
    logs: full(), zones: ZONES, tops: [{ name: 'SAND A', md_m: 2000 }],
  };
  const bLogs = full().filter((l) => !['DTSM', 'RHOB'].includes(l.mnemonic));
  bLogs.push(log('RHOB', 2050, 2600)); // half of SAND A missing
  const B = {
    well: { id: 'b', name: 'AKOMA-2', ...datum, deviation: survey, checkshots: [], surface_x: 700, surface_y: 300, crs: 'EPSG:32630', td_md_m: 2600 },
    logs: bLogs, zones: ZONES, tops: [{ name: 'SAND A', md_m: 2000 }],
  };
  const cLogs = full().filter((l) => !['DTSM', 'RHOB', 'NPHI'].includes(l.mnemonic));
  cLogs.push(log('DTS', 1800, 2600, { provenance: { computed: true, engine: 'rock-physics-studio', vs_source: 'estimated', vs_method: 'greenberg-castagna' } }));
  const C = {
    well: { id: 'c', name: 'BONSU-3', depth_ref_kind: 'KB', depth_ref_elev_m: null, kb_m: null, deviation: [], checkshots, surface_x: 5000, surface_y: 5000, crs: 'EPSG:32630', td_md_m: 2600 },
    logs: cLogs, zones: [], tops: [],
  };
  return [A, B, C];
}
const META = (extra = {}) => ({
  il: { min: 1, max: 40, step: 1, count: 40 }, xl: { min: 1, max: 40, step: 1, count: 40 }, ns: 1001, dt_us: 2000, sample_format: 5,
  affine: { origin: { x: 0, y: 0 }, il_vec: { x: 0, y: 25 }, xl_vec: { x: 25, y: 0 } }, storage_bytes: 6.4e6, ...extra,
});
const FULL = { id: 'v1', name: 'Keta full stack', kind: 'seismic', status: 'ready', crs: 'EPSG:32630', survey_meta: META() };
const ANGLES = ['near', 'mid', 'far'].map((n, i) => ({ id: `v${i + 2}`, name: `Keta ${n} stack`, kind: 'seismic', status: 'ready', crs: 'EPSG:32630', survey_meta: META() }));
const HZ = [{ id: 'h1', name: 'Top Sand A', domain: 'twt_ms' }, { id: 'h2', name: 'Base Sand A', domain: 'twt_ms' }];
const build = (over = {}) => buildInventory({
  wells: fixture(), seismicData: { volumes: [FULL], horizons: HZ, faults: [], surfaces: [] }, defaultInterval: { mode: 'zones', names: ['SAND A'] }, unit: 'ft', ...over,
});
const ids = (inv) => inv.findings.map((f) => f.id);

describe('curve families reuse the Suite alias tables', () => {
  test.each([
    ['DTSM', 'dts'], ['DTS', 'dts'], ['DTCO', 'dtc'], ['RHOZ', 'rhob'], ['TNPH', 'nphi'], ['AT90', 'rdeep'], ['RXO_D', 'rdeep'],
    ['RXO', 'rshallow'], ['MSFL', 'rshallow'], ['HCAL', 'cal'], ['CPOR', 'corePhi'], ['CKH', 'coreK'], ['PHIE', 'phi'], ['VCL', 'vsh'], ['RHOB_SPL', 'rhob'], ['DT:2', 'dtc'],
  ])('%s is %s', (m, fam) => { expect(familyOfLog({ mnemonic: m }).key).toBe(fam); });
  test('a curve no alias names is matched by its LAS description, and says so', () => {
    expect(familyOfLog({ mnemonic: 'XYZ1', description: 'Dipole shear slowness' })).toEqual({ key: 'dts', by: 'description' });
    expect(familyOfLog({ mnemonic: 'XYZ1', description: 'something else' })).toBeNull();
  });
  test('derivation from provenance and suffix; a measured curve is null', () => {
    expect(derivationOf({ mnemonic: 'DTS', provenance: { vs_source: 'estimated', vs_method: 'greenberg-castagna' } })).toMatch(/greenberg castagna/);
    expect(derivationOf({ mnemonic: 'DT_EST' })).toMatch(/estimated/);
    expect(derivationOf({ mnemonic: 'RHOB_DIG' })).toMatch(/digitized/);
    expect(derivationOf({ mnemonic: 'RHOB', provenance: {} })).toBeNull();
  });
});

describe('coverage of the interval', () => {
  const iv = { top: 2000, base: 2100 };
  test('from the metadata: the overlap, reduced by the null share', () => {
    expect(metadataCoverage(log('RHOB', 2050, 2600), iv).fraction).toBeCloseTo(0.5, 6);
    expect(metadataCoverage({ ...log('RHOB', 1800, 2600), null_count: grid(1800, 2600) / 4 }, iv).fraction).toBeCloseTo(0.75, 2);
    expect(metadataCoverage(log('RHOB', 2200, 2600), iv).fraction).toBe(0);
  });
  test('from the samples: a 20 m null run inside the zone is a gap and costs 20 percent', () => {
    const l = log('RHOB', 1800, 2600);
    const v = values(l.n_samples, (i) => { const d = 1800 + i * STEP; return d > 2040 && d < 2060 ? NaN : 2.3; });
    const c = sampleCoverage(l, v, iv);
    expect(c.approx).toBe(false);
    expect(c.fraction).toBeGreaterThan(0.79);
    expect(c.fraction).toBeLessThan(0.82);
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0].top).toBeCloseTo(2040, 0);
    expect(c.gaps[0].base).toBeCloseTo(2060, 0);
  });
  test('negative control: a clean curve covers everything with no gap; -999.25 counts as null', () => {
    const l = log('RHOB', 1800, 2600);
    const c = sampleCoverage(l, values(l.n_samples, () => 2.3), iv);
    expect(c.fraction).toBeCloseTo(1, 2);
    expect(c.gaps).toEqual([]);
    const n = sampleCoverage(l, values(l.n_samples, () => -999.25), iv);
    expect(n.fraction).toBe(0);
    expect(n.gaps).toHaveLength(1);
  });
  test('a curve that stops inside the interval leaves a gap to the base', () => {
    const l = log('RHOB', 1800, 2080);
    const c = sampleCoverage(l, values(l.n_samples, () => 2.3), iv);
    expect(c.fraction).toBeCloseTo(0.8, 1);
    expect(c.gaps[c.gaps.length - 1].base).toBe(2100);
  });
  test('the interval: zones span top to base, a missing zone falls back to the logged interval', () => {
    const b = { logs: [log('GR', 1800, 2600)], zones: ZONES };
    expect(resolveInterval(b, { mode: 'zones', names: ['SAND A', 'SAND B'] })).toMatchObject({ top: 2000, base: 2350, matched: true });
    expect(resolveInterval(b, { mode: 'zones', names: ['SAND C'] })).toMatchObject({ top: 1800, base: 2600, matched: false });
    expect(resolveInterval(b, { mode: 'well' })).toMatchObject({ top: 1800, base: 2600 });
  });
});

describe('hole condition', () => {
  const iv = { top: 2000, base: 2100 };
  const cal = (f) => { const l = log('CALI', 1800, 2600, { unit: 'IN' }); return { log: l, values: values(l.n_samples, (i) => f(1800 + i * STEP)) }; };
  test('bit size from the low readings: 12.4 in is a 12.25 in hole even when most of it is washed out, 8.6 in an 8.5 in hole', () => {
    expect(inferBitSize([12.3, 12.4, 15, 15, 15, 15])).toBe(12.25);
    expect(inferBitSize([8.6, 8.6, 8.7])).toBe(8.5);
    expect(inferBitSize([])).toBeNull();
  });
  test('a washout over 20 m of a 100 m zone is 20 percent bad hole', () => {
    const h = holeCondition({ cal: cal((d) => (d >= 2020 && d < 2040 ? 11.5 : 8.6)) }, iv);
    expect(h.assessed).toBe(true);
    expect(h.sources[0].bitIn).toEqual([8.5]);
    expect(h.badShare).toBeGreaterThan(0.19);
    expect(h.badShare).toBeLessThan(0.21);
  });
  test('a hole stepping down from 12.25 in to 8.5 in inside the zone is not a washout', () => {
    const h = holeCondition({ cal: cal((d) => (d < 2071 ? 12.2 : 8.5)) }, iv);
    expect(h.badShare).toBeLessThan(0.02);
    expect(h.sources[0].bitIn).toEqual([8.5, 12.25]);
    // and a washout below the step is still seen against the smaller bit
    const w = holeCondition({ cal: cal((d) => (d < 2071 ? 12.2 : d > 2085 && d < 2095 ? 10.8 : 8.5)) }, iv);
    expect(w.badShare).toBeGreaterThan(0.09);
    expect(w.badShare).toBeLessThan(0.11);
  });
  test('density correction above 0.15 g/cc flags too, and the union is reported', () => {
    const l = log('DRHO', 1800, 2600);
    const drho = { log: l, values: values(l.n_samples, (i) => { const d = 1800 + i * STEP; return d >= 2060 && d < 2070 ? 0.2 : 0.01; }) };
    const h = holeCondition({ cal: cal((d) => (d >= 2020 && d < 2040 ? 11.5 : 8.6)), drho }, iv);
    expect(h.badShare).toBeGreaterThan(0.29);
    expect(h.badShare).toBeLessThan(0.31);
  });
  test('a bit-size curve wins over the inference', () => {
    const l = log('BS', 1800, 2600, { unit: 'IN' });
    const h = holeCondition({ cal: cal(() => 12.4), bs: { log: l, values: values(l.n_samples, () => 8.5) } }, iv);
    expect(h.sources[0].bitFrom).toBe('bit-size curve');
    expect(h.badShare).toBeCloseTo(1, 2);
  });
  test('negative control: gauge hole and a clean DRHO are good hole', () => {
    const l = log('DRHO', 1800, 2600);
    const h = holeCondition({ cal: cal(() => 8.6), drho: { log: l, values: values(l.n_samples, () => 0.02) } }, iv);
    expect(h.badShare).toBe(0);
  });
});

describe('cell states', () => {
  const [A, B, C] = fixture();
  const spec = { mode: 'zones', names: ['SAND A'] };
  test('a complete well is complete in every curve and record column', () => {
    const r = wellRow(A, { interval: spec });
    for (const k of ['datum', 'survey', 'tops', 'checkshots', 'tie', 'gr', 'rdeep', 'rshallow', 'nphi', 'rhob', 'dtc', 'dts', 'vsh', 'phi', 'sw']) expect([k, r.cells[k].status]).toEqual([k, 'complete']);
    expect(r.cells.pressure.status).toBe('unrecorded');
  });
  test('half-covered density is partial at 50 percent; no shear and no checkshots are not loaded', () => {
    const r = wellRow(B, { interval: spec });
    expect(r.cells.rhob.status).toBe('partial');
    expect(r.cells.rhob.coverage).toBeCloseTo(0.5, 6);
    expect(r.cells.dts.status).toBe('missing');
    expect(r.cells.checkshots.status).toBe('missing');
    expect(r.cells.tie.status).toBe('missing');
  });
  test('an estimated shear is derived; no datum is missing; interpreted curves are complete when computed', () => {
    const r = wellRow(C, { interval: spec });
    expect(r.cells.dts.status).toBe('derived');
    expect(r.cells.dts.text).toMatch(/greenberg castagna/);
    expect(r.cells.datum.status).toBe('missing');
    expect(r.cells.vsh.status).toBe('complete');
  });
  test('a fair tie (0.6) is partial, a tie at 0.82 complete', () => {
    expect(wellRow({ ...A, well: { ...A.well, checkshots_derived: tie(0.6) } }, { interval: spec }).cells.tie.status).toBe('partial');
    expect(wellRow(A, { interval: spec }).cells.tie.status).toBe('complete');
  });
  test('an override replaces the shown state and keeps what Petrolord found', () => {
    const r = wellRow(B, { interval: spec, overrides: { dts: { status: 'notAcquired', note: 'per the FWR' }, pressure: { status: 'external', note: 'MDT report' } } });
    expect(r.cells.dts).toMatchObject({ status: 'notAcquired', overridden: true, note: 'per the FWR' });
    expect(r.cells.dts.auto.status).toBe('missing');
    expect(r.cells.pressure.status).toBe('external');
  });
  test('core plugs count inside the interval once scanned', () => {
    const l = log('CPOR', 1800, 2600);
    const v = values(l.n_samples, (i) => { const d = 1800 + i * STEP; return d >= 2010 && d <= 2014 ? 0.2 : NaN; });
    const r = wellRow({ ...A, logs: [...A.logs, l] }, { interval: spec, samples: { [l.id]: v } });
    expect(r.cells.plugs.status).toBe('complete');
    expect(r.cells.plugs.count).toBe(9);
  });
  test('every column of every well gets a known state', () => {
    for (const w of fixture()) {
      const r = wellRow(w, { interval: spec });
      for (const c of COLUMNS) expect([...STATUS_ORDER, 'pending']).toContain(r.cells[c.key].status);
    }
  });
});

describe('seismic rows', () => {
  test('type from the name and the derived-volume record', () => {
    expect(volumeType({ name: 'EKENE3D-near.sgy' }).type).toBe('Near angle stack');
    expect(volumeType({ name: 'EKENE3D-far.sgy' }).angle).toBe('far');
    expect(volumeType({ name: 'EKENE3D-full.sgy' }).type).toBe('Full stack');
    expect(volumeType({ name: 'cdp gathers' }).role).toBe('gathers');
    expect(volumeType({ name: 'X', kind: 'attribute', attribute_params: { name: 'qi_inversion' } }).type).toMatch(/impedance/);
  });
  test('format, bits, area, sample rate and record length from survey_meta', () => {
    const r = volumeRow({ ...FULL, survey_meta: META({ sample_format: 3 }) });
    expect(r).toMatchObject({ format: 'Integer', bits: 16, dtMs: 2, recordMs: 2000, traces: 1600, domain: 'Time' });
    expect(r.areaKm2).toBeCloseTo(1, 6); // 40 x 40 bins of 25 m
    expect(surveyGeometry(META()).binIl).toBe(25);
  });
  test('geometry mismatch only when the stacks differ', () => {
    expect(seismicSummary([FULL, ...ANGLES]).geometryMismatch).toBe(false);
    expect(seismicSummary([FULL, { ...ANGLES[0], survey_meta: META({ ns: 801 }) }]).geometryMismatch).toBe(true);
  });
  test('a gather store is listed, its source upload is not', () => {
    const s = seismicSummary([FULL], [{ id: 'u1', kind: 'segy_upload', status: 'uploaded', original_filename: 'g.sgy' }, { id: 'g1', kind: 'gathers_offset', status: 'uploaded', name: 'g', meta: { bins: 13, traces: 1000, bin_width_m: 200, source_dataset: 'u1' } }]);
    expect(s.gathers).toHaveLength(1);
    expect(s.files.map((f) => f.id)).toEqual(['g1']);
  });
});

describe('rules', () => {
  test('the gaps in the fixture each raise their note', () => {
    const inv = build();
    expect(ids(inv)).toEqual(expect.arrayContaining(['shear-none', 'shear-estimated', 'density-none', 'neutron-none', 'datum-none', 'checkshots-none', 'tie-none', 'coverage-partial', 'survey-none', 'tops-none', 'core-none', 'pressure-none', 'pvt-none', 'angle-none', 'wells-outside', 'unrecorded']));
    const shear = inv.findings.find((f) => f.id === 'shear-none');
    expect(shear.scope).toEqual(['AKOMA-2']);
    expect(shear.workaround).toMatch(/local shear trend calibrated on KETA-1/);
    expect(inv.findings.find((f) => f.id === 'wells-outside').scope).toEqual(['BONSU-3']);
    expect(inv.findings.find((f) => f.id === 'coverage-partial').title).toMatch(/AKOMA-2 RHOB 50%/);
  });
  test('every note has the four parts, in plain copy (no em dash)', () => {
    for (const f of build().findings) {
      for (const k of ['title', 'impact', 'workaround', 'uncertainty', 'mitigation']) {
        expect(typeof f[k]).toBe('string');
        expect(f[k].length).toBeGreaterThan(8);
        expect(f[k]).not.toMatch(/—/);
      }
    }
  });
  test('negative control: a project with no gaps raises no well note', () => {
    const [A] = fixture();
    const clean = buildInventory({
      wells: [A, { ...A, well: { ...A.well, id: 'a2', name: 'KETA-2' } }],
      seismicData: { volumes: [FULL, ...ANGLES], datasets: [], horizons: HZ, surfaces: [{ id: 's', kind: 'structure', z_domain: 'depth' }] },
      defaultInterval: { mode: 'zones', names: ['SAND A'] },
      state: {
        cells: Object.fromEntries(['a', 'a2'].map((id) => [id, { plugs: { status: 'external' }, swc: { status: 'notAcquired' }, wholecore: { status: 'notAcquired' }, pressure: { status: 'external' }, samples: { status: 'external' }, plt: { status: 'notAcquired' } }])),
      },
    });
    expect(ids(clean)).toEqual(['gathers-none']);
  });
  test('a received PVT report or pressure report closes those notes; dismissing keeps the note marked', () => {
    let state = upsertManual({}, { kind: 'pvt', title: 'PVT KETA-1', state: 'received' });
    state = upsertManual(state, { kind: 'pressure', title: 'MDT', state: 'received' });
    expect(ids(build({ state }))).not.toEqual(expect.arrayContaining(['pvt-none']));
    expect(ids(build({ state }))).not.toContain('pressure-none');
    expect(ids(build({ state: upsertManual({}, { kind: 'pvt', state: 'awaited' }) }))).toContain('pvt-none');
    const d = build({ state: setNote({}, 'core-none', { dismissed: true, comment: 'no core cut' }) }).findings.find((f) => f.id === 'core-none');
    expect(d).toMatchObject({ dismissed: true, comment: 'no core cut' });
  });
  test('angle stacks clear angle-none; one stack raises angle-few', () => {
    expect(ids(build({ seismicData: { volumes: [FULL, ...ANGLES], horizons: HZ } }))).not.toContain('angle-none');
    expect(ids(build({ seismicData: { volumes: [FULL, ANGLES[0]], horizons: HZ } }))).toContain('angle-few');
  });
  test('record length close to the target time raises record-short', () => {
    // SAND A base at 2100 m MD is about 1690 ms on the checkshots
    expect(twtAtMd(fixture()[0].well, 2100)).toBeCloseTo(1300 + (600 / 1000) * 650, 6);
    const short = { ...FULL, survey_meta: META({ ns: 851 }) }; // 1700 ms record
    const scope = (inv) => inv.findings.find((f) => f.id === 'record-short')?.scope || [];
    expect(scope(build({ seismicData: { volumes: [short], horizons: HZ } }))).toContain('KETA-1');
    // negative control: a 2,000 ms record leaves 300 ms below SAND A at KETA-1
    // (BONSU-3 has no zones, so its interval runs to TD at about 2,015 ms)
    expect(scope(build())).toEqual(['BONSU-3']);
  });
  test('low bit depth and a missing CRS are seismic notes', () => {
    const v = { ...FULL, crs: null, survey_meta: META({ sample_format: 8 }) };
    expect(ids(build({ seismicData: { volumes: [v], horizons: HZ } }))).toEqual(expect.arrayContaining(['low-bits', 'crs-none']));
  });
  test('the rule list has unique ids and each names its workflows', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    expect(runRules({ rows: [], seismic: seismicSummary([]), interp: {}, columns: COLUMNS, manualHas: () => false, audience: 'qi', unit: 'ft' }).map((f) => f.id)).toEqual(expect.arrayContaining(['core-none', 'seismic-none']));
  });
  test('depth figures in the notes follow the unit', () => {
    const ft = build().findings.find((f) => f.id === 'checkshots-none').uncertainty;
    const m = build({ unit: 'm' }).findings.find((f) => f.id === 'checkshots-none').uncertainty;
    expect(ft).toMatch(/5,000 ft/);
    expect(m).toMatch(/1525 m|1,525 m|1520 m/);
  });
});

describe('readiness', () => {
  test('AVO is blocked on a full stack only, limited with one measured shear well, ready with stacks and shear on most wells', () => {
    const avo = (inv) => inv.readiness.workflows.find((w) => w.key === 'avo');
    expect(avo(build()).level).toBe('blocked');
    const lim = avo(build({ seismicData: { volumes: [FULL, ...ANGLES], horizons: HZ } }));
    expect(lim.level).toBe('limited');
    expect(lim.reason).toMatch(/1 of 3 wells have measured shear/);
    const [A] = fixture();
    const two = buildInventory({ wells: [A, { ...A, well: { ...A.well, id: 'x', name: 'X' } }], seismicData: { volumes: [FULL, ...ANGLES], horizons: HZ } });
    expect(avo(two).level).toBe('ready');
  });
  test('inversion needs a low-frequency model from the wells with sonic and density', () => {
    const w = build().readiness.workflows.find((x) => x.key === 'inversion');
    expect(w.level).toBe('limited');
    expect(w.reason).toMatch(/2 wells with sonic and density; 1 tied/);
  });
  test('the score is the mean of the levels', () => {
    const r = readiness({ rows: [], seismic: seismicSummary([]), interp: {} });
    expect(r.score).toBe(0);
    const inv = build();
    const expected = Math.round((inv.readiness.workflows.reduce((s, w) => s + ({ ready: 1, limited: 0.5, blocked: 0 })[w.level], 0) / 7) * 100);
    expect(inv.summary.score).toBe(expected);
  });
  test('the order follows the audience', () => {
    expect(build({ audience: 'petro' }).readiness.workflows[3].key).toBe('depth');
    expect(build({ audience: 'qi' }).readiness.workflows[3].key).toBe('avo');
  });
});

describe('saved state', () => {
  test('sanitise drops unknown columns, statuses and junk; blank is blank', () => {
    const s = sanitiseInventoryState({ cells: { a: { dts: { status: 'external', note: 'x' }, nope: { status: 'external' }, gr: { status: 'bogus' } } }, manual: [{ kind: 'zzz', state: 'qq', date: 'yesterday' }], notes: { r: { dismissed: 1 } } });
    expect(s.cells).toEqual({ a: { dts: { status: 'external', note: 'x' } } });
    expect(s.manual[0]).toMatchObject({ kind: 'other', state: 'received', date: '' });
    expect(s.notes.r.dismissed).toBe(true);
    expect(isBlankInventoryState({})).toBe(true);
    expect(isBlankInventoryState(s)).toBe(false);
  });
  test('an override set back to auto with no note disappears', () => {
    const s1 = setCellOverride({}, 'a', 'dts', { status: 'external' });
    expect(s1.cells.a.dts.status).toBe('external');
    expect(setCellOverride(s1, 'a', 'dts', { status: 'auto' }).cells).toEqual({});
  });
  test('manualHas reads received and incomplete items only', () => {
    expect(manualHas(upsertManual({}, { kind: 'core', state: 'incomplete' }), 'core')).toBe(true);
    expect(manualHas(upsertManual({}, { kind: 'core', state: 'awaited' }), 'core')).toBe(false);
  });
});

describe('summary and CSV', () => {
  test('counts add up to wells x columns; completeness is in 0..1', () => {
    const inv = build();
    const total = Object.values(inv.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(3 * COLUMNS.length);
    expect(inv.summary.completeness).toBeGreaterThan(0);
    expect(inv.summary.completeness).toBeLessThan(1);
    expect(inv.rows.find((r) => r.wellName === 'BONSU-3').remark).toMatch(/no datum.*shear estimated/i);
  });
  test('the CSV has every section, the state words and depths in feet', () => {
    const csv = inventoryCsv(build(), { projectName: 'Keta', generatedAt: new Date('2026-10-11T10:00:00Z') });
    for (const s of ['WELLS', 'SEISMIC', 'INTERPRETATIONS', 'ITEMS OUTSIDE PETROLORD', 'READINESS', 'NOTES']) expect(csv).toContain(`\n${s}\n`);
    expect(csv).toContain('Interval top (ft MD)');
    expect(csv).toContain(STATUS.partial.label);
    expect(csv).toContain('6,561.7'); // 2000 m in feet
  });
});
