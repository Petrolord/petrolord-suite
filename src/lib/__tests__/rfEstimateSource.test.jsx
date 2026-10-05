/**
 * RF-U2-001: the rf-1 contract out of the Recovery Factor Estimator
 * (src/lib/rfEstimateSource.js) and its first reader, ReservoirCalc Pro
 * (components/RfIntakeNote.jsx).
 *
 * The record is built from the estimator's own derived model (deriveRf, the
 * engine the page calls), saved through the estimator's provider, and read
 * back BY ID through a PostgREST stand-in over the saved rows, as
 * ReservoirCalc Pro reads it. ReservoirCalc Pro's recovery factor does not
 * move until the user takes the value; an edit after the intake and a change
 * at the source since are both said.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  buildRfRecord, rfContractOf, validateRfContract, readRfProject, rcpRecoveryTarget, rcpRfIntake,
  rcpRfIntakeStatus, rcpRfResultLines, RF_CONTRACT,
} from '@/lib/rfEstimateSource';
import { rfRecordOf } from '@/utils/rfestimator/rfRecord';
import { deriveRf } from '@/utils/rfestimator/workspace';
import { sampleInputs } from '@/utils/rfestimator/model';
import { apiWaterDriveRF, sampleRecoveryData } from '@/utils/recoveryFactorCalculations';
import { reviewerPayload, gasPayload, IDENT } from '@/utils/rfestimator/__tests__/rfTestKit';

const mockRcp = { state: null, updateInputs: jest.fn(), logEvent: jest.fn() };
jest.mock('@/pages/apps/ReservoirCalcPro/contexts/ReservoirCalcContext', () => ({ useReservoirCalc: () => mockRcp }));
// eslint-disable-next-line import/first
import RfIntakeNote from '@/pages/apps/ReservoirCalcPro/components/RfIntakeNote';

const mockRows = { list: [] };
jest.mock('@/utils/savedProjects', () => ({
  createSavedProjectsService: () => ({
    list: async () => mockRows.list.map((r) => ({ id: r.id, name: r.project_name })),
    listRows: async () => mockRows.list.map((r) => ({ id: r.id, name: r.project_name })),
    load: async (id) => mockRows.list.find((r) => r.id === id)?.inputs_data ?? null,
    loadRow: async (id) => {
      const r = mockRows.list.find((x) => x.id === id);
      return r ? { payload: r.inputs_data, row: { id: r.id, project_name: r.project_name } } : null;
    },
    save: async (id, payload) => {
      const i = mockRows.list.findIndex((r) => r.id === id);
      const row = { id, project_name: payload.name, inputs_data: payload, updated_at: new Date().toISOString() };
      if (i >= 0) mockRows.list[i] = row; else mockRows.list.push(row);
      return { success: true };
    },
    remove: async () => ({ success: true }),
  }),
}));
// eslint-disable-next-line import/first
import { RfEstimatorProvider, useRfEstimator } from '@/contexts/RfEstimatorContext';

/** A read-only PostgREST stand-in over a store. */
const clientOver = (db) => ({
  from: (table) => {
    const filters = [];
    const rows = () => (db[table] || []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q, eq: (k, v) => { filters.push([k, v]); return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    };
    return q;
  },
});

const NOW = '2026-10-04T10:00:00.000Z';
// the reviewer case's estimate in percent, one decimal (its PVT comes from a Fluid project)
const R1 = () => (apiWaterDriveRF(reviewerPayload().inputs.corr) * 100).toFixed(1);
const stateOf = (payload) => ({ inputs: payload.inputs, derived: deriveRf(payload.inputs, { inPlaceIntake: payload.inPlaceIntake, pvtIntake: payload.pvtIntake }), identification: payload.identification, inPlaceIntake: payload.inPlaceIntake });

describe('the rf-1 record', () => {
  test('carries the estimate with its method, basis, range, in-place source and engine (reviewer case, API water drive)', () => {
    const p = reviewerPayload();
    const s = stateOf(p);
    const rec = rfRecordOf(s, { projectId: 'rf-1-id', projectName: 'Ekene E-2000 RF', now: NOW });
    expect(rec.contract).toBe(RF_CONTRACT);
    expect(rec.project).toEqual({ id: 'rf-1-id', name: 'Ekene E-2000 RF', field: IDENT.field, reservoir: IDENT.reservoir, analyst: IDENT.analyst });
    expect(rec.phase).toBe('oil');
    // the value is the engine's: the API water-drive estimate of the inputs the record names
    expect(rec.recovery_factor.value).toBe(s.derived.result.rf);
    expect(rec.recovery_factor.value).toBe(apiWaterDriveRF(p.inputs.corr));
    expect(rec.recovery_factor).toMatchObject({ method: 'api_water_drive', method_label: 'API (1967): water drive', withheld: null });
    expect(rec.recovery_factor.basis).toMatch(/Fraction of OOIP at stock-tank/);
    expect(rec.recovery_factor.validation).toMatch(/k in darcies/);
    expect(rec.range).toMatchObject({ low: 0.35, high: 0.75, drive_code: 'water_drive', kind: 'analog range edges', validated: false });
    expect(rec.in_place).toMatchObject({ quantity: 'OOIP', unit: 'STB', value: s.derived.inPlace });
    expect(rec.in_place.source).toMatch(/volumetric/);
    expect(rec.recoverable.value).toBeCloseTo(s.derived.inPlace * rec.recovery_factor.value, 6);
    expect(rec.case_data).toBe('entered');
    expect(rec.computed_at).toBe(NOW);
    expect(validateRfContract(rec).ok).toBe(true);
  });

  test('a withheld estimate carries no value and its reason; the sample says it is the sample', () => {
    const p = gasPayload();
    p.inputs.corr = { ...p.inputs.corr, pa: '6000' };
    const rec = rfRecordOf(stateOf(p), { now: NOW });
    expect(rec.phase).toBe('gas');
    expect(rec.recovery_factor.value).toBeNull();
    expect(rec.recovery_factor.withheld).toMatch(/outside 0 to 100 percent/);
    const sample = rfRecordOf({ inputs: sampleInputs(), derived: deriveRf(sampleInputs()) }, { now: NOW });
    expect(sample.case_data).toBe('sample');
    expect(sample.recovery_factor.value).toBe(sampleRecoveryData() && 0.5);
  });

  test('refuses what a reader cannot rely on', () => {
    expect(buildRfRecord(null)).toBeNull();
    expect(validateRfContract({ contract: 'mbal-1' }).ok).toBe(false);
    expect(rfContractOf({ inputs: {} })).toBeNull();
  });
});

describe('the estimator writes rf-1 into every save, and a reader takes it by id', () => {
  test('a new project carries its own id in the record; readRfProject returns it', async () => {
    mockRows.list = [];
    const wrapper = ({ children }) => <RfEstimatorProvider>{children}</RfEstimatorProvider>;
    const { result } = renderHook(() => useRfEstimator(), { wrapper });
    await act(async () => { result.current.setMethod('api_water_drive'); });
    await act(async () => { await result.current.createProject('Sent case'); });
    expect(mockRows.list).toHaveLength(1);
    const row = mockRows.list[0];
    expect(row.inputs_data.rf.project.id).toBe(row.id);
    expect(row.inputs_data.rf.recovery_factor.method).toBe('api_water_drive');
    expect(row.inputs_data.rf.recovery_factor.value).toBe(result.current.result.rf);
    const got = await readRfProject(clientOver({ saved_rf_projects: mockRows.list }), row.id);
    expect(got.ok).toBe(true);
    expect(got.contract.recovery_factor.value).toBeCloseTo(0.4232, 4);
  });

  test('negative control: a project saved before rf-1, or not readable, says so', async () => {
    const db = { saved_rf_projects: [{ id: 'old', project_name: 'Old', inputs_data: { name: 'Old', inputs: sampleInputs() } }] };
    expect((await readRfProject(clientOver(db), 'old')).reason).toMatch(/saved before it carried its estimate/);
    expect((await readRfProject(clientOver(db), 'nope')).reason).toMatch(/not found, or it is not yours to read/);
    expect((await readRfProject(clientOver(db), '')).ok).toBe(false);
  });
});

describe('ReservoirCalc Pro takes the recovery factor only when asked', () => {
  const rec = () => rfRecordOf(stateOf(reviewerPayload()), { projectId: 'rf-a', projectName: 'Ekene E-2000 RF', now: NOW });
  const dbWith = (record) => ({ saved_rf_projects: [{ id: 'rf-a', project_name: 'Ekene E-2000 RF', updated_at: NOW, inputs_data: { name: 'Ekene E-2000 RF', rf: record } }] });
  const renderAt = (path, client) => render(<MemoryRouter initialEntries={[path]}><RfIntakeNote client={client} /></MemoryRouter>);

  test('prints the estimate with method, basis and source; RCP keeps 25 percent until "Use" is pressed', async () => {
    mockRcp.updateInputs.mockClear();
    mockRcp.state = { inputs: { fluidType: 'oil', recovery: 25, recoveryGas: 70 } };
    renderAt('/rcp?rfProject=rf-a', clientOver(dbWith(rec())));
    const note = await screen.findByTestId('rcp-rf-intake', {}, { timeout: 10000 });
    await waitFor(() => expect(note).toHaveTextContent(`Recovery factor ${R1()} percent of OOIP, API (1967): water drive, from Recovery Factor Estimator project "Ekene E-2000 RF" (field Ekene)`));
    expect(note).toHaveTextContent('Basis: Fraction of OOIP at stock-tank (standard) conditions');
    expect(note).toHaveTextContent('Analog range of Water drive (edge/bottom): 35.0 percent to 75.0 percent (range edges, not validated');
    expect(note).toHaveTextContent('This project keeps its own recovery factor (25 percent) until you use this one.');
    expect(mockRcp.updateInputs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('rcp-rf-intake-take'));
    expect(mockRcp.updateInputs).toHaveBeenCalledTimes(1);
    const [patch] = mockRcp.updateInputs.mock.calls[0];
    expect(patch.recovery).toBeCloseTo(apiWaterDriveRF(reviewerPayload().inputs.corr) * 100, 4);
    expect(patch.recoveryGas).toBeUndefined();
    expect(patch.rfIntake).toMatchObject({ contract: 'rf-1', project_id: 'rf-a', field: 'recovery', method: 'api_water_drive', computed_at: NOW });
  });

  test('a gas estimate fills the gas recovery factor; an oil-only project refuses it with the reason', () => {
    const g = rfRecordOf(stateOf(gasPayload()), { now: NOW });
    expect(rcpRecoveryTarget(g, 'gas')).toMatchObject({ ok: true, field: 'recoveryGas' });
    expect(rcpRecoveryTarget(g, 'oil_gas')).toMatchObject({ ok: true, field: 'recoveryGas' });
    expect(rcpRecoveryTarget(g, 'oil').ok).toBe(false);
    expect(rcpRecoveryTarget(g, 'oil').error).toMatch(/estimate is for gas/);
    expect(rcpRecoveryTarget(rec(), 'oil')).toMatchObject({ ok: true, field: 'recovery' });
  });

  test('edited after the intake, and the source changed since, are both said on a later open', async () => {
    const r0 = rec();
    const target = rcpRecoveryTarget(r0, 'oil');
    const intake = rcpRfIntake(r0, { projectId: 'rf-a', projectName: 'Ekene E-2000 RF', field: target.field, percent: target.percent, now: NOW });
    // the estimate at the source moves (k doubled) and is saved again
    const p = reviewerPayload();
    p.inputs.corr = { ...p.inputs.corr, k: '300' };
    const r1 = rfRecordOf(stateOf(p), { projectId: 'rf-a', projectName: 'Ekene E-2000 RF', now: '2026-10-05T08:00:00.000Z' });
    expect(r1.recovery_factor.value).not.toBeCloseTo(r0.recovery_factor.value, 4);
    mockRcp.updateInputs.mockClear();
    mockRcp.state = { inputs: { fluidType: 'oil', recovery: 40, rfIntake: intake } };
    renderAt('/rcp', clientOver(dbWith(r1)));
    expect(await screen.findByTestId('rcp-rf-intake-changed', {}, { timeout: 10000 })).toHaveTextContent(`The source changed after the intake: the estimate now reads ${(r1.recovery_factor.value * 100).toFixed(1)} percent`);
    expect(screen.getByTestId('rcp-rf-intake-edited')).toHaveTextContent(`edited here after the intake: it is 40 percent, and ${R1()} percent was received`);
    expect(screen.getByTestId('rcp-rf-intake-taken')).toHaveTextContent('was taken from project "Ekene E-2000 RF"');
    expect(mockRcp.updateInputs).not.toHaveBeenCalled();
    // unchanged and not edited: nothing said
    expect(rcpRfIntakeStatus(intake, { recovery: target.percent }, r0)).toEqual({ edited: null, changed: null });
  });

  test('the results carry where the recovery factor came from; nothing when none was taken', () => {
    const r0 = rec();
    const t = rcpRecoveryTarget(r0, 'oil');
    const intake = rcpRfIntake(r0, { projectId: 'rf-a', field: t.field, percent: t.percent, now: NOW });
    expect(rcpRfResultLines({ recovery: t.percent, rfIntake: intake })[0]).toContain(`Oil recovery factor from the Recovery Factor Estimator: ${R1()} percent, API (1967): water drive`);
    expect(rcpRfResultLines({ recovery: 30, rfIntake: intake })[1]).toMatch(/edited here after the intake/);
    expect(rcpRfResultLines({ recovery: 25 })).toEqual([]);
  });

  test('negative control: an id with nothing readable claims nothing and takes nothing', async () => {
    mockRcp.updateInputs.mockClear();
    mockRcp.state = { inputs: { fluidType: 'oil', recovery: 25 } };
    renderAt('/rcp?rfProject=someone-elses', clientOver(dbWith(rec())));
    expect(await screen.findByTestId('rcp-rf-intake', {}, { timeout: 10000 })).toHaveTextContent('not found, or it is not yours to read');
    expect(screen.queryByTestId('rcp-rf-intake-take')).toBeNull();
    expect(mockRcp.updateInputs).not.toHaveBeenCalled();
  });
});
