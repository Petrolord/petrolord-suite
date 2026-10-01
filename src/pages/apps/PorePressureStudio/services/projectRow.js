// pp_projects row helpers (AppUpgrade PP-U1-015, PL9). The table has a
// well_ids uuid[] column, which is how a .pld of a well finds the app state
// that belongs with it (portability geoscienceSpec: well_ids overlap) and
// how a project exported on its own carries its well. The app never wrote
// it, so every saved project had well_ids '{}': a well's package left the
// pore pressure project behind, and a project package arrived without its
// well. Pure.

/** The well ids a save should record: the source well first, then any kept. */
export function projectWellIds(patch, existing = null) {
  const out = [];
  const add = (id) => { if (id && typeof id === 'string' && !out.includes(id)) out.push(id); };
  if (patch?.source?.kind === 'well') add(patch.source.wellId);
  for (const id of existing?.well_ids || []) add(id);
  return out;
}
