/**
 * AppUpgrade Step 1 (docs/upgrade/WellDataManager-UPGRADE.md): the fixes
 * that live in the workstation UI, each with its negative control noted.
 *
 *  WDM-U1-006  deleting a log takes a second click (it deleted on the first)
 *  WDM-U1-010  the Tops tab reads MD, TVD and TVDSS side by side
 *  WDM-U1-011  surface X/Y labels carry the well's own unit (US survey feet
 *              for a state-plane well, never "m" by assumption)
 *  WDM-U1-005  a pasted "MD (ft)" tops header stores metres (at the door)
 *  WDM-U1-016  the map says which wells it cannot draw and when frames mix
 *  WDM-U1-014  depth tick labels never repeat
 * PL5 saved state: registry rows from the G1 (2026-07) and PT1 (2026-09)
 * releases open on every tab (e2e/fixtures/wdm/saved/).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';
import { mapFrameSummary } from '../components/WellsMap';
import { depthTickLabel } from '../components/LogTracks';

let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const SAVED = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'saved');
const savedRows = (f) => JSON.parse(fs.readFileSync(path.join(SAVED, f), 'utf8'));

const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});

const ROUTE = '/dashboard/apps/geoscience/well-data-manager';
async function openWell(name, tab) {
  render(<MemoryRouter initialEntries={[ROUTE]}><WellDataManager /></MemoryRouter>);
  const rows = await screen.findAllByTestId('wdm-well-row');
  fireEvent.click(rows.find((r) => r.textContent.includes(name)));
  const detail = await screen.findByTestId('wdm-detail');
  if (tab) fireEvent.click(within(detail).getByRole('button', { name: new RegExp(`^${tab}`) }));
  return detail;
}

describe('saved state from earlier releases (PL5)', () => {
  const TABS = ['Header', 'Logs', 'Tops', 'Intervals', 'Core', 'Deviation', 'Checkshots'];

  test('G1 (2026-07) rows open on every tab; legacy checkshots and TDEP depth read correctly', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-g1-2026-07.json') });
    const detail = await openWell('LEGACY G1-7');
    for (const t of TABS) {
      fireEvent.click(within(detail).getByRole('button', { name: new RegExp(`^${t}`) }));
      await act(async () => {});
    }
    fireEvent.click(within(detail).getByRole('button', { name: /^Checkshots/ }));
    expect(await screen.findByText(/legacy table, assumed TVDSS \/ TWT/)).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: /^Tops/ }));
    // TVD through the 3-station survey is shallower than MD in a deviated well
    const tvd = Number((await screen.findByTestId('wdm-top-tvd-Top Reservoir')).textContent);
    expect(tvd).toBeGreaterThan(1900);
    expect(tvd).toBeLessThan(2134.5);
    expect(Number(screen.getByTestId('wdm-top-tvdss-Top Reservoir').textContent)).toBeCloseTo(tvd - 24.99, 0);
    expect(screen.queryByTestId('wdm-tops-kb-note')).toBeNull();
    fireEvent.click(within(detail).getByRole('button', { name: /^Header/ }));
    // no xy_unit in G1 rows: metres, as that release stored them
    expect(screen.getByText(/Surface X \(m, CRS not assigned\)/)).toBeInTheDocument();
  });

  test('PT1 (2026-09) state-plane well: labels in US survey feet, checkshots as entered', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-pt-2026-09.json') });
    const detail = await openWell('GULF SP-2');
    expect(screen.getByText(/Surface X \(ftUS, EPSG:2274\)/)).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: /^Checkshots/ }));
    expect(await screen.findByText(/Entered as MD ft \/ one-way time/)).toBeInTheDocument();
    // vertical well: TVD = MD, TVDSS = MD - KB
    fireEvent.click(within(detail).getByRole('button', { name: /^Tops/ }));
    expect(Number((await screen.findByTestId('wdm-top-tvd-Top Frio')).textContent)).toBeCloseTo(1500, 1);
    expect(Number(screen.getByTestId('wdm-top-tvdss-Top Frio').textContent)).toBeCloseTo(1469.5, 1);
    expect(screen.queryByTestId('wdm-tops-kb-note')).toBeNull();
  });
});

describe('deleting a log takes a second click (WDM-U1-006)', () => {
  test('first click asks, Keep backs out, Delete removes', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-g1-2026-07.json') });
    const spy = jest.spyOn(mockBackend, 'deleteLog');
    await openWell('LEGACY G1-7', 'Logs');
    fireEvent.click(await screen.findByTestId('wdm-log-delete-GR'));
    // negative control (before the fix): this first click called deleteLog
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('wdm-log-confirm-GR')).toHaveTextContent('Delete GR and its samples?');
    fireEvent.click(within(screen.getByTestId('wdm-log-confirm-GR')).getByText('Keep'));
    expect(screen.queryByTestId('wdm-log-confirm-GR')).toBeNull();
    fireEvent.click(screen.getByTestId('wdm-log-delete-GR'));
    fireEvent.click(screen.getByTestId('wdm-log-delete-yes-GR'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect((await mockBackend.listLogs('g1-well-1')).map((l) => l.mnemonic)).toEqual(['TDEP']));
  });
});

describe('a pasted "MD (ft)" tops header stores metres (WDM-U1-005, at the door)', () => {
  test('Replace from paste reads the unit off the header', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-g1-2026-07.json') });
    await openWell('LEGACY G1-7', 'Tops');
    fireEvent.click(await screen.findByTestId('wdm-edit-tops'));
    fireEvent.click(screen.getByTestId('wdm-tops-paste-toggle'));
    fireEvent.change(await screen.findByTestId('wdm-tops-paste-text'), { target: { value: 'Surface\tMD (ft)\nTop Agbada\t6565.6' } });
    await waitFor(() => expect(screen.getByTestId('wdm-tops-mdunit')).toHaveValue('ft'));
    fireEvent.click(screen.getByTestId('wdm-tops-save'));
    await waitFor(async () => {
      const tops = await mockBackend.listTops('g1-well-1');
      expect(tops.map((t) => t.name)).toEqual(['Top Agbada']);
      expect(tops[0].md_m).toBeCloseTo(2001.19, 2);
    });
  });
});

describe('map caption and depth ticks', () => {
  test('undrawn wells are counted and mixed frames flagged (WDM-U1-016)', () => {
    const s = mapFrameSummary([
      { surface_x: 1, surface_y: 2, crs: 'EPSG:32631', xy_unit: 'm' },
      { surface_x: 3, surface_y: 4, crs: 'EPSG:2274', xy_unit: 'ftUS' },
      { surface_x: null, surface_y: null },
    ]);
    expect(s).toEqual({ frame: 'EPSG:32631, m; EPSG:2274, ftUS', mixed: true, undrawn: 1 });
    expect(mapFrameSummary([{ surface_x: 1, surface_y: 2, crs: 'EPSG:32631', xy_unit: 'm' }]).mixed).toBe(false);
  });
  test('a 7.5 m interval labels its ticks to 0.1 m (WDM-U1-014)', () => {
    const step = 7.47 / 8;
    const ticks = Array.from({ length: 9 }, (_, k) => 2000 + k * step);
    expect(new Set(ticks.map((d) => depthTickLabel(d, step))).size).toBe(9);
    // negative control: the old Math.round labels repeated
    expect(new Set(ticks.map((d) => String(Math.round(d)))).size).toBeLessThan(9);
    expect(depthTickLabel(2500, 50)).toBe('2500');
  });
});

describe('a well with no KB says why TVDSS equals TVD (WDM-U1-019)', () => {
  test('the note shows when KB is 0 and names the fix', async () => {
    const rows = savedRows('registry-pt-2026-09.json');
    rows.wells[0].kb_m = 0;
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: rows });
    await openWell('GULF SP-2', 'Tops');
    expect(await screen.findByTestId('wdm-tops-kb-note')).toHaveTextContent('KB is not set on this well (0 m), so TVDSS equals TVD.');
  });
});
