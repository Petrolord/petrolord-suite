// Lesson B6: Lithology from density, neutron and PEF (Ekene-1, kit v2).
// The kit's minerals: quartz sand (PEF about 1.8), shale (PEF about 3.0);
// Ekene-1 medians: clean Ekene Sand RHOB 2.32, NPHI 0.24, PEF 1.9; Ogbia
// Shale RHOB 2.37, NPHI 0.43, PEF 2.8; Oboro gas sand RHOB 2.25, NPHI 0.16.
import { lessonMeta, login, openPetroWell, crossplotZone } from './common.mjs';

export default {
  id: 'lesson-b6',
  ...lessonMeta(6, 'B', 'Lithology from density, neutron and PEF: *the crossplot*', 'How minerals plot on the density-neutron crossplot, why shale falls off the lines, and how the photoelectric factor confirms the mineral'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    const t = (id) => d.page.getByTestId(id);
    await t('petro-param-grClean').fill('18'); await t('petro-param-grClay').fill('125');
    await t('petro-param-vshMethod').selectOption('linear'); await t('petro-params-apply').click(); await d.sleep(800);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 6', chapterSub: 'Module B · Shale and lithology',
      say: 'The gamma ray tells us how much clay there is. It cannot tell sandstone from limestone, or say what the rest of the rock is made of. For that we use two porosity tools together, density and neutron, and a third measurement, the photoelectric factor.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module B · Lesson 6', title: 'Lithology from density, neutron and PEF',
        body: '<ul><li>How minerals plot on the <b>density-neutron crossplot</b></li><li>Why shale falls off the lines</li><li>The <b>photoelectric factor</b> as a mineral fingerprint</li><li>What Ekene-1 is made of</li></ul>' }) },
    { id: 'chart', chapter: 'The crossplot', chapterSub: 'Each mineral, its own line',
      say: 'Density and neutron each respond to porosity, but each mineral shifts them differently. Quartz has a grain density of two point six five, calcite two point seven one, dolomite two point eight seven. Plot bulk density against neutron porosity, and a clean, water filled rock of one mineral falls on its own line, with porosity increasing up the line. Where a point sits between two lines tells you the mix, and how far up it sits tells you the porosity.',
      do: async (d) => d.slide({ eyebrow: 'The density-neutron crossplot', title: 'One mineral, one line',
        body: '<ul><li><b>Sandstone</b> (quartz): ρ<sub>ma</sub> 2.65</li><li><b>Limestone</b> (calcite): ρ<sub>ma</sub> 2.71</li><li><b>Dolomite</b>: ρ<sub>ma</sub> 2.87</li><li>Porosity increases up each line</li></ul>' }) },
    { id: 'open', chapter: 'Ekene-1 on the crossplot',
      say: 'Here is Ekene one, coloured by shale volume from the last lesson. Most of the clean, blue points lie along the sandstone line, the dashed line at the top.',
      do: async (d) => { await d.hideSlide(); await d.click('petro-view-crossplot'); await d.click('petro-plot-nd'); await d.sleep(800); } },
    { id: 'sand',
      say: 'Show only the Ekene Sand. The clean points cluster on the sandstone line at about twenty percent porosity. This is a quartz sandstone, typical of the Agbada sands of the Niger Delta.',
      do: async (d) => { await crossplotZone(d, 'Ekene Sand'); await d.highlight('petro-crossplot-canvas', { pad: 4 }); await d.sleep(1200); await d.unhighlight(); } },
    { id: 'shale',
      say: 'Now the Ogbia Shale. The points move far to the right, to neutron readings above forty percent, and drop below all three lines. Shale holds water bound in the clay, which the neutron counts as porosity, while its density stays high. Shale does not lie on a mineral line, and points dragged toward this corner are shaly.',
      do: async (d) => { await crossplotZone(d, 'Ekene Sand'); await crossplotZone(d, 'Ogbia Shale'); await d.highlight('petro-crossplot-canvas', { pad: 4 }); await d.sleep(1200); await d.unhighlight(); } },
    { id: 'pef-slide', chapter: 'The photoelectric factor', chapterSub: 'A mineral fingerprint',
      say: 'The density tool records a second number, the photoelectric factor, PEF. It depends on the average atomic number of the rock, and hardly at all on porosity, so it reads the minerals directly. Quartz reads about one point eight. Calcite about five. Dolomite about three. Clays mostly between two and four.',
      do: async (d) => d.slide({ eyebrow: 'The photoelectric factor', title: 'PEF reads the mineral',
        body: '<table style="border-collapse:collapse;font-size:32px"><tr><td style="padding:6px 50px 6px 0">Quartz</td><td><b>1.8</b> b/e</td></tr><tr><td style="padding:6px 50px 6px 0">Dolomite</td><td>3.1</td></tr><tr><td style="padding:6px 50px 6px 0">Calcite</td><td>5.1</td></tr><tr><td style="padding:6px 50px 6px 0">Clays</td><td>about 2 to 4</td></tr></table>' }) },
    { id: 'pef',
      say: 'So we colour the crossplot by PEF instead, for the whole well. The sands come out blue, around one point nine: quartz. The shales come out orange and red, around three: clay. There is no calcite anywhere in this well, or we would see points near five. Two independent measurements agree on the lithology.',
      do: async (d) => {
        await d.hideSlide(); await crossplotZone(d, 'Ogbia Shale');
        await d.select('petro-colorby', 'PEF'); await d.sleep(800);
        await d.highlight('petro-colorby');
      } },
    { id: 'gas',
      say: 'One group of points does not fit. Show only the Oboro Sand. Its clean points sit above and to the left of the sandstone line, in a place no water filled mineral can reach. That is gas, and it is the subject of the next lesson.',
      do: async (d) => { await d.unhighlight(); await crossplotZone(d, 'Oboro Sand'); await d.highlight('petro-crossplot-canvas', { pad: 4 }); await d.sleep(1200); await d.unhighlight(); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. On the density neutron crossplot each mineral has its own line, and porosity rises up it. The Ekene Sand plots on the sandstone line, at about twenty percent. Shale falls off the lines toward high neutron. The photoelectric factor confirms the mineral, quartz near one point eight, clay near three. And points above the sandstone line point to gas. Next lesson, the gas effect, and how to correct porosity for it.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 6', title: 'Two tools, one answer',
        body: '<ul><li>Each mineral has its own line; porosity rises up it</li><li>Ekene Sand: <b>quartz sandstone</b>, about 20 percent</li><li>Shale falls off the lines toward high neutron</li><li><b>PEF</b>: quartz 1.8, clay about 3</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: the gas effect</p>' }) },
  ],
};
