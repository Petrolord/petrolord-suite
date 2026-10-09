// QI Studio, video 1: does the seismic see the oil? (Ekene kit v3, feet)
// Figures from the 2026-10-09 dry run on main 8f1263a; `expect` steps stop the
// take if the screen disagrees with the narration. Truth for comparison is in
// the kit's 10-qi/ekene-qi-truth.md (oil-to-brine AI +7.5% over the oil leg;
// top Ekene class I, brighter with brine).
import {
  login, expectText, openQi, clearQiProject, selectRpsWell, wellBox, volumeBox,
  PROJECT, ZONE_LABEL, VOLUMES,
} from './qi-common.mjs';

const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-9'];
const t = (d, id) => d.page.getByTestId(id);

export default {
  id: 'qi-01',
  app: 'QI Studio',
  eyebrow: 'QI Studio · 1 of 3',
  title: 'Does the seismic *see the oil*?',
  subtitle: 'The data audit and the rock physics behind a quantitative interpretation, on the Ekene field',
  outroTitle: 'Next: from gathers to *angle stacks and AVO*',
  outroSub: 'Building the angle stacks and reading the AVO on the seismic · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openQi(d, shared);
    await clearQiProject(d);
    await openQi(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'QI Studio', chapterSub: 'A new study on the Ekene field',
      say: 'Before anyone inverts seismic for fluids, a quantitative interpretation study answers two questions. Is the data good enough? And does the rock physics say the seismic can see the fluid at all? We start a study for the Ekene field.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: 'Create new project' }));
        await d.type(d.page.getByRole('textbox', { name: 'Project name' }), PROJECT);
        await d.click(d.page.getByRole('button', { name: 'Create project' }));
        await d.sleep(1500);
      } },
    { id: 'wells',
      say: 'We take the four development wells with full log suites, and Ekene nine, which was logged with a sonic only. The target is the Ekene Sand. The seismic is the three D full stack, with its near, mid and far angle stacks.',
      sub: 'We take the four development wells with full log suites, and Ekene-9, which was logged with a sonic only. The target is the Ekene Sand. The seismic is the 3D full stack, with its near, mid and far angle stacks.',
      do: async (d) => {
        for (const w of WELLS) { await d.click(wellBox(d, w), { after: 120 }); }
        await d.sleep(1500);
        await d.click(t(d, 'qi-target-Ekene Sand'));
        for (const v of VOLUMES) { await d.click(volumeBox(d, v), { after: 120 }); }
      } },
    { id: 'inventory', chapter: 'Is the data good enough?', chapterSub: 'Inventory and usability',
      say: 'The data inventory reads what the Suite already holds. All five wells have a dipole shear log and checkshots, and four have density and a petrophysical interpretation.',
      do: async (d) => {
        await d.click('qi-tab-inventory');
        await expectText(d, d.page.getByText(/wells have a shear log/), /5 of 5 wells have a shear log/, 'shear inventory');
        await d.highlight(d.page.getByText(/wells have a shear log/));
      } },
    { id: 'usability',
      say: 'The usability matrix grades each well against the target: the curves over the zone, the checkshots, the depth reference and the survey. Ekene one to four are good on every count.',
      sub: 'The usability matrix grades each well against the target: the curves over the zone, the checkshots, the depth reference and the survey. Ekene-1 to Ekene-4 are good on every count.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-usability');
        await expectText(d, d.page.getByText(/good, \d+ limited, \d+ missing/), /4 good, 0 limited, 1 missing/, 'usability counts');
        await d.highlight(d.page.getByText(/good, \d+ limited, \d+ missing/));
      } },
    { id: 'ekene9',
      say: 'Ekene nine is missing the essential curve: there is no density log, so it can be neither tied to the seismic nor fluid substituted. Its sonic and shear still help with the velocity trends.',
      sub: 'Ekene-9 is missing the essential curve: there is no density log, so it can be neither tied to the seismic nor fluid substituted. Its sonic and shear still help with the velocity trends.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(d.page.locator('[data-testid^="qi-cell-"][data-testid$="Ekene Sand"]').last());
        await expectText(d, 'qi-cell-detail', /Density: No density over the zone/, 'Ekene-9 density');
        await d.highlight('qi-cell-detail');
      } },
    { id: 'rps', chapter: 'Does the seismic see the oil?', chapterSub: 'Rock Physics Studio · Ekene-1',
      say: 'The second question goes to Rock Physics Studio, straight from the feasibility page. Ekene one carries its measured logs, the new dipole shear, and the porosity, shale volume and water saturation published from Petrophysics Studio.',
      sub: 'The second question goes to Rock Physics Studio, straight from the feasibility page. Ekene-1 carries its measured logs, the new dipole shear, and the porosity, shale volume and water saturation published from Petrophysics Studio.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('qi-tab-feasibility');
        await d.click(d.page.getByRole('link', { name: 'Open Rock Physics Studio' }));
        await selectRpsWell(d, 'Ekene-1');
        await d.highlight('rp-curve-inventory');
      } },
    { id: 'conditions',
      say: 'Fluid substitution replaces the oil in the Ekene Sand with brine, and asks how the rock would look. The reservoir is at one hundred and eighty degrees Fahrenheit and thirty two hundred p s i, with a thirty two degree A P I live oil and a gas oil ratio of four hundred.',
      sub: 'Fluid substitution replaces the oil in the Ekene Sand with brine, and asks how the rock would look. The reservoir is at 180 °F and 3,200 psi, with a 32 °API live oil and a GOR of 400 scf/STB.',
      do: async (d) => {
        await d.unhighlight();
        await d.select('rp-zone-select', { label: ZONE_LABEL });
        await d.type('rp-param-tC', '180');
        await d.type('rp-param-pMPa', '3200');
        await d.select('rp-param-fluidA-kind', { label: 'live oil' });
        await d.type('rp-param-fluidA-api', '32');
        await d.select('rp-param-fluidA-gor-unit', { label: 'scf/STB' });
        await d.type('rp-param-fluidA-gor', '400');
        await d.type('rp-param-fluidA-gg', '0.75');
      } },
    { id: 'brine',
      say: 'The substitute is brine of thirty five thousand parts per million. The clay comes from the shale volume log, sample by sample.',
      sub: 'The substitute is 35,000 ppm brine. The clay comes from the shale volume log, sample by sample.',
      do: async (d) => {
        await d.type('rp-param-fluidB-sw', '1');
        await d.click('rp-param-clayFromVsh');
        await d.click('rp-apply-params');
        await d.sleep(2500);
      } },
    { id: 'result',
      say: 'Across the Ekene Sand, brine in place of oil raises the acoustic impedance by four percent, and the velocity ratio from one point eight eight to one point nine six. Only the oil leg moves: the water leg below it is already brine.',
      sub: 'Across the Ekene Sand, brine in place of oil raises the acoustic impedance by 4%, and Vp/Vs from 1.88 to 1.96. Only the oil leg moves: the water leg below it is already brine.',
      do: async (d) => {
        await expectText(d, 'rp-sub-before-ai', /^22303$/, 'AI before');
        await expectText(d, 'rp-sub-after-ai', /^23260$/, 'AI after');
        await expectText(d, 'rp-sub-before-vpvs', /^1\.877$/, 'Vp/Vs before');
        await expectText(d, 'rp-sub-after-vpvs', /^1\.957$/, 'Vp/Vs after');
        await d.highlight(d.page.locator('table').filter({ has: t(d, 'rp-sub-before-ai') }).first());
      } },
    { id: 'crossplot',
      say: 'On impedance against velocity ratio, coloured by water saturation, the oil-bearing samples sit low and to the left. Taken to brine, they move up and to the right, towards the water-bearing sand.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('rp-view-crossplot');
        await d.select('rp-xplot-zone', { label: ZONE_LABEL });
        await d.sleep(1500);
        await d.highlight('rp-crossplot-panel', { pad: -40 });
      } },
    { id: 'avo', chapter: 'What the seismic should show', chapterSub: 'AVO at the top of the Ekene Sand',
      say: 'The A V O view models the reflection at the top of the Ekene Sand. With the oil in place, the intercept is point one four and the gradient minus point five two: a class one response, a strong peak that dims with angle.',
      sub: 'The AVO view models the reflection at the top of the Ekene Sand. With the oil in place, the intercept is 0.14 and the gradient -0.52: a class I response, a strong peak that dims with angle.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('rp-view-avo');
        await d.select('rp-avo-top-select', { label: 'Ekene Sand (5078.7 ft)' });
        await expectText(d, 'rp-avo-panel', /A \(intercept\) 0\.1440[\s\S]*B \(gradient\) -0\.5151[\s\S]*Class I/, 'in situ AVO');
        await d.highlight(d.page.getByText('A (intercept) 0.1440').first());
      } },
    { id: 'dims',
      say: 'With brine in its place the intercept would be point one nine. So the oil takes about a quarter off the top Ekene reflection. That dimming, over the crest and following the structure, is what we will look for in the seismic.',
      sub: 'With brine in its place the intercept would be 0.19. So the oil takes about a quarter off the top Ekene reflection. That dimming, over the crest and following the structure, is what we will look for in the seismic.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'rp-avo-panel', /A 0\.1898/, 'brine AVO');
        await d.highlight(d.page.getByText('A 0.1898').first());
      } },
    { id: 'verdict', chapter: 'The verdict', chapterSub: 'Recorded in the study',
      say: 'Back in QI Studio, the study we saved reopens, and we record the verdict for the Ekene Sand: feasible, with conditions. The oil is visible in the rock physics, but the column is thin, so the route is A V O on the angle stacks, then inversion.',
      sub: 'Back in QI Studio, the study we saved reopens, and we record the verdict for the Ekene Sand: feasible, with conditions. The oil is visible in the rock physics, but the column is thin, so the route is AVO on the angle stacks, then inversion.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('rp-qi-studio');
        await d.waitFor('qi-tab-setup', { timeout: 120000 }); await d.sleep(2000);
        await d.click(d.page.getByRole('combobox', { name: 'Project' }));
        await d.click(d.page.getByRole('option', { name: PROJECT, exact: true }));
        await d.sleep(2500);
        await d.click('qi-tab-feasibility');
        await d.select('qi-feas-verdict-Ekene Sand', { label: 'Feasible with conditions' });
        await d.type(t(d, 'qi-feas-Ekene Sand').locator('textarea').nth(0), 'Oil lowers AI about 4% and lifts Vp/Vs at the zone scale; top Ekene class I, intercept 0.19 brine vs 0.14 oil.', { delay: 18 });
        await d.type(t(d, 'qi-feas-Ekene Sand').locator('textarea').nth(2), 'AVO on near, mid and far stacks, then simultaneous inversion.', { delay: 18 });
      } },
  ],
};
