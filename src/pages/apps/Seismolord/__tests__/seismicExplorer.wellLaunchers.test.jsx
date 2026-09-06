/**
 * SL0: a well row's context menu offers Well data (Well Data Manager on
 * the well's tops) and the Open in submenu, both on the paths the
 * controller hands the tree (the harness points them at /dev/*).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import SeismicExplorer from '@/pages/apps/Seismolord/components/workspace/SeismicExplorer';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';

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

const tree = {
  volumes: [], activeVolumeId: null, volumeBusyId: null,
  horizons: [], visibleIds: new Set(), horizonBusyId: null, editTargetId: null,
  horizonVersions: {}, visibleVersionIds: new Set(), versionChainOf: () => [],
  surfaces: [], surfaceBusyId: null, visibleSurfaceIds: new Set(),
  culture: [], cultureBusyId: null, visibleCultureIds: new Set(),
  faults: [], visibleFaultIds: new Set(), faultBusyId: null,
  wells: [{ id: 'w1', name: 'KETA-1', deviation: [], tops: [{ name: 'A', md: 100 }], checkshots: [], td_md_m: 1200 }],
  visibleWellIds: new Set(), wellBusyId: null, wellsError: null,
  savedTraverses: [], traverseSavedId: null, slicePlanes: [], horizonColorById: {},
  projects: [], lines2d: [], visibleLineIds: new Set(),
  appPaths: DEV_APP_PATHS,
};
const actions = new Proxy({}, { get: () => jest.fn() });

test('right-clicking a well offers Well data on its tops and the Open in submenu on the harness paths', async () => {
  render(<MemoryRouter><SeismicExplorer tree={tree} actions={actions} /></MemoryRouter>);
  fireEvent.contextMenu(screen.getByText('KETA-1'));
  const link = await screen.findByTestId('sl-well-data-w1');
  expect(link).toHaveAttribute('href', '/dev/well-data-manager?well=w1&tab=tops');
  expect(await screen.findByTestId('sl-well-w1-open-in')).toBeInTheDocument();
});
