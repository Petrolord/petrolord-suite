// Lesson F22: From petrophysics to volumes, and the deliverables (Ekene-1 to
// -4 published by the Lesson 21 batch run; kit v2.1, feet). Dry run
// 2026-10-09 (site ce65146, ReservoirCalc Pro well choice from #946):
// Registry zone Ekene Sand, four wells: porosity 0.197, Sw 0.474, NTG 0.198,
// gross 100.0 ft; Ekene-2 and Ekene-4 marked "no net pay"; with only Ekene-1
// and Ekene-3: NTG 0.395. Export dialog: PDF summary report, per-zone CPI PDF,
// curves and zone summary CSV, LAS 2.0 with the parameters, track PNG, .pld.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams, MODULE_E_BASE } from './common.mjs';

const RCP = '/dashboard/apps/geoscience/reservoircalc-pro';
const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');

export default {
  id: 'lesson-f22',
  ...lessonMeta(22, 'F', 'From petrophysics to volumes: *publishing and deliverables*', 'Publishing the interpretation, feeding ReservoirCalc Pro with the right wells, and the reports and files a petrophysicist hands over'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 22', chapterSub: 'Module F · Uncertainty and delivery',
      say: 'An interpretation is finished when someone else can use it. In this last lesson: publishing the results so other applications read them, feeding the volumes calculation with the right wells, and the reports and files you hand over.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module F · Lesson 22', title: 'From petrophysics to volumes',
        body: '<ul><li>Publishing to the shared registry</li><li>Zone averages into ReservoirCalc Pro</li><li>Choosing the wells that belong</li><li>Reports and files</li></ul>' }) },
    { id: 'publish', chapter: 'Publishing', chapterSub: 'The shared registry',
      say: 'The batch run in Lesson 21 published every curve and zone summary. The zone card says so: published today, and it matches these numbers. If you change a parameter, the card flags the published version as out of date until you publish again. Mapping, Well Correlation and ReservoirCalc Pro all read from this registry.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, ekene(d), /matches these numbers/, 'published');
        await d.highlight(ekene(d)); await d.callout('p', ekene(d), 'Published, and current', 'left');
      } },
    { id: 'rcp', chapter: 'Into ReservoirCalc Pro', chapterSub: 'Zone averages from the registry',
      say: 'Open ReservoirCalc Pro, and its Registry tab. Pick the Ekene Sand. It offers averages pooled over the four wells that published it: porosity nineteen point seven percent, water saturation forty seven, and a net to gross of just under twenty percent.',
      do: async (d, shared) => {
        await d.clearCallouts(); await d.unhighlight();
        await d.page.goto(`${shared.baseUrl}${RCP}`, { waitUntil: 'domcontentloaded' });
        await d.waitFor('rcp-tab-registry'); await d.sleep(1500);
        await d.click('rcp-tab-registry'); await d.sleep(800);
        const opt = (await d.page.getByTestId('rcp-reg-zone').locator('option').allTextContents()).find((x) => /^Ekene Sand \(/.test(x));
        await d.select('rcp-reg-zone', { label: opt });
        await expectText(d, 'rcp-reg-preview', /porosity 0\.197, Sw 0\.474, NTG 0\.198, gross thickness 100\.0 ft from Ekene-1, Ekene-4, Ekene-3, Ekene-2/, 'four-well preview');
        await d.highlight('rcp-reg-preview');
      } },
    { id: 'wells', chapter: 'Choose the wells that belong',
      say: 'But two of those wells found the sand below the oil-water contact, and the panel marks them: no net pay. Pooled in, they halve the net to gross. The oil accumulation is drilled by Ekene-1 and Ekene-3. Untick Ekene-2 and Ekene-4, and net to gross becomes zero point three nine five, from the two oil wells.',
      do: async (d) => {
        await d.unhighlight();
        await d.highlight('rcp-reg-nopay-Ekene-2'); await d.sleep(2500); await d.unhighlight();
        await d.click('rcp-reg-use-Ekene-2'); await d.click('rcp-reg-use-Ekene-4');
        await expectText(d, 'rcp-reg-preview', /NTG 0\.395, gross thickness 100\.0 ft from Ekene-1, Ekene-3/, 'two-well preview');
        await d.highlight('rcp-reg-preview');
      } },
    { id: 'apply', chapter: 'Apply',
      say: 'Apply. ReservoirCalc Pro takes porosity, saturation and net to gross from the petrophysics, records where they came from and which wells were left out, and combines them with the mapped area and the fluid properties to give volumes. The Geoscience and Reservoir series cover those steps.',
      do: async (d) => {
        await d.unhighlight(); await d.click('rcp-reg-apply-zone');
        await expectText(d, 'rcp-reg-note', /Applied/, 'applied');
        await d.highlight('rcp-reg-note');
      } },
    { id: 'export', chapter: 'Deliverables', chapterSub: 'Export',
      say: 'Back in Petrophysics Studio, Export lists the deliverables. A PDF summary report: every parameter and override, the methods with their citations, the zone table, the cutoff sensitivity, provenance, and a log plot for each zone. LAS 2.0 with the computed curves and the parameter set written into the file. Curve and zone CSVs, a track plot, and a portable project package.',
      do: async (d, shared) => {
        await d.unhighlight();
        await openPetroWell(d, shared, 'Ekene-1');
        // parameters applied before leaving for ReservoirCalc Pro may not have been saved yet
        await baseParams(d, MODULE_E_BASE);
        await d.click('petro-export'); await d.waitFor('petro-export-dialog'); await d.sleep(800);
        await d.highlight('petro-export-dialog');
      } },
    { id: 'series', chapter: 'The series', chapterSub: 'Twenty two lessons',
      say: 'That completes Petrophysics with Petrolord. From loading a LAS file, through shale, porosity, water saturation, permeability and core, to uncertainty and volumes, all on one field whose true answers we could check at every step. The Ekene data is free to download, so you can repeat every lesson yourself. Thank you for watching.',
      do: async (d) => { await d.unhighlight(); await d.page.keyboard.press('Escape'); await d.slide({ eyebrow: 'Petrophysics with Petrolord', title: 'Twenty two lessons, one field',
        body: '<ul><li>A: getting the data right</li><li>B: shale and lithology</li><li>C: porosity</li><li>D: water saturation</li><li>E: permeability, net pay and calibration</li><li>F: uncertainty and delivery</li></ul><p style="margin-top:28px;color:#d4ac3a">The Ekene kit is free: link in the description</p>' }); } },
  ],
};
