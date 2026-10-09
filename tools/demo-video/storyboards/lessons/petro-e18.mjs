// Lesson E18: Saturation-height modelling from capillary pressure (SCAL
// Studio project "Ekene Sand J-function", seeded by seed/scal.mjs: plugs
// EK1-P air-brine, EK3-P mercury-air, EK5-P oil-brine; J from the samples
// a 0.249, b 1.01, Swirr 0.250 (truth 0.25, 1, 0.25); rock 250 mD, 0.20;
// oil-brine 26 dyn/cm at 30 deg; water 1.03, oil 0.8654; FWL 5046.4 ft TVDSS
// (contact 5036.1 ft TVDSS plus the 10.3 ft entry height); Sw 0.5 at 31.2 ft
// above the FWL). Petrophysics, Module E base: Ekene Sand (210 samples) log Sw
// 0.778, saturation-height Sw 0.835 (truth zone average 0.835); rock per
// sample from KPERM and phi_e 0.878. Oboro Sand (gas, its own contact) 0.341
// against 1.000.
import { lessonMeta, login, openPetroWell, ensureZonesOn, expectText, baseParams, MODULE_E_BASE, zoomTracksAt } from './common.mjs';

const SCAL = '/dashboard/apps/reservoir/scal-studio';
const PROJECT = 'Ekene Sand J-function';
const scalTab = (d, n) => d.click(d.page.getByRole('tab', { name: n, exact: true }).first());

export default {
  id: 'lesson-e18',
  ...lessonMeta(18, 'E', 'Saturation-height modelling: *capillary pressure and the J-function*', 'Water saturation from capillary pressure and height above the free-water level: the Leverett J-function in SCAL Studio, and an independent check on the log saturation'),
  async setup(d, shared) {
    await login(d.page, shared.baseUrl, shared.env);
    // the Petrophysics parameters first (they are global), then SCAL Studio
    await openPetroWell(d, shared, 'Ekene-1');
    await ensureZonesOn(d);
    await baseParams(d, MODULE_E_BASE);
    await d.page.goto(`${shared.baseUrl}${SCAL}`, { waitUntil: 'domcontentloaded' });
    await d.page.getByTestId('scal-unit-system').waitFor({ timeout: 120000 }); await d.sleep(3000);
    await d.page.getByRole('combobox').first().click(); await d.sleep(600);
    await d.page.getByRole('option', { name: PROJECT, exact: true }).first().click(); await d.sleep(3000);
    await d.page.getByRole('tab', { name: 'Lab Data', exact: true }).first().click(); await d.sleep(1500);
  },
  steps: [
    { id: 'intro', chapter: 'Lesson 18', chapterSub: 'Module E · Permeability, net pay and calibration',
      say: 'Logs measure water saturation sample by sample. Capillary pressure predicts it from first principles: from the rock\'s pore throats and the height above the free-water level. The two should agree, and where they do not, something needs a second look. In this lesson we build a saturation-height model from core and test the log saturation against it.',
      lead: 0.6,
      do: async (d) => d.slide({ eyebrow: 'Module E · Lesson 18', title: 'Saturation-height modelling',
        body: '<ul><li>Buoyancy and capillary pressure</li><li>The Leverett J-function</li><li>A model from three plugs</li><li>Testing the log saturation</li></ul>' }) },
    { id: 'concept', chapter: 'Buoyancy and capillary pressure',
      say: 'Above the free-water level, the oil column is lighter than water, and the difference in pressure grows with height. That difference is the capillary pressure, and it decides how far oil can push into the pores. Small pores need more pressure, so water saturation falls with height, from one at the free-water level towards the irreducible saturation high in the column. The oil-water contact sits a little above the free-water level, by the entry height of the largest pores.',
      do: async (d) => d.slide({ eyebrow: 'Buoyancy and capillary pressure', title: 'Saturation falls with height',
        body: '<ul><li>P<sub>c</sub> grows with height above the free-water level</li><li>S<sub>w</sub> falls from 1 towards S<sub>wirr</sub></li><li>The contact sits one entry height above the FWL</li></ul>', formula: 'P<sub>c</sub> = 0.4335 (γ<sub>w</sub> − γ<sub>o</sub>) h  (psi, ft)' }) },
    { id: 'jfunction', chapter: 'The Leverett J-function',
      say: 'Laboratory curves come from different plugs, with different fluids. Leverett\'s J-function puts them on one footing: capillary pressure, scaled by the interfacial tension and contact angle of the fluids, and by the square root of permeability over porosity. Plugs of the same rock type then fall on one curve, which can be scaled back to any reservoir rock and fluid.',
      do: async (d) => d.slide({ eyebrow: 'The Leverett J-function', title: 'One curve for one rock type',
        body: '<ul><li>Removes the fluid system: σ cos θ</li><li>Removes rock quality: √(k/φ)</li></ul>', formula: 'J = 0.21645 P<sub>c</sub> √(k/φ) / (σ cos θ)' }) },
    { id: 'plugs', chapter: 'In SCAL Studio', chapterSub: 'Three plugs, three fluid systems',
      say: 'In SCAL Studio, the Ekene Sand project holds three plugs from the kit: E K one, measured with air and brine; E K three, with mercury; and E K five, with oil and brine. Each carries its permeability, porosity, and the lab\'s interfacial tension and contact angle. Their raw capillary pressure curves look nothing alike.',
      do: async (d) => { await d.hideSlide(); await d.highlight(d.page.getByText(/^core samples$/i).locator('xpath=..')); } },
    { id: 'collapse', chapter: 'One curve',
      say: 'On the Capillary tab, with J taken from the samples, all three plugs collapse onto one curve. The fit: a of zero point two four nine, an exponent of one point zero one, and an irreducible saturation of zero point two five. The earth model behind Ekene was built with zero point two five, one, and zero point two five. Scaled to the reservoir rock, two hundred and fifty millidarcies and twenty percent porosity, with oil and brine at twenty six dynes per centimetre and thirty degrees.',
      do: async (d) => {
        await d.unhighlight(); await scalTab(d, 'Capillary'); await d.sleep(1500);
        await expectText(d, d.page.locator('body'), /J SOURCE\s*3 samples\s*A \(J AT SW\* = 1\)\s*0\.249\s*B EXPONENT\s*1\.01\s*SWIRR\s*0\.250/i, 'J fit');
        await d.highlight(d.page.getByText('Leverett J-function', { exact: true }).locator('xpath=ancestor::div[2]'));
      } },
    { id: 'height', chapter: 'Height and saturation',
      say: 'On Height and Saturation, the fluid gradients and the free-water level: five thousand and forty six point four feet below sea level, ten feet below the oil-water contact. Water saturation falls to one half at thirty one feet above the free-water level.',
      do: async (d) => {
        await d.unhighlight(); await scalTab(d, 'Height & Saturation'); await d.sleep(1500);
        await expectText(d, d.page.locator('body'), /HEIGHT AT SW = 0\.5\s*31\.2/i, 'height at Sw 0.5');
        await d.highlight(d.page.getByText('Saturation vs height above free water level', { exact: true }).locator('xpath=ancestor::div[2]'));
      } },
    { id: 'petro', chapter: 'Testing the log saturation', chapterSub: 'Petrophysics Studio',
      say: 'Now to Petrophysics Studio, on Ekene-1, with the interpretation from Module D. Sat-height reads the saved SCAL project: its J-function, rock, fluids and free-water level. Compute.',
      do: async (d, shared) => {
        await d.unhighlight();
        await openPetroWell(d, shared, 'Ekene-1');
        // parameters set before leaving for SCAL Studio may not have been saved yet
        await baseParams(d, MODULE_E_BASE);
        await d.click(d.page.getByRole('button', { name: /Sat-height/ }).first());
        await d.waitFor('petro-shm-dialog'); await d.sleep(1500);
        await d.click('petro-shm-run'); await d.sleep(1500);
      } },
    { id: 'compare', chapter: 'Zone by zone',
      say: 'Over the Ekene Sand, the saturation-height model averages eighty three and a half percent water, exactly the earth model\'s figure, because it was built from the same rock curve. The log saturation reads seventy eight: six units lower, so the log interpretation is slightly optimistic over the zone. And look at the Oboro Sand: the model says all water, the logs say gas. The Oboro gas is a separate accumulation with its own contact, and needs its own saturation-height model.',
      do: async (d) => {
        await expectText(d, 'petro-shm-compare', /Ekene Sand\s*210\s*0\.778\s*0\.835\s*-0\.057/, 'Ekene compare');
        await expectText(d, 'petro-shm-compare', /Oboro Sand\s*439\s*0\.341\s*1\.000/, 'Oboro compare');
        await d.highlight('petro-shm-compare');
      } },
    { id: 'tracks', chapter: 'On the tracks',
      say: 'Show on tracks puts the two saturations side by side. Zoom onto the Ekene Sand. Above the contact they track each other; the log curve dips lower in the cleanest sand, where the shaly-sand model and the porosity carry their own uncertainty. A saturation-height model is also what a three-dimensional reservoir model uses, because it needs saturation where there are no wells.',
      do: async (d, shared) => {
        await d.unhighlight();
        await d.click('petro-shm-tracks'); await d.sleep(1500);
        shared.values.g = await zoomTracksAt(d, 5110, 12);
      } },
    { id: 'recap', chapter: 'Recap',
      say: 'To recap Module E. Log permeability is an estimate: calibrate it to core. Take cutoffs from flow, and test which one matters. And capillary pressure, through the J-function and the free-water level, gives an independent saturation to test the logs against. In Module F, the last module, we put uncertainty on all of it, and deliver the answer.',
      do: async (d) => d.slide({ eyebrow: 'Recap · Module E', title: 'Permeability, net pay, calibration',
        body: '<ul><li>Core: k transform log k = 0.455 + 9.72 φ; Timur tuned to it</li><li>Cutoffs: S<sub>w</sub> swings Ekene pay by 31 %</li><li>J from three plugs: 0.249, 1.01, 0.250 (truth 0.25, 1, 0.25)</li><li>Ekene Sand S<sub>w</sub>: logs <b>0.778</b>, capillary pressure <b>0.835</b> (truth 0.835)</li></ul><p style="margin-top:28px;color:#d4ac3a">Next, Module F: uncertainty and delivery</p>' }) },
  ],
};
