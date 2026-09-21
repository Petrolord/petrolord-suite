// FDP RISK MODEL RE-EXPORT SHIM (EC6-1, 2026-09-15).
// The canonical module now lives in the vendored @petrolord/engines package
// (packages/engines/engines/economics/fdp/riskModel.js, synced via git subtree
// from Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This file used to be a second copy of it, which is how the
// module came to have five different risk banding scales: `getRiskLevel` here,
// another one in HSEModel.js, a third in the HSE matrix, a fourth in the cell
// colours and a fifth in the response plan. Never edit the vendored copy from
// the Suite; change it in the engines repo and subtree-pull.
export * from '../../../packages/engines/engines/economics/fdp/riskModel.js';
