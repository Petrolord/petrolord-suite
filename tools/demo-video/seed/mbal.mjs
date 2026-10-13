// Demo account seeding for the Material Balance Studio videos (run as a probe):
//   node tools/demo-video/probe.mjs tools/demo-video/seed/mbal.mjs
// Saves a ReservoirCalc Pro project of the field's booked volumetric case
// (the six-well Ekene Sand maps the RCP videos use, contact 5,036 ft TVDSS,
// NTG 0.80, porosity 0.20, Sw 0.35, Bo 1.20: 12.14 MM stb) under a name no
// other video uses, so demo 3 can take the volumetric estimate from it by id.
// The RCP demo projects and the registry maps are read, never changed.
// A project of that name is deleted first. MBAL_CLEAN=1 also deletes every
// Material Balance case whose name starts "MBAL demo", "MBAL probe" or "Lesson".
import { login } from '../lib/session.mjs';
import { openRcp, bookedCase, stoiip, saveProject, deleteProjects } from '../storyboards/rcp-common.mjs';

export const RCP_PROJECT = 'MBAL demo: Ekene booked volumetric';
export const MBAL = '/dashboard/apps/reservoir/reservoir-balance';
export const OWN_CASE = /^(MBAL demo|MBAL probe|Lesson)/;

/** Off camera: delete Material Balance cases whose names match. */
export async function deleteCases(d, shared, re = OWN_CASE) {
  const p = d.page;
  await p.goto(`${shared.baseUrl}${MBAL}`, { waitUntil: 'domcontentloaded' });
  await d.sleep(4000);
  for (let n = 0; n < 20; n++) {
    await p.getByRole('combobox').first().click();
    await d.sleep(800);
    const opts = await p.getByRole('option').allInnerTexts();
    const name = opts.map((o) => o.trim()).find((o) => re.test(o));
    if (!name) { await p.keyboard.press('Escape'); break; }
    await p.getByRole('option', { name, exact: true }).first().click();
    await d.sleep(3000);
    await p.locator('button:has(svg.lucide-trash2), button:has(svg.lucide-trash-2)').first().click();
    await d.sleep(800);
    const confirm = p.getByRole('alertdialog').getByRole('button', { name: /Delete/ });
    if (await confirm.count()) await confirm.first().click();
    await d.sleep(3000);
  }
}

export default {
  viewport: { w: 1440, h: 810 },
  async probe(d, shared, log) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    if (process.env.MBAL_CLEAN === '1') { await deleteCases(d, shared); log('own MBAL cases deleted'); }
    await openRcp(d, shared);
    await deleteProjects(d, RCP_PROJECT);
    await bookedCase(d);
    const v = await stoiip(d);
    log('RCP STOIIP', v);
    if (!/12\.14 MM/.test(v)) throw new Error(`booked case reads ${v}, expected 12.14 MM`);
    await saveProject(d, RCP_PROJECT);
    log('saved', RCP_PROJECT);
  },
};
