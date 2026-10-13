/**
 * "From the top surface" in the Area-depth method measured the base areas
 * from the gross thickness even when a base surface was chosen, so the
 * table held other rock than the Surfaces method on the same maps. With a
 * base surface it now measures the base from it; the volume from the table
 * then matches the Surfaces volume (found scripting the ReservoirCalc Pro
 * lessons, 2026-10-12). Negative control: the thickness-based table misses
 * the Surfaces volume by more than 10 percent on this pair.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { makeLattice } from '../services/lattice';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { areaDepthHypsometry } from '../services/areaDepth';

const n = 61; const d = 50;
const spec = { x0: 0, y0: 0, dx: d, dy: d, nx: n, ny: n };
const grid = (f) => { const g = new Float32Array(n * n); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g[r * n + c] = f(c * d - 1500, r * d - 1500); return g; };
const surf = (name, f) => ({ id: name, name, points: [{ x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 }], xyUnit: 'm', xyToM: 1, depthUnit: 'm', zConvention: 'elevation', lattice: makeLattice(spec, grid(f)) });
// a dome whose sand thickens off the crest (30 m at the crest, 60 m on the flanks)
const top = surf('Top dome', (x, y) => -1500 - 0.00004 * (x * x + y * y));
const base = surf('Base dome', (x, y) => -1530 - 0.00008 * (x * x + y * y));
const updates = [];
const mockState = { unitSystem: 'metric', inputs: { topSurfaceId: 'Top dome', baseSurfaceId: 'Base dome', thickness: 30, areaDepth: null }, surfaces: { 'Top dome': top, 'Base dome': base }, gridding: null };
jest.mock('../contexts/ReservoirCalcContext', () => ({
  useReservoirCalc: () => ({ state: mockState, updateInputs: (p) => updates.push(p), logEvent: () => {} }),
}));
import AreaDepthPanel from '../components/AreaDepthPanel';

const volFrom = (rows, owc) => areaDepthHypsometry(rows, { unitSystem: 'metric' }).zoneVolumes('oil', owc, null).grvOil;

test('with a base surface chosen, the table measures the base from it and holds the Surfaces rock', () => {
  render(<AreaDepthPanel />);
  fireEvent.click(screen.getByTestId('rcp-ad-from-surface'));
  expect(screen.getByTestId('rcp-ad-msg')).toHaveTextContent('and "Base dome" as the base');
  const rows = updates.at(-1).areaDepth.rows;
  const owc = -1560;
  const surfaces = ContactVolumetricsEngine.calculate({ topSurface: top, baseSurface: base, unitSystem: 'metric', inputs: { fluidType: 'oil', owc, ntg: 1, porosity: 1, sw: 0, fvf: 1 } }).grvOil;
  expect(Math.abs(volFrom(rows, owc) / surfaces - 1)).toBeLessThan(0.02);
  // negative control: the gross-thickness table on the same pair
  const thick = ContactVolumetricsEngine.areaDepthTable({ topSurface: top, constantThickness: 30, unitSystem: 'metric' }, 40).rows;
  expect(Math.abs(volFrom(thick, owc) / surfaces - 1)).toBeGreaterThan(0.1);
});
