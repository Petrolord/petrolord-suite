/**
 * Design system rollout batch 5A: Facility Layout Mapper wraps itself in
 * <ThemedApp>. The shared helpers check the standard four (light by
 * default, toggle to dark and back stored per user, no legacy colour
 * outside data-canvas with a negative control, the route registered); the
 * extra cases open every sidebar section, pick a tool, switch the
 * placement tabs, open the save and load dialogs and the help drawer, and
 * confirm the map sits on the light canvas.
 *
 * Leaflet does not run in jsdom, so react-leaflet and the draw plugin are
 * replaced by plain containers, and the export libraries are stubbed; the
 * map's own drawing and the exports are not under test.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims } from '@/design/testing/themeAssertions';

jest.mock('react-leaflet', () => {
  const Pass = ({ children }) => <div data-testid="map-pass">{children}</div>;
  return {
    MapContainer: Pass,
    TileLayer: () => null,
    FeatureGroup: Pass,
    ScaleControl: () => null,
    useMap: () => ({ getContainer: () => ({ style: {} }), on() {}, off() {} }),
    useMapEvents: () => null,
  };
});
jest.mock('react-leaflet-draw', () => ({ EditControl: () => null }));
jest.mock('leaflet-polylinedecorator', () => ({}));
jest.mock('react-dom/server', () => ({ renderToStaticMarkup: () => '' }));
jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => ({}));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('dxf-writer', () => jest.fn());
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
  AuthContext: require('react').createContext(null),
}));
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      })),
    })),
  },
}));

import FacilityLayoutMapper from '@/pages/apps/FacilityLayoutMapper';

const TITLE = 'Layout Mapper';
const renderApp = () => render(<MemoryRouter><FacilityLayoutMapper /></MemoryRouter>);
const SECTIONS = ['Project', 'Equipment', 'Custom Icons', 'Precision Placement', 'Properties', 'Safety Spacing', 'Export'];

describeAppTheme({
  name: 'Facility Layout Mapper',
  route: '/dashboard/apps/facilities/facility-layout-mapper',
  renderApp,
  ready: () => screen.findByText(TITLE),
  scopeTestId: 'layoutmapper-theme-scope',
});

describe('Facility Layout Mapper themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the map sits on a light canvas', async () => {
    renderApp();
    await screen.findByText(TITLE);
    const map = screen.getAllByTestId('map-pass')[0];
    expect(map.closest('[data-canvas]')).toHaveAttribute('data-canvas', 'light');
  });

  it('every sidebar section leaves no legacy colour, with a tool picked', async () => {
    renderApp();
    await screen.findByText(TITLE);
    expectNoLegacyChrome();
    for (const section of SECTIONS) {
      fireEvent.click(screen.getByRole('button', { name: section }));
      await waitFor(() => expect(screen.getByRole('button', { name: section })).toHaveAttribute('data-state', 'open'));
      expectNoLegacyChrome();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Equipment' }));
    fireEvent.click(await screen.findByRole('button', { name: /Separator/ }));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: 'Precision Placement' }));
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Bearing/ }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Bearing/ })).toHaveAttribute('data-state', 'active'));
    expectNoLegacyChrome();
  }, 60000);

  it('the save and load dialogs carry the scope and stay clean', async () => {
    renderApp();
    await screen.findByText(TITLE);
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    fireEvent.click(await screen.findByRole('button', { name: /Save Project/ }));
    let dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Load Project/ }));
    dialog = await screen.findByRole('dialog');
    await screen.findByText('No saved projects found.');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the help drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findByText(TITLE);
    fireEvent.click(screen.getByTitle('Layout Mapper guide'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
