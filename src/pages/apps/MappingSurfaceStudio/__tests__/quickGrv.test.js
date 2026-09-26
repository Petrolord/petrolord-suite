// Quick GRV of one closure (Mapping T1: MAP-T1-001 open closures, -002
// separate structures, -004 contact sign, E1 curve). Analytic cones, so
// every expected volume is closed-form: V = pi r^2 h / 3.
import { quickGrv, describeGrv, interpretContact, nodeAt } from '../services/quickGrv';

const cone = (x, y, cx = 0) => -1800 - 0.1 * Math.hypot(x - cx, y);
const gridOf = (fn, spec) => {
  const z = new Float32Array(spec.nx * spec.ny);
  for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) z[r * spec.nx + c] = fn(spec.x0 + c * spec.dx, spec.y0 + r * spec.dy);
  return z;
};
const V1 = (Math.PI * 1000 ** 2 * 100) / 3; // one cone above -1900 m
const fmtZ = (m) => `${m.toFixed(0)} m`;

describe('quickGrv measures one closure and says whether it is closed', () => {
  const spec = { x0: -1500, y0: -1500, dx: 25, dy: 25, nx: 121, ny: 121 };
  const z = gridOf(cone, spec);

  test('a closed cone: the analytic volume, closed, spill at the map edge level', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -1900 });
    expect(r.kind).toBe('closure');
    expect(r.open).toBe(false);
    expect(Math.abs(r.grvM3 / V1 - 1)).toBeLessThan(0.005);
    expect(r.grvAcreFt).toBeCloseTo(r.grvM3 / 1233.48183754752, 6);
    expect(r.spill.z).toBeCloseTo(-1950, 3);
    expect(r.curve.length).toBe(30);
    expect(describeGrv(r, { contactLabel: '-1900 m', fmtZ })).toMatch(/^GRV [\d,]+ acre-ft \([\d.]+ million m³\) above -1900 m; area [\d.]+ km² .*Closed on the map, crest -1800 m; it spills at -1950 m/);
  });

  test('a contact below the whole map: flagged open, a minimum, never a plain trap volume', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -3000 });
    expect(r.open).toBe(true);
    const t = describeGrv(r, { contactLabel: '-3000 m', fmtZ });
    expect(t).toMatch(/^Not a trap volume: the closure above -3000 m runs off the mapped area/);
    expect(t).toMatch(/only a minimum/);
    expect(t).toMatch(/closed down to -1950 m, where the map edge cuts it/);
  });

  test('a contact above the crest: no closure', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -1700 });
    expect(r.kind).toBe('none');
    expect(describeGrv(r, { contactLabel: '-1700 m', fmtZ })).toBe('No structure closes above -1700 m: the shallowest mapped point is -1800 m.');
  });
});

describe('two domes are two closures, not one volume', () => {
  const spec = { x0: -3000, y0: -3000, dx: 100, dy: 100, nx: 91, ny: 61 };
  const z = gridOf((x, y) => Math.max(cone(x, y), cone(x, y, 3000)), spec);

  test('the highest closure is measured and the other is named, not added', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -1900 });
    expect(Math.abs(r.grvM3 / V1 - 1)).toBeLessThan(0.02);
    expect(r.others).toHaveLength(1);
    const t = describeGrv(r, { contactLabel: '-1900 m', fmtZ });
    expect(t).toMatch(/1 other closure above the contact is not counted/);
    expect(t).toMatch(/Below -1950 m it joins the culmination cresting at -1800 m \(fill and spill\)/);
  });

  test('a picked point measures the closure under it', () => {
    const east = nodeAt(spec, 3000, 0);
    const r = quickGrv({ spec, gridM: z, contactM: -1900, seedIndex: east });
    expect(r.crestZ).toBeCloseTo(-1800, 3);
    expect(Math.abs(r.closure.crest.x - 3000)).toBeLessThan(1e-6);
    expect(() => quickGrv({ spec, gridM: z, contactM: -1900, seedIndex: nodeAt(spec, 1500, 0) })).toThrow(/not inside a closure/);
    expect(nodeAt(spec, 99999, 0)).toBe(-1);
  });

  test('below the saddle the two are one accumulation: the read-out says it includes the neighbour', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -1960 });
    expect(r.others).toHaveLength(0);
    expect(describeGrv(r, { contactLabel: '-1960 m', fmtZ })).toMatch(/includes the neighbouring culmination cresting at -1800 m: the two join at -1950 m/);
  });
});

test('a crest on the edge of the mapped area: no closed structure, said plainly', () => {
  const spec = { x0: 0, y0: 0, dx: 50, dy: 50, nx: 21, ny: 17 };
  const z = gridOf((x, y) => -2000 + 0.05 * y - 0.01 * x, spec); // highest on the north edge
  const r = quickGrv({ spec, gridM: z, contactM: -1990 });
  expect(r.open).toBe(true);
  const t = describeGrv(r, { contactLabel: '-1990 m', fmtZ });
  expect(t).toMatch(/^Not a trap volume: the crest \(-1960 m\) sits on the edge of the mapped area, so the map shows no closed structure there/);
  expect(t).toMatch(/Extend the map past the wells/);
});

describe('interpretContact reads a positive depth as a depth (MAP-T1-004)', () => {
  const z = Float32Array.from([-1800, -1850, -1900, -1950]);
  test('4900 ft typed on a -1800..-1950 m map is read as a depth when its negative is inside', () => {
    expect(interpretContact(1900, z)).toEqual({ contactM: -1900, readAsDepth: true });
    expect(interpretContact(-1900, z)).toEqual({ contactM: -1900, readAsDepth: false });
    expect(interpretContact(2500, z)).toEqual({ contactM: 2500, readAsDepth: false }); // not inside either way
    expect(() => interpretContact(NaN, z)).toThrow(/contact/);
  });
});
