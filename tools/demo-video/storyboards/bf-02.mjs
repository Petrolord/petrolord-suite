// Basin & Charge Modeling, demo 2: from the kitchen to the traps. The East
// kitchen pseudo-well from its column file, the heat flow calibrated at
// Ekene-1, two Akata sources (oil and gas windows), the Ekene and Oboro
// traps from the traps file, the events chart, and Oboro sent to Prospect
// Risking with its numbers filled in.
import {
  login, expectText, openBf, enterExpert, newModel, importColumn, thermal, simulate, resultsTab,
  deleteModels, seedModel, t, EK1, KITCHEN, asset, trapCell,
} from './basin-common.mjs';

export default {
  id: 'bf-02',
  app: 'Basin & Charge Modeling',
  eyebrow: 'Basin & Charge Modeling · 2 of 3',
  title: 'From the kitchen *to the traps*',
  subtitle: 'Where the Akata source matured, when it expelled oil and gas, and how much reached Ekene and Oboro',
  outroTitle: 'Basin modelling *with Petrolord*',
  outroSub: 'Basin & Charge Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    // only this video's own models in the list (the series leaves its models behind)
    await deleteModels(shared, /^Lesson /);
    await deleteModels(shared, /^Basin demo: Ekene East kitchen$/);
    await seedModel(shared, 'ek1-calibrated', EK1);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'The kitchen', chapterSub: 'East of the field',
      say: 'Ekene-1 is calibrated, but its Akata shale is barely mature. The oil came from the kitchen east of the field, where the delta built thicker and buried the Akata deeper. No well has drilled it, so we model a pseudo-well there.',
      do: async (d) => {
        await d.moveTo(d.page.getByTestId('bf-well-row').filter({ hasText: EK1 }).first());
        await d.sleep(2000);
        await newModel(d, KITCHEN, { onCamera: true });
      } },
    { id: 'column',
      say: 'Its column file has depths below the seabed, the ages, the lithologies and two source intervals in the Akata: an oil-prone marine shale with a total organic carbon of two point four percent and a hydrogen index of three hundred and thirty, and a deeper, gas-prone terrigenous shale.',
      sub: 'Its column file has depths below the seabed, the ages, the lithologies and two source intervals in the Akata: an oil-prone marine shale with a total organic carbon of 2.4 % and a hydrogen index of 330, and a deeper, gas-prone terrigenous shale.',
      do: async (d) => {
        await importColumn(d, 'ekene-east-kitchen-column.csv', { onCamera: true, apply: false });
        await d.highlight(t(d, 'bf-import-preview-tops'));
        await d.sleep(4000);
        await d.unhighlight();
        await d.click(t(d, 'bf-import-apply-tops'));
        await d.sleep(1000);
      } },
    { id: 'thermal', chapter: 'Heat', chapterSub: 'Calibrated at Ekene-1',
      say: 'The seabed is seventy seven degrees again, and the heat flow is the fifty eight and a half milliwatts per square metre that Ekene-1 calibrated. Simulate.',
      sub: 'The seabed is 77 °F again, and the heat flow is the 58.5 mW/m² that Ekene-1 calibrated. Simulate.',
      do: async (d) => {
        await thermal(d, { surfaceF: 77, hf: 58.5, onCamera: true });
        await simulate(d, { onCamera: true });
      } },
    { id: 'burial', chapter: 'Burial and maturity', chapterSub: 'Forty five million years',
      say: 'Fourteen thousand six hundred feet of section. The dashed lines are maturity: the oil window opens at zero point five five percent, and the gas window at one point three, which the deeper source has crossed.',
      sub: '14,610 ft of section. The dashed lines are maturity: the oil window opens at 0.55 %Ro, and the gas window at 1.3, which the deeper source has crossed.',
      do: async (d) => {
        await resultsTab(d, 'burial', { onCamera: true });
        await d.sleep(4500);
      } },
    { id: 'expulsion', chapter: 'Generation and expulsion', chapterSub: 'Oil and gas',
      say: 'Both sources generate as they heat, and expel once the rock can hold no more. The upper source starts expelling about twelve million years ago and stays in the oil window. The lower one expels in the gas window: the dotted line, all of its expulsion.',
      do: async (d) => {
        await resultsTab(d, 'generation', { onCamera: true });
        await d.sleep(5000);
      } },
    { id: 'traps', chapter: 'Traps and charge', chapterSub: 'Ekene and Oboro',
      say: 'On the Timing tab we read the traps file. Ekene, sealed by the Ogbia Shale, closed twelve million years ago and drains twenty five square kilometres of the upper source. Oboro, against the growth fault, closed at sixteen and takes the lower source up the fault. Both at a ten percent migration efficiency.',
      do: async (d) => {
        await resultsTab(d, 'timing', { onCamera: true });
        await d.page.getByTestId('bf-trap-import-input').setInputFiles(asset('ekene-traps.csv'));
        await t(d, 'bf-trap-row-1').waitFor();
        await d.highlight(t(d, 'bf-trap-row-0'));
        await d.sleep(2500);
        await d.highlight(t(d, 'bf-trap-row-1'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'charge',
      say: 'Ninety eight percent of the upper source\'s oil left after Ekene formed: thirty seven and a half million barrels of oil equivalent reach it, three point one times the twelve point one four million barrels it holds, so the suggested charge factor is zero point nine. Oboro takes eighty five billion cubic feet of gas, one point four times its sixty, a factor of zero point seven.',
      sub: '98 % of the upper source\'s oil left after Ekene formed: 37.5 million barrels of oil equivalent reach it, 3.1 times the 12.14 MMstb it holds, so the suggested charge factor is 0.9. Oboro takes 85.2 Bcf of gas, 1.4 times its 60, a factor of 0.7.',
      do: async (d) => {
        await expectText(d, trapCell(d, 'charge', 0), /^37\.5$/, 'Ekene charge');
        await expectText(d, trapCell(d, 'after', 0), /^98 %$/, 'Ekene after');
        await expectText(d, trapCell(d, 'ratio', 0), /^3\.1$/, 'Ekene ratio');
        await expectText(d, trapCell(d, 'factor', 0), /^0\.9$/, 'Ekene factor');
        await expectText(d, trapCell(d, 'gas', 1), /^85\.2$/, 'Oboro gas');
        await expectText(d, trapCell(d, 'ratio', 1), /^1\.4$/, 'Oboro ratio');
        await expectText(d, trapCell(d, 'factor', 1), /^0\.7$/, 'Oboro factor');
        await d.highlight(t(d, 'bf-trap-result-0'));
        await d.sleep(4000);
        await d.highlight(t(d, 'bf-trap-result-1'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'events', chapter: 'Timing', chapterSub: 'The events chart',
      say: 'The events chart puts it on one time line: the source, reservoir and seal rocks, generation, expulsion, and each trap from the age it formed. Both traps were there before the critical moment, the peak of expulsion five million years ago.',
      do: async (d) => {
        await t(d, 'bf-events-chart').scrollIntoViewIfNeeded();
        await d.sleep(1000);
        await d.highlight(t(d, 'bf-critical-moment'));
        await d.sleep(3000);
        await d.unhighlight();
        await d.sleep(2000);
      } },
    { id: 'rcp', chapter: 'Prospect Risking', chapterSub: 'In ReservoirCalc Pro',
      say: 'Prospect Risking sends one trap to ReservoirCalc Pro. Oboro arrives with its fetch area, its age, the efficiency and its source filled in, compared with its sixty billion cubic feet in place, and the factor of zero point seven ready to apply to the prospect\'s chance of success.',
      sub: 'Prospect Risking sends one trap to ReservoirCalc Pro. Oboro arrives with its fetch area, its age, the efficiency and its source filled in, compared with its 60 Bcf in place, and the factor of 0.7 ready to apply to the prospect\'s chance of success.',
      do: async (d) => {
        await t(d, 'bf-trap-result-1').scrollIntoViewIfNeeded();
        await d.click(t(d, 'bf-trap-send-1'));
        await t(d, 'rcp-bf-charge').waitFor({ timeout: 60000 });
        await d.sleep(1500);
        await t(d, 'rcp-bf-charge').scrollIntoViewIfNeeded();
        await expectText(d, 'rcp-bf-charge-result', /about 14\.3 MMboe reaches the trap \(gas: 85\.2 Bcf\)[\s\S]*Suggested charge factor 0\.7/, 'rcp');
        await d.highlight(t(d, 'rcp-bf-charge'));
        await d.sleep(4500);
        await d.unhighlight();
      } },
  ],
};
