/**
 * AppUpgrade PETRO-U1-012 (PL8/PL9): a batch run publishes each well's
 * zone summaries with its curves, so a reservoir engineer can pull a zone
 * averaged across the field into ReservoirCalc Pro in one pass; "All"
 * picks every owned well. Negative control (run 2026-09-28): on the
 * pre-fix runBatchWell the zone rows keep empty properties.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';
import { registryPatchForZone } from '@/pages/apps/ReservoirCalcPro/services/registryDoor';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

test('batch over every owned well publishes curves and zone summaries RCP can average', async () => {
  const backend = makeInMemoryBackend({ extraWells: 3 });
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  await screen.findAllByTestId('petro-well-row');
  fireEvent.click(screen.getByTestId('petro-batch'));
  fireEvent.click(await screen.findByTestId('petro-batch-all'));
  fireEvent.click(screen.getByTestId('petro-batch-run'));
  await waitFor(() => expect(screen.getByTestId('petro-batch-result-KETA COPY-03')).toHaveTextContent(/6 curves and 1 zone summary published/), { timeout: 20000 });
  // EMPTY-3 has no logs: its failure is reported, not swallowed
  expect(screen.getByTestId('petro-batch-result-EMPTY-3 (no logs)')).toHaveTextContent(/no depth curve/);

  const wells = (await backend.listWells()).filter((w) => w.is_own);
  const withZones = [];
  for (const w of wells) withZones.push({ ...w, zones: await backend.listZones(w.id) });
  const sandA = withZones.flatMap((w) => w.zones).filter((z) => z.name === 'SAND A');
  expect(sandA).toHaveLength(4); // KETA TYPE-1 + three copies
  for (const z of sandA) {
    expect(z.properties.net_m).toBeGreaterThan(0);
    expect(z.properties.sw_avg_weighting).toBe('pore-volume');
  }
  expect(registryPatchForZone(withZones, 'SAND A', 'metric').fromWells).toBe(4);
  // the three vertical copies are the same well: RCP's gross x NTG is their net pay
  const copies = withZones.filter((w) => w.name.startsWith('KETA COPY'));
  const f = registryPatchForZone(copies, 'SAND A', 'metric');
  expect(f.patch.thickness * f.patch.ntg).toBeCloseTo(copies[0].zones[0].properties.net_m, 9);
  // KETA TYPE-1 is deviated: it published its true vertical thickness too
  const keta = withZones.find((w) => w.name === 'KETA TYPE-1').zones.find((z) => z.name === 'SAND A').properties;
  expect(keta.gross_tvt_m).toBeLessThan(keta.gross_m);
}, 60000);

test('PETRO-M-008: under porosity source mineral with no mineral model, each well says why instead of publishing without porosity', async () => {
  const backend = makeInMemoryBackend({ extraWells: 1 });
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  await screen.findAllByTestId('petro-well-row');
  fireEvent.change(await screen.findByTestId('petro-param-phiSource'), { target: { value: 'mineral' } });
  fireEvent.click(screen.getByTestId('petro-params-apply'));
  fireEvent.click(screen.getByTestId('petro-batch'));
  fireEvent.click(await screen.findByTestId('petro-batch-all'));
  fireEvent.click(screen.getByTestId('petro-batch-run'));
  await waitFor(() => expect(screen.getByTestId('petro-batch-result-KETA COPY-01')).toHaveTextContent(/no mineral model is set/), { timeout: 20000 });
}, 60000);
