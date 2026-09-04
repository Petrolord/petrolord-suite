/**
 * Cullender and Smith (1956) gas-column pressures for the Nodal Analysis
 * Studio (NA2), and the average temperature and z closed form beside it.
 *
 * RE-EXPORT SHIM WITH ONE BINDING. The march itself lives in the central
 * @petrolord/engines repo at `engines/production/nodal.js`, vendored
 * here at packages/engines (git subtree). The one thing bound here is
 * the z-factor: the engine takes it as an injected function so that a
 * consumer stays on its own PVT stack, and the Suite's nodal layer runs
 * on the Fluid Studio z (Sutton pseudo-criticals into Papay) that the
 * rest of the traverse uses. Handing the engine its own default instead
 * would put this one module on a different z from every other number on
 * the same screen.
 *
 * ON THE STEP COUNT. The engine defaults to the published two-station
 * construction, which is what this module has always computed, and the
 * numbers are bit-identical across it. The engine's oracle showed that
 * two stations run 1.3 psi low at 9 MMscf/d and 11.6 psi low at
 * 13.3 MMscf/d on an 8000 ft 2.441 in string, and the engine now takes
 * a `steps` input that removes it. Raising the default is a behaviour
 * change to the studio and is deliberately NOT made here; it is a
 * follow-on with its own gate.
 *
 * Never edit the vendored copy from the Suite; changes go to
 * Petrolord/petrolord-engines and are subtree-pulled back.
 */
import {
  cullenderSmithBhp as engineCullenderSmithBhp,
  averageTzBhp as engineAverageTzBhp,
} from '../production/engine/nodal.js';
import { zFactor } from '../fluidStudioCalculations.js';

export { gasReynolds } from '../production/engine/nodal.js';

/** The Suite's z: Sutton pseudo-criticals into Papay, clamped. */
const suiteZ = (gasSg) => (pPsia, tF) => zFactor(pPsia, tF, gasSg);

/** Static or flowing BHP by Cullender-Smith. See the module header. */
export const cullenderSmithBhp = (inputs) =>
  engineCullenderSmithBhp({ zAt: suiteZ(inputs.gasSg), ...inputs });

/** Average temperature and z-factor BHP (Guo and Ghalambor Eq. 4.54). */
export const averageTzBhp = (inputs) =>
  engineAverageTzBhp({ zAt: suiteZ(inputs.gasSg), ...inputs });
