import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RrvWorkstation from '../components/RrvWorkstation';
import { makeInMemoryProspectsBackend } from '../../ReservoirCalcPro/services/prospectsService';
import { valueProspect } from '@/utils/prospectValuation';
import { fromRcpProspect, engineInput } from '../services/rrvStore';

jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

beforeEach(() => localStorage.clear());

const seed = [{ name: 'North', pg_factors: {}, inputs: {}, risked: { pg: 0.3, success: { p90: 12, p50: 30, p10: 75 } } }];
const mount = () => render(<MemoryRouter><RrvWorkstation backend={makeInMemoryProspectsBackend(seed)} /></MemoryRouter>);

test('imports the RCP inventory and shows the engine EMV', async () => {
  mount();
  expect(screen.getByTestId('rrv-empty')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('rrv-import').disabled).toBe(false));
  fireEvent.click(screen.getByTestId('rrv-import'));
  // U2-002: an imported prospect starts on the economic model (derived MEFS and value line)
  const v = valueProspect(engineInput(fromRcpProspect({ id: 'x', ...seed[0] })));
  expect(screen.getByTestId('rrv-emv-North').textContent).toBe(v.emv.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  expect(screen.getByTestId('rrv-pc-North').textContent).toBe(`${(v.pc * 100).toFixed(1)}%`);
  expect(screen.getByTestId('rrv-readout')).toBeTruthy();
  fireEvent.click(screen.getByTestId('rrv-import'));
  expect(screen.getByTestId('rrv-status').textContent).toMatch(/already here/);
});

test('bad volumes are named, not valued', async () => {
  mount();
  fireEvent.click(screen.getByTestId('rrv-add'));
  fireEvent.change(screen.getByTestId('rrv-p10-Prospect 1'), { target: { value: '5' } });
  expect(screen.getByTestId('rrv-emv-Prospect 1').textContent).toMatch(/check inputs/);
  expect(screen.getByTestId('rrv-problem').textContent).toMatch(/P90 is the low case/);
});
