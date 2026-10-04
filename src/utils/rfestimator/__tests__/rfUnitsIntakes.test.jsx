// RF-U1-006, 008, 010: units pinned on known values, typing in SI keeps a
// decimal, the sample labelled, a version 1 project opens unchanged, the
// pvt-1 and in-place intakes read by id with "edited after" and
// "source changed since".
import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { rfUnits, displayInputString, storeInputString } from '@/utils/rfestimator/units';
import { migrateRfPayload, inputsFromPayload, sampleKeysInUse, sampleInputs } from '@/utils/rfestimator/model';
import { deriveRf } from '@/utils/rfestimator/workspace';
import { rfPvtIntake, rfPvtSourceText } from '@/utils/rfestimator/pvtIntake';
import { tableAt } from '@/utils/waterflooddesign/pvtIntake';
import { inPlaceFromMbal, inPlaceFromRcp, inPlaceSourceText } from '@/utils/rfestimator/inPlaceIntake';
import { inPlaceChangedSince } from '@/components/rfestimator/InPlaceIntakePanel';
import { buildMbalRecord } from '@/lib/mbalCaseSource';
import { SAVED_PROJECT_ROWS } from '@/pages/apps/ReservoirCalcPro/services/savedFixtures';
import { volumetricOptions } from '@/pages/apps/reservoir-balance/lib/rcpVolumetricIntake';
import { runSample, SAMPLE_CASE_IDS } from '@/pages/apps/reservoir-balance/lib/__tests__/mbalTestKit';
import RfField from '@/components/rfestimator/RfField';
import { goodOilContract, AT } from './rfTestKit';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

describe('units on the registry, one known value per conversion (RF-U1-008)', () => {
  const si = rfUnits('si');
  test.each([
    ['area', 1, 0.40468564224],
    ['length', 1, 0.3048],
    ['pressure', 1, 6.894757293168],
    ['oilVolume', 1, 0.158987294928],
    ['oilVolumeMM', 1, 0.158987294928],
    ['gasVolume', 1, 0.028316846592],
    ['gasVolumeB', 1, 0.028316846592],
    ['rockVolume', 1, 0.00123348183754752],
    ['resVolumeMM', 1, 0.158987294928],
    ['fvfOil', 1.3, 1.3],
    ['fvfGasCf', 0.005, 0.005],
  ])('%s: %d oilfield = %d SI', (kind, v, want) => {
    expect(si.show(kind, v)).toBeCloseTo(want, 9);
    expect(si.store(kind, want)).toBeCloseTo(v, 9);
  });
  test('labels', () => {
    expect([si.label('area'), si.label('pressure'), si.label('oilVolumeMM'), si.label('gasVolumeB')]).toEqual(['ha', 'kPa(a)', '10^6 sm3', '10^9 sm3']);
    expect(rfUnits('oilfield').label('fvfGasCf')).toBe('ft3/scf');
  });
  test('text in, text out: incomplete text is refused, never stored', () => {
    expect(storeInputString('pressure', '2.', 'si')).toBe(String(parseFloat((2 / 6.894757293168).toPrecision(12))));
    expect(storeInputString('pressure', '-', 'si')).toBeUndefined();
    expect(storeInputString('pressure', '', 'si')).toBe('');
    expect(storeInputString('area', '1200', 'oilfield')).toBe('1200');
    expect(displayInputString('area', '1200', 'si')).toBe('485.6228');
  });
});

describe('typing in SI keeps what is typed (PL11; the shared draft hook)', () => {
  const Harness = () => {
    const [v, setV] = useState('4200');
    return (<><RfField id="f" label="Initial pi" kind="pressure" u={rfUnits('si')} value={v} onChange={setV} /><output data-testid="stored">{v}</output></>);
  };
  test('"2." then "2.5" MPa-scale numbers keep their decimal point', () => {
    render(<Harness />);
    const box = screen.getByLabelText('Initial pi (kPa(a))');
    fireEvent.change(box, { target: { value: '2' } });
    fireEvent.change(box, { target: { value: '2.' } });
    expect(box).toHaveValue('2.');
    fireEvent.change(box, { target: { value: '2.5' } });
    expect(box).toHaveValue('2.5');
    expect(Number(screen.getByTestId('stored').textContent)).toBeCloseTo(2.5 / 6.894757293168, 9);
  });
});

describe('the sample is labelled; a version 1 project opens unchanged (RF-U1-006, 013)', () => {
  test('every value of a new case is a sample value until it is changed', () => {
    const s = sampleInputs();
    expect(sampleKeysInUse(s).size).toBe(Object.keys(s.vol).length + Object.keys(s.corr).length);
    const edited = { ...s, origin: 'sample-edited', vol: { ...s.vol, area: '900' } };
    expect(sampleKeysInUse(edited).has('vol.area')).toBe(false);
    expect(sampleKeysInUse(edited).has('vol.thickness')).toBe(true);
    expect(sampleKeysInUse({ ...s, origin: 'entered' }).size).toBe(0);
  });
  test('a version 1 API project keeps its inputs, says its estimate moved, claims no sample', () => {
    const v1 = { id: 'x', name: 'Old', schema: 1, inputs: { phase: 'oil', method: 'api_water_drive', driveCode: 'water_drive', inPlaceMode: 'volumetric', ooipDirect: '', vol: { area: '640' }, corr: { k: '200' } } };
    const p = migrateRfPayload(v1);
    expect(p.payloadVersion).toBe(2);
    expect(p.migratedFrom).toBe(1);
    expect(p.apiBasisNote).toMatch(/RF-U1-001/);
    const inputs = inputsFromPayload(p);
    expect(inputs.vol.area).toBe('640');
    expect(inputs.corr.k).toBe('200');
    expect(inputs.origin).toBe('entered');
    expect(migrateRfPayload({ ...v1, inputs: { ...v1.inputs, method: 'analog' } }).apiBasisNote).toBeNull();
  });
});

describe('pvt-1 by id (RF-U1-010)', () => {
  const c = goodOilContract();
  test('oil: pb, Bob, muob at saturation; Boi, muoi, muwi at pi; methods named', () => {
    const r = rfPvtIntake(c, { phase: 'oil', piPsia: 4200, paPsia: 1500, at: AT.toISOString() });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.patch.corr).sort()).toEqual(['bob', 'boi', 'muob', 'muoi', 'muwi', 'pb']);
    expect(r.patch.vol).toEqual({ boi: r.patch.corr.boi });
    expect(r.patch.corr.pb).toBe('2503');
    expect(r.intake.methods.bob).toMatch(/Good Oil Well No\. 4 PVT/);
    expect(rfPvtSourceText(r.intake, 'corr', 'bob', r.patch.corr.bob)).toMatch(/^Correlation/);
    expect(rfPvtSourceText(r.intake, 'corr', 'bob', '1.6')).toMatch(/^Edited in this app after the intake/);
  });
  test('a pressure above the table is not extrapolated; it is said', () => {
    const r = rfPvtIntake(c, { phase: 'oil', piPsia: 9000, paPsia: 1500 });
    expect(r.ok).toBe(true);
    expect(r.patch.corr.boi).toBeUndefined();
    expect(r.skipped.join(' ')).toMatch(/9000 psia is outside the table/);
  });
  test('gas: zi and Bgi at pi, za at pa; Bg converted RB/scf to ft3/scf by the registry', () => {
    const r = rfPvtIntake(c, { phase: 'gas', piPsia: 4000, paPsia: 800 });
    expect(Object.keys(r.patch.corr).sort()).toEqual(['za', 'zi']);
    // 1 RB = 5.614583 ft3: the ft3/scf value is the table's RB/scf times 5.6146 (4 significant figures kept)
    const bgRb = tableAt(c.table, 'Bg', 4000);
    expect(Number(r.patch.vol.bgi)).toBeCloseTo(bgRb * 5.614583333, 6);
    expect(Number(r.patch.corr.zi)).toBeCloseTo(tableAt(c.table, 'Z', 4000), 3);
  });
  test('the case flags PVT read at a pressure it no longer holds', () => {
    const r = rfPvtIntake(c, { phase: 'oil', piPsia: 4200, paPsia: 1500 });
    const inputs = { ...sampleInputs(), method: 'api_water_drive', corr: { ...sampleInputs().corr, ...r.patch.corr, pi: '4500' } };
    expect(deriveRf(inputs, { pvtIntake: r.intake }).flags.map((f) => f.text).join(' ')).toMatch(/read from the Fluid table at pi 4200 psia, and pi is now 4500 psia/);
    expect(deriveRf({ ...inputs, corr: { ...inputs.corr, pi: '4200' } }, { pvtIntake: r.intake }).flags.filter((f) => f.scope === 'intake')).toEqual([]);
  });
});

describe('in-place by id: mbal-1 and ReservoirCalc Pro (RF-U1-010)', () => {
  const a = runSample(SAMPLE_CASE_IDS.ahmed);
  const record = buildMbalRecord({ caseData: a.caseData, result: a.result, run: a.run, runConfig: a.runConfig }).record;
  test('the material balance OOIP, its method and run travel; a gas estimate refuses an oil case', () => {
    const got = inPlaceFromMbal(record, { phase: 'oil', now: AT.toISOString() });
    expect(got.ok).toBe(true);
    expect(got.value).toBe(a.result.estimated_ooip_stb);
    expect(got.intake).toMatchObject({ contract: 'mbal-1', recordId: SAMPLE_CASE_IDS.ahmed, quantity: 'OOIP', unit: 'STB', method: 'Havlena-Odeh regression, slope' });
    expect(inPlaceSourceText(got.intake, String(got.value))).toMatch(/^OOIP by material balance, Material Balance Studio case "Ahmed Example 11-3/);
    expect(inPlaceSourceText(got.intake, '1')).toMatch(/^Edited in this app after the intake/);
    expect(inPlaceFromMbal(record, { phase: 'gas' }).error).toMatch(/holds oil/);
  });
  test('source changed since: a newer run or another value is said; the same is quiet', () => {
    const got = inPlaceFromMbal(record, { phase: 'oil' });
    expect(inPlaceChangedSince(got.intake, { value: got.value, runId: got.intake.runId })).toBeNull();
    expect(inPlaceChangedSince(got.intake, { value: got.value * 1.1, runId: 'run-2' })).toMatch(/from a newer run/);
  });
  test('a ReservoirCalc Pro project: the deterministic STOIIP of the reservoir', () => {
    const row = SAVED_PROJECT_ROWS[0].row;
    const opt = volumetricOptions(row)[0];
    const got = inPlaceFromRcp(row, opt, { phase: 'oil' });
    expect(got.value).toBe(226275000);
    expect(got.intake.text).toMatch(/OOIP from ReservoirCalc Pro project "Aug single reservoir", reservoir "Main sand"/);
    expect(inPlaceFromRcp(row, opt, { phase: 'gas' }).error).toMatch(/no gas in place/);
  });
});
