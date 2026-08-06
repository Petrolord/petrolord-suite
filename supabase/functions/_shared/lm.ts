// Levenberg-Marquardt solver — re-export shim (extraction runway step 6,
// 2026-08-06). Canonical copy: packages/engines/engines/mbal/lm.ts (vendored
// @petrolord/engines). Consumers: the vendored mbal engine (its own relative
// copy) and tools/validation/gen-lm-port-golden.ts through this path.
export * from '../../../packages/engines/engines/mbal/lm.ts';
