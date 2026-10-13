/**
 * Selecting or clearing an area of interest, or a surface read again by
 * Refresh from source, left the previous deterministic volume on screen
 * until Recalculate was pressed (found scripting the ReservoirCalc Pro
 * lessons, 2026-10-12: an AOI over half the crest still showed the full
 * 12.14 MM stb). The auto-calculation now follows them.
 * Negative control: without the new dependencies the second and third
 * assertions fail.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockCalc = jest.fn();
let mockState;
jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({
    state: mockState, updateInputs: () => {}, setUnitSystem: () => {}, profileUnitSystem: 'field', setCalcMethod: () => {},
    setInputMethod: () => {}, setInputUnit: () => {}, calculate: mockCalc, sources: null,
  }),
}));
jest.mock('../components/RegistryPanel', () => () => null);
jest.mock('../components/AOIPanel', () => () => null);
jest.mock('../components/tools/SurfaceDataManager', () => () => null);
jest.mock('../components/tools/MapGenerationPanel', () => () => null);
jest.mock('../components/tools/FluidContactManager', () => () => null);
jest.mock('../components/SaturationHeightPanel', () => () => null);
jest.mock('../components/common/ReportDetails', () => () => null);
jest.mock('../components/EarthModelProspectNote', () => () => null);
jest.mock('../components/MbalCrossCheckNote', () => () => null);
jest.mock('../components/RfIntakeNote', () => () => null);
jest.mock('../components/RcpSourceNotice', () => () => null);
jest.mock('@/components/units/ProjectUnitSystemNote', () => () => null);

import ExpertInputPanel from '../components/ExpertInputPanel';

const base = { calcMethod: 'deterministic', unitSystem: 'field', inputMethod: 'surfaces', gridding: null, inputs: { fluidType: 'oil', area: 1, thickness: 1 }, aois: [], activeAoiId: null, surfaces: { s1: { id: 's1' } } };

test('an AOI selected, and a surface replaced, run the deterministic case again', () => {
  jest.useFakeTimers();
  mockState = base;
  const { rerender } = render(<MemoryRouter><ExpertInputPanel /></MemoryRouter>);
  act(() => { jest.advanceTimersByTime(600); });
  const n0 = mockCalc.mock.calls.length;
  expect(n0).toBeGreaterThan(0);
  mockState = { ...base, aois: [{ id: 'a1' }], activeAoiId: 'a1' };
  rerender(<MemoryRouter><ExpertInputPanel /></MemoryRouter>);
  act(() => { jest.advanceTimersByTime(600); });
  expect(mockCalc.mock.calls.length).toBe(n0 + 1);
  mockState = { ...mockState, surfaces: { s1: { id: 's1', refreshed: true } } };
  rerender(<MemoryRouter><ExpertInputPanel /></MemoryRouter>);
  act(() => { jest.advanceTimersByTime(600); });
  expect(mockCalc.mock.calls.length).toBe(n0 + 2);
  jest.useRealTimers();
});
