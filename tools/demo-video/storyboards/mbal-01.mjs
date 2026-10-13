// Material Balance Studio, demo 1: from pressure history to oil in place
// (Ekene kit v4). A new case on the discovery conditions, the kit's tank
// history through the import door, the PVT the rows carry, the
// compressibilities, the Havlena-Odeh regression (12.14 MM stb at r2 1),
// the level Campbell plot and the drive indices of an undersaturated oil.
// `expectText` steps stop the take if the screen disagrees with the
// narration (LENIENT=1 logs instead, for writing).
import {
  login, expectText, openStudio, deleteCases, createCase, confirmCase, dropFile, saveData, setPvt, runMbal,
  showPlot, t, tab, TANK,
} from './mbal-common.mjs';
const ooip = (d) => t(d, 'mbal-result-card').getByText(/^\d[\d.,]* (MMSTB|MSTB)$/).first();

const CASE = 'MBAL demo: Ekene Sand';

export default {
  id: 'mbal-01',
  app: 'Material Balance Studio',
  eyebrow: 'Material Balance Studio · 1 of 3',
  title: 'From pressure history to *oil in place*',
  subtitle: 'The Ekene tank history, the PVT it carries, the Havlena-Odeh line and the drive indices',
  outroTitle: 'Material balance *with Petrolord*',
  outroSub: 'Material Balance Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^MBAL demo: Ekene Sand$/);
    await openStudio(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Material Balance Studio', chapterSub: 'Oil in place from the pressure history',
      say: 'Material Balance Studio estimates the oil in place from the way the reservoir pressure falls as the field produces. Ekene came on stream in January twenty twenty, with a pressure survey every six months. We start a new case.',
      do: async (d) => {
        await d.sleep(2500);
        await d.click(d.page.getByRole('button', { name: 'Create a case' }));
        await d.page.locator('#name').waitFor();
        await d.sleep(600);
      } },
    { id: 'case', chapter: 'The case', chapterSub: 'Conditions at discovery',
      say: 'The case holds the conditions at discovery: an initial pressure of three thousand two hundred psia at the contact, a temperature of one hundred and eighty degrees Fahrenheit, a connate water saturation of zero point three five, and a bubble point of two thousand psia from the lab.',
      sub: 'The case holds the conditions at discovery: an initial pressure of 3,200 psia at the contact, a temperature of 180 °F, a connate water saturation of 0.35, and a bubble point of 2,000 psia from the lab.',
      do: async (d) => {
        await createCase(d, CASE, { onCamera: true, open: false });
        await d.sleep(500);
        await confirmCase(d, { onCamera: true });
      } },
    { id: 'drop', chapter: 'Data in', chapterSub: 'The tank history through the import door',
      say: 'The tank history is a plain table of pressures, cumulative volumes and the PVT at each survey. Before anything is saved, the import door shows what it read: seven rows, each column found by its name, and each unit read from its header.',
      do: async (d) => {
        await dropFile(d, TANK, { onCamera: true });
        await expectText(d, 'mbal-pending-status', /^7 rows read\. Ready to save\.$/, 'rows read');
        await d.highlight(t(d, 'mbal-import-mapping'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'saved',
      say: 'Saved to the case. The pressure falls from three thousand two hundred to two thousand and ninety six psia while the field produces two hundred and sixty one thousand barrels. Every survey is above the bubble point, so the oil is undersaturated, and there is no free gas in the reservoir.',
      sub: 'Saved to the case. The pressure falls from 3,200 to 2,096 psia while the field produces 261 thousand barrels. Every survey is above the bubble point, so the oil is undersaturated, and there is no free gas in the reservoir.',
      do: async (d) => {
        await saveData(d, { onCamera: true });
        const table = t(d, 'mbal-data-table');
        await expectText(d, table, /2023-01-01\s*2,096\.0\s*261\.475/, 'last survey');
        await table.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1200);
        await d.highlight(table);
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'pvt', chapter: 'PVT and rock', chapterSub: 'The rows carry their own PVT',
      say: 'The rows carry their own formation volume factor and solution gas, and the engine uses those first. Above the bubble point the pressure is held up only by the expansion of the oil, the rock and the connate water, so the compressibilities matter: four millionths per psi for the rock, from core, and three for the water.',
      do: async (d) => {
        await d.click(tab(d, 'PVT'));
        await t(d, 'mbal-pvt-cf').waitFor({ timeout: 60000 });
        await d.sleep(1200);
        const note = t(d, 'mbal-pvt-rows-first');
        if (await note.count()) { await d.highlight(note); await d.sleep(2500); await d.unhighlight(); }
        await setPvt(d, {}, { onCamera: true });
      } },
    { id: 'run', chapter: 'The regression', chapterSub: 'Havlena-Odeh',
      say: 'Run the material balance. Twelve point one four million stock tank barrels of oil in place, with an r squared of one on the six surveys after the initial state. The badge names the published benchmark this engine path reproduces.',
      sub: 'Run the material balance. 12.14 million stock tank barrels of oil in place, with an r² of one on the six surveys after the initial state. The badge names the published benchmark this engine path reproduces.',
      do: async (d) => {
        await runMbal(d, { onCamera: true });
        const card = t(d, 'mbal-result-card');
        await expectText(d, card, /OOIP\s*12\.14 MMSTB[\s\S]*Regression r2\s*1\.000000\s*6 points in the fit/, 'oil in place');
        await d.highlight(card.getByText('12.14 MMSTB'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.highlight(t(d, 'mbal-result-tier'));
        await d.sleep(1800);
        await d.unhighlight();
      } },
    { id: 'ho', chapter: 'The straight line', chapterSub: 'F against Et',
      say: 'Havlena and Odeh put the balance as a straight line. F, the reservoir voidage of what has been produced, against E t, the expansion of a barrel of oil and its share of rock and water. The slope is the oil in place, and the line goes through the origin, as it should when nothing else is supporting the pressure.',
      sub: 'Havlena and Odeh put the balance as a straight line. F, the reservoir voidage of what has been produced, against Et, the expansion of a barrel of oil and its share of rock and water. The slope is the oil in place, and the line goes through the origin, as it should when nothing else is supporting the pressure.',
      do: async (d) => {
        await d.click(tab(d, 'Plots'));
        const c = await showPlot(d, 'regression');
        await expectText(d, t(d, 'mbal-plot-notes-regression'), /N = 12\.14 MMSTB \(slope\)/, 'slope');
        await d.highlight(c);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'campbell', chapter: 'Is anything else at work?', chapterSub: 'The Campbell plot',
      say: 'The Campbell plot divides F by E t at each survey: the oil in place each survey implies on its own. The points sit on a level line at twelve point one four million barrels. Water coming in from an aquifer would make them climb as production goes on. Ekene is a closed tank.',
      sub: 'The Campbell plot divides F by Et at each survey: the oil in place each survey implies on its own. The points sit on a level line at 12.14 million barrels. Water coming in from an aquifer would make them climb as production goes on. Ekene is a closed tank.',
      do: async (d) => {
        const c = await showPlot(d, 'campbell');
        await d.highlight(c);
        await d.sleep(4500);
        await d.unhighlight();
      } },
    { id: 'drive', chapter: 'What drives the field', chapterSub: 'Drive indices',
      say: 'The drive indices split the energy. At the last survey, six tenths of the voidage comes from the expansion of the oil itself, and four tenths from the rock and the connate water. That is why the rock compressibility matters so much in an undersaturated oil.',
      do: async (d) => {
        const c = await showPlot(d, 'drive');
        await d.highlight(c);
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(tab(d, 'Run'));
        await d.sleep(1200);
        const card = t(d, 'mbal-result-card');
        await expectText(d, card, /Depletion \(DDI\)\s*0\.607[\s\S]*Rock and connate water \(CDI\)\s*0\.393/, 'drive indices');
        const idx = card.getByText('Depletion (DDI)').locator('xpath=ancestor::div[contains(@class,"grid")][1]');
        await idx.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.highlight(idx);
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'cf', chapter: 'How sure is the number?', chapterSub: 'Rock compressibility',
      say: 'How sure is it? The pressure history cannot fix the rock compressibility. The case uses four millionths per psi from core, and a consolidated sand can lie anywhere from three to six. At six millionths the oil in place drops to ten point five zero million barrels.',
      sub: 'How sure is it? The pressure history cannot fix the rock compressibility. The case uses four millionths per psi from core, and a consolidated sand can lie anywhere from three to six. At six millionths the oil in place drops to 10.50 million barrels.',
      do: async (d) => {
        await setPvt(d, { api: null, salinity: null, cw: null, cf: '6e-6' }, { onCamera: true });
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*10\.50 MMSTB/, 'cf 6e-6');
        await d.highlight(ooip(d));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'cf3',
      say: 'At three millionths it rises to thirteen point one six. Above the bubble point every term grows with the pressure drop, so more surveys will not narrow that range. A compressibility measured on core will.',
      sub: 'At three millionths it rises to 13.16. Above the bubble point every term grows with the pressure drop, so more surveys will not narrow that range. A compressibility measured on core will.',
      do: async (d) => {
        await setPvt(d, { api: null, salinity: null, cw: null, cf: '3e-6' }, { onCamera: true });
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*13\.16 MMSTB/, 'cf 3e-6');
        await d.highlight(ooip(d));
        await d.sleep(2500);
        await d.unhighlight();
      },
      wait: async (d) => {
        await setPvt(d, { api: null, salinity: null, cw: null, cf: '4e-6' });
        await runMbal(d);
      },
      waitLabel: 'Back to the core value' },
    { id: 'next', chapter: 'Pressure to oil in place', chapterSub: 'One case, one engine, one number',
      say: 'Twelve point one four million barrels from the pressure history alone, the same number the volumetric booking gives from the maps, with an honest range around it. Next, an oil rim with a gas cap and an aquifer, and contacts that move.',
      sub: 'Twelve point one four million barrels from the pressure history alone, the same number the volumetric booking gives from the maps, with an honest range around it. Next, an oil rim with a gas cap and an aquifer, and contacts that move.',
      do: async (d) => { await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*12\.14 MMSTB/, 'core value'); await d.sleep(2500); } },
  ],
};
