/**
 * QI Studio services (QI programme Q1 / A4): the usability matrix, the data
 * inventory suggestions and the project model. Registry rows are built by
 * hand so each rule has a known answer, with negative controls.
 */
import { familyOf, wellTargetUsability, usabilityMatrix, suggestedIssues } from '../services/usability';
import { suggestInventory, inventoryRows, inventorySummary, GROUPS } from '../services/inventory';
import { projectFromPayload, projectPayload, issueRegister, upsertIssue, blankProject } from '../services/model';

const log = (mnemonic, start, stop, extra = {}) => ({ id: mnemonic, mnemonic, start_md_m: start, stop_md_m: stop, ...extra });
const zone = (name, top, base) => ({ id: name, name, top_md_m: top, base_md_m: base });
const goodWell = {
  well: { id: 'w1', name: 'KETA-1', kb_m: 30, depth_ref_elev_m: 30, depth_ref_kind: 'KB', checkshots: [{}, {}, {}], deviation: [{ md: 0 }, { md: 3000 }] },
  logs: [log('DT', 1000, 3000), log('RHOB', 1000, 3000), log('DTSM', 1000, 3000), log('PHIE', 1000, 3000), log('VSH', 1000, 3000), log('SW', 1000, 3000)],
  zones: [zone('SAND A', 2000, 2100)],
};

describe('curve families', () => {
  test('aliases, duplicate suffixes and edit suffixes', () => {
    expect(familyOf('DTCO')).toBe('sonic');
    expect(familyOf('DT_DC')).toBe('sonic');
    expect(familyOf('RHOZ:2')).toBe('density');
    expect(familyOf('DTSM_SPL')).toBe('shear');
    expect(familyOf('ILD')).toBeNull();
  });
});

describe('usability', () => {
  test('a complete well is good on every item', () => {
    const u = wellTargetUsability(goodWell, 'SAND A');
    expect(u.grade).toBe('good');
    expect(u.items.every((i) => i.grade === 'good')).toBe(true);
  });
  test('no shear log is limited (Vs can be estimated); no density is missing', () => {
    const noShear = { ...goodWell, logs: goodWell.logs.filter((l) => l.mnemonic !== 'DTSM') };
    const u = wellTargetUsability(noShear, 'SAND A');
    expect(u.grade).toBe('limited');
    expect(u.items.find((i) => i.key === 'shear').text).toMatch(/estimated/);
    const noDen = { ...goodWell, logs: goodWell.logs.filter((l) => l.mnemonic !== 'RHOB') };
    expect(wellTargetUsability(noDen, 'SAND A').grade).toBe('missing');
  });
  test('partial coverage, a digitized curve, no checkshots and no elevation', () => {
    const w = {
      ...goodWell,
      well: { id: 'w2', name: 'W2', checkshots: [], deviation: [] , depth_ref_kind: 'KB', depth_ref_elev_m: null, ground_elev_m: null },
      logs: [log('DT', 2050, 3000), log('RHOB_DIG', 1000, 3000, { provenance: { digitized: true } }), log('DTSM', 1000, 3000), log('PHIE', 1000, 3000), log('VSH', 1000, 3000), log('SW', 1000, 3000)],
    };
    const u = wellTargetUsability(w, 'SAND A');
    const by = Object.fromEntries(u.items.map((i) => [i.key, i]));
    expect(by.sonic.grade).toBe('limited');
    expect(by.sonic.text).toMatch(/covers 50 percent/);
    expect(by.density.text).toMatch(/digitized, utility grade/);
    expect(by.checkshots.grade).toBe('limited');
    expect(by.datum.grade).toBe('missing');
    expect(u.grade).toBe('missing');
  });
  test('a target the well has no zone for is missing, with the reason', () => {
    expect(wellTargetUsability(goodWell, 'SAND B')).toMatchObject({ grade: 'missing', zone: null });
  });
  test('the matrix counts cells and flags depletion only when seismic followed first production', () => {
    const m = usabilityMatrix([goodWell], ['SAND A', 'SAND B'], { seismicAcquired: '2020-05-01', firstProduction: { w1: '2018-01-01' } });
    expect(m.count).toEqual({ good: 1, limited: 0, missing: 1 });
    expect(m.rows[0].depletion).toMatch(/after production started on 2018-01-01/);
    // negative control: seismic before production
    expect(usabilityMatrix([goodWell], ['SAND A'], { seismicAcquired: '2015-05-01', firstProduction: { w1: '2018-01-01' } }).rows[0].depletion).toBeNull();
  });
  test('suggested issues: one per well and item kind, with a remedy', () => {
    const noShear = { ...goodWell, logs: goodWell.logs.filter((l) => l.mnemonic !== 'DTSM'), zones: [zone('SAND A', 2000, 2100), zone('SAND B', 2200, 2300)] };
    const issues = suggestedIssues(usabilityMatrix([noShear], ['SAND A', 'SAND B']));
    expect(issues.filter((i) => i.area === 'Shear sonic (Vs)')).toHaveLength(1);
    expect(issues[0].remedy).toMatch(/local shear trend/);
    expect(suggestedIssues(usabilityMatrix([goodWell], ['SAND A']))).toEqual([]);
  });
});

describe('inventory', () => {
  test('suggestions from the registry; groups the Suite cannot see stay unsuggested', () => {
    const noShear = { ...goodWell, well: { ...goodWell.well, id: 'w2' }, logs: goodWell.logs.filter((l) => l.mnemonic !== 'DTSM') };
    const s = suggestInventory({ wells: [goodWell, noShear], volumes: [{ name: 'Full stack' }], horizons: 0 });
    expect(s['wells-shear']).toEqual({ state: 'outstanding', evidence: '1 of 2 wells have a shear log' });
    expect(s['wells-logs'].state).toBe('received');
    expect(s['wells-header'].state).toBe('received');
    expect(s['seis-full'].state).toBe('received');
    expect(s['wells-core']).toBeUndefined();
    expect(s['interp-horizons']).toBeUndefined();
  });
  test('saved rows win over suggestions; untouched groups take the suggestion or start requested', () => {
    const rows = inventoryRows({ 'wells-shear': { state: 'requested', note: 'asked on 1 Oct' } }, { 'wells-shear': { state: 'outstanding', evidence: 'x' }, 'seis-full': { state: 'received', evidence: 'y' } });
    expect(rows).toHaveLength(GROUPS.length);
    expect(rows.find((r) => r.key === 'wells-shear')).toMatchObject({ state: 'requested', note: 'asked on 1 Oct', fromSuggestion: false });
    expect(rows.find((r) => r.key === 'seis-full')).toMatchObject({ state: 'received', fromSuggestion: true });
    expect(rows.find((r) => r.key === 'wells-core').state).toBe('requested');
    expect(inventorySummary(rows).received).toBe(1);
  });
});

describe('project model and issue register', () => {
  test('payload round trip tolerates junk', () => {
    const p = projectFromPayload({ wellIds: ['a', 3, ''], targets: ['SAND A'], dates: { seismicAcquired: '2020-01-01', firstProduction: { a: '2019-01-01' } }, issues: [{ key: 'k' }, 'x'] });
    expect(p.wellIds).toEqual(['a']);
    expect(p.issues).toEqual([{ key: 'k' }]);
    expect(projectPayload(p)).toMatchObject({ schema: 1, targets: ['SAND A'] });
    expect(projectFromPayload(null)).toEqual(blankProject());
  });
  test('suggestions join the register until the user keeps or dismisses them; open and high first', () => {
    const sug = [{ key: 's1', severity: 'medium', title: 'shear' }, { key: 's2', severity: 'high', title: 'density' }];
    let saved = [];
    let reg = issueRegister(saved, sug);
    expect(reg.map((r) => r.key)).toEqual(['s2', 's1']);
    expect(reg.every((r) => r.suggested)).toBe(true);
    saved = upsertIssue(saved, { ...reg.find((r) => r.key === 's2'), status: 'dismissed' });
    reg = issueRegister(saved, sug);
    expect(reg.find((r) => r.key === 's2')).toMatchObject({ status: 'dismissed', suggested: false });
    expect(reg.map((r) => r.key)).toEqual(['s1', 's2']);
    const manual = upsertIssue(saved, { title: 'No VSP', severity: 'low', status: 'open' });
    expect(manual[manual.length - 1].key).toMatch(/^manual:/);
  });
});
