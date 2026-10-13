// Volumetrics with Petrolord, Lesson D12: projects, sharing and the chain.
// The booked case with the evidenced Monte Carlo run saved as a project
// ("Lesson D12 Ekene booked case"), a second reservoir case in the same
// project, the Projects panel, sharing with the organisation, the source
// check, the workspace file, and the hand-off to Prospect Risking (a
// prospect "Lesson D12 Ekene" with Pg and the recoverable volumes of the
// run) on the way to Risked Reserves Valuation. Setup removes earlier
// copies of both.
import {
  login, expectText, openRcp, bookedCase, stoiip, t, dialog, toProbabilistic, setDist, runSettings, RANGES,
  deleteProjects, saveProject, rcpLessonMeta,
} from './rcp-common.mjs';

const PROJECT = 'Lesson D12 Ekene booked case';
const PROSPECT = 'Lesson D12 Ekene';
const next = (d) => d.page.getByRole('button', { name: /^Next/ });
const toolTab = (d, name) => d.page.getByText(name, { exact: true }).first();

async function deleteProspects(d) {
  await t(d, 'rcp-tools').click(); await d.sleep(1000);
  await toolTab(d, 'Prospect Risking').click(); await d.sleep(2000);
  for (let i = 0; i < 6 && (await t(d, `prospect-delete-${PROSPECT}`).count()); i++) {
    await t(d, `prospect-delete-${PROSPECT}`).first().click(); await d.sleep(1500);
  }
  await d.page.keyboard.press('Escape'); await d.sleep(600);
}

export default {
  id: 'lesson-rcp-d12',
  ...rcpLessonMeta(12, 'D', 'Projects, sharing *and the chain*', 'Saved projects, cases, sharing, source checks and the hand-off to Prospect Risking'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await deleteProjects(d, PROJECT);
    await deleteProspects(d);
    await bookedCase(d);
    await d.page.getByRole('tab', { name: 'Fluid' }).click();
    await d.page.locator('div.space-y-1:has(> label:text-is("Recovery Factor (%)")) input').first().fill('31.67');
    await d.page.keyboard.press('Tab');
    await stoiip(d);
    await toProbabilistic(d);
    await t(d, 'rcp-sim-setup-toggle').click();
    for (const [k, v] of Object.entries(RANGES.after)) await setDist(d, k, v);
    await next(d).click(); await d.sleep(400);
    await runSettings(d);
    await next(d).click(); await d.sleep(400);
    await t(d, 'rcp-mc-run').click();
    await t(d, 'rcp-mc-last-seed').waitFor({ timeout: 180000 });
    await d.sleep(1000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'save', chapter: 'Projects', chapterSub: 'Everything in one saved record',
      say: 'Save keeps the whole workspace as a project: the surfaces, the inputs and their sources, the deterministic case, the Monte Carlo run with its seed, and the audit trail.',
      do: async (d) => {
        await saveProject(d, PROJECT, { onCamera: true });
        await expectText(d, t(d, 'rcp-project-name'), new RegExp(PROJECT), 'saved project name');
        await d.highlight(t(d, 'rcp-project-name'));
        await d.sleep(1500);
        await d.unhighlight();
      } },
    { id: 'cases', chapter: 'Reservoir cases', chapterSub: 'Several reservoirs, one project',
      say: 'One project can hold several reservoir cases. Add one for the deeper Oboro Sand, and each keeps its own inputs and results; switching folds the open case away first, so nothing is lost.',
      do: async (d) => {
        await d.click(d.page.locator('button[title="Add reservoir"]'));
        await dialog(d).waitFor();
        await d.type(dialog(d).locator('input').first(), 'Oboro Sand');
        await d.click(dialog(d).getByRole('button', { name: /Add|Create|Save/ }).first());
        await d.sleep(1500);
        const sw = d.page.locator('button[role=combobox]').filter({ hasText: 'Oboro Sand' }).first();
        await d.click(sw);
        await d.sleep(600);
        await d.click(d.page.getByRole('option', { name: 'Reservoir 1' }));
        await d.sleep(1500);
      } },
    { id: 'projects', chapter: 'The Projects panel', chapterSub: 'Open, copy, version',
      say: 'The Projects panel lists your projects with their version, and those colleagues have shared with you. Open one, or save a copy under your own name.',
      do: async (d) => {
        await d.click(d.page.getByRole('button', { name: /^Projects$/ }));
        await d.sleep(2000);
        const row = t(d, 'rcp-project-row').filter({ hasText: PROJECT }).first();
        await d.highlight(row);
        await d.sleep(2500);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'share', chapter: 'Sharing', chapterSub: 'With the organisation',
      say: 'Share opens the sharing strip: share the project with your organisation for viewing, or for editing by one person at a time with a check out, and every change is kept with its author in the history.',
      do: async (d) => {
        await d.click('rcp-share');
        await t(d, 'rcp-sharing-strip').waitFor({ timeout: 30000 });
        await d.highlight(t(d, 'rcp-sharing-strip'));
        await d.sleep(4000);
        await d.unhighlight();
        await d.click('rcp-share');
        await d.sleep(600);
      } },
    { id: 'fresh', chapter: 'Sources', chapterSub: 'Checked on open',
      say: 'The sources the project took from the registry are checked each time it opens, and on demand. When a map or a zone changes upstream, the notice says which, and you refresh or keep the values: the third demo shows it after a new well.',
      do: async (d) => {
        const c = t(d, 'rcp-source-changed-check');
        await d.click(c);
        await d.sleep(2000);
        await d.highlight(t(d, 'rcp-source-changed-clear'));
        await d.sleep(2500);
        await d.unhighlight();
      } },
    { id: 'risk', chapter: 'Into Prospect Risking', chapterSub: 'Chance of success and risked volume',
      say: 'Prospect Risking in Tools takes the recoverable volumes of the last Monte Carlo run, here at a recovery factor of thirty one point six seven percent, and multiplies the success case by the chance of success from trap, reservoir, charge and seal. For a discovered field like Ekene every factor would be near one; the same workflow risks a prospect.',
      sub: 'Prospect Risking in Tools takes the recoverable volumes of the last Monte Carlo run, here at a recovery factor of 31.67%, and multiplies the success case by the chance of success from trap, reservoir, charge and seal. For a discovered field like Ekene every factor would be near one; the same workflow risks a prospect.',
      do: async (d) => {
        await d.click('rcp-tools');
        await d.sleep(1000);
        await d.click(toolTab(d, 'Prospect Risking'));
        await d.sleep(1500);
        await expectText(d, t(d, 'prospect-risking'), /from the last Monte Carlo run/, 'volumes from the run');
        await d.highlight(t(d, 'prospect-risking').locator('div.grid').first());
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'inventory',
      say: 'Name it and add it to the inventory. From there, Risked Reserves Valuation values it with the economics, and the prospect remembers the project, the reservoir and the run behind its numbers.',
      do: async (d) => {
        await d.type('prospect-name', PROSPECT);
        await d.click('prospect-add');
        await t(d, 'prospect-row').filter({ hasText: PROSPECT }).first().waitFor({ timeout: 30000 });
        await d.highlight(t(d, 'prospect-row').filter({ hasText: PROSPECT }).first());
        await d.sleep(3000);
        await d.unhighlight();
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'end', chapter: 'Volumetrics with Petrolord', chapterSub: 'Twelve lessons, one field',
      say: 'From the maps and the zones to a reviewed, probabilistic volume, saved, shared and handed on. That is volumetrics with Petrolord.',
      do: async (d) => { await d.sleep(2500); } },
  ],
};
