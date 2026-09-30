/**
 * WDM-U2-008: what Petrophysics Studio wrote is visible in Well Data
 * Manager. Zones (geo_wells_zones) get a read-only tab with the published
 * summary; computed and digitized curves carry a badge naming the app,
 * the operation and the interpretation. Negative control: before, the Logs
 * table showed PHIE exactly like a measured GR and zones were not shown.
 * The published summary is built with the real Petrophysics snapshot
 * function, so a change of its shape fails here.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { zonePropertiesSnapshot } from '../../../../../packages/engines/engines/petrophysics/pipeline';
import { curveOrigin } from '../engine/provenance';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

const log = (id, mnemonic, provenance = {}) => ({ id, mnemonic, unit: '', start_md_m: 1500, stop_md_m: 1600, step_m: 0.5, n_samples: 201, null_count: 0, storage_path: `p/${id}`, provenance, source_file: provenance.computed ? null : 'run1.las' });
const published = zonePropertiesSnapshot(
  { gross_m: 30.48, net_m: 15.24, ntg: 0.5, phi_avg: 0.2213, vsh_avg: 0.1402, sw_avg: 0.3551, k_gm_md: 125.4 },
  { cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6, vshMethod: 'linear', phiSource: 'nd', phiShale: 0.1, swMethod: 'archie', permMethod: 'timur' },
  { projectId: 'p1', interpretationName: 'Base case', publishedAt: '2026-09-20T10:00:00.000Z' },
);
const SEED = {
  wells: [{ id: 'w1', name: 'ZONE-1', user_id: 'user-dev', organization_id: null, surface_x: 1, surface_y: 2, kb_m: 25, td_md_m: 1700, crs: 'EPSG:32631', deviation: [], checkshots: [], created_at: '2026-09-01T00:00:00.000Z' }],
  tops: { w1: [{ id: 't1', name: 'Top A', md_m: 1510 }, { id: 't2', name: 'Top B', md_m: 1540.48 }] },
  logs: { w1: [
    log('l1', 'DEPT'), log('l2', 'GR'),
    log('l3', 'PHIE', { computed: true, engine: 'petrophysics-studio', pipeline_version: '3.1', project_id: 'p1', interpretation_name: 'Base case', input_log_ids: ['l1', 'l2'] }),
    log('l4', 'MM_FLAG', { computed: true, engine: 'petrophysics-studio', operation: 'mineral-model', interpretation_name: 'Base case' }),
    log('l5', 'GR_DIG', { digitized: true }),
  ] },
  zones: { w1: [
    { id: 'z2', name: 'Lower', top_md_m: 1540.48, base_md_m: 1600, properties: { from_tops: { top: 't2', base: null } } },
    { id: 'z1', name: 'Upper', top_md_m: 1510, base_md_m: 1540.48, properties: { ...published, from_tops: { top: 't1', base: 't2' } } },
  ] },
};

test('curveOrigin names the app, the operation and the interpretation; a measured log has none', () => {
  expect(curveOrigin(SEED.logs.w1[1])).toBeNull();
  // pipeline 3.1 predates PT9a, so the PHIE row carries the U2-013 flag
  expect(curveOrigin(SEED.logs.w1[2]).title).toBe('Computed by Petrophysics Studio (interpretation), interpretation "Base case", pipeline 3.1, from 2 input curves. Published before 2026-09-07 (Petrophysics Studio pipeline below 5): this PHIE is total porosity. The well owner can republish it from Petrophysics Studio.');
  expect(curveOrigin(SEED.logs.w1[3]).title).toMatch(/^Computed by Petrophysics Studio \(mineral model\)/);
  expect(curveOrigin(SEED.logs.w1[4])).toMatchObject({ kind: 'digitized', label: 'digitized' });
});

test('Logs carry the badges; the Zones tab shows the published summary in the display unit', async () => {
  window.localStorage.setItem('petrolord.wdm.displayUnit.v1:anon', 'ft');
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: JSON.parse(JSON.stringify(SEED)) });
  render(<MemoryRouter><WellDataManager /></MemoryRouter>);
  fireEvent.click((await screen.findAllByTestId('wdm-well-row'))[0]);
  const detail = await screen.findByTestId('wdm-detail');
  fireEvent.click(within(detail).getByRole('button', { name: /^Logs/ }));
  await screen.findByTestId('wdm-logs-table');
  expect(screen.getByTestId('wdm-log-origin-PHIE')).toHaveTextContent('computed');
  expect(screen.getByTestId('wdm-log-origin-GR_DIG')).toHaveTextContent('digitized');
  expect(screen.queryByTestId('wdm-log-origin-GR')).toBeNull();

  fireEvent.click(within(detail).getByRole('button', { name: /^Zones \(2\)/ }));
  const rows = await screen.findAllByTestId('wdm-zone-row');
  expect(rows.map((r) => r.dataset.zone)).toEqual(['Upper', 'Lower']);
  const upper = rows[0].textContent;
  expect(upper).toContain('4954.1');  // top 1510 m in ft
  expect(upper).toContain('100.00');  // gross 30.48 m = 100 ft
  expect(upper).toContain('50.00');   // net
  expect(upper).toContain('0.221');   // PHIE avg
  expect(upper).toContain('125.4');   // k
  expect(screen.getByTestId('wdm-zone-published-Upper')).toHaveTextContent('2026-09-20, Base case');
  expect(screen.getByTestId('wdm-zone-published-Lower')).toHaveTextContent('not published');
  expect(within(rows[1]).getAllByText('n/a').length).toBeGreaterThan(3);
  expect(within(rows[0]).getByText('Upper').getAttribute('title')).toBe('Cut from Top A to Top B');
  expect(screen.getByTestId('wdm-zones-open-petro').getAttribute('href')).toBe('/dashboard/apps/geoscience/petrophysics-studio?well=w1');
  expect(screen.queryByTestId('wdm-edit-zones')).toBeNull();
});
