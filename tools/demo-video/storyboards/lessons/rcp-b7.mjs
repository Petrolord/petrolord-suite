// Volumetrics with Petrolord, Lesson B7: fluids.
// The formation volume factor from a correlation (Standing, from API 32,
// gas gravity 0.75, Rs 400 scf/stb, 180 degF, the Ekene PVT) against the
// laboratory value of 1.200 rb/stb, solution gas from Rs, and a what-if
// gas cap on the Ekene map (Oil + Gas with a GOC) with free gas and the
// oil leg reported apart.
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, rcpLessonMeta,
} from './rcp-common.mjs';

const card = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');
const fvf = (d) => d.page.locator('div.space-y-1:has(> label:text-is("Formation Vol Factor (Bo)")) input').first();
const calcField = (d, label) => dialog(d).locator(`div:has(> label:text-is("${label}")) input`).first();

export default {
  id: 'lesson-rcp-b7',
  ...rcpLessonMeta(7, 'B', '*Fluids*', 'Formation volume factor, solution gas and a gas cap'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await bookedCase(d);
    await d.page.getByRole('tab', { name: 'Fluid' }).click();
    await fvf(d).fill('1.2');
    await d.page.keyboard.press('Tab');
    await stoiip(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'bo', chapter: 'Formation volume factor', chapterSub: 'Reservoir barrels per stock tank barrel',
      say: 'Oil shrinks as it comes to the surface and its gas comes out. The formation volume factor turns reservoir barrels into stock tank barrels. The Ekene P V T laboratory measured one point two zero zero at the initial pressure.',
      sub: 'Oil shrinks as it comes to the surface and its gas comes out. The formation volume factor turns reservoir barrels into stock tank barrels. The Ekene PVT laboratory measured 1.200 at the initial pressure.',
      do: async (d) => {
        await d.highlight(fvf(d));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'standing', chapter: 'A correlation', chapterSub: 'Standing, before the laboratory',
      say: 'Before a sample is measured, a correlation estimates it. The calculator uses Standing\'s correlation: thirty two A P I oil, gas gravity zero point seven five, four hundred standard cubic feet per barrel of solution gas, at one hundred and eighty degrees Fahrenheit. It gives one point two three three three.',
      sub: 'Before a sample is measured, a correlation estimates it. The calculator uses Standing\'s correlation: 32 API oil, gas gravity 0.75, 400 scf per barrel of solution gas, at 180 degrees Fahrenheit. It gives 1.2333.',
      do: async (d) => {
        await d.click(d.page.locator('div:has(> label:text-is("Oil Properties")) button').first());
        await dialog(d).waitFor();
        await d.type(calcField(d, 'Oil Gravity (API)'), '32');
        await d.type(calcField(d, 'Gas Gravity (Air=1)'), '0.75');
        await d.type(calcField(d, 'Solution GOR (scf/stb)'), '400');
        await d.type(calcField(d, 'Temp (F)'), '180');
        await d.click(dialog(d).getByRole('button', { name: 'Calculate Bo' }));
        await d.sleep(1500);
        const v = await fvf(d).inputValue();
        if (v !== '1.2333' && !process.env.LENIENT) throw new Error(`Narration mismatch at "Standing Bo": field shows ${v}`);
        await d.highlight(fvf(d));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'effect',
      say: 'On the correlation the volume is eleven point eight one million barrels; on the laboratory value, twelve point one four. One small number moves the whole volume: use the measured value once there is one.',
      do: async (d) => {
        await stoiip(d);
        await expectText(d, t(d, 'rcp-stooip'), /11\.81 MM/, 'correlation volume');
        await d.highlight(card(d));
        await d.sleep(2000);
        await d.unhighlight();
        await d.type(fvf(d), '1.2');
        await d.page.keyboard.press('Tab');
        await stoiip(d);
        await expectText(d, t(d, 'rcp-stooip'), /12\.14 MM/, 'lab volume');
      } },
    { id: 'rs', chapter: 'Solution gas', chapterSub: 'Gas dissolved in the oil',
      say: 'The oil also holds gas in solution. Type the solution gas oil ratio, four hundred, and the results add the solution gas in place, stock tank oil times the ratio: four point eight five seven billion standard cubic feet.',
      sub: 'The oil also holds gas in solution. Type the solution gas-oil ratio, 400, and the results add the solution gas in place, stock tank oil times the ratio: 4.857 billion standard cubic feet.',
      do: async (d) => {
        await d.type(t(d, 'rcp-rs'), '400');
        await d.page.keyboard.press('Tab');
        await stoiip(d);
        await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
        await d.sleep(1500);
        await d.click(dialog(d).getByText('Detailed', { exact: true }));
        const sg = t(d, 'rcp-solution-gas');
        await sg.waitFor({ timeout: 30000 });
        await expectText(d, sg, /Solution gas in place: 4\.857 Bscf \(Rs 400\)/, 'solution gas');
        await d.highlight(sg);
        await d.sleep(3000);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'gascap', chapter: 'A gas cap', chapterSub: 'Oil + Gas, as a what-if',
      say: 'Ekene has no gas cap, but suppose it had one down to five thousand feet. Choose Oil plus Gas and type the gas oil contact. The rock above the contact is split: free gas above five thousand feet, oil between the two contacts.',
      sub: 'Ekene has no gas cap, but suppose it had one down to 5,000 ft. Choose Oil + Gas and type the gas-oil contact. The rock above the contact is split: free gas above 5,000 ft, oil between the two contacts.',
      do: async (d) => {
        await d.click(d.page.getByText('Oil + Gas', { exact: true }).first());
        await d.sleep(800);
        await d.click('rcp-tab-geometry');
        await d.sleep(500);
        const goc = d.page.locator('#goc-input');
        await goc.scrollIntoViewIfNeeded();
        await d.click(goc);
        await goc.fill('');
        await d.page.keyboard.type('-5000', { delay: 90 });
        await d.page.keyboard.press('Enter');
        await stoiip(d);
      } },
    { id: 'split',
      say: 'The oil leg alone now holds eight point nine nine seven million barrels, and the results report the free gas apart: four point two three seven billion standard cubic feet. Each stream has its own recovery factor on the Fluid tab.',
      sub: 'The oil leg alone now holds 8.997 million barrels, and the results report the free gas apart: 4.237 billion standard cubic feet. Each stream has its own recovery factor on the Fluid tab.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /View Full Results/ }));
        await d.sleep(1500);
        await d.click(dialog(d).getByText('Detailed', { exact: true }));
        await d.sleep(1500);
        await expectText(d, dialog(d), /8,997,122 STB[\s\S]*GIIP \(free gas\)[\s\S]*4\.237 Bscf/i, 'oil leg and free gas');
        await d.sleep(4000);
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Monte Carlo',
      say: 'Module C turns to uncertainty, starting with the Monte Carlo set up.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
