// Earth Modeling, demo 2: checking the model against ReservoirCalc Pro.
// The booked case typed into the model gives RCP's numbers exactly (rock
// above the contact 18,058 acre-ft over 418 acres, 12.14 MMstb); Prospect to
// RCP carries it across; then the properties from the well logs, and Sw
// from the SCAL saturation-height function, and why each number moves.
import {
  login, expectText, openEm, stackEkene, fluids, methods, typedBooked, build, t, vol,
} from './em-common.mjs';

const rcpCard = (d) => d.page.locator('text=/^STOOIP$/').locator('xpath=ancestor::*[contains(., "HC Area")][1]');

export default {
  id: 'em-02',
  app: 'Earth Modeling',
  eyebrow: 'Earth Modeling · 2 of 3',
  title: 'Checking the model against *ReservoirCalc Pro*',
  subtitle: 'The booked Ekene case in both apps, then the properties the logs and the capillary pressure give',
  outroTitle: 'Static models *with Petrolord*',
  outroSub: 'Earth Modeling · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    d.page.on('dialog', (dg) => dg.accept().catch(() => {}));
    await login(d.page, shared.baseUrl, shared.env);
    await openEm(d, shared);
    await stackEkene(d);
    await fluids(d);
    await d.page.evaluate(() => window.__demo.moveTo(900, 500, 10));
  },
  steps: [
    { id: 'intro', chapter: 'The booked number', chapterSub: '12.14 million barrels in ReservoirCalc Pro',
      say: 'ReservoirCalc Pro books the Ekene Sand at twelve point one four million stock tank barrels, from the same top and base maps, the contact at five thousand and thirty six feet, and the values the team signed off. Before a static model replaces that number, it should give it back on the same inputs.',
      sub: 'ReservoirCalc Pro books the Ekene Sand at 12.14 million stock tank barrels, from the same top and base maps, the contact at 5,036 ft, and the values the team signed off. Before a static model replaces that number, it should give it back on the same inputs.',
      do: async (d) => {
        await d.highlight(t(d, 'em-stack-0').locator('xpath=..'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
    { id: 'typed', chapter: 'The same inputs', chapterSub: 'Typed booked values',
      say: 'So we type the booked values for every node: net to gross zero point eight, porosity zero point two and water saturation zero point three five, with Bo of one point two. Then build.',
      sub: 'So we type the booked values for every node: net-to-gross 0.8, porosity 0.2 and water saturation 0.35, with Bo of 1.2. Then build.',
      do: async (d) => {
        await methods(d, { phi: 'typed', sw: 'typed', ntg: 'typed' }, { onCamera: true });
        await t(d, 'em-typed').scrollIntoViewIfNeeded();
        await typedBooked(d, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'same', chapter: 'The same answer', chapterSub: 'Rock, area and oil',
      say: 'The rock above the contact is eighteen thousand and fifty eight acre feet over four hundred and eighteen acres, and the oil in place is twelve point one four million barrels. ReservoirCalc Pro gives exactly these numbers, because both apps sum the same grid cell by cell.',
      sub: 'The rock above the contact is 18,058 acre-feet over 418 acres, and the oil in place is 12.14 million barrels. ReservoirCalc Pro gives exactly these numbers, because both apps sum the same grid cell by cell.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'hcbulk'), /^18058\.3$/, 'HC bulk');
        await expectText(d, vol(d, 'total', 'hcarea'), /^418$/, 'HC area');
        await expectText(d, vol(d, 'total', 'stoiip'), /^12\.142$/, 'booked STOIIP');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'prospect', chapter: 'Prospect to ReservoirCalc Pro', chapterSub: 'The zone carried across',
      say: 'Prospect to R C P carries the zone across: the area with oil, the average column, and the properties that keep the model\'s pore volume. ReservoirCalc Pro opens with the same twelve point one four million barrels over the same four hundred and eighteen acres.',
      sub: 'Prospect to RCP carries the zone across: the area with oil, the average column, and the properties that keep the model\'s pore volume. ReservoirCalc Pro opens with the same 12.14 million barrels over the same 418 acres.',
      do: async (d) => {
        await d.click('em-send-rcp');
        await d.page.waitForURL(/reservoircalc-pro/, { timeout: 60000 });
        await t(d, 'rcp-stooip').waitFor({ timeout: 120000 });
        await d.page.getByText('Processing Data...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
        await d.sleep(2500);
        await expectText(d, rcpCard(d), /12\.14 MM[\s\S]*Bulk Vol:\s*18,058 Ac-ft[\s\S]*HC Area:\s*418 acres/, 'RCP card');
        await d.highlight(rcpCard(d));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'back', chapter: 'From the logs', chapterSub: 'What the wells measured',
      say: 'Back in the model, we let the wells speak instead. The rock properties come from the logs, upscaled to five layers, with kriging for porosity and net to gross, and inverse distance for the water saturation.',
      do: async (d) => {
        await d.page.goBack({ waitUntil: 'domcontentloaded' });
        await t(d, `em-add-${'Ekene Sand top (6-well map)'}`).waitFor({ timeout: 120000 });
        await d.sleep(1500);
        if (!(await t(d, 'em-stack-0').count())) { await stackEkene(d); await fluids(d); }
        await t(d, 'em-control').scrollIntoViewIfNeeded();
        await d.select(t(d, 'em-control'), 'logs');
        await d.type(t(d, 'em-layers-0'), '5');
        await methods(d, { phi: 'okrige', ntg: 'okrige', sw: 'idw' }, { onCamera: true });
        await build(d, { onCamera: true });
      } },
    { id: 'logs', chapter: 'Why it moves', chapterSub: 'Net to gross and water saturation',
      say: 'Now the field holds eleven point one million barrels. The rock volume is unchanged and the properties differ. Under the table the model gives the averages over the oil leg. The logs call almost all of the sand net, zero point nine nine against the booked zero point eight, but water saturation averages about zero point five over the leg, against zero point three five.',
      sub: 'Now the field holds 11.1 million barrels. The rock volume is unchanged and the properties differ. Under the table the model gives the averages over the oil leg. The logs call almost all of the sand net, 0.99 against the booked 0.8, but water saturation averages about 0.5 over the leg, against 0.35.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^11\.102$/, 'logs STOIIP');
        await expectText(d, t(d, 'em-hcavg-ekene-sand'), /NTG 0\.986, porosity 0\.192, Sw 0\.497/, 'logs leg averages');
        await d.highlight(vol(d, 'total', 'stoiip'));
        await d.sleep(2000);
        await d.unhighlight();
        await d.highlight(t(d, 'em-hcavg-ekene-sand'));
        await d.sleep(3500);
        await d.unhighlight();
      } },
    { id: 'transition',
      say: 'The oil column is only sixty seven feet from the crest to the contact, so much of it is transition zone, where the rock holds more water than at the crest. Even in the top layer the logs read zero point four seven at Ekene one and zero point four two at Ekene three.',
      sub: 'The oil column is only 67 ft from the crest to the contact, so much of it is transition zone, where the rock holds more water than at the crest. Even in the top layer the logs read 0.47 at Ekene-1 and 0.42 at Ekene-3.',
      do: async (d) => {
        await expectText(d, t(d, 'em-logrow-ekene-sand-Ekene-1-1'), /0\.472/, 'Ekene-1 top layer Sw');
        await expectText(d, t(d, 'em-logrow-ekene-sand-Ekene-3-1'), /0\.420/, 'Ekene-3 top layer Sw');
        await t(d, 'em-logrows-ekene-sand').scrollIntoViewIfNeeded();
        await d.highlight(t(d, 'em-logrows-ekene-sand'));
        await d.sleep(4000);
        await d.unhighlight();
      } },
    { id: 'shm', chapter: 'Sw from capillary pressure', chapterSub: 'The SCAL Studio J function',
      say: 'Saturation height checks it from capillary pressure. It reads the J function fitted in SCAL Studio, with its free water level at five thousand and forty six feet, and gives every node the water saturation for its height above that level.',
      sub: 'Saturation height checks it from capillary pressure. It reads the J function fitted in SCAL Studio, with its free-water level at 5,046 ft, and gives every node the water saturation for its height above that level.',
      do: async (d) => {
        await methods(d, { sw: 'shm' }, { onCamera: true });
        await d.sleep(600);
        const sel = t(d, 'em-shm-project');
        await sel.scrollIntoViewIfNeeded();
        const v = await sel.locator('option', { hasText: 'Ekene Sand J-function' }).first().getAttribute('value');
        await d.select(sel, v);
        await build(d, { onCamera: true });
      } },
    { id: 'shmresult', chapter: 'The reconciliation', chapterSub: 'Every difference on the screen',
      say: 'The J function agrees with the logs: Sw zero point five three over the leg, and ten point three six million barrels. The booking carries the crest saturation of zero point three five down the whole column and a stricter net cut. The two apps agree exactly on the same inputs, and the model shows which inputs move the number, so the team can choose them with the evidence in front of them.',
      sub: 'The J function agrees with the logs: Sw 0.53 over the leg, and 10.36 million barrels. The booking carries the crest saturation of 0.35 down the whole column and a stricter net cut. The two apps agree exactly on the same inputs, and the model shows which inputs move the number, so the team can choose them with the evidence in front of them.',
      do: async (d) => {
        await d.click('em-view-qc');
        await d.sleep(1200);
        await vol(d, 'total', 'stoiip').scrollIntoViewIfNeeded();
        await expectText(d, vol(d, 'total', 'stoiip'), /^10\.358$/, 'SHM STOIIP');
        await expectText(d, t(d, 'em-hcavg-ekene-sand'), /Sw 0\.531/, 'SHM leg Sw');
        await d.highlight(t(d, 'em-vol-ekene-sand'));
        await d.sleep(2500);
        await d.unhighlight();
        await d.highlight(t(d, 'em-hcavg-ekene-sand'));
        await d.sleep(3000);
        await d.unhighlight();
      } },
  ],
};
