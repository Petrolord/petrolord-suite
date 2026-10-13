// Demo account seeding for the Well Design Studio videos (run as a probe):
//   node tools/demo-video/probe.mjs tools/demo-video/seed/wds.mjs
// Imports the WDS videos' own registry surfaces through Mapping & Surface
// Studio (seed/wds_assets.mjs writes the files), under names no other video
// uses. A name already listed is kept; WDS_REPLACE=1 deletes and re-imports.
import { login } from '../lib/session.mjs';
import { openMapping, mapRow, importGrid, deleteMapSurface } from './rcp.mjs';

export const WDS_ASSETS = process.env.WDS_ASSETS || '/root/demo-video-work/wds-assets';
export const SURFACES = [
  { name: 'WDS demo: Oboro Sand top', file: 'OboroSand-top-tvdss.zmap' },
  { name: 'WDS demo: Ekene Sand top', file: 'EkeneSand-top-6wells-tvdss.zmap' },
];
export const SEVEN_WELL_TOP = 'EkeneSand-top-7wells-tvdss.zmap';

export async function seedSurfaces(d, shared, log = () => {}, { replace = false } = {}) {
  await openMapping(d, shared);
  for (const s of SURFACES) {
    if (replace) await deleteMapSurface(d, s.name);
    if (await mapRow(d, s.name).count()) { log(`kept ${s.name}`); continue; }
    await importGrid(d, s.file, s.name, { dir: WDS_ASSETS });
    log(`imported ${s.name}: ${await mapRow(d, s.name).count()} row`);
  }
}

export default {
  viewport: { w: 1440, h: 810 },
  async probe(d, shared, log) {
    await login(d.page, shared.baseUrl, shared.env);
    await seedSurfaces(d, shared, log, { replace: !!process.env.WDS_REPLACE });
  },
};
