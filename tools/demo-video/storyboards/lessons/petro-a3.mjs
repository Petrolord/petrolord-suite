// Lesson A3: Log quality control before you interpret (Ekene-1, kit v2).
// The Ogbia Shale washout (4,565 to 4,756 ft): caliper to 16.9 in on a
// 12.25 in bit, DRHO to 0.20 g/cc, density about 1.99 against 2.37 g/cc in
// gauge hole. Bad-hole repair with |DRHO| > 0.05 flags 437 samples; despike
// on GR (half window 5, 3 sigma) changes 356. Figures from the dry run.
import { lessonMeta, login, openPetroWell, zoomTracksAt, expectText } from './common.mjs';

export default {
  id: 'lesson-a3',
  ...lessonMeta(3, 'A', 'Log quality control: *what not to trust*', 'Completeness, units, washouts and the density correction, spikes, and what to do about them before any interpretation'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    await openPetroWell(d, shared, 'Ekene-1');
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 3', chapterSub: 'Module A · Getting the data right',
      say: 'Every interpretation inherits the faults of the logs it starts from. So before we compute a single porosity, we check the logs themselves. In this lesson we look for the readings we should not trust, see why they go wrong, and decide what to do about them.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module A · Lesson 3', title: 'Log quality control',
        body: '<ul><li>Is everything there, in the right units?</li><li>The borehole: <b>caliper</b> and <b>DRHO</b></li><li>Why a washout spoils the density</li><li>Spikes, and what to do with bad data</li></ul>' }) },
    { id: 'wrong', chapter: 'What goes wrong', chapterSub: 'The logs are measurements',
      say: 'A log is a measurement, made through mud, across a borehole wall that is not always where the tool expects it. The commonest problems are a borehole that has caved in, so pad tools lose contact with the rock; spikes from the tool or the telemetry; curves from different logging runs that are not depth matched; and plain bookkeeping, such as a curve in the wrong units or under the wrong name. The first two show up on the logs themselves, if you know where to look.',
      do: async (d) => d.slide({ eyebrow: 'What goes wrong', title: 'The logs are measurements, not the rock',
        body: '<ul><li><b>Washouts</b>: pad tools lose contact with the wall</li><li><b>Spikes</b>: tool or telemetry glitches</li><li><b>Depth mismatch</b> between logging runs</li><li><b>Bookkeeping</b>: wrong units, wrong names</li></ul>' }) },
    { id: 'inventory', chapter: 'Completeness and units', chapterSub: 'The curve inventory',
      say: 'Start with the bookkeeping. The curve inventory shows every curve the studio found in Ekene one, with the unit it came in, mapped to what the calculation needs. Gamma ray, density, neutron, sonic and resistivity are all present, and so are the caliper and DRHO, the two curves that tell us about the borehole. Well Data Manager already told us there are no nulls and that every curve covers the whole well.',
      do: async (d) => { await d.hideSlide(); await d.highlight('petro-curve-inventory'); } },
    { id: 'layout', chapter: 'The borehole', chapterSub: 'Borehole QC layout',
      say: 'Now the borehole. The Borehole QC layout puts the caliper and the density correction next to the curves they affect: gamma ray, caliper, DRHO, density and neutron, and resistivity.',
      do: async (d) => {
        await d.unhighlight();
        await d.select('petro-layout-template', 'borehole-qc');
        await d.sleep(1200);
      } },
    { id: 'zoom',
      say: 'We zoom onto the Ogbia Shale, the seal above the reservoir, around four thousand six hundred and fifty feet.',
      do: async (d, shared) => { shared.values.z = await zoomTracksAt(d, 4660, 8); } },
    { id: 'washout',
      say: 'Here it is. The hole was drilled with a twelve and a quarter inch bit, and over nearly two hundred feet the caliper opens to almost seventeen inches. The shale has caved in. In the same interval DRHO, the density tool\'s own correction, climbs to two tenths of a gram per cubic centimetre, and the shading marks every sample above five hundredths, a common limit for a density you can trust. And the density itself drops from about two point three seven to below two.',
      do: async (d, shared) => {
        const { y, b } = shared.values.z;
        await d.moveTo({ x: b.x + b.width * 0.30, y }, { ms: 900 });
        await d.sleep(1800);
        await d.moveTo({ x: b.x + b.width * 0.47, y }, { ms: 900 });
        await d.sleep(1800);
        await d.moveTo({ x: b.x + b.width * 0.62, y }, { ms: 900 });
      } },
    { id: 'why', chapter: 'Why density fails', chapterSub: 'Porosity from a washed-out hole',
      say: 'Why does that matter? The density tool presses a pad against the wall and reads a few inches into the rock. Where the wall has caved, the pad reads mud instead, at about one point two grams per cubic centimetre. Put a density of one point nine nine into the porosity equation, and a shale with a real porosity near seventeen percent reads forty percent. In a sand, a washout like this would invent porosity, and with it, reserves.',
      do: async (d) => d.slide({ eyebrow: 'Why density fails', title: 'A caved hole reads the mud',
        body: 'Gauge hole: ρ<sub>b</sub> 2.37 → φ<sub>D</sub> 0.17<br>Washout: ρ<sub>b</sub> 1.99 → φ<sub>D</sub> <b>0.40</b>', formula: 'φ<sub>D</sub> = (ρ<sub>ma</sub> − ρ<sub>b</sub>) / (ρ<sub>ma</sub> − ρ<sub>fl</sub>)' }) },
    { id: 'more',
      say: 'This washout is the largest in the well, but not the only one. Zoomed out, the shading also marks smaller patches in the deeper shales, near six thousand and near six thousand eight hundred feet. Each needs the same scepticism.',
      do: async (d) => {
        await d.hideSlide();
        await d.page.getByTestId('petro-tracks-canvas').dblclick();
        await d.sleep(1200);
        await d.moveTo('petro-tracks-canvas', { dx: 0.47, dy: 0.78 });
      } },
    { id: 'repair', chapter: 'What to do', chapterSub: 'Flag, repair, document',
      say: 'What do we do with bad data? Not delete it, and never quietly. Condition, bad-hole repair. We work on the density, and flag on DRHO alone, at five hundredths, because the bit size changes down this well. Null out blanks the flagged samples, so no later calculation uses them.',
      do: async (d) => {
        await d.click('petro-condition'); await d.waitFor('petro-cond-dialog');
        await d.select('petro-cond-source', 'RHOB');
        await d.select('petro-cond-op', 'bad-hole');
        await d.type('petro-cond-washoutOver', '99');
        await d.type('petro-cond-drhoMax', '0.05');
      } },
    { id: 'preview',
      say: 'The preview counts what would change: four hundred and thirty seven samples nulled. Saving would write a new curve, the conditioned density, and leave the raw density exactly as it was, with the operation and its settings recorded. Anyone can see what was done, and undo it. We will keep the raw curves for now.',
      do: async (d) => {
        await expectText(d, 'petro-cond-preview', /0 samples changed, 437 nulled/, 'bad-hole preview');
        await d.highlight('petro-cond-preview');
      } },
    { id: 'spikes', chapter: 'Spikes',
      say: 'Spikes are the other common fault. A Hampel filter compares each sample with the median of its neighbours, and replaces it only when it lies more than three standard deviations away. On the gamma ray it would change three hundred and fifty six samples out of fourteen thousand: the tool\'s noise spikes. Use it with care. A filter cannot tell a spike from a thin bed, and over smoothing removes exactly the detail we log for.',
      do: async (d) => {
        await d.unhighlight();
        await d.select('petro-cond-source', 'GR');
        await d.select('petro-cond-op', 'despike');
        await expectText(d, 'petro-cond-preview', /356 samples changed, 0 nulled/, 'despike preview');
        await d.highlight('petro-cond-preview');
      } },
    { id: 'close-dialog',
      say: 'One more check, for wells logged in more than one run: compare a shared curve, usually the gamma ray, across the run boundary, and shift any run that sits off depth before using the curves together. Ekene one was logged in one run, so there is nothing to shift here.',
      do: async (d) => { await d.unhighlight(); await d.click(d.page.getByTestId('petro-cond-dialog').getByRole('button', { name: 'Cancel' })); } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap. Check the bookkeeping first: every curve present, in the right units. Then the borehole: a caliper beyond the bit size and a large DRHO mean the density is reading mud, and porosity from it is too high. Flag bad data, repair it into a new curve, and keep the raw. Despike with care. Next lesson, we read a full triple combo log, and see what each curve tells us about the rock and its fluids.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Lesson 3', title: 'Trust, but verify',
        body: '<ul><li>Bookkeeping: every curve, the right units</li><li>Caliper past the bit and <b>|DRHO| above 0.05</b>: distrust the density</li><li>A washout invents porosity: <b>0.17 reads 0.40</b></li><li>Flag and repair into a new curve; keep the raw</li></ul><p style="margin-top:28px;color:#d4ac3a">Next: reading a triple combo</p>' }) },
  ],
};
