// ReservoirCalc Pro, demo 3: when the data changes (Ekene kit v4).
// Ekene-7 finds the Ekene Sand deeper than the six-well map predicted. The
// mapper replaces the top and base in Mapping & Surface Studio (Replace grid
// from a file: the seven-well grids, same engine and frame as the booking,
// seed/rcp_assets.mjs). The saved ReservoirCalc Pro project opens with
// "Registry source changed"; Refresh from source; STOIIP 12.14 to 10.42 MM
// stb; the audit trail records what was done. Setup puts the six-well grids
// back (in place, so the ids stay) and saves the booked project fresh.
import path from 'node:path';
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, TOP, BASE,
  DEMO_PROJECT, deleteProjects, saveProject, loadProject, openMapping, mapRow, replaceFromFile,
} from './rcp-common.mjs';

const ASSETS = process.env.RCP_ASSETS || '/root/demo-video-work/rcp-assets';
const SIX = { top: path.join(ASSETS, 'EkeneSand-top-6wells-tvdss.zmap'), base: path.join(ASSETS, 'EkeneSand-base-6wells-tvdss.zmap') };
const SEVEN = { top: path.join(ASSETS, 'EkeneSand-top-7wells-tvdss.zmap'), base: path.join(ASSETS, 'EkeneSand-base-7wells-tvdss.zmap') };
const card = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
const notice = (d) => t(d, 'rcp-source-changed');

export default {
  id: 'rcp-03',
  app: 'ReservoirCalc Pro',
  eyebrow: 'ReservoirCalc Pro · 3 of 3',
  title: 'When the *data changes*',
  subtitle: 'A new well moves the map, the volume says its source changed, and the refresh is on the record',
  outroTitle: 'Volumetrics *with Petrolord*',
  outroSub: 'ReservoirCalc Pro · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    // the six-well grids back in place (a previous take replaced them)
    await openMapping(d, shared);
    await replaceFromFile(d, TOP, SIX.top);
    await replaceFromFile(d, BASE, SIX.base);
    // the booked project, saved fresh on those grids
    await openRcp(d, shared);
    await deleteProjects(d, DEMO_PROJECT);
    // 1535 m TVDSS is 5,036.09 ft: the extra decimal keeps the seven-well
    // volume on the NAPE study's 10.42 MM stb (at -5036.1 it reads 10.43)
    await bookedCase(d, { owc: '-5036.09' });
    await stoiip(d);
    await saveProject(d, DEMO_PROJECT);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'When the data changes', chapterSub: 'The booked volume and its sources',
      say: 'The Ekene Sand is booked at twelve point one four million barrels, in a saved project that took its top and base from the shared registry. Then the field drills Ekene seven, and it finds the sand deeper than the six well map predicted.',
      sub: 'The Ekene Sand is booked at 12.14 million barrels, in a saved project that took its top and base from the shared registry. Then the field drills Ekene-7, and it finds the sand deeper than the six-well map predicted.',
      do: async (d) => {
        await expectText(d, t(d, 'rcp-project-name'), new RegExp(DEMO_PROJECT), 'saved project');
        await expectText(d, card(d), /12\.14 MM/, 'booked volume');
        await d.highlight(card(d));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'mapping', chapter: 'The map is redone', chapterSub: 'Mapping & Surface Studio',
      say: 'The mapper grids the top and base again with Ekene seven added, and replaces the surfaces in the registry. Replace grid from a file keeps each surface\'s name and id, so every app that uses it can see the change, and the old grid is kept.',
      sub: 'The mapper grids the top and base again with Ekene-7 added, and replaces the surfaces in the registry. Replace grid from a file keeps each surface\'s name and id, so every app that uses it can see the change, and the old grid is kept.',
      do: async (d, shared) => {
        await openMapping(d, shared);
        await d.click(mapRow(d, TOP).first());
        await d.sleep(1500);
        await replaceFromFile(d, TOP, SEVEN.top, { onCamera: true, dwell: 4000 });
      },
      wait: async (d) => { await replaceFromFile(d, BASE, SEVEN.base); },
      waitLabel: 'Seconds later' },
    { id: 'replaced',
      say: 'Both surfaces are replaced in place. The crest of the top is now at four thousand nine hundred and seventy two point eight feet, deeper than on the six well map.',
      sub: 'Both surfaces are replaced in place. The crest of the top is now at 4,972.8 ft, deeper than on the six-well map.',
      do: async (d) => {
        await d.click(mapRow(d, TOP).first());
        await d.sleep(2500);
        const st = d.page.getByText(/^Ekene Sand top \(6-well map\) · z /).first();
        await expectText(d, st, /to -4972\.8 ft/, 'new crest in the status line');
        await d.highlight(st);
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'notice', chapter: 'Source changed', chapterSub: 'ReservoirCalc Pro notices',
      say: 'Back in ReservoirCalc Pro, the saved project opens with a notice: two registry sources it used have changed since the volume was made. Nothing has moved yet. The engineer decides.',
      do: async (d, shared) => {
        await openRcp(d, shared);
        await loadProject(d, DEMO_PROJECT, { onCamera: true });
        await notice(d).waitFor({ timeout: 60000 });
        await expectText(d, notice(d), /Registry source changed \(2\)/, 'two sources changed');
        await d.highlight(notice(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'refresh', chapter: 'Refresh from source', chapterSub: 'The volume follows the map',
      say: 'Refresh from source reads both surfaces again. The gross rock volume falls, and the stock tank oil initially in place goes from twelve point one four to ten point four two million barrels.',
      sub: 'Refresh from source reads both surfaces again. The gross rock volume falls, and the stock tank oil initially in place goes from 12.14 to 10.42 million barrels.',
      do: async (d) => {
        for (let i = 0; i < 2; i++) {
          await d.click(t(d, 'rcp-source-changed-refresh').first());
          await d.sleep(2500);
        }
        await stoiip(d);
        await expectText(d, card(d), /10\.42 MM/, 'refreshed volume');
        await d.highlight(card(d));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'record', chapter: 'On the record', chapterSub: 'The audit trail and the saved project',
      say: 'The audit trail records each refresh, and saving puts the new volume and its sources in the project, so the next reviewer sees what changed and why.',
      do: async (d) => {
        await saveProject(d, DEMO_PROJECT, { onCamera: true });
        await d.click('rcp-tools');
        await d.sleep(1200);
        await d.click(d.page.getByText('Audit Trail', { exact: true }).first());
        await d.sleep(1500);
        await expectText(d, d.page.getByRole('dialog').last(), /Surface refreshed/, 'audit trail entry');
        await d.sleep(3000);
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'next', chapter: 'Decisions on current data', chapterSub: 'One registry, every app notified',
      say: 'One new well, one replaced map, and the volume that depends on it knows. That is volumetrics with Petrolord.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
