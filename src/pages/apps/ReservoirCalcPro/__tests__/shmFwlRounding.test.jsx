/**
 * The saturation-height result printed the free-water level unrounded
 * ("FWL -5046.399999979815 ft", the SCAL TVDSS metres converted back to
 * feet). It prints to 0.1 of the unit now (found scripting the ReservoirCalc
 * Pro lessons, 2026-10-12).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({
    state: { unitSystem: 'field', inputs: { swSource: 'shm', saturationHeight: { projectId: 'p', fwl: -5046.4 } }, results: { saturationHeight: { project: 'Ekene Sand J-function', fwlElevation: -5046.399999979815, swOil: 0.5341, unit: 'ft' } } },
    updateInputs: () => {}, backend: { scal: { listScalProjects: async () => [{ id: 'p', name: 'Ekene Sand J-function' }] } },
  }),
}));
import SaturationHeightPanel from '../components/SaturationHeightPanel';

test('the result prints the FWL to 0.1 ft', () => {
  render(<SaturationHeightPanel />);
  expect(screen.getByTestId('rcp-shm-result')).toHaveTextContent('Sw used: oil leg 0.534 (Ekene Sand J-function, FWL -5046.4 ft)');
});
