// QI lesson F18: the prospect assessment and the report, ending the series.
// Figures from the 2026-10-10 probes after engines #345 / Suite #985 (gridding
// coverage) on surfaces gridded in Seismolord from the Ekene Sand horizon
// (depth at 7750 ft/s, amplitude at the horizon): crest 1516 m, spill 1524 m,
// column 8 m, closure 1.04 km2, GRV 3.5 million m3 to spill; amplitude map
// 291 to 492; anomaly below 380: conformance 0.83, 100 percent inside, implied
// contact 1521 m, GRV 1.5 million m3 to it.
import { login, expectText } from './common.mjs';
import { qiLessonMeta, lessonProject } from './qi-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const PROSPECT = 'Ekene Main';

export default {
  id: 'lesson-qi-f18',
  ...qiLessonMeta(18, 'F', 'Prospects and the report: *the QI assessment*', 'Trap, anomaly and conformance, the evidence and the competing explanations, and the record a QI study leaves'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await lessonProject(d, shared);
    await d.page.getByTestId('qi-tab-prospects').click(); await d.sleep(2500);
    // prospects left by earlier takes and probes
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    for (let i = 0; i < 20; i++) {
      const del = d.page.locator('[data-testid^="qi-pros-row-"] button').filter({ hasText: 'Delete' }).first();
      if (!(await del.count())) break;
      await del.click(); await d.sleep(1200);
    }
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 18', chapterSub: 'Module F · Inversion and the decision',
      say: 'Seventeen lessons built the evidence: data that is good enough, rock physics that says oil should dim the top of the Ekene Sand, ties, AVO checked at the wells, and inversions checked blind. The last step brings it together for a prospect, the way a subsurface team would present it before a well is drilled.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 18', title: 'Prospects and the report',
        body: '<ul><li>The trap on a depth surface</li><li>The anomaly and how it fits the trap</li><li>Evidence, competing explanations, the QI recommendation</li></ul>' }) },
    { id: 'feas', chapter: 'Feasibility on record', chapterSub: 'QI Studio · Feasibility',
      say: 'First the feasibility verdict from Module B goes on record for the Ekene Sand: feasible, with conditions. The oil dims the top reflection by about a quarter and moves it off the wet trend, but the column is below tuning.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('qi-tab-feasibility');
        const sel = t(d, 'qi-feas-verdict-Ekene Sand');
        const opts = await sel.locator('option').allInnerTexts();
        await d.select('qi-feas-verdict-Ekene Sand', { label: opts.find((o) => /with conditions/i.test(o)) });
        const boxes = t(d, 'qi-feas-Ekene Sand').locator('textarea');
        await d.type(boxes.nth(0), 'AI and Vp/Vs both about 7 percent lower over the oil leg (Gassmann, Batzle-Wang).', { delay: 6 });
        await d.type(boxes.nth(1), 'Top Ekene class I, about a quarter dimmer with oil; oil column under 40 ft, below tuning.', { delay: 6 });
        await d.type(boxes.nth(2), 'Near-stack amplitude and AVO at the top Ekene; simultaneous inversion for Vp/Vs.', { delay: 6 });
        await d.highlight('qi-feas-Ekene Sand');
      } },
    { id: 'trap', chapter: 'The trap', chapterSub: 'QI Studio · Prospects',
      say: 'Now the prospect. The depth surface was gridded in Seismolord from the Ekene Sand horizon tracked by Tops to horizons. Starting near the field\'s crest, Prospects climbs to the crest and floods the closure to its spill point.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-prospects');
        await d.click('qi-pros-add');
        await d.type('qi-pros-name', PROSPECT);
        await d.select('qi-pros-surface', { label: 'Ekene Sand (depth ft)' });
        await d.type(d.page.getByLabel('Crest search X'), '401400');
        await d.type(d.page.getByLabel('Crest search Y'), '522000');
      } },
    { id: 'anomaly', chapter: 'The anomaly', chapterSub: 'Where the top is dim',
      say: 'The anomaly map is the amplitude extracted along the same horizon, from two hundred and ninety to four hundred and ninety. Oil dims the top Ekene, so the anomaly is where the map is below a threshold: three hundred and eighty.',
      sub: 'The anomaly map is the amplitude extracted along the same horizon, from 290 to 490. Oil dims the top Ekene, so the anomaly is where the map is below a threshold: 380.',
      do: async (d) => {
        await d.select('qi-pros-attr', { label: 'Ekene Sand (Amplitude)' });
        await d.select(d.page.getByLabel('Anomalous where the map is'), { label: 'below' });
        await d.type('qi-pros-threshold', '380');
      } },
    { id: 'evidence', chapter: 'Evidence', chapterSub: 'And its independence',
      say: 'The evidence, each item with the response it comes from, because two items from the same full stack are one piece of evidence counted twice. The dim spot on the full stack. AVO from the partial stacks, checked at four wells. And the simultaneous inversion\'s Vp over Vs.',
      sub: 'The evidence, each item with the response it comes from, because two items from the same full stack are one piece of evidence counted twice. The dim spot on the full stack. AVO from the partial stacks, checked at four wells. And the simultaneous inversion\'s Vp/Vs.',
      do: async (d) => {
        const add = async (name, src) => {
          await d.type('qi-pros-ev-name', name, { delay: 15 });
          const opts = await t(d, 'qi-pros-ev-source').locator('option').allInnerTexts();
          await d.select('qi-pros-ev-source', { label: opts.find((o) => o.startsWith(src)) });
          await d.click('qi-pros-ev-add');
        };
        await add('Dim top Ekene amplitude', 'Full-stack amplitude');
        await add('Class I dimming, agrees at 4 wells', 'AVO from gathers');
        await add('Low Vp/Vs at the top Ekene', 'Prestack inversion');
      } },
    { id: 'competing', chapter: 'Competing explanations', chapterSub: 'What else could dim the top?',
      say: 'Then the competing explanations, each open, ruled out or likely. Fizz gas is ruled out: the wells found a live oil at three thousand two hundred psi, with no free gas. Tuning stays open, because the oil column is below tuning and thickness changes could dim the top too. Lithology, porosity and processing stay open until more data says otherwise.',
      sub: 'Then the competing explanations, each open, ruled out or likely. Fizz gas is ruled out: the wells found a live oil at 3,200 psi, with no free gas. Tuning stays open, because the oil column is below tuning and thickness changes could dim the top too. Lithology, porosity and processing stay open until more data says otherwise.',
      do: async (d) => {
        await d.select('qi-pros-comp-fizz', { label: 'ruled out' });
        await d.highlight(t(d, 'qi-pros-comp-tuning').locator('xpath=ancestor::div[2]'));
      } },
    { id: 'analyse', chapter: 'The assessment', chapterSub: 'Analyse and save',
      say: 'Analyse and save. The trap: crest at fifteen sixteen metres, spill at fifteen twenty four, an eight metre column over a square kilometre, three and a half million cubic metres of rock to spill. The anomaly sits entirely inside the closure, with a conformance of point eight three, and its edge implies a contact at fifteen twenty one metres.',
      sub: 'Analyse and save. The trap: crest at 1516 m, spill at 1524 m, an 8 m column over a square kilometre, 3.5 million m³ of rock to spill. The anomaly sits entirely inside the closure, with a conformance of 0.83, and its edge implies a contact at 1521 m.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-pros-analyse');
        await expectText(d, 'qi-pros-table', /Ekene Main\s*Ekene Sand\s*1516 \/ 1524\s*8\s*1\.04\s*0\.8\d, 100 percent inside, contact 152\d m/, 'trap and anomaly');
        await d.highlight('qi-pros-table');
      } },
    { id: 'reco',
      say: 'The recommendation is Investigate. Three independent sources support the anomaly, the feasibility verdict says it could be seen, but four competing explanations are still open, so the anomaly is there and unproven. The study will not set the chance of success; that stays with the team in Risked Reserves Valuation, which shows this record beside the prospect. What QI does is say plainly what the evidence supports, what is still open, and what would change the answer.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'qi-pros-table', /contact 152\d m\s*3\s*4 \/ 0\s*Feasible with conditions\s*supports\s*Investigate/, 'recommendation');
        await d.highlight(d.page.getByText(/Ekene Main: Investigate/).first());
      } },
    { id: 'report', chapter: 'The record', chapterSub: 'QI Studio · Report',
      say: 'Everything in this series is in the report: the data audit and the issues, the seismic and prestack QC, the ties and the field wavelet, AVO at the wells, the inversions with their blind checks, the property check that failed its coverage test, and this assessment. Download it as a PDF for the partners, or open the project again next year and carry on.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-report');
        await d.highlight('qi-report-summary');
      } },
    { id: 'close', chapter: 'QI with Petrolord', chapterSub: 'End of the series',
      say: 'That is the end of QI with Petrolord. The Ekene demonstration kit is free, with every well, the seismic and the gathers, and the truth tables to check your answers against. Thank you for following along.',
      do: async (d) => {
        await d.unhighlight();
        await d.slide({ eyebrow: 'QI with Petrolord', title: 'Thank you for following along', body: '<ul><li>The Ekene kit: wells, seismic, gathers and truth tables</li><li>Every lesson\'s numbers can be checked</li><li>petrolord.com</li></ul>' });
      } },
  ],
};
