/**
 * RF-U2-008: the drive suggested by the drive indices of the Material Balance
 * case the in-place volume was taken from (mbal-1). A suggestion only: taking
 * the volume never changes the drive; the user picks. The record is built by
 * the shipped mbal-1 builder from the e2e fixture rows (Ahmed Example 11-3,
 * a run of the canonical engine: depletion drive, DDI 0.58, CDI 0.43).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { buildMbalRecord } from '@/lib/mbalCaseSource';
import { inPlaceFromMbal, driveSuggestion } from '../inPlaceIntake';
import { reviewerPayload, reportOf } from './rfTestKit';

jest.mock('@/utils/savedProjects', () => ({
  createSavedProjectsService: () => ({ list: async () => [], listRows: async () => [], load: async () => null, loadRow: async () => null, save: async () => ({ success: true }), remove: async () => ({}) }),
}));
// eslint-disable-next-line import/first
import { RfEstimatorProvider, useRfEstimator } from '@/contexts/RfEstimatorContext';

const rows = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'e2e', 'fixtures', 'recovery-factor', 'mbal-rows.json'), 'utf8'));
const record = buildMbalRecord({ caseData: rows.rb_cases[0], result: rows.rb_results[0], run: rows.rb_runs[0], runConfig: rows.rb_run_configs[0] }).record;
const intake = inPlaceFromMbal(record, { phase: 'oil', now: '2026-10-04T10:00:00Z' }).intake;

describe('drive suggested by Material Balance (RF-U2-008)', () => {
  test('a depletion-drive case suggests the solution-gas drive, with its indices', () => {
    expect(intake.drive).toBe('depletion_drive');
    expect(intake.driveIndices.ddi).toBeCloseTo(0.584, 3);
    const s = driveSuggestion(intake, 'oil', 'water_drive');
    expect(s).toMatchObject({ code: 'solution_gas', label: 'Solution-gas drive', agrees: false });
    expect(s.text).toMatch(/classifies the drive as depletion drive \(drive indices at the last step: DDI 0\.58, GDI 0\.00, CDI 0\.43, WDI -0\.00\)/);
    expect(driveSuggestion(intake, 'oil', 'solution_gas').agrees).toBe(true);
  });

  test('every oil and gas classification of the engine maps to a drive here, or says why not', () => {
    const at = (drive, phase) => driveSuggestion({ ...intake, drive }, phase, 'x');
    expect(at('water_drive_with_depletion', 'oil').code).toBe('combination');
    expect(at('water_drive_with_depletion', 'oil').text).toMatch(/partial water drive is two mechanisms/);
    expect(at('gas_cap_drive', 'oil').code).toBe('gas_cap');
    expect(at('strong_water_drive', 'oil').code).toBe('water_drive');
    expect(at('strong_water_drive', 'gas').code).toBe('gas_water_drive');
    expect(at('gas_expansion_drive', 'gas').code).toBe('gas_volumetric');
    expect(at('injection_pressure_maintenance', 'oil').code).toBeNull();
    expect(driveSuggestion({ ...intake, contract: 'rcp-saved-project' }, 'oil', 'x')).toBeNull();
  });

  test('negative control: taking the volume does not change the drive (suggestion only)', async () => {
    const wrapper = ({ children }) => <RfEstimatorProvider>{children}</RfEstimatorProvider>;
    const { result } = renderHook(() => useRfEstimator(), { wrapper });
    const before = result.current.inputs.driveCode;
    await act(async () => { result.current.takeInPlace(intake.value, intake); });
    expect(result.current.inputs.driveCode).toBe(before);
    expect(result.current.inputs.driveCode).not.toBe('solution_gas');
  });

  test('the report names the suggestion and whether the drive named follows it', () => {
    const p = reviewerPayload();
    p.inputs = { ...p.inputs, inPlaceMode: 'direct', ooipDirect: String(intake.value) };
    p.inPlaceIntake = intake;
    const row = reportOf(p).model.inPlaceBlock.find((x) => x[0] === 'Drive suggested by the source');
    expect(row[1]).toMatch(/nearest drive here is Solution-gas drive/);
    expect(row[1]).toMatch(/The drive named in this report is Water drive \(edge\/bottom\), chosen by the user\./);
  });
});
