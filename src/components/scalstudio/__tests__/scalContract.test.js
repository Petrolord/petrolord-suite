/**
 * The kr-1 contract (SCAL-U1, RL11): the writer, its gate with negative
 * controls, the Waterflood intake by router state and by project id, the
 * shared intake card, and a static guard that the handoff key has a writer
 * and a reader.
 */
import fs from 'fs';
import path from 'path';
import {
  validateKrContract, krContractOf, krContractSourceText, KR1_SCHEMA, KR_HANDOFF_STATE_KEY,
} from '@/lib/inputProvenance/krContract';
import { krIntakeCardModel } from '@/lib/inputProvenance/krIntakeCard';
import { buildScalKrHandoffV2 } from '@/utils/scalstudio/krHandoff';
import { mapScalKrIntake, scalKrFromContract, SCAL_INTAKE_FIELDS } from '@/components/waterflooddesign/scalKrIntake';
import { shmFromScalProject } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';
import { SCHEMA_1_SAMPLES, SCHEMA_1_MANUAL } from '@/components/scalstudio/__fixtures__/savedProjects';
import { openingInputs, identifiedFitted, stateOf, inputsFromPayload, AT } from './scalTestKit';

const mockRows = {};
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_k, id) => ({ maybeSingle: async () => ({ data: mockRows[id] || null, error: null }) }),
      }),
    }),
  },
}));
// eslint-disable-next-line import/first
import { readScalProjectKr } from '@/lib/krSource';

describe('the writer and its gate', () => {
  it('writes a valid block for the opening workspace, entered sets and a typed J', () => {
    const c = stateOf(openingInputs()).contract;
    expect(c.schema).toBe(KR1_SCHEMA);
    expect(validateKrContract(c)).toMatchObject({ ok: true, errors: [] });
    expect(c.oil_water.origin).toEqual({ kind: 'entered' });
    expect(c.capillary.j.origin).toBe('entered');
    expect(c.oil_water.table).toHaveLength(25);
    expect(c.scope).toMatchObject({ hysteresis: false, three_phase: false });
  });

  it('names the sample a fitted set came from, with the fit, and the samples behind the J', () => {
    const c = stateOf(identifiedFitted()).contract;
    expect(validateKrContract(c).ok).toBe(true);
    expect(c.oil_water.origin).toMatchObject({ kind: 'fitted', sample_id: 'demo-0', sample_name: 'Demo core A (synthetic)' });
    expect(c.oil_water.origin.fit.r2Log).toBeGreaterThan(0.99);
    expect(c.capillary.j).toMatchObject({ origin: 'samples', samples: ['Demo core A (synthetic)', 'Demo core B (synthetic)'], swirr_from: 'override', Swirr: 0.12 });
    expect(c.samples[0]).toMatchObject({ origin: 'analog', process_kr: 'imbibition', process_pc: 'drainage', kr_points: 13, pc_points: 8, laboratory: 'Core Lab Lagos' });
    expect(c.capillary.height.fwl_tvdss_ft).toBe(8600);
    expect(krContractSourceText(c)).toBe('Corey fitted to sample "Demo core A (synthetic)" (analog, imbibition, unsteady-state), r2 0.999 (log kr), from SCAL Studio project "Ekene E-2000 SCAL" (2026-10-03 09:00 UTC)');
  });

  it('an edit after the fit is written as such', () => {
    const inputs = identifiedFitted();
    inputs.curves.ow = { ...inputs.curves.ow, no: '2.5' };
    const c = stateOf(inputs).contract;
    expect(c.oil_water.origin).toMatchObject({ kind: 'edited-after-fit', edited: ['no'] });
    expect(krContractSourceText(c)).toMatch(/^Corey fitted, then edited by the user/);
  });

  it('the block holds engine units whatever the display system', () => {
    const field = stateOf(identifiedFitted()).contract;
    const si = stateOf(identifiedFitted({ system: 'si' })).contract;
    expect(si.units).toEqual(field.units);
    expect(si.capillary.table).toEqual(field.capillary.table);
    expect(si.units.pc).toBe('psi');
  });

  it('negative controls: a set with no origin, a missing unit, an empty block are refused', () => {
    const c = stateOf(identifiedFitted()).contract;
    const noOrigin = { ...c, oil_water: { ...c.oil_water, origin: {} } };
    expect(validateKrContract(noOrigin).errors.join(' ')).toMatch(/oil_water\.origin\.kind/);
    const noUnit = { ...c, units: { ...c.units, pc: undefined } };
    expect(validateKrContract(noUnit).errors).toContain('units.pc is missing.');
    expect(validateKrContract({ ...c, oil_water: null, gas_oil: null, capillary: null }).ok).toBe(false);
    expect(krContractOf({ schema: 'pvt-1' })).toBeNull();
  });

  it('warns when a sample does not say drainage or imbibition', () => {
    const inputs = identifiedFitted();
    inputs.samples[0] = { ...inputs.samples[0], krProcess: '' };
    expect(validateKrContract(stateOf(inputs).contract).warnings.join(' ')).toMatch(/Demo core A \(synthetic\)": drainage or imbibition of the kr test is not stated/);
  });
});

describe('Waterflood takes it and keeps it', () => {
  const contract = () => stateOf(identifiedFitted()).contract;

  it('router state: the patch applies the set and stores the intake record', () => {
    const payload = buildScalKrHandoffV2({ contract: contract(), muW: 0.5, muO: 5 });
    const mapped = mapScalKrIntake(payload);
    expect(mapped.patch).toMatchObject({ krSource: 'corey', nw: String(contract().oil_water.params.nw), muW: '0.5' });
    expect(mapped.patch.krIntake.from).toMatchObject({ app: 'SCAL Studio', recordId: 'scal-project-1', recordName: 'Ekene E-2000 SCAL' });
    expect(mapped.patch.krIntake.sourceText).toMatch(/^Corey fitted to sample "Demo core A \(synthetic\)"/);
    expect(mapped.patch.krIntake.contract.oil_water.table).toBeUndefined(); // stored without the tables
    expect(mapped.note).toMatch(/Source: Corey fitted to sample/);
  });

  it('a version 1 payload (no block) still maps and stores nothing it was not told', () => {
    const mapped = mapScalKrIntake({ source: 'old', krSource: 'corey', corey: { Swc: 0.2, Sor: 0.25, krwMax: 0.35, kroMax: 0.9, nw: 2.5, no: 2 } });
    expect(mapped.patch.krIntake).toBeUndefined();
  });

  it('the card: as received, edited after intake, source changed since', () => {
    const intake = mapScalKrIntake(buildScalKrHandoffV2({ contract: contract(), muW: 0.5, muO: 5 })).patch.krIntake;
    const now = { ...Object.fromEntries(Object.entries(intake.values).map(([k, v]) => [k, String(v)])) };
    expect(krIntakeCardModel({ intake, current: now, fields: SCAL_INTAKE_FIELDS }).status).toBe('As received');
    const edited = krIntakeCardModel({ intake, current: { ...now, nw: '3' }, fields: SCAL_INTAKE_FIELDS });
    expect(edited.status).toBe('Edited after intake');
    expect(edited.edited).toEqual(['nw']);
    const later = { ...contract(), generated_at: new Date(AT.getTime() + 3600e3).toISOString() };
    const changed = krIntakeCardModel({ intake, current: now, fields: SCAL_INTAKE_FIELDS, latest: { ok: true, contract: later } });
    expect(changed.status).toBe('Source changed since');
    expect(changed.pedigree).toBe('Analog, imbibition, water-wet, lab Core Lab Lagos');
  });

  it('by id: a saved block is read and mapped; an old project and a missing one say why', async () => {
    const c = contract();
    mockRows.p2 = { id: 'p2', project_name: 'Ekene E-2000 SCAL', inputs_data: { ...SCHEMA_1_MANUAL, schema: 2, kr: c }, updated_at: AT.toISOString() };
    mockRows.p1 = { id: 'p1', project_name: SCHEMA_1_MANUAL.name, inputs_data: SCHEMA_1_MANUAL, updated_at: AT.toISOString() };
    const ok = await readScalProjectKr('p2');
    expect(ok.ok).toBe(true);
    const mapped = mapScalKrIntake(scalKrFromContract(ok.contract));
    expect(mapped.patch.krIntake.from.recordId).toBe('scal-project-1');
    expect((await readScalProjectKr('p1')).reason).toMatch(/saved before it carried its kr-1 block/);
    expect((await readScalProjectKr('nope')).reason).toMatch(/not found, or it is not yours to read/);
  });
});

describe('SCAL-U1-015: the saturation-height readers take a samples-mode project', () => {
  it('shmFromScalProject gives the J SCAL Studio shows for a project averaged from samples', () => {
    const shm = shmFromScalProject(SCHEMA_1_SAMPLES);
    expect(shm.ok).toBe(true); // was refused: the saved samples carry no jRows (they are derived)
    const s = stateOf(inputsFromPayload(SCHEMA_1_SAMPLES));
    expect(shm.jSpec).toEqual(s.jResolved.jSpec);
    expect(shm.reservoir).toEqual(s.reservoir.props);
  });

  it('a schema 2 save of the same project reads the same (the kr-1 block and the new keys change nothing)', () => {
    const s = stateOf(inputsFromPayload(SCHEMA_1_SAMPLES));
    const resaved = { ...SCHEMA_1_SAMPLES, schema: 2, kr: s.contract, identification: {}, inputMeta: {}, unitSystem: 'si' };
    const { sourceText: newSource, ...now } = shmFromScalProject(resaved);
    const { sourceText: oldSource, ...before } = shmFromScalProject(SCHEMA_1_SAMPLES);
    expect(now).toEqual(before);
    expect(oldSource).toMatch(/saved before it carried its kr-1 block/);
    expect(newSource).toBe('Leverett J averaged from 2 samples (Demo core A (synthetic), Demo core B (synthetic)), refit r2 1.000, scaled to k 150 md and porosity 0.22, from SCAL Studio project "Ekene E-2000 SCAL" (2026-10-03 09:00 UTC)');
    expect(shmFromScalProject(SCHEMA_1_MANUAL).ok).toBe(true);
  });
});

describe('static guard: the handoff key has a writer and a reader', () => {
  it('scalKr is written by SCAL Studio and read by Waterflood', () => {
    const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
    expect(KR_HANDOFF_STATE_KEY).toBe('scalKr');
    expect(read('src/components/scalstudio/ExportTab.jsx')).toMatch(/\[KR_HANDOFF_STATE_KEY\]: payload/);
    expect(read('src/pages/apps/WaterfloodDesignStudio.jsx')).toMatch(/location\.state\?\.scalKr/);
    expect(read('src/pages/apps/WaterfloodDesignStudio.jsx')).toMatch(/readScalProjectKr\(projectId\)/);
  });
});
