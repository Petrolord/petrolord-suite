// Volumetrics with Petrolord, Lesson B5: zone averages from the registry.
// The Ekene Sand zone summaries Petrophysics Studio published (Ekene-1 and
// Ekene-3 with pay, Ekene-2 and Ekene-4 below the contact): how the Wells
// tab averages them, net pay against net reservoir (#1035), choosing wells,
// Apply with its provenance, and the audit trail.
import {
  login, expectText, openRcp, importRegistrySurface, surfaceCard, stoiip, t, TOP, BASE, rcpLessonMeta,
} from './rcp-common.mjs';

const ZONE = 'Ekene Sand (4 of 5 wells published)';

export default {
  id: 'lesson-rcp-b5',
  ...rcpLessonMeta(5, 'B', 'Zone averages *from the registry*', 'Weighting, net pay against net reservoir, and choosing the wells'),
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openRcp(d, shared);
    // the booked maps ready on the Surf tab for the Surfaces part; the take starts on Simple
    await d.page.locator('label[for="im-surfaces"]').click();
    await t(d, 'rcp-tab-surfaces').click();
    await importRegistrySurface(d, TOP);
    await importRegistrySurface(d, BASE);
    await surfaceCard(d, TOP).getByRole('button', { name: /Set Top/ }).click();
    await surfaceCard(d, BASE).getByRole('button', { name: /Set Base/ }).click();
    await d.page.locator('label[for="im-simple"]').click();
    await t(d, 'rcp-tab-registry').click();
    await d.sleep(4000);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'Zones from Petrophysics', chapterSub: 'The Wells tab',
      say: 'Petrophysics Studio publishes a summary for each zone in each well: gross and net thickness, porosity, water saturation. The Wells tab reads them from the registry. The Ekene Sand is in five wells, and four have a published summary.',
      do: async (d) => {
        await d.highlight(t(d, 'rcp-registry-panel'));
        await d.sleep(2000);
        await d.unhighlight();
        await d.select(t(d, 'rcp-reg-zone'), { label: ZONE });
        await d.sleep(1500);
      } },
    { id: 'pay', chapter: 'Net pay', chapterSub: 'The Simple method',
      say: 'With the Simple method, net to gross is net pay over gross: zero point two two six from all four wells. Ekene two and Ekene four have no net pay, because their sand is below the contact. For a Simple area that holds only the oil, leave them out: zero point four five three.',
      sub: 'With the Simple method, net-to-gross is net pay over gross: 0.226 from all four wells. Ekene-2 and Ekene-4 have no net pay, because their sand is below the contact. For a Simple area that holds only the oil, leave them out: 0.453.',
      do: async (d) => {
        await expectText(d, 'rcp-reg-preview', /NTG 0\.226,/, 'pay NTG all wells');
        await d.highlight('rcp-reg-preview');
        await d.sleep(2000);
        await d.unhighlight();
        for (const w of ['Ekene-2', 'Ekene-4']) {
          await expectText(d, t(d, `rcp-reg-nopay-${w}`), /no net pay/, `${w} no pay`);
          await d.click(t(d, `rcp-reg-use-${w}`));
          await d.sleep(600);
        }
        await expectText(d, 'rcp-reg-preview', /NTG 0\.453,/, 'pay NTG oil wells');
        await d.highlight('rcp-reg-preview');
        await d.sleep(2000);
        await d.unhighlight();
      } },
    { id: 'weights',
      say: 'The averages are weighted the way volumes need them: porosity by net thickness, water saturation by pore thickness, and net to gross as total net over total gross. Porosity zero point one nine one and water saturation zero point four four two come from the two wells with pay.',
      sub: 'The averages are weighted the way volumes need them: porosity by net thickness, water saturation by pore thickness, and net-to-gross as total net over total gross. Porosity 0.191 and water saturation 0.442 come from the two wells with pay.',
      do: async (d) => {
        await expectText(d, 'rcp-reg-preview', /porosity 0\.191, Sw 0\.442/, 'phi and Sw');
        const w = d.page.getByText(/^Averaged as /).first();
        await d.highlight(w);
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'reservoir', chapter: 'Net reservoir', chapterSub: 'The Surfaces method',
      say: 'Switch to the Surfaces method. Now the maps stop the oil at the contact themselves, so net pay would count the contact twice. Net to gross becomes net reservoir over gross, porosity and shale cutoffs only, from all four wells: zero point nine four eight. A wet well\'s sand belongs in it.',
      sub: 'Switch to the Surfaces method. Now the maps stop the oil at the contact themselves, so net pay would count the contact twice. Net-to-gross becomes net reservoir over gross, porosity and shale cutoffs only, from all four wells: 0.948. A wet well\'s sand belongs in it.',
      do: async (d) => {
        await d.click(d.page.locator('label[for="im-surfaces"]'));
        await d.sleep(1500);
        await d.select(t(d, 'rcp-reg-zone'), { label: ZONE });
        await d.sleep(1000);
        for (const w of ['Ekene-2', 'Ekene-4']) {
          const cb = t(d, `rcp-reg-use-${w}`);
          if (!(await cb.isChecked())) await d.click(cb);
          await d.sleep(400);
        }
        await expectText(d, 'rcp-reg-preview', /NTG 0\.948 \(net reservoir\)/, 'net reservoir NTG');
        await d.highlight('rcp-reg-preview');
        await d.sleep(1500);
        await d.highlight('rcp-reg-ntg-basis');
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'apply', chapter: 'Apply and record', chapterSub: 'Provenance and the audit trail',
      say: 'Nothing is applied until you press Apply. Then the inputs say where they came from, and the audit trail records the zone, the values and the wells.',
      do: async (d) => {
        await d.click('rcp-reg-apply-zone');
        await stoiip(d);
        const prov = d.page.getByText(/^Petrophysics from zone Ekene Sand/).first();
        await prov.scrollIntoViewIfNeeded();
        await d.highlight(prov);
        await d.sleep(2000);
        await d.unhighlight();
        await d.click('rcp-tools');
        await d.sleep(1000);
        await d.click(d.page.getByText('Audit Trail', { exact: true }).first());
        await d.sleep(1200);
        await expectText(d, d.page.getByRole('dialog').last(), /Registry inputs applied/, 'audit entry');
        await d.sleep(3000);
        await d.page.keyboard.press('Escape');
        await d.sleep(600);
      } },
    { id: 'fresh',
      say: 'Each time the project opens, the sources are checked again. If Petrophysics publishes the zone again with new cutoffs, a notice says so, and you choose to refresh or keep the values.',
      do: async (d) => {
        const n = t(d, 'rcp-source-changed-clear');
        await n.waitFor({ timeout: 30000 });
        await d.highlight(n);
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'next', chapter: 'Next', chapterSub: 'Saturation height',
      say: 'Next, water saturation that changes with height above the contact, from the capillary pressure curve.',
      do: async (d) => { await d.sleep(2000); } },
  ],
};
