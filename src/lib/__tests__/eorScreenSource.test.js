// EOR-U2-003: the eor-screen-1 read-by-id contract. The record is built from
// the saved inputs by the screening engine (the one model of the screen and
// the report), carries every input with its source, each method's verdict
// per criterion with its table, the criteria edition, the MMP check and a
// content fingerprint, and is read by id from the saved project.
import {
  buildEorScreenRecord, validateEorScreenRecord, readEorScreenProject, eorScreenFingerprint,
  EOR_SCREEN_CONTRACT, EOR_SCREEN_TABLE, EOR_SCREEN_PARAM,
} from '@/lib/eorScreenSource';
import { screenAllMethods, engineInputOf } from '@/utils/eorScreeningCalculations';
import { buildEorReportModel } from '@/utils/eor/reportModel';
import { sampleCase, fieldCase, intakeCase, blankCase } from '@/utils/eor/__tests__/eorTestKit';

const NOW = '2026-10-04T12:00:00.000Z';
const fakeSupabase = (rows, error = null) => ({
  from: (table) => ({
    select: () => ({
      eq: (_col, id) => ({
        maybeSingle: async () => (error ? { data: null, error } : { data: table === EOR_SCREEN_TABLE ? rows.find((r) => r.id === id) || null : null, error: null }),
      }),
    }),
  }),
});

describe('eor-screen-1', () => {
  it('names the contract, the table and the address parameter', () => {
    expect(EOR_SCREEN_CONTRACT).toBe('eor-screen-1');
    expect(EOR_SCREEN_TABLE).toBe('saved_eor_screening_projects');
    expect(EOR_SCREEN_PARAM).toBe('eorProject');
  });

  it('carries the engine verdicts per criterion, ranked as the screen shows them', () => {
    const inputs = fieldCase();
    const r = buildEorScreenRecord({ inputs, projectId: 'eor-1', projectName: 'Ekene screen', now: NOW });
    const engine = screenAllMethods(engineInputOf(inputs.form));
    expect(r.methods.map((m) => [m.id, m.outcome])).toEqual(engine.map((m) => [m.id, m.outcome]));
    for (const m of r.methods) {
      const e = engine.find((x) => x.id === m.id);
      expect(m.criteria.map((v) => [v.key, v.status])).toEqual(e.verdicts.map((v) => [v.key, v.status]));
      expect(m.passes + m.marginals + m.fails).toBe(m.criteria.filter((v) => v.status !== 'na').length);
      for (const v of m.criteria) expect(v.source).toBeTruthy();
    }
    // the report reads the same model
    const report = buildEorReportModel(inputs, { results: engine });
    expect(r.methods.map((m) => m.name)).toEqual(report.ranking.rows.map((row) => row[1]));
    expect(validateEorScreenRecord(r)).toEqual({ ok: true, errors: [] });
  });

  it('carries every input in oilfield units with its source; intakes name their project and method', () => {
    const r = buildEorScreenRecord({ inputs: intakeCase(), projectId: 'eor-2', now: NOW });
    expect(r.units).toBe('oilfield');
    expect(Object.keys(r.inputs)).toEqual(['gravityApi', 'viscosityCp', 'oilSatPct', 'formation', 'netThicknessFt', 'permeabilityMd', 'depthFt', 'temperatureF', 'reservoirPressurePsia', 'saturationPressurePsia', 'ooipStb', 'volatilesMolPct', 'intermediatesMolPct']);
    expect(r.inputs.permeabilityMd).toMatchObject({ value: 182.4, unit: 'md', screened: true });
    expect(r.inputs.permeabilityMd.source).toMatch(/Horner straight line/);
    expect(r.inputs.ooipStb).toMatchObject({ unit: 'STB', screened: false });
    expect(r.inputs.ooipStb.source).toMatch(/Havlena-Odeh regression, slope/);
    // SI on screen is still oilfield in the record
    const si = buildEorScreenRecord({ inputs: fieldCase({ system: 'si' }), now: NOW });
    const of = buildEorScreenRecord({ inputs: fieldCase(), now: NOW });
    expect(si.inputs.depthFt.value).toBe(of.inputs.depthFt.value);
  });

  it('says when sample values are in it, and keeps blanks as null (never assumed)', () => {
    expect(buildEorScreenRecord({ inputs: sampleCase(), now: NOW }).sample).toBe(true);
    const b = buildEorScreenRecord({ inputs: blankCase(), now: NOW });
    expect(b.sample).toBe(false);
    expect(b.inputs.gravityApi.value).toBeNull();
    expect(b.methods.every((m) => m.outcome === 'not screened')).toBe(true);
  });

  it('names the criteria edition', () => {
    const r = buildEorScreenRecord({ inputs: fieldCase(), now: NOW });
    expect(r.criteria.key).toBe('taber-1997');
    expect(r.criteria.part1).toMatch(/SPE-35385-PA/);
    expect(r.criteria.part2).toMatch(/SPE-39234-PA/);
  });

  it('fingerprint: same content same print whoever reads it and when; a changed input changes it', () => {
    const a = buildEorScreenRecord({ inputs: fieldCase(), projectId: 'x', now: NOW });
    const b = buildEorScreenRecord({ inputs: fieldCase(), projectId: 'x', now: '2027-01-01T00:00:00.000Z' });
    expect(a.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(b.fingerprint).toBe(a.fingerprint);
    const changed = fieldCase();
    changed.form.depthFt = String(Number(changed.form.depthFt) + 1);
    expect(buildEorScreenRecord({ inputs: changed, now: NOW }).fingerprint).not.toBe(a.fingerprint);
  });

  it('negative controls: a tampered record fails validation; no inputs builds nothing', () => {
    const r = buildEorScreenRecord({ inputs: fieldCase(), now: NOW });
    const tampered = { ...r, methods: r.methods.map((m, i) => (i === 0 ? { ...m, outcome: m.outcome === 'qualified' ? 'screened out' : 'qualified' } : m)) };
    expect(validateEorScreenRecord(tampered).ok).toBe(false);
    const miscounted = { ...r, methods: r.methods.map((m, i) => (i === 0 ? { ...m, passes: m.passes + 1 } : m)) };
    miscounted.fingerprint = eorScreenFingerprint(miscounted);
    expect(validateEorScreenRecord(miscounted).errors.join(' ')).toMatch(/do not close/);
    expect(validateEorScreenRecord({ contract: 'wta-1' }).ok).toBe(false);
    expect(buildEorScreenRecord({ inputs: null })).toBeNull();
  });

  it('reads a saved project by id; says plainly when it cannot', async () => {
    const inputs = fieldCase();
    const row = { id: 'eor-9', project_name: 'Ekene screen', updated_at: '2026-10-04T10:00:00Z', inputs_data: { id: 'eor-9', name: 'Ekene screen', schema: 1, inputs } };
    const ok = await readEorScreenProject(fakeSupabase([row]), 'eor-9', { now: NOW });
    expect(ok.ok).toBe(true);
    expect(ok.record.project).toMatchObject({ id: 'eor-9', name: 'Ekene screen', saved_at: '2026-10-04T10:00:00Z' });
    expect(ok.record.fingerprint).toBe(buildEorScreenRecord({ inputs, projectId: 'eor-9', projectName: 'Ekene screen', now: NOW }).fingerprint);
    expect((await readEorScreenProject(fakeSupabase([row]), 'nope')).reason).toMatch(/not found/);
    expect((await readEorScreenProject(fakeSupabase([row]), '')).reason).toMatch(/No EOR Screening project/);
    expect((await readEorScreenProject(fakeSupabase([], { code: 'PGRST205', message: "Could not find the table 'public.saved_eor_screening_projects'" }), 'eor-9')).reason).toMatch(/not switched on yet/);
    expect((await readEorScreenProject(fakeSupabase([{ ...row, inputs_data: {} }]), 'eor-9')).reason).toMatch(/no screening inputs/);
  });
});

describe('eor-screen-1 carries the MMP check (EOR-U2-001)', () => {
  it('the record holds the same check the screen shows, and the fingerprint follows it', () => {
    // eslint-disable-next-line global-require
    const { eorMmpCheck } = require('@/utils/eor/mmp');
    const inputs = fieldCase();
    const r = buildEorScreenRecord({ inputs, now: NOW });
    expect(r.mmp).toEqual(eorMmpCheck(inputs));
    expect(r.mmp).toMatchObject({ gas: 'CO2', correlation: 'zhu-2025', status: 'made', verdict: 'miscible', within_error: true });
    const lower = fieldCase();
    lower.context.reservoirPressurePsia = '2500';
    const r2 = buildEorScreenRecord({ inputs: lower, now: NOW });
    expect(r2.mmp.verdict).toBe('immiscible');
    expect(r2.fingerprint).not.toBe(r.fingerprint);
    expect(validateEorScreenRecord(r2).ok).toBe(true);
  });
});
