// Pore Pressure Studio, demo 1: from logs to a pore pressure prognosis
// (Ekene kit v4, oilfield units). A working copy of the discovery well
// Ekene-1 in the registry ("PPS demo: Ekene-1", seed/pps.mjs): the water
// column from the well's datum, overburden from the density log, the normal
// compaction trend on gamma ray shale picks above the overpressure, Eaton
// read in the shales and drawn as an interpreted line, and the drilling
// window with its casing seats. `expectText` stops the take if the screen
// disagrees with the narration (LENIENT=1 logs instead, for writing).
import {
  expectText, setupStudio, pickWell, units, setParams, readout, dockTo, t, WELL,
} from './pps-common.mjs';

export default {
  id: 'pps-01',
  app: 'Pore Pressure Studio',
  eyebrow: 'Pore Pressure Studio · 1 of 3',
  title: 'From logs to a *pore pressure prognosis*',
  subtitle: 'Overburden from density, a normal compaction trend in the shales, Eaton, and the drilling window it leaves',
  outroTitle: 'Pore pressure *with Petrolord*',
  outroSub: 'Pore Pressure Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await setupStudio(d, shared);
  },
  steps: [
    { id: 'intro', chapter: 'Pore Pressure Studio', chapterSub: 'Ekene-1, the discovery well',
      say: 'Before a well is drilled, someone has to say what pressure the rocks hold and what pressure they will take before they break. Pore Pressure Studio works from the logs in the shared well registry. Here is a working copy of Ekene-1, the discovery well, loaded from the Ekene kit, so the field\'s own well record stays exactly as it is.',
      sub: 'Before a well is drilled, someone has to say what pressure the rocks hold and what pressure they will take before they break. Pore Pressure Studio works from the logs in the shared well registry. Here is a working copy of Ekene-1, the discovery well, loaded from the Ekene kit, so the field\'s own well record stays exactly as it is.',
      do: async (d) => {
        await d.sleep(1500);
        await d.moveTo(t(d, 'pp-well-row').first());
        await d.sleep(1200);
        await pickWell(d, WELL, { onCamera: true });
      } },
    { id: 'datum', chapter: 'The water column', chapterSub: 'From the well\'s datum',
      say: 'Ekene is offshore. The studio takes the water column from the well\'s own datum in the registry: one hundred and fifteen feet of water, with the mudline at one hundred and ninety seven feet below the rotary table. Every pressure below starts from that column.',
      sub: 'Ekene is offshore. The studio takes the water column from the well\'s own datum in the registry: 115 ft of water, with the mudline at 197 ft below the rotary table. Every pressure below starts from that column.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-note-water'), /115 ft of water, mudline 197 ft MD/, 'water column');
        await d.highlight(t(d, 'pp-note-water'));
        await d.sleep(2500);
        await d.unhighlight();
        await dockTo(d, 'pp-param-wd');
        await d.highlight(t(d, 'pp-param-mudline'));
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'units', chapter: 'Pounds per gallon', chapterSub: 'Measured depth below the rotary table',
      say: 'A driller reads pressure as a mud weight, so the view is switched to pounds per gallon, equivalent mud weight, against measured depth below the rotary table.',
      sub: 'A driller reads pressure as a mud weight, so the view is switched to pounds per gallon (ppg EMW) against measured depth below the rotary table.',
      do: async (d) => {
        await units(d, { pressure: 'ppg', ref: 'md', onCamera: true });
        await d.sleep(1200);
      } },
    { id: 'obg', chapter: 'Overburden', chapterSub: 'The weight of the rock above',
      say: 'The black line is the overburden: the seawater, then the density log integrated down the well. At total depth, seven thousand three hundred and eighty two feet, the rock above weighs eighteen point five four pounds per gallon.',
      sub: 'The black line is the overburden: the seawater, then the density log integrated down the well. At total depth, 7,382 ft, the rock above weighs 18.54 ppg.',
      do: async (d) => {
        await readout(d, 7382, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-obg'), /OBG 18\.54/, 'overburden at TD');
        await d.highlight(t(d, 'pp-readout-obg'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'nct', chapter: 'The normal trend', chapterSub: 'Shale picks above the overpressure',
      say: 'Pore pressure comes from how much the shales failed to compact. In the NCT view the sonic is plotted against depth. Ekene is normally pressured down to about four thousand two hundred feet, so the trend is picked there: one shale per hundred feet, where the gamma ray reads sixty A. P. I. or more.',
      sub: 'Pore pressure comes from how much the shales failed to compact. In the NCT view the sonic is plotted against depth. Ekene is normally pressured down to about 4,200 ft, so the trend is picked there: one shale per 100 ft, where the gamma ray reads 60 API or more.',
      do: async (d) => {
        await d.click(t(d, 'pp-view-nct'));
        await d.sleep(1500);
        await d.type(t(d, 'pp-shale-cutoff'), '60');
        await d.type(t(d, 'pp-shale-from'), '328');
        await d.type(t(d, 'pp-shale-to'), '4035');
        await d.type(t(d, 'pp-shale-every'), '100');
        await d.click(t(d, 'pp-auto-pick'));
        await d.sleep(1200);
      } },
    { id: 'fit',
      say: 'Thirteen picks. Fitting the trend through them gives the sonic a shale would read at each depth if it had compacted normally: the dashed line. Below about four thousand feet the measured sonic peels away from it. That slower sonic is the overpressure.',
      sub: 'Thirteen picks. Fitting the trend through them gives the sonic a shale would read at each depth if it had compacted normally: the dashed line. Below about 4,000 ft the measured sonic peels away from it. That slower sonic is the overpressure.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-fit-nct'), /Fit NCT \(13 picks\)/, 'picks');
        await d.click(t(d, 'pp-fit-nct'));
        await d.sleep(1500);
        await d.highlight(t(d, 'pp-nct-chart'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'shale', chapter: 'Eaton, in the shales', chapterSub: 'Pressures from shale samples',
      say: 'Eaton turns the gap between the measured and the normal sonic into a pore pressure, with the published exponent of three. A sand says nothing about compaction, so the pressure is read only in the shales, here where the gamma ray reaches eighty two A. P. I., and carried across the sands.',
      sub: 'Eaton turns the gap between the measured and the normal sonic into a pore pressure, with the published exponent of 3. A sand says nothing about compaction, so the pressure is read only in the shales, here where the gamma ray reaches 82 API, and carried across the sands.',
      do: async (d) => {
        await d.type(t(d, 'pp-shale-cutoff'), '82');
        await d.sleep(800);
        await d.click(t(d, 'pp-view-prognosis'));
        await d.sleep(1500);
        await expectText(d, t(d, 'pp-note-pressures'), /Pore pressure from 5036 shale samples \(GR at or above 82 API\)/, 'shale samples');
        await d.highlight(t(d, 'pp-note-pressures'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'line', chapter: 'The interpreted line', chapterSub: 'Through the shale points',
      say: 'The pale points are the pressures at each shale sample. A specialist draws the design pore pressure as a line through them, so one shale that reads like a sand does not move the mud weight. Here the line is the median of the shale pressures over three hundred feet.',
      sub: 'The pale points are the pressures at each shale sample. A specialist draws the design pore pressure as a line through them, so one shale that reads like a sand does not move the mud weight. Here the line is the median of the shale pressures over 300 ft.',
      do: async (d) => {
        await d.highlight(t(d, 'pp-prognosis-chart'));
        await d.sleep(2500);
        await d.unhighlight();
        await dockTo(d, 'pp-line-window');
        await setParams(d, { 'pp-line-window': '300' }, { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'readouts', chapter: 'Reading it', chapterSub: 'The Ekene Sand and total depth',
      say: 'At the Ekene Sand, five thousand one hundred and eighteen feet, the prognosis reads twelve point six two pounds per gallon, against a hydrostatic of eight point four five. The overpressure keeps building to fourteen point two five at total depth.',
      sub: 'At the Ekene Sand, 5,118 ft, the prognosis reads 12.62 ppg, against a hydrostatic of eight point four five. The overpressure keeps building to fourteen point two five at total depth.',
      do: async (d) => {
        await readout(d, 5118, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 12\.62/, 'PP at the reservoir');
        await expectText(d, t(d, 'pp-readout-ph'), /Ph 8\.45/, 'Ph at the reservoir');
        await d.highlight(t(d, 'pp-readout-pp'));
        await d.sleep(2000);
        await d.unhighlight();
        await readout(d, 7382, { onCamera: true });
        await expectText(d, t(d, 'pp-readout-pp'), /PP 14\.25/, 'PP at TD');
        await d.sleep(1500);
      } },
    { id: 'window', chapter: 'The drilling window', chapterSub: 'Between pore pressure and fracture',
      say: 'The blue line is the fracture pressure, from Eaton\'s relation with a Poisson\'s ratio of zero point four, for now. The green band between the two is the drilling window. Its narrowest point is two point eight four pounds per gallon, at seven thousand two hundred and thirty five feet.',
      sub: 'The blue line is the fracture pressure, from Eaton\'s relation with a Poisson\'s ratio of 0.4, for now. The green band between the two is the drilling window. Its narrowest point is 2.84 ppg, at 7,235 ft.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-drilling-window'), /Narrowest drilling window 2\.84 ppg[\s\S]*at 7235 ft MD/, 'window');
        await d.highlight(t(d, 'pp-drilling-window'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'seats', chapter: 'Casing seats', chapterSub: 'Bottom-up, with trip and kick margins',
      say: 'With half a pound of trip margin and half a pound of kick margin, the casing seats come out from the bottom up: one shoe at least four thousand three hundred and forty seven feet, then fourteen point seven five pounds per gallon of mud below it to total depth. That is the first look, straight from the logs. Next, the measured pressures and the leak-off tests have their say.',
      sub: 'With 0.5 ppg of trip margin and 0.5 ppg of kick margin, the casing seats come out from the bottom up: one shoe at least 4,347 ft, then 14.75 ppg of mud below it to total depth. That is the first look, straight from the logs. Next, the measured pressures and the leak-off tests have their say.',
      do: async (d) => {
        await expectText(d, t(d, 'pp-casing-seats'), /shoe at least 4347 ft MD, then 14\.75 ppg below/, 'seats');
        await d.highlight(t(d, 'pp-casing-seats'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
  ],
};
