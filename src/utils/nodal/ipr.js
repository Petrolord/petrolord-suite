/**
 * Oil inflow performance relationships for the Nodal Analysis Studio (NA1).
 *
 * RE-EXPORT SHIM. The models themselves -- straight-line productivity
 * index, Vogel, the Standing composite, Fetkovich, Jones-Blount-Glaze,
 * calibration from a production test and the published depletion rule
 * for each family -- now live in the central @petrolord/engines repo at
 * `engines/production/nodal.js`, vendored here at packages/engines
 * (git subtree) and gated there against an independent Python oracle
 * (tools/validation/production/oracle_nodal.py) that inverts every
 * family in closed form where the engine runs a Brent root find.
 *
 * Never edit the vendored copy from the Suite; changes go to
 * Petrolord/petrolord-engines and are subtree-pulled back.
 */
export {
  computeIpr,
  futureIpr,
  pwfAtRate,
  rateAtPwf,
} from '../production/engine/nodal.js';
