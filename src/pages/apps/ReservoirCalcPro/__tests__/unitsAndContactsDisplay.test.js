// Seismolord demo 3 put a feet registry surface into a Field project:
// - the surface card read "Min Z: -1590.8 m" and the viewers "DEPTH (M)",
//   because a registry surface is held in metres whatever it was published
//   in, and the display used that internal unit;
// - the report printed the contact as "OWC -5003.155085025509 ft TVDSS".
// Depths now show in the project's unit and contacts are rounded.
import { surfaceZRange, depthFactor, scaleRcpGrid, projectDepthUnit } from '../services/depthDisplay';
import { kitForSurface } from '../services/mapKitGrid';
import { makeLattice } from '../services/lattice';
import { formatContact, describeContacts, deterministicInputRows } from '../services/reportInfo';

const FT = 3.280839895;
// a registry surface as surfaceDoor builds it: metres elevation, kept lattice
const zM = new Float32Array([-1590.8, -1550, -1520, 1e30]);
const regSurface = {
  name: 'Ekene Sand (2) (depth ft)', depthUnit: 'm', minZ: -1590.8, maxZ: -1508.4,
  lattice: makeLattice({ x0: 0, y0: 0, dx: 25, dy: 25, nx: 2, ny: 2 }, zM),
};

describe('depths follow the project unit system', () => {
  test('a Field project shows a metre-held surface in feet', () => {
    const r = surfaceZRange(regSurface, 'field');
    expect(r.unit).toBe('ft');
    expect(r.min).toBeCloseTo(-1590.8 * FT, 3);
    expect(r.max).toBeCloseTo(-1508.4 * FT, 3);
  });

  test('a Metric project shows it in metres, unchanged', () => {
    expect(surfaceZRange(regSurface, 'metric')).toEqual({ min: -1590.8, max: -1508.4, unit: 'm' });
  });

  test('a feet surface in a Metric project shows in metres', () => {
    const r = surfaceZRange({ depthUnit: 'ft', minZ: -5000, maxZ: -4900 }, 'metric');
    expect(r.unit).toBe('m');
    expect(r.min).toBeCloseTo(-5000 / FT, 6);
  });

  test('the 2D map kit and its colour bar are in feet in a Field project, nulls kept', () => {
    const k = kitForSurface(regSurface, null, projectDepthUnit('field'));
    expect(k.unit).toBe('ft');
    expect(k.grid[0]).toBeCloseTo(-1590.8 * FT, 1);
    expect(k.grid[3]).toBeGreaterThan(1e29);
    // the stored lattice is untouched
    expect(kitForSurface(regSurface, null).unit).toBe('m');
  });

  test('the 3D grid is scaled for display, nulls kept', () => {
    const g = scaleRcpGrid({ x: [0, 1], y: [0, 1], z: [[-1500, null], [-1520, 1e30]] }, depthFactor('m', 'ft'));
    expect(g.z[0][0]).toBeCloseTo(-1500 * FT, 6);
    expect(g.z[0][1]).toBeNull();
    expect(g.z[1][1]).toBe(1e30);
  });
});

describe('contacts are printed rounded', () => {
  test('formatContact', () => {
    expect(formatContact(-5003.155085025509)).toBe('-5,003');
    expect(formatContact('')).toBeNull();
  });

  test('the report line and the inputs table', () => {
    expect(describeContacts({ inputMethod: 'surfaces', fluidType: 'oil', inputs: { owc: -5003.155085025509 }, unitSystem: 'field' }))
      .toBe('Contacts (TVDSS elevation, negative below datum): OWC -5,003 ft');
    const rows = deterministicInputRows({ inputs: { owc: -5036.1, ntg: 0.7, porosity: 0.2, sw: 0.3, fvf: 1.2 }, fluidType: 'oil', inputMethod: 'surfaces' });
    expect(rows.find((r) => /OWC/.test(r[0]))[1]).toBe('-5,036');
  });
});
