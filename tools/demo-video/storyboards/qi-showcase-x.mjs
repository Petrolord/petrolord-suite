// QI Studio showcase, extended cut (about 9 minutes; owner approved the
// exception to the 5-minute rule on 2026-10-16). See qisc-common.mjs.
import { showcaseSteps } from './qisc-steps.mjs';
import { commonSetup, extendedCleanup, seismolordLayout, startHere } from './qisc-setup.mjs';

export default {
  id: 'qi-showcase-x',
  app: 'QI Studio',
  eyebrow: 'QI Studio · Extended showcase',
  title: 'From raw SEG-Y to a *ranked prospect*',
  subtitle: 'Import and crop, the seismic in section and 3D, prestack conditioning, spectral decomposition, inversion, properties and the prospect, on the Ekene field',
  outroTitle: 'Quantitative interpretation *with Petrolord*',
  outroSub: 'Seismolord and QI Studio · petrolord.com',
  viewport: { w: 1440, h: 810 },
  async setup(d, shared) {
    await commonSetup(d, shared);
    await extendedCleanup(d, shared);
    await seismolordLayout(d, shared);
    await startHere(d, shared);
  },
  steps: showcaseSteps('x'),
};
