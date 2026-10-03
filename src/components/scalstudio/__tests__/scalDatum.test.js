/**
 * SCAL-U1-014: the free water level through the Suite datum module
 * (src/lib/wellDatum.js). Known values: KB 25 m above MSL, FWL at 8,682.02 ft
 * TVD below KB is 8,682.02 - 82.02 = 8,600.0 ft TVDSS.
 */
import { resolveFwl, fwlPatch, wellSnapshot } from '@/utils/scalstudio/fwlDatum';
import { shmFromScalProject } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';
import { identifiedFitted, reportOf } from './scalTestKit';

const KB_WELL = { id: 'w1', name: 'Ekene-7', kb_m: 25, depth_ref_kind: 'KB', depth_ref_elev_m: 25, vertical_datum: 'MSL', well_environment: 'onshore', ground_elev_m: 20, water_depth_m: null, elev_unit: 'm', datum_changes: [] };
const UNSET_WELL = { id: 'w2', name: 'Ekene-9', kb_m: 0, depth_ref_kind: null, depth_ref_elev_m: null, vertical_datum: null, well_environment: null, ground_elev_m: null, water_depth_m: null, elev_unit: null, datum_changes: [] };

describe('FWL entered as TVD below a registry well', () => {
  it('converts through the well datum: 8,682.02 ft TVD below KB 25 m is 8,600.0 ft TVDSS', () => {
    const h = fwlPatch({ fwl_tvdss: '' }, { fwlEntry: 'tvd', fwlWell: wellSnapshot(KB_WELL), fwl_tvd: String(8600 + 25 / 0.3048) });
    expect(Number(h.fwl_tvdss)).toBeCloseTo(8600, 6);
    const r = resolveFwl(h);
    expect(r.text).toMatch(/^Converted from 8,682 ft TVD below the KB of Ekene-7 \(KB 25\.0 m above MSL/);
    expect(r.basis).toMatch(/TVDSS is below MSL, from KB 82\.02 ft/);
  });

  it('a well with no reference elevation is refused with the registry reason, and no TVDSS is stored', () => {
    const h = fwlPatch({ fwl_tvdss: '8600' }, { fwlEntry: 'tvd', fwlWell: wellSnapshot(UNSET_WELL), fwl_tvd: '8682' });
    expect(h.fwl_tvdss).toBe('');
    expect(resolveFwl(h).error).toMatch(/Ekene-9 has no depth reference elevation, so TVDSS and elevations cannot be given/);
  });

  it('the report and the saturation-height readers take the converted TVDSS', () => {
    const inputs = identifiedFitted();
    inputs.height = fwlPatch(inputs.height, { fwlEntry: 'tvd', fwlWell: wellSnapshot(KB_WELL), fwl_tvd: String(8600 + 25 / 0.3048) });
    const { model } = reportOf(inputs);
    const row = model.inputs.rows.find((r) => r.key === 'height.fwl_tvdss');
    expect(row.value).toBe('8,600.0');
    expect(row.source).toMatch(/^Converted from 8,682 ft TVD below the KB of Ekene-7/);
    expect(model.basis.find((b) => b[0] === 'Depths')[1]).toMatch(/TVDSS is below MSL, from KB 82\.02 ft/);
    const shm = shmFromScalProject({ name: 'x', ...inputs });
    expect(shm.fwlTvdssM).toBeCloseTo(8600 * 0.3048, 6);
  });

  it('typed as TVDSS it stays as typed (the SC5 behaviour)', () => {
    const r = resolveFwl({ fwl_tvdss: '8600' });
    expect(r).toMatchObject({ fwlFt: 8600, entry: 'tvdss', text: 'Entered as TVDSS' });
  });
});
