/**
 * The registry door averages a zone over the wells that belong to the
 * accumulation. A well whose sand sits below the contact publishes no net
 * pay; pooled in, it dilutes net-to-gross (Ekene: four wells gave NTG 0.198,
 * the two oil wells 0.395). Each carrying well now has a checkbox, a wet well
 * says so, and the audit trail records who was left out.
 * Negative control: with the checkboxes ignored (every well always used) the
 * two-well NTG assertion fails.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

const zone = (props) => [{ name: 'Ekene Sand', properties: props }];
const mockWells = [
  { id: 'w1', name: 'Ekene-1', zones: zone({ phi_avg: 0.198, sw_avg: 0.49, ntg: 27.5 / 105, net_m: 27.5 * 0.3048, gross_m: 105 * 0.3048 }) },
  { id: 'w2', name: 'Ekene-2', zones: zone({ ntg: 0, net_m: 0, gross_m: 118 * 0.3048 }) },
  { id: 'w3', name: 'Ekene-3', zones: zone({ phi_avg: 0.196, sw_avg: 0.46, ntg: 51.5 / 95, net_m: 51.5 * 0.3048, gross_m: 95 * 0.3048 }) },
];
const mockUpdateInputs = jest.fn();
const mockLogEvent = jest.fn();
const mockBackend = { wells: { listWellsWithTops: async () => mockWells } };
const mockState = { unitSystem: 'field', inputs: {} };
jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({
    state: mockState,
    backend: mockBackend,
    appPaths: {}, updateInputs: mockUpdateInputs, addAOI: () => {}, logEvent: mockLogEvent,
  }),
}));

import RegistryPanel from '../components/RegistryPanel';

const ntgOf = () => Number(/NTG ([0-9.]+)/.exec(screen.getByTestId('rcp-reg-preview').textContent)[1]);

test('a wet well can be left out of the zone average, and the audit trail says so', async () => {
  render(<MemoryRouter><RegistryPanel /></MemoryRouter>);
  const sel = await screen.findByTestId('rcp-reg-zone');
  await waitFor(() => expect(sel.querySelectorAll('option').length).toBeGreaterThan(1));
  fireEvent.change(sel, { target: { value: 'Ekene Sand' } });
  const all = ntgOf();
  expect(all).toBeCloseTo((27.5 + 51.5) / (105 + 118 + 95), 2);
  expect(screen.getByTestId('rcp-reg-nopay-Ekene-2')).toHaveTextContent('no net pay');
  expect(screen.queryByTestId('rcp-reg-nopay-Ekene-1')).toBeNull();
  fireEvent.click(screen.getByTestId('rcp-reg-use-Ekene-2'));
  expect(ntgOf()).toBeCloseTo((27.5 + 51.5) / (105 + 95), 2);
  expect(screen.getByTestId('rcp-reg-preview')).toHaveTextContent(/from Ekene-1, Ekene-3$/);
  fireEvent.click(screen.getByTestId('rcp-reg-apply-zone'));
  expect(mockUpdateInputs).toHaveBeenCalledWith(expect.objectContaining({
    ntg: expect.closeTo(79 / 200, 3),
    registryProvenance: expect.objectContaining({ zone: expect.objectContaining({ left_out: ['Ekene-2'] }) }),
  }));
  expect(mockLogEvent).toHaveBeenCalledWith('Registry inputs applied', expect.stringMatching(/left out Ekene-2/));
});

test('leaving every well out is refused, and a new zone starts with every well in', async () => {
  render(<MemoryRouter><RegistryPanel /></MemoryRouter>);
  const sel = await screen.findByTestId('rcp-reg-zone');
  await waitFor(() => expect(sel.querySelectorAll('option').length).toBeGreaterThan(1));
  fireEvent.change(sel, { target: { value: 'Ekene Sand' } });
  for (const w of ['Ekene-1', 'Ekene-2', 'Ekene-3']) fireEvent.click(screen.getByTestId(`rcp-reg-use-${w}`));
  expect(screen.getByText('Include at least one well in the average.')).toBeInTheDocument();
  expect(screen.getByTestId('rcp-reg-apply-zone')).toBeDisabled();
});
