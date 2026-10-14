// Well Testing with Petrolord, Lesson D12: sending the results on. Ekene-11:
// what travels and with what method, Material Balance (pressure point),
// Waterflood (k), EOR Screening, Nodal Analysis (productivity), and sharing.
import { expectText, setupTest, tab, kpi, fill, t, wtLessonMeta } from '../wt-common.mjs';

export default {
  id: 'lesson-wt-d12',
  ...wtLessonMeta(12, 'D', 'Sending the results *on*', 'Material Balance, Waterflood, EOR Screening and Nodal Analysis read the same record'),
  async setup(d, shared) {
    await setupTest(d, shared, { name: 'Lesson D12: Ekene-11 results', test: 'e11', basis: /rate history above/ });
    await fill(d, [[/^Well name/, 'Ekene-11'], [/^Field/, 'Ekene']]);
    await tab(d, 'Match');
    await d.page.getByRole('button', { name: /Auto-fit model/ }).click();
    await d.page.getByText(/Auto-fit converged/).first().waitFor({ timeout: 120000 });
    await d.page.getByRole('button', { name: /^Save$|Unsaved changes|Saved/ }).first().click().catch(() => {});
    await d.sleep(2500);
    await tab(d, 'Report');
  },
  steps: [
    { id: 'record', chapter: 'One record', chapterSub: 'Results with their method',
      say: 'Every save writes a record of the interpretation into the project: the permeability with its method and confidence interval, the skin split, the pressure with what it is, and the productivity index. Other apps read that record by the project\'s id, so a value always travels with how it was found.',
      do: async (d) => {
        const n = t(d, 'wts-send-note'); await n.scrollIntoViewIfNeeded();
        await d.highlight(n); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'mbal', chapter: 'Material Balance Studio', chapterSub: 'A pressure point',
      say: 'Material Balance Studio opens a new case with the test\'s pressure, p star, two thousand one hundred and twenty three point five p. s. i., already in it; in an existing case the same record becomes a point on the pressure history, with k and skin kept for reference.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /to Material Balance/ }));
        await d.page.getByRole('dialog').first().waitFor({ timeout: 60000 });
        await d.sleep(4000);
      } },
    { id: 'back',
      say: 'Cancel, and nothing is made. Back in the studio, the project opens again from the list.',
      do: async (d) => {
        await d.page.keyboard.press('Escape'); await d.sleep(1000);
        await d.page.goBack(); await d.page.getByRole('tab', { name: 'Data' }).waitFor({ timeout: 60000 }); await d.sleep(2000);
        await d.click(d.page.getByLabel('Project').first()); await d.sleep(600);
        await d.click(d.page.getByRole('option', { name: 'Lesson D12: Ekene-11 results' })); await d.sleep(2500);
        await d.click(d.page.getByRole('tab', { name: 'Report' })); await d.sleep(1500);
      } },
    { id: 'others', chapter: 'Waterflood and EOR', chapterSub: 'Permeability and pressure',
      say: 'Waterflood Design Studio takes the permeability for its flood model, and EOR Screening reads the permeability and the average pressure against its screening limits.',
      do: async (d) => {
        await d.moveTo(d.page.getByRole('button', { name: /Waterflood Design Studio/ })); await d.sleep(2000);
        await d.moveTo(t(d, 'wts-send-eor')); await d.sleep(2000);
      } },
    { id: 'nodal', chapter: 'Nodal Analysis Studio', chapterSub: 'The productivity index',
      say: 'Nodal Analysis Studio takes the productivity index, as tested or with the skin removed, which is the subject of demo three. Each receiver says where its value came from.',
      do: async (d) => { await d.highlight(t(d, 'wts-send-nodal')); await d.sleep(3500); await d.unhighlight(); } },
    { id: 'share', chapter: 'Sharing', chapterSub: 'With the organisation',
      say: 'Finally, a project can be shared with your organisation, to view or to edit with a check-out, and every change is logged in its history. That is the end of the series: from a gauge file to an answer you can defend and send on.',
      do: async (d) => {
        await d.highlight(d.page.getByText('Share with my organisation').first()); await d.sleep(2500); await d.unhighlight();
        await d.moveTo(d.page.getByText('History').first()); await d.sleep(2500);
      } },
  ],
};
