/**
 * Design system rollout W4A: Well Data Manager opts in to the Petrolord
 * theme. The page mounts the real workstation (on the in-memory backend in
 * place of the registry, so no Supabase is needed) and runs the shared four
 * checks: opens light, the ribbon toggle goes to dark and back and stores
 * the choice, no legacy console colour outside the data-canvas regions
 * (with a negative control), and the route is registered for the themed
 * cold-load loaders. Further states (an owned well with logs on every tab,
 * the editors, dark, and the dialogs) are checked below.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectNegativeControl, installDomShims, getScopeRoot,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import WellDataManager from '../WellDataManager';

// The page builds its backend through makeRegistryBackend; the test hands
// it an in-memory backend seeded with an owned well (logs, tops, checkshots)
// beside the seeded org-shared one.
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => mockBackend,
}));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'wells');
const lasFile = (name) => ({
  name: `${name}.las`,
  text: async () => fs.readFileSync(path.join(DATA_DIR, 'las', `${name}.las`), 'utf8'),
});

async function seedBackend() {
  const b = makeInMemoryBackend();
  const { meta, prep } = await b.parseLasFile(lasFile('basic_20'));
  const well = await b.saveWell({
    name: 'KETA G1-1', uwi: 'KETA-G1-BASIC', surfaceX: 501000, surfaceY: 6700200, kbM: 31.2, tdMdM: meta.suggestedHeader.tdMdM,
    checkshots: [{ tvdss_m: 276.8, twt_ms: 240, md_m: 304.8 }, { tvdss_m: 581.6, twt_ms: 440, md_m: 609.6 }],
  });
  await b.saveLogs(well.id, prep.logs);
  await b.saveTop(well.id, { name: 'Top Dome', mdM: 1502.5 });
  return b;
}

const ROUTE = '/dashboard/apps/geoscience/well-data-manager';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><WellDataManager /></MemoryRouter>);
const wellsListed = () => screen.findAllByTestId('wdm-well-row');

// jsdom has no 2D canvas; the map and the log tracks draw into a no-op
// context under test (their classes and data-canvas attributes are what the
// theme check reads).
const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});
beforeEach(async () => { mockBackend = await seedBackend(); });

describeAppTheme({
  name: 'Well Data Manager',
  route: ROUTE,
  renderApp,
  ready: wellsListed,
  scopeTestId: 'wdm-theme-scope',
});

describe('Well Data Manager themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openOwnWell = async () => {
    renderApp();
    const rows = await wellsListed();
    const own = rows.find((r) => r.textContent.includes('KETA G1-1'));
    fireEvent.click(own);
    await screen.findByTestId('wdm-detail');
    return getScopeRoot('wdm-theme-scope');
  };
  const tabButton = (name) => within(screen.getByTestId('wdm-detail')).getByRole('button', { name: new RegExp(`^${name}`) });

  test('the map view: ribbon, tree and status bar use roles; the well map is a dark canvas', async () => {
    renderApp();
    await wellsListed();
    expectNoLegacyChrome();
    expect(screen.getByTestId('wdm-map')).toHaveAttribute('data-canvas', 'dark');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  test('an owned well: every tab and editor reads on roles; the log tracks stay white chart paper', async () => {
    const scope = await openOwnWell();
    for (const tab of ['Header', 'Logs', 'Tops', 'Intervals', 'Core', 'Deviation', 'Checkshots']) {
      fireEvent.click(tabButton(tab));
      if (tab === 'Logs') {
        // eslint-disable-next-line no-await-in-loop
        const tracks = await screen.findByTestId('wdm-log-tracks');
        expect(tracks.closest('[data-canvas]')).toHaveAttribute('data-canvas', 'chart');
      }
      const edit = screen.queryByTestId(`wdm-edit-${tab.toLowerCase()}`);
      if (edit) {
        fireEvent.click(edit);
        // the grid editor only: the paste panel re-renders without end under
        // jsdom's synchronous act (a new fields array each render; reported
        // to the lead, unchanged here)
        expectNoLegacyChrome();
        fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
      }
      expectNoLegacyChrome();
    }
    expectNegativeControl(scope);
  });

  test('dark: the owned well reads in dark with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await openOwnWell();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    fireEvent.click(tabButton('Logs'));
    await screen.findByTestId('wdm-log-tracks');
    expectNoLegacyChrome();
  });

  test('the dialogs (LAS import, add well, package export and import, delete) open inside the scope with no legacy chrome', async () => {
    await openOwnWell();
    for (const id of ['wdm-open-las', 'wdm-open-manual', 'wdm-open-package', 'wdm-open-import']) {
      fireEvent.click(screen.getByTestId(id));
      // eslint-disable-next-line no-await-in-loop
      const dialog = await screen.findByRole('dialog');
      expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
      expectNoLegacyChrome();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    // delete opens from the well's context menu
    const own = screen.getAllByTestId('wdm-well-row').find((r) => r.textContent.includes('KETA G1-1'));
    fireEvent.contextMenu(own);
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    const alert = await screen.findByTestId('wdm-delete-dialog');
    expect(alert.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
  });
});
