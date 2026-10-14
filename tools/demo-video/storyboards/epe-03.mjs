// Petroleum Economics Studio, demo 3: when the forecast changes. Ekene-11's
// production profile comes from Forecast Scenario Hub and remembers where it
// came from. The reservoir engineer revises the well to the low case (qi
// 315 bopd, the kit's decision tree low outcome); the economics file says
// its source changed, takes the new profile in one click, the run priced on
// the old one says it is out of date, and the re-run and the comparison show
// what the change is worth. The NAPE paper's data governance example in an
// economics app.
import {
  login, expectText, deleteCases, seedHubSet, openCases, newCase, upload, importFromHub, openCase, openConsole,
  fillConsole, runAnalysis, openRun, rerunWithEdits, kpi, caseId, fileCard, HUB, HUB_SET, EKENE11_CASE, FILES, KIT_CONSOLE,
} from './epe-common.mjs';

export const CASE3 = 'EPE demo: Ekene-11 from the forecast';
const RUN_MID = 'Ekene-11 mid case, qi 450';
const RUN_LOW = 'Ekene-11 low case, qi 315';
const HUB_FILE = 'FSH - Ekene-11.generated';
const { scenario: _s, ...CONSOLE } = KIT_CONSOLE; // the hub profile lands untagged (Base)
const tabBtn = (d, name) => d.page.getByRole('tab', { name, exact: true }).first();
async function openTab(d, name) {
  for (let i = 0; i < 4; i++) {
    await d.click(tabBtn(d, name)); await d.sleep(1200);
    if ((await tabBtn(d, name).getAttribute('data-state')) === 'active') return;
  }
}

export default {
  id: 'epe-03',
  app: 'Petroleum Economics Studio',
  eyebrow: 'Petroleum Economics Studio · 3 of 3',
  title: 'When the *forecast changes*',
  subtitle: 'A profile that remembers its source, a run that knows it is out of date, and what the change is worth',
  outroTitle: 'Petroleum economics *with Petrolord*',
  outroSub: 'Petroleum Economics Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(shared, new RegExp(`^${CASE3}$`));
    await seedHubSet(shared, HUB_SET, [EKENE11_CASE]);
    await openCases(d, shared);
    await newCase(d, CASE3, 'The four producers\' base forecast plus Ekene-11 from Forecast Scenario Hub');
    await upload(d, 'prod', FILES.fieldNo11);
    await importFromHub(d, { set: HUB_SET, caseName: 'Ekene-11', year: '2027' });
    await upload(d, 'capex', FILES.capex);
    await upload(d, 'opex', FILES.opex);
    await openConsole(d);
    await fillConsole(d, CONSOLE, { runName: RUN_MID });
    await runAnalysis(d);
    await openCase(d, shared, CASE3);
    await fileCard(d, HUB_FILE).scrollIntoViewIfNeeded();
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Where the barrels come from', chapterSub: 'A profile with its source',
      say: 'This case prices Ekene eleven from its forecast. The production slot holds the four producers\' base forecast, and Ekene eleven\'s profile, received from Forecast Scenario Hub. The file keeps where it came from: the case, a hyperbolic decline from four hundred and fifty barrels a day, first oil in April twenty twenty seven. And it checks that source every time it is opened: unchanged since it was received.',
      do: async (d) => {
        const p = fileCard(d, HUB_FILE).getByTestId('epe-hub-provenance');
        await expectText(d, p, /qi 450 bbl\/d[\s\S]*case start 2027-04-01[\s\S]*Unchanged since it was received/, 'provenance');
        await d.highlight(p); await d.sleep(9000); await d.unhighlight();
      } },
    { id: 'run', chapter: 'The economics', chapterSub: 'Priced on the mid case',
      say: 'Priced on these files, under the Petroleum Industry Act at seventy five dollars, the field is worth two point oh two million dollars.',
      do: async (d) => {
        await openTab(d, 'Run History');
        const r = d.page.locator('li', { hasText: RUN_MID }).first();
        await expectText(d, r, /NPV\s*\$2\.02M/, 'mid NPV');
        await d.highlight(r); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'hub', chapter: 'Upstream', chapterSub: 'The forecast is revised',
      say: 'Upstream, the reservoir engineer revises Ekene eleven. The offset data point to the low case of the decision tree: an initial rate of three hundred and fifteen barrels a day. They change it in Forecast Scenario Hub and save the scenario set.',
      do: async (d, shared) => {
        await d.page.goto(`${shared.baseUrl}${HUB}`, { waitUntil: 'domcontentloaded' });
        await d.page.getByRole('button', { name: 'Load' }).waitFor({ timeout: 60000 });
        await d.sleep(2500);
        await d.click(d.page.getByRole('button', { name: 'Load' }));
        await d.sleep(1000);
        await d.click(d.page.getByText(HUB_SET).first());
        await d.page.locator('#fsh-ekene-11-qi').waitFor({ timeout: 30000 });
        await d.sleep(2000);
        await d.type(d.page.locator('#fsh-ekene-11-qi'), '315');
        await d.sleep(1500);
        await d.type(d.page.getByPlaceholder('Save scenario set as...'), HUB_SET);
        await d.click(d.page.getByRole('button', { name: 'Save scenario set' }));
        await d.page.getByText(/Scenario set updated/).first().waitFor({ timeout: 30000 });
        await d.sleep(2000);
      } },
    { id: 'changed', chapter: 'Downstream', chapterSub: 'The file knows',
      say: 'Back in the economics case, the Ekene eleven file has noticed: its source changed since it was received, in the case parameters and the volumes. Nobody had to tell the economist.',
      do: async (d, shared) => {
        await openCase(d, shared, CASE3);
        const st = fileCard(d, HUB_FILE).getByTestId('epe-hub-source-state');
        await st.scrollIntoViewIfNeeded();
        await expectText(d, st, /The source changed since it was received \(the case parameters, the volumes\)/, 'source changed');
        await d.highlight(st); await d.sleep(6000); await d.unhighlight();
      } },
    { id: 'take', chapter: 'One click', chapterSub: 'Take the new profile',
      say: 'Take the new profile replaces this one file with the hub\'s current volumes, keeping its first production year. The base forecast beside it is untouched.',
      do: async (d) => {
        await d.click(fileCard(d, HUB_FILE).getByTestId('epe-file-refresh'));
        await d.page.getByText('File refreshed from its source').first().waitFor({ timeout: 30000 });
        await d.sleep(2500);
        const p = fileCard(d, HUB_FILE).getByTestId('epe-hub-provenance');
        await expectText(d, p, /qi 315 bbl\/d[\s\S]*Unchanged since it was received/, 'refreshed');
        await d.highlight(p); await d.sleep(3500); await d.unhighlight();
      } },
    { id: 'stale', chapter: 'The run is out of date', chapterSub: 'And says so',
      say: 'The run priced on the old profile is now marked out of date, and its results page says what changed. A decision cannot quietly rest on numbers that no longer match the forecast.',
      do: async (d, shared) => {
        await openTab(d, 'Run History');
        const b = d.page.locator('li', { hasText: RUN_MID }).first().getByTestId('epe-run-out-of-date');
        await d.highlight(b); await d.sleep(3000); await d.unhighlight();
        await openRun(d, shared, CASE3, RUN_MID);
        const ban = d.page.getByTestId('epe-run-inputs-changed');
        await expectText(d, ban, /The case data changed after this run/, 'banner');
        await d.highlight(ban); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'rerun', chapter: 'The new answer', chapterSub: 'Re-run with edits',
      say: 'Re run with edits, same terms. On the low case the field is worth minus nine hundred and eighty seven thousand dollars. The I. R. R. card shows nine hundred and seventy four percent, and the app warns that it reads backwards: read the N. P. V.',
      do: async (d) => {
        await rerunWithEdits(d, { onCamera: true, runName: RUN_LOW });
        await runAnalysis(d, { onCamera: true });
        await expectText(d, d.page.locator('body'), /-\$987K[\s\S]*973\.67%/, 'low');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(3500);
        await d.highlight(d.page.getByTestId('epe-irr-caution')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'compare', chapter: 'What the change is worth', chapterSub: 'Run against run',
      say: 'Compare the two runs and the revision is priced: three million dollars of value gone with the cut from four hundred and fifty to three hundred and fifteen barrels a day. That is the conversation to have before the rig is contracted, and it took minutes, with every number traceable to its source.',
      do: async (d, shared) => {
        const id = await caseId(shared, CASE3);
        await d.page.goto(`${shared.baseUrl}/dashboard/apps/economics/epe/cases/${id}/compare`, { waitUntil: 'domcontentloaded' });
        await d.page.getByText('Available Runs').waitFor({ timeout: 60000 });
        await d.page.getByText(RUN_LOW).first().waitFor({ timeout: 60000 });
        await d.sleep(1500);
        await d.click(d.page.locator('label', { hasText: RUN_MID }).first());
        await d.click(d.page.locator('label', { hasText: RUN_LOW }).first());
        await d.click(d.page.getByRole('button', { name: /Compare Selected Runs/ }));
        await d.page.getByText('Comparison Results').waitFor({ timeout: 60000 });
        await d.sleep(1500);
        const v = d.page.getByTestId('incremental-verdict');
        await v.scrollIntoViewIfNeeded();
        await expectText(d, v, /worth \$3M less/, 'verdict');
        await d.highlight(v); await d.sleep(6000); await d.unhighlight();
      } },
    { id: 'close', chapter: 'Connected economics', chapterSub: 'Every number traced to its source',
      say: 'Volumes from the reservoir, wells from the drilling plan, a forecast that tells the economics when it moves, and a run that will not pretend to be current. That is economics on connected data.',
      do: async (d) => { await d.sleep(4000); } },
  ],
};
