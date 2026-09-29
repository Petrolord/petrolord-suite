/**
 * WDM-U2-014 (the WDM half): the Header tab names a well's site datum
 * transformation, so the user sees which conversion the readers use. The
 * reader fixes themselves are tested in src/lib/crs/__tests__/datumOverrideReaders.test.js.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import WellDataManager from '../WellDataManager';

jest.setTimeout(30000);
let mockBackend = null;
jest.mock('../services/registryBackend', () => ({ makeRegistryBackend: () => mockBackend }));
const { makeInMemoryBackend } = jest.requireActual('../services/inMemoryBackend');

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true }));
});

const well = (id, name, dt) => ({
  id, name, user_id: 'user-dev', organization_id: null, surface_x: 286131.31, surface_y: 165839.51, kb_m: 30, td_md_m: 3000,
  crs: 'EPSG:26391', xy_unit: 'm', crs_provenance: dt ? { datum_transform: dt, source: 'well-design-studio' } : {}, deviation: [], checkshots: [],
  created_at: `2026-09-2${id.slice(-1)}T00:00:00.000Z`,
});

test('a site choice is named with its accuracy; an inapplicable code says the default applies; none shows nothing', async () => {
  mockBackend = makeInMemoryBackend({ seedSharedWell: false, seedRows: { wells: [well('w1', 'SITE-1', 'EPSG:1168'), well('w2', 'ODD-2', 'EPSG:9999'), well('w3', 'PLAIN-3', null)] } });
  render(<MemoryRouter><WellDataManager /></MemoryRouter>);
  const rows = await screen.findAllByTestId('wdm-well-row');
  fireEvent.click(rows.find((r) => r.dataset.wellName === 'SITE-1'));
  expect(await screen.findByTestId('wdm-header-datum-transform')).toHaveTextContent(/EPSG:1168, \d+(\.\d+)? m\), site choice/);
  fireEvent.click(screen.getAllByTestId('wdm-well-row').find((r) => r.dataset.wellName === 'ODD-2'));
  expect(await screen.findByTestId('wdm-header-datum-transform')).toHaveTextContent('EPSG:9999 (not published for EPSG:26391; the catalog default applies)');
  fireEvent.click(screen.getAllByTestId('wdm-well-row').find((r) => r.dataset.wellName === 'PLAIN-3'));
  await screen.findByText('PLAIN-3', { selector: '[data-testid=wdm-detail-name]' });
  expect(screen.queryByTestId('wdm-header-datum-transform')).toBeNull();
});
