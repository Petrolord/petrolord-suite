// Material Balance Studio, demo 3: when the data changes (Ekene kit v4).
// The volumetric booking taken from ReservoirCalc Pro by id (12.14 MM stb),
// three more years of surveys under the waterflood (seed/mbal_assets.mjs)
// with the injection in the balance: still 12.14 MM stb, the injection index;
// the same rows with the injection left out (16.66 MM stb, r2 0.7940, a
// Campbell plot that climbs like an aquifer); the report's in-place volume
// by each method; the cross-check in ReservoirCalc Pro, which opens the
// project the volumetric estimate came from.
import {
  login, expectText, deleteCases, seedCase, dropFile, saveData, runMbal, showPlot, t, tab, FLOOD, RCP_PROJECT,
} from './mbal-common.mjs';

const CASE = 'MBAL demo: Ekene to 2025';

export default {
  id: 'mbal-03',
  app: 'Material Balance Studio',
  eyebrow: 'Material Balance Studio · 3 of 3',
  title: 'When the data *changes*',
  subtitle: 'Three more years under waterflood, injection in the balance, and the check against the volumetric booking',
  outroTitle: 'Material balance *with Petrolord*',
  outroSub: 'Material Balance Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^MBAL demo: Ekene to 2025$/);
    await seedCase(d, shared, CASE);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Material Balance Studio', chapterSub: 'The case meets new data',
      say: 'The Ekene case stands at twelve point one four million barrels on the surveys to January twenty twenty-three. Since then, Ekene-2 and Ekene-4 have injected water, and three more years of surveys have come in. Does the answer hold, and does it still agree with the volumetric booking?',
      sub: 'The Ekene case stands at 12.14 million barrels on the surveys to January 2023. Since then, Ekene-2 and Ekene-4 have injected water, and three more years of surveys have come in. Does the answer hold, and does it still agree with the volumetric booking?',
      do: async (d) => {
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*12\.14 MMSTB/, 'starting point');
        await d.sleep(3000);
      } },
    { id: 'volumetric', chapter: 'The volumetric booking', chapterSub: 'Read from ReservoirCalc Pro by id',
      say: 'First, the volumetric estimate. It is not typed: the case takes it from the saved ReservoirCalc Pro project of the booked case, by its id. Twelve point one four million stock tank barrels, from the surfaces method, and the case records where it came from and when.',
      sub: 'First, the volumetric estimate. It is not typed: the case takes it from the saved ReservoirCalc Pro project of the booked case, by its id. 12.14 million stock tank barrels, from the surfaces method, and the case records where it came from and when.',
      do: async (d) => {
        await d.click('mbal-volumetric-from-rcp');
        await t(d, 'mbal-volumetric-project').waitFor({ timeout: 30000 });
        await d.sleep(800);
        await d.select(t(d, 'mbal-volumetric-project'), { label: RCP_PROJECT });
        await d.sleep(800);
        await d.click('mbal-volumetric-take');
        await d.waitText('mbal-volumetric-value', /12\.14 MMSTB/);
        await expectText(d, 'mbal-volumetric-source', /^Taken from ReservoirCalc Pro project "MBAL demo: Ekene booked volumetric".*surfaces method/, 'volumetric source');
        await d.highlight(t(d, 'mbal-volumetric'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'flood', chapter: 'New data', chapterSub: 'Three years under waterflood',
      say: 'Now the new surveys. The file carries the same columns as before, and one more: the cumulative water injected. The import door finds it by name. Thirteen rows, ready to save.',
      do: async (d) => {
        await d.click(tab(d, 'Data'));
        await d.sleep(1000);
        await dropFile(d, FLOOD, { onCamera: true });
        await expectText(d, 'mbal-pending-status', /^13 rows read\. Ready to save\.$/, 'rows read');
        const row = t(d, 'mbal-import-row-cum_water_inj_stb');
        await row.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.highlight(row);
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'table',
      say: 'Saved. Once injection replaced the voidage, the pressure stopped falling, and it has climbed back to two thousand one hundred and nineteen psia by August twenty twenty-five, with one hundred and ninety six thousand barrels of water injected.',
      sub: 'Saved. Once injection replaced the voidage, the pressure stopped falling, and it has climbed back to 2,119 psia by August 2025, with 196 thousand barrels of water injected.',
      do: async (d) => {
        await saveData(d, { onCamera: true });
        const table = t(d, 'mbal-data-table');
        await expectText(d, table, /2025-08-01\s*2,118\.5/, 'last survey');
        const last = table.locator('tr').last();
        await last.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(table.locator('tbody'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'run', chapter: 'Injection in the balance', chapterSub: 'Net withdrawal',
      say: 'Run it. The injected water comes off the withdrawal, so F is the net voidage. Twelve point one four million barrels again, now on twelve surveys, still with an r squared of one. The engine path with injection is a published method, and the badge says so.',
      sub: 'Run it. The injected water comes off the withdrawal, so F is the net voidage. 12.14 million barrels again, now on twelve surveys, still with an r² of one. The engine path with injection is a published method, and the badge says so.',
      do: async (d) => {
        await runMbal(d, { onCamera: true });
        const card = t(d, 'mbal-result-card');
        await expectText(d, card, /OOIP\s*12\.14 MMSTB[\s\S]*Regression r2\s*1\.000000\s*12 points in the fit/, 'flood run');
        await d.highlight(card.locator('div.grid').first());
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'widi',
      say: 'The drive indices now carry the injection. At the last survey, the injected water supplies nought point three nine four of the voidage, beside nought point three seven one from the oil and nought point two four from the rock and connate water.',
      sub: 'The drive indices now carry the injection. At the last survey, the injected water supplies 0.394 of the voidage, beside 0.371 from the oil and 0.240 from the rock and connate water.',
      do: async (d) => {
        const card = t(d, 'mbal-result-card');
        await expectText(d, card, /Depletion \(DDI\)\s*0\.371[\s\S]*Rock and connate water \(CDI\)\s*0\.240[\s\S]*Water injection \(WIDI\)\s*0\.394/, 'injection index');
        const idx = card.getByText('Depletion (DDI)').locator('xpath=ancestor::div[contains(@class,"grid")][1]');
        await idx.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.highlight(idx);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'without', chapter: 'Leave the injection out', chapterSub: 'What a careless import does',
      say: 'Leave the injection column out at the door, and run the same surveys again. The oil in place jumps to sixteen point six six million barrels, the r squared falls to nought point seven nine four, and the engine warns.',
      sub: 'Leave the injection column out at the door, and run the same surveys again. The oil in place jumps to 16.66 million barrels, the r² falls to 0.7940, and the engine warns.',
      do: async (d) => {
        await d.click(tab(d, 'Data'));
        await d.sleep(800);
        await dropFile(d, FLOOD, { onCamera: true });
        const sel = t(d, 'mbal-import-col-cum_water_inj_stb');
        await sel.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(800);
        await d.select(sel, { label: 'Not in the file' });
        await d.sleep(600);
        await saveData(d, { onCamera: true });
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*16\.66 MMSTB[\s\S]*Regression r2\s*0\.7940/, 'without injection');
        await d.highlight(t(d, 'mbal-result-card').locator('div.grid').first());
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'campbell',
      say: 'On the Campbell plot, the points after the flood started climb, the signature of water coming in. Left out of the balance, injected water looks like an aquifer.',
      do: async (d) => {
        await d.click(tab(d, 'Plots'));
        const c = await showPlot(d, 'campbell');
        await d.highlight(c);
        await d.sleep(4000);
        await d.unhighlight();
      },
      wait: async (d) => {
        await d.click(tab(d, 'Data'));
        await dropFile(d, FLOOD);
        await saveData(d);
        await runMbal(d);
      },
      waitLabel: 'Injection back in the balance' },
    { id: 'report', chapter: 'Two methods, one number', chapterSub: 'The report',
      say: 'With the injection back in, the report sets the methods side by side: the Havlena-Odeh slope, the Campbell level, and the volumetric estimate from ReservoirCalc Pro, all at twelve point one four million barrels, with the source of each.',
      sub: 'With the injection back in, the report sets the methods side by side: the Havlena-Odeh slope, the Campbell level, and the volumetric estimate from ReservoirCalc Pro, all at 12.14 million barrels, with the source of each.',
      do: async (d) => {
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*12\.14 MMSTB[\s\S]*12 points in the fit/, 'restored');
        await d.click(tab(d, 'Report'));
        await d.sleep(2500);
        const tbl = d.page.locator('table').filter({ hasText: 'Campbell level' }).first();
        await expectText(d, tbl, /Havlena-Odeh, F against Et \(slope\)\s*12\.14 MMSTB[\s\S]*Campbell level\)\s*12\.14 MMSTB[\s\S]*Volumetric estimate\s*12\.14 MMSTB\s*\+0\.0%/, 'methods table');
        await tbl.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(tbl);
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'rcp', chapter: 'The cross-check', chapterSub: 'In ReservoirCalc Pro',
      say: 'And the other way round: the cross-check opens ReservoirCalc Pro on the same project and prints the material balance beside its volumetric result. The two agree, and each side names the case, the run and the project it came from.',
      do: async (d) => {
        await d.click(tab(d, 'Run'));
        await d.sleep(1200);
        await d.click('mbal-send-rcp');
        await d.waitText('rcp-mbal-check-values', /agree/, { timeout: 90000 });
        await expectText(d, 'rcp-mbal-check-values', /OOIP by material balance 12\.14 MMSTB; this project's deterministic volumetric STOIIP 12\.14 MMSTB; the two agree to within 0\.1 percent\. Project: "MBAL demo: Ekene booked volumetric"\./, 'cross-check');
        await d.sleep(800);
        await d.highlight(t(d, 'rcp-mbal-check'));
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'When the data changes', chapterSub: 'Same rock, same number, every source named',
      say: 'Three more years of data, injection in the balance, and the material balance still lands on the volumetric booking, with every number traceable to where it came from. That is material balance with Petrolord.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
