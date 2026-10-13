// The Well Design Studio videos' extra files (no dependencies):
//   node tools/demo-video/seed/wds_assets.mjs [outDir] [kitDir] [rcpAssetsDir]
// 1. OboroSand-top-tvdss.zmap: the kit's Oboro Sand top (02-surfaces, an
//    elevation below the rig floor, KB 25 m above sea level) put on the
//    registry's datum, mean sea level: z + 25 m. At T1 (402250 E, 521750 N)
//    it reads -1877.36 m, so the kit's T1, 8 m below the top, is 1885.36 m
//    TVDSS (07-well-design/ekene-11-targets.csv).
// 2. The six- and seven-well Ekene Sand tops on the sea-level datum, copied
//    from seed/rcp_assets.mjs's output (demo 3 imports the first under its
//    own name and replaces it with the second, as the mapper does after
//    Ekene-7).
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || '/root/demo-video-work/wds-assets';
const kit = process.argv[3] || '/root/wt-kit4/dist-demo/ekene-demo-v4';
const rcp = process.argv[4] || '/root/demo-video-work/rcp-assets';
fs.mkdirSync(out, { recursive: true });

/** Shift every non-null node of a ZMAP+ grid by dz (header kept). */
export function shiftZmap(text, dz, rename = null) {
  const lines = text.split('\n');
  let at = 0; let seen = 0;
  for (; at < lines.length; at++) if (lines[at].startsWith('@')) { seen++; if (seen === 2) break; }
  const head = lines.slice(0, at + 1).map((l) => (rename && l.startsWith('@') && seen && l.includes('HEADER') ? l.replace(/^@\S+/, `@${rename}`) : l));
  const nullLine = head.find((l) => /E\+30/.test(l));
  const nullV = nullLine ? Number(nullLine.split(',')[1]) : 1e30;
  const body = lines.slice(at + 1).map((l) => l.replace(/-?\d+\.\d+E[+-]\d+/g, (m) => {
    const v = Number(m);
    return Math.abs(v) >= Math.abs(nullV) * 0.999 ? m : (v + dz).toExponential(7).toUpperCase().replace(/E([+-])(\d)$/, 'E$10$2');
  }));
  return [...head, ...body].join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('wds_assets.mjs')) {
  const ob = fs.readFileSync(path.join(kit, '02-surfaces/OboroSand-top.zmap'), 'utf8');
  fs.writeFileSync(path.join(out, 'OboroSand-top-tvdss.zmap'), shiftZmap(ob, 25, 'OBORO_SAND_TOP_TVDSS').replace('GRID: OBORO_SAND_TOP', 'GRID: OBORO_SAND_TOP_TVDSS'));
  for (const f of ['EkeneSand-top-6wells-tvdss.zmap', 'EkeneSand-top-7wells-tvdss.zmap']) fs.copyFileSync(path.join(rcp, f), path.join(out, f));
  // 3. Ekene-11's first MWD run, drilled to 1,500 m MD: the kit's Ekene-11
  //    survey (01-wells/surveys, same slot, kickoff, rate and azimuth as the
  //    plan, aimed 8 m deeper) cut at 1,500 m, MD, inclination and grid
  //    azimuth only, for the plan-versus-actual and project-ahead lesson.
  const sv = fs.readFileSync(path.join(kit, '01-wells/surveys/Ekene-11-survey.csv'), 'utf8').trim().split(/\r?\n/);
  const head = sv[0].split(',');
  const col = (n) => head.indexOf(n);
  const rows = sv.slice(1).map((l) => l.split(',')).filter((c) => Number(c[col('md_m')]) <= 1500 + 1e-9);
  fs.writeFileSync(path.join(out, 'Ekene-11-mwd-run1.csv'), ['MD (m),Inc (deg),Azi grid (deg)', ...rows.map((c) => [c[col('md_m')], c[col('inclination_deg')], c[col('azimuth_deg_grid')]].join(','))].join('\n') + '\n');
  console.log(fs.readdirSync(out).join('\n'));
}
