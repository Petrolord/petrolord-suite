// Petroleum Economics with Petrolord, Lesson B4: the PIA 2021 under the
// Nigeria Tax Act 2025. The asset profile, royalty tranches, hydrocarbon
// tax, companies income tax and the levies, the framework read year by
// year, and the engine's notes, on the Ekene case.
import {
  login, expectText, openRun, rerunWithEdits, kpi, lessonCase, KIT_RUN, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson B4: Ekene';
const row = (d, label) => d.page.locator('tr', { has: d.page.locator(`td:text-is("${label}")`) }).first();

export default {
  id: 'lesson-epe-b4',
  ...epeLessonMeta(4, 'B', 'The PIA *under the Nigeria Tax Act*', 'Asset profile, royalty, hydrocarbon tax, income tax, levies and the framework per year'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('PIA, shallow water')] });
    await openRun(d, shared, CASE, 'PIA, shallow water');
    await rerunWithEdits(d);
    const f = d.page.getByRole('button', { name: 'PIA 2021 (Nigeria)' });
    await f.scrollIntoViewIfNeeded();
    await f.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await d.sleep(1500);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'profile', chapter: 'The asset profile', chapterSub: 'Terrain, lease and water depth',
      say: 'Under the Petroleum Industry Act the terms follow the asset. Ekene is in shallow water, on a petroleum mining lease converted from an old oil mining lease, in a hundred and fourteen point eight feet of water, which the field stores as thirty four point nine nine metres because the Act sorts terrain in metres. Terrain and lease status set the hydrocarbon tax and the production allowance; the terrain sets the royalty tranches.',
      do: async (d) => {
        for (const n of ['Shallow Water', 'PML', 'Converted']) { await d.moveTo(d.page.getByRole('button', { name: n, exact: true }).first()); await d.sleep(1800); }
        await d.moveTo(d.page.locator('#pia_water_depth_m')); await d.sleep(1800);
      } },
    { id: 'royalty', chapter: 'Royalty', chapterSub: 'By daily production',
      say: 'Royalty follows the Royalty Regulations of twenty twenty two: in shallow water five percent up to five thousand barrels a day, seven and a half to ten thousand, twelve and a half above. On top sits royalty by price, charged once oil passes a benchmark that started at fifty dollars a barrel in twenty twenty one and rises two percent a year.',
      do: async (d) => {
        const t = d.page.getByText(/Royalty tranches by daily crude/).first();
        await t.scrollIntoViewIfNeeded();
        await d.highlight(t); await d.sleep(6000); await d.unhighlight();
      } },
    { id: 'taxes', chapter: 'Taxes and levies', chapterSub: 'Auto-derived, open to override',
      say: 'The tax line reads the rates from the profile: hydrocarbon tax for the terrain and lease, companies income tax at thirty percent, and the tertiary education tax from the statute. The levies line holds the Niger Delta levy, the cost price ratio cap, the capex recovery period and the production allowance. Each can be overridden.',
      do: async (d) => {
        const t = d.page.getByText(/Auto-derived HCT/).first();
        await t.scrollIntoViewIfNeeded(); await d.highlight(t); await d.sleep(4000); await d.unhighlight();
        const l = d.page.getByText(/NDDC 3% of OPEX plus CAPEX/).first();
        await d.highlight(l); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'nta', chapter: 'The framework per year', chapterSub: 'PIA to 2025, NTA from 2026',
      say: 'The Nigeria Tax Act twenty twenty five takes over from twenty twenty six. The engine reads the framework year by year, so one run can carry history under the Act alone and the forecast under the new Tax Act, and the result badge says so.',
      do: async (d) => {
        await d.page.goBack();
        await d.page.getByText(/^NPV @/).first().waitFor({ timeout: 60000 });
        await d.sleep(1500);
        const b = d.page.getByText('Computed under PIA 2021 to 2025 and NTA 2025 from 2026').first();
        await d.highlight(b); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'table', chapter: 'Year by year', chapterSub: 'Every line and rate',
      say: 'Year by year detail shows every line. Ekene\'s royalty rate is five percent throughout, at one hundred and eleven barrels a day in twenty twenty six. Hydrocarbon tax is charged at thirty percent. The tertiary education tax stops when the framework changes, and the development levy starts.',
      do: async (d) => {
        const b = d.page.getByText('Year-by-Year Detail', { exact: true }).first();
        await b.scrollIntoViewIfNeeded(); await d.click(b); await d.sleep(1800);
        await expectText(d, row(d, '  Royalty daily rate (bopd)').or(d.page.locator('tr', { hasText: 'Royalty daily rate' }).first()), /111/, 'bopd 2026');
        for (const l of ['Royalty daily rate', 'Production royalty rate', 'HCT rate', 'TET', 'Dev Levy', 'Framework']) {
          const r = d.page.locator('tr', { hasText: l }).first();
          await d.highlight(r); await d.sleep(1700);
        }
        await d.unhighlight();
      } },
    { id: 'notes', chapter: 'Engine notes', chapterSub: 'What the engine assumed',
      say: 'Engine notes list what the computation assumed where the law leaves a choice: seven of them on this run, from how royalty by price is indexed to how shared costs are split between oil and gas. Open them before quoting a number.',
      do: async (d) => {
        const n = d.page.getByText(/Engine notes on the PIA 2021 and NTA 2025 computation \(7\)/).first();
        await n.scrollIntoViewIfNeeded();
        await d.click(n); await d.sleep(5500);
      } },
    { id: 'take', chapter: 'Government take', chapterSub: 'Ninety three percent',
      say: 'Altogether government takes ninety three point two percent of Ekene\'s undiscounted profit. Next lesson: the same case under a joint venture and a production sharing contract.',
      do: async (d) => {
        const k = kpi(d, 'Government take');
        await k.scrollIntoViewIfNeeded();
        await expectText(d, k, /93\.2%/, 'take');
        await d.highlight(k); await d.sleep(4000); await d.unhighlight();
      } },
  ],
};
