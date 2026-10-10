// QI Studio, video 3: AVO and the simultaneous inversion (Ekene kit v3).
// Figures marked TBD are filled from the dry run after the Seismolord
// synthetic placement fix; `expectText` stops the take if the screen differs.
import {
  login, expectText, clearProductVolumes, createQiProject,
} from './qi-common.mjs';

const PROJECT3 = 'Ekene QI AVO';
const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-9'];
const STACKS = ['EKENE3D-near.sgy', 'EKENE3D-mid.sgy', 'EKENE3D-far.sgy'];
const t = (d, id) => d.page.getByTestId(id);
const pick = async (d, id, name) => {
  const opts = await t(d, id).locator('option').allInnerTexts();
  await d.select(id, { label: opts.find((o) => o.includes(name)) });
};
const runsReady = (d, id) => d.page.locator(`[data-testid="${id}"] >> text=Ready: open in Seismolord`).first().waitFor({ timeout: 1800000 });

export default {
  id: 'qi-03',
  app: 'QI Studio',
  eyebrow: 'QI Studio · 3 of 3',
  title: 'AVO at the wells, *then the inversion*',
  subtitle: 'Intercept and gradient checked against the rock physics, and a simultaneous inversion checked at blind wells',
  outroTitle: 'Quantitative interpretation, *checked at every step*',
  outroSub: 'QI Studio in Petrolord Suite · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await clearProductVolumes(d, shared);
    await createQiProject(d, shared, PROJECT3, WELLS, STACKS);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'AVO volumes', chapterSub: 'QI Studio · AVO',
      say: 'The rock physics said the top of the Ekene Sand is a class one reflector that dims with oil. Now we ask the seismic. Three angle stacks go in, near, mid and far, each with its mean angle.',
      sub: 'The rock physics said the top of the Ekene Sand is a class I reflector that dims with oil. Now we ask the seismic. Three angle stacks go in, near, mid and far, each with its mean angle.',
      do: async (d) => {
        await d.click('qi-tab-avo');
        for (const [k, n, a] of [[0, 'near', 10], [1, 'mid', 20], [2, 'far', 30]]) {
          await pick(d, `qi-avo-stack-${k}`, n);
          await d.type(`qi-avo-angle-${k}`, String(a), { delay: 40 });
        }
      } },
    { id: 'avo-run',
      say: 'The worker fits intercept and gradient at every sample, and writes the intercept, the gradient and the fluid factor back to Seismolord as volumes.',
      do: async (d) => { await d.click('qi-avo-run'); },
      wait: async (d) => { await runsReady(d, 'qi-avo-runs'); },
      waitLabel: 'Minutes later' },
    { id: 'avo-ready',
      say: 'The three volumes are ready, and open in Seismolord beside the stacks.',
      do: async (d) => { await d.highlight('qi-avo-runs'); } },
    { id: 'wells', chapter: 'Checked at the wells', chapterSub: 'Model against seismic',
      say: 'TBD: at the wells. Rock Physics Studio published the modelled gather for each well; QI Studio reads the AVO volumes at each well\'s zone top and fits one scale over all of them.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-avo-wells-run');
        await t(d, 'qi-avo-wells-table').waitFor({ timeout: 900000 });
        await expectText(d, 'qi-avo-wells-summary', /the AVO class agrees at 4 of them/, 'AVO class at the wells');
        await d.highlight('qi-avo-wells-summary');
      } },
    { id: 'wells-table',
      say: 'TBD: the table, model and seismic intercept and gradient, class and misfit per well.',
      do: async (d) => { await d.unhighlight(); await d.highlight('qi-avo-wells-table'); } },
    { id: 'sim', chapter: 'Simultaneous inversion', chapterSub: 'QI Studio · Simultaneous',
      say: 'The same three stacks go into a simultaneous inversion: acoustic impedance, shear impedance and density at once. The field wavelet from the ties is scaled to the stacks at the wells.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-simultaneous');
        for (const [k, n, a] of [[0, 'near', 10], [1, 'mid', 20], [2, 'far', 30]]) {
          await pick(d, `qi-sim-stack-${k}`, n);
          await d.type(`qi-sim-angle-${k}`, String(a), { delay: 40 });
        }
      } },
    { id: 'sim-wells',
      say: 'Reading the wells: four have sonic, shear and density in time through their ties. Ekene nine has no density log, so it sits out.',
      sub: 'Reading the wells: four have sonic, shear and density in time through their ties. Ekene-9 has no density log, so it sits out.',
      do: async (d) => {
        await d.click('qi-sim-read');
        await t(d, 'qi-sim-wells').waitFor({ timeout: 300000 });
        await expectText(d, 'qi-sim-wells', /Ekene-9\s*No density curve/, 'Ekene-9 sits out');
        await d.highlight('qi-sim-wells');
      } },
    { id: 'blind',
      say: 'Before inverting the survey, each well is left out in turn and predicted from the others.',
      do: async (d) => { await d.unhighlight(); await d.click('qi-sim-blind'); },
      wait: async (d) => { await t(d, 'qi-sim-blind-table').waitFor({ timeout: 1800000 }); },
      waitLabel: 'Minutes later' },
    { id: 'blind-table',
      say: 'TBD: blind-well errors.',
      do: async (d) => { await d.highlight('qi-sim-blind-table'); } },
    { id: 'invert',
      say: 'With the blind check on record, we invert the stacks. Acoustic impedance, shear impedance, density and Vp over Vs come back as Seismolord volumes.',
      sub: 'With the blind check on record, we invert the stacks. Acoustic impedance, shear impedance, density and Vp/Vs come back as Seismolord volumes.',
      do: async (d) => { await d.unhighlight(); await d.click('qi-sim-run'); },
      wait: async (d) => { await runsReady(d, 'qi-sim-runs'); },
      waitLabel: 'Minutes later' },
    { id: 'report', chapter: 'The record', chapterSub: 'QI Studio · Report',
      say: 'Every run keeps its settings and its checks. The report gathers them, from the data audit to the inversion, for the partners and the next interpreter.',
      do: async (d) => {
        await d.highlight('qi-sim-runs');
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('qi-tab-report');
        await d.highlight('qi-report-summary');
      } },
  ],
};
