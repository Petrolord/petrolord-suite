/**
 * W0.2 interpretation state out of the manifest: precedence (row
 * authoritative once interp_rev > 0, manifest fallback before),
 * compose/apply semantics matching the retired manifest writers, the
 * compare-and-set save (bump on success, named INTERP_CONFLICT on a
 * stale revision), and the one-time write-through migration.
 */

const mockFrom = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { from: (...a) => mockFrom(...a) },
}));

import {
  resolveInterpState, interpNeedsMigration,
  applyVelocityToManifest, applyTraversesToManifest, composeManifest,
  saveVolumeVelocity, saveVolumeTraverses, migrateInterpState,
  InterpConflictError,
} from '@/pages/apps/Seismolord/services/interpState';

const VEL = { kind: 'constant', v0: 1800 };
const CAL = { wells: ['KETA-V1'] };
const TRAV = [{ id: 't1', name: 'Line A', vertices: [[0, 0], [1, 1]] }];

/** Chainable supabase builder: records the update payload + filters,
 *  resolves to a canned result at the awaited end of the chain. */
function updateBuilder(result, log) {
  const b = {
    update: (patch) => { log.patch = patch; return b; },
    eq: (col, val) => { log.eq.push([col, val]); return b; },
    select: () => Promise.resolve(result),
  };
  return b;
}
function singleBuilder(result, log) {
  const b = {
    select: () => b,
    eq: (col, val) => { log.eq.push([col, val]); return b; },
    single: () => Promise.resolve(result),
  };
  return b;
}

beforeEach(() => mockFrom.mockReset());

describe('resolveInterpState precedence', () => {
  const manifest = { velocity: VEL, velocity_calibration: CAL, traverses: TRAV };

  test('rev 0 falls back to the legacy manifest fields', () => {
    expect(resolveInterpState({ interp_rev: 0 }, manifest)).toEqual({
      velocity: VEL, calibration: CAL, traverses: TRAV, rev: 0,
    });
  });

  test('rev > 0 row is authoritative, and its nulls mean deleted', () => {
    const row = {
      interp_rev: 3, velocity_model: null, velocity_calibration: null, traverses: null,
    };
    expect(resolveInterpState(row, manifest)).toEqual({
      velocity: null, calibration: null, traverses: [], rev: 3,
    });
  });

  test('calibration only ever rides along with a model', () => {
    const row = { interp_rev: 2, velocity_model: null, velocity_calibration: CAL };
    expect(resolveInterpState(row, {}).calibration).toBeNull();
    expect(resolveInterpState(row, manifest).calibration).toBeNull();
    expect(resolveInterpState(
      { interp_rev: 2, velocity_model: VEL, velocity_calibration: CAL }, {},
    ).calibration).toEqual(CAL);
  });

  test('missing row behaves as rev 0', () => {
    expect(resolveInterpState(null, manifest).rev).toBe(0);
    expect(resolveInterpState(null, manifest).velocity).toEqual(VEL);
  });
});

describe('interpNeedsMigration', () => {
  test('true only when the manifest carries legacy interp state', () => {
    expect(interpNeedsMigration({})).toBe(false);
    expect(interpNeedsMigration({ traverses: [] })).toBe(false);
    expect(interpNeedsMigration({ velocity: VEL })).toBe(true);
    expect(interpNeedsMigration({ traverses: TRAV })).toBe(true);
  });
});

describe('manifest composition mirrors the retired writers', () => {
  test('applyVelocityToManifest sets, clears, and gates calibration on a model', () => {
    const base = { geometry: {}, velocity: VEL, velocity_calibration: CAL };
    const cleared = applyVelocityToManifest(base, null);
    expect(cleared.velocity).toBeUndefined();
    expect(cleared.velocity_calibration).toBeUndefined();
    const handTyped = applyVelocityToManifest(base, VEL, null);
    expect(handTyped.velocity).toEqual(VEL);
    expect(handTyped.velocity_calibration).toBeUndefined();
    const calibrated = applyVelocityToManifest(base, VEL, CAL);
    expect(calibrated.velocity_calibration).toEqual(CAL);
    expect(base.velocity).toEqual(VEL);              // input untouched
  });

  test('applyTraversesToManifest deletes the key on an empty list', () => {
    const base = { traverses: TRAV };
    expect(applyTraversesToManifest(base, []).traverses).toBeUndefined();
    expect(applyTraversesToManifest(base, TRAV).traverses).toEqual(TRAV);
  });

  test('composeManifest = velocity + traverses over the frozen manifest', () => {
    const frozen = { geometry: { ns: 8 }, velocity: { stale: true }, traverses: [{ stale: true }] };
    const out = composeManifest(frozen, {
      velocity: VEL, calibration: CAL, traverses: TRAV, rev: 4,
    });
    expect(out.geometry).toEqual({ ns: 8 });
    expect(out.velocity).toEqual(VEL);
    expect(out.velocity_calibration).toEqual(CAL);
    expect(out.traverses).toEqual(TRAV);
    const emptied = composeManifest(frozen, { velocity: null, calibration: null, traverses: [], rev: 4 });
    expect(emptied.velocity).toBeUndefined();
    expect(emptied.traverses).toBeUndefined();
  });
});

describe('compare-and-set saves', () => {
  const volume = { id: 'vol-1' };

  test('a save filters on id + expected rev and writes rev+1', async () => {
    const log = { eq: [] };
    mockFrom.mockReturnValue(updateBuilder({ data: [{ interp_rev: 6 }], error: null }, log));
    const row = await saveVolumeVelocity(volume, VEL, CAL, 5);
    expect(row.interp_rev).toBe(6);
    expect(mockFrom).toHaveBeenCalledWith('seismic_volumes');
    expect(log.patch).toEqual({ velocity_model: VEL, velocity_calibration: CAL, interp_rev: 6 });
    expect(log.eq).toEqual([['id', 'vol-1'], ['interp_rev', 5]]);
  });

  test('removing the model nulls both columns', async () => {
    const log = { eq: [] };
    mockFrom.mockReturnValue(updateBuilder({ data: [{ interp_rev: 2 }], error: null }, log));
    await saveVolumeVelocity(volume, null, CAL, 1);
    expect(log.patch).toEqual({ velocity_model: null, velocity_calibration: null, interp_rev: 2 });
  });

  test('an empty traverse list clears the column', async () => {
    const log = { eq: [] };
    mockFrom.mockReturnValue(updateBuilder({ data: [{ interp_rev: 2 }], error: null }, log));
    await saveVolumeTraverses(volume, [], 1);
    expect(log.patch).toEqual({ traverses: null, interp_rev: 2 });
  });

  test('zero matched rows is the named conflict with reload copy', async () => {
    mockFrom.mockReturnValue(updateBuilder({ data: [], error: null }, { eq: [] }));
    await expect(saveVolumeTraverses(volume, TRAV, 1)).rejects.toMatchObject({
      name: 'INTERP_CONFLICT',
      message: expect.stringMatching(/Reload the volume/),
    });
    expect(new InterpConflictError().name).toBe('INTERP_CONFLICT');
  });

  test('a database error surfaces with context', async () => {
    mockFrom.mockReturnValue(updateBuilder({ data: null, error: { message: 'boom' } }, { eq: [] }));
    await expect(saveVolumeVelocity(volume, VEL, null, 0))
      .rejects.toThrow(/Could not save interpretation state: boom/);
  });
});

describe('migrateInterpState', () => {
  const volume = { id: 'vol-1' };

  test('copies legacy manifest state into the row at rev 0 -> 1', async () => {
    const log = { eq: [] };
    mockFrom.mockReturnValue(updateBuilder({ data: [{ interp_rev: 1 }], error: null }, log));
    const row = await migrateInterpState(volume, {
      velocity: VEL, velocity_calibration: CAL, traverses: TRAV,
    });
    expect(row.interp_rev).toBe(1);
    expect(log.patch).toEqual({
      velocity_model: VEL, velocity_calibration: CAL, traverses: TRAV, interp_rev: 1,
    });
    expect(log.eq).toEqual([['id', 'vol-1'], ['interp_rev', 0]]);
  });

  test('losing the migration race returns the fresh row instead', async () => {
    const log = { eq: [] };
    mockFrom
      .mockReturnValueOnce(updateBuilder({ data: [], error: null }, { eq: [] }))
      .mockReturnValueOnce(singleBuilder({ data: { interp_rev: 2, velocity_model: VEL }, error: null }, log));
    const row = await migrateInterpState(volume, { velocity: VEL });
    expect(row).toEqual({ interp_rev: 2, velocity_model: VEL });
    expect(log.eq).toEqual([['id', 'vol-1']]);
  });
});
