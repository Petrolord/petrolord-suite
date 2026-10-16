// QI Studio showcase, main cut (5:00 or shorter). Recorded after the
// extended cut, whose worker results it shows (the Radon run, the spectral
// volumes, the inversions), so the shared worker runs each job once. See
// qisc-common.mjs.
import { showcaseSteps } from './qisc-steps.mjs';
import { commonSetup, seismolordLayout, startHere } from './qisc-setup.mjs';

export default {
  id: 'qi-showcase',
  app: 'QI Studio',
  eyebrow: 'QI Studio · Showcase',
  title: 'From raw SEG-Y to a *ranked prospect*',
  subtitle: 'Seismolord and QI Studio on the Ekene field: import, the seismic in 3D, conditioning, spectral decomposition, inversion and the prospect',
  outroTitle: 'Quantitative interpretation *with Petrolord*',
  outroSub: 'Seismolord and QI Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await commonSetup(d, shared);
    await seismolordLayout(d, shared);
    await startHere(d, shared);
  },
  steps: showcaseSteps('main'),
};
