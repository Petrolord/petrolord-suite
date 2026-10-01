// Corner-point export (Earth Modeling upgrade U2-011, 2026-10-01): the
// built model as an Eclipse GRDECL include that Reservoir Simulation Studio
// (OPM Flow) reads. One cell layer per zone; pillars stand vertically at
// the model nodes, so the grid has (nx - 1) x (ny - 1) columns and each
// cell's top and bottom corners are the zone top and base at its four
// nodes. Keywords:
//   SPECGRID  NX NY NZ 1 F
//   COORD     a vertical pillar per node: x y z_top x y z_bottom (metres)
//   ZCORN     8 corner depths per cell, Eclipse order (k, then top face
//             then bottom face, j, the two corners of each i)
//   ACTNUM    0 where a corner is unmapped, the cell has no thickness or a
//             property is missing
//   PORO NTG  the mean of the four node values (fractions)
// and a SOLUTION-section include with SWAT (the initial water saturation,
// the mean of the four node Sw values), because SWAT is not a GRID keyword.
// Depths are TVDSS metres positive down (METRIC); XY in metres in the
// model's CRS. Permeability is not modelled here, so the deck must add
// PERMX/Y/Z (the header says so). Pure.

import { isNull } from '@/lib/gridding/gridmath';
import { buildLabel } from '@/lib/platformBuild';

const fmt = (v) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));

/** "n*v" runs for repeated values; lines of at most 8 tokens. */
export function packValues(values) {
  const tokens = [];
  let i = 0;
  while (i < values.length) {
    let j = i + 1;
    while (j < values.length && values[j] === values[i]) j += 1;
    const n = j - i;
    tokens.push(n > 1 ? `${n}*${values[i]}` : String(values[i]));
    i = j;
  }
  const lines = [];
  for (let k = 0; k < tokens.length; k += 8) lines.push(`  ${tokens.slice(k, k + 8).join(' ')}`);
  return lines.join('\n');
}

/**
 * @param {object} built a built model (clamped depth grids on specM, zones with props)
 * @param {{name?: string, now?: Date, build?: string}} [opts]
 * @returns {{text: string, fileName: string, dims: {nx, ny, nz}, active: number, cells: number}}
 */
export function grdeclText(built, { name = 'earth-model', now = new Date(), build = buildLabel() } = {}) {
  if (!built?.zones?.length) throw new Error('Build the model first; there is no grid to export.');
  const S = built.specM || built.spec;
  if (S.nx < 2 || S.ny < 2) throw new Error('A corner-point grid needs at least 2 x 2 model nodes.');
  const NX = S.nx - 1; const NY = S.ny - 1; const NZ = built.zones.length;
  const node = (i, j) => j * S.nx + i;
  const tops = built.clamped;
  let zMin = Infinity; let zMax = -Infinity;
  for (let k = 0; k <= NZ; k++) for (const v of tops[k]) if (!isNull(v)) { if (v < zMin) zMin = v; if (v > zMax) zMax = v; }
  if (!Number.isFinite(zMin)) throw new Error('The model has no mapped node to export.');
  // COORD: (NX + 1) x (NY + 1) vertical pillars
  const coord = [];
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = fmt(S.x0 + i * S.dx); const y = fmt(S.y0 + j * S.dy);
      coord.push(`  ${x} ${y} ${fmt(zMin)} ${x} ${y} ${fmt(zMax)}`);
    }
  }
  // ZCORN and the cell properties
  const zc = [];
  const actnum = []; const poro = []; const ntg = []; const swat = [];
  const corner = (g, i, j) => g[node(i, j)];
  for (let k = 0; k < NZ; k++) {
    for (const face of [tops[k], tops[k + 1]]) {
      for (let j = 0; j < NY; j++) {
        for (const jj of [j, j + 1]) {
          for (let i = 0; i < NX; i++) {
            for (const ii of [i, i + 1]) {
              const v = corner(face, ii, jj);
              zc.push(isNull(v) ? zMax : v);
            }
          }
        }
      }
    }
    const z = built.zones[k];
    const mean4 = (g, i, j) => {
      if (!g) return null;
      const vs = [g[node(i, j)], g[node(i + 1, j)], g[node(i, j + 1)], g[node(i + 1, j + 1)]];
      if (vs.some((v) => isNull(v) || !Number.isFinite(v))) return null;
      return (vs[0] + vs[1] + vs[2] + vs[3]) / 4;
    };
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cs = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
        const mapped = cs.every(([a, b]) => !isNull(corner(tops[k], a, b)) && !isNull(corner(tops[k + 1], a, b)));
        const thick = mapped ? cs.reduce((s, [a, b]) => s + corner(tops[k + 1], a, b) - corner(tops[k], a, b), 0) / 4 : 0;
        const p = mean4(z.props.phi, i, j); const n = mean4(z.props.ntg, i, j); const w = mean4(z.props.sw, i, j);
        const on = mapped && thick > 1e-6 && p !== null && n !== null && w !== null;
        actnum.push(on ? 1 : 0);
        poro.push(on ? Number(p.toFixed(5)) : 0);
        ntg.push(on ? Number(n.toFixed(5)) : 0);
        swat.push(on ? Number(w.toFixed(5)) : 1);
      }
    }
  }
  const active = actnum.reduce((a, b) => a + b, 0);
  const zcLines = [];
  for (let q = 0; q < zc.length; q += 6) zcLines.push(`  ${zc.slice(q, q + 6).map(fmt).join(' ')}`);
  const header = [
    `-- ${name}: corner-point grid from Petrolord Earth Modeling`,
    `-- ${build}; written ${now.toISOString().slice(0, 10)}`,
    `-- METRIC: XY metres${built.crs ? ` in ${built.crs}` : ' (no CRS recorded)'}, depth TVDSS metres positive down`,
    `-- ${NX} x ${NY} columns on vertical pillars at the model nodes, one layer per zone: ${built.zones.map((z) => z.name).join(', ')}`,
    `-- PORO, NTG and SWAT are the mean of the four node values; ${active} of ${NX * NY * NZ} cells active`,
    '-- Permeability is not modelled in Earth Modeling: add PERMX, PERMY and PERMZ in the deck',
    '-- GRID section include; the initial Sw (SWAT) is the SOLUTION include written beside it',
  ];
  const kw = (k, body) => `${k}\n${body}\n/\n`;
  const text = [
    ...header, '',
    kw('SPECGRID', `  ${NX} ${NY} ${NZ} 1 F`),
    kw('COORD', coord.join('\n')),
    kw('ZCORN', zcLines.join('\n')),
    kw('ACTNUM', packValues(actnum)),
    kw('PORO', packValues(poro)),
    kw('NTG', packValues(ntg)),
  ].join('\n');
  const base = String(name).replace(/[^\w-]+/g, '_').toUpperCase() || 'EARTH_MODEL';
  const swatText = [`-- ${name}: initial water saturation (SOLUTION section) from Petrolord Earth Modeling`, `-- ${build}; ${NX} x ${NY} x ${NZ} cells, inactive cells 1`, '', kw('SWAT', packValues(swat))].join('\n');
  return { text, fileName: `${base}.GRDECL`, swatText, swatFileName: `${base}_SWAT.INC`, dims: { nx: NX, ny: NY, nz: NZ }, active, cells: NX * NY * NZ };
}
