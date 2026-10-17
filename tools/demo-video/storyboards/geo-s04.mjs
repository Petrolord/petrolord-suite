// Geoscience module showcase, scene 4: Well Correlation. Ekene-3, 1, 2 and 4
// (the wells with the full log suite, published PHIE/VSH/SW and RP_FACIES),
// the Correlation colour template (#1200), bold zone fills between the tops,
// flattened on the top of the Ekene Sand and zoomed on the reservoir.
import { login, scene, t, park, openApp } from './geo-common.mjs';

const WELLS = ['Ekene-3', 'Ekene-1', 'Ekene-2', 'Ekene-4'];
const TOPS = ['Ogbia Shale', 'Ekene Sand', 'Ekene Sand Middle', 'Ekene Sand Lower', 'Ekene Sand Base', 'Oboro Unconformity'];

const pickOpt = async (d, id, re) => {
  const o = (await t(d, id).locator('option').allInnerTexts()).find((x) => re.test(x));
  if (!o) { console.log(`MISMATCH ${id}: no option ${re}`); return false; }
  await d.select(id, { label: o });
  return true;
};

export default {
  ...scene('geo-s04'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openApp(d, shared, 'well-correlation', 'corr-explorer', { settle: 4000 });
    await t(d, 'corr-zone-mode').selectOption({ index: 1 }).catch(() => {});
    await park(d);
  },
  steps: [
    { id: 'wells', chapter: 'Well correlation', chapterSub: 'Well Correlation',
      say: 'Well Correlation lays the wells side by side, in section order across the field.',
      do: async (d) => {
        for (const w of WELLS) await d.click(t(d, `corr-add-${w}`), { after: 300 });
        await d.sleep(3000);
        // the reservoir tops only (off the shared registry, nothing changes)
        const names = await d.page.locator('[data-testid^="corr-toggle-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice('corr-toggle-'.length)));
        for (const n of names.filter((x) => x !== 'dock')) {
          const box = t(d, `corr-toggle-${n}`).locator('input[type=checkbox]');
          const want = TOPS.includes(n);
          if ((await box.isChecked()) !== want) await box.click();
        }
        await d.sleep(1500);
      } },
    { id: 'colour',
      say: 'Gamma ray in colour, the rock physics facies beside it, porosity in blue, and the zones filled between the tops: the upper, middle and lower Ekene Sand.',
      do: async (d) => {
        await pickOpt(d, 'corr-template', /^Correlation colour/);
        if (await t(d, 'corr-zone-strength').count()) await d.select('corr-zone-strength', 'bold');
        await d.sleep(2500);
      } },
    { id: 'flatten',
      say: 'Flatten on the top of the sand, zoom in, and the correlation reads at a glance.',
      do: async (d) => {
        await d.select('corr-datum-mode', { index: 1 });
        await d.sleep(800);
        await pickOpt(d, 'corr-datum-top', /^Ekene Sand$/);
        await d.sleep(2500);
        // zoom on the reservoir: a few notches about a point below it lift it
        // to mid-height, then the rest about the reservoir itself (fractions
        // of the section canvas from the dry run on the demo wells)
        const area = await t(d, 'corr-section-canvas').boundingBox();
        const at = (f) => ({ x: area.x + area.width * 0.45, y: area.y + area.height * f });
        await d.moveTo(at(0.95), { ms: 900 });
        for (let i = 0; i < 3; i++) { await d.page.mouse.wheel(0, -200); await d.sleep(300); }
        await d.moveTo(at(Number(process.env.ZF || 0.515)), { ms: 700 });
        for (let i = 0; i < 11; i++) { await d.page.mouse.wheel(0, -200); await d.sleep(280); }
        await d.moveTo({ x: area.x + area.width * 0.98, y: area.y + area.height * 0.3 }, { ms: 700 });
        await d.sleep(1500);
      } },
    { id: 'shared',
      say: 'Pick or drag a top here, and the shared registry updates it for every application.',
      do: async (d) => { await d.moveTo({ x: 700, y: 420 }, { ms: 1500 }); } },
  ],
};
