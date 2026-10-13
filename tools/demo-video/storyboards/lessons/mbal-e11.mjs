// Material Balance with Petrolord, Lesson E11: injection in the balance
// (Ekene to 2025). The flood-era file, the injection note, the net
// withdrawal, the injection drive index, and the same rows without the
// injection (a tank that looks bigger and a Campbell plot that climbs).
import {
  login, expectText, deleteCases, seedCase, dropFile, saveData, runMbal, showPlot, t, tab, FLOOD, mbalLessonMeta,
} from './mbal-common.mjs';

export default {
  id: 'lesson-mbal-e11',
  ...mbalLessonMeta(11, 'E', 'Injection *in the balance*', 'Ekene under waterflood: net withdrawal, the injection index, and what leaving it out does'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await deleteCases(d, shared, /^Lesson E11/);
    await seedCase(d, shared, 'Lesson E11: Ekene to 2025');
    await d.click(tab(d, 'Data'));
    await d.sleep(1200);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'file', chapter: 'The flood era', chapterSub: 'One more column',
      say: 'From January twenty twenty-three Ekene-2 and Ekene-4 injected water. The surveys to August twenty twenty-five carry one more column, the cumulative water injected, and the door places it by name.',
      sub: 'From January 2023 Ekene-2 and Ekene-4 injected water. The surveys to August 2025 carry one more column, the cumulative water injected, and the door places it by name.',
      do: async (d) => {
        await dropFile(d, FLOOD, { onCamera: true });
        const row = t(d, 'mbal-import-row-cum_water_inj_stb');
        await row.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.highlight(row);
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'note', chapter: 'Net withdrawal', chapterSub: 'What the engine does with it',
      say: 'Saved, the tab says what happens to it. The injected water comes off the withdrawal term F at the water formation volume factor of each survey. Only water injected into the tank belongs here; water put into the aquifer belongs in the aquifer model.',
      do: async (d) => {
        await saveData(d, { onCamera: true });
        const n = t(d, 'mbal-data-injection');
        await n.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(1000);
        await d.highlight(n);
        await d.sleep(5000);
        await d.unhighlight();
      } },
    { id: 'run', chapter: 'The run', chapterSub: 'Twelve surveys, one answer',
      say: 'Run it. Twelve point one four million barrels on twelve surveys, and a new drive index: at the last survey, the injected water supplies nought point three nine four of the voidage.',
      sub: 'Run it. 12.14 million barrels on twelve surveys, and a new drive index: at the last survey, the injected water supplies 0.394 of the voidage.',
      do: async (d) => {
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*12\.14 MMSTB[\s\S]*12 points in the fit[\s\S]*Water injection \(WIDI\)\s*0\.394/, 'flood run');
        await d.highlight(t(d, 'mbal-result-card'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'pressure', chapter: 'Pressure maintenance', chapterSub: 'The pressure history',
      say: 'The pressure plot shows why. The pressure fell until the flood began, then levelled and climbed once injection replaced the voidage.',
      do: async (d) => {
        await d.click(tab(d, 'Plots'));
        const c = await showPlot(d, 'pressure');
        await d.highlight(c);
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'without', chapter: 'Leave it out', chapterSub: 'A negative control',
      say: 'Import the same rows without the injection column and run. Sixteen point six six million barrels at an r squared of nought point seven nine four, and the Campbell points after the flood climb as if an aquifer were at work.',
      sub: 'Import the same rows without the injection column and run. 16.66 million barrels at an r² of 0.7940, and the Campbell points after the flood climb as if an aquifer were at work.',
      do: async (d) => {
        await d.click(tab(d, 'Data'));
        await d.sleep(800);
        await dropFile(d, FLOOD, { onCamera: true });
        const sel = t(d, 'mbal-import-col-cum_water_inj_stb');
        await sel.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await d.sleep(600);
        await d.select(sel, { label: 'Not in the file' });
        await saveData(d, { onCamera: true });
        await runMbal(d, { onCamera: true });
        await expectText(d, t(d, 'mbal-result-card'), /OOIP\s*16\.66 MMSTB[\s\S]*Regression r2\s*0\.7940/, 'no injection');
        await d.click(tab(d, 'Plots'));
        const c = await showPlot(d, 'campbell');
        await d.highlight(c);
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'lesson', chapter: 'The point', chapterSub: 'Every volume in or out',
      say: 'Left out, injected water looks like an aquifer and the tank looks more than a third bigger. Every volume that went in or out of the tank belongs in the balance.',
      do: async (d) => { await d.sleep(2500); } },
    { id: 'next', chapter: 'Next', chapterSub: 'Report and handoffs',
      say: 'Next, the last lesson: the report, and the handoffs to ReservoirCalc Pro.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
