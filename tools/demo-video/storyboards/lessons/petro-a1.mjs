// Lesson A1: Loading well logs: LAS files, headers and depth references.
// Ekene-1 (kit v2) imported on camera into Well Data Manager; feet.
import fs from 'node:fs';
import path from 'node:path';
import { lessonMeta, login, openWdm, resetWell, expectText, KIT, DATUM_SVG } from './common.mjs';

const LAS = path.join(KIT, '01-wells', 'Ekene-1.las');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const lasHead = () => {
  const lines = fs.readFileSync(LAS, 'utf8').split('\n');
  const pick = (re) => lines.find((l) => re.test(l)) || '';
  const show = ['~Version', /^VERS/, '~Well', /^STRT/, /^STOP/, /^STEP/, /^WELL/, '~Curve', /^GR /, /^RHOB/, /^RT /, '~Parameter', /^EKB/, /^WD /, /^XCOO/, '~Ascii']
    .map((x) => (typeof x === 'string' ? lines.find((l) => l.startsWith(x)) : pick(x)));
  return `<pre style="font-family:'IBM Plex Mono',monospace;font-size:19px;line-height:1.45;background:rgba(0,0,0,.35);padding:22px 26px;border-radius:8px;margin:0;color:#e9efe9;white-space:pre">${esc(show.map((l) => l.slice(0, 64)).join('\n'))}</pre>`;
};

export default {
  id: 'lesson-a1',
  ...lessonMeta(1, 'A', 'Loading well logs: *LAS files and depth references*', 'What a LAS file holds, how to read it in, and how to check the depths before anything else'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await resetWell(d, shared, 'Ekene-1');       // the lesson imports it on camera
    await openWdm(d, shared);
  },
  steps: [
    { id: 'welcome', chapter: 'Welcome', chapterSub: 'Module A · Getting the data right',
      say: 'Welcome to Petrophysics with Petrolord. In this series we learn log analysis by doing it, on one field from start to finish. The field is called Ekene. It is synthetic, built from one earth model, so every answer we get can be checked against the truth, which real data never gives you. The data kit is free to download from the link in the description, so you can follow along. In this first lesson we load a well.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 1', title: 'Loading well logs',
        body: '<ul><li>What a <b>LAS file</b> holds</li><li>Curves, units and the depth index</li><li>The depth reference: <b>KB</b>, sea level and water depth</li><li>Checking what we loaded against the well header</li></ul>' }) },
    { id: 'las', chapter: 'Inside a LAS file', chapterSub: 'Log ASCII Standard, version 2',
      say: 'Most well logs travel as LAS files, the Log ASCII Standard of the Canadian Well Logging Society. A LAS file is plain text, in sections. The version section says which edition of the standard it follows. The well section names the well and gives the start, stop and step of the depth index. The curve section lists every curve with its mnemonic and unit. The parameter section carries everything else the logging company recorded, such as the kelly bushing elevation and the water depth. Then the ASCII section holds the numbers, one line for every depth.',
      do: async (d) => d.slide({ eyebrow: 'Inside a LAS file', title: 'Plain text, in sections',
        body: '<ul><li><b>~Version</b>: the edition of the standard</li><li><b>~Well</b>: name, start, stop and step of the depth</li><li><b>~Curve</b>: every curve, its mnemonic and unit</li><li><b>~Parameter</b>: KB, water depth, temperatures, coordinates</li><li><b>~Ascii</b>: the data, one line per depth</li></ul>', side: lasHead() }) },
    { id: 'datum', chapter: 'Depth references', chapterSub: 'KB, sea level, water depth',
      say: 'Before loading anything, it pays to know what the depths mean. A logging depth is measured along the hole from the kelly bushing, the KB, on the rig floor. To compare wells we need depths from one vertical datum, usually mean sea level. On Ekene one the KB is eighty two feet above sea level, and the sea is one hundred and fifteen feet deep. So the true vertical depth below sea level, TVDSS, is the true vertical depth minus the KB elevation. Get the KB wrong, and every top, contact and pressure in the well moves with it.',
      do: async (d) => d.slide({ eyebrow: 'Depth references', title: 'Where is depth zero?',
        body: 'Logs are measured from the <b>kelly bushing</b>. Wells are compared from <b>mean sea level</b>.', formula: 'TVDSS = TVD − KB elevation', side: DATUM_SVG }) },

    { id: 'door', chapter: 'Import the LAS', chapterSub: 'Well Data Manager',
      say: 'Well Data Manager is the Suite\'s single door for well data. Everything loaded here, every other application reads, so we load each well once. We start with Import LAS.',
      do: async (d) => { await d.hideSlide(); await d.highlight('wdm-open-las'); await d.sleep(1200); await d.unhighlight(); await d.click('wdm-open-las'); await d.waitFor('wdm-las-dialog'); } },
    { id: 'summary',
      say: 'We choose Ekene one dot LAS, and the importer reads it at once. A LAS version two file, with depth in metres. The Suite shows it in feet, because that is how this organisation works: from one hundred and ninety seven to seven thousand three hundred and eighty one and a half feet, every half foot, with ten curves.',
      do: async (d) => {
        await d.page.getByTestId('wdm-las-file').setInputFiles(LAS);
        await expectText(d, 'wdm-las-summary', /LAS 2 · depth in M \(m\) · 197\.0–7381\.5 ft · step 0\.500 ft · 10 curves/, 'LAS summary');
        await d.highlight('wdm-las-summary');
      } },
    { id: 'curves',
      say: 'Each curve gets a row: its mnemonic, the name it is saved under, its description, its unit, and the kind of measurement the Suite recognised. Gamma ray, bulk density, neutron, sonic and resistivity are all identified. Units convert to S I on import and the factor is recorded, so the sonic in microseconds per foot is stored per metre, and shown back in whichever units you choose. Nothing is converted silently.',
      do: async (d) => { await d.unhighlight(); await d.highlight('wdm-las-curves'); await d.scroll('wdm-las-curves', 220, { ms: 1400 }); } },
    { id: 'header',
      say: 'Below the curves is the header. The well name and the unique well identifier come from the file. So do the surface coordinates, read from the X and Y lines in the parameter section, and the total depth, from the deepest sample.',
      do: async (d) => { await d.unhighlight(); await d.highlight('wdm-las-header'); } },
    { id: 'reference',
      say: 'Then the depth reference. The importer read the KB elevation, the mudline elevation and the water depth from the file, and proposes an offshore well, measured from the kelly bushing, eighty two feet above the datum, in one hundred and fifteen feet of water. The file does not name the vertical datum, so we type it: M S L, mean sea level. A depth reference you can read back later is worth the extra second.',
      do: async (d) => {
        await d.unhighlight();
        await expectText(d, 'wdm-las-datum-source', /proposed as offshore in 35\.00 m of water/, 'offshore proposal');
        await d.highlight('wdm-las-datum');
        await d.type('wdm-las-datum-vdatum', 'MSL');
      } },
    { id: 'crs',
      say: 'Last, the coordinate reference system. The coordinates are UTM zone thirty two north, on the WGS eighty four datum: EPSG code three two six three two. This project already uses it, so it is selected for us.',
      do: async (d) => { await d.unhighlight(); await d.highlight(d.page.getByTestId('wdm-las-dialog').getByText('WGS 84 / UTM zone 32N').first(), { pad: 14 }); } },
    { id: 'import',
      say: 'Import. The curves, the header and the depth reference are saved to the registry, and Ekene one joins the well list.',
      do: async (d) => {
        await d.unhighlight(); await d.click('wdm-las-import');
        await d.page.getByTestId('wdm-las-dialog').waitFor({ state: 'hidden', timeout: 180000 });
        await d.waitFor(d.page.getByTestId('wdm-well-row').filter({ hasText: 'Ekene-1' }));
      } },

    { id: 'check', chapter: 'Check what we loaded', chapterSub: 'Against the well header sheet',
      say: 'Now we check. A load is not finished until it has been compared with an independent source, here the operator\'s well header sheet. The header shows the KB at eighty two feet above mean sea level, and the water depth at one hundred and fifteen feet. The header sheet says twenty five metres and thirty five metres: the same values. The total depth is the last logged sample, and the coordinates match to the metre.',
      do: async (d) => {
        await d.click(d.page.getByTestId('wdm-well-row').filter({ hasText: 'Ekene-1' }).first());
        await d.click('wdm-detail-tab-header');
        await expectText(d, 'wdm-datum-line', /KB 82\.02 ft above MSL, water depth 114\.83 ft/, 'header datum');
        await d.highlight('wdm-datum-line', { pad: 10 });
        await d.callout('kb', 'wdm-datum-line', 'Header sheet: KB 25 m = 82.0 ft, water depth 35 m = 114.8 ft', 'below');
      } },
    { id: 'logs',
      say: 'The logs tab lists every curve with its interval, its step, its number of samples and its nulls. Eleven curves, with the depth index, fourteen thousand three hundred and seventy samples each, and no null values. A curve with many nulls, or one that stops short of the others, is the first thing to question.',
      do: async (d) => { await d.clearCallouts(); await d.unhighlight(); await d.click('wdm-detail-tab-logs'); await d.waitFor('wdm-logs-table'); await d.highlight('wdm-logs-table'); } },
    { id: 'plot',
      say: 'Tick a curve to plot it. Gamma ray and deep resistivity give a first look at the well: high gamma ray shale above, the clean, low gamma ray Ekene Sand near five thousand one hundred feet, and the high resistivity of the Oboro gas sand further down.',
      do: async (d) => { await d.unhighlight(); await d.click('wdm-plot-GR'); await d.click('wdm-plot-RT'); await d.sleep(1500); } },
    { id: 'map',
      say: 'The map places the well among the others in the field, from the coordinates we just checked. A well in the wrong place on this map is a coordinate system or a unit problem, and the cheapest time to catch it is now.',
      do: async (d) => { await d.click(d.page.getByRole('button', { name: 'Map' }).first()); await d.sleep(1500); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. A LAS file is plain text in sections: version, well, curves, parameters and data. Read the summary, the curves and their units before you import. Set the depth reference, KB and water depth, and name the datum. Then compare what you loaded with the well header. In the next lesson we add formation tops, a deviation survey and checkshots, and see how measured depth, true vertical depth and depth below sea level relate.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 1', title: 'Load once, check twice',
        body: '<ul><li>A LAS file: version, well, curves, parameters, data</li><li>Read the summary, curves and units before importing</li><li>Set the depth reference and <b>name the datum</b></li><li>Compare what you loaded with the well header</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: tops, deviation surveys and checkshots</p>' }) },
  ],
};
