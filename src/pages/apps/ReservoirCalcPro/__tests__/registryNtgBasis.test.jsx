/**
 * Registry zone averages in a structural run (2026-10-12, found scripting
 * the ReservoirCalc Pro videos). Surfaces and Hybrid cut the rock at the
 * contact; the zone's net pay already stops at the contact (its Sw cutoff
 * removes the water leg), so NTG as net pay over gross applied the contact
 * twice. On the Ekene demo account's published zones the oil wells' pay
 * NTG is 0.4525 where the sand is 0.948 net reservoir, and the booked
 * volume came out at less than half. Structural runs now take NTG as net
 * reservoir over gross from every well (a wet well's sand included);
 * porosity and Sw still come from the wells with pay.
 * Negative control: the 'pay' basis (the old behaviour) gives 0.4525.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { registryPatchForZone, isStructuralMethod } from '../services/registryDoor';

// The demo account's Ekene Sand zone summaries (metres), as published
const mockZ = (p) => [{ id: `z-${Math.random()}`, name: 'Ekene Sand', properties: p }];
const mockEkene = [
  { id: 'w1', name: 'Ekene-1', zones: mockZ({ gross_m: 32.004, gross_tvt_m: 32.004, net_m: 11.887, net_tvt_m: 11.887, net_res_m: 30.328, net_res_tvt_m: 30.328, ntg: 0.3714, phi_avg: 0.1843, sw_avg: 0.4118 }) },
  { id: 'w2', name: 'Ekene-2', zones: mockZ({ gross_m: 35.966, gross_tvt_m: 35.966, net_m: 0, net_tvt_m: 0, net_res_m: 33.528, net_res_tvt_m: 33.528, ntg: 0, phi_avg: null, sw_avg: null }) },
  { id: 'w3', name: 'Ekene-3', zones: mockZ({ gross_m: 28.956, gross_tvt_m: 28.956, net_m: 15.697, net_tvt_m: 15.697, net_res_m: 27.737, net_res_tvt_m: 27.737, ntg: 0.5421, phi_avg: 0.1958, sw_avg: 0.4639 }) },
  { id: 'w4', name: 'Ekene-4', zones: mockZ({ gross_m: 24.994, gross_tvt_m: 24.994, net_m: 0, net_tvt_m: 0, net_res_m: 23.927, net_res_tvt_m: 23.927, ntg: 0, phi_avg: null, sw_avg: null }) },
];
const oilWells = mockEkene.filter((w) => ['Ekene-1', 'Ekene-3'].includes(w.name));

test('structural methods take NTG as net reservoir over gross; Simple and Area-depth keep net pay', () => {
  expect(isStructuralMethod('surfaces')).toBe(true);
  expect(isStructuralMethod('hybrid')).toBe(true);
  expect(isStructuralMethod('simple')).toBe(false);
  const s = registryPatchForZone(mockEkene, 'Ekene Sand', 'field', { inputMethod: 'surfaces' });
  expect(s.ntgBasis).toBe('net reservoir');
  expect(s.patch.ntg).toBeCloseTo((30.328 + 33.528 + 27.737 + 23.927) / (32.004 + 35.966 + 28.956 + 24.994), 4);
  expect(s.provenance.ntg_basis).toBe('net reservoir');
  // porosity and Sw are the pay averages of the wells with pay, whichever basis
  const pay = registryPatchForZone(oilWells, 'Ekene Sand', 'field', { inputMethod: 'simple' });
  expect(s.patch.porosity).toBeCloseTo(pay.patch.porosity, 10);
  expect(s.patch.sw).toBeCloseTo(pay.patch.sw, 10);
  // negative control: the old basis, net pay over gross, already cut at the contact
  expect(pay.ntgBasis).toBe('net pay');
  expect(pay.patch.ntg).toBeCloseTo((11.887 + 15.697) / (32.004 + 28.956), 4);
  expect(registryPatchForZone(mockEkene, 'Ekene Sand', 'field').patch.ntg).toBeCloseTo((11.887 + 15.697) / 121.92, 3);
});

test('a zone published without net reservoir falls back to net pay and says so', () => {
  const old = mockEkene.map((w) => ({ ...w, zones: w.zones.map((zz) => ({ ...zz, properties: { ...zz.properties, net_res_m: undefined, net_res_tvt_m: undefined } })) }));
  const r = registryPatchForZone(old, 'Ekene Sand', 'field', { inputMethod: 'hybrid' });
  expect(r.ntgBasis).toBe('net pay');
  expect(r.notes.join(' ')).toMatch(/no net reservoir thickness/);
});

const mockState = { unitSystem: 'field', inputMethod: 'surfaces', inputs: {} };
const mockUpdate = jest.fn();
jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({
    state: mockState, backend: { wells: { listWellsWithTops: async () => mockEkene } },
    appPaths: {}, updateInputs: mockUpdate, addAOI: () => {}, logEvent: () => {},
  }),
}));
import RegistryPanel from '../components/RegistryPanel';

test('the Wells tab in a Surfaces run previews and applies the net-reservoir NTG and says why', async () => {
  render(<MemoryRouter><RegistryPanel /></MemoryRouter>);
  const sel = await screen.findByTestId('rcp-reg-zone');
  await waitFor(() => expect(sel.querySelectorAll('option').length).toBeGreaterThan(1));
  fireEvent.change(sel, { target: { value: 'Ekene Sand' } });
  expect(screen.getByTestId('rcp-reg-preview')).toHaveTextContent(/NTG 0\.948 \(net reservoir\)/);
  expect(screen.getByTestId('rcp-reg-ntg-basis')).toHaveTextContent(/count the contact twice/);
  fireEvent.click(screen.getByTestId('rcp-reg-apply-zone'));
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ ntg: expect.closeTo(0.9475, 3) }));
});
