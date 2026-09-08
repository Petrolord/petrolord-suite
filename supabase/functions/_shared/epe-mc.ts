// EPE MONTE CARLO LAYER RE-EXPORT SHIM (Economics extraction EC0, 2026-09-08).
// The canonical module now lives in the vendored @petrolord/engines package
// (packages/engines/engines/economics/montecarlo.ts, synced via git subtree from Petrolord/petrolord-engines) with
// committed goldens and an independent stdlib oracle. This shim keeps every
// existing import path working: the epe-cash-flow-engine, epe-cash-flow-engine-batch and epe-monte-carlo
// edge functions bundle through it at deploy time, exactly as calculate-mbal
// bundles through mbal-engine.ts (verified live 2026-08-06). Never edit the vendored copy from the
// Suite; change it in the engines repo and subtree-pull.
export * from '../../../packages/engines/engines/economics/montecarlo.ts';
