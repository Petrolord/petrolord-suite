// Lesson A4: Reading a triple combo (Ekene-1, kit v2, feet). Raw curves only
// (Raw quicklook layout). Values read from the v2 LAS: Ogbia Shale GR ~100,
// RT ~2.1; clean Ekene Sand GR ~27; oil leg RT ~5.2 (5,079 to 5,118 ft),
// water leg RT ~1.9; oil-water contact 1,560 m MD = 5,118 ft; Oboro gas
// sand (6,053 to 6,273 ft) RT ~15, RHOB ~2.25 (density porosity ~0.24),
// NPHI ~0.16: crossover ~0.08.
import { lessonMeta, login, openPetroWell, zoomTracksAt } from './common.mjs';

export default {
  id: 'lesson-a4',
  ...lessonMeta(4, 'A', 'Reading a triple combo: *rock and fluid at a glance*', 'What gamma ray, resistivity, density and neutron each measure, and how to read shale, sand, oil, water and gas from them'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await d.page.getByTestId('petro-layout-template').selectOption('quicklook');
    await d.sleep(1200);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 4', chapterSub: 'Module A · Getting the data right',
      say: 'The data is loaded and checked. Before any calculation, a petrophysicist reads the logs by eye, and an experienced one can tell shale from sand, and oil from water and gas, in seconds. In this lesson we learn to do that on Ekene one.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 4', title: 'Reading a triple combo',
        body: '<ul><li>What each curve measures</li><li>Shale and sand from the <b>gamma ray</b></li><li>Oil and water from the <b>resistivity</b></li><li>Gas from the <b>density and neutron</b> together</li></ul>' }) },
    { id: 'curves', chapter: 'Four measurements', chapterSub: 'The triple combo',
      say: 'A triple combo is three tool strings run together. The gamma ray counts natural radioactivity, which comes mostly from clay, so it reads high in shale and low in clean sand. Resistivity measures how hard it is to pass a current through the rock. Brine conducts, while oil and gas do not, so hydrocarbons read high. Density and neutron both respond to porosity, in different ways. Density sees mass, neutron sees hydrogen. Plotted together on matched scales, how they separate tells us about lithology and gas.',
      do: async (d) => d.slide({ eyebrow: 'Four measurements', title: 'What each curve sees',
        body: '<ul><li><b>Gamma ray</b> (API): clay. High in shale, low in clean sand</li><li><b>Resistivity</b> (ohm·m): fluids. Brine conducts, hydrocarbons resist</li><li><b>Density</b> (g/cc): mass. Lower in porous rock</li><li><b>Neutron</b> (v/v): hydrogen. Higher with water in the pores</li></ul>' }) },
    { id: 'overview', chapter: 'The whole well', chapterSub: 'Ekene-1, raw curves',
      say: 'Here is the whole of Ekene one, raw curves only: gamma ray, resistivity, density with neutron, and sonic. Shallow, the Benin Formation sands. Then the interbedded Agbada, the Ogbia Shale, our Ekene Sand, the Oboro Sand below, and the Akata shale at the bottom. Even at this scale the gamma ray separates the sands from the shales.',
      do: async (d) => { await d.hideSlide(); await d.moveTo('petro-tracks-canvas', { dx: 0.1, dy: 0.2 }); await d.sleep(1500); await d.moveTo('petro-tracks-canvas', { dx: 0.1, dy: 0.75 }); } },
    { id: 'zoom', chapter: 'Shale and sand', chapterSub: 'The Ekene Sand top',
      say: 'We zoom onto the base of the Ogbia Shale and the Ekene Sand, around five thousand one hundred feet.',
      do: async (d, shared) => { shared.values.z = await zoomTracksAt(d, 5110, 9); } },
    { id: 'gr',
      say: 'At five thousand and seventy nine feet the gamma ray falls from around one hundred A P I in the shale to under thirty in the sand. That is the formation top, picked where the curve crosses halfway between the two. On the density and neutron track, the shale shows the neutron well to the left of the density, shaded grey: shale holds water bound in the clay, which the neutron counts as porosity. In the clean sand the two curves come together.',
      do: async (d, shared) => {
        const { yAt, b } = shared.values.z;
        await d.moveTo({ x: b.x + b.width * 0.12, y: yAt(5040) }, { ms: 900 });   // shale
        await d.sleep(1600);
        await d.moveTo({ x: b.x + b.width * 0.12, y: yAt(5100) }, { ms: 900 });   // sand
        await d.sleep(1600);
        await d.moveTo({ x: b.x + b.width * 0.55, y: yAt(5040) }, { ms: 900 });
        await d.sleep(1600);
        await d.moveTo({ x: b.x + b.width * 0.55, y: yAt(5100) }, { ms: 900 });
      } },
    { id: 'rt', chapter: 'Oil and water', chapterSub: 'Resistivity',
      say: 'Now the resistivity. In the top of the sand it reads about five ohm metres. Forty feet lower it falls to under two, and stays there to the base of the sand. Same rock, same porosity, so the change is the fluid: oil above, brine below. That step is the oil water contact, at five thousand one hundred and eighteen feet. The field\'s known contact is one thousand five hundred and sixty metres, which is the same depth.',
      do: async (d, shared) => {
        const { yAt, b } = shared.values.z;
        await d.moveTo({ x: b.x + b.width * 0.33, y: yAt(5095) }, { ms: 900 });   // oil leg
        await d.sleep(1800);
        await d.moveTo({ x: b.x + b.width * 0.33, y: yAt(5150) }, { ms: 1400 });  // water leg
      } },
    { id: 'gas-zoom', chapter: 'Gas', chapterSub: 'The Oboro Sand',
      say: 'Deeper, the Oboro Sand, around six thousand one hundred and fifty feet.',
      do: async (d, shared) => {
        await d.page.getByTestId('petro-tracks-canvas').dblclick(); await d.sleep(1000);
        shared.values.g = await zoomTracksAt(d, 6160, 8);
      } },
    { id: 'gas',
      say: 'The resistivity is high here, about fifteen ohm metres, so there is hydrocarbon. Is it oil or gas? Look at the density and neutron. The density reads low, about two point two five, which on its own suggests twenty four percent porosity. The neutron reads only sixteen percent. Gas holds far less hydrogen than oil or water, so the neutron reads low, and gas is light, so the density reads low too. The curves cross over, shaded yellow. That crossover is the signature of gas.',
      do: async (d, shared) => {
        const { yAt, b } = shared.values.g;
        const y = yAt(6150);
        await d.moveTo({ x: b.x + b.width * 0.33, y }, { ms: 900 });
        await d.sleep(1800);
        await d.moveTo({ x: b.x + b.width * 0.55, y }, { ms: 900 });
      } },
    { id: 'gas-slide',
      say: 'So, reading by eye: low gamma ray means clean sand. High resistivity in a clean sand means hydrocarbon. And in that hydrocarbon, density and neutron crossing over means gas, while curves that track together mean oil or water.',
      do: async (d) => d.slide({ eyebrow: 'Reading by eye', title: 'Three questions, three curves',
        body: '<ul><li>Is it clean? <b>Gamma ray low</b></li><li>Is it hydrocarbon? <b>Resistivity high</b> in a clean sand</li><li>Is it gas? <b>Density and neutron cross over</b></li></ul>' }) },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap Module A. We loaded a well and its depth reference, added tops, a survey and checkshots, checked the logs for washouts and spikes, and read the rock and its fluids by eye. On Ekene one we found the Ekene Sand at five thousand and seventy nine feet, oil down to a contact at five thousand one hundred and eighteen, and gas in the Oboro below. In Module B we start putting numbers on it, beginning with shale volume from the gamma ray.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Module A', title: 'From a file to a reading',
        body: '<ul><li>Ekene Sand top: <b>5,079 ft</b></li><li>Oil-water contact: <b>5,118 ft</b> (field: 1,560 m)</li><li>Oboro Sand: <b>gas</b>, density-neutron crossover</li></ul><p style="margin-top:28px;color:#d4ac3a">Next, Module B: shale volume from the gamma ray</p>' }) },
  ],
};
