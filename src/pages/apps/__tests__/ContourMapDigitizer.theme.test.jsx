/**
 * Design system rollout batch 4D: Contour Map Digitizer opts in to the
 * Petrolord theme. The digitizer hook is replaced by a fixed state (no
 * Supabase, no OpenCV) so the page renders its empty state and, with an
 * image loaded, the map view and the grid tab. The shared four checks run
 * on the empty page; below, the loaded map sits on a dark canvas that does
 * not follow the theme (the scanned image is drawn as it is), and the grid
 * tab and the side panel stay on roles.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import ContourMapDigitizer from '../ContourMapDigitizer';

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ user: null }),
}));

const baseState = {
  projectName: '',
  projects: [],
  controlPoints: [],
  layers: { contours: [], faults: [] },
  activeLayer: 'contours',
  drawMode: 'none',
  gridCellSize: 50,
  valuesAre: 'depth',
  zUnit: 'm',
  surfaceName: '',
  results: null,
  publishedSurface: null,
  pixelToWorld: null,
  imagePreview: null,
  imageDimensions: { width: 0, height: 0 },
  currentLine: [],
  imageFile: null,
};

let mockState = baseState;
jest.mock('@/hooks/useContourDigitizer', () => ({
  __esModule: true,
  default: () => ({
    state: mockState,
    setState: () => {},
    imgCanvasRef: { current: null },
    ovrCanvasRef: { current: null },
    handleFileUpload: () => {},
    handleGeoref: () => {},
    handleAutoTrace: () => {},
    handleManualDraw: () => {},
    handleDeleteLine: () => {},
    handleSetLineValue: () => {},
    handleGrid: () => {},
    handlePublishSurface: () => {},
    handleSaveProject: () => {},
    handleLoadProject: () => {},
    handleExport: () => {},
    isProcessing: false,
    status: '',
    isCvReady: true,
  }),
}));

window.scrollTo = () => {};
// jsdom has no 2D canvas
HTMLCanvasElement.prototype.getContext = () => ({
  clearRect() {}, save() {}, restore() {}, translate() {}, beginPath() {}, moveTo() {}, lineTo() {},
  stroke() {}, arc() {}, fill() {}, fillText() {}, setLineDash() {}, strokeRect() {}, drawImage() {},
});

const ROUTE = '/dashboard/apps/geoscience/contour-map-digitizer';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><ContourMapDigitizer /></MemoryRouter>);

describeAppTheme({
  name: 'Contour Map Digitizer',
  route: ROUTE,
  renderApp: () => { mockState = baseState; return renderApp(); },
  ready: () => screen.findByText('Upload Map to Get Started'),
  scopeTestId: 'cmd-theme-scope',
});

describe('Contour Map Digitizer themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const loaded = {
    ...baseState,
    imagePreview: 'data:image/png;base64,AAAA',
    imageDimensions: { width: 400, height: 300 },
    controlPoints: [{ pixel: [10, 10], world: [500000, 6000000] }],
    layers: { contours: [{ id: 'c1', value: -1200, points: [[0, 0], [5, 5]] }], faults: [] },
    pixelToWorld: {},
    results: {
      grid: [1], spec: { nx: 10, ny: 8, dx: 50, x0: 0, y0: 0 }, stats: { count: 70, min: -1300, max: -1100 },
      controlCount: 42, lines: 3, skipped: 0,
    },
  };

  it('the loaded map sits on a dark canvas, and the grid tab and side panel keep to roles', async () => {
    mockState = loaded;
    renderApp();
    expect(screen.getByTestId('digitizer-map-canvas')).toHaveAttribute('data-canvas', 'dark');
    expect(screen.getByTestId('digitizer-grid-summary')).toBeInTheDocument();
    expectNoLegacyChrome();
    const gridTab = screen.getByRole('tab', { name: /3D Grid/ });
    fireEvent.mouseDown(gridTab);
    fireEvent.click(gridTab);
    expect(await screen.findByTestId('digitizer-grid-tab')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('opens dark for a user who chose dark, with no legacy chrome', () => {
    mockState = loaded;
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderApp();
    expect(getScopeRoot('cmd-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });
});
