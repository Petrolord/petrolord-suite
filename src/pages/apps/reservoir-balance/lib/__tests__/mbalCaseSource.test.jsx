/**
 * MBAL-U2-004: the sender out of Material Balance Studio (contract mbal-1,
 * src/lib/mbalCaseSource.js) and its first reader, ReservoirCalc Pro's
 * material balance cross-check (components/MbalCrossCheckNote.jsx).
 *
 * The record is built from a run of the canonical engine on the published
 * Ahmed Example 11-3 case and read back BY ID through a PostgREST stand-in
 * over the same rows, as ReservoirCalc Pro reads it.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  buildMbalRecord, readMbalCase, crossCheck, provenanceLines, MBAL_CONTRACT, STB_TO_M3, SCF_TO_M3,
} from '@/lib/mbalCaseSource';
import { runSample, SAMPLE_CASE_IDS } from './mbalTestKit';

const mockRcp = { state: null, updateInputs: jest.fn(), logEvent: jest.fn() };
jest.mock('@/pages/apps/ReservoirCalcPro/contexts/ReservoirCalcContext', () => ({ useReservoirCalc: () => mockRcp }));
import MbalCrossCheckNote from '@/pages/apps/ReservoirCalcPro/components/MbalCrossCheckNote';

/** A read-only PostgREST stand-in over a sample store. */
const clientOver = (db) => ({
  from: (table) => {
    const filters = [];
    let order = null;
    const rows = () => {
      let out = (db[table] || []).filter((r) => filters.every(([k, v]) => r[k] === v));
      if (order) out = [...out].sort((a, b) => ((a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1)));
      return out;
    };
    const q = {
      select: () => q, eq: (k, v) => { filters.push([k, v]); return q; },
      order: (k, o = {}) => { order = [k, o.ascending !== false]; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return q;
  },
});

const ahmed = runSample(SAMPLE_CASE_IDS.ahmed);

describe('the mbal-1 record', () => {
  test('carries the in-place volume with its method and run, the drive and the forecastable pressure', () => {
    const { record, error } = buildMbalRecord({ caseData: ahmed.caseData, result: ahmed.result, run: ahmed.run, runConfig: ahmed.runConfig });
    expect(error).toBeNull();
    expect(record.contract).toBe(MBAL_CONTRACT);
    expect(record.case).toMatchObject({ id: SAMPLE_CASE_IDS.ahmed, name: 'Ahmed Example 11-3 (depletion drive)', fluid_system: 'oil' });
    expect(record.in_place).toMatchObject({ quantity: 'OOIP', unit: 'STB', method: 'Havlena-Odeh regression, slope', points: 12 });
    expect(record.in_place.value).toBe(ahmed.result.estimated_ooip_stb);
    expect(record.drive.mechanism).toBe(ahmed.result.drive_mechanism);
    expect(record.drive.indices.ddi).toBe(ahmed.result.final_ddi);
    expect(record.pressure).toMatchObject({ initial_psia: 3685, last_psia: 3188, last_timestep: 12, basis: 'absolute, as entered (no datum correction)' });
    expect(record.pressure.series).toHaveLength(13);
    expect(record.run.validation_tier).toBe('benchmark_verified');
    expect(record.status).toBe('current');
  });

  test('refuses what a reader cannot rely on: no case, no run, no volume', () => {
    expect(buildMbalRecord({ caseData: null }).error).toMatch(/No Material Balance case/);
    expect(buildMbalRecord({ caseData: ahmed.caseData, result: null }).error).toMatch(/has no completed run/);
    expect(buildMbalRecord({ caseData: ahmed.caseData, result: { ...ahmed.result, estimated_ooip_stb: -5 } }).error).toMatch(/no usable in-place volume/);
    expect(buildMbalRecord({ caseData: ahmed.caseData, result: ahmed.result, stale: true }).record.status).toBe('earlier_run');
  });

  test('is read by id from the saved rows, the same record the studio builds', async () => {
    const { record } = await readMbalCase(clientOver(ahmed.db), SAMPLE_CASE_IDS.ahmed);
    const direct = buildMbalRecord({ caseData: ahmed.db.rb_cases.find((c) => c.id === SAMPLE_CASE_IDS.ahmed), result: ahmed.result, run: ahmed.run, runConfig: ahmed.runConfig });
    expect({ ...record, read_at: null }).toEqual({ ...direct.record, read_at: null });
    expect((await readMbalCase(clientOver(ahmed.db), 'no-such-case')).error).toMatch(/No Material Balance case/);
  });

  test('converts for a metric reader with known factors, and compares only like with like', () => {
    expect(STB_TO_M3).toBeCloseTo(0.158987294928, 12);
    expect(SCF_TO_M3).toBeCloseTo(0.028316846592, 12);
    const rec = { in_place: { value: 1e6, unit: 'STB' } };
    expect(crossCheck(rec, { value: 158987.294928, unitSystem: 'metric', fluid: 'oil' })).toMatchObject({ unit: 'sm3', sameFluid: true });
    expect(crossCheck(rec, { value: 158987.294928, unitSystem: 'metric', fluid: 'oil' }).differencePct).toBeCloseTo(0, 9);
    expect(crossCheck(rec, { value: 8e5, unitSystem: 'field', fluid: 'oil' }).differencePct).toBeCloseTo(25, 9);
    expect(crossCheck(rec, { value: 8e5, unitSystem: 'field', fluid: 'gas' }).differencePct).toBeNull();
  });
});

describe('ReservoirCalc Pro prints the cross-check, read by id', () => {
  const renderAt = (path, client) => render(<MemoryRouter initialEntries={[path]}><MbalCrossCheckNote client={client} /></MemoryRouter>);

  test('beside its deterministic STOIIP, with the source and the difference', async () => {
    mockRcp.state = { unitSystem: 'field', inputs: { fluidType: 'oil' }, results: { fluidType: 'oil', stooip: 270.6e6 } };
    renderAt(`/rcp?mbalCase=${SAMPLE_CASE_IDS.ahmed}`, clientOver(ahmed.db));
    const note = await screen.findByTestId('rcp-mbal-check');
    await waitFor(() => expect(note).toHaveTextContent('Material balance cross-check'));
    const ooip = ahmed.result.estimated_ooip_stb;
    const pct = Math.abs(((ooip - 270.6e6) / 270.6e6) * 100).toFixed(1);
    expect(screen.getByTestId('rcp-mbal-check-values')).toHaveTextContent(`OOIP by material balance ${(ooip / 1e6).toFixed(2)} MMSTB; this project's deterministic volumetric STOIIP 270.60 MMSTB; material balance ${ooip >= 270.6e6 ? 'above' : 'below'} it by ${pct} percent.`);
    expect(note).toHaveTextContent('from Material Balance Studio case "Ahmed Example 11-3 (depletion drive)"');
    expect(note).toHaveTextContent('Last average pressure 3,188 psia');
    expect(mockRcp.updateInputs).toHaveBeenCalledWith({ mbalCheck: expect.objectContaining({ contract: 'mbal-1', case_id: SAMPLE_CASE_IDS.ahmed, unit: 'STB' }) });
  });

  test('negative control: an id with no readable case says so and claims nothing', async () => {
    mockRcp.state = { unitSystem: 'field', inputs: { fluidType: 'oil' }, results: { fluidType: 'oil', stooip: 270.6e6 } };
    mockRcp.updateInputs.mockClear();
    renderAt('/rcp?mbalCase=someone-elses', clientOver(ahmed.db));
    expect(await screen.findByTestId('rcp-mbal-check')).toHaveTextContent('No Material Balance case was found under that id');
    expect(mockRcp.updateInputs).not.toHaveBeenCalled();
    expect(provenanceLines(buildMbalRecord({ caseData: ahmed.caseData, result: ahmed.result, run: ahmed.run }).record)[0]).toMatch(/^OOIP by material balance/);
  });
});
