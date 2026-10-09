// Lesson F21: Multi-well interpretation, batch run and field view (Ekene-1 to
// Ekene-4, kit v2.1, feet; zones from tops on every well). Dry run
// 2026-10-09, Module E base. Batch run with current parameters: Ekene-1 6
// curves and 9 zone summaries, Ekene-2/3/4 6 curves and 5 zone summaries each.
// Field view summary, Ekene Sand net pay: Ekene-1 27.5, Ekene-2 0.0, Ekene-3
// 51.5, Ekene-4 0.0 ft. Truth: 27.5, wet (sand below the contact), 50.5, wet.
// Field view depth axis in feet needs #947.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, baseParams, MODULE_E_BASE, zoomFieldAt } from './common.mjs';

// displayed depth ranges (ft) of Ekene-1 to -4: logs from 197 ft MD; Ekene-1
// to 7381.5 ft; Ekene Sand tops 5079 (1), 5135 (2), 5056 (3), 5217 (4)
const FLAT = { top: 197 - 5217, base: 7381.5 - 5079 };
const STRUCT = { top: 197, base: 7381.5 };

const WELLS = ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4'];

export default {
  id: 'lesson-f21',
  ...lessonMeta(21, 'F', 'Multi-well interpretation: *one model across the field*', 'Carrying a calibrated interpretation from one well to the field with a batch run, and checking the wells side by side'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    for (const w of ['Ekene-2', 'Ekene-3', 'Ekene-4']) { await openPetroWell(d, shared, w); await ensureZonesOn(d); }
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 21', chapterSub: 'Module F · Uncertainty and delivery',
      say: 'Everything so far was done on one well, Ekene-1, where we had core, a water sample and capillary pressure. A field has many wells. In this lesson we carry that calibrated interpretation across the field in one batch run, and check the wells side by side.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 21', title: 'Multi-well interpretation',
        body: '<ul><li>One calibrated parameter set</li><li>A batch run across the field</li><li>The wells side by side</li><li>Checking each well</li></ul>' }) },
    { id: 'concept', chapter: 'One model, many wells',
      say: 'The parameters we calibrated describe the rock and its water, which are the same in every Ekene well. So they carry. Run them everywhere at once, then look at the wells together: a well that disagrees with its neighbours is either different rock, a different fluid, or a data problem, and each of those deserves a look.',
      do: async (d) => d.slide({ eyebrow: 'One model, many wells', title: 'Calibrate once, apply everywhere',
        body: '<ul><li>Same rock and water: the parameters carry</li><li>Batch run, then compare</li><li>A well that disagrees: rock, fluid or data?</li></ul>' }) },
    { id: 'batch', chapter: 'Batch run',
      say: 'Open Batch. It computes and publishes every curve and zone summary with the parameters now applied. Tick Ekene-1 to Ekene-4, the vertical wells with a full log suite, and run.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('petro-batch'); await d.waitFor('petro-batch-dialog'); await d.sleep(800);
        const rows = d.page.getByTestId('petro-batch-well');
        for (let i = 0; i < await rows.count(); i++) {
          const row = rows.nth(i); const label = await row.innerText(); const want = WELLS.some((w) => new RegExp(`${w}\\b`).test(label));
          const box = row.locator('input[type="checkbox"]');
          if ((await box.isChecked()) !== want) await d.click(box);
        }
        await d.click('petro-batch-run');
        await expectText(d, 'petro-batch-dialog', /Ekene-2\s*6 curves and 5 zone summaries published/, 'batch Ekene-2');
        await d.highlight('petro-batch-dialog');
      } },
    { id: 'field', chapter: 'Side by side', chapterSub: 'The Field view',
      say: 'Now the Field view. Pick the four wells, flatten on the Ekene Sand so the sand lines up across the field, and zoom in. The logs agree from well to well: the same sand, the same shales. But only Ekene-1 and Ekene-3 show pay at the top of the sand.',
      do: async (d) => {
        await d.unhighlight(); await d.page.keyboard.press('Escape'); await d.sleep(500);
        await d.click(d.page.getByRole('button', { name: 'Field', exact: true }).first()); await d.sleep(1200);
        for (const w of WELLS) { const c = d.page.getByTestId(`petro-field-pick-${w}`); if (!(await c.isChecked())) await c.check(); }
        await d.sleep(1200);
        await d.select('petro-field-datum', { label: 'Flatten on Ekene Sand' }); await d.sleep(1200);
        await d.page.getByTestId('petro-field-canvas').dblclick(); await d.sleep(800); // full extent
        await zoomFieldAt(d, 50, 11, FLAT);
      } },
    { id: 'summary', chapter: 'Well by well',
      say: 'The summary below says the same in numbers. Ekene Sand net pay: twenty seven and a half feet in Ekene-1, none in Ekene-2, fifty one and a half in Ekene-3, none in Ekene-4. The earth model: twenty seven and a half, wet, fifty and a half, wet. Ekene-3 is on the crest, with the longest oil column. Ekene-2 and Ekene-4 found the sand below the oil-water contact.',
      do: async (d) => {
        await expectText(d, 'petro-field-summary', /Ekene Sand\s*net 27\.5 ft.{0,60}?net 0\.0 ft.{0,60}?net 51\.5 ft.{0,60}?net 0\.0 ft/, 'field summary');
        await d.highlight(d.page.getByTestId('petro-field-summary').getByText('Ekene Sand', { exact: true }).locator('xpath=ancestor::tr[1]'));
      } },
    { id: 'structure', chapter: 'Structure and the contact',
      say: 'Switch the datum back to structural depth. These wells are vertical and share a kelly bushing, so depth compares directly. The Ekene Sand dips away from Ekene-3. The oil-water contact, at five thousand one hundred and eighteen feet, cuts through the sand in Ekene-1 and Ekene-3, while in Ekene-2 and Ekene-4 the whole sand lies deeper. The interpretation is consistent across the field.',
      do: async (d) => {
        await d.unhighlight(); await d.select('petro-field-datum', { label: 'Structural (MD)' }); await d.sleep(1200);
        await d.page.getByTestId('petro-field-canvas').dblclick(); await d.sleep(800); // full extent
        await zoomFieldAt(d, 5140, 10, STRUCT);
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Calibrate on the well with the most data, carry the parameters across the field with a batch run, and compare the wells side by side. On Ekene, one parameter set gives twenty seven and a half, zero, fifty one and a half and zero feet against a truth of twenty seven and a half, wet, fifty and a half and wet. Next, the last lesson: from petrophysics to volumes, and the deliverables.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 21', title: 'One model across the field',
        body: '<ul><li>Batch run with the calibrated parameters</li><li>Field view, flattened and structural</li><li>Ekene Sand pay: <b>27.5</b>, <b>0</b>, <b>51.5</b>, <b>0</b> ft (truth 27.5, wet, 50.5, wet)</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: from petrophysics to volumes</p>' }) },
  ],
};
