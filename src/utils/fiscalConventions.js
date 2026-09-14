// FISCAL METRIC CONVENTIONS RE-EXPORT SHIM (naming wave, 2026-09-14).
// The canonical module lives in the vendored @petrolord/engines package
// (packages/engines/engines/economics/fiscalConventions.js, synced via git
// subtree from Petrolord/petrolord-engines). The NextGen fiscal course imports
// the same file, so the names and definitions of government take and
// government share of net revenue cannot drift between the Designer and the
// course. Never edit the vendored copy from the Suite; change it in the
// engines repo and subtree-pull.
export * from '../../packages/engines/engines/economics/fiscalConventions.js';
