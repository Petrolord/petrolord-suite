// MBAL engine — re-export shim (extraction runway step 6, 2026-08-06).
// The canonical engine now lives in the vendored @petrolord/engines package
// (packages/engines/engines/mbal/mbalEngine.ts, synced via git subtree from
// Petrolord/petrolord-engines). This shim keeps every existing import path
// working: the calculate-mbal edge function bundles through it at deploy
// time (verified live), and the tiered validation harness
// (tools/validation/mbal-validation.ts) tests the vendored engine through it.
// Never edit the vendored copy here; change it in the engines repo and
// subtree-pull.
export * from '../../../packages/engines/engines/mbal/mbalEngine.ts';
