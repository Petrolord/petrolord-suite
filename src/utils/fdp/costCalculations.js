// FDP costCalculations RE-EXPORT SHIM (Economics extraction EC0, 2026-09-08).
// The canonical module now lives in the vendored @petrolord/engines package
// (packages/engines/engines/economics/fdp/costCalculations.js, synced via git subtree from Petrolord/petrolord-engines) with
// committed goldens and an independent stdlib oracle. This shim keeps every
// existing import path working. Never edit the vendored copy from the
// Suite; change it in the engines repo and subtree-pull.
export * from '../../../packages/engines/engines/economics/fdp/costCalculations.js';
