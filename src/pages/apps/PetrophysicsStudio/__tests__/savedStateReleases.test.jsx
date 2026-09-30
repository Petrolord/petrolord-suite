/**
 * AppUpgrade PETRO-U1, PL5: an interpretation saved by every earlier
 * release opens on this build. One fixture per release under
 * e2e/fixtures/petro/saved (G2.5 July single object, PS10 named with zone
 * overrides and a layout fork, pre-PT9a with the stale permeability none,
 * PT11 with every underscore extra, and a row from a NEWER build).
 * Each is stored the way the harness stores it (the in-memory backend
 * opens rows through the same state-version steps as the registry), the
 * real workstation mounts, the well opens and the zone card computes.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

const SAVED = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'petro', 'saved');
const PROJECT_KEY = 'petro.dev.project.v1';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => { window.sessionStorage.clear(); });

async function openWith(fixture) {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const keta = wells.find((w) => w.name === 'KETA TYPE-1');
  const sandA = (await backend.listZones(keta.id)).find((z) => z.name === 'SAND A');
  const text = fs.readFileSync(path.join(SAVED, fixture), 'utf8')
    .replaceAll('{{KETA}}', keta.id).replaceAll('{{SAND_A}}', sandA.id);
  window.sessionStorage.setItem(PROJECT_KEY, JSON.stringify([JSON.parse(text)]));
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  return { backend, keta, sandA };
}

const status = () => screen.getByTestId('petro-status').textContent;

async function openKeta() {
  fireEvent.click(await screen.findByText('KETA TYPE-1'));
  await waitFor(() => expect(status()).toMatch(/Loaded \d+ curves/));
  await waitFor(() => expect(screen.getByTestId('petro-zone-net-SAND A')).toBeInTheDocument());
  return parseFloat(screen.getByTestId('petro-zone-net-SAND A').textContent);
}

test('G2.5 (2026-07-14): the pre-PS3 single object opens; missing keys take today\'s defaults', async () => {
  await openWith('g25-2026-07-14.json');
  await waitFor(() => expect(status()).toMatch(/Restored saved project\./));
  expect(screen.getByTestId('petro-param-rw').value).toBe('0.06');
  expect(screen.getByTestId('petro-param-permMethod').value).toBe('timur');
  expect(screen.getByTestId('petro-param-phiShale').value).toBe('0.06');
  expect(await openKeta()).toBeGreaterThan(0);
  expect(screen.getByTestId('petro-zone-kgm-SAND A')).toBeInTheDocument();
});

test('PS10 (2026-09-02): named, Waxman-Smits with temperature, a zone override and a layout fork', async () => {
  await openWith('ps10-2026-09-02.json');
  await waitFor(() => expect(status()).toMatch(/Restored Keta shaly-sand case\./));
  expect(screen.getByTestId('petro-interp-name').textContent).toBe('Keta shaly-sand case');
  expect(screen.getByTestId('petro-param-swMethod').value).toBe('waxman-smits');
  expect(screen.getByTestId('petro-param-tempMode').value).toBe('linear');
  await openKeta();
  expect(screen.getByTestId('petro-zone-sw-SAND A').textContent).toMatch(/Sw \d\.\d{3}/);
  expect(screen.getByTestId('petro-tracks')).toBeInTheDocument();
});

test('pre-PT9a (2026-09-04): the stored permeability none migrates once and says so', async () => {
  await openWith('pt9a-pre-2026-09-04.json');
  await waitFor(() => expect(status()).toMatch(/Permeability model was off in this saved interpretation; Timur applied/));
  expect(screen.getByTestId('petro-param-permMethod').value).toBe('timur');
});

test('PT11 (2026-09-10): every extra restores; a deliberate temperature none stays none', async () => {
  await openWith('pt11-2026-09-10.json');
  await waitFor(() => expect(status()).toMatch(/Restored Keta PT11 review\./));
  expect(status()).not.toMatch(/model was off/);
  expect(screen.getByTestId('petro-param-tempMode').value).toBe('none');
  expect(screen.getByTestId('petro-param-rw-method').textContent).toMatch(/SP route/);
  expect(screen.getByTestId('petro-param-phiShale').value).toBe('0.07');
  await openKeta();
});

test('a row from a newer build is refused with the reload instruction, not half-read', async () => {
  await openWith('future-schema-v3.json');
  await waitFor(() => expect(status()).toMatch(/Reload the page to get the latest build/));
  expect(screen.getByTestId('petro-interp-name').textContent).toBe('Unsaved');
});
