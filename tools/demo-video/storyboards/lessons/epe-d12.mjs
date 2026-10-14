// Petroleum Economics with Petrolord, Lesson D12: keeping the economics
// honest. Approving and locking a run, a revised AFE that puts the run out
// of date, re-running with a saved assumption set, and sharing the case.
import {
  login, expectText, openCase, openRun, upload, rerunWithEdits, runAnalysis, kpi, db, lessonCase, KIT_RUN, FILES, epeLessonMeta,
} from './epe-common.mjs';

const CASE = 'Lesson D12: Ekene';
const SET = 'Lesson D12: corporate deck, US$75 flat';
const tabBtn = (d, name) => d.page.getByRole('tab', { name, exact: true }).first();
async function openTab(d, name, onCamera = true) {
  for (let i = 0; i < 4; i++) {
    if (onCamera) await d.click(tabBtn(d, name)); else await tabBtn(d, name).click();
    await d.sleep(1200);
    if ((await tabBtn(d, name).getAttribute('data-state')) === 'active') return;
  }
}
const runRow = (d, name) => d.page.locator('li', { has: d.page.locator('p', { hasText: name }) }).first();

export default {
  id: 'lesson-epe-d12',
  ...epeLessonMeta(12, 'D', 'Keeping the economics *honest*', 'Approvals and locks, an out-of-date run, assumption sets and sharing'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    const sb = await db(shared);
    await sb.from('epe_assumption_sets').delete().like('name', 'Lesson D12%');
    await lessonCase(d, shared, CASE, { runs: [KIT_RUN('Sanction case, AFE 11.8')] });
    await openCase(d, shared, CASE);
    await openTab(d, 'Run History', false);
    await d.sleep(1000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'approve', chapter: 'Approve and lock', chapterSub: 'The run the decision rests on',
      say: 'The run history is the case\'s record. Each run shows its N. P. V., I. R. R., payback, regime and engine version. The run a decision rests on can be approved, which stamps who and when, and locked, so it cannot be deleted.',
      do: async (d) => {
        const r = runRow(d, 'Sanction case, AFE 11.8');
        await d.highlight(r); await d.sleep(3000); await d.unhighlight();
        await d.click(r.getByTitle('Approve this run')); await d.sleep(1500);
        await d.click(r.getByTitle(/Lock this run/)); await d.sleep(1500);
        await expectText(d, r, /Locked[\s\S]*Approved|Approved[\s\S]*Locked/, 'badges');
        await d.highlight(r); await d.sleep(2500); await d.unhighlight();
      } },
    { id: 'afe', chapter: 'The data moves', chapterSub: 'A revised AFE',
      say: 'Then the drilling team revises Ekene eleven\'s A. F. E. ten percent up, to twelve point nine eight million dollars. The new capex file replaces the old one.',
      do: async (d) => {
        await openTab(d, 'Data Management');
        await upload(d, 'capex', FILES.capexRev, { onCamera: true, replace: true, beforeConfirm: async (dd) => {
          const rep = dd.page.locator('label', { hasText: /^Replace the/ }).first();
          await dd.highlight(rep); await dd.sleep(3000); await dd.unhighlight();
        } });
      } },
    { id: 'stale', chapter: 'Out of date', chapterSub: 'The run knows',
      say: 'The approved run priced the old A. F. E., and now it says so. In the run history it is marked out of date, and its results page names what changed.',
      do: async (d, shared) => {
        await openTab(d, 'Run History');
        const badge = runRow(d, 'Sanction case, AFE 11.8').getByTestId('epe-run-out-of-date');
        await d.highlight(badge); await d.sleep(3000); await d.unhighlight();
        await openRun(d, shared, CASE, 'Sanction case, AFE 11.8');
        const b = d.page.getByTestId('epe-run-inputs-changed');
        await expectText(d, b, /CAPEX: ekene-capex\.csv was replaced by ekene-capex-afe-revision\.csv/, 'banner');
        await d.highlight(b); await d.sleep(5000); await d.unhighlight();
      } },
    { id: 'set', chapter: 'Assumption sets', chapterSub: 'One corporate deck for every case',
      say: 'Re run with edits. Before running, save the pricing as an assumption set: prices, differentials, deck, escalation and discounting, under one name, private or shared with the organisation, so every case prices on the same deck.',
      do: async (d) => {
        await rerunWithEdits(d, { onCamera: true, runName: 'AFE revision 1, 12.98' });
        await d.click(d.page.getByRole('button', { name: 'Save current as assumption set' }));
        await d.type(d.page.getByPlaceholder(/Corporate deck/), SET);
        await d.sleep(800);
        await d.click(d.page.getByRole('button', { name: 'Save', exact: true }));
        await d.sleep(2000);
      } },
    { id: 'rerun', chapter: 'The new answer', chapterSub: 'Priced on the current data',
      say: 'Run. Priced on the revised A. F. E., the field is worth one point four two million dollars, down from one point nine eight: a ten percent overrun on the well takes more than a quarter of the value.',
      do: async (d) => {
        await runAnalysis(d, { onCamera: true });
        await expectText(d, kpi(d, 'NPV @'), /\$1\.42M/, 'new NPV');
        await d.highlight(kpi(d, 'NPV @')); await d.sleep(4000); await d.unhighlight();
      } },
    { id: 'share', chapter: 'Sharing', chapterSub: 'Read-only for the organisation',
      say: 'Finally, share the case with the organisation. Colleagues see its data, runs and results read only, and clone it to try their own what ifs. The approved run stays locked beside the new one, so the record shows what was decided, and on which numbers.',
      do: async (d, shared) => {
        await openCase(d, shared, CASE);
        const s = d.page.getByRole('button', { name: /Share with organization/ });
        await d.moveTo(s); await d.sleep(2500);
        await openTab(d, 'Run History'); await d.sleep(2500);
      } },
  ],
};
