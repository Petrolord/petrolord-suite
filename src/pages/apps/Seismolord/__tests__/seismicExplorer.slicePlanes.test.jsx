/**
 * Seismic Explorer — the active volume's slice-plane children (Inline /
 * Crossline / Time slice rows with visibility eyes) and the horizon
 * context menu's Settings… entry.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import SeismicExplorer from '@/pages/apps/Seismolord/components/workspace/SeismicExplorer';

const baseTree = {
  volumes: [
    { id: 'v1', name: 'Survey A', status: 'ready', survey_meta: null },
    { id: 'v2', name: 'Survey B', status: 'ready', survey_meta: null },
  ],
  activeVolumeId: 'v1',
  volumeBusyId: null,
  horizons: [],
  visibleIds: new Set(),
  horizonBusyId: null,
  editTargetId: null,
  faults: [],
  visibleFaultIds: new Set(),
  faultBusyId: null,
  wells: [],
  visibleWellIds: new Set(),
  wellBusyId: null,
  wellsError: null,
  savedTraverses: [],
  traverseSavedId: null,
  slicePlanes: [
    { key: 'inline', label: 'Inline 2450', visible: true },
    { key: 'xline', label: 'Crossline 1210', visible: false },
    { key: 'time', label: 'Time slice 1200 ms', visible: false },
  ],
  horizonColorById: {},
};

// Radix context menus position via floating-ui, which needs DOMRect.
if (typeof global.DOMRect === 'undefined') {
  global.DOMRect = class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      Object.assign(this, {
        x, y, width, height, top: y, left: x, right: x + width, bottom: y + height,
      });
    }

    static fromRect(rect = {}) {
      return new DOMRect(rect.x, rect.y, rect.width, rect.height);
    }
  };
}

// Memoized so each action name always resolves to the SAME jest.fn().
const noopActions = () => {
  const fns = {};
  return new Proxy({}, {
    get: (_, name) => { fns[name] = fns[name] || jest.fn(); return fns[name]; },
  });
};

const renderTree = (treePatch = {}, actions = noopActions()) => {
  render(
    <MemoryRouter>
      <SeismicExplorer tree={{ ...baseTree, ...treePatch }} actions={actions} />
    </MemoryRouter>,
  );
  return actions;
};

describe('SeismicExplorer slice-plane children', () => {
  test('the ACTIVE volume shows Inline / Crossline / Time slice children', () => {
    renderTree();
    expect(screen.getByText('Inline 2450')).toBeInTheDocument();
    expect(screen.getByText('Crossline 1210')).toBeInTheDocument();
    expect(screen.getByText('Time slice 1200 ms')).toBeInTheDocument();
  });

  test('no children render when no volume is active', () => {
    renderTree({ activeVolumeId: null });
    expect(screen.queryByText('Time slice 1200 ms')).not.toBeInTheDocument();
  });

  test('the eye toggle reports the plane key', () => {
    const actions = renderTree();
    // rows render label + eye; the time row's eye says "Show" (hidden)
    const timeRow = screen.getByText('Time slice 1200 ms').closest('[role="button"]');
    fireEvent.click(timeRow.querySelector('button[title="Show"]'));
    expect(actions.toggleSlicePlane).toHaveBeenCalledWith('time');
  });

  test('clicking a child row selects that orientation', () => {
    const actions = renderTree();
    fireEvent.click(screen.getByText('Crossline 1210'));
    expect(actions.selectPlane).toHaveBeenCalledWith('xline');
  });

  test('a visible plane offers Hide, a hidden one offers Show', () => {
    renderTree();
    const inlineRow = screen.getByText('Inline 2450').closest('[role="button"]');
    expect(inlineRow.querySelector('button[title="Hide"]')).not.toBeNull();
    const xlineRow = screen.getByText('Crossline 1210').closest('[role="button"]');
    expect(xlineRow.querySelector('button[title="Show"]')).not.toBeNull();
  });
});

describe('SeismicExplorer horizon settings entry', () => {
  const horizon = {
    id: 'h1', name: 'Top Reservoir', stats: { coverage: 0.8 }, params: {},
  };

  test('right-clicking a horizon offers Settings…', async () => {
    const actions = renderTree({ horizons: [horizon] });
    fireEvent.contextMenu(screen.getByText('Top Reservoir'));
    const item = await screen.findByText('Settings…');
    fireEvent.click(item);
    expect(actions.openHorizonSettings).toHaveBeenCalledWith(horizon);
  });

  test('explorer swatch honors a custom color from horizonColorById', () => {
    renderTree({
      horizons: [horizon],
      horizonColorById: { h1: '#ff0000' },
    });
    const row = screen.getByText('Top Reservoir').closest('[role="button"]');
    // svg[0] is the eye toggle; svg[1] is the horizon type icon (the swatch)
    const icon = row.querySelectorAll('svg')[1];
    expect(icon.style.color).toBe('rgb(255, 0, 0)');
  });
});
