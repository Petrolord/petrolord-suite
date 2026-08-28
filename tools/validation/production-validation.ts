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
  const { gasChokeRate } = await import('../../src/utils/nodal/chokes.js');
  const { computeIpr } = await import('../../src/utils/nodal/ipr.js');
  const { buildFluidModel } = await import('../../src/utils/nodal/pvt.js');
  const { buildTrajectory } = await import('../../src/utils/nodal/trajectory.js');
  const { linearGeothermal } = await import('../../src/utils/nodal/temperature.js');
  const { liftedTraverse, solveLiftedOperatingPoint, psigToPsia, psiaToPsig } = await import(
    '../../src/utils/production/gasLift.js');

  const G = goldens('gaslift_cases.json');

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

  const armed: [string, string][] = [
    ['PL1', 'Takacs, Gas Lift Manual worked installation design (valve depths, domes, test-rack settings)'],
    ['PL2', 'API Gas Lift Manual Book 6 nitrogen Ct table / NIST nitrogen isotherm z values'],
    ['PL3', 'Guo & Ghalambor / Brown worked gas-lift example (injection point and performance curve)'],
    ['PL4', 'vendor valve data book bellows areas and R per port (generic-geometry spot check)'],
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
