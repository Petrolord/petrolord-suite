// Volumetrics with Petrolord, Lesson A2: surfaces in.
// The two registry sources in the Import dialog and what each row says; a
// time surface refused with the reason; the booked top and base from the
// registry and what the import read; the kit's own grid file, which is
// measured from the rig floor (KB, 25 m above sea level) and so sits deeper
// than the registry copy on the sea-level datum; the map and 3D previews.
import path from 'node:path';
import {
  login, expectText, openRcp, importRegistrySurface, surfaceCard, stoiip, t, dialog, TOP, BASE, KIT_DIR, rcpLessonMeta,
} from './rcp-common.mjs';

const KIT_TOP = path.join(KIT_DIR, '02-surfaces/EkeneSand-top-6wells.zmap');
const FILE_NAME = 'Lesson kit file (rig floor datum)';

export default {
  id: 'lesson-rcp-a2',
  ...rcpLessonMeta(2, 'A', 'Surfaces *in*', 'Registry and files, units, datum and sign, and the map and 3D previews'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    await d.page.locator('label[for="im-surfaces"]').click();
    await t(d, 'rcp-tab-surfaces').click();
    await d.sleep(800);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'sources', chapter: 'Two registry doors', chapterSub: 'Seismolord and Mapping & Surface Studio',
      say: 'With the Surfaces method, the rock volume comes from a top and a base map. Import lists two registry doors: surfaces published from Seismolord, and surfaces from Mapping and Surface Studio. Each row says what it holds: a depth structure, a time surface or an attribute map, its grid, and the units of X Y and Z.',
      sub: 'With the Surfaces method, the rock volume comes from a top and a base map. Import lists two registry doors: surfaces published from Seismolord, and surfaces from Mapping & Surface Studio. Each row says what it holds: a depth structure, a time surface or an attribute map, its grid, and the units of XY and Z.',
      do: async (d) => {
        await d.click('rcp-import-open');
        await dialog(d).waitFor();
        await d.sleep(800);
        const row = t(d, `rcp-registry-domain-${TOP}`);
        await expectText(d, row, /depth structure · 25×20 · XY m · Z m/, 'registry row description');
        await d.highlight(row);
        await d.sleep(2500);
        await d.unhighlight();
        const twt = t(d, 'rcp-registry-domain-Ekene Sand (TWT ms)');
        await twt.scrollIntoViewIfNeeded();
        await d.highlight(twt);
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'refused',
      say: 'A time surface cannot make a volume. Use it, and the dialog refuses it and says why: depth convert it first.',
      do: async (d) => {
        await d.click(t(d, 'rcp-registry-use-Ekene Sand (TWT ms)'));
        const msg = dialog(d).getByText(/is a time surface \(TWT\); this needs a depth structure/).first();
        await msg.waitFor({ timeout: 30000 });
        await msg.scrollIntoViewIfNeeded();
        await d.highlight(msg.locator('xpath=..'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'top', chapter: 'From the registry', chapterSub: 'What the import read',
      say: 'The booked top is a depth structure. Before it is used, the dialog says what it read: two hundred and one live nodes, depths in metres as elevations below sea level, X Y in metres, and the coordinate system.',
      sub: 'The booked top is a depth structure. Before it is used, the dialog says what it read: 201 live nodes, depths in metres as elevations below sea level, XY in metres, and the coordinate system.',
      do: async (d) => {
        const use = t(d, `rcp-registry-use-${TOP}`);
        await use.scrollIntoViewIfNeeded();
        await d.click(use);
        await t(d, 'rcp-import-ready').waitFor({ timeout: 60000 });
        await t(d, 'rcp-import-ready').scrollIntoViewIfNeeded();
        await expectText(d, t(d, 'rcp-import-ready'), /201 live nodes · depth m, elevation \(negative below datum\) · XY m · EPSG:32632/, 'what the import read');
        await d.highlight(t(d, 'rcp-import-ready'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click('rcp-import-confirm');
        await dialog(d).waitFor({ state: 'hidden', timeout: 60000 });
      },
      wait: async (d) => { await importRegistrySurface(d, BASE); },
      waitLabel: 'Seconds later' },
    { id: 'range',
      say: 'Each surface card gives its depth range in the project unit: the top from five thousand one hundred and thirty four point five to four thousand nine hundred and sixty nine point five feet below sea level. Set one as the top and the other as the base.',
      sub: 'Each surface card gives its depth range in the project unit: the top from 5,134.5 to 4,969.5 ft below sea level. Set one as the top and the other as the base.',
      do: async (d) => {
        await expectText(d, t(d, `rcp-surface-minz-${TOP}`), /^-5134\.5 ft$/, 'top deepest');
        await expectText(d, t(d, `rcp-surface-maxz-${TOP}`), /^-4969\.5 ft$/, 'top crest');
        await d.highlight(surfaceCard(d, TOP));
        await d.sleep(2500);
        await d.unhighlight();
        await d.click(surfaceCard(d, TOP).getByRole('button', { name: /Set Top/ }));
        await d.click(surfaceCard(d, BASE).getByRole('button', { name: /Set Base/ }));
        await stoiip(d);
      } },
    { id: 'file', chapter: 'From a file', chapterSub: 'Units, sign and datum',
      say: 'Files come in through the same dialog: X Y Z, CPS three, ZMAP plus, Irap and others. This is the kit\'s own grid of the same top. Say the units of X Y and of depth separately, and whether depths are negative down.',
      sub: 'Files come in through the same dialog: XYZ, CPS-3, ZMAP+, Irap and others. This is the kit\'s own grid of the same top. Say the units of XY and of depth separately, and whether depths are negative down.',
      do: async (d) => {
        await d.click('rcp-import-open');
        await dialog(d).waitFor();
        await d.sleep(600);
        await d.moveTo(dialog(d).getByText('Click to upload or drag and drop'));
        await dialog(d).locator('input[type=file]').setInputFiles(KIT_TOP);
        await d.sleep(1500);
        const name = dialog(d).getByPlaceholder('e.g. Top Reservoir');
        await name.scrollIntoViewIfNeeded();
        await d.type(name, FILE_NAME);
        await d.click(t(d, 'rcp-import-xy-m'));
        await d.click(t(d, 'rcp-import-z-m'));
        await d.click(dialog(d).getByRole('tab', { name: /Elevation/ }));
        await d.sleep(800);
        await d.click('rcp-import-confirm');
        await dialog(d).waitFor({ state: 'hidden', timeout: 60000 }).catch(async () => {
          if (await t(d, 'rcp-import-anyway').count()) await t(d, 'rcp-import-anyway').click();
        });
        await d.sleep(1000);
      } },
    { id: 'datum',
      say: 'The same map now reads five thousand two hundred and sixteen point five to five thousand and fifty one point six feet: deeper by the height of the rig floor above sea level, because the kit\'s grid is measured from the rig floor. Contacts in ReservoirCalc Pro are sea-level depths, so a map on another datum must be shifted before it is used. This one goes.',
      sub: 'The same map now reads 5,216.5 to 5,051.6 ft: deeper by the height of the rig floor above sea level, because the kit\'s grid is measured from the rig floor. Contacts in ReservoirCalc Pro are sea-level depths, so a map on another datum must be shifted before it is used. This one goes.',
      do: async (d) => {
        const c = surfaceCard(d, FILE_NAME);
        await c.scrollIntoViewIfNeeded();
        await expectText(d, t(d, `rcp-surface-minz-${FILE_NAME}`), /^-5216\.5 ft$/, 'file deepest');
        await expectText(d, t(d, `rcp-surface-maxz-${FILE_NAME}`), /^-5051\.6 ft$/, 'file crest');
        await d.highlight(c);
        await d.sleep(4000);
        await d.unhighlight();
        await d.click(c.getByRole('button').filter({ hasNotText: /Set (Top|Base)/ }).first());
        await d.sleep(1200);
      } },
    { id: 'map', chapter: 'The previews', chapterSub: 'Map and 3D',
      say: 'The middle panel shows the structure. On the map, the cursor reads the depth at any node, with contours every twenty feet.',
      do: async (d) => {
        const c = d.page.locator('canvas').first();
        const b = await c.boundingBox();
        await d.moveTo({ x: b.x + b.width * 0.42, y: b.y + b.height * 0.4 }, { ms: 900 });
        await d.sleep(1500);
        await d.moveTo({ x: b.x + b.width * 0.6, y: b.y + b.height * 0.55 }, { ms: 1200 });
        await d.sleep(1500);
      } },
    { id: '3d',
      say: 'In three D, the top is drawn over the base, with the contact plane between them, and the vertical exaggeration slider stretches the relief. Drag to turn it.',
      sub: 'In 3D, the top is drawn over the base, with the contact plane between them, and the vertical exaggeration slider stretches the relief. Drag to turn it.',
      do: async (d) => {
        const c = d.page.locator('canvas').last();
        const b = await c.boundingBox();
        const x0 = b.x + b.width * 0.5; const y0 = b.y + b.height * 0.55;
        await d.moveTo({ x: x0, y: y0 });
        await d.page.mouse.down();
        for (let i = 1; i <= 20; i++) { await d.page.mouse.move(x0 + i * 8, y0 + i * 1.5); await d.page.evaluate(([x, y]) => window.__demo.moveTo(x, y, 30), [x0 + i * 8, y0 + i * 1.5]); await d.sleep(40); }
        await d.page.mouse.up();
        await d.sleep(2000);
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Contacts, closure and spill',
      say: 'Next, where the oil stops: contacts, closure and the spill point.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
