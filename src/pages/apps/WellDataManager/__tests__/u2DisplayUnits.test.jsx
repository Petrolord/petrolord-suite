/**
 * WDM-U2-001 (docs/upgrade/WellDataManager-UPGRADE.md): a display unit
 * system for depths. The registry stores metres; a feet user reads and
 * types feet on every tab.
 *
 * Validation: the international foot converts exactly (0.3048), a value
 * round-trips m -> ft -> m to the last bit or one ulp, and an editor saved
 * with untouched cells stores the SAME metres (negative control: re-deriving
 * from the rounded feet text moved a top by up to 0.0015 m).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';
import {
  toDisp, fromDisp, fmtDepth, editCell, parseDisplayed, readDisplayUnit, writeDisplayUnit, displayUnitKey,
} from '../engine/displayUnits';

jest.setTimeout(30000);

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
beforeEach(() => { window.localStorage.clear(); });

const ROUTE = '/dashboard/apps/geoscience/well-data-manager';
async function openWell(name, tab) {
  render(<MemoryRouter initialEntries={[ROUTE]}><WellDataManager /></MemoryRouter>);
  const rows = await screen.findAllByTestId('wdm-well-row');
  fireEvent.click(rows.find((r) => r.textContent.includes(name)));
  const detail = await screen.findByTestId('wdm-detail');
  if (tab) fireEvent.click(within(detail).getByRole('button', { name: new RegExp(`^${tab}`) }));
  return detail;
}

describe('conversion (validation)', () => {
  test('the international foot, exactly', () => {
    expect(toDisp(304.8, 'ft')).toBe(1000);
    expect(fromDisp(1000, 'ft')).toBe(304.8);
    expect(toDisp(2001.19, 'm')).toBe(2001.19);
  });
  test('m -> ft -> m round-trips within one ulp over the depth range', () => {
    let worst = 0;
    for (let m = 0.001; m < 12000; m = m * 1.37 + 0.013) {
      const back = fromDisp(toDisp(m, 'ft'), 'ft');
      worst = Math.max(worst, Math.abs(back - m) / (Number.EPSILON * Math.max(1, m)));
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
  test('an untouched cell keeps the stored metres bit for bit; an edited one converts', () => {
    const md = 2134.5678;
    const cell = editCell(md, 'ft', 2);
    expect(cell).toBe('7003.18');
    expect(parseDisplayed(cell, 'ft', md, 2)).toBe(md);
    // negative control: re-deriving from the rounded text moves the value
    expect(Number(cell) * 0.3048).not.toBe(md);
    expect(Math.abs(Number(cell) * 0.3048 - md)).toBeGreaterThan(1e-4);
    expect(parseDisplayed('7000', 'ft', md, 2)).toBe(2133.6);
    expect(Number.isNaN(parseDisplayed('abc', 'ft', md, 2))).toBe(true);
    expect(fmtDepth(null, 'ft')).toBe('n/a');
  });
  test('the choice is remembered per user and survives blocked storage', () => {
    writeDisplayUnit('u-1', 'ft');
    expect(window.localStorage.getItem(displayUnitKey('u-1'))).toBe('ft');
    expect(readDisplayUnit('u-1')).toBe('ft');
    expect(readDisplayUnit('u-2')).toBe('m');
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(readDisplayUnit('u-1', broken)).toBe('m');
    expect(writeDisplayUnit('u-1', 'ft', broken)).toBe(false);
  });
});

describe('the workstation in feet', () => {
  test('tops, header, survey and logs read feet; the tree TD too', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-g1-2026-07.json') });
    const detail = await openWell('LEGACY G1-7', 'Tops');
    expect(await screen.findByTestId('wdm-top-md-Top Reservoir')).toHaveTextContent('2134.5');
    fireEvent.change(screen.getByTestId('wdm-units'), { target: { value: 'ft' } });
    expect(screen.getByTestId('wdm-top-md-Top Reservoir')).toHaveTextContent((2134.5 / 0.3048).toFixed(1));
    expect(screen.getByText('MD (ft)')).toBeInTheDocument();
    expect(screen.getByText('TVDSS (ft)')).toBeInTheDocument();
    expect(screen.getByTestId('wdm-status-units')).toHaveTextContent('Depths in ft (stored in m)');
    fireEvent.click(within(detail).getByRole('button', { name: /^Header/ }));
    expect(screen.getByText('KB elevation (ft)')).toBeInTheDocument();
    expect(screen.getByText('TD (ft MD)')).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: /^Deviation/ }));
    expect(screen.getByText('MD (ft)')).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: /^Logs/ }));
    expect(await screen.findByText('Interval (ft MD)')).toBeInTheDocument();
    expect(screen.getAllByTestId('wdm-well-row')[0]).toHaveTextContent(/TD \d+ ft/);
    // Suite unit profile: the in-app choice is a view override for this
    // session, kept in sessionStorage; it no longer persists per device
    expect(JSON.parse(window.sessionStorage.getItem('petrolord.units.view.v1:well-data-manager'))).toEqual({ depth: 'ft' });
  });

  test('Save on the Tops grid in feet with nothing typed keeps every stored MD exactly', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-g1-2026-07.json') });
    const before = (await mockBackend.listTops('g1-well-1')).map((t) => t.md_m);
    writeDisplayUnit(null, 'ft');
    await openWell('LEGACY G1-7', 'Tops');
    fireEvent.click(await screen.findByTestId('wdm-edit-tops'));
    expect(screen.getByText('MD (ft)')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wdm-tops-save'));
    await waitFor(() => expect(screen.queryByTestId('wdm-tops-editor')).toBeNull());
    expect((await mockBackend.listTops('g1-well-1')).map((t) => t.md_m)).toEqual(before);
  });

  test('a TD typed in feet stores metres; switching the unit mid-edit converts the typed value', async () => {
    mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: savedRows('registry-pt-2026-09.json') });
    writeDisplayUnit(null, 'ft');
    await openWell('GULF SP-2', 'Header');
    fireEvent.click(await screen.findByTestId('wdm-edit-header'));
    expect(screen.getByTestId('wdm-header-td')).toHaveValue('10000');
    expect(screen.getByTestId('wdm-header-kb')).toHaveValue('100');
    fireEvent.change(screen.getByTestId('wdm-header-td'), { target: { value: '10500' } });
    fireEvent.change(screen.getByTestId('wdm-header-unit'), { target: { value: 'm' } });
    // PL3: the value converts with the unit, it is never relabelled
    expect(screen.getByTestId('wdm-header-td')).toHaveValue('3200.4');
    expect(screen.getByTestId('wdm-header-kb')).toHaveValue('30.48');
    fireEvent.click(screen.getByTestId('wdm-header-save'));
    await act(async () => {});
    await waitFor(async () => {
      const w = (await mockBackend.listWells()).find((x) => x.id === 'pt-well-1');
      expect(w.td_md_m).toBeCloseTo(3200.4, 9);
      expect(w.kb_m).toBe(30.48);
    });
  });
});
