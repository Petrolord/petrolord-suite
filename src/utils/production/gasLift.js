/**
 * Gas Lift Design Studio analytics (Production P4).
 *
 * The valve mechanics and the spacing construction are engine work and
 * live in the validated package (`utils/production/engine/*`, vendored
 * from @petrolord/engines). What lives here is everything that needs
 * the well itself: the flowing traverse, the operating point, and the
 * unit and input plumbing between a studio form and an engine call.
 *
 * Three things this module adds over the NA3 gas-lift screening in
 * `utils/nodal/gasLift.js`:
 *
 *  1. **Injection at depth.** NA3 assumed the gas joins the stream at
 *     the node, so the whole string flowed at the lifted ratio. Here
 *     the string is marched in two segments, native gas-oil ratio below
 *     the injection point and the lifted ratio above it, which is what
 *     actually happens and is why injection depth is worth optimizing
 *     at all.
 *  2. **The point of injection.** The classic graphical construction:
 *     the flowing gradient drawn down from the wellhead against the
 *     real-gas injection line drawn down from the surface injection
 *     pressure, crossing at the deepest depth the available pressure
 *     can reach.
 *  3. **Depth optimization.** The operating rate solved at a ladder of
 *     candidate injection depths, so the gain from going deeper can be
 *     read against what the casing pressure would have to be.
 *
 * Pressures are psia inside the analytics and the engine; the studio
 * form works in psig, and the conversions are explicit at this boundary
 * (`psigToPsia` / `psiaToPsig`) rather than sprinkled through the UI.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { computeTraverse } from '../nodal/traverse.js';
import { solveNodeCore } from '../nodal/system.js';
import { pwfAtRate, rateAtPwf } from '../nodal/ipr.js';
import { linspace, num } from '../nodal/numerics.js';
import {
  designGasLift, deepestInjectionPoint, linearTemperature,
} from './engine/gasLiftDesign.js';
import { valveFamily } from './engine/gasLiftValveCatalog.js';

/** Standard atmosphere used across the studio, psi. */
export const ATM_PSIA = 14.7;

export const psigToPsia = (psig) => num(psig, NaN) + ATM_PSIA;
export const psiaToPsig = (psia) => num(psia, NaN) - ATM_PSIA;

/** Correlation-envelope cap on the lifted ratio, as in the NA3 screening. */
export const MAX_GOR_EFF = 50000;

/**
 * Lifted gas-oil ratio above the point of injection: the produced gas
 * plus the injected gas, per stock-tank barrel of oil.
 */
export const liftedGor = ({ gor, qgiMscfd, qo }) => {
  if (!(qo > 0)) return MAX_GOR_EFF;
  return Math.min((gor ?? 0) + (qgiMscfd * 1000) / qo, MAX_GOR_EFF);
};

/**
 * Measured depth at a true vertical depth on a trajectory. TVD is
 * monotone along MD for any physical well, so a linear scan with
 * interpolation is exact between stations. Depths past the bottom of
 * the trajectory clamp to the last station rather than extrapolating.
 */
export const mdAtTvd = (trajectory, tvdFt) => {
  const pts = trajectory?.points || [];
  if (pts.length === 0) return 0;
  if (!(tvdFt > 0)) return pts[0].md;
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i].tvd >= tvdFt) {
      const span = pts[i].tvd - pts[i - 1].tvd;
      if (!(span > 0)) return pts[i].md;
      const f = (tvdFt - pts[i - 1].tvd) / span;
      return pts[i - 1].md + f * (pts[i].md - pts[i - 1].md);
    }
  }
  return pts[pts.length - 1].md;
};

/**
 * Flowing traverse from the wellhead down, marched in two segments:
 * the lifted ratio above `injectionMd`, the native ratio below it.
 * With `injectionMd` at or above surface the whole string is lifted,
 * which is the line the injection-point construction is drawn from.
 *
 * Takes the same bundle the Nodal Studio passes its traverse calls, so
 * a well model built there works here unchanged: the stream can arrive
 * either flat (`qo`, `wct`, `gor`) or nested under `rates`.
 *
 * inputs: the nodal traverse bundle (fluidModel, trajectory, tAt, idIn,
 *   roughnessIn, correlation, stepFt) plus { whp, nodeMd, injectionMd,
 *   qo, wct, gor | rates, qgiMscfd }
 * returns { points, pwf, ok, warnings, gorLifted }
 */
export const liftedTraverse = ({
  fluidModel, trajectory, tAt, idIn, roughnessIn, correlation, stepFt = 100,
  whp, nodeMd, injectionMd, rates = {}, qgiMscfd = 0, ...stream
}) => {
  const qo = stream.qo ?? rates.qo;
  const wct = stream.wct ?? rates.wct ?? 0;
  const gor = stream.gor ?? rates.gor ?? 0;
  const base = { fluidModel, trajectory, tAt, idIn, roughnessIn, correlation, stepFt };
  const gorLifted = liftedGor({ gor, qgiMscfd, qo });
  const injMd = Math.min(Math.max(injectionMd ?? 0, 0), nodeMd);

  const upper = computeTraverse({
    ...base,
    rates: { qo, wct, gor: gorLifted },
    pStart: whp,
    mdStart: 0,
    mdEnd: injMd,
  });
  if (!upper.ok) {
    return { points: upper.points, pwf: upper.pEnd, ok: false, warnings: upper.warnings, gorLifted };
  }
  if (injMd >= nodeMd) {
    return { points: upper.points, pwf: upper.pEnd, ok: true, warnings: upper.warnings, gorLifted };
  }

  const lower = computeTraverse({
    ...base,
    rates: { qo, wct, gor },
    pStart: upper.pEnd,
    mdStart: injMd,
    mdEnd: nodeMd,
  });
  return {
    points: [...upper.points, ...lower.points.slice(1)],
    pwf: lower.pEnd,
    ok: lower.ok,
    warnings: [...upper.warnings, ...lower.warnings],
    gorLifted,
  };
};

/** Traverse points reduced to the (TVD, pressure) table the engine takes. */
export const traverseToTvdTable = (points = []) =>
  points.map((p) => ({ tvdFt: p.tvd, pPsia: p.p }));

/**
 * Operating point with gas injected at a given depth: the same node
 * solve the Nodal Studio uses, with the two-segment traverse as the
 * outflow.
 */
export const solveLiftedOperatingPoint = ({
  ipr, vlp, injectionMd, qgiMscfd, nGrid = 40,
}) => {
  const qMax = ipr.qmax ?? rateAtPwf(ipr, 0);
  const iprPwfAt = (q) => pwfAtRate(ipr, q);
  const vlpBhpAt = (q) => liftedTraverse({
    ...vlp,
    qo: Math.max(q, qMax * 1e-4),
    injectionMd,
    qgiMscfd,
  }).pwf;
  const solved = solveNodeCore({ iprPwfAt, vlpBhpAt, qMax, nGrid });
  return {
    q: solved.op ? solved.op.q : 0,
    pwf: solved.op ? solved.op.pwf : NaN,
    status: solved.status,
  };
};

/**
 * Gas-lift performance curve at a fixed injection depth: rate against
 * injection gas rate, with the maximum-rate point and the economic
 * point where the incremental response falls below `econSlope` stb per
 * Mscf. The curve rises while the added gas is lightening the column
 * and falls once its friction dominates, so both points matter.
 */
export const gasLiftPerformance = ({
  ipr, vlp, injectionMd, qgis, econSlope = 0.05, nGrid = 40,
}) => {
  const response = qgis.map((qgi) => ({
    qgi,
    ...solveLiftedOperatingPoint({ ipr, vlp, injectionMd, qgiMscfd: qgi, nGrid }),
  }));
  const baseline = response[0];
  let best = response[0];
  for (const pt of response) if (pt.q > best.q) best = pt;

  let econ = null;
  for (let i = 1; i < response.length; i += 1) {
    const dq = response[i].q - response[i - 1].q;
    const dqgi = response[i].qgi - response[i - 1].qgi;
    if (dqgi > 0 && dq / dqgi >= econSlope) econ = response[i];
    else break;
  }
  return { response, best, econ, baseline, injectionMd };
};

/**
 * Operating rate against injection depth at a fixed injection rate.
 * Deeper injection lifts more of the column and normally produces more,
 * with the gain flattening as the remaining column shortens; the curve
 * shows where paying for more casing pressure stops being worth it.
 */
export const injectionDepthSweep = ({
  ipr, vlp, depthsMd, qgiMscfd, nGrid = 40,
}) => {
  const points = depthsMd.map((md) => ({
    injectionMd: md,
    ...solveLiftedOperatingPoint({ ipr, vlp, injectionMd: md, qgiMscfd, nGrid }),
  }));
  let best = points[0] || null;
  for (const pt of points) if (best && pt.q > best.q) best = pt;
  return { points, best };
};

/**
 * The classic point-of-injection construction. `pSurfPsia` is the
 * operating surface injection pressure; the flowing gradient is the
 * fully lifted traverse from the wellhead, which is the line a designer
 * draws on the pressure-depth plot.
 */
export const injectionPointFromTraverse = ({
  traversePoints, pSurfPsia, gasSg, tempAtDepthF, dpTransferPsi, maxDepthFt,
}) => deepestInjectionPoint({
  prodTraverse: traverseToTvdTable(traversePoints),
  pSurfPsia,
  gasSg,
  tempAtDepthF,
  dpTransferPsi,
  maxDepthFt,
});

/**
 * Kill-fluid gradient from the unloading fluid density, psi/ft.
 * 0.052 psi/ft per ppg is the field constant (a 8.33 ppg water column
 * gives 0.433 psi/ft).
 */
export const killGradientFromPpg = (ppg) => 0.052 * num(ppg, 0);

const PSI_PER_PPG = 0.052;
export const ppgFromKillGradient = (grad) => num(grad, 0) / PSI_PER_PPG;

/**
 * Run the installation design from studio form values.
 *
 * `form` carries strings (the studio keeps its inputs as typed text);
 * every number is coerced here, and pressures named `...Psig` are
 * converted to the absolute pressures the engine works in. The result
 * carries both: `valves[].pInjAtDepthPsia` for anything numeric and
 * matching `...Psig` mirrors for display.
 *
 * returns { ok, errors, design } — design is the engine result with
 * gauge mirrors attached, or null when the inputs cannot support a run.
 */
export const runInstallationDesign = (form) => {
  const errors = [];
  const n = (key, label, { min = -Infinity, max = Infinity, required = true } = {}) => {
    const v = num(form[key], NaN);
    if (!Number.isFinite(v)) {
      if (required) errors.push(`${label} is required.`);
      return NaN;
    }
    if (v < min || v > max) errors.push(`${label} is outside the range this design can use.`);
    return v;
  };

  const kickoffPsig = n('kickoffPsig', 'Kickoff injection pressure', { min: 0 });
  const operatingRaw = num(form.operatingPsig, NaN);
  const whUnloadPsig = n('whUnloadPsig', 'Unloading wellhead pressure', { min: 0 });
  const gasSg = n('injGasSg', 'Injection gas gravity', { min: 0.5, max: 1.2 });
  const maxDepthFt = n('packerDepthFt', 'Packer or perforation depth', { min: 1 });
  const whtF = n('whtF', 'Wellhead temperature', { min: -50, max: 400 });
  const bhtF = n('bhtF', 'Bottomhole temperature', { min: -50, max: 500 });
  const killGrad = n('killGradPsiPerFt', 'Kill fluid gradient', { min: 0.05, max: 1.5 });
  const unloadGrad = n('unloadGradPsiPerFt', 'Unloading gradient', { min: 0, max: 1.5 });
  const dpTransfer = n('dpTransferPsi', 'Transfer differential', { min: 0, max: 500 });
  const dpPerValve = n('dpPerValvePsi', 'Pressure drop per valve', { min: 0, max: 200 });
  const minSpacing = n('minSpacingFt', 'Minimum valve spacing', { min: 20 });
  const maxValves = n('maxValves', 'Maximum valve count', { min: 1, max: 30 });
  const qgiTarget = n('targetQgiMscfd', 'Target injection rate', { min: 1 });

  if (Number.isFinite(kickoffPsig) && Number.isFinite(whUnloadPsig)
      && kickoffPsig <= whUnloadPsig) {
    errors.push('The kickoff injection pressure must exceed the unloading wellhead pressure.');
  }
  if (errors.length) return { ok: false, errors, design: null };

  const family = valveFamily(form.valveFamilyId);
  const tempAtDepthF = linearTemperature({ whtF, bhtF, refDepthFt: maxDepthFt });
  const targetDepthFt = num(form.targetDepthFt, NaN);

  const design = designGasLift({
    pKickoffPsia: psigToPsia(kickoffPsig),
    pOperatingPsia: psigToPsia(Number.isFinite(operatingRaw) ? operatingRaw : kickoffPsig - 100),
    method: form.method === 'constantPressure' ? 'constantPressure' : 'surfaceClose',
    dpPerValvePsi: dpPerValve,
    dpTransferPsi: dpTransfer,
    killGradPsiPerFt: killGrad,
    unloadGradPsiPerFt: unloadGrad,
    pWhUnloadPsia: psigToPsia(whUnloadPsig),
    gasSg,
    tempAtDepthF,
    maxDepthFt,
    targetDepthFt: Number.isFinite(targetDepthFt) && targetDepthFt > 0 ? targetDepthFt : undefined,
    minSpacingFt: minSpacing,
    maxValves: Math.round(maxValves),
    valveType: form.valveType === 'PPO' ? 'PPO' : 'IPO',
    bellowsAreaIn2: family.bellowsAreaIn2,
    ports: family.ports,
    qgiTargetMscfd: qgiTarget,
    bottomOrifice: form.bottomOrifice !== false,
    orificeIdIn: num(form.orificeIdIn, family.ports[0].idIn),
  });

  return {
    ok: true,
    errors: [],
    design: {
      ...design,
      family,
      tempAtDepthF,
      valves: design.valves.map((v) => ({
        ...v,
        pInjAtDepthPsig: psiaToPsig(v.pInjAtDepthPsia),
        pProdAtDepthPsig: psiaToPsig(v.pProdAtDepthPsia),
        pSurfOpenPsig: psiaToPsig(v.pSurfOpenPsia),
        domeAtTempPsig: v.domeAtTempPsia === null ? null : psiaToPsig(v.domeAtTempPsia),
        dome60Psig: v.dome60Psia === null ? null : psiaToPsig(v.dome60Psia),
        testRackOpeningPsig: v.testRackOpeningPsia === null ? null : psiaToPsig(v.testRackOpeningPsia),
        closingSurfacePressurePsig: v.closingSurfacePressurePsia === null
          ? null : psiaToPsig(v.closingSurfacePressurePsia),
      })),
      unloading: design.unloading.map((s) => ({
        ...s,
        surfaceInjectionPsig: psiaToPsig(s.surfaceInjectionPsia),
        injectionAtDepthPsig: psiaToPsig(s.injectionAtDepthPsia),
        productionAtDepthPsig: psiaToPsig(s.productionAtDepthPsia),
      })),
      pOperatingPsig: psiaToPsig(design.pOperatingPsia),
    },
  };
};

/**
 * A valve sheet row set, ready for a table or a CSV: one row per valve
 * with the numbers a shop needs to set it and a field hand needs to run
 * it.
 */
export const valveSheetRows = (design) => (design?.valves || []).map((v, i) => ({
  valve: i + 1,
  depthFt: v.depthFt,
  tempF: v.tempF,
  type: v.valveType,
  portIn: v.portIdIn,
  r: v.r,
  injectionPsig: v.pInjAtDepthPsig,
  productionPsig: v.pProdAtDepthPsig,
  domeAtTempPsig: v.domeAtTempPsig,
  testRackPsig: v.testRackOpeningPsig,
  spreadPsi: v.spreadPsi,
  closingSurfacePsig: v.closingSurfacePressurePsig,
  gasRateMscfd: v.throughputMscfd,
  passesTarget: v.passesTarget,
}));

/**
 * Legacy import: the Artificial Lift Designer's gas-lift tab was
 * screening-grade and was removed at P0, but its saved inputs were kept
 * (`design_data.gasLiftInputs`) precisely so a real studio could pick
 * them up. Only the fields that mean the same thing in this design are
 * carried; nothing is invented to fill the rest, and what could not be
 * mapped is reported so the user knows what still needs entering.
 */
export const importLegacyGasLiftInputs = (legacy) => {
  if (!legacy || typeof legacy !== 'object') return { patch: {}, mapped: [], unmapped: [] };
  const patch = {};
  const mapped = [];
  const take = (from, to, label, transform = (v) => v) => {
    const v = num(legacy[from], NaN);
    if (Number.isFinite(v)) {
      patch[to] = String(transform(v));
      mapped.push(label);
    }
  };

  take('wellDepth', 'packerDepthFt', 'Well depth');
  take('tubingID', 'tubingIdIn', 'Tubing ID');
  take('whp', 'whpPsig', 'Wellhead pressure');
  take('liquidRate', 'designRateStbd', 'Liquid rate');
  take('waterCut', 'wctPct', 'Water cut');
  take('gor', 'gorScfStb', 'Producing gas-oil ratio');
  take('oilApi', 'api', 'Oil API');
  take('gasGravity', 'gasSg', 'Produced gas gravity');
  take('waterSalinity', 'salinityPpm', 'Water salinity');
  take('wellheadTemp', 'whtF', 'Wellhead temperature');
  take('bottomholeTemp', 'bhtF', 'Bottomhole temperature');
  take('surfaceInjectionPressure', 'kickoffPsig', 'Surface injection pressure');
  take('injectionGasGravity', 'injGasSg', 'Injection gas gravity');
  take('bhp', 'prPsia', 'Bottomhole pressure');

  const unmapped = [];
  if (Number.isFinite(num(legacy.valveSpacingSafetyFactor, NaN))) {
    unmapped.push(
      'Valve spacing safety factor: this design uses an explicit transfer differential and a pressure drop per valve instead, so the old single factor is not carried over.',
    );
  }
  return { patch, mapped, unmapped };
};

/** Injection rate ladder for a performance sweep. */
export const injectionRateLadder = ({ maxQgiMscfd, nPoints = 9 }) =>
  linspace(0, Math.max(num(maxQgiMscfd, 0), 0), Math.max(2, Math.round(num(nPoints, 9))));
