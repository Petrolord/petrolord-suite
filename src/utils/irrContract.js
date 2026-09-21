// Thin re-export of the canonical IRR contract
// (packages/engines/engines/economics/irrContract.js, synced via git subtree
// from Petrolord/petrolord-engines). Shared by the screening engine and the
// fiscal regime sandbox since EC2-5; the Suite reads its band and status
// names from here rather than restating them.
export * from '../../packages/engines/engines/economics/irrContract.js';
