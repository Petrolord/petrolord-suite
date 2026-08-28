// Production engine hard validation gate (Production Operations
// program, Production-ROADMAP.md §4). Mirrors
// tools/validation/drilling-validation.ts: every ACTIVE gate must pass
// or the process exits 1. Gates whose published source data the owner
// has not yet supplied are ARMED (schema + tolerance committed,
// reported as pending, never silently passed).
//
// Run:  npx tsx tools/validation/production-validation.ts
//
// ACTIVE gates (self-contained truth: closed forms the physics must
// satisfy, plus the independent stdlib oracle
// packages/engines/tools/validation/production/oracle_gaslift.py and
// its committed goldens):
//   PA1 gas properties: the DAK root satisfies the DAK equation, z goes
//       to 1 in the ideal-gas limit, Wichert-Aziz moves the
//       pseudo-criticals the right way, and z and gradient match the
//       oracle (gaslift_cases.json)
//   PA2 static injection-gas column: an isothermal ideal-gas column
//       reproduces the exponential closed form built from the module's
//       own constants; the marched column matches the oracle's RK4
//       integration; column and inverse round-trip
//   PA3 nitrogen dome charge: the fixed-volume real-gas ratio
//       round-trips between the 60 degF test rack and valve
//       temperature, matches the oracle, and Ct falls monotonically
//       with temperature
//   PA4 valve force balance: IPO and PPO are the same relation with the
//       sides swapped, the dome and test-rack inverses round-trip, and
//       spread agrees in both algebraic forms
//   PA5 Thornhill-Craver throughput: continuity across the critical
//       ratio, exact port-area scaling, oracle agreement, and
//       cross-implementation agreement with the VALIDATED nodal gas
//       choke (src/utils/nodal/chokes.js) which reaches the same
//       physics through separately rounded published constants
//   PA6 valve spacing and settings: three complete designs against the
//       oracle (depths, ports, dome and test-rack pressures, closing
//       pressures, throughput), and the multipointing rule
//   PA7 deepest point of injection: the crossing against the oracle and
//       the pressure identity that defines it
//   PA8 Suite layer: injection at depth lowers the bottomhole pressure
//       and raises the rate on a real nodal well, and the studio's
//       psig/psia boundary round-trips
//   PA9 ESP stage curves: a polynomial is recovered from its own
//       samples, a vendor fit matches the oracle QR solve, the
//       reference MODEL passes through the parameters it was built
//       from, and a curve with too few points is refused
//   PA10 affinity laws: head as speed squared, power as speed cubed,
//       efficiency unchanged, and the whole oracle table
//   PA11 intake stream and gas handling against the oracle, including
//       the density of what the pump swallows once gas is vented
//   PA12 total dynamic head and staging: the pressure identity, the
//       oracle designs, the net-lift regression against the
//       predecessor app's missing lift term, and the refusal to stage
//       a duty off the end of the curve
//   PA13 electrical: copper resistance with temperature, three-phase
//       drop against the oracle, and cable selection returning nothing
//       rather than the least bad cable
//   PA14 ESP Suite layer on a real nodal well: the head decomposition
//       sums exactly, a deeper pump costs head rather than saving it,
//       the operating point brackets the pump against the system curve,
//       and a naturally flowing well is refused rather than staged
//   PA15 rod string mechanics: a fraction is read as a fraction (the
//       predecessor's 7/8 became 7.8 in), Archimedes buoyancy with no
//       invented factor in it, compliances that sum, and the published
//       rod weights all a consistent coupling allowance above bare steel
//   PA16 the natural frequency constant DERIVED: bare-steel wave speed
//       from E and rho, slowed by the square root of the coupling
//       allowance, landing N0 on 245,000/L; and a tapered string solved
//       as an eigenvalue rather than read off a factor table
//   PA17 the damped wave equation reduces to the static limit as the
//       unit slows: Sp -> S - Fo/kr, PPRL -> Wrf + Fo, MPRL -> Wrf. Any
//       error in the boundary conditions, the valve transfer states or
//       the march shows up here. An undamped string is refused
//   PA18 predict and diagnose are two solvers sharing no code path: a
//       predicted card handed to the Gibbs harmonic diagnostic returns
//       the pump card the prediction assumed
//   PA19 the pumping unit: the torque factor IS ds/dtheta, proved by
//       the energy identity that torque through a revolution equals the
//       area of the dynamometer card; and a conventional linkage is not
//       a sine wave
//   PA20 rod pump Suite layer on a real nodal well: the fluid load is
//       the differential across the plunger with tubing pressure ADDED,
//       production follows the plunger stroke rather than the polished
//       rod stroke, and a string that does not reach its pump is refused
//   PA21 the SHARED per-well model (P6.5): one description builds one
//       nodal bundle whichever studio asked for it, the record holds no
//       duty, an inflow that never calibrated is refused instead of
//       producing NaN, and a well test cross-checks against its own
//       well through the nodal solution -- the check P3 deferred for
//       want of exactly this record
//   PA22 gas wells (P7): the Turner constant DERIVED from the droplet
//       balance rather than quoted, Turner and Coleman as one equation
//       and one factor, the critical rate profile whose CONTROLLING
//       station is the shoe and not the wellhead, and the loading
//       forecast that finds the reservoir pressure at which a well
//       starts to load
//   PA23 plunger lift: the static force balance term by term, and a
//       feasibility verdict that rests on the COMPUTED gas-liquid ratio
//       while reporting the screening rule of thumb beside it
//   PA24 the choke as a nodal CONSTRAINT (P8): a bean size becomes a
//       rate on a real well, the operating point sits on both the
//       choke and the inflow, rate rises with bean size, and the bean
//       at which the flow stops being critical is found rather than
//       assumed. Plus the RP 14E erosional limit with C as an input,
//       and a Gilbert-family fit that recovers the coefficients it was
//       generated from and refuses data that cannot pin them down
//
// ARMED gates (pending owner literature PDFs):
//   PL1 Takacs, Gas Lift Manual — worked continuous-lift installation
//       design (valve depths, dome charges, test-rack settings)
//   PL2 API Gas Lift Manual Book 6 nitrogen temperature-correction (Ct)
//       table, or the NIST nitrogen isotherm z values, against
//       gasProperties.nitrogenZ over the dome window
//   PL3 Guo & Ghalambor / Brown worked gas-lift example (point of
//       injection and the performance curve)
//   PL4 vendor valve data book: published bellows areas and R per port,
//       spot-checking the generic geometry in
//       engines/production/data/gasLiftValveCatalog.js
//   PL5 Hydraulic Institute ANSI/HI 9.6.7 viscous performance
//       correction (or the Turzo et al. SPE 57722 digitisation of the
//       same chart) against espPump.viscosityCheck: the engine
//       deliberately applies no correction it cannot source
//   PL6 Turpin / Alhanati (SPE 28526) gas-handling criteria against the
//       gas volume fraction verdicts, which currently use configurable
//       operating guidance rather than a published correlation
//   PL7 vendor pump catalog: published stage curves spot-checking the
//       reference MODELS in engines/production/data/espCatalog.js
//   PL8 Takacs, Electrical Submersible Pumps Manual worked design
//       example (intake conditions through stages and motor loading)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dirname = path.dirname(fileURLToPath(import.meta.url));
const goldens = (name: string) => JSON.parse(fs.readFileSync(
  path.join(dirname, '..', '..', 'packages', 'engines', 'test-data', 'production', 'goldens', name), 'utf8',
));

async function main() {
  const {
    dakZ, naturalGasZ, nitrogenZ, gasGradient, gasColumnPressure,
    gasColumnSurfacePressure, suttonPseudoCriticals, wichertAziz,
    AIR_MW, R_UNIVERSAL, toRankine,
  } = await import('../../packages/engines/engines/production/gasProperties.js');
  const {
    portToBellowsRatio, domePressureAtTemp, domePressureAt60,
    temperatureCorrectionFactor, ipoOpeningPressure, ipoDomeFromOpening,
    ppoOpeningPressure, testRackOpening, domeFromTestRack, valveSpread,
    thornhillCraver, criticalPressureRatio, TC_DISCHARGE_COEFF,
  } = await import('../../packages/engines/engines/production/gasLiftValves.js');
  const {
    linearTemperature, spaceValves, designGasLift, deepestInjectionPoint,
  } = await import('../../packages/engines/engines/production/gasLiftDesign.js');
  const {
    polyFit, polyEval, fitStageCurve, referenceStageCurve, stagePerformance,
    HP_HEAD_DIVISOR,
  } = await import('../../packages/engines/engines/production/espPump.js');
  const {
    intakeStream, gasHandling, totalDynamicHead, tdhBreakdown, sizePump,
    intakePressure, gradientFromDensity, PSI_PER_FT_SG,
  } = await import('../../packages/engines/engines/production/espDesign.js');
  const { conductorResistance, surfaceRequirement, selectCable, COPPER_REF_TEMP_F } = await import(
    '../../packages/engines/engines/production/espMotorCable.js');
  const { CABLE_SIZES, REFERENCE_STAGES } = await import(
    '../../packages/engines/engines/production/data/espCatalog.js');
  const { gasChokeRate } = await import('../../src/utils/nodal/chokes.js');
  const { computeIpr } = await import('../../src/utils/nodal/ipr.js');
  const { buildFluidModel } = await import('../../src/utils/nodal/pvt.js');
  const { buildTrajectory } = await import('../../src/utils/nodal/trajectory.js');
  const { linearGeothermal } = await import('../../src/utils/nodal/temperature.js');
  const { liftedTraverse, solveLiftedOperatingPoint, psigToPsia, psiaToPsig } = await import(
    '../../src/utils/production/gasLift.js');
  const { dutyAtRate, runEspDesign, buildStageCurve, solveEspOperatingPoint } = await import(
    '../../src/utils/production/esp.js');
  const {
    ROD_SIZES, COUPLING_ALLOWANCE, parseRodSize, rodArea, bareRodWeightLbPerFt,
    steelAcousticVelocityFtS, ROD_ACOUSTIC_VELOCITY_FT_S,
  } = await import('../../packages/engines/engines/production/data/rodCatalog.js');
  const { buildRodString, buoyancyFactor, naturalFrequency, sectionWaveSpeedFtS } = await import(
    '../../packages/engines/engines/production/rodString.js');
  const { predictCard, diagnoseCard } = await import(
    '../../packages/engines/engines/production/rodDynamics.js');
  const {
    genericConventionalGeometry, unitKinematics, surfacePositionFn,
    simpleHarmonicPosition, netTorque,
  } = await import('../../packages/engines/engines/production/pumpingUnit.js');
  const {
    runDesign: runRodDesign, fluidLoadLb: rodFluidLoad, displacementBpd,
  } = await import('../../src/utils/production/rodPump.js');
  const {
    defaultWellInputs, buildWellModel: buildSharedWell, wellInputsFrom,
    toWellModelPayload, fromWellModelPayload, wellModelProblems,
  } = await import('../../src/utils/production/wellModel.js');
  const { crossCheckTestsAgainstNodal } = await import('../../src/utils/production/allocation.js');
  const {
    terminalDropletVelocity, criticalVelocity, loadingProfile, rateAtVelocity,
    tubingAreaFt2, gasDensityLbFt3, RATE_CONSTANT_MSCFD, recommendCorrelation,
  } = await import('../../packages/engines/engines/production/gasWellLoading.js');
  const { liftPressure, screenPlungerLift, maxSlugLengthFt } = await import(
    '../../packages/engines/engines/production/plungerLift.js');
  const { runGasWellAnalysis, loadingForecast } = await import(
    '../../src/utils/production/gasWell.js');
  const {
    erosionalCheck, erosionalRateBpd, fitGilbertCoefficients: fitChoke, erosionalC,
  } = await import('../../packages/engines/engines/production/chokePerformance.js');
  const {
    solveChokedOil, operatingEnvelope, criticalBeanLimit, runChokeAnalysis,
    beanForRate, testsToChokePoints, CRITICAL_RATIO_LIMIT,
  } = await import('../../src/utils/production/choke.js');
  const { CHOKE_COEFFS } = await import('../../src/utils/nodal/chokes.js');
  const { solveOperatingPoint } = await import('../../src/utils/nodal/system.js');

  const G = goldens('gaslift_cases.json');
  const E = goldens('esp_cases.json');

  let failures = 0;
  const gate = (id: string, name: string, fn: () => void) => {
    try {
      fn();
      console.log(`PASS  ${id}  ${name}`);
    } catch (e: any) {
      failures += 1;
      console.error(`FAIL  ${id}  ${name}: ${e.message}`);
    }
  };
  const close = (a: number, b: number, tol: number, what: string) => {
    if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} vs ${b} (tol ${tol})`);
  };
  const relClose = (a: number, b: number, rtol: number, what: string) => {
    const tol = rtol * Math.max(Math.abs(b), 1e-12);
    if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} vs ${b} (rtol ${rtol})`);
  };
  const tempFn = (wht: number, bht: number, ref: number) =>
    linearTemperature({ whtF: wht, bhtF: bht, refDepthFt: ref });

  gate('PA1', 'gas properties: DAK closure, ideal-gas limit, oracle agreement', () => {
    for (const [ppr, tpr] of [[1.5, 1.6], [3, 2.2], [6, 1.4], [0.5, 3]]) {
      const { z, rhoR, converged } = dakZ({ ppr, tpr });
      if (!converged) throw new Error(`DAK did not converge at ppr ${ppr}, tpr ${tpr}`);
      relClose(rhoR, (0.27 * ppr) / (z * tpr), 1e-9, `DAK reduced-density closure at ppr ${ppr}`);
    }
    close(naturalGasZ({ pPsia: 1e-6, tF: 150, gasSg: 0.65 }), 1, 1e-8, 'ideal-gas limit');
    const base = suttonPseudoCriticals(0.75);
    const sour = wichertAziz({ ...base, yCo2: 0.08, yH2s: 0.04 });
    if (!(sour.tpcR < base.tpcR)) throw new Error('Wichert-Aziz raised the pseudo-critical temperature');
    for (const c of G.gasProperties) {
      relClose(naturalGasZ({ pPsia: c.pPsia, tF: c.tF, gasSg: c.gasSg }), c.z, 1e-8, 'z vs oracle');
      relClose(gasGradient({ pPsia: c.pPsia, tF: c.tF, gasSg: c.gasSg }), c.gradPsiPerFt, 1e-9,
        'gradient vs oracle');
    }
    for (const c of G.gasPropertiesAcid) {
      relClose(naturalGasZ({
        pPsia: c.pPsia, tF: c.tF, gasSg: c.gasSg, yCo2: c.yCo2, yH2s: c.yH2s,
      }), c.z, 1e-8, 'sour z vs oracle');
    }
  });

  gate('PA2', 'static injection column: closed form, oracle RK4, inverse', () => {
    const march = gasColumnPressure({
      pSurfPsia: 1000, tvdFt: 8000, gasSg: 0.65, tempAtDepthF: () => 140,
      steps: 400, zOverride: 1,
    }).pBottomPsia;
    const exact = 1000 * Math.exp((AIR_MW * 0.65 * 8000) / (144 * R_UNIVERSAL * toRankine(140)));
    relClose(march, exact, 1e-8, 'isothermal ideal-gas column vs the exponential');
    for (const c of G.columns) {
      const temp = tempFn(c.whtF, c.bhtF, c.tvdFt);
      relClose(gasColumnPressure({
        pSurfPsia: c.pSurfPsia, tvdFt: c.tvdFt, gasSg: c.gasSg, tempAtDepthF: temp,
      }).pBottomPsia, c.pBottomPsia, 1e-6, 'column vs oracle');
      relClose(gasColumnSurfacePressure({
        pAtDepthPsia: c.pBottomPsia, tvdFt: c.tvdFt, gasSg: c.gasSg, tempAtDepthF: temp,
      }), c.pSurfPsia, 1e-6, 'column inverse');
    }
  });

  gate('PA3', 'nitrogen dome charge: round trip, oracle, Ct monotonicity', () => {
    for (const c of G.nitrogen) {
      const pdT = domePressureAtTemp({ pd60Psia: c.pd60Psia, tF: c.tF });
      relClose(pdT, c.domeAtTempPsia, 1e-8, 'dome at valve temperature vs oracle');
      relClose(domePressureAt60({ pdTPsia: pdT, tF: c.tF }), c.pd60Psia, 1e-9, 'dome round trip');
      relClose(temperatureCorrectionFactor({ pdTPsia: pdT, tF: c.tF }), c.ct, 1e-8, 'Ct vs oracle');
    }
    const cts = [80, 140, 200, 260].map((tF) =>
      temperatureCorrectionFactor({ pdTPsia: domePressureAtTemp({ pd60Psia: 800, tF }), tF }));
    for (let i = 1; i < cts.length; i += 1) {
      if (!(cts[i] < cts[i - 1])) throw new Error('Ct did not fall with temperature');
    }
    relClose(domePressureAtTemp({ pd60Psia: 800, tF: 60 }), 800, 1e-9, 'dome at the test rack');
  });

  gate('PA4', 'valve force balance: IPO/PPO symmetry, inverses, spread identities', () => {
    const r = portToBellowsRatio({ portIdIn: 0.25, bellowsAreaIn2: 0.77 });
    close(r, 0.0637, 5e-4, 'published R for a 1/4 in port in a 1.5 in valve');
    close(portToBellowsRatio({ portIdIn: 0.125, bellowsAreaIn2: 0.31 }), 0.0396, 5e-4,
      'published R for a 1/8 in port in a 1 in valve');
    const pdT = 1000;
    const pt = 400;
    const pco = ipoOpeningPressure({ pdTPsia: pdT, ptPsia: pt, r });
    relClose(ipoDomeFromOpening({ pcoPsia: pco, ptPsia: pt, r }), pdT, 1e-12, 'IPO dome inverse');
    relClose(ppoOpeningPressure({ pdTPsia: pdT, pcPsia: pt, r }), pco, 1e-12, 'PPO symmetry');
    const tro = testRackOpening({ pd60Psia: 800, r });
    relClose(domeFromTestRack({ troPsia: tro, r }), 800, 1e-12, 'test-rack inverse');
    relClose(valveSpread({ pOpenPsia: pco, pOtherSidePsia: pt, r }), pco - pdT, 1e-12,
      'spread as opening minus closing');
    relClose((r / (1 - r)) * (pdT - pt), pco - pdT, 1e-12, 'spread in its dome form');
  });

  gate('PA5', 'Thornhill-Craver: branch continuity, area scaling, oracle, nodal cross-check', () => {
    const k = 1.27;
    const rc = criticalPressureRatio(k);
    const base = { pUpPsia: 1000, portIdIn: 0.25, gasSg: 0.65, tF: 140, k };
    relClose(thornhillCraver({ ...base, pDnPsia: 1000 * (rc + 1e-9) }).qMscfd,
      thornhillCraver({ ...base, pDnPsia: 1000 * rc }).qMscfd, 1e-6, 'critical-branch continuity');
    const q1 = thornhillCraver({ ...base, pDnPsia: 400 }).qMscfd;
    const q2 = thornhillCraver({ ...base, pDnPsia: 400, portIdIn: 0.5 }).qMscfd;
    relClose(q2 / q1, 4, 1e-12, 'port-area scaling');
    for (const c of G.thornhillCraver) {
      relClose(thornhillCraver({
        pUpPsia: c.pUpPsia, pDnPsia: c.pDnPsia, portIdIn: c.portIdIn, gasSg: c.gasSg, tF: c.tF,
      }).qMscfd, c.qMscfd, 1e-10, 'throughput vs oracle');
    }
    // Cross-implementation: the nodal gas choke reaches the same orifice
    // physics through separately rounded published constants (1248 in the
    // subcritical branch against 155.5*sqrt(2g) here, and 879 against
    // 1248/sqrt(2) in the sonic branch). Agreement to those rounding
    // differences is the check; anything larger is a real disagreement.
    const sub = thornhillCraver({ pUpPsia: 1000, pDnPsia: 900, portIdIn: 0.25, gasSg: 0.65, tF: 140, k, cd: 0.865 });
    const subNodal = gasChokeRate({ pUp: 1000, pDn: 900, dIn: 0.25, gasSg: 0.65, tUpF: 140, k, cd: 0.865 });
    relClose(sub.qMscfd, subNodal.qMscfd, 1e-3, 'subcritical branch vs the nodal gas choke');
    const crit = thornhillCraver({ pUpPsia: 1000, pDnPsia: 300, portIdIn: 0.25, gasSg: 0.65, tF: 140, k, cd: 0.865 });
    const critNodal = gasChokeRate({ pUp: 1000, pDn: 300, dIn: 0.25, gasSg: 0.65, tUpF: 140, k, cd: 0.865 });
    relClose(crit.qMscfd, critNodal.qMscfd, 6e-3, 'critical branch vs the nodal gas choke');
  });

  gate('PA6', 'valve spacing and settings vs the oracle, and the multipointing rule', () => {
    for (const d of G.designs) {
      const cfg = {
        ...d.inputs,
        tempAtDepthF: tempFn(d.inputs.wht, d.inputs.bht, d.inputs.refDepth),
        ports: d.inputs.ports.map((idIn: number) => ({ idIn, label: `${idIn}` })),
      };
      const spacing = spaceValves(cfg);
      if (spacing.stopReason !== d.stopReason) {
        throw new Error(`${d.id}: stop reason ${spacing.stopReason} vs ${d.stopReason}`);
      }
      if (spacing.depths.length !== d.depths.length) {
        throw new Error(`${d.id}: ${spacing.depths.length} valves vs ${d.depths.length}`);
      }
      spacing.depths.forEach((depth: number, i: number) =>
        close(depth, d.depths[i], 0.05, `${d.id} valve ${i + 1} depth`));
      const design = designGasLift(cfg);
      design.valves.forEach((v: any, i: number) => {
        const e = d.valves[i];
        if (v.valveType !== e.valveType) throw new Error(`${d.id} valve ${i + 1} type`);
        relClose(v.throughputMscfd, e.throughputMscfd, 1e-5, `${d.id} valve ${i + 1} throughput`);
        if (e.domeAtTempPsia !== null) {
          relClose(v.domeAtTempPsia, e.domeAtTempPsia, 1e-5, `${d.id} valve ${i + 1} dome`);
          relClose(v.testRackOpeningPsia, e.testRackOpeningPsia, 1e-5, `${d.id} valve ${i + 1} TRO`);
          relClose(v.closingSurfacePressurePsia, e.closingSurfacePressurePsia, 1e-5,
            `${d.id} valve ${i + 1} closing pressure`);
        }
      });
    }
    const first = G.designs[0];
    const cfg = {
      ...first.inputs,
      tempAtDepthF: tempFn(first.inputs.wht, first.inputs.bht, first.inputs.refDepth),
      ports: first.inputs.ports.map((idIn: number) => ({ idIn, label: `${idIn}` })),
    };
    const tight = designGasLift({ ...cfg, dpPerValvePsi: 10 });
    const wide = designGasLift({ ...cfg, dpPerValvePsi: 90 });
    if (!tight.unloading.some((s: any) => s.multipointing)) {
      throw new Error('a decrement below the valve spread was not flagged as multipointing');
    }
    if (wide.unloading.some((s: any) => s.multipointing)) {
      throw new Error('a decrement above the valve spread was wrongly flagged');
    }
  });

  gate('PA7', 'deepest point of injection: oracle crossing and its defining identity', () => {
    const gi = G.injectionPoint;
    const temp = tempFn(gi.whtF, gi.bhtF, gi.refDepthFt);
    const hit = deepestInjectionPoint({
      prodTraverse: gi.traverse, pSurfPsia: gi.pSurfPsia, gasSg: gi.gasSg,
      tempAtDepthF: temp, dpTransferPsi: gi.dpTransferPsi, maxDepthFt: gi.maxDepthFt,
    });
    if (hit.limitedBy !== gi.expected.limitedBy) throw new Error('crossing limit reason');
    close(hit.depthFt, gi.expected.depthFt, 0.05, 'injection depth vs oracle');
    close(hit.pInjPsia - gi.dpTransferPsi, hit.pProdPsia, 0.5, 'crossing identity');
    const deeper = deepestInjectionPoint({
      prodTraverse: gi.traverse, pSurfPsia: gi.pSurfPsia + 200, gasSg: gi.gasSg,
      tempAtDepthF: temp, dpTransferPsi: gi.dpTransferPsi, maxDepthFt: gi.maxDepthFt,
    });
    if (!(deeper.depthFt > hit.depthFt)) throw new Error('more casing pressure did not reach deeper');
  });

  gate('PA8', 'Suite layer: injection at depth on a real nodal well, and the psig boundary', () => {
    const depth = 7000;
    const vlp = {
      fluidModel: buildFluidModel({ api: 32, gasSg: 0.75, gor: 150, salinityPpm: 30000 }),
      trajectory: buildTrajectory({ mode: 'vertical', depthFt: depth }),
      tAt: linearGeothermal({ whtF: 100, bhtF: 170, tvdMaxFt: depth }),
      idIn: 2.441,
      correlation: 'beggsBrill',
      whp: 150,
      nodeMd: depth,
      stepFt: 250,
      rates: { wct: 0.7, gor: 150 },
    };
    const ipr = computeIpr({ model: 'composite', pr: 2600, pb: 1800, pi: 2.5 });
    const deep = liftedTraverse({ ...vlp, qo: 400, injectionMd: 6000, qgiMscfd: 600 });
    const shallow = liftedTraverse({ ...vlp, qo: 400, injectionMd: 2000, qgiMscfd: 600 });
    if (!(deep.pwf < shallow.pwf)) throw new Error('deeper injection did not lower the bottomhole pressure');
    const dead = solveLiftedOperatingPoint({ ipr, vlp, injectionMd: 6000, qgiMscfd: 0, nGrid: 20 });
    const alive = solveLiftedOperatingPoint({ ipr, vlp, injectionMd: 6000, qgiMscfd: 800, nGrid: 20 });
    if (!(dead.q === 0 && alive.q > 300)) throw new Error('the gas-lift response is not there');
    relClose(psiaToPsig(psigToPsia(875)), 875, 1e-12, 'psig round trip');
  });

  gate('PA9', 'ESP stage curves: recovery, vendor fit vs oracle, model parameters, refusals', () => {
    const truth = (x: number) => 30 - 1e-3 * x + 2e-7 * x * x - 4e-11 * x * x * x;
    const xs = [1000, 1500, 2000, 2500, 3000, 3500];
    const fit = polyFit(xs, xs.map(truth), 3);
    xs.forEach((x) => relClose(polyEval(fit, x), truth(x), 1e-8, 'polynomial recovery'));

    const curve = fitStageCurve({ points: E.vendorCurve.points });
    if (!curve.ok) throw new Error('the vendor curve did not fit');
    for (let q = curve.qMin; q <= curve.qMax; q += 100) {
      let py = 0;
      const t = q / E.vendorCurve.headScale;
      for (let k = E.vendorCurve.headCoeffs.length - 1; k >= 0; k -= 1) {
        py = py * t + E.vendorCurve.headCoeffs[k];
      }
      relClose(polyEval(curve.headFit, q), py, 1e-9, `vendor head at ${q} bbl/d`);
    }
    relClose(curve.bep.qBpd, E.vendorCurve.bep.qBpd, 1e-9, 'vendor BEP rate');

    E.referenceCurves.forEach((g: any) => {
      const c = referenceStageCurve(g.spec);
      if (c.source !== 'reference-model') throw new Error('a model stage is not labelled as one');
      relClose(polyEval(c.headFit, g.spec.bepBpd), g.spec.bepHeadFt, 1e-9, `${g.id} head at BEP`);
      g.samples.forEach((sm: any) =>
        relClose(polyEval(c.headFit, sm.qBpd), sm.headFt, 1e-8, `${g.id} sample`));
    });
    REFERENCE_STAGES.forEach((s2: any) => {
      if (!/^Reference stage/.test(s2.label)) throw new Error('a catalog stage reads as a vendor pump');
    });
    const short = fitStageCurve({ points: [{ qBpd: 1000, headFt: 30 }, { qBpd: 2000, headFt: 25 }] });
    if (short.ok) throw new Error('a two-point curve was fitted instead of refused');
  });

  gate('PA10', 'affinity laws: speed scaling identities and the oracle table', () => {
    const curve = fitStageCurve({ points: E.vendorCurve.points });
    const at60 = stagePerformance({ curve, qBpd: 2500, hz: 60, specificGravity: 0.9 });
    const at50 = stagePerformance({ curve, qBpd: 2500 * (50 / 60), hz: 50, specificGravity: 0.9 });
    relClose(at50.headFt, at60.headFt * (50 / 60) ** 2, 1e-9, 'head as speed squared');
    relClose(at50.bhpPerStage, at60.bhpPerStage * (50 / 60) ** 3, 1e-9, 'power as speed cubed');
    relClose(at50.efficiency, at60.efficiency, 1e-12, 'efficiency unchanged by speed');
    E.affinity.forEach((g: any) => {
      const s2 = stagePerformance({ curve, qBpd: g.qBpd, hz: g.hz, specificGravity: g.sg });
      relClose(s2.headFt, g.headFt, 1e-8, `head at ${g.qBpd} bbl/d, ${g.hz} Hz`);
      relClose(s2.bhpPerStage, g.bhpPerStage, 1e-8, `power at ${g.qBpd} bbl/d, ${g.hz} Hz`);
      if (s2.region !== g.region) throw new Error(`region at ${g.qBpd} bbl/d, ${g.hz} Hz`);
    });
  });

  gate('PA11', 'intake stream, gas split and the density the pump actually sees', () => {
    E.designs.forEach((g: any) => {
      const stream = intakeStream({
        qoStbd: g.inputs.qoStbd, wct: g.inputs.wct, gorScfStb: g.inputs.gorScfStb, pvt: g.inputs.pvt,
      });
      relClose(stream.totalResBpd, g.stream.totalResBpd, 1e-10, `${g.id} in-situ rate`);
      relClose(stream.gvf, g.stream.gvf, 1e-9, `${g.id} gas volume fraction`);
      const gas = gasHandling({ stream, separatorEfficiency: g.inputs.separatorEfficiency });
      relClose(gas.pumpIntakeBpd, g.gas.pumpIntakeBpd, 1e-10, `${g.id} pump intake rate`);
      relClose(gas.mixtureDensityLbFt3, g.gas.mixtureDensityLbFt3, 1e-10, `${g.id} pump-side density`);
      if (gas.verdict !== g.gas.verdict) throw new Error(`${g.id} gas verdict`);
    });
    // venting gas leaves a heavier fluid behind, all the way to the liquid
    const pvt = { rs: 300, bo: 1.2, bw: 1.02, bg: 0.0012, rhoO: 48, rhoW: 64, rhoG: 6 };
    const stream = intakeStream({ qoStbd: 1200, wct: 0.5, gorScfStb: 500, pvt });
    const all = gasHandling({ stream, separatorEfficiency: 1 });
    relClose(all.mixtureDensityLbFt3, stream.liquidDensityLbFt3, 1e-12, 'full separation leaves liquid');
  });

  gate('PA12', 'total dynamic head, staging, the net-lift regression and the off-curve refusal', () => {
    const grad = gradientFromDensity(50.54);
    const { tdhFt, dpPsi } = totalDynamicHead({
      pIntakePsia: 1340, pDischargePsia: 3200, gradientPsiPerFt: grad,
    });
    relClose(tdhFt * grad, dpPsi, 1e-12, 'TDH times gradient is the pressure added');
    close(intakePressure({
      pwfPsia: 1500, perfTvdFt: 7500, pumpTvdFt: 7000, annulusGradPsiPerFt: 0.32,
    }), 1340, 1e-9, 'intake pressure through the annulus column');
    // the predecessor set TDH = friction + wellhead and staged an order
    // of magnitude short; the lift term has to dominate
    const parts = tdhBreakdown({ netLiftFt: 4800, frictionFt: 260, whpHeadFt: 340 });
    if (!(parts.tdhFt > 6 * (parts.frictionFt + parts.whpHeadFt))) {
      throw new Error('the net lift term is not dominating a deep well');
    }
    E.designs.forEach((g: any) => {
      const curve = g.inputs.curve === 'vendor'
        ? fitStageCurve({ points: E.vendorCurve.points })
        : referenceStageCurve(E.referenceCurves.find((c: any) => c.id === g.inputs.curve).spec);
      const sized = sizePump({
        curve, qBpd: g.gas.pumpIntakeBpd, tdhFt: g.tdhFt, hz: g.inputs.hz,
        specificGravity: g.gradientPsiPerFt / PSI_PER_FT_SG, nameplateHp: g.inputs.nameplateHp,
      });
      if (sized.stages !== g.sized.stages) {
        throw new Error(`${g.id} stages ${sized.stages} vs ${g.sized.stages}`);
      }
      relClose(sized.shaftHp, g.sized.shaftHp, 1e-7, `${g.id} shaft power`);
      if (!(sized.headMarginFt >= 0 && sized.headMarginFt < sized.stage.headFt)) {
        throw new Error(`${g.id} the stack does not just cover the head`);
      }
    });
    const offCurve = sizePump({
      curve: fitStageCurve({ points: E.vendorCurve.points }),
      qBpd: 4800, tdhFt: 3800, hz: 50, specificGravity: 1, nameplateHp: 200,
    });
    if (Number.isFinite(offCurve.stages) && offCurve.stages > 0) {
      throw new Error('a duty off the end of the curve produced a stage count');
    }
    relClose(HP_HEAD_DIVISOR, E.constants.hpHeadDivisor, 1e-10, 'hydraulic power constant');
  });

  gate('PA13', 'electrical: copper resistance, cable drop vs oracle, and the selection refusal', () => {
    close(conductorResistance({ ohmsPer1000FtAt77F: 0.1593, tempF: COPPER_REF_TEMP_F }),
      0.1593, 1e-12, 'resistance at the reference temperature');
    E.electrical.forEach((g: any) => {
      const r = surfaceRequirement({
        shaftHp: g.inputs.shaftHp, nameplateHp: g.inputs.nameplateHp,
        nameplateAmps: g.inputs.nameplateAmps, nameplateVolts: g.inputs.nameplateVolts,
        powerFactor: g.inputs.powerFactor, lengthFt: g.inputs.lengthFt,
        ohmsPer1000FtAt77F: g.inputs.ohmsPer1000FtAt77F, cableTempF: g.inputs.cableTempF,
      });
      relClose(r.dropV, g.dropV, 1e-9, 'cable voltage drop');
      relClose(r.surfaceVolts, g.surfaceVolts, 1e-9, 'surface voltage');
      relClose(r.kva, g.kva, 1e-9, 'apparent power');
      relClose(r.lossKw, g.lossKw, 1e-9, 'cable loss');
    });
    const impossible = selectCable({
      cables: CABLE_SIZES.map((c: any) => ({ ...c, ampacityA: 10 })),
      maxDropPct: 1, shaftHp: 200, nameplateHp: 250, nameplateAmps: 67,
      nameplateVolts: 1000, lengthFt: 12000, cableTempF: 220,
    });
    if (impossible.cable !== null) throw new Error('a cable was selected that fails its own checks');
  });

  gate('PA14', 'ESP Suite layer: the chain on a real nodal well', () => {
    const depth = 7500;
    const model = {
      fluidModel: buildFluidModel({ api: 32, gasSg: 0.75, gor: 120, salinityPpm: 30000 }),
      trajectory: buildTrajectory({ mode: 'vertical', depthFt: depth }),
      tAt: linearGeothermal({ whtF: 100, bhtF: 190, tvdMaxFt: depth }),
      ipr: computeIpr({ model: 'composite', pr: 2200, pb: 1500, pi: 0.5 }),
      vlp: {
        idIn: 3.958, roughnessIn: 0.0006, correlation: 'beggsBrill', stepFt: 250, nodeMd: depth,
      },
    };
    const common = {
      model, wct: 0.9, gorScfStb: 120, perfTvdFt: depth,
      annulusGradPsiPerFt: 0.4, separatorEfficiency: 0.7, whp: 200,
    };
    const duty = dutyAtRate({ ...common, qoStbd: 300, pumpTvdFt: 7000, pumpMd: 7000 });
    close(duty.breakdown.netLiftFt + duty.breakdown.frictionFt + duty.breakdown.whpHeadFt,
      duty.tdhFt, 1e-6, 'the head decomposition sums to the total');
    relClose(duty.tdhFt * duty.intake.gradientPsiPerFt, duty.dpPsi, 1e-6,
      'TDH is the pressure the pump adds');
    const deep = dutyAtRate({ ...common, qoStbd: 300, pumpTvdFt: 7400, pumpMd: 7400 });
    if (!(deep.intake.pipPsia > duty.intake.pipPsia)) throw new Error('a deeper pump lost submergence');
    if (!(deep.tdhFt > duty.tdhFt)) {
      throw new Error('a deeper pump appeared to save head, which the gradients do not allow');
    }

    const curve = buildStageCurve({ curveSource: 'reference', referenceStageId: 'ref-562-4000' });
    const op = solveEspOperatingPoint({
      ...common, curve, stages: 190, hz: 60, pumpTvdFt: 7000, pumpMd: 7000, nScan: 7,
    });
    if (!op) throw new Error('the pump and system curves did not cross');
    close(op.headFt, op.tdhFt, 15, 'the operating point balances head against demand');

    // a well that flows on its own is refused rather than staged
    const flowing = runEspDesign({
      model: {
        ...model,
        fluidModel: buildFluidModel({ api: 32, gasSg: 0.75, gor: 500, salinityPpm: 30000 }),
        ipr: computeIpr({ model: 'composite', pr: 2800, pb: 2200, pi: 3.0 }),
      },
      form: {
        designRateStbd: '1200', wctPct: '50', gorScfStb: '500', pumpTvdFt: '7000',
        perfTvdFt: String(depth), annulusGradPsiPerFt: '0.32', separatorEfficiencyPct: '70',
        whp: '200', hz: '60', nameplateHp: '250', nameplateVolts: '2400', nameplateAmps: '67',
        cableLengthFt: '7200', cableTempF: '180', maxDropPct: '5', powerFactor: '0.85',
        motorEfficiencyPct: '85', curveSource: 'reference', referenceStageId: 'ref-540-2500',
        curveRefHz: '60', curveText: '',
      },
    });
    if (flowing.ok) throw new Error('a naturally flowing well was staged instead of refused');
    if (!/flows on its own/.test(flowing.errors.join(' '))) {
      throw new Error('the refusal did not say why');
    }
  });

  const rodTaper = () => buildRodString({
    sections: [{ size: '7/8', lengthFt: 3000 }, { size: '3/4', lengthFt: 2000 }],
    fluidSg: 1,
  });

  gate('PA15', 'rod string mechanics: fractions, Archimedes buoyancy, compliances that sum', () => {
    // The predecessor did parseFloat("7/8".replace('/', '.')) === 7.8,
    // giving a 7/8 rod a 47 square inch section instead of 0.6.
    if (Math.abs(parseRodSize('7/8') - 0.875) > 1e-12) throw new Error('a fraction was not read as a fraction');
    if (rodArea(parseRodSize('7/8')) > 1) throw new Error('the rod section is not a rod section');
    if (Math.abs(parseRodSize('1 1/8') - 1.125) > 1e-12) throw new Error('a mixed number was misread');
    if (Number.isFinite(parseRodSize('seven eighths'))) throw new Error('an unreadable size produced a number');

    relClose(buoyancyFactor(1.0), 1 - 1 / 7.85, 1e-12, 'buoyancy is Archimedes');
    if (Math.abs(buoyancyFactor(1.0) - (1 - (1.2 * 1.0) / 7.85)) < 1e-3) {
      throw new Error('the buoyancy factor still carries the predecessor\'s invented 1.2');
    }
    for (const r of ROD_SIZES) {
      relClose(r.weightLbPerFt / bareRodWeightLbPerFt(r.dIn), COUPLING_ALLOWANCE, 5e-3,
        `the ${r.label} rod weight is bare steel plus a consistent coupling allowance`);
    }
    const st = rodTaper();
    const compliance = st.sections.reduce((a: number, x: any) => a + x.stretchPerLb, 0);
    relClose(1 / st.krLbPerIn, compliance, 1e-12, 'the string compliance is the sum of its sections');
  });

  gate('PA16', 'the 245,000 constant derived from E, rho and the coupling mass', () => {
    const bare = steelAcousticVelocityFtS();
    if (!(bare > 16800 && bare < 17100)) throw new Error(`bare steel wave speed ${bare} is not steel`);
    // Couplings add mass and almost no stiffness, so they slow the wave
    // by the square root of the coupling allowance. That IS where the
    // familiar 245,000/L comes from, and it is derived rather than quoted.
    relClose(bare / Math.sqrt(COUPLING_ALLOWANCE), ROD_ACOUSTIC_VELOCITY_FT_S, 5e-3,
      'the coupling mass explains the conventional rod-string wave speed');
    const uni = buildRodString({ sections: [{ size: '7/8', lengthFt: 6000 }], fluidSg: 1 });
    relClose(naturalFrequency({ string: uni }).n0Spm * 6000, 245000, 5e-3,
      'a uniform string gives N0 = 245,000 / L');
    relClose(sectionWaveSpeedFtS(uni.sections[0]), ROD_ACOUSTIC_VELOCITY_FT_S, 5e-3,
      'the section wave speed is the conventional one');
    const ft = naturalFrequency({ string: rodTaper() });
    if (!(ft.taperFactor > 1)) throw new Error('the taper factor did not exceed one');
    if (ft.uniform) throw new Error('a tapered string was treated as uniform');
  });

  gate('PA17', 'the wave equation reduces to the static limit as the unit slows', () => {
    const st = rodTaper();
    const FO = 5000;
    const r = predictCard({
      string: st, surfacePosition: simpleHarmonicPosition(64 / 12), strokeFt: 64 / 12,
      spm: 0.5, fluidLoadLb: FO, fillage: 1, dampingRatio: 0.1,
    });
    if (!r.converged) throw new Error('the quasi-static solution did not settle');
    relClose(r.plungerStrokeIn, 64 - FO * st.erInPerLb, 0.01,
      'the plunger loses exactly the rod stretch');
    relClose(r.prlPeakLb, st.weightFluidLb + FO, 0.02, 'PPRL is the buoyed weight plus the fluid load');
    relClose(r.prlMinLb, st.weightFluidLb, 0.02, 'MPRL is the buoyed weight');
    const undamped = predictCard({
      string: st, surfacePosition: simpleHarmonicPosition(64 / 12), strokeFt: 64 / 12,
      spm: 8, fluidLoadLb: FO, fillage: 1, dampingRatio: 0,
    });
    if (undamped.ok) throw new Error('a string with no damping was marched instead of refused');
  });

  gate('PA18', 'predict and diagnose: two solvers, no shared path, one answer', () => {
    const st = rodTaper();
    const FO = 5000;
    const r = predictCard({
      string: st, surfacePosition: simpleHarmonicPosition(64 / 12), strokeFt: 64 / 12,
      spm: 8, fluidLoadLb: FO, fillage: 1, dampingRatio: 0.1,
    });
    const d = diagnoseCard({
      string: st, surfaceCard: r.surfaceCard, spm: 8, dampingRatio: 0.1, harmonics: 30,
    });
    if (!d.ok) throw new Error('the diagnostic could not read a card the predictor produced');
    relClose(d.plungerStrokeIn, r.plungerStrokeIn, 0.02, 'the diagnostic recovers the plunger stroke');
    relClose(d.pumpLoadRangeLb[1], FO, 0.05, 'the diagnostic recovers the fluid load');
    if (Math.abs(d.pumpLoadRangeLb[0]) > 0.05 * FO) {
      throw new Error('the diagnostic did not see the traveling valve open');
    }
  });

  gate('PA19', 'the torque factor IS ds/dtheta, proved by the energy identity', () => {
    const st = rodTaper();
    const g = genericConventionalGeometry({ strokeIn: 64 });
    const kin = unitKinematics(g.geometry, { steps: 360 });
    relClose(kin.strokeIn, 64, 1e-3, 'the generic linkage achieves the stroke it was asked for');
    if (Math.abs(kin.upstrokeFraction - 0.5) < 0.02) {
      throw new Error('the linkage behaved like a pure sine wave, which no four-bar does');
    }
    const r = predictCard({
      string: st, surfacePosition: surfacePositionFn(kin), strokeFt: 64 / 12,
      spm: 9, fluidLoadLb: 5000, fillage: 1, dampingRatio: 0.1,
    });
    const card = r.surfaceCard;
    const cardLoadAt = (f: number) => card[Math.min(card.length - 1,
      Math.max(0, Math.round(f * card.length) % card.length))].loadLb;
    const t = netTorque({ kin, cardLoadAt, counterbalanceMomentInLb: 0 });
    const dTheta = (2 * Math.PI) / t.length;
    const work = Math.abs(t.reduce((a: number, row: any) => a + row.rodTorqueInLb * dTheta, 0));
    // Whatever work the polished rod does has to arrive at the
    // crankshaft. The strongest available check on the torque factor,
    // and it needs no remembered formula.
    relClose(work, r.workInLbPerCycle, 0.05, 'torque through a revolution is the card area');
  });

  gate('PA20', 'rod pump Suite layer: the chain on a real nodal well', () => {
    const rodDepth = 5000;
    const rodModel = {
      fluidModel: buildFluidModel({ api: 30, gasSg: 0.7, gor: 80, salinityPpm: 30000 }),
      trajectory: buildTrajectory({ mode: 'vertical', depthFt: rodDepth }),
      tAt: linearGeothermal({ whtF: 90, bhtF: 150, tvdMaxFt: rodDepth }),
      ipr: computeIpr({ model: 'composite', pr: 1200, pb: 800, pi: 0.6 }),
      tvdMax: rodDepth,
    };
    const form: any = {
      designRateStbd: '120', wctPct: '80', gorScfStb: '80', pumpTvdFt: '4800',
      strokeIn: '64', spm: '8', plungerDIn: '1.75', whp: '80',
      annulusGradPsiPerFt: '0.38', separatorEfficiencyPct: '60',
      pumpEfficiencyPct: '90', serviceFactor: '1', api: '30', gradeId: 'D',
      sectionsText: '7/8, 2400\n3/4, 2400', unitSource: 'generic',
      unitDesignation: 'C-228D-200-74', structuralUnbalanceLb: '0', crankOffsetDeg: '0',
    };
    const res = runRodDesign({ form, model: rodModel });
    if (!res.ok) throw new Error(`the design did not run: ${res.errors.join(' ')}`);
    const d = res.design;

    relClose(d.fluidLoadLb, rodFluidLoad({
      plungerDIn: 1.75, pDischargePsi: d.pDischargePsi, pIntakePsi: d.intake.pipPsia,
    }), 1e-9, 'the fluid load is the plunger differential');
    // Tubing pressure ADDS to the fluid load; the predecessor subtracted it.
    const heavier = runRodDesign({ form: { ...form, whp: '300' }, model: rodModel });
    if (!(heavier.design.fluidLoadLb > d.fluidLoadLb)) {
      throw new Error('more tubing pressure lightened the fluid load');
    }
    if (!(d.pprlLb > res.string.weightFluidLb && d.mprlLb < res.string.weightFluidLb)) {
      throw new Error('the polished rod load does not bracket the buoyed rod weight');
    }
    if (!(d.plungerStrokeIn < 64)) throw new Error('the plunger out-travelled the polished rod');
    relClose(d.sweptBpd, displacementBpd({
      plungerDIn: 1.75, strokeIn: d.plungerStrokeIn, spm: 8,
    }), 1e-9, 'displacement is swept by the plunger, not the polished rod');
    if (!(d.producedBpd < d.ratedBpd)) throw new Error('production exceeded the rated displacement');

    const harder = runRodDesign({ form: { ...form, designRateStbd: '300' }, model: rodModel });
    if (harder.ok && !(harder.design.intake.submergenceFt < d.intake.submergenceFt)) {
      throw new Error('pumping harder did not cost submergence');
    }
    const short = runRodDesign({ form: { ...form, sectionsText: '7/8, 2000' }, model: rodModel });
    if (short.ok) throw new Error('a rod string shorter than its pump depth was accepted');
    if (!/reaches its pump/.test(short.errors.join(' '))) {
      throw new Error('the refusal did not say why');
    }
  });

  gate('PA21', 'the shared per-well model, and the nodal cross-check it unlocks', () => {
    // ONE description, ONE bundle. Before P6.5 the gas lift, ESP and rod
    // pump studios each carried their own copy of this code, so the same
    // well could be described three ways.
    const base = defaultWellInputs();
    const model = buildSharedWell(base);
    if (!model) throw new Error('the default well description did not build');
    if (!(model.ipr.qmax > 0)) throw new Error('the inflow did not calibrate');
    // The vlp is self-contained, because the gas lift studio spreads it
    // straight into a traverse call.
    for (const k of ['fluidModel', 'trajectory', 'tAt', 'idIn', 'correlation', 'nodeMd']) {
      if ((model.vlp as any)[k] === undefined) throw new Error(`the vlp is missing ${k}`);
    }
    // and it carries no duty
    if ((model.vlp as any).whp !== undefined || (model.vlp as any).rates !== undefined) {
      throw new Error('the shared vlp carries duty, which belongs to a design');
    }
    const payload = toWellModelPayload(base);
    for (const k of ['wctPct', 'whp', 'designRateStbd', 'spm', 'plungerDIn']) {
      if (JSON.stringify(payload).includes(k)) {
        throw new Error(`the well record carries ${k}, which is duty and belongs to a design`);
      }
    }
    // Round trip: a saved model comes back as the form it was typed in.
    const back = fromWellModelPayload(payload);
    if (JSON.stringify(wellInputsFrom(back)) !== JSON.stringify(wellInputsFrom(base))) {
      throw new Error('a well model did not round-trip through its payload');
    }

    // An inflow that never calibrated is REFUSED. Absolute open flow
    // calibrates a Vogel inflow and only a Vogel inflow; asking for it
    // on a composite model calibrated nothing, and because every rate
    // guard downstream compares against a NaN open flow -- and NaN
    // comparisons are false -- the design used to sail past its own
    // checks and produce NaN everywhere. This was live in three studios.
    const badCal = defaultWellInputs();
    badCal.inflow.model = 'composite';
    badCal.inflow.calMode = 'qmax';
    badCal.inflow.qmax = '900';
    if (buildSharedWell(badCal) !== null) {
      throw new Error('an uncalibrated inflow built a model instead of being refused');
    }
    if (!/Vogel inflow/.test(wellModelProblems(badCal).join(' '))) {
      throw new Error('the refusal did not say why');
    }

    // THE CHECK P3 DEFERRED. A well test records a rate and a wellhead
    // pressure; the well's own model says what it should have made at
    // that pressure. This needed a per-well record to exist at all.
    const flowing = defaultWellInputs();
    flowing.inflow.pr = '3800';
    flowing.inflow.pb = '2200';
    flowing.inflow.pi = '1.2';
    flowing.fluid.gor = '600';
    const fm = buildSharedWell(flowing);
    const solved = solveOperatingPoint({
      ipr: fm.ipr, vlp: { ...fm.vlp, whp: 200, rates: { wct: 0.2, gor: 600 } },
    });
    if (!solved.op) throw new Error('the reference well did not flow, so there is nothing to check against');
    const q = solved.op.q;
    const mkTest = (id: string, oil: number) => ({
      id, well_id: 'w1', well: { name: 'P-1' }, test_date: '2025-03-01',
      oil_rate_stbd: oil, water_rate_stbd: oil * 0.25, gas_rate_mscfd: oil * 0.6,
      thp_psia: 200,
    });
    const rows = crossCheckTestsAgainstNodal({
      tests: [mkTest('good', Math.round(q)), mkTest('bad', Math.round(q * 0.35))],
      wellModels: new Map([['w1', flowing]]),
      buildModel: buildSharedWell,
      solveNode: solveOperatingPoint,
    });
    const good = rows.find((r: any) => r.testId === 'good');
    const bad = rows.find((r: any) => r.testId === 'bad');
    if (good.status !== 'ok') throw new Error('a test matching its own well was flagged');
    relClose(good.nodalStbd, q, 1e-6, 'the nodal rate is the operating point');
    if (bad.status !== 'off') throw new Error('a test well off its own well was not flagged');
    if (!(bad.deviationPct < 0)) throw new Error('the deviation did not carry its direction');
    // A well with no model is reported, never silently skipped.
    const none = crossCheckTestsAgainstNodal({
      tests: [mkTest('x', 100)], wellModels: new Map(),
      buildModel: buildSharedWell, solveNode: solveOperatingPoint,
    });
    if (none[0].status !== 'no-model') throw new Error('a test with no well model was not reported');
  });

  gate('PA22', 'gas wells: the Turner constant derived, and where loading bites first', () => {
    // The whole correlation from drag against weight, with the largest
    // stable droplet set by the critical Weber number. Nothing quoted.
    const t = terminalDropletVelocity({ sigmaDyneCm: 1, rhoLiquidLbFt3: 2, rhoGasLbFt3: 1 });
    relClose(t.constant, 1.593, 1e-3, 'the droplet balance produces the published constant');
    relClose(RATE_CONSTANT_MSCFD / 1000, 3.06, 2e-3, 'the rate constant is the published one');

    // Turner and Coleman are one equation and one factor.
    const args = {
      sigmaDyneCm: 60, rhoLiquidLbFt3: 67, pPsia: 1200, tempR: 600, z: 0.9, gasSg: 0.65,
    };
    const turner = criticalVelocity({ correlation: 'turner', ...args });
    const coleman = criticalVelocity({ correlation: 'coleman', ...args });
    relClose(turner.velocityFtS, coleman.velocityFtS * 1.2, 1e-12,
      'Turner is Coleman with the 20 percent adjustment');
    if (criticalVelocity({ correlation: 'guess', ...args }).ok) {
      throw new Error('an unknown correlation was accepted');
    }
    if (recommendCorrelation(400).correlation !== 'coleman'
        || recommendCorrelation(2500).correlation !== 'turner') {
      throw new Error('the correlation guidance does not follow the pressure ranges');
    }

    // THE SHOE CONTROLS. Critical rate goes as roughly the square root
    // of pressure, so it is highest at the bottom. A studio that
    // checked the wellhead would pass wells that are loading exactly
    // where the liquid collects.
    const stations = [
      { depthFt: 0, pPsia: 400, tempR: 540, z: 0.94, idIn: 2.441 },
      { depthFt: 3000, pPsia: 700, tempR: 570, z: 0.91, idIn: 2.441 },
      { depthFt: 6000, pPsia: 1100, tempR: 600, z: 0.89, idIn: 2.441 },
    ];
    const prof = loadingProfile({
      stations, qMscfd: 1200, correlation: 'turner',
      sigmaDyneCm: 60, rhoLiquidLbFt3: 67, gasSg: 0.65,
    });
    if (!prof.ok) throw new Error('the loading profile did not build');
    if (prof.controlling.depthFt !== 6000) throw new Error('the controlling station is not the deepest');
    if (!(prof.points[0].ratio > 1)) throw new Error('the wellhead should be passing in this case');
    if (!(prof.controlling.ratio < 1)) throw new Error('the shoe should be loading in this case');
    // and each point carries the conditions it was computed at
    if (prof.controlling.pPsia !== 1100) throw new Error('a profile point lost its conditions');

    // Condensate holds together less well than water, so a well making
    // it can run slower before loading. Backwards here flags healthy wells.
    const rate = (sigma: number, rhoL: number) => rateAtVelocity({
      velocityFtS: criticalVelocity({
        correlation: 'turner', sigmaDyneCm: sigma, rhoLiquidLbFt3: rhoL,
        pPsia: 800, tempR: 580, z: 0.9, gasSg: 0.65,
      }).velocityFtS,
      areaFt2: tubingAreaFt2(2.441), pPsia: 800, tempR: 580, z: 0.9,
    });
    if (!(rate(20, 45) < rate(60, 67))) {
      throw new Error('condensate came out harder to carry than water');
    }
    if (!(gasDensityLbFt3({ pPsia: 1000, tempR: 600, z: 0.88, gasSg: 0.65 }) > 0)) {
      throw new Error('gas density did not build');
    }

    // THE FORECAST, which is the point of the studio: the reservoir
    // pressure at which the well stops carrying its liquid.
    const gw = defaultWellInputs();
    gw.well.phase = 'gas';
    gw.well.depthFt = '8000';
    gw.well.whtF = '90';
    gw.well.bhtF = '210';
    gw.inflow.pr = '2200';
    gw.gasInflow = { ...gw.gasInflow, model: 'backPressure', c: '0.0025', n: '0.87' };
    gw.completion.idIn = '2.441';
    const gwModel = buildSharedWell(gw);
    if (!gwModel || gwModel.phase !== 'gas' || !(gwModel.gasIpr.aof > 0)) {
      throw new Error('the shared record did not build a gas well');
    }
    const analysis = runGasWellAnalysis({
      form: {
        whp: '400', gasSg: '0.65', sigmaDyneCm: '60', rhoLiquidLbFt3: '67',
        correlation: 'auto',
      },
      model: gwModel,
    });
    if (!analysis.ok) throw new Error(`the gas well analysis did not run: ${analysis.errors.join(' ')}`);
    const fc = loadingForecast({
      model: gwModel, inputs: gw, whp: 400, gasSg: 0.65, sigmaDyneCm: 60,
      rhoLiquidLbFt3: 67, correlation: analysis.result.correlation,
      prFrom: 2200, prTo: 900, nPoints: 7,
    });
    if (!(fc.crossingPrPsia > 900 && fc.crossingPrPsia < 2200)) {
      throw new Error('the forecast did not find the pressure at which the well loads');
    }
    const rates = fc.points.map((p: any) => p.qMscfd);
    for (let i = 1; i < rates.length; i += 1) {
      if (!(rates[i] < rates[i - 1])) throw new Error('deliverability did not fall with depletion');
    }

    // An oil record is refused rather than run through a gas inflow.
    const oilRecord = runGasWellAnalysis({
      form: { whp: '400', gasSg: '0.65', sigmaDyneCm: '60', rhoLiquidLbFt3: '67', correlation: 'auto' },
      model: buildSharedWell(defaultWellInputs()),
    });
    if (oilRecord.ok) throw new Error('an oil-phase record was analysed as a gas well');
  });

  gate('PA23', 'plunger lift: the force balance, and a verdict the rule of thumb does not decide', () => {
    const base = {
      depthFt: 6000, idIn: 2.441, linePressurePsia: 120, casingPressurePsia: 600,
      slugLengthFt: 200, liquidSg: 1.02, plungerWeightLb: 6, gasSg: 0.65,
      avgTempR: 580, z: 0.9,
    };
    const lift = liftPressure(base);
    // Every term is what it says, and they sum to the requirement.
    close(lift.terms.slugPsi, 0.433 * 1.02 * 200, 1e-9, 'the slug term is its hydrostatic');
    const sum = Object.values(lift.terms).reduce((a: number, v: any) => a + v, 0);
    relClose(lift.requiredPsia, sum, 1e-12, 'the lift balance sums to its terms');
    // At the longest slug the available pressure is exactly used up.
    const max = maxSlugLengthFt(base);
    relClose(liftPressure({ ...base, slugLengthFt: max }).requiredPsia,
      base.casingPressurePsia, 1e-6, 'the longest slug uses the casing pressure exactly');

    // Feasibility rests on the COMPUTED ratio, and the heuristic is
    // reported beside it rather than deciding.
    const good = screenPlungerLift({ ...base, wellGlrScfBbl: 12000, afterflowMin: 20, shutInMin: 35 });
    if (!good.ok || !good.design.feasible) throw new Error('a feasible well was screened out');
    relClose(good.design.ruleOfThumbGlrScfBbl, 400 * 6, 1e-9, 'the rule of thumb is reported');
    if (!(good.design.requiredGlrScfBbl > 0)) throw new Error('no required gas-liquid ratio');

    // A well the heuristic passes and the physics fails is exactly
    // where a screening rule misleads, so the disagreement is surfaced.
    const between = screenPlungerLift({ ...base, wellGlrScfBbl: 3000, afterflowMin: 20, shutInMin: 35 });
    if (!(between.design.wellGlrScfBbl > between.design.ruleOfThumbGlrScfBbl)) {
      throw new Error('the test case no longer sits above the rule of thumb');
    }
    if (between.design.glrOk) throw new Error('the physics should refuse this well');
    if (between.design.ruleOfThumbAgrees !== false) {
      throw new Error('the disagreement between heuristic and physics was not reported');
    }

    // Refusals.
    const noPressure = screenPlungerLift({ ...base, casingPressurePsia: 180, wellGlrScfBbl: 12000 });
    if (noPressure.design.pressureOk) throw new Error('a well that cannot lift was passed');
    if (screenPlungerLift({ ...base, slugLengthFt: 9000 }).ok) {
      throw new Error('a slug longer than the tubing was accepted');
    }
  });

  gate('PA24', 'the choke as a nodal constraint, and what really caps a bean', () => {
    // A choke correlation on its own says what wellhead pressure a rate
    // needs. On a real well the rate is whatever the well, the tubing
    // and the bean settle at together, so the bean has to go INTO the
    // solve rather than beside it.
    const ck = defaultWellInputs();
    ck.inflow.pr = '3200';
    ck.inflow.pb = '2200';
    ck.inflow.pi = '1.5';
    ck.fluid.gor = '600';
    const ckModel = buildSharedWell(ck);
    const oilArgs = { glr: 600, wct: 0.2, pDownstream: 150, correlation: 'gilbert' };

    const at32 = solveChokedOil({ model: ckModel, s64: 32, ...oilArgs });
    if (!at32.ok) throw new Error('a 32/64 bean produced no operating point');
    // The operating point really is on the choke curve: the correlation
    // evaluated at the solved rate has to give back the solved wellhead
    // pressure, or the residual was solved on something else.
    const { c, m, n } = CHOKE_COEFFS.gilbert;
    relClose((c * Math.pow(600, m) * at32.q) / Math.pow(32, n), at32.pwh, 1e-6,
      'the operating point lies on the choke curve');
    if (!(at32.pwf > at32.pwh)) throw new Error('the bottomhole pressure is not above the wellhead');

    // A bigger bean makes more and holds less back.
    const at16 = solveChokedOil({ model: ckModel, s64: 16, ...oilArgs });
    const at48 = solveChokedOil({ model: ckModel, s64: 48, ...oilArgs });
    if (!(at48.q > at32.q && at32.q > at16.q)) throw new Error('rate did not rise with bean size');
    if (!(at48.pwh < at32.pwh && at32.pwh < at16.pwh)) {
      throw new Error('wellhead pressure did not fall as the bean opened');
    }

    // WHERE THE CORRELATION STOPS. The Gilbert family is a critical-flow
    // correlation; past the critical ratio it does not apply and the
    // bean has stopped controlling the well. That boundary is found from
    // the solved points rather than assumed.
    const env = operatingEnvelope({
      model: ckModel, beans: [16, 24, 32, 40, 48, 64], phase: 'oil', oil: oilArgs,
    });
    const limit = criticalBeanLimit(env);
    if (!limit) throw new Error('the critical limit was not found in a range that contains it');
    const last = env.find((e: any) => e.s64 === limit.lastCriticalS64);
    const first = env.find((e: any) => e.s64 === limit.firstSubcriticalS64);
    if (!(last.ratio <= CRITICAL_RATIO_LIMIT && first.ratio > CRITICAL_RATIO_LIMIT)) {
      throw new Error('the critical limit does not straddle the critical ratio');
    }
    const subcritical = runChokeAnalysis({
      form: {
        s64: '80', pDownstream: '150', flowlineIdIn: '3', cFactor: '100',
        glr: '600', wctPct: '20', correlation: 'gilbert',
      },
      model: ckModel,
    });
    if (subcritical.result.solved.critical) throw new Error('an 80/64 bean was still critical');
    if (!subcritical.result.warnings.some((w: any) => w.code === 'subcritical')) {
      throw new Error('subcritical flow was not reported');
    }

    // Sizing a bean for a target rate is solved against the nodal point,
    // not by inverting the correlation at a guessed wellhead pressure.
    const sized = beanForRate({ model: ckModel, targetQ: 1200, ...oilArgs });
    if (!sized.ok) throw new Error('no bean was found for a reachable target');
    const check = solveChokedOil({ model: ckModel, s64: sized.s64, ...oilArgs });
    close(check.q, 1200, 5, 'the sized bean puts the well on the target rate');

    // API RP 14E: C is an INPUT, because the practice itself calls its
    // own values conservative.
    if (erosionalC('continuous').c !== 100 || erosionalC('cleanInhibited').c <= 125) {
      throw new Error('the erosional C presets are not what RP 14E and practice use');
    }
    const strict = erosionalCheck({
      inSituBpd: 9000, idIn: 2.441, mixtureDensityLbFt3: 45, cFactor: 100,
    });
    const relaxed = erosionalCheck({
      inSituBpd: 9000, idIn: 2.441, mixtureDensityLbFt3: 45, cFactor: 175,
    });
    if (!(strict.exceeded && !relaxed.exceeded)) {
      throw new Error('the C factor did not change the verdict, so it is not really an input');
    }
    const limitBpd = erosionalRateBpd({ idIn: 2.441, mixtureDensityLbFt3: 45, cFactor: 100 });
    relClose(erosionalCheck({
      inSituBpd: limitBpd, idIn: 2.441, mixtureDensityLbFt3: 45, cFactor: 100,
    }).ratio, 1, 1e-9, 'the erosional rate sits exactly on the limit');

    // The published sets span a factor of twelve, so fitting a well's
    // own tests is worth more than any of them. The fit is exact on
    // data generated from a known set, which is the check on the log
    // transform.
    const truth = CHOKE_COEFFS.gilbert;
    const pts = [[500, 300, 32], [800, 600, 32], [400, 300, 48], [900, 900, 40], [650, 450, 24]]
      .map(([q, glr, s64]) => ({
        q, glr, s64, pwh: (truth.c * Math.pow(glr, truth.m) * q) / Math.pow(s64, truth.n),
      }));
    const fit = fitChoke({ points: pts });
    if (!fit.ok) throw new Error('a well-posed fit was refused');
    relClose(fit.c, truth.c, 1e-6, 'the fit recovers the leading constant');
    relClose(fit.n, truth.n, 1e-6, 'the fit recovers the bean exponent');
    // Data that cannot pin the coefficients down is REFUSED rather than
    // solved to confident nonsense.
    const flat = [
      { pwh: 500, q: 400, glr: 400, s64: 32 },
      { pwh: 620, q: 500, glr: 400, s64: 32 },
      { pwh: 750, q: 600, glr: 400, s64: 32 },
    ];
    if (fitChoke({ points: flat }).ok) throw new Error('a singular fit was accepted');
    if (fitChoke({ points: pts.slice(0, 2) }).ok) throw new Error('two tests fitted three coefficients');

    // Spine well tests shape into fit points with the gas-liquid ratio
    // taken over LIQUID, not over oil.
    const shaped = testsToChokePoints([{
      id: 't', test_date: '2025-01-01', is_valid: true, oil_rate_stbd: 400,
      water_rate_stbd: 100, gas_rate_mscfd: 300, choke_64ths: 32, thp_psia: 620,
    }]);
    if (shaped.length !== 1) throw new Error('a usable well test was dropped');
    relClose(shaped[0].glr, (300 * 1000) / 500, 1e-9, 'the gas-liquid ratio is over liquid');
  });

  const armed: [string, string][] = [
    ['PL1', 'Takacs, Gas Lift Manual worked installation design (valve depths, domes, test-rack settings)'],
    ['PL2', 'API Gas Lift Manual Book 6 nitrogen Ct table / NIST nitrogen isotherm z values'],
    ['PL3', 'Guo & Ghalambor / Brown worked gas-lift example (injection point and performance curve)'],
    ['PL4', 'vendor valve data book bellows areas and R per port (generic-geometry spot check)'],
    ['PL5', 'Hydraulic Institute ANSI/HI 9.6.7 viscous correction (or Turzo SPE 57722)'],
    ['PL6', 'Turpin / Alhanati SPE 28526 gas-handling criteria'],
    ['PL7', 'vendor pump catalog stage curves (reference-model spot check)'],
    ['PL8', 'Takacs, Electrical Submersible Pumps Manual worked design example'],
    ['PL9', 'API RP 11L dimensionless charts (Sp/S, F1/Skr, F2/Skr, 2T/S^2kr) against the wave-equation solution across the N/N0 and Fo/Skr grid'],
    ['PL10', 'Takacs, Sucker-Rod Pumping Manual worked design example (loads, torque, plunger stroke)'],
    ['PL11', 'API RP 11BR modified Goodman allowable and published service factors'],
    ['PL12', 'a measured field dynamometer card with its independently computed downhole card (Gibbs diagnostic spot check)'],
    ['PL13', 'Turner et al. 1969 SPE 2198 worked critical-rate examples and the field data behind the 20 percent adjustment'],
    ['PL14', 'Coleman et al. 1991 low-pressure gas well data set (unadjusted critical velocity)'],
    ['PL15', 'Foss & Gaul 1965 / Beeson-Knox-Stoddard plunger-lift worked example (minimum casing pressure and cycle)'],
    ['PL16', 'Lea & Nickens gas well deliverability worked example over the back-pressure and LIT routes'],
    ['PL17', 'Sachdeva SPE 15657 subcritical two-phase choke equations (parked unarmed in NA3; would replace the critical-flow screening answer)'],
    ['PL18', 'API RP 14E worked erosional-velocity example and the C-factor guidance in full'],
    ['PL19', 'a composition-based hydrate curve (Fluid Studio EOS flash) against the Hammerschmidt screening'],
  ];
  for (const [id, name] of armed) {
    console.log(`ARMED ${id}  ${name} (pending owner literature; gate schema committed)`);
  }

  if (failures > 0) {
    console.error(`\n${failures} gate(s) FAILED.`);
    process.exit(1);
  }
  console.log('\nAll active production gates passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
