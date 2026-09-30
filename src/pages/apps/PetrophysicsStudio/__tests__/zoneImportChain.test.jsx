/**
 * PETRO-U2-004 in the workstation: the Import mode reads a Techlog-style
 * zonation in feet (base column first), shows what it read and the skipped
 * row, and creates the zones through the same save path as typed zones;
 * the new zone's card shows the live summary.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

test('paste, preview, import: zones land in MD metres and summarise', async () => {
  const backend = makeInMemoryBackend();
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  const rows = await screen.findAllByTestId('petro-well-row');
  fireEvent.click(rows.find((r) => /KETA TYPE-1/.test(r.textContent)));
  await screen.findByTestId('petro-zone-net-SAND A', {}, { timeout: 10000 });
  fireEvent.click(screen.getByTestId('petro-zone-mode-import'));
  // 2030 m = 6660.1 ft; 2060 m = 6758.5 ft
  fireEvent.change(screen.getByTestId('petro-zone-import-text'), {
    target: { value: '# Techlog zonation\nZone,Bottom (ft),Top (ft)\nSAND X,6758.53,6660.10\nSAND A,6594.49,6561.68\n' },
  });
  expect(screen.getByTestId('petro-zone-import-summary').textContent).toMatch(/Read 1 zone, 1 row skipped; delimiter ,; depths in ft MD from the header/);
  expect(screen.getByTestId('petro-zone-import-skipped').textContent).toMatch(/SAND A: a zone with this name already exists/);
  fireEvent.click(screen.getByTestId('petro-zone-import-apply'));
  await screen.findByTestId('petro-zone-net-SAND X', {}, { timeout: 10000 });
  const z = (await backend.listZones((await backend.listWells()).find((w) => w.name === 'KETA TYPE-1').id)).find((x) => x.name === 'SAND X');
  expect(z.top_md_m).toBeCloseTo(6660.10 * 0.3048, 3);
  expect(z.base_md_m).toBeCloseTo(6758.53 * 0.3048, 3);
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/Created 1 zone from the pasted zonation/));
  expect(within(screen.getByTestId('petro-zones')).getByTestId('petro-zone-net-SAND X').textContent).not.toBe('');
}, 60000);
