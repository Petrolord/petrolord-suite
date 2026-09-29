/**
 * WDM-U2-F01 (decision 2026-09-29, no migration): live geo_wells.surface_x
 * and surface_y are NOT NULL. The Header editor refuses a blank or
 * non-numeric X/Y (Save disabled, inline reason naming the field and the
 * CRS unit), the registry refuses before any request, and the harness
 * backend refuses like live. Negative control: before, a blank X was sent
 * as null (harness stored it; live returned the raw not-null error).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);
const mockRequests = [];
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (t) => { mockRequests.push(t); throw new Error('no request expected'); },
    auth: { getUser: async () => { mockRequests.push('auth'); return { data: { user: { id: 'u' } } }; } },
  },
}));
const reg = jest.requireActual('@/lib/wellsRegistry');
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');
const SAVED = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wdm', 'saved');

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

test('the live registry refuses a missing coordinate before any request', async () => {
  mockRequests.length = 0;
  await expect(reg.updateWellData('w1', { surfaceX: null })).rejects.toThrow('Surface X is required: the registry stores a surface location for every well.');
  await expect(reg.updateWellData('w1', { surfaceY: 'abc' })).rejects.toThrow(/Surface Y must be a number/);
  await expect(reg.updateWell('w1', { surface_x: null })).rejects.toThrow(/Surface X is required/);
  await expect(reg.saveWell({ name: 'N', surfaceX: 1 })).rejects.toThrow(/Surface Y is required/);
  expect(mockRequests).toEqual([]);
});

test('the harness refuses like live', async () => {
  const b = makeInMemoryBackend({ seedSharedWell: false });
  await expect(b.saveWell({ name: 'N', surfaceX: '', surfaceY: 2 })).rejects.toThrow(/Surface X is required/);
  const w = await b.saveWell({ name: 'N', surfaceX: 1, surfaceY: 2 });
  await expect(b.updateWellData(w.id, { surfaceX: null })).rejects.toThrow(/Surface X is required/);
  await expect(b.updateWell(w.id, { surface_y: null })).rejects.toThrow(/Surface Y is required/);
  expect((await b.listWells())[0].surface_x).toBe(1);
});

test('the Header editor disables Save with the reason, field and CRS unit', async () => {
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: JSON.parse(fs.readFileSync(path.join(SAVED, 'registry-pt-2026-09.json'), 'utf8')) });
  const spy = jest.spyOn(mockBackend, 'updateWellData');
  render(<MemoryRouter><WellDataManager /></MemoryRouter>);
  fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
  const detail = await screen.findByTestId('wdm-detail');
  fireEvent.click(within(detail).getByRole('button', { name: /^Header/ }));
  fireEvent.click(await screen.findByTestId('wdm-edit-header'));
  expect(screen.getByTestId('wdm-header-save')).not.toBeDisabled();
  fireEvent.change(screen.getByTestId('wdm-header-x'), { target: { value: '' } });
  expect(screen.getByTestId('wdm-header-save')).toBeDisabled();
  expect(screen.getByTestId('wdm-header-reason')).toHaveTextContent('Surface X is required (ftUS, EPSG:2274): the registry stores a surface location for every well.');
  fireEvent.click(screen.getByTestId('wdm-header-save'));
  fireEvent.change(screen.getByTestId('wdm-header-x'), { target: { value: '12a' } });
  expect(screen.getByTestId('wdm-header-reason')).toHaveTextContent('Surface X must be a number');
  expect(spy).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId('wdm-header-x'), { target: { value: '1968600' } });
  expect(screen.queryByTestId('wdm-header-reason')).toBeNull();
  expect(screen.getByTestId('wdm-header-save')).not.toBeDisabled();
});
