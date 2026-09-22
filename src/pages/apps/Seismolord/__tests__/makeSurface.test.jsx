/**
 * Make surface from a horizon (tester group 6): no export and
 * re-import. The service grids with the fault-aware gridder and saves
 * straight to the surface registry with the Export dialog's provenance;
 * the dialog opens with the horizon preselected and offers Grid in
 * Seismolord (also shows the surface) and Publish to the registry
 * (links to Mapping & Surface Studio); the explorer's horizon menu and
 * section icons open the right doors.
 */
import React from 'react';
import {
  render, screen, fireEvent, waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MakeSurfaceDialog from '@/pages/apps/Seismolord/components/workspace/dialogs/MakeSurfaceDialog';
import SeismicExplorer from '@/pages/apps/Seismolord/components/workspace/SeismicExplorer';
import { makeSurfaceFromHorizon, MAPPING_STUDIO_PATH } from '@/pages/apps/Seismolord/services/makeSurface';
import { gridHorizonSurface } from '@/pages/apps/Seismolord/services/surfaceWorkflow';
import { saveHorizonAsSurface } from '@/pages/apps/Seismolord/services/surfacesService';
import { listFaults } from '@/pages/apps/Seismolord/services/faultsService';

jest.mock('@/pages/apps/Seismolord/services/surfaceWorkflow', () => ({
  gridHorizonSurface: jest.fn(),
}));
jest.mock('@/pages/apps/Seismolord/services/surfacesService', () => ({
  ...jest.requireActual('@/pages/apps/Seismolord/services/surfacesService'),
  saveHorizonAsSurface: jest.fn(),
}));
jest.mock('@/pages/apps/Seismolord/services/faultsService', () => ({
  listFaults: jest.fn(async () => []),
}));

if (typeof global.DOMRect === 'undefined') {
  global.DOMRect = class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      Object.assign(this, { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height });
    }
  };
}
if (typeof global.DOMRect.fromRect !== 'function') {
  global.DOMRect.fromRect = (r = {}) => new global.DOMRect(r.x || 0, r.y || 0, r.width || 0, r.height || 0);
}

const MANIFEST = {
  geometry: {
    il: { min: 1000, step: 2, count: 6 },
    xl: { min: 2000, step: 1, count: 8 },
    ns: 500,
    dt_us: 4000,
    affine: {
      origin: { x: 456000, y: 6780000 },
      il_vec: { x: 0, y: 25 },
      xl_vec: { x: 12.5, y: 0 },
    },
  },
  brick: { size: 16, grid: [1, 1, 32] },
};
const VOLUME = { id: 'v1', name: 'Fixture survey' };
const HORIZONS = [
  { id: 'h1', name: 'Top Reservoir' },
  { id: 'h2', name: 'Base Reservoir' },
];
const FAULTS = [{ id: 'f1', name: 'Fault_A', sticks: [] }];

beforeEach(() => {
  gridHorizonSurface.mockReset();
  saveHorizonAsSurface.mockReset();
  listFaults.mockReset();
  listFaults.mockResolvedValue(FAULTS);
  gridHorizonSurface.mockResolvedValue({
    g: { z: new Float32Array(4) },
    spec: { x0: 0, y0: 0, dx: 12.5, dy: 12.5, nx: 2, ny: 2 },
    gridded: { live: 4, controlCount: 12, zMin: -1520, zMax: -1500 },
    faultInfo: { blocks: 2, traces: ['Fault_A'] },
    maxExtrapolationM: 25,
  });
  saveHorizonAsSurface.mockImplementation(async ({ horizon, domain }) => ({
    id: 's1', name: `${horizon.name} (${domain === 'depth' ? 'depth ft' : 'TWT ms'})`,
  }));
});

describe('makeSurfaceFromHorizon', () => {
  test('grids and saves straight to the registry with the export provenance', async () => {
    const out = await makeSurfaceFromHorizon({
      volume: VOLUME, manifest: MANIFEST, horizon: HORIZONS[1], domain: 'twt', faults: FAULTS,
    });
    expect(gridHorizonSurface).toHaveBeenCalledWith(expect.objectContaining({
      manifest: MANIFEST, horizon: HORIZONS[1], domain: 'twt', faults: FAULTS, cellM: 0,
    }));
    const saved = saveHorizonAsSurface.mock.calls[0][0];
    expect(saved.volume).toBe(VOLUME);
    expect(saved.horizon).toBe(HORIZONS[1]);
    expect(saved.params).toMatchObject({
      cell_m: 12.5, fault_aware: true, fault_blocks: 2, faults_used: ['Fault_A'], control_points: 12,
      live_nodes: 4, z_min: -1520, z_max: -1500, made_from: 'make_surface', survey_geometry: 'measured_affine',
    });
    expect(out.surface.name).toBe('Base Reservoir (TWT ms)');
    expect(out.live).toBe(4);
  });

  test('no horizon is a clear refusal', async () => {
    await expect(makeSurfaceFromHorizon({ volume: VOLUME, manifest: MANIFEST, horizon: null, domain: 'twt' }))
      .rejects.toThrow('Choose a horizon.');
    expect(saveHorizonAsSurface).not.toHaveBeenCalled();
  });
});

describe('MakeSurfaceDialog', () => {
  const renderDialog = (props = {}) => {
    const handlers = { onOpenChange: jest.fn(), onSurfaceSaved: jest.fn(), showSurface: jest.fn() };
    render(
      <MemoryRouter>
        <MakeSurfaceDialog
          open volume={VOLUME} manifest={MANIFEST} horizons={HORIZONS}
          initialHorizonId="h2" {...handlers} {...props}
        />
      </MemoryRouter>,
    );
    return handlers;
  };

  test('opens with the right-clicked horizon preselected and TWT without a velocity model', async () => {
    renderDialog();
    expect(screen.getByTestId('sl-make-surface-horizon')).toHaveValue('h2');
    expect(screen.getByTestId('sl-make-surface-domain')).toHaveValue('twt');
    expect(await screen.findByText('Fault-aware (1 fault)')).toBeInTheDocument();
  });

  test('Grid in Seismolord saves the surface and shows it in the Map window', async () => {
    const h = renderDialog();
    await screen.findByText('Fault-aware (1 fault)');
    fireEvent.click(screen.getByTestId('sl-make-surface-grid'));
    await waitFor(() => expect(h.showSurface).toHaveBeenCalledWith({ id: 's1', name: 'Base Reservoir (TWT ms)' }));
    expect(saveHorizonAsSurface.mock.calls[0][0].horizon).toBe(HORIZONS[1]);
    expect(gridHorizonSurface.mock.calls[0][0].faults).toEqual(FAULTS);
    expect(h.onSurfaceSaved).toHaveBeenCalled();
    expect(screen.getByTestId('sl-make-surface-result')).toHaveTextContent('Base Reservoir (TWT ms): 4 live nodes');
  });

  test('Publish to the registry saves, leaves the view, and links to Mapping & Surface Studio', async () => {
    const h = renderDialog();
    fireEvent.click(screen.getByTestId('sl-make-surface-publish'));
    const link = await screen.findByRole('link', { name: /Open Mapping & Surface Studio/ });
    expect(link).toHaveAttribute('href', MAPPING_STUDIO_PATH);
    expect(h.showSurface).not.toHaveBeenCalled();
    expect(h.onSurfaceSaved).toHaveBeenCalled();
  });

  test('a gridding error is shown, nothing saved', async () => {
    gridHorizonSurface.mockRejectedValueOnce(new Error('Horizon has too few live picks to grid.'));
    renderDialog();
    fireEvent.click(screen.getByTestId('sl-make-surface-grid'));
    expect(await screen.findByTestId('sl-make-surface-error')).toHaveTextContent('too few live picks');
    expect(saveHorizonAsSurface).not.toHaveBeenCalled();
  });
});

describe('explorer doors', () => {
  const tree = {
    volumes: [], activeVolumeId: 'v1', volumeBusyId: null,
    horizons: HORIZONS, visibleIds: new Set(), horizonBusyId: null, editTargetId: null,
    horizonVersions: {}, visibleVersionIds: new Set(), versionChainOf: () => [],
    surfaces: [], surfaceBusyId: null, visibleSurfaceIds: new Set(),
    culture: [], cultureBusyId: null, visibleCultureIds: new Set(),
    faults: [], visibleFaultIds: new Set(), faultBusyId: null,
    wells: [], visibleWellIds: new Set(), wellBusyId: null, wellsError: null,
    savedTraverses: [], traverseSavedId: null, slicePlanes: [], horizonColorById: {},
    projects: [], lines2d: [], visibleLineIds: new Set(),
  };

  test('a horizon right-click offers Make surface for that horizon', async () => {
    const actions = new Proxy({}, { get: (t, k) => { if (!t[k]) t[k] = jest.fn(); return t[k]; } });
    render(<MemoryRouter><SeismicExplorer tree={tree} actions={actions} /></MemoryRouter>);
    fireEvent.contextMenu(screen.getByText('Base Reservoir'));
    fireEvent.click(await screen.findByText('Make surface…'));
    expect(actions.makeSurface).toHaveBeenCalledWith(HORIZONS[1]);
  });

  test('the Horizons and Faults sections open the import door for their kind', () => {
    const actions = new Proxy({}, { get: (t, k) => { if (!t[k]) t[k] = jest.fn(); return t[k]; } });
    render(<MemoryRouter><SeismicExplorer tree={tree} actions={actions} /></MemoryRouter>);
    fireEvent.click(screen.getByTitle(/^Import horizons/));
    expect(actions.openSurfaceImport).toHaveBeenLastCalledWith('picks');
    fireEvent.click(screen.getByTitle(/^Import fault sticks/));
    expect(actions.openSurfaceImport).toHaveBeenLastCalledWith('faults');
    fireEvent.click(screen.getByTitle('Import a surface grid…'));
    expect(actions.openSurfaceImport).toHaveBeenLastCalledWith('surface');
  });
});
