// Artificial lift advisor: the Suite's door onto the engine.
//
// THE MATH LIVES IN THE ENGINE, at
// packages/engines/engines/production/liftAdvisor.js, re-exported and
// wrapped here. This module used to be a second implementation of it.
// The engine's copy was extracted from this one and then carried items
// 19, 20, 21 and 22 of the owner's 4 September decisions, none of which
// reached a user while this studio imported the older copy from here.
//
// WHAT THIS FILE STILL DOES, AND WHY IT IS NOT A BARE RE-EXPORT. The
// engine takes its four design chains as an INJECTED dependency,
// because a pure engine cannot import the Suite's form-and-model
// wrappers: `runEspDesign` and `runDesign` read a studio form, and the
// gas lift traverse functions read a Suite well model. So the chains
// are assembled here, once, and handed to every design entry point. The
// argument names, the return shapes and every number are the engine's.
//
// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import { runEspDesign } from './esp.js';
import { runDesign as runRodDesign } from './rodPump.js';
import {
  liftedTraverse, injectionPointFromTraverse, solveLiftedOperatingPoint,
} from './gasLift.js';
import {
  designEsp as engineDesignEsp,
  designGasLift as engineDesignGasLift,
  designRodPump as engineDesignRodPump,
  runDesignPass as engineRunDesignPass,
} from './engine/liftAdvisor.js';

/**
 * The Suite's four design chains, in the shape the engine asks for.
 * Assembled once: a chain that is missing at the call site is how a
 * method silently stops being designed.
 */
export const SUITE_CHAIN = {
  runEspDesign,
  runRodDesign,
  liftedTraverse,
  injectionPointFromTraverse,
  solveLiftedOperatingPoint,
};

const withChain = (fn) => (args) => fn({ chain: SUITE_CHAIN, ...args });

export const designEsp = withChain(engineDesignEsp);
export const designGasLift = withChain(engineDesignGasLift);
export const designRodPump = withChain(engineDesignRodPump);
export const runDesignPass = withChain(engineRunDesignPass);

// Everything else is the engine's, unwrapped: the pure helpers, the
// equipment ladders, the plunger chain (which lives entirely in the
// engines package and needs nothing injected) and `reconcile`.
export {
  num, ATM_PSIA, psigToPsia, liquidGravity, mdAtTvd,
  ROD_TRIALS, RATE_TOLERANCE, oilDesignRate,
  pickReferenceStage, MOTOR_HEADROOM, pickMotorFrame,
  plungerWellGlr, designPlunger, reconcile,
} from './engine/liftAdvisor.js';
