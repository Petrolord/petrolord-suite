// Basin Modelling with Petrolord, Lesson A2: building the column from a well.
import { login, expectText, openBf, enterExpert, newModel, deleteModels, seedModel, t, tab, asset, bfLessonMeta, layerCard, EK1 } from './bf-common.mjs';

const NAME = 'Lesson A2: Ekene-1';
export default {
  id: 'lesson-bf-a2',
  ...bfLessonMeta(2, 'A', 'Building the column *from a well*', 'Registry tops, a stratigraphic column file, the hiatus and the eroded section'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await deleteModels(shared, /^Lesson A2:/);
    await seedModel(shared, 'ek1-calibrated', EK1);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await enterExpert(d);
    await newModel(d, NAME);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'registry', chapter: 'The registry well', chapterSub: 'Ekene-1 and its tops',
      say: 'A one-dimensional basin model is a column of layers at one location. The fastest start is a well: on the Import tab, Registry well lists the wells in Well Data Manager with their tops. Ekene-1 has ten.',
      do: async (d) => {
        await tab(d, 'import', { onCamera: true });
        await d.click(t(d, 'bf-import-tab-registry'));
        await t(d, 'bf-registry-well').waitFor();
        const v = await d.page.evaluate(() => [...document.querySelectorAll('[data-testid="bf-registry-well"] option')].find((o) => /^Ekene-1 \(/.test(o.textContent))?.value);
        await d.select(t(d, 'bf-registry-well'), v);
        await t(d, 'bf-registry-preview').waitFor();
        await d.sleep(1500);
      } },
    { id: 'placeholders',
      say: 'Each top becomes the top of a layer, and the thickness is the vertical gap to the next. But these tops were picked for correlation and carry no ages, so every age here is a placeholder, and the lithology is a guess from the name.',
      do: async (d) => {
        await expectText(d, 'bf-registry-preview', /placeholder/, 'placeholders');
        await d.highlight(t(d, 'bf-registry-preview')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'column', chapter: 'The column file', chapterSub: 'Ages, hiatus and lithology',
      say: 'The stratigraphic column file adds them by surface name, without touching the well: the age of each surface from biostratigraphy, the Oboro Unconformity with its hiatus from twenty point five to sixteen point four million years, the four hundred and ninety two feet eroded there, and each interval\'s lithology, with the Agbada intervals as sand and shale mixtures.',
      sub: 'The stratigraphic column file adds them by surface name, without touching the well: the age of each surface from biostratigraphy, the Oboro Unconformity with its hiatus from 20.5 to 16.4 million years, the 492 ft eroded there, and each interval\'s lithology, with the Agbada intervals as sand and shale mixtures.',
      do: async (d) => {
        await t(d, 'bf-import-input-registry-column').setInputFiles(asset('ekene-1-basin-column.csv'));
        await t(d, 'bf-registry-column-file').waitFor();
        await d.sleep(1000);
        await expectText(d, 'bf-registry-notes', /10 of 10 layers dated[\s\S]*492 ft eroded/, 'dated');
        await d.highlight(t(d, 'bf-registry-preview')); await d.sleep(4500);
        await d.highlight(t(d, 'bf-registry-notes')); await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'td',
      say: 'The last row of the file is the age at total depth, thirty million years, which dates the Akata at the bottom of the well. Replace the stratigraphy.',
      do: async (d) => {
        await d.click(t(d, 'bf-registry-apply'));
        await d.sleep(1500);
        await tab(d, 'properties', { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'layers', chapter: 'The layers', chapterSub: 'Youngest first',
      say: 'Properties lists the layers youngest first, as in the well, each with its ages, thickness and lithology. The details hold what the engine reads: here the Agbada Formation is half sand and half shale, so its conductivity and compaction mix the two.',
      do: async (d) => {
        const card = layerCard(d, 'Agbada Formation');
        await card.scrollIntoViewIfNeeded();
        await d.click(card.getByTestId('bf-layer-details-toggle'));
        await t(d, 'bf-layer-mix-label').waitFor();
        await d.highlight(t(d, 'bf-layer-details')); await d.sleep(4500); await d.unhighlight();
      } },
    { id: 'erosion', chapter: 'The eroded section', chapterSub: 'At the Oboro Unconformity',
      say: 'Under Erosion, the unconformity is an event: four hundred and ninety two feet removed at sixteen point four million years. The engine lays that section down during the hiatus and takes it away, so the rocks below were once buried that much deeper. Next lesson, the burial history.',
      sub: 'Under Erosion, the unconformity is an event: 492 ft removed at 16.4 million years. The engine lays that section down during the hiatus and takes it away, so the rocks below were once buried that much deeper. Next lesson, the burial history.',
      do: async (d) => {
        await d.click(t(d, 'bf-history-tab-erosion'));
        await t(d, 'bf-erosion-table').waitFor();
        await d.highlight(t(d, 'bf-erosion-table')); await d.sleep(4000); await d.unhighlight();
      } },
  ],
};
