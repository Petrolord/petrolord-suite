// Basin Modelling with Petrolord, Lesson A1: the workspace and a new model.
import { login, expectText, openBf, enterExpert, newModel, deleteModels, seedModel, t, tab, bfLessonMeta, EK1 } from './bf-common.mjs';

const NAME = 'Lesson A1: Ekene-1';
export default {
  id: 'lesson-bf-a1',
  ...bfLessonMeta(1, 'A', 'The workspace and *a new model*', 'Guided and Expert mode, the tabs, the model list, the units and the time settings'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    // only this video's own models in the list (the series leaves its models behind)
    await deleteModels(shared, /^Lesson /);
    await deleteModels(shared, /^Lesson A1:/);
    await seedModel(shared, 'ek1-calibrated', EK1);
    await login(d.page, shared.baseUrl, shared.env);
    await openBf(d, shared);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'modes', chapter: 'Two ways in', chapterSub: 'Guided and Expert',
      say: 'Basin and Charge Modeling opens on a choice. Guided mode is a six-step wizard from a basin template to a run, good for a first screening. Expert mode is the full workspace, which this series uses. There is also a worked example, walked through in the help guide.',
      do: async (d) => {
        await d.moveTo(t(d, 'bf-mode-guided')); await d.sleep(2500);
        await d.moveTo(t(d, 'bf-worked-example')); await d.sleep(2000);
        await d.moveTo(t(d, 'bf-mode-expert')); await d.sleep(1000);
      } },
    { id: 'expert', chapter: 'The workspace', chapterSub: 'Models, tabs and Simulate',
      say: 'On the left is the list of models, one per location, each saved as you work. Across the top are the tabs: Properties for the layers and the history, Calibration, Scenarios, Sensitivity, Analysis for the results, Templates, Batch and Import. Simulate runs the model.',
      do: async (d) => {
        await enterExpert(d, { onCamera: true });
        await d.highlight(t(d, 'bf-well-row').first()); await d.sleep(2000); await d.unhighlight();
        for (const id of ['properties', 'calibration', 'results', 'import']) { await d.moveTo(t(d, `bf-tab-${id}`)); await d.sleep(900); }
        await d.moveTo(t(d, 'bf-simulate')); await d.sleep(1500);
      } },
    { id: 'units', chapter: 'Units', chapterSub: 'Feet and Fahrenheit',
      say: 'The units come from the organisation: feet and degrees Fahrenheit for this account. Every depth and temperature on screen follows them, while the model is stored in metres and Celsius. You can switch them here for your own view.',
      do: async (d) => {
        await d.highlight(t(d, 'bf-unit-depth')); await d.sleep(2000);
        await d.highlight(t(d, 'bf-unit-temp')); await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'new', chapter: 'A new model', chapterSub: 'Name it, and it opens',
      say: 'The plus button makes a new model. We call it Lesson A1, Ekene-1. It opens empty, ready for its layers.',
      do: async (d) => {
        await newModel(d, NAME, { onCamera: true });
        await d.sleep(1500);
      } },
    { id: 'history', chapter: 'Global history', chapterSub: 'Heat, erosion and time',
      say: 'Beside the layers is the global history: the basal heat flow, the surface temperature, and the erosion events. A new model deposits each layer continuously through its interval, and steps through time a quarter of a million years at a time, fine enough for a young delta like Ekene.',
      do: async (d) => {
        await d.highlight(t(d, 'bf-heatflow-editor')); await d.sleep(2500);
        await t(d, 'bf-time-settings').scrollIntoViewIfNeeded();
        await expectText(d, 'bf-deposition', /Continuous/, 'deposition');
        await d.highlight(t(d, 'bf-time-settings')); await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'help', chapter: 'Help', chapterSub: 'F1 or the Help button',
      say: 'Help, or F1, opens the guide: each tab, the import files, the calibration, the charge, and the pitfalls. Next lesson, we build the Ekene-1 column from the well.',
      do: async (d) => {
        await d.moveTo(t(d, 'bf-help')); await d.sleep(3000);
      } },
  ],
};
