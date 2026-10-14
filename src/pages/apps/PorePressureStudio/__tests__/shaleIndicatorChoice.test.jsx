/**
 * The shale indicator choice (2026-10-14): a well that carries a
 * Petrophysics VSH and the loaded GR lets the NCT view read either; the picks
 * and Pressures from shale samples follow the choice, which is saved with the
 * project. Harness backend with a GR log added (shale 110 API, sand 30 API on
 * the harness's sand beds), so the GR tells the same beds apart.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import PPWorkstation from '../components/PPWorkstation';
import { makeInMemoryBackend, VSH_HARNESS } from '../services/inMemoryBackend';
import { shaleLogOptions, chooseShaleOption, pickShaleLog } from '../services/shalePicks';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

function withGr() {
  const b = makeInMemoryBackend();
  const GR = { id: 'log-gr', mnemonic: 'GR', unit: 'GAPI', provenance: {} };
  const gr = Float64Array.from(VSH_HARNESS, (v) => (v > 0.5 ? 110 : 30));
  return {
    ...b,
    async listLogs(id) { const l = await b.listLogs(id); return l.length ? [...l, GR] : l; },
    async downloadCurve(log) { return log.id === 'log-gr' ? gr : b.downloadCurve(log); },
  };
}

async function openNct(backend) {
  render(<MemoryRouter><PPWorkstation backend={backend} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('pp-well-row', {}, { timeout: 15000 }));
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
  fireEvent.click(screen.getByTestId('pp-shale-pressures'));
  fireEvent.click(screen.getByTestId('pp-apply-params'));
  await waitFor(() => expect(screen.getByTestId('pp-notes').textContent).toMatch(/shale samples/));
  fireEvent.click(screen.getByTestId('pp-view-nct'));
}

test('options: VSH then GR; the project choice wins when the well has it', () => {
  const logs = [{ mnemonic: 'GR' }, { mnemonic: 'VSH' }, { mnemonic: 'DT' }];
  expect(shaleLogOptions(logs).map((o) => o.kind)).toEqual(['vsh', 'gr']);
  expect(chooseShaleOption(shaleLogOptions(logs), 'gr').kind).toBe('gr');
  expect(chooseShaleOption(shaleLogOptions([{ mnemonic: 'GR' }]), 'vsh').kind).toBe('gr');
  expect(pickShaleLog(logs).kind).toBe('vsh');
});

test('switching to GR moves the picks and the shale-sample pressures onto the GR', async () => {
  await openNct(withGr());
  const sel = await screen.findByTestId('pp-shale-indicator');
  expect(sel).toHaveValue('vsh');
  expect(within(sel).getAllByRole('option').map((o) => o.textContent)).toEqual(['VSH (shale volume)', 'GR (gamma ray)']);
  fireEvent.change(sel, { target: { value: 'gr' } });
  await waitFor(() => expect(screen.getByTestId('pp-status').textContent).toMatch(/now read GR; pick the shales again/));
  // the GR default cutoff (halfway between its P10 and P90), in API
  const cut = screen.getByTestId('pp-shale-cutoff').getAttribute('placeholder');
  expect(cut).toMatch(/^\d+$/);
  expect(screen.getByTestId('pp-nct-shale').textContent).toMatch(/API from/);
  fireEvent.click(screen.getByTestId('pp-view-prognosis'));
  await waitFor(() => expect(screen.getByTestId('pp-notes').textContent).toMatch(new RegExp(`shale samples \\(GR at or above ${cut} API\\)`)));
});

test('negative control: a well with one indicator shows no choice', async () => {
  await openNct(makeInMemoryBackend());
  await waitFor(() => expect(screen.getByTestId('pp-nct-shale').textContent).toMatch(/Shale picks on VSH at or above/));
  expect(screen.queryByTestId('pp-shale-indicator')).toBeNull();
});
