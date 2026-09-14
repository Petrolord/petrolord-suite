// PERCENTILE CONVENTIONS RE-EXPORT SHIM (engines #175, 2026-09-14).
// The owner-locked convention of 2026-09-09 (P-labels mean probability of
// exceedance of an outcome where more is better; parameters and more-is-worse
// quantities take "10th / 50th / 90th percentile") now lives in the vendored
// @petrolord/engines package (packages/engines/lib/conventions/percentile.js,
// synced via git subtree from Petrolord/petrolord-engines), so the NextGen
// courses import the same words the apps show. Never edit the vendored copy
// from the Suite; change it in the engines repo and subtree-pull.
export * from '../../packages/engines/lib/conventions/percentile.js';
