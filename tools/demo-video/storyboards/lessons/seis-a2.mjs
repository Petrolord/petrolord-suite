// Seismolord lesson A2: coordinates (Ekene kit v4).
// The project CRS and its lock, then the CRS declared for a survey on the
// lesson file of A1 (seis-lessons-assets/EKENE3D-v4-vendor.sgy), which is
// scanned and not imported. Wrong systems that the area-of-use check passes
// (Minna / Nigeria West Belt, UTM 31N) and one it catches (UTM 32S).
// Distances: proj4, the first CDP (399702.26, 521762.31) read in each wrong
// system and placed in UTM 32N: West Belt 497 km, 31N 667 km away.
// Figures from the 2026-10-12 probe.
import { login, expectText, openSeismolord } from '../seis-common.mjs';
import { seisLessonMeta, lessonAsset } from './seis-common.mjs';

const t = (d, id) => d.page.getByTestId(id);
const dialog = (d) => d.page.getByRole('dialog');
const crsBox = (d) => dialog(d).getByText('Coordinate reference system of this file').locator('..').locator('..');
const crsButton = (d) => crsBox(d).locator('button').filter({ hasText: /EPSG|Choose/ }).first();

async function declare(d, query, name) {
  await d.click(crsButton(d));
  await d.sleep(500);
  await d.type(dialog(d).getByPlaceholder('Search name, EPSG code or region'), query);
  await d.sleep(700);
  await d.click(dialog(d).getByTestId('crs-search-results').locator('button', { hasText: name }).first());
  await d.sleep(1000);
}

export default {
  id: 'lesson-seis-a2',
  ...seisLessonMeta(2, 'A', 'Coordinates: *the frame everything shares*', 'The project CRS, declaring the coordinate system of a survey, and what the area-of-use check can and cannot catch'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openSeismolord(d, shared);
    await d.page.getByRole('combobox', { name: 'Active volume' }).selectOption({ value: '' }).catch(() => {});
    if (!(await t(d, 'sl-start-step-import').isVisible())) {
      if (!(await d.page.getByRole('tab', { name: 'Start here' }).isVisible())) await t(d, 'sl-start-toggle').click();
      await d.page.getByRole('tab', { name: 'Start here' }).click();
      await d.sleep(800);
    }
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 2', chapterSub: 'Module A · Getting the seismic in',
      say: 'A seismic survey, the wells and every map have to sit in one frame, or the wells land in the wrong place on the section. This lesson is about that frame: the project\'s coordinate system, and the one each file is declared in.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 2', title: 'Coordinates',
        body: '<ul><li>The project CRS</li><li>Declaring a survey\'s CRS</li><li>What the area-of-use check catches</li></ul>' }) },
    { id: 'crs', chapter: 'What a CRS is', chapterSub: 'A datum and a projection',
      say: 'A coordinate reference system is a datum, the shape of the earth it is measured on, and a projection that flattens it into eastings and northings. The same pair of numbers means a different place in a different system, and nothing in the numbers says which system they belong to.',
      do: async (d) => d.slide({ eyebrow: 'What a CRS is', title: 'The same numbers, different places',
        body: '<ul><li><b>Datum</b>: WGS 84, Minna, ...</li><li><b>Projection</b>: UTM zone 32N, Nigeria West Belt, ...</li><li>The numbers never say which</li></ul>' }) },
    { id: 'project', chapter: 'The project CRS', chapterSub: 'One frame for every dataset',
      say: 'The project CRS is shown in the status bar: W G S eighty four, U T M zone thirty two north. Every import is converted into it. It is locked once data is stored: here twenty two datasets, six in wells, six in surfaces and ten in seismic volumes. Changing it reprojects all of them.',
      sub: 'The project CRS is shown in the status bar: WGS 84 / UTM zone 32N. Every import is converted into it. It is locked once data is stored: here 22 datasets, 6 in wells, 6 in surfaces and 10 in seismic volumes. Changing it reprojects all of them.',
      do: async (d) => {
        await d.hideSlide();
        const sb = d.page.getByRole('button', { name: /EPSG:32632/ }).last();
        await d.highlight(sb);
        await d.sleep(1200);
        await d.unhighlight();
        await d.click(sb);
        await dialog(d).waitFor();
        await expectText(d, dialog(d), /EPSG:32632\s*WGS 84 \/ UTM zone 32N[\s\S]*The Project CRS is locked: 22 dataset\(s\) are already stored in it 6 in wells, 6 in surfaces, 10 in seismic volumes/, 'project CRS lock');
        await d.highlight(dialog(d).getByText(/The Project CRS is locked/));
      } },
    { id: 'open', chapter: 'Declaring a survey\'s CRS', chapterSub: 'Every import says which system',
      say: 'Now the import. We open the contractor\'s file from the last lesson. Every file must declare its own system before it imports, and Seismolord suggests one from the textual header.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(600);
        await d.click('sl-start-go-import');
        await dialog(d).waitFor();
        const chooser = d.page.waitForEvent('filechooser');
        await d.click(dialog(d).getByRole('button', { name: 'Choose a SEG-Y or ZGY file' }));
        await (await chooser).setFiles(lessonAsset('EKENE3D-v4-vendor.sgy'));
        await dialog(d).getByText('Vertical axis of this file').waitFor({ timeout: 120000 });
        await d.sleep(1000);
        // as in lesson 1: the header's PSDM preselects depth; the file is in time
        const dom = dialog(d).getByTestId('sl-import-domain');
        await dom.scrollIntoViewIfNeeded(); await d.sleep(600);
        await d.click(dom.locator('label', { hasText: 'Two-way time' }));
        await crsBox(d).scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.click(crsButton(d));
        await d.sleep(800);
        await d.highlight(dialog(d).getByText('Suggested by the file header (verify before trusting)').locator('..'));
      } },
    { id: 'suggest',
      say: 'The suggestion comes from line four of the header: U T M zone thirty two north. The last lesson showed how far a header can be trusted, so the suggestion is only that, and the scanned coordinates are checked against the system\'s area of use.',
      sub: 'The suggestion comes from line four of the header: UTM zone 32N. The last lesson showed how far a header can be trusted, so the suggestion is only that, and the scanned coordinates are checked against the system\'s area of use.',
      do: async (d) => {
        await expectText(d, dialog(d).getByText('Suggested by the file header (verify before trusting)').locator('..'), /from: “C 4 CRS EPSG:32632 WGS 84 \/ UTM zone 32N”/, 'header suggestion');
        await d.click(crsButton(d)); // closes the list
        await d.sleep(500);
        await d.unhighlight();
        await expectText(d, crsBox(d), /No conversion needed\.\s*Scanned coordinates are plausible for this system\./, 'plausible 32N');
        await d.highlight(crsBox(d).getByText('Scanned coordinates are plausible for this system.'));
      } },
    { id: 'westbelt', chapter: 'Plausible is not right', chapterSub: 'Two wrong systems that pass',
      say: 'Suppose someone declares the Nigerian grid instead: Minna, Nigeria West Belt. The placement will be converted at import, and the coordinates are still plausible, because they fall inside Nigeria. But read in that system, this survey would land about five hundred kilometres from where it is.',
      do: async (d) => {
        await d.unhighlight();
        await declare(d, 'Minna', 'Minna / Nigeria West Belt');
        await expectText(d, crsBox(d), /EPSG:26391[\s\S]*The survey placement will be converted at import\. Traces are never resampled\.\s*Scanned coordinates are plausible for this system\./, 'West Belt plausible');
        await d.highlight(crsBox(d));
      } },
    { id: 'zone31',
      say: 'The neighbouring U T M zone, thirty one north, passes too. That one would put the survey about six hundred and seventy kilometres to the west. The area-of-use check cannot tell neighbours apart: the numbers are valid in both.',
      sub: 'The neighbouring UTM zone, 31N, passes too. That one would put the survey about 670 km to the west. The area-of-use check cannot tell neighbours apart: the numbers are valid in both.',
      do: async (d) => {
        await d.unhighlight();
        await declare(d, '32631', 'WGS 84 / UTM zone 31N');
        await expectText(d, crsBox(d), /EPSG:32631[\s\S]*converted at import[\s\S]*Scanned coordinates are plausible for this system\./, '31N plausible');
        await d.highlight(crsBox(d));
      } },
    { id: 'zone32s', chapter: 'What the check catches', chapterSub: 'The wrong hemisphere',
      say: 'What it does catch is a gross error. Zone thirty two south is the classic slip of the wrong hemisphere. Now the coordinates fall outside the system\'s area of use, and the import will not go ahead unless you tick that you have verified them yourself. We will not.',
      sub: 'What it does catch is a gross error. Zone 32S is the classic slip of the wrong hemisphere. Now the coordinates fall outside the system\'s area of use, and the import will not go ahead unless you tick that you have verified them yourself. We will not.',
      do: async (d) => {
        await d.unhighlight();
        await declare(d, '32732', 'WGS 84 / UTM zone 32S');
        const warn = crsBox(d).getByText(/The scanned coordinates fall outside this system's area of use/).locator('..').locator('..');
        await expectText(d, warn, /fall outside this system's area of use[\s\S]*Import as declared anyway\. I have verified the coordinates myself\./, '32S caught');
        await d.highlight(warn);
      } },
    { id: 'back',
      say: 'Back on zone thirty two north: no conversion, and plausible.',
      sub: 'Back on zone 32N: no conversion, and plausible.',
      do: async (d) => {
        await d.unhighlight();
        await declare(d, '32632', 'WGS 84 / UTM zone 32N');
        await expectText(d, crsBox(d), /EPSG:32632[\s\S]*No conversion needed\.\s*Scanned coordinates are plausible for this system\./, 'back on 32N');
        await d.highlight(crsBox(d));
      } },
    { id: 'rule', chapter: 'How to know', chapterSub: 'Evidence beyond the header',
      say: 'So how do you know the system is right? From the processing report, from the survey\'s base map, and from the wells: if the Ekene wells land on the survey where the base map has them, the frame is right. The check only stops the gross mistakes. We close without importing.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(800);
        await d.slide({ eyebrow: 'How to know', title: 'Plausible is not proof',
          body: '<ul><li>The processing report names the system</li><li>The base map shows where the survey sits</li><li>The wells must land where they belong</li><li>The check catches only gross errors</li></ul>' });
      } },
    { id: 'next',
      say: 'Next lesson, looking at the data: sections and slices, polarity, gain and colour, and why gain is never baked in.',
      do: async (d) => d.slide({ eyebrow: 'Next', title: 'Viewing', body: '<ul><li>Sections and slices</li><li>Polarity</li><li>Gain, AGC and colour maps</li></ul>' }) },
  ],
};
