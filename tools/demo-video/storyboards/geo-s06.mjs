// Geoscience module showcase, scene 6b: QI Studio on "QI showcase: Ekene"
// (read only; the owner approved the QI showcase cuts, coordinator GO
// 2026-10-17). The input gathers with multiples beside the demultipled
// gathers along inline 1027 round Ekene-1 (saved stores of the QI showcase).
// Each Show is one gather_panel job on the worker (200 per 24 h cap).
import { login, scene, t, park, expectText } from './geo-common.mjs';
import { openQi } from './qi-common.mjs';

const PROJECT = 'QI showcase: Ekene';
const STORE = 'EKENE3D-v4-gathers-nmo-multiples.sgy gathers';
const DEMULT = `${STORE} demultipled (area)`;
const AREA = { xl0: 2044, xl1: 2059 };

async function openProject(d, shared) {
  await openQi(d, shared);
  await d.page.getByRole('combobox', { name: 'Project' }).click(); await d.sleep(500);
  await d.page.getByRole('option', { name: PROJECT, exact: true }).click(); await d.sleep(3500);
}
async function lineInputs(d) {
  const row = d.page.locator('[data-testid="qi-gathers"] input:visible');
  const all = await row.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const k0 = all.findIndex((x) => x === 'qi-gathers-line');
  return { from: row.nth(k0 + 1), to: row.nth(k0 + 2), step: row.nth(k0 + 3), t0: row.nth(k0 + 4), t1: row.nth(k0 + 5) };
}
async function setLine(d) {
  await t(d, 'qi-gathers-mode').selectOption({ label: 'along an inline' }); await d.sleep(500);
  const f = await lineInputs(d);
  await t(d, 'qi-gathers-line').fill('1027');
  await f.from.fill(String(AREA.xl0)); await f.to.fill(String(AREA.xl1)); await f.step.fill('1');
  await f.t0.fill('900'); await f.t1.fill('1700');
}
async function waitPanel(d, before, beside) {
  for (let i = 0; i < 600; i++) {
    const c = await t(d, 'qi-gathers-caption').innerText().catch(() => '');
    if (c !== before && /16 gathers/.test(c) && c.includes(beside)) return;
    await d.sleep(1500);
  }
  throw new Error('the gather panel did not arrive');
}

export default {
  ...scene('geo-s06'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openProject(d, shared);
    await t(d, 'qi-tab-gathers').click(); await d.sleep(2500);
    await t(d, 'qi-gathers-store').selectOption({ label: STORE });
    // the store's line numbers are known once one CDP has been shown (one job, off camera)
    await t(d, 'qi-gathers-mode').selectOption({ label: 'one CDP' });
    await t(d, 'qi-gathers-show').click();
    await t(d, 'qi-gathers-result').waitFor({ timeout: 900000 }); await d.sleep(2500);
    await setLine(d);
    await park(d);
  },
  steps: [
    { id: 'gathers', chapterSub: 'QI Studio · prestack gathers',
      say: 'In QI Studio, the prestack gathers along the line through Ekene one.',
      sub: 'In QI Studio, the prestack gathers along the line through Ekene-1.',
      do: async (d, shared) => {
        const opts = await t(d, 'qi-gathers-compare').locator('option').allInnerTexts();
        await d.select('qi-gathers-compare', { label: opts.find((o) => o === DEMULT) });
        shared.values.capBefore = await t(d, 'qi-gathers-caption').innerText().catch(() => '');
        await d.click('qi-gathers-show');
      },
      wait: async (d, shared) => {
        await waitPanel(d, shared.values.capBefore, DEMULT);
        await t(d, 'qi-gathers-line-0').evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await d.sleep(1000);
      },
      waitLabel: 'Seconds later' },
    { id: 'multiples',
      say: 'Below the top of the sand, the multiples curve down across the offsets.',
      do: async (d) => {
        const c = d.page.locator('[data-testid="qi-gathers-canvas-0-line"]');
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.62 }, { ms: 1400 });
        await d.moveTo({ x: b.x + b.width * 0.7, y: b.y + b.height * 0.66 }, { ms: 1800 });
      } },
    { id: 'clean',
      say: 'After a Radon transform the multiples are gone, and the primaries, with their A V O, are left untouched.',
      sub: 'After a Radon transform the multiples are gone, and the primaries, with their AVO, are left untouched.',
      do: async (d) => {
        await d.scroll(t(d, 'qi-gathers-line-1'), 520, { ms: 1800 });
        await expectText(d, 'qi-gathers-line-1', /demultipled \(area\): inline 1027, crosslines 2044 to 2059/, 'demultipled line');
        const c = d.page.locator('[data-testid="qi-gathers-canvas-1-line"]');
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.3, y: b.y + b.height * 0.6 }, { ms: 1400 });
        await d.moveTo({ x: b.x + b.width * 0.7, y: b.y + b.height * 0.62 }, { ms: 1600 });
      } },
  ],
};
