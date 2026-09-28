/**
 * Design system rollout W0B: the shared drilling kit (WellboreDetails,
 * Explorer, GeometryNotice) is used by eleven drilling apps that migrate in
 * Waves 2 and 3. Outside a <ThemedApp> scope it must render exactly what it
 * rendered before the rollout: the snapshots below were recorded on
 * origin/main (92782cda7) before these files were touched, so any change to
 * an unmigrated app's DOM fails here. Inside a scope the kit uses theme
 * roles, in light and in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellboreDetails from '../components/WellboreDetails';
import Explorer from '../components/Explorer';
import GeometryNotice from '../components/GeometryNotice';
import { ThemedApp } from '@/design/ThemeProvider';

const stations = Array.from({ length: 11 }, (_, i) => ({ md: i * 100, inc: Math.min(60, i * 6), azi: 90 }));
const WELLBORE = {
  id: 'wb1', name: 'Lad', depth_unit: 'ft', kb_elev_m: 25, ground_elev_m: 4, water_depth_m: 30,
  azimuth_reference: 'true', head_x: 500000, head_y: 6700000, uwi: 'UWI-1', status: 'planning', geo_well_id: 'geo-1',
};
const SOURCES = ['definitive', 'actual', 'draft', 'registry', 'none'];
const traj = (source, extra = {}) => ({
  wellbore: WELLBORE, design: { name: 'Plan A', revision: 1 }, stations, source,
  label: `Plan A r1 (${source}), 11 stations`, note: `Note for ${source}.`, ...extra,
});

export const drillingScenes = {
  ...Object.fromEntries(SOURCES.map((s) => [`WellboreDetails ${s}`, () => <WellboreDetails trajectory={traj(s)} />])),
  'WellboreDetails survey open, truncated': () => <WellboreDetails trajectory={traj('definitive')} maxRows={5} />,
  'WellboreDetails metres, no note, legacy result': () => (
    <WellboreDetails testPrefix="ct" trajectory={{ wellbore: { ...WELLBORE, depth_unit: 'm', uwi: null, geo_well_id: null }, design: { name: 'Base', revision: 2 }, stations }} />
  ),
  'Explorer empty': () => (
    <Explorer sites={[]} wellbores={[]} cases={[]} onSelectSite={() => {}} onSelectWellbore={() => {}} onSelectCase={() => {}} onNewCase={() => {}} onDeleteCase={() => {}} />
  ),
  'Explorer full selection': () => (
    <Explorer
      sites={[{ id: 's1', name: 'Site A' }, { id: 's2', name: 'Site B' }]} selectedSiteId="s1" onSelectSite={() => {}}
      wellbores={[WELLBORE, { id: 'wb2', name: 'Other', depth_unit: 'm' }]} selectedWellboreId="wb1" onSelectWellbore={() => {}}
      cases={[{ id: 'c1', name: 'Case 1' }, { id: 'c2', name: 'Case 2' }]} selectedCaseId="c1" onSelectCase={() => {}}
      onNewCase={() => {}} onDeleteCase={() => {}} trajectory={traj('draft')} caseLabel="Hydraulics cases" testPrefix="hyd"
    />
  ),
  'GeometryNotice none': () => <GeometryNotice geometryRow={{ source: 'none', note: 'No hole sections.' }} />,
  'GeometryNotice casing programme': () => <GeometryNotice geometryRow={{ source: 'casing_programme', note: 'From C&T.', hole_sections: [{}] }} />,
  'GeometryNotice without T&D link': () => <GeometryNotice geometryRow={{ source: 'none', note: 'None.' }} showTorqueDragLink={false} testPrefix="wc" />,
  'GeometryNotice saved geometry (renders nothing)': () => <GeometryNotice geometryRow={{ source: 'geometry', note: 'x', hole_sections: [{}] }} />,
};

// Open the survey listing wherever there is a toggle, so the table is pinned too.
const openSurvey = () => {
  document.querySelectorAll('[data-testid$="-survey-toggle"]').forEach((b) => fireEvent.click(b));
};

afterEach(cleanup);

describe('outside a scope the drilling kit renders exactly as on main', () => {
  for (const [name, Scene] of Object.entries(drillingScenes)) {
    test(name, () => {
      render(<MemoryRouter><Scene /></MemoryRouter>);
      openSurvey();
      expect(document.body.innerHTML).toMatchSnapshot();
      expect(document.body.innerHTML).not.toMatch(/-pl-|data-pl-theme/);
    });
  }
});

// Inside a scope: every legacy console colour in these files is gone.
const LEGACY = /\b(?:bg|text|border)-(?:slate|cyan|amber|red|lime)-\d|text-white\b/;
const renderThemed = (Scene, theme) => {
  window.localStorage.clear();
  const utils = render(
    <MemoryRouter>
      <ThemedApp userId="w0b" defaultTheme={theme}><Scene /></ThemedApp>
    </MemoryRouter>,
  );
  openSurvey();
  return utils;
};

describe('inside a scope the drilling kit uses theme roles', () => {
  test('negative control: the legacy render does carry console colours', () => {
    const Scene = drillingScenes['Explorer full selection'];
    render(<MemoryRouter><Scene /></MemoryRouter>);
    openSurvey();
    expect(document.body.innerHTML).toMatch(LEGACY);
  });

  for (const theme of ['light', 'dark']) {
    for (const [name, Scene] of Object.entries(drillingScenes)) {
      test(`${theme}: ${name}`, () => {
        const { container } = renderThemed(Scene, theme);
        expect(container.querySelector('[data-pl-theme]')).toHaveAttribute('data-pl-theme', theme);
        expect(container.innerHTML).not.toMatch(LEGACY);
      });
    }

    test(`${theme}: status tones and selection map to roles`, () => {
      renderThemed(drillingScenes['Explorer full selection'], theme);
      expect(document.querySelector('[data-testid="hyd-traj-info"]').className).toMatch(/bg-pl-warning-bg text-pl-warning-text/);
      expect(document.querySelector('[data-testid="hyd-wellbore-Lad"]').className).toMatch(/text-pl-primary-text/);
      expect(document.querySelector('[data-testid="hyd-survey-table"] thead').className).toMatch(/bg-pl-sunken/);
      cleanup();
      renderThemed(drillingScenes['GeometryNotice none'], theme);
      expect(document.querySelector('[data-testid="td-geometry-notice"]').className).toMatch(/bg-pl-danger-bg text-pl-danger-text/);
      cleanup();
      renderThemed(drillingScenes['WellboreDetails actual'], theme);
      expect(document.querySelector('[data-testid="td-traj-info"]').className).toMatch(/text-pl-info-text/);
    });
  }
});
