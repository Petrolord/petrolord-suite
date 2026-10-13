// Well Design Studio, demo 3: when the map moves (Ekene kit v4).
// Ekene-13, an Ekene Sand producer from Ekene Alpha, aims at a target taken
// from the six-well Ekene Sand top map ("WDS demo: Ekene Sand top", the
// series' own registry copy). Ekene-7 comes in deep, the mapper replaces
// the grid with the seven-well map (seed/wds_assets.mjs, the same grids as
// the ReservoirCalc Pro videos), and the Targets tab says the source
// changed. Refresh from source moves the target, the plan is solved to it
// again and saved. The NAPE paper's integration example in a drilling app.
import path from 'node:path';
import {
  login, expectText, openStudio, buildPad, seedEkene11, createWellbore, confirmWellbore, createDesign,
  targetFromSurface, confirmPick, selectDesign, solveJ, saveDesign, t, tab,
} from './wds-common.mjs';
import { openMapping } from '../seed/rcp.mjs';
import { replaceFromFile } from './rcp-common.mjs';
import { WDS_ASSETS, SEVEN_WELL_TOP } from '../seed/wds.mjs';

const SITE = 'WDS demo: Ekene Alpha';
const SURFACE = 'WDS demo: Ekene Sand top';
const SIX = path.join(WDS_ASSETS, 'EkeneSand-top-6wells-tvdss.zmap');
const SEVEN = path.join(WDS_ASSETS, SEVEN_WELL_TOP);
export const T3 = { name: 'T3 Ekene Sand west', e: '401400', n: '521600', below: '10' };
const view = (d, name) => d.page.getByRole('button', { name, exact: true }).first();
const kpis = (d) => d.page.getByText('TOTAL MD').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]');
const t3row = (d) => d.page.locator('tr', { hasText: T3.name }).first();

export default {
  id: 'wds-03',
  app: 'Well Design Studio',
  eyebrow: 'Well Design Studio · 3 of 3',
  title: 'When the map *moves*',
  subtitle: 'A target from the Ekene Sand map, a new well that changes the map, and a plan that knows',
  outroTitle: 'Well design *with Petrolord*',
  outroSub: 'Well Design Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    // the six-well grid back in place (a previous take replaced it)
    await openMapping(d, shared);
    await replaceFromFile(d, SURFACE, SIX);
    await buildPad(d, shared, SITE);
    await seedEkene11(d, SITE, { kop: '500' });
    await createWellbore(d, SITE, 'Ekene-13', { slot: 'S6' });
    await confirmWellbore(d);
    await createDesign(d, 'Ekene-13', 'Plan 1');
    await tab(d, 'Targets').click(); await d.sleep(1500);
    await targetFromSurface(d, { surface: SURFACE, x: T3.e, y: T3.n, below: T3.below, name: T3.name });
    await confirmPick(d);
    await tab(d, 'Design').click(); await d.sleep(1500);
    await solveJ(d, T3.name, { kop: '500', rate: '2.54' });
    await saveDesign(d);
    await openStudio(d, shared);
    await selectDesign(d, SITE, 'Ekene-13', 'Plan 1');
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Ekene-13', chapterSub: 'An Ekene Sand producer',
      say: 'Ekene thirteen is a new Ekene Sand producer from slot six, aimed west at T3. T3 came from the Ekene Sand top map in the registry, gridded on the six development wells, ten feet into the sand: four thousand nine hundred and eighty seven point two feet subsea. The build and hold kicks off at five hundred feet and reaches it in five thousand one hundred and seventy four feet of hole.',
      sub: 'Ekene-13 is a new Ekene Sand producer from slot S6, aimed west at T3. T3 came from the Ekene Sand top map in the registry, gridded on the six development wells, 10 ft into the sand: 4,987.2 ft subsea. The build and hold kicks off at 500 ft and reaches it in 5,174 ft of hole.',
      do: async (d) => {
        await d.sleep(1500);
        await expectText(d, kpis(d), /Total MD\s*5174[\s\S]*5069/i, 'Ekene-13 before');
        await d.highlight(kpis(d));
        await d.sleep(3000);
        await d.unhighlight();
        await d.click(tab(d, 'Targets'));
        await d.sleep(1500);
        await expectText(d, t3row(d), /4987\.2[\s\S]*Surface: WDS demo: Ekene Sand top, 10\.0 ft below/, 'T3 before');
        await d.highlight(t3row(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'map', chapter: 'A new well', chapterSub: 'The mapper replaces the grid',
      say: 'Then Ekene seven, the appraisal well, comes in nineteen feet deeper than the map predicted. The mapper grids the Ekene Sand top again with Ekene seven added and replaces the surface in the registry. Replace grid from a file keeps the surface\'s name and identity, so every app that uses it can see the change.',
      sub: 'Then Ekene-7, the appraisal well, comes in 19 ft deeper than the map predicted. The mapper grids the Ekene Sand top again with Ekene-7 added and replaces the surface in the registry. Replace grid from a file keeps the surface\'s name and identity, so every app that uses it can see the change.',
      do: async (d, shared) => {
        await openMapping(d, shared);
        await replaceFromFile(d, SURFACE, SEVEN, { onCamera: true, dwell: 3000 });
      } },
    { id: 'notice', chapter: 'The plan knows', chapterSub: 'Source changed',
      say: 'Back in Well Design Studio, the Targets tab checks every registry source it used. The Ekene Sand top was replaced after T3 was picked from it, so the notice says what changed, when and by whom, and the row carries a source changed badge.',
      do: async (d, shared) => {
        await openStudio(d, shared);
        await selectDesign(d, SITE, 'Ekene-13', 'Plan 1');
        await d.click(tab(d, 'Targets'));
        await t(d, 'wd-source-changed').waitFor({ timeout: 60000 });
        await d.sleep(1500);
        await expectText(d, t(d, 'wd-source-changed'), /moves T3 Ekene Sand west from 4,987\.2 to 5,004\.4 ft TVDSS \(17\.2 ft deeper\)/, 'effect');
        await d.highlight(t(d, 'wd-source-changed'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'refresh',
      say: 'The notice also says what a refresh would do: T3 moves seventeen point two feet deeper, to five thousand and four point four feet subsea. Refresh from source runs the same pick on the new map, keeps the ten foot stand-off, and the badge clears. The plan itself has not moved: it still ends where T3 used to be.',
      sub: 'The notice also says what a refresh would do: T3 moves 17.2 ft deeper, to 5,004.4 ft subsea. Refresh from source runs the same pick on the new map, keeps the 10 ft stand-off, and the badge clears. The plan itself has not moved: it still ends where T3 used to be.',
      do: async (d) => {
        await d.click(t(d, 'wd-source-changed').getByRole('button', { name: /Refresh from source/ }).first());
        await d.sleep(3000);
        await expectText(d, t3row(d), /5004\.4/, 'T3 after');
        await d.highlight(t3row(d));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'resolve', chapter: 'Solve again', chapterSub: 'The same method to the moved target',
      say: 'So solve it again, with the same method and the same kickoff: five thousand one hundred and ninety one feet of hole to T3 at its new depth, holding twelve point six degrees. Save, and everything downstream reads the corrected plan.',
      sub: 'So solve it again, with the same method and the same kickoff: 5,191 ft of hole to T3 at its new depth, holding 12.6°. Save, and everything downstream reads the corrected plan.',
      do: async (d) => {
        await d.click(tab(d, 'Design'));
        await d.page.getByText('TOTAL MD').first().waitFor();
        await d.sleep(1500);
        await solveJ(d, T3.name, { kop: '500', rate: '2.54', onCamera: true });
        await expectText(d, kpis(d), /Total MD\s*5191[\s\S]*5086[\s\S]*Max Inc\s*12\.6/i, 'Ekene-13 after');
        await d.highlight(kpis(d));
        await d.sleep(3000);
        await d.unhighlight();
        await saveDesign(d, { onCamera: true });
      } },
    { id: 'next', chapter: 'Well design with Petrolord', chapterSub: 'One map, one target, one plan',
      say: 'One new well, one replaced map, and the drilling plan that depends on it knows, says why, and is solved again in a minute. That is well design with Petrolord.',
      do: async (d) => { await d.sleep(3000); } },
  ],
};
