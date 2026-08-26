// Re-export shim — these engines live in the central @petrolord/engines repo, vendored at packages/engines. Never edit the vendored copy from the Suite; changes go to Petrolord/petrolord-engines and are synced here.
// vrr.js is the oracle-stable VRR core; vrrLedger.js (V2) shapes per-well
// dated rows into monthly periods for it.
export * from '../../packages/engines/engines/waterflood/vrr.js';
export {
  monthKeyOf, classifyLedgerWells, buildFieldPeriods, computeRollingVRR, flagPeriods, analyzeLedger,
} from '../../packages/engines/engines/waterflood/vrrLedger.js';
