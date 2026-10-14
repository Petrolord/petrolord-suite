// Well Testing with Petrolord, Lesson B4: the Bourdet derivative.
// Ekene-5: what the derivative is, why it is plotted with the pressure
// change, the smoothing window, and the plateau that gives kh.
import { expectText, setupTest, tab, kpi, t, wtLessonMeta } from '../wt-common.mjs';

async function setL(d, value) {
  const thumb = d.page.getByRole('slider').first();
  await d.moveTo(thumb); await thumb.focus(); await d.sleep(300);
  await d.page.keyboard.press('Home');
  for (let i = 0; i < Math.round(value * 100); i += 1) await d.page.keyboard.press('ArrowRight');
  await d.sleep(1200);
}

export default {
  id: 'lesson-wt-b4',
  ...wtLessonMeta(4, 'B', 'The Bourdet *derivative*', 'What it measures, the smoothing window, and the plateau that gives kh'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson B4: Ekene-5 derivative', test: 'e5', tabName: 'Diagnostics' });
  },
  steps: [
    { id: 'what', chapter: 'The log-log plot', chapterSub: 'Pressure change and its derivative',
      say: 'Blue is the pressure change since the shut-in. Red is the Bourdet derivative: the slope of the pressure change against the natural log of time. On a log-log plot every flow regime has its own shape on the derivative, which is why the derivative, more than the pressure, is what a well test engineer reads.',
      do: async (d) => {
        await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.4, dy: 0.3 }); await d.sleep(2500);
        await d.moveTo(d.page.locator('.recharts-surface').first(), { dx: 0.55, dy: 0.72 }); await d.sleep(2500);
      } },
    { id: 'plateau', chapter: 'The plateau', chapterSub: 'Radial flow sets kh',
      say: 'In radial flow the derivative is flat, at seventy point six q B mu over k h. Its level is a direct reading of k h: four thousand five hundred and thirty millidarcy feet here, or two hundred and sixteen millidarcies over the twenty one feet of pay, before any straight line is drawn.',
      do: async (d) => {
        await expectText(d, kpi(d, 'Radial plateau kh'), /4,530/, 'kh');
        await expectText(d, kpi(d, 'Plateau k'), /^216/, 'k');
        await d.highlight(kpi(d, 'Radial plateau kh')); await d.sleep(2000); await d.unhighlight();
        await d.highlight(kpi(d, 'Plateau k')); await d.sleep(2000); await d.unhighlight();
      } },
    { id: 'raw', chapter: 'The smoothing window', chapterSub: 'L in log cycles',
      say: 'The derivative is a difference, so it amplifies gauge noise. Bourdet\'s method takes the slope across a window L either side of each point, measured in log cycles. With L at zero the slope is taken between neighbours, and even this quartz gauge\'s few thousandths of a p. s. i. start to show late in the test.',
      do: async (d) => { await setL(d, 0); await d.sleep(2500); } },
    { id: 'wide', 
      say: 'At zero point three the derivative is smooth, but the storage hump is flattened and the start of the rise is smeared earlier. A window wider than the features you are reading changes them.',
      do: async (d) => { await setL(d, 0.3); await d.sleep(3000); } },
    { id: 'back',
      say: 'Zero point one is the usual choice: wide enough to quiet the gauge, narrow enough to keep the shapes. Choose the window by looking, and keep it once chosen, because the model match uses the same one.',
      do: async (d) => { await setL(d, 0.1); await d.sleep(2500); } },
  ],
};
