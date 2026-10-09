// Lesson E15: Permeability from logs (Ekene-1, kit v2.1, feet). Dry run
// 2026-10-08, Module E base (Module D interpretation: Indonesia Rsh 3.2, Rw
// 0.0786; Ekene Sand pay 27.5 ft). Pay geometric mean k: Timur Buckles 0.04
// 163.3 mD; Buckles 0.05 104.5; Coates 230.2; Tixier 88.3; Wyllie-Rose (gas
// preset) 8.8 (all at Buckles 0.04 except where stated). Truth (earth model permeability over the true pay) 213.9 mD.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, ZONE_CARD, baseParams, MODULE_E_BASE } from './common.mjs';

const ekene = (d) => ZONE_CARD(d, 'Ekene Sand');
const perm = async (d, method, buckles) => {
  if (method) await d.select('petro-param-permMethod', method);
  if (buckles != null) await d.type('petro-param-bucklesConst', String(buckles));
  await d.click('petro-params-apply');
};

export default {
  id: 'lesson-e15',
  ...lessonMeta(15, 'E', 'Permeability from logs: *Timur, Coates and irreducible water*', 'No log measures permeability: how the classic models estimate it from porosity and irreducible water, how far they disagree, and why they need core'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 15', chapterSub: 'Module E · Permeability, net pay and calibration',
      say: 'Welcome to Module E. Porosity says how much oil a rock holds; permeability says how fast it will give it up. And no logging tool measures permeability directly. In this lesson: how the classic models estimate it from the logs, and how far apart they land.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 15', title: 'Permeability from logs',
        body: '<ul><li>Why pore size links permeability and bound water</li><li>Timur, Coates, Tixier, Wyllie-Rose</li><li>Irreducible water from Buckles</li><li>How far the models disagree</li></ul>' }) },
    { id: 'concept', chapter: 'Pore size is the key',
      say: 'Permeability depends on the size of the pore throats. Small pores have a lot of surface, and surface holds water that never moves: the irreducible water saturation. So rock with high porosity and low irreducible water has big pores and flows well. The classic models all use those two numbers. Timur, from 1968, is the studio\'s default: eight thousand five hundred and eighty one, times porosity to the four point four, over irreducible water saturation squared.',
      do: async (d) => d.slide({ eyebrow: 'Pore size is the key', title: 'Porosity and irreducible water',
        body: '<ul><li>Small pores: more surface, more bound water, lower k</li><li>Timur (1968), Coates, Tixier, Wyllie-Rose</li></ul>', formula: 'k = 8581 φ<sup>4.4</sup> / S<sub>wirr</sub><sup>2</sup>  (mD, Timur)' }) },
    { id: 'buckles', chapter: 'Irreducible water', chapterSub: 'The Buckles number',
      say: 'Where does the irreducible water come from? High in a hydrocarbon column, porosity times water saturation settles to a near-constant, the Buckles number: the bulk volume of water the rock cannot give up. Coarse sands sit around two hundredths, fine sands nearer a tenth. The studio starts at four hundredths, and divides it by porosity to get irreducible water at every depth.',
      do: async (d) => d.slide({ eyebrow: 'Irreducible water', title: 'The Buckles number',
        body: '<ul><li>φ × S<sub>wirr</sub> ≈ constant near irreducible</li><li>About 0.02 coarse, 0.10 fine</li><li>Studio default 0.04</li></ul>', formula: 'S<sub>wirr</sub> = B / φ' }) },
    { id: 'timur', chapter: 'On the Ekene Sand', chapterSub: 'Timur',
      say: 'On Ekene-1, with the interpretation from Module D, the zone card shows the geometric mean permeability over the net pay, the natural average for permeability. Timur with a Buckles number of four hundredths gives one hundred and sixty three millidarcies.',
      do: async (d) => {
        await d.hideSlide();
        await expectText(d, ekene(d), /k gm 163\.3 mD/, 'Timur 0.04');
        await d.highlight(ekene(d)); await d.callout('t', ekene(d), 'Timur, Buckles 0.04: 163 mD', 'left');
      } },
    { id: 'b05',
      say: 'Change the Buckles number to five hundredths, a slightly finer sand, and Timur falls to one hundred and five. The square in the formula makes it sensitive.',
      do: async (d) => {
        await d.clearCallouts();
        await perm(d, null, 0.05);
        await expectText(d, ekene(d), /k gm 104\.5 mD/, 'Timur 0.05');
        await d.callout('t5', ekene(d), 'Timur, Buckles 0.05: 105 mD', 'left');
      } },
    { id: 'others', chapter: 'Other models',
      say: 'Back to four hundredths, and try the others. Coates gives two hundred and thirty. Tixier, eighty eight. And Wyllie-Rose with its gas preset, eight point eight: a preset built for gas sands, used in an oil sand. Same rock, same logs, a factor of more than twenty between them.',
      do: async (d) => {
        await d.clearCallouts();
        await perm(d, 'coates', 0.04);
        await expectText(d, ekene(d), /k gm 230\.2 mD/, 'Coates');
        await d.callout('c', ekene(d), 'Coates: 230 mD', 'left'); await d.sleep(3500); await d.clearCallouts();
        await perm(d, 'tixier', null);
        await expectText(d, ekene(d), /k gm 88\.3 mD/, 'Tixier');
        await d.callout('x', ekene(d), 'Tixier: 88.3 mD', 'left'); await d.sleep(3500); await d.clearCallouts();
        await perm(d, 'wyllie-rose', null);
        await expectText(d, ekene(d), /k gm 8\.8 mD/, 'Wyllie-Rose');
        await d.callout('w', ekene(d), 'Wyllie-Rose, gas preset: 8.8 mD', 'left');
      } },
    { id: 'truth', chapter: 'Checking against the field',
      say: 'The earth model\'s permeability over this pay averages two hundred and fourteen millidarcies. Coates lands closest, eight percent high; Timur with the default is a quarter low. But without the earth model, how would you know which model, and which constant, to trust? You would calibrate against core. That is the next lesson.',
      do: async (d) => {
        await d.clearCallouts(); await d.unhighlight();
        await perm(d, 'timur', null);
        await d.slide({ eyebrow: 'Checking against the field', title: 'More than a factor of twenty',
          body: '<table style="font-size:30px;border-collapse:separate;border-spacing:0 12px"><colgroup><col style="width:520px"><col></colgroup><tr><td>Timur, Buckles 0.04</td><td><b>163</b> mD</td></tr><tr><td>Timur, Buckles 0.05</td><td><b>105</b> mD</td></tr><tr><td>Coates</td><td><b>230</b> mD</td></tr><tr><td>Tixier</td><td><b>88</b> mD</td></tr><tr><td>Wyllie-Rose, gas preset</td><td><b>8.8</b> mD</td></tr><tr><td style="color:#d4ac3a">Truth (earth model)</td><td><b>214</b> mD</td></tr></table>' });
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Log permeability is an estimate, built on porosity and irreducible water. Timur is the common default, and the Buckles number sets the irreducible water. The models disagree by more than a factor of twenty here, and presets matter. Next: calibrating the logs to core.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 15', title: 'Permeability from logs',
        body: '<ul><li>k from porosity and irreducible water</li><li>Buckles number sets S<sub>wirr</sub></li><li>Ekene Sand: 8.8 to 230 mD across models; truth 214</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: calibrating logs to core</p>' }) },
  ],
};
