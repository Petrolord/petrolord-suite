// Material Balance with Petrolord, Lesson A1: the studio and a new case.
// The tabs in the order of the work, the three reservoir types the series
// uses, the Ekene discovery conditions, the case card, display units and
// sharing.
import {
  login, expectText, openStudio, deleteCases, createCase, confirmCase, t, tab, mbalLessonMeta,
} from './mbal-common.mjs';

export default {
  id: 'lesson-mbal-a1',
  ...mbalLessonMeta(1, 'A', 'The studio and *a new case*', 'Tabs, reservoir types, discovery conditions, units and sharing'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson A1/);
    await openStudio(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'tabs', chapter: 'The studio', chapterSub: 'Eight tabs in the order of the work',
      say: 'Material Balance Studio lays out the work from left to right. Data holds the pressure and production history. PVT holds the fluid and rock properties, and Aquifer the water outside the tank. Run solves the balance, Plots and Forecast read the result, Contacts tracks the fluid contacts, and Report writes it up. The left rail holds the case.',
      do: async (d) => {
        for (const name of ['Data', 'PVT', 'Aquifer', 'Run', 'Plots', 'Forecast', 'Contacts', 'Report']) {
          await d.moveTo(tab(d, name));
          await d.sleep(1700);
        }
        await d.moveTo(d.page.getByRole('combobox').first());
        await d.sleep(1200);
      } },
    { id: 'types', chapter: 'A new case', chapterSub: 'Three kinds of reservoir',
      say: 'A new case starts with its fluid system. An oil reservoir, like Ekene, which is undersaturated with no gas cap. A gas reservoir, like the Oboro scenario in Module D. And an oil reservoir with a gas cap, the scenario of Module C.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: 'Create a case' }));
        await d.page.locator('#name').waitFor();
        await d.sleep(800);
        await d.click(d.page.getByRole('dialog').getByRole('combobox').first());
        await d.sleep(4500);
        await d.click(d.page.getByRole('option', { name: 'Oil reservoir' }));
        await d.sleep(600);
      } },
    { id: 'conditions',
      say: 'Then the conditions at discovery. For Ekene: three thousand two hundred psia at the contact, one hundred and eighty degrees Fahrenheit, a connate water saturation of nought point three five, and a bubble point of two thousand psia. The bubble point is optional, and so is a volumetric estimate, which Lesson twelve takes from ReservoirCalc Pro instead of typing.',
      do: async (d) => {
        await createCase(d, 'Lesson A1: Ekene', { onCamera: true, open: false });
        await d.sleep(800);
        await d.highlight(t(d, 'mbal-case-volumetric'));
        await d.sleep(2000);
        await d.unhighlight();
        await confirmCase(d, { onCamera: true });
      } },
    { id: 'card', chapter: 'The case card', chapterSub: 'What every tab reads',
      say: 'The case card in the left rail shows what every tab reads: the initial pressure, temperature, water saturation and bubble point, and how many data rows the case holds. Edit case changes them; a run made before a change is then marked as an earlier run.',
      do: async (d) => {
        await expectText(d, t(d, 'mbal-case-summary'), /Initial P\s*3,200 psia[\s\S]*Temperature\s*180 degF[\s\S]*Initial Sw\s*0\.350[\s\S]*Bubble point\s*2,000 psia[\s\S]*Data rows\s*0/, 'case card');
        await d.highlight(t(d, 'mbal-case-summary'));
        await d.sleep(4000);
        await d.unhighlight();
        await d.moveTo(t(d, 'mbal-edit-case'));
        await d.sleep(1500);
      } },
    { id: 'units', chapter: 'Units', chapterSub: 'A view; the engine stays in oilfield units',
      say: 'Display units start from your Suite profile. Switch to metric and every value shows in kilopascals, cubic metres and degrees Celsius; the stored data and the engine stay in oilfield units, so nothing is re-read. This series works in oilfield units.',
      do: async (d) => {
        const u = t(d, 'mbal-units');
        await d.click(u.getByRole('radio', { name: 'Metric' }).or(u.getByRole('button', { name: 'Metric' })).first());
        await d.sleep(1500);
        await d.highlight(t(d, 'mbal-case-summary'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(u.getByRole('radio', { name: 'Oilfield' }).or(u.getByRole('button', { name: 'Oilfield' })).first());
        await d.sleep(1200);
      } },
    { id: 'share', chapter: 'Sharing', chapterSub: 'Private until you share',
      say: 'A case is private until you share it with your organisation. Colleagues can then read it, or edit it in turn under a check-out, and History lists who changed what.',
      do: async (d) => {
        await d.moveTo(d.page.getByText('Share with my organisation').first());
        await d.sleep(2500);
        await d.moveTo(d.page.getByRole('button', { name: /History/ }).first());
        await d.sleep(2000);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Data in',
      say: 'Next, the pressure and production history, and how to check what the import read.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
