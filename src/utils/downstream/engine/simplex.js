// Re-export shim — this solver lives in the central @petrolord/engines repo, vendored at packages/engines (git subtree). Never edit the vendored copy from the Suite; changes go to Petrolord/petrolord-engines and are subtree-pulled.
export * from '../../../../packages/engines/lib/lp/simplex.js';
