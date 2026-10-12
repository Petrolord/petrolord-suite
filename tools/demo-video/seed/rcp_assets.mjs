// The ReservoirCalc Pro videos' extra files: the Ekene Sand top and base
// re-gridded with Ekene-7 added to the six development wells, on the same
// engine, frame and options as the kit's booked six-well maps
// (02-surfaces/EkeneSand-*-6wells.zmap). Demo 3 replaces the booked maps
// with these in the registry, as a mapper would after the well.
// The kit's grids are elevations below the rig floor (KB, 25 m above sea
// level; wells 1 to 7 are vertical, so this is MD). The *-tvdss files are
// the same grids on the registry's datum, mean sea level (TVDSS = MD - 25 m),
// so the contact is 1535 m (5,036 ft) TVDSS, as in the Seismolord videos.
//   esbuild --bundle --platform=node --format=esm tools/demo-video/seed/rcp_assets.mjs --outfile=/tmp/a.mjs
//   node /tmp/a.mjs [outDir] [kitDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topsToPoints, specForPoints } from '../../../packages/engines/engines/mapping/surface.js';
import { gridSurface } from '../../../packages/engines/lib/gridding/gridding.js';
import { writeZMAP } from '../../../packages/engines/lib/gridding/surfaceExport.js';
import { LOCKED_WELLS, LOCKED_E7, GRID, FRAME } from '../../demo-dataset/spine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || '/root/demo-video-work/rcp-assets';
const kit = process.argv[3] || path.resolve(HERE, '../../../dist-demo/ekene-demo-v4');
const tops = fs.readFileSync(path.join(kit, '01-wells/tops/Ekene-7-tops.csv'), 'utf8').trim().split(/\r?\n/);
const h = tops[0].split(',');
const row = (n) => { const r = tops.slice(1).map((l) => l.split(',')).find((c) => c[h.indexOf('top_name')] === n); return +r[h.indexOf('md_m')]; };
const e7 = { name: 'Ekene-7', x: LOCKED_E7.x, y: LOCKED_E7.y, top_sand: row('Ekene Sand'), base_sand: row('Ekene Sand Base') };
if (e7.top_sand !== LOCKED_E7.top_sand) throw new Error(`Ekene-7 top ${e7.top_sand} is not the locked ${LOCKED_E7.top_sand}`);

const engineWells = (list) => list.map((w) => ({ name: w.name, surface_x: w.x, surface_y: w.y, tops: [{ name: 'TOP_SAND', md_m: w.top_sand }, { name: 'BASE_SAND', md_m: w.base_sand }] }));
const spec = specForPoints(topsToPoints(engineWells(LOCKED_WELLS), 'TOP_SAND'), GRID.cell_m, GRID.pad_cells);
const opts = { maxExtrapolation: GRID.max_extrapolation_m };
const crsLabel = `${FRAME.crs} (${FRAME.crs_name})`;
const gridObject = (z, name) => ({
  x: Array.from({ length: spec.nx }, (_, i) => FRAME.origin_e + spec.x0 + i * spec.dx),
  y: Array.from({ length: spec.ny }, (_, r) => FRAME.origin_n + spec.y0 + r * spec.dy),
  z, nx: spec.nx, ny: spec.ny, dx: spec.dx, dy: spec.dy, name, crsLabel,
});
fs.mkdirSync(out, { recursive: true });
for (const [label, wells] of [['6wells', LOCKED_WELLS], ['7wells', [...LOCKED_WELLS, e7]]]) {
  const ew = engineWells(wells);
  for (const [key, top, nm] of [['top', 'TOP_SAND', 'EKENE_SAND_TOP'], ['base', 'BASE_SAND', 'EKENE_SAND_BASE']]) {
    const z = gridSurface(topsToPoints(ew, top), spec, opts).z;
    const f = path.join(out, `EkeneSand-${key}-${label}.zmap`);
    fs.writeFileSync(f, writeZMAP(gridObject(z, nm)));
    const tv = Float32Array.from(z, (v) => (Math.abs(v) >= 1e29 ? v : v + FRAME.kb_m));
    const ft = path.join(out, `EkeneSand-${key}-${label}-tvdss.zmap`);
    fs.writeFileSync(ft, writeZMAP(gridObject(tv, `${nm}_TVDSS`)));
    console.log(f, ft);
  }
}
