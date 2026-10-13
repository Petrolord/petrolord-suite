// The Targets tab says where a target came from and what a refresh would
// do to it (2026-10-13, Well Design Studio video dry run: the notice read
// "What moved: re-grids 1 to 2" and the Source column "geo_surface").
import React from 'react';
import { render, screen } from '@testing-library/react';
import { targetSourceLabel, targetMoveText, targetFromSurfacePick } from '../services/targetSources';
import SourceChangedNotice from '@/lib/sourceFreshness/SourceChangedNotice';

const FT = 0.3048;
const ft = (m) => `${(m / FT).toFixed(1)} ft`;

// a 2 x 2 elevation grid (metres, negative down) with a node at the target
const surface = (z) => ({
  id: 's1', name: 'Ekene Sand top', origin_x: 401300, origin_y: 521500, dx: 100, dy: 100, nx: 2, ny: 2,
  z_unit: 'm', xy_unit: 'm', crs: 'EPSG:32632', domain: 'depth', kind: 'elevation', provenance: {},
});

describe('Source column words', () => {
  test('a surface pick with its stand-off, a top pick, a typed target', () => {
    expect(targetSourceLabel({ provenance: { source: 'geo_surface', surface_name: 'WDS demo: Oboro Sand top', below_pick_m: 8 } }, ft))
      .toBe('Surface: WDS demo: Oboro Sand top, 26.2 ft below');
    expect(targetSourceLabel({ provenance: { source: 'geo_top', top_name: 'Oboro Sand', well_name: 'Ekene-8' } }, ft))
      .toBe('Top: Oboro Sand in Ekene-8');
    expect(targetSourceLabel({ provenance: { source: 'geo_surface', surface_name: 'S', below_pick_m: -3 } }, ft)).toBe('Surface: S, 9.8 ft above');
    expect(targetSourceLabel({})).toBe('Typed');
  });
});

describe('what a refresh would do', () => {
  const t3 = { name: 'T3 Ekene Sand west', center_x: 401400, center_y: 521600, tvdss_m: 1520.0966 };
  test('the Ekene-7 re-grid: the target goes 17.2 ft deeper (feet profile)', () => {
    const patch = { center_x: 401400, center_y: 521600, tvdss_m: 1525.3262 };
    expect(targetMoveText(t3, patch, { unit: 'ft' })).toBe('Refreshing moves T3 Ekene Sand west from 4,987.2 to 5,004.4 ft TVDSS (17.2 ft deeper).');
  });
  test('shallower, across, and unchanged read as such (negative control on the sign)', () => {
    expect(targetMoveText(t3, { ...t3, tvdss_m: 1519.0966 }, { unit: 'm' })).toBe('Refreshing moves T3 Ekene Sand west from 1,520.1 to 1,519.1 m TVDSS (1.0 m shallower).');
    expect(targetMoveText(t3, { ...t3, center_x: 401403 }, { unit: 'm' })).toBe('Refreshing moves T3 Ekene Sand west from 1,520.1 to 1,520.1 m TVDSS (no deeper, and 3.0 m across).');
    expect(targetMoveText(t3, { ...t3 }, { unit: 'ft' })).toBe('Refreshing leaves T3 Ekene Sand west where it is.');
  });
  test('the sentence comes from the shipped pick, run on the re-gridded surface', () => {
    const before = targetFromSurfacePick(surface(), new Float32Array([-1517, -1517, -1517, -1517]), 401400, 521600, 'T3');
    const after = targetFromSurfacePick(surface(), new Float32Array([-1522.24, -1522.24, -1522.24, -1522.24]), 401400, 521600, 'T3');
    const text = targetMoveText({ ...before, name: 'T3' }, after, { unit: 'ft' });
    expect(text).toMatch(/\(17\.2 ft deeper\)/);
  });
});

describe('the notice shows the effect line', () => {
  test('rendered under the item, absent when not given', () => {
    const item = { key: 'k', status: 'changed', ref: { name: 'Ekene Sand top', kind: 'geo_surfaces' }, differences: [] };
    const { rerender } = render(<SourceChangedNotice items={[{ ...item, effect: 'Refreshing moves T3 from 4,987.2 to 5,004.4 ft TVDSS (17.2 ft deeper).' }]} testId="wd-source-changed" />);
    expect(screen.getByTestId('wd-source-changed-effect').textContent).toMatch(/17\.2 ft deeper/);
    rerender(<SourceChangedNotice items={[item]} testId="wd-source-changed" />);
    expect(screen.queryByTestId('wd-source-changed-effect')).toBeNull();
  });
});
