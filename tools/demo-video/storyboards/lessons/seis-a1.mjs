// Seismolord lesson A1: SEG-Y in practice (Ekene kit v4).
// Two files are scanned and neither is imported, so the lesson leaves the
// demo account as it found it: the kit's full stack (IBM float), and a
// lesson copy of the small cube whose textual header was copied from another
// job (seis-lessons-assets/EKENE3D-v4-vendor.sgy: it claims PSDM, 2 ms,
// IBM, bytes 9/21 and the wrong ranges; the traces are the v4 small cube in
// time, IEEE). Figures from the 2026-10-12 probe.
import path from 'node:path';
import { login, expectText, openSeismolord, KIT, FULL } from '../seis-common.mjs';
import { seisLessonMeta, lessonAsset } from './seis-common.mjs';

const VENDOR = 'EKENE3D-v4-vendor.sgy';
const t = (d, id) => d.page.getByTestId(id);
const dialog = (d) => d.page.getByRole('dialog');
const geometry = (d) => dialog(d).getByText(/^Format:/).locator('..');

async function chooseFile(d, button, file) {
  const chooser = d.page.waitForEvent('filechooser');
  await d.click(button);
  await (await chooser).setFiles(file);
}

export default {
  id: 'lesson-seis-a1',
  ...seisLessonMeta(1, 'A', 'SEG-Y *in practice*', 'What is inside a SEG-Y file, IBM and IEEE samples, trace headers and byte mapping, and a textual header that is wrong'),
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
    { id: 'intro', chapter: 'Lesson 1', chapterSub: 'Module A · Getting the seismic in',
      say: 'Every seismic project starts with a SEG-Y file, and most import problems come from trusting the wrong part of it. This lesson opens two files from the Ekene field and reads what is really inside them.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 1', title: 'SEG-Y in practice',
        body: '<ul><li>What a SEG-Y file holds</li><li>IBM and IEEE samples</li><li>Trace headers and byte mapping</li><li>A textual header that is wrong</li></ul>' }) },
    { id: 'layout', chapter: 'Inside the file', chapterSub: 'Headers, then traces',
      say: 'A SEG-Y file opens with a textual header of three thousand two hundred characters, written by whoever processed the data. Then a binary header of four hundred bytes: the sample interval, the number of samples and the sample format. Then the traces, each with its own two hundred and forty byte header, carrying the inline, the crossline and the coordinates, followed by its samples.',
      sub: 'A SEG-Y file opens with a textual header of 3,200 characters, written by whoever processed the data. Then a binary header of 400 bytes: the sample interval, the number of samples and the sample format. Then the traces, each with its own 240-byte header, carrying the inline, the crossline and the coordinates, followed by its samples.',
      do: async (d) => d.slide({ eyebrow: 'Inside the file', title: 'Headers, then traces',
        body: '<ul><li><b>Textual header</b>, 3,200 characters: notes from the processor</li><li><b>Binary header</b>, 400 bytes: interval, samples, format</li><li><b>Each trace</b>: a 240-byte header, then its samples</li></ul>' }) },
    { id: 'formats',
      say: 'The samples come in two common four byte formats: the old IBM floating point, and the IEEE floating point every computer uses today. The same four bytes read in the wrong format give nonsense, so the format code matters.',
      do: async (d) => d.slide({ eyebrow: 'Sample formats', title: 'IBM or IEEE',
        body: '<ul><li><b>IBM float</b> (format 1): the older convention</li><li><b>IEEE float</b> (format 5): today\'s standard</li><li>Same four bytes, different meaning</li></ul>' }) },
    { id: 'open', chapter: 'The full stack', chapterSub: 'What the scan measures',
      say: 'In Seismolord we open the import and choose the Ekene full stack.',
      do: async (d) => {
        await d.hideSlide();
        await d.click('sl-start-go-import');
        await dialog(d).waitFor();
        await chooseFile(d, dialog(d).getByRole('button', { name: 'Choose a SEG-Y or ZGY file' }), path.join(KIT, '04-seismic', FULL));
        await dialog(d).getByText('Vertical axis of this file').waitFor({ timeout: 120000 });
        await d.sleep(1200);
      } },
    { id: 'full',
      say: 'Nothing is imported yet. The scan reads the headers and measures the geometry from the traces themselves: IBM float, twenty one thousand five hundred and four traces, eight hundred and seventy six samples at four milliseconds, inlines one thousand to eleven twenty seven, and crosslines nineteen sixty to twenty one twenty seven.',
      sub: 'Nothing is imported yet. The scan reads the headers and measures the geometry from the traces themselves: IBM float, 21,504 traces, 876 samples at 4 ms, inlines 1000 to 1127, and crosslines 1960 to 2127.',
      do: async (d) => {
        await expectText(d, geometry(d), /Format: IBM float[\s\S]*Traces: 21,504[\s\S]*Samples: 876 @ 4 ms[\s\S]*Inlines: 1000–1127 \(step 1\)[\s\S]*Crosslines: 1960–2127 \(step 1\)/, 'full stack geometry');
        await d.highlight(geometry(d));
      } },
    { id: 'vendor', chapter: 'A second delivery', chapterSub: 'The same cube, another header',
      say: 'Now a second file: a corner of the same survey, as it might arrive from a contractor. The scan says IEEE float this time, two thousand and forty eight traces, the same eight hundred and seventy six samples at four milliseconds, inlines ten thirty eight to ten sixty nine and crosslines nineteen ninety two to twenty fifty five.',
      sub: 'Now a second file: a corner of the same survey, as it might arrive from a contractor. The scan says IEEE float this time, 2,048 traces, the same 876 samples at 4 ms, inlines 1038 to 1069 and crosslines 1992 to 2055.',
      do: async (d) => {
        await d.unhighlight();
        await chooseFile(d, dialog(d).getByRole('button', { name: new RegExp(FULL.replace(/\./g, '\\.')) }), lessonAsset(VENDOR));
        await dialog(d).getByRole('button', { name: VENDOR }).waitFor({ timeout: 60000 });
        await expectText(d, geometry(d), /Format: IEEE float[\s\S]*Traces: 2,048[\s\S]*Samples: 876 @ 4 ms[\s\S]*Inlines: 1038–1069 \(step 1\)[\s\S]*Crosslines: 1992–2055 \(step 1\)/, 'vendor geometry');
        await d.highlight(geometry(d));
      } },
    { id: 'header', chapter: 'The textual header', chapterSub: 'Display only, and it may be wrong',
      say: 'Its textual header tells a different story. It claims a depth migration, two millisecond samples, IBM float, inlines ten oh one to eleven twenty eight, and the inline and crossline in bytes nine and twenty one. It was copied from another job, and almost every line is wrong.',
      sub: 'Its textual header tells a different story. It claims a depth migration, 2 ms samples, IBM float, inlines 1001 to 1128, and the inline and crossline in bytes 9 and 21. It was copied from another job, and almost every line is wrong.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: /Show textual header/ }));
        const pre = dialog(d).locator('pre').first();
        await expectText(d, pre, /2024 REPROCESSING PSDM[\s\S]*INLINE RANGE 1001 TO 1128[\s\S]*SAMPLES 1751 {2}INTERVAL 2 MS[\s\S]*FORMAT IBM FLOAT[\s\S]*BYTE POSITIONS INLINE 9 {2}CROSSLINE 21/, 'textual header');
        await pre.scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight(pre);
      } },
    { id: 'domain', chapter: 'Time or depth', chapterSub: 'Declared, never assumed',
      say: 'Because the header mentions P S D M, Seismolord preselected depth, and says the header may be wrong. The binary header and every trace say four milliseconds, and the events sit where the time stack has them, so we declare two way time.',
      sub: 'Because the header mentions PSDM, Seismolord preselected depth, and says the header may be wrong. The binary header and every trace say 4 ms, and the events sit where the time stack has them, so we declare two-way time.',
      do: async (d) => {
        await d.unhighlight();
        const dom = dialog(d).getByTestId('sl-import-domain');
        await dom.scrollIntoViewIfNeeded(); await d.sleep(800);
        await expectText(d, dom, /The textual header mentions "PSDM", so Depth was preselected\. The header may be wrong/, 'depth hint');
        if (!(await dom.locator('input[name="sl-domain"]').nth(1).isChecked())) throw new Error('Narration mismatch at "depth preselected": Depth is not chosen');
        await d.highlight(dom);
        await d.sleep(2200);
        await d.click(dom.locator('label', { hasText: 'Two-way time' }));
        await d.sleep(600);
        if (!(await dom.locator('input[name="sl-domain"]').first().isChecked())) throw new Error('two-way time was not chosen');
      } },
    { id: 'bytes', chapter: 'Byte mapping', chapterSub: 'Where the inline and crossline really are',
      say: 'Now the byte positions. The header says nine and twenty one, so we try them. Byte nine happens to hold the inline in this file, but byte twenty one is a running trace number: crosslines one to two thousand and forty eight, one trace each. Seismolord warns that these numbers give sixty five thousand five hundred and thirty six positions for two thousand and forty eight traces.',
      sub: 'Now the byte positions. The header says 9 and 21, so we try them. Byte 9 happens to hold the inline in this file, but byte 21 is a running trace number: crosslines 1 to 2048, one trace each. Seismolord warns that these numbers give 65,536 positions for 2,048 traces.',
      do: async (d) => {
        await d.unhighlight();
        const preset = dialog(d).getByRole('combobox').first();
        await preset.scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.select(preset, { label: 'FieldRecord / CDP (9/21)' });
        await d.sleep(1500);
        await expectText(d, geometry(d), /Crosslines: 1–2048 \(step 1\)/, 'crosslines under 9/21');
        const warn = dialog(d).getByText(/The inline and crossline numbers give 65,536 positions for 2,048 traces/);
        await warn.scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight(warn);
      } },
    { id: 'measured',
      say: 'The scan had already measured the right positions: the standard bytes one eight nine and one nine three. Back on those, the warning goes, and the preview table shows each trace header as it is read: trace zero at inline ten thirty eight, crossline nineteen ninety two, with its coordinates.',
      sub: 'The scan had already measured the right positions: the standard bytes 189 and 193. Back on those, the warning goes, and the preview table shows each trace header as it is read: trace 0 at inline 1038, crossline 1992, with its coordinates.',
      do: async (d) => {
        await d.unhighlight();
        const preset = dialog(d).getByRole('combobox').first();
        await preset.scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.select(preset, { label: 'SEG-Y rev1 standard (189/193)' });
        await d.sleep(1500);
        await expectText(d, geometry(d), /Crosslines: 1992–2055 \(step 1\)/, 'crosslines back on 189/193');
        const table = dialog(d).locator('table');
        await expectText(d, table.locator('tbody tr').first(), /^0\s*1038\s*1992\s*399702\.26\s*521762\.31$/, 'first trace header');
        await table.scrollIntoViewIfNeeded(); await d.sleep(800);
        await d.highlight(table);
      } },
    { id: 'rule', chapter: 'The rule', chapterSub: 'Measure, then check',
      say: 'So the rule is simple. The textual header is a note from a person, and it can be wrong. The binary and trace headers are what the software reads. Check the measured ranges against the survey\'s base map before anything is imported. We close the dialog without importing: this file has done its job.',
      do: async (d) => {
        await d.unhighlight();
        await d.click(dialog(d).getByRole('button', { name: 'Close' }).last());
        await d.sleep(800);
        await d.slide({ eyebrow: 'The rule', title: 'Trust the measurement',
          body: '<ul><li>The textual header is a hint</li><li>The binary and trace headers are the data</li><li>Check ranges against the base map</li><li>Declare time or depth yourself</li></ul>' });
      } },
    { id: 'next',
      say: 'Next lesson, coordinates: the project\'s coordinate system, declaring a survey\'s own, and the check that catches a wrong one.',
      do: async (d) => d.slide({ eyebrow: 'Next', title: 'Coordinates', body: '<ul><li>The project CRS</li><li>Declaring a survey\'s CRS</li><li>The area-of-use check</li></ul>' }) },
  ],
};
