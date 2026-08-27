// Re-export shim — this engine lives in the central @petrolord/engines repo, vendored at packages/engines (git subtree). Never edit the vendored copy from the Suite; changes go to Petrolord/petrolord-engines and are subtree-pulled.
export * from '../../packages/engines/engines/sim/composeDeck.js';
export * from '../../packages/engines/engines/sim/emitPvt.js';
export * from '../../packages/engines/engines/sim/emitSatFns.js';
export * from '../../packages/engines/engines/sim/emitGrid.js';
export * from '../../packages/engines/engines/sim/emitSchedule.js';
export * from '../../packages/engines/engines/sim/wellPath.js';
export * from '../../packages/engines/engines/sim/referenceSpec.js';
export { daysBetween } from '../../packages/engines/engines/sim/deckFormat.js';
