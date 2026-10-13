// The water column from the registry well's datum (2026-10-13). Ekene-8,
// offshore in 35 m of water with its KB 25 m above sea level, opened with
// Water depth 0 and Mudline MD 0: the prognosis was a land well's.
import { waterColumnFromDatum, applyDatumWaterColumn, datumWaterBlocker } from '../services/datumWaterColumn';
import { publishBlocker } from '../services/publish';
import { DEFAULT_PARAMS } from '../components/PPWorkstation';

const EKENE8 = {
  name: 'Ekene-8', kb_m: 25, depth_ref_kind: 'KB', depth_ref_elev_m: 25, well_environment: 'offshore',
  water_depth_m: 35, ground_elev_m: null,
};
const LAND = {
  name: 'Onshore-1', kb_m: 40, depth_ref_kind: 'KB', depth_ref_elev_m: 40, well_environment: 'onshore',
  water_depth_m: null, ground_elev_m: 32,
};

describe('water column from the well datum', () => {
  test('negative control: the old default was a land well (0 and 0)', () => {
    expect(DEFAULT_PARAMS.waterDepthM).toBe(0);
    expect(DEFAULT_PARAMS.mudlineMdM).toBe(0);
  });

  test('offshore Ekene-8: 35 m of water, mudline 60 m MD', () => {
    const wc = waterColumnFromDatum(EKENE8);
    expect(wc).toMatchObject({ waterDepthM: 35, mudlineMdM: 60, environment: 'offshore' });
    expect(wc.text).toBe('Water column from the well datum: 35 m of water, mudline 60 m MD.');
    const r = applyDatumWaterColumn(DEFAULT_PARAMS, EKENE8);
    expect(r.params.waterDepthM).toBe(35);
    expect(r.params.mudlineMdM).toBe(60);
    expect(r.params.nu).toBe(DEFAULT_PARAMS.nu);
  });

  test('onshore: no water, the mudline at the ground below the KB', () => {
    const r = applyDatumWaterColumn(DEFAULT_PARAMS, LAND);
    expect(r.params.waterDepthM).toBe(0);
    expect(r.params.mudlineMdM).toBe(8);
    expect(r.applied.environment).toBe('onshore');
  });

  test('a saved or typed water column is kept', () => {
    const saved = { ...DEFAULT_PARAMS, waterDepthM: 100, mudlineMdM: 130 };
    const r = applyDatumWaterColumn(saved, EKENE8);
    expect(r.applied).toBeNull();
    expect(r.params).toBe(saved);
  });

  test('values the previous well\'s datum put there follow the next well; edited ones do not', () => {
    const first = applyDatumWaterColumn(DEFAULT_PARAMS, EKENE8);
    const deeper = { ...EKENE8, name: 'Deep-1', water_depth_m: 100 };
    const next = applyDatumWaterColumn(first.params, deeper, { previous: first.applied });
    expect(next.params.waterDepthM).toBe(100);
    expect(next.params.mudlineMdM).toBe(125);
    const edited = { ...first.params, waterDepthM: 36 };
    expect(applyDatumWaterColumn(edited, deeper, { previous: first.applied }).applied).toBeNull();
  });

  test('a well whose datum says nothing leaves the params alone', () => {
    const r = applyDatumWaterColumn(DEFAULT_PARAMS, { name: 'Old', kb_m: 0 });
    expect(r.applied).toBeNull();
    expect(r.params.waterDepthM).toBe(0);
  });
});

describe('publish is held for an offshore well with no water depth', () => {
  test('0/0 on Ekene-8 is refused, naming both', () => {
    const msg = publishBlocker(DEFAULT_PARAMS, { well: EKENE8 });
    expect(msg).toMatch(/Ekene-8 is offshore in 35 m of water/);
    expect(msg).toMatch(/Water depth in Parameters is 0/);
    expect(datumWaterBlocker(DEFAULT_PARAMS, LAND)).toBeNull();
  });
  test('with the datum water column it publishes', () => {
    expect(publishBlocker(applyDatumWaterColumn(DEFAULT_PARAMS, EKENE8).params, { well: EKENE8 })).toBeNull();
  });
  test('callers that pass no well behave as before', () => {
    expect(publishBlocker(DEFAULT_PARAMS)).toBeNull();
  });
});
