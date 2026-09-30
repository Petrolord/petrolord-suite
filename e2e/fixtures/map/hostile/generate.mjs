// Hostile surface files for the Mapping & Surface Studio upgrade (PL2,
// MAP-U1). Every file carries the same analytic dome so a test can check
// the value read back at a known node:
//   z(x, y) = -1500 - 0.0001 * r^2  metres (elevation, negative down),
//   r = distance from (502000, 6700000), UTM metres.
// Run: node e2e/fixtures/map/hostile/generate.mjs (deterministic output).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = (name, text) => writeFileSync(join(here, name), text);

const CX = 502000;
const CY = 6700000;
export const domeM = (x, y) => -1500 - 0.0001 * ((x - CX) ** 2 + (y - CY) ** 2);
const FT = 0.3048;
const FT_US = 1200 / 3937;

const NX = 11;
const NY = 9;
const DX = 200;
const X0 = CX - 1000;
const Y0 = CY - 800;
const nodes = [];
for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++) nodes.push({ r, c, x: X0 + c * DX, y: Y0 + r * DX });
const f = (v, d = 2) => v.toFixed(d);

// 1. Petrel CPS-3 export: "->" name line after the header, Windows
//    three-digit exponent null, depth positive down in metres.
{
  const zmin = Math.min(...nodes.map((n) => -domeM(n.x, n.y)));
  const zmax = Math.max(...nodes.map((n) => -domeM(n.x, n.y)));
  const lines = [
    'FSASCI 0 1 COMPUTED 0 1E+030',
    'FSATTR 0 0',
    `FSLIMI ${X0} ${X0 + (NX - 1) * DX} ${Y0} ${Y0 + (NY - 1) * DX} ${f(zmin)} ${f(zmax)}`,
    `FSNROW ${NY} ${NX}`,
    `FSXINC ${DX} ${DX}`,
    '->MSMODL: Top Dome depth',
  ];
  const vals = [];
  for (let c = 0; c < NX; c++) for (let r = NY - 1; r >= 0; r--) {
    vals.push(c === 0 && r === NY - 1 ? '1E+030' : f(-domeM(X0 + c * DX, Y0 + r * DX)));
  }
  for (let i = 0; i < vals.length; i += 5) lines.push(vals.slice(i, i + 5).join(' '));
  out('petrel_cps3_depth_m.cps', `${lines.join('\r\n')}\r\n`);
}

// 2. Kingdom-style ZMAP+ with -99999 nulls, comment banner, TWT in
//    NEGATIVE milliseconds (Petrel and Kingdom both write time negative).
{
  const twt = (x, y) => -(1400 + 0.00008 * ((x - CX) ** 2 + (y - CY) ** 2));
  const lines = [
    '! Kingdom 2023 ZMAP+ export',
    '! Horizon: H_DOME_TWT  Units: ms',
    '@H_DOME_TWT HEADER, GRID, 5',
    '15, -99999.0, , 4, 1',
    `${NY}, ${NX}, ${X0}, ${X0 + (NX - 1) * DX}, ${Y0}, ${Y0 + (NY - 1) * DX}`,
    '0.0, 0.0, 0.0',
    '@',
  ];
  const vals = [];
  for (let c = 0; c < NX; c++) for (let r = NY - 1; r >= 0; r--) {
    vals.push(c === NX - 1 && r === 0 ? '-99999.0' : f(twt(X0 + c * DX, Y0 + r * DX), 4));
  }
  for (let i = 0; i < vals.length; i += 5) lines.push(vals.slice(i, i + 5).join(' '));
  out('kingdom_zmap_twt_negative.zmap', `${lines.join('\n')}\n`);
}

// 3. XYZ with a header row naming the columns (Kingdom / spreadsheet).
{
  const rows = nodes.map((n) => `${n.x}\t${n.y}\t${f(domeM(n.x, n.y))}`);
  out('xyz_header_row.xyz', `X\tY\tZ\n${rows.join('\n')}\n`);
}

// 4. Petrel "points with attributes" export (header block).
{
  const rows = nodes.map((n) => `${f(n.x)} ${f(n.y)} ${f(domeM(n.x, n.y))}`);
  out('petrel_points_with_attributes.txt', [
    '# Petrel Points with attributes',
    '# Unit in X and Y direction: m',
    '# Unit in depth: m',
    'VERSION 1',
    'BEGIN HEADER',
    'X',
    'Y',
    'Z',
    'END HEADER',
    ...rows,
  ].join('\n') + '\n');
}

// 5. Semicolon file with comma decimals (European spreadsheet).
{
  const rows = nodes.map((n) => `${n.x};${n.y};${f(domeM(n.x, n.y)).replace('.', ',')}`);
  out('xyz_semicolon_comma_decimal.csv', `x;y;z\n${rows.join('\n')}\n`);
}

// 6. Columns in another order with units in the header (Z first).
{
  const rows = nodes.map((n) => `${f(-domeM(n.x, n.y) / FT)},${n.x},${n.y}`);
  out('xyz_depth_ft_first.csv', `Depth (ft),Easting (m),Northing (m)\n${rows.join('\n')}\n`);
}

// 7. A horizon exported on a ROTATED seismic lattice (Kingdom / Petrel
//    point export of a 3D survey at 30 degrees): irregular in X and Y.
{
  const th = (30 * Math.PI) / 180;
  const rows = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 10; j++) {
    const u = (i - 6) * 150;
    const v = (j - 5) * 150;
    const x = CX + u * Math.cos(th) - v * Math.sin(th);
    const y = CY + u * Math.sin(th) + v * Math.cos(th);
    rows.push(`${f(x)} ${f(y)} ${f(domeM(x, y))}`);
  }
  out('xyz_rotated_survey_lattice.xyz', `${rows.join('\n')}\n`);
}

// 8. Irap classic, depth positive down in FEET, on a US state-plane
//    frame in US survey feet (XY ftUS); Irap null 9999900.
{
  const ftNX = 11;
  const ftNY = 9;
  const ftDX = 200 / FT_US;
  const x0 = 1968500;
  const y0 = 500000;
  const hdr = [
    `-996 ${ftNY} ${f(ftDX, 4)} ${f(ftDX, 4)}`,
    `${f(x0, 4)} ${f(x0 + (ftNX - 1) * ftDX, 4)} ${f(y0, 4)} ${f(y0 + (ftNY - 1) * ftDX, 4)}`,
    `${ftNX} 0.000000 ${f(x0, 4)} ${f(y0, 4)}`,
    '0 0 0 0 0 0 0',
  ];
  const vals = [];
  for (let r = 0; r < ftNY; r++) for (let c = 0; c < ftNX; c++) {
    const xm = X0 + c * DX;
    const ym = Y0 + r * DX;
    vals.push(r === 0 && c === 0 ? '9999900.000000' : f(-domeM(xm, ym) / FT, 4));
  }
  for (let i = 0; i < vals.length; i += 6) hdr.push(vals.slice(i, i + 6).join(' '));
  out('irap_depth_ft_stateplane_ftus.irap', `${hdr.join('\n')}\n`);
}

// 9. Fault polygons as GeoJSON (two faults in one file, the way a GIS
//    or Petrel "fault polygons" shapefile arrives) and a lease boundary.
{
  const poly = (pts) => ({ type: 'Polygon', coordinates: [[...pts, pts[0]]] });
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'F1' }, geometry: poly([[501700, 6699200], [501800, 6699200], [501900, 6700800], [501800, 6700800]]) },
      { type: 'Feature', properties: { name: 'F2' }, geometry: poly([[502300, 6699300], [502380, 6699300], [502480, 6700700], [502400, 6700700]]) },
    ],
  };
  out('fault_polygons_two.geojson', `${JSON.stringify(fc, null, 1)}\n`);
  const lease = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'OML 99' }, geometry: poly([[500900, 6699100], [503100, 6699100], [503100, 6700900], [500900, 6700900]]) }] };
  out('lease_boundary.geojson', `${JSON.stringify(lease, null, 1)}\n`);
}

// 10. Petrel fault polygons in ZMAP+ lines format (not a grid: a
//     practitioner's usual fault polygon export).
{
  out('petrel_fault_polygons_zmap_lines.dat', [
    '! Petrel fault polygons',
    '@Fault polygons HEADER, POLYGON, 4',
    '20, 1E+30, , 4, 1',
    '@',
    '501700.0 6699200.0 -1600.0 1',
    '501800.0 6699200.0 -1600.0 1',
    '501900.0 6700800.0 -1560.0 1',
    '501800.0 6700800.0 -1560.0 1',
    '501700.0 6699200.0 -1600.0 1',
    '1E+30 1E+30 1E+30 1',
  ].join('\n') + '\n');
}
