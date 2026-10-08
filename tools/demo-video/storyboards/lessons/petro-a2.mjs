// Lesson A2: Formation tops, deviation surveys and checkshots: MD, TVD, TVDSS.
// Ekene-1 (vertical) gets its tops and checkshots on camera; Ekene-8
// (deviated) is shown without its survey, then with it. Figures from the
// 2026-10-08 dry run (kit v2): Ekene-8 Ekene Sand 5428.2 ft MD; TVD
// 5428.2 -> 5079.8 ft once the survey is in; TVDSS 4997.7 ft (Ekene-1 4996.7).
import { lessonMeta, login, openWdm, resetWell, seedWells, expectText, kitCsv, DATUM_SVG, MDTVD_SVG } from './common.mjs';

const row = (d, name) => d.page.getByTestId('wdm-well-row').filter({ hasText: new RegExp(`^${name}(?!\\d)`) }).first();
// the row's text runs the cells together ("Ekene Sand5078.7..."), so the name
// is followed directly by a digit; this keeps "Ekene Sand Base" out
const topRow = (d, name) => d.page.getByTestId('wdm-top-row').filter({ hasText: new RegExp(`^${name}\\d`) }).first();

export default {
  id: 'lesson-a2',
  ...lessonMeta(2, 'A', 'Tops, surveys and checkshots: *MD, TVD and TVDSS*', 'Formation tops, why a deviated well needs its survey, and how checkshots tie depth to seismic time'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    // Ekene-1 with logs only (tops and checkshots go in on camera); Ekene-8
    // with logs and tops but no survey
    await resetWell(d, shared, 'Ekene-1');
    await resetWell(d, shared, 'Ekene-8');
    seedWells(shared, ['Ekene-1'], { tops: false });
    seedWells(shared, ['Ekene-8']);
    await openWdm(d, shared);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 2', chapterSub: 'Module A · Getting the data right',
      say: 'In the last lesson we loaded Ekene one and set its depth reference. Now we add the data that tells us where the formations are: the formation tops, a deviation survey, and checkshots. Along the way we meet the three depths every petrophysicist works with, and see what goes wrong when one of them is missing.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 2', title: 'Tops, surveys and checkshots',
        body: '<ul><li><b>Formation tops</b>: where each unit starts</li><li>Three depths: <b>MD</b>, <b>TVD</b> and <b>TVDSS</b></li><li>Why a deviated well needs its <b>survey</b></li><li><b>Checkshots</b>: tying depth to seismic time</li></ul>' }) },
    { id: 'depths', chapter: 'Three depths', chapterSub: 'Measured, vertical, below sea level',
      say: 'Measured depth, MD, is the length of hole from the kelly bushing, which is what the logging cable measures. True vertical depth, TVD, is how far straight down that point is. In a vertical well the two are the same. In a deviated well, MD is always longer. And TVDSS is the true vertical depth below sea level: TVD minus the KB elevation. Tops and contacts are compared between wells in TVDSS, because only that depth is measured from the same datum in every well.',
      do: async (d) => d.slide({ eyebrow: 'Three depths', title: 'MD, TVD and TVDSS',
        body: '<ul><li><b>MD</b>: along the hole, from the KB</li><li><b>TVD</b>: straight down, from the KB</li><li><b>TVDSS</b>: straight down, from sea level</li><li>Compare wells in <b>TVDSS</b></li></ul>', formula: 'TVDSS = TVD − KB elevation', side: MDTVD_SVG }) },

    { id: 'tops', chapter: 'Formation tops', chapterSub: 'Ekene-1, a vertical well',
      say: 'Ekene one has its logs, but no tops yet. The geologist\'s tops come as a table of names and measured depths, so we paste them. Edit, replace from paste.',
      do: async (d) => {
        await d.hideSlide();
        await d.click(row(d, 'Ekene-1')); await d.click('wdm-detail-tab-tops');
        await d.click('wdm-edit-tops'); await d.click('wdm-tops-paste-toggle');
      } },
    { id: 'paste',
      say: 'The header says the depths are in metres, and the importer reads the unit from it, so nothing is converted by guesswork. Ten tops, from the seabed to the Akata Formation.',
      do: async (d) => {
        const tops = kitCsv('01-wells/tops/Ekene-1-tops.csv');
        await d.highlight('wdm-tops-paste-text');
        await d.page.getByTestId('wdm-tops-paste-text').fill(['Surface\tMD (m)', ...tops.map((r) => `${r.top_name}\t${r.md_m}`)].join('\n'));
        await d.sleep(800);
      } },
    { id: 'saved',
      say: 'Save, and the table shows each top in three depths. This well is vertical, so TVD equals MD, and TVDSS is eighty two feet less. The Ekene Sand starts at five thousand and seventy nine feet measured depth, four thousand nine hundred and ninety seven feet below sea level.',
      do: async (d) => {
        await d.unhighlight(); await d.click('wdm-tops-save');
        await expectText(d, topRow(d, 'Ekene Sand'), /5078\.7\s*5078\.7\s*4996\.7/, 'Ekene-1 Ekene Sand');
        await d.highlight(topRow(d, 'Ekene Sand'), { pad: 6 });
        await d.callout('e1', topRow(d, 'Ekene Sand'), 'MD 5,078.7 · TVD 5,078.7 · TVDSS 4,996.7 ft', 'below');
      } },

    { id: 'ekene8', chapter: 'A deviated well', chapterSub: 'Ekene-8, from the Ekene Alpha pad',
      say: 'Now Ekene eight. It was drilled from the platform and steered out toward the east, and its logs and tops are loaded. Look at the Ekene Sand: five thousand four hundred and twenty eight feet measured depth, and the same in TVD, so it sits five thousand three hundred and forty six feet below sea level. That is three hundred and fifty feet deeper than in Ekene one. Either the reservoir dips steeply between two wells a few hundred metres apart, or something is wrong with the depths.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await d.click(row(d, 'Ekene-8')); await d.click('wdm-detail-tab-tops');
        await expectText(d, topRow(d, 'Ekene Sand'), /5428\.2\s*5428\.2\s*5346\.2/, 'Ekene-8 without survey');
        await d.highlight(topRow(d, 'Ekene Sand'), { pad: 6 });
        await d.callout('e8a', topRow(d, 'Ekene Sand'), 'TVDSS 5,346.2 ft: 350 ft deeper than Ekene-1?', 'below');
      } },
    { id: 'nosurvey',
      say: 'The deviation tab gives the reason. There is no survey, so the well is treated as vertical, and every true vertical depth is simply the measured depth. For a deviated well, that is wrong.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.click('wdm-detail-tab-deviation'); await d.sleep(800); await d.highlight(d.page.getByText(/No deviation survey/).first(), { pad: 8 }); } },
    { id: 'survey', chapter: 'Deviation survey', chapterSub: 'Measured depth, inclination, azimuth',
      say: 'A deviation survey records, at stations down the hole, the measured depth, the inclination from vertical, and the azimuth from north. From those, the minimum curvature method computes where the hole goes, and so the true vertical depth of every point. We paste the directional company\'s survey: seventy eight stations, in metres.',
      do: async (d) => {
        await d.unhighlight();
        await d.click('wdm-edit-deviation'); await d.click('wdm-deviation-paste-toggle');
        const sv = kitCsv('01-wells/surveys/Ekene-8-survey.csv');
        await d.page.getByTestId('wdm-deviation-paste-text').fill(['MD (m)\tInclination\tAzimuth', ...sv.map((r) => `${r.md_m}\t${r.inclination_deg}\t${r.azimuth_deg_grid}`)].join('\n'));
        await d.highlight('wdm-deviation-paste-text');
      } },
    { id: 'save-survey',
      say: 'Save.',
      do: async (d) => { await d.unhighlight(); await d.click('wdm-deviation-save'); await d.sleep(1500); } },
    { id: 'fixed',
      say: 'Back to the tops. The measured depth has not changed, but the Ekene Sand is now at five thousand and eighty feet TVD, four thousand nine hundred and ninety eight feet below sea level. Within a foot of Ekene one. The reservoir is flat, and it always was: the three hundred and fifty feet came from a missing survey. The tops sheet from the operator agrees, to a tenth of a foot.',
      do: async (d) => {
        await d.click('wdm-detail-tab-tops');
        await expectText(d, topRow(d, 'Ekene Sand'), /5428\.2\s*5079\.8\s*4997\.7/, 'Ekene-8 with survey');
        await d.highlight(topRow(d, 'Ekene Sand'), { pad: 6 });
        await d.callout('e8b', topRow(d, 'Ekene Sand'), 'TVDSS 4,997.7 ft: level with Ekene-1', 'below');
      } },

    { id: 'cs-concept', chapter: 'Checkshots', chapterSub: 'From depth to seismic time',
      say: 'Last, checkshots. Seismic is recorded in time, logs in depth. To tie them, a geophone is lowered into the well and a source fires at the surface. The first arrival at each depth is the one way time. Seismic sections show two way time, down and back up, so double it. A table of depth against time lets every log, top and contact be placed on the seismic.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.slide({ eyebrow: 'Checkshots', title: 'Depth in feet, seismic in seconds',
        body: '<ul><li>A geophone in the well, a source at the surface</li><li>First arrival at each depth: <b>one way time</b></li><li>Seismic shows <b>two way time</b></li><li>Depth against time ties logs to seismic</li></ul>', formula: 'TWT = 2 × OWT' }); } },
    { id: 'cs-paste',
      say: 'On Ekene one\'s checkshot tab, we paste the survey\'s depths and one way times. The convention matters, so the Suite asks: depths measured along the hole, in metres, and one way time.',
      do: async (d) => {
        await d.hideSlide();
        await d.click(row(d, 'Ekene-1')); await d.click('wdm-detail-tab-checkshots');
        await d.click('wdm-edit-checkshots'); await d.click('wdm-checkshots-paste-toggle');
        await d.highlight('wdm-checkshots-cs-convention');
        const cs = kitCsv('01-wells/checkshots/Ekene-1-checkshots.csv');
        await d.page.getByTestId('wdm-checkshots-paste-text').fill(['MD (m)\tOWT (ms)', ...cs.map((r) => `${r.md_m}\t${r.one_way_time_ms}`)].join('\n'));
      } },
    { id: 'cs-saved',
      say: 'Save. Sixteen levels, each stored with its depth below sea level and its two way time. Near the Ekene Sand the two way time is about one point three seconds, which is where we will look for it on the seismic.',
      do: async (d) => {
        await d.unhighlight(); await d.click('wdm-checkshots-save');
        await d.sleep(1500);
        await d.highlight(d.page.getByText('1301.0').first(), { pad: 8 });
      } },
    { id: 'inventory',
      say: 'The inventory now shows what each well carries: Ekene one with its tops and checkshots, Ekene eight with its survey. It is worth a look before any interpretation, because a well without its survey or its tops is exactly the kind of gap that surfaces later as a wrong map.',
      do: async (d) => { await d.unhighlight(); await d.click(d.page.getByRole('button', { name: 'Inventory' }).first()); await d.sleep(1500); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Tops come in as names and measured depths; read the unit from the header. A deviated well needs its survey, or every vertical depth is wrong, and here by three hundred and fifty feet. Compare wells in depth below sea level. Checkshots tie depth to seismic time, and seismic shows two way time. In the next lesson we look hard at the logs themselves, and learn to spot the measurements we should not trust.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 2', title: 'Every depth has a reference',
        body: '<ul><li>Tops: names and MD; read the unit from the header</li><li>No survey, no TVD: Ekene-8 read <b>350 ft</b> too deep</li><li>Compare wells in <b>TVDSS</b></li><li>Checkshots tie depth to <b>two way time</b></li></ul><p style="margin-top:28px;color:#d4ac3a">Next: log quality control</p>' }) },
  ],
};
