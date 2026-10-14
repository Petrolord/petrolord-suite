// Basin & Charge Modeling, demo 1: from a well to a calibrated thermal
// history (Ekene kit v4 plus the basin files). Ekene-1's registry tops dated
// by the column file, continuous deposition, BHTs corrected by Horner,
// vitrinite, the heat flow fitted, and the Akata at TD only just in the oil
// window. Numbers from the dry run (LENIENT=1 prints mismatches).
import {
  login, expectText, openBf, enterExpert, newModel, importEkene1, importCalibration, thermal, simulate, resultsTab,
  deleteModels, seedModel, t, tab, EK1, KITCHEN,
} from './basin-common.mjs';

export default {
  id: 'bf-01',
  app: 'Basin & Charge Modeling',
  eyebrow: 'Basin & Charge Modeling · 1 of 3',
  title: 'From a well to a *calibrated thermal history*',
  subtitle: 'Ekene-1 dated from its tops, buried through time, and calibrated to bottom-hole temperatures and vitrinite',
  outroTitle: 'Basin modelling *with Petrolord*',
  outroSub: 'Basin & Charge Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^Basin demo: Ekene-1$/);
    // the kitchen model of demo 2 is in the list, as it would be in a project
    await seedModel(shared, 'kitchen-run', KITCHEN);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Basin & Charge Modeling', chapterSub: 'Burial, heat and maturity through time',
      say: 'Basin and Charge Modeling reconstructs the history of one location through geological time: how deep each layer was buried, how hot it got, how mature its source rock became, and when it generated and expelled oil and gas. We start in Expert mode on the Ekene field.',
      do: async (d) => {
        await d.sleep(1500);
        await d.moveTo(t(d, 'bf-mode-guided'));
        await d.sleep(1500);
        await enterExpert(d, { onCamera: true });
      } },
    { id: 'new', chapter: 'The column', chapterSub: 'Ekene-1 from the registry',
      say: 'A new model for Ekene-1, the discovery well. A new model deposits each layer continuously through its interval, a quarter of a million years at a step.',
      do: async (d) => {
        await newModel(d, EK1, { onCamera: true });
        await t(d, 'bf-time-settings').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'bf-time-settings'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'registry',
      say: 'The Import tab takes the well from the shared registry, with the ten tops picked in Well Data Manager. Those tops carry no ages, so we add the stratigraphic column file: an age for every surface, the Oboro Unconformity with its hiatus and four hundred and ninety two feet eroded, and the lithology of each interval.',
      sub: 'The Import tab takes the well from the shared registry, with the ten tops picked in Well Data Manager. Those tops carry no ages, so we add the stratigraphic column file: an age for every surface, the Oboro Unconformity with its hiatus and 492 ft eroded, and the lithology of each interval.',
      do: async (d) => {
        await importEkene1(d, { onCamera: true, apply: false });
        await expectText(d, 'bf-registry-notes', /10 of 10 tops matched by name, 10 of 10 layers dated, 10 lithologies[\s\S]*492 ft eroded at the Oboro Unconformity/, 'column notes');
        await d.highlight(t(d, 'bf-registry-preview'));
        await d.sleep(3500);
        await d.highlight(t(d, 'bf-registry-notes'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'apply',
      say: 'Every layer is dated, from the Akata Formation at thirty million years at total depth to the sands at the seabed, and the thicknesses are vertical through the well survey. Replace the stratigraphy.',
      do: async (d) => {
        await d.click(t(d, 'bf-registry-apply'));
        await d.sleep(1200);
        await tab(d, 'properties', { onCamera: true });
        await d.sleep(2500);
      } },
    { id: 'thermal', chapter: 'Heat', chapterSub: 'The seabed and the heat flow',
      say: 'The top of the model is the seabed, at seventy seven degrees Fahrenheit. The basal heat flow starts at the default of sixty milliwatts per square metre; the well data will set it.',
      do: async (d) => {
        await thermal(d, { surfaceF: 77, onCamera: true });
        await d.highlight(t(d, 'bf-heatflow-editor'));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'calibration', chapter: 'Calibration data', chapterSub: 'Temperatures and vitrinite',
      say: 'Two calibration files: nine bottom-hole temperatures from three logging runs with a drill stem test, and fourteen vitrinite reflectance measurements on cuttings. Their depths are measured below the rig floor, so the import moves them up a hundred and ninety seven feet to the seabed, the top of this model.',
      sub: 'Two calibration files: nine bottom-hole temperatures from three logging runs with a drill stem test, and fourteen vitrinite reflectance measurements on cuttings. Their depths are measured below the rig floor, so the import moves them up 197 ft to the seabed, the top of this model.',
      do: async (d) => {
        await importCalibration(d, 'ekene-1-temperatures.csv', { onCamera: true });
        await importCalibration(d, 'ekene-1-vitrinite.csv', { onCamera: false, mode: 'append' });
        await d.sleep(500);
      } },
    { id: 'run', chapter: 'Burial history', chapterSub: 'Thirty million years of the delta',
      say: 'Simulate. The burial history shows each layer from the time it was laid down: the delta built quickly, and the hatched band is the section that was eroded at the Oboro Unconformity before the Ekene Sand was deposited.',
      do: async (d) => {
        await simulate(d, { onCamera: true });
        await resultsTab(d, 'burial', { onCamera: true });
        await d.sleep(3500);
      } },
    { id: 'bht', chapter: 'Bottom-hole temperatures', chapterSub: 'Corrected by Horner',
      say: 'On the Calibration tab the logged temperatures read cool: circulating mud chilled the hole. Each run was logged three times as the hole warmed up, so Horner extrapolates every run to the formation temperature: one hundred and seventy two point six, one hundred and ninety six point one and two hundred and twenty six point three degrees. The drill stem test is used as measured.',
      sub: 'On the Calibration tab the logged temperatures read cool: circulating mud chilled the hole. Each run was logged three times as the hole warmed up, so Horner extrapolates every run to the formation temperature: 172.6, 196.1 and 226.3 °F. The drill stem test is used as measured.',
      do: async (d) => {
        await tab(d, 'calibration', { onCamera: true });
        await d.sleep(1500);
        await t(d, 'bf-cal-bht').scrollIntoViewIfNeeded();
        await d.select(t(d, 'bf-cal-bht-method'), 'horner');
        await d.type(t(d, 'bf-cal-bht-circ'), '4');
        await expectText(d, 'bf-cal-bht-table', /172\.6[\s\S]*196\.1[\s\S]*226\.3/, 'Horner');
        await d.highlight(t(d, 'bf-cal-bht-table'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'fit', chapter: 'The heat flow', chapterSub: 'Fitted to both data sets',
      say: 'Auto-Fit finds the heat flow that matches the temperatures and the vitrinite together: fifty eight and a half milliwatts per square metre. The vitrinite is matched to about a hundredth of a percent, and the temperatures to under one degree.',
      sub: 'Auto-Fit finds the heat flow that matches the temperatures and the vitrinite together: 58.5 mW/m². The vitrinite is matched to about a hundredth of a percent, and the temperatures to under one degree.',
      do: async (d) => {
        await t(d, 'bf-cal-autofit').scrollIntoViewIfNeeded();
        await d.click(t(d, 'bf-cal-autofit'));
        await expectText(d, 'bf-cal-fit-note', /Heat flow fitted to 58\.5 mW\/m2/, 'fit');
        await d.sleep(2500);
        await expectText(d, 'bf-cal-ro-rms', /^0\.01\d %$/, 'Ro rms');
        await expectText(d, 'bf-cal-temp-rms', /^0\.\d °F$/, 'T rms');
        await d.highlight(t(d, 'bf-cal-fit-note'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.page.evaluate(() => window.scrollTo(0, 0));
        await t(d, 'bf-cal-heatflow').scrollIntoViewIfNeeded();
        await d.sleep(2500);
      } },
    { id: 'maturity', chapter: 'Maturity', chapterSub: 'The Akata at Ekene-1',
      say: 'Run again on the fitted heat flow. The Akata shale at the bottom of the well has reached zero point six one percent: only just inside the oil window, too cool to have generated much here. The Ekene oil came from deeper in the basin, where the Akata is buried far deeper. That is the next video.',
      sub: 'Run again on the fitted heat flow. The Akata shale at the bottom of the well has reached 0.61 %Ro: only just inside the oil window, too cool to have generated much here. The Ekene oil came from deeper in the basin, where the Akata is buried far deeper. That is the next video.',
      do: async (d) => {
        await simulate(d, { onCamera: true });
        await resultsTab(d, 'summary', { onCamera: true });
        await expectText(d, 'bf-present-table', /Akata Formation[\s\S]*0\.613/, 'Akata Ro');
        await d.highlight(t(d, 'bf-present-table'));
        await d.sleep(3000);
        await d.unhighlight();
        await resultsTab(d, 'maturity', { onCamera: true });
        await d.sleep(3500);
      } },
  ],
};
