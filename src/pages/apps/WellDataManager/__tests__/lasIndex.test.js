/**
 * AppUpgrade Step 1 (WDM-U1-001..003, 008): the LAS index at the registry
 * door, driven by the hostile file set in e2e/fixtures/wdm/hostile/.
 * Negative controls: the same files through the vendored prepareLogs alone
 * (the path before this fix) show each defect.
 */
import fs from 'fs';
import path from 'path';
import { parseLas } from '../engine/lasParse';
import { prepareLogs } from '../engine/lasImport';
import { prepareLasForRegistry, checkLasIndex, orientLasIndex, suggestSurfaceLocation } from '../engine/lasIndex';
import { planMerge, findDepthLog } from '../engine/mergeImport';
import { mapLogs } from '@/components/wells/curveMap';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'hostile');
const GOLDEN = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'wells', 'las');
const read = (dir, f) => parseLas(fs.readFileSync(path.join(dir, f), 'utf8'));
const ascending = (a) => { for (let i = 1; i < a.length; i++) if (!(a[i] > a[i - 1])) return false; return true; };

describe('index kinds the registry cannot store as MD are refused with the reason (WDM-U1-001)', () => {
  test('a TVDSS-indexed file is refused before anything is written', () => {
    const parsed = read(HOSTILE, 'las20_tvdss_index.las');
    expect(() => prepareLasForRegistry(parsed)).toThrow(/indexed by TVDSS \(a vertical depth\).*measured depth/);
    // negative control: the vendored path stores it as if TVDSS were MD
    expect(prepareLogs(parsed).logs[0].kind).toBe('depth');
  });
  test('a time-indexed file names time as the reason', () => {
    expect(() => checkLasIndex(read(HOSTILE, 'las20_time_index.las'))).toThrow(/indexed by time \(TIME in S\)/);
  });
  test('ordinary MD files pass unchanged (golden fixtures)', () => {
    for (const f of ['basic_20.las', 'feet_20.las', 'wrapped_12.las', 'irregular_20.las', 'nullheavy_20.las', 'quirks_20.las', 'las3_comma_30.las', 'las3_space_30.las']) {
      const parsed = read(GOLDEN, f);
      const raw = prepareLogs(parsed);
      const { prep, notes } = prepareLasForRegistry(parsed);
      expect(notes).toEqual([]);
      expect(prep.logs.map((l) => l.mnemonic)).toEqual(raw.logs.map((l) => l.mnemonic));
      prep.logs.forEach((l, i) => expect(Array.from(l.data)).toEqual(Array.from(raw.logs[i].data)));
    }
  });
});

describe('bottom-up files are stored depth-ascending (WDM-U1-002)', () => {
  const parsed = () => read(HOSTILE, 'las20_upward_feet.las');
  test('every curve reverses together; step is regular again; TD is the deepest sample', () => {
    const raw = prepareLogs(parsed());
    // negative control: the vendored path reads a descending index as irregular
    expect(raw.stepM).toBeNull();
    expect(raw.startMdM).toBeGreaterThan(raw.stopMdM);
    const { prep, notes, suggestedHeader } = prepareLasForRegistry(parsed());
    expect(ascending(prep.logs[0].data)).toBe(true);
    expect(prep.stepM).toBeCloseTo(0.5 * 0.3048, 3);
    expect(prep.startMdM).toBeCloseTo(5000 * 0.3048, 3);
    expect(suggestedHeader.tdMdM).toBeCloseTo((5000 + 39 * 0.5) * 0.3048, 3);
    // the sample at the shallowest depth is the file's LAST row
    expect(prep.logs[1].data[0]).toBeCloseTo(raw.logs[1].data[raw.logs[1].data.length - 1], 5);
    expect(prep.logs[1].provenance.reversed_from_bottom_up).toBe(true);
    expect(notes.join(' ')).toMatch(/Logged bottom-up/);
  });
  test('merging a bottom-up file into a well keeps its samples (it used to blank them all)', () => {
    const well = prepareLasForRegistry(read(GOLDEN, 'feet_20.las')).prep;
    const existingLogs = [{ id: 'd', mnemonic: 'DEPT', start_md_m: well.startMdM, stop_md_m: well.stopMdM, step_m: well.stepM }];
    const existingDepth = { log: existingLogs[0], data: Float32Array.from({ length: 200 }, (_, i) => 1524 + i * 0.05) };
    const finite = (plan) => plan.logs.filter((l) => l.mnemonic === 'GR')[0].data.filter(Number.isFinite).length;
    const keep = { GR: true };
    const fixed = planMerge({ prepLogs: prepareLasForRegistry(parsed()).prep.logs, keep, existingLogs, existingDepth });
    const broken = planMerge({ prepLogs: prepareLogs(parsed()).logs, keep, existingLogs, existingDepth });
    expect(finite(fixed)).toBeGreaterThan(100);
    expect(finite(broken)).toBe(0); // negative control
  });
});

describe('the depth index is found by every downstream app (WDM-U1-003)', () => {
  test('Schlumberger TDEP, logged bottom-up: ascending and mapped as DEPT', () => {
    const { prep } = prepareLasForRegistry(read(HOSTILE, 'las20_slb_tdep_upward.las'));
    const rows = prep.logs.map((l, i) => ({ id: `l${i}`, mnemonic: l.mnemonic, description: l.description }));
    expect(mapLogs(rows).DEPT?.mnemonic).toBe('TDEP');
    expect(findDepthLog(rows)?.mnemonic).toBe('TDEP');
    expect(ascending(prep.logs[0].data)).toBe(true);
  });
  test('an index outside the DEPT family is saved as DEPT, its name kept in provenance', () => {
    const raw = prepareLogs(read(GOLDEN, 'basic_20.las'));
    raw.logs[0] = { ...raw.logs[0], mnemonic: 'INDEX' };
    const rows = (p) => p.logs.map((l, i) => ({ id: `l${i}`, mnemonic: l.mnemonic }));
    expect(mapLogs(rows(raw)).DEPT).toBeNull(); // negative control
    const { prep, notes, renamedFrom } = orientLasIndex(raw);
    expect(renamedFrom).toBe('INDEX');
    expect(prep.logs[0].mnemonic).toBe('DEPT');
    expect(prep.logs[0].provenance.source_mnemonic).toBe('INDEX');
    expect(mapLogs(rows(prep)).DEPT?.id).toBe('l0');
    expect(notes.join(' ')).toMatch(/saved as DEPT/);
  });
});

describe('surface location offered from the file (WDM-U1-008)', () => {
  test('Petrel XWELL/YWELL with their unit', () => {
    expect(suggestSurfaceLocation(read(HOSTILE, 'las20_petrel_export.las'))).toEqual({ surfaceX: 512345.6, surfaceY: 498765.4, xyUnit: 'm' });
    const { suggestedHeader } = prepareLasForRegistry(read(HOSTILE, 'las20_petrel_export.las'));
    expect(suggestedHeader).toMatchObject({ name: 'OKAN PX-4', kbM: 25.3, surfaceX: 512345.6 });
  });
  test('files without coordinates offer none', () => {
    expect(suggestSurfaceLocation(read(GOLDEN, 'basic_20.las'))).toEqual({});
  });
});
