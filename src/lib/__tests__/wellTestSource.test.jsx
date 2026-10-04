/**
 * WTA-U1-012: the wta-1 sender out of Well Test Analysis Studio. The real
 * provider is mounted and fitted; its save carries the record; the record
 * is read back by id through the same reader Material Balance and
 * Waterflood use, and mapped by Material Balance's own intake.
 */
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { mountStudio } from '@/components/welltest/__tests__/reportTestKit';
import {
  readWellTestProject, wellTestDataFromContract, validateWtaContract, WTA_CONTRACT, wtaContractOf,
} from '@/lib/wellTestSource';
import { mapWellTestIntake } from '@/pages/apps/reservoir-balance/lib/wellTestIntake';

const fakeDb = (row) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
});

describe('wta-1: what a saved Well Test project says about the reservoir', () => {
  let studio;
  let saved;
  beforeAll(async () => {
    studio = mountStudio();
    await studio.act((c) => c.loadSampleTest());
    await studio.act((c) => {
      c.setFieldName('Obodo');
      c.setCompletionField('gaugeDepthMd', '9800');
      c.setCompletionField('datumDepthTvdss', '9500');
    });
    await studio.act((c) => c.runAutoFit());
    saved = studio.ctx.serializeInputs();
  }, 600000);
  afterAll(() => studio?.unmount());

  test('every save carries the record of the interpretation on screen', () => {
    const b = saved.wta;
    expect(validateWtaContract(b)).toEqual({ ok: true, errors: [] });
    expect(b.contract).toBe(WTA_CONTRACT);
    expect(b.permeability.value).toBe(studio.ctx.derivedKpis.k);
    expect(b.permeability.method).toMatch(/^Model match, Homogeneous.*\(regression converged\)$/);
    expect(b.permeability.ci95).toEqual(studio.ctx.fitResult.confidence95.k);
    expect(b.skin.total).toBe(studio.ctx.derivedKpis.skin);
    expect(b.skin.partial_penetration).toBe(studio.ctx.skinBreakdown.spp);
    expect(b.skin.mechanical).toBe(studio.ctx.skinBreakdown.mechanicalSkin);
    expect(Number.isFinite(b.skin.mechanical)).toBe(true);
    expect(b.pressure.p_star_psia).toBe(studio.ctx.semilogResult.pStar);
    expect(b.pressure.average_method).toMatch(/only for an infinite-acting reservoir; no MBH or Dietz correction/);
    expect(b.pressure).toMatchObject({ gauge_depth_md_ft: 9800, datum_tvdss_ft: 9500, datum_correction: 'none' });
    expect(b.status).toMatchObject({ match: 'regression', converged: true });
  });

  test('read by id, then mapped by Material Balance: the pressure and k arrive with their methods', async () => {
    const res = await readWellTestProject(fakeDb({ id: 'p1', project_name: 'B-12 buildup', inputs_data: saved, updated_at: '2026-10-04T10:00:00Z' }), 'p1');
    expect(res.ok).toBe(true);
    const wt = wellTestDataFromContract(res.contract);
    const mapped = mapWellTestIntake(wt);
    expect(Number(mapped.prefill.initial_pressure_psia)).toBeCloseTo(studio.ctx.semilogResult.pStar, 1);
    expect(mapped.handoffs.initial_pressure_psia.text).toMatch(/extrapolated p\* of the Horner straight line/);
    expect(mapped.note).toMatch(/k = \d+(\.\d+)? md from Model match/);
  });

  test('a project saved before this round asks to be saved once; a moved manual match says manual', async () => {
    const old = { ...saved };
    delete old.wta;
    const res = await readWellTestProject(fakeDb({ id: 'p0', project_name: 'old', inputs_data: old }), 'p0');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/saved before it carried its results \(wta-1\)/);
    await studio.act((c) => c.setMatchField('k', '90'));
    const b = wtaContractOf(studio.ctx.serializeInputs());
    expect(b.permeability).toMatchObject({ value: 90, ci95: null });
    expect(b.permeability.method).toMatch(/\(manual match\)$/);
    expect(b.status.match).toBe('manual');
  });

  test('no interpretation, no record', async () => {
    const s2 = mountStudio();
    expect(s2.ctx.serializeInputs().wta).toBeNull();
    s2.unmount();
  });
});
