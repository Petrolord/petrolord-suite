// Restorable backup (Project Portability PP4, PLAN §6 PP4 row, as amended by
// the owner: the offboarding dump is untouched; these doors sit beside it).
//
//   discoverBackupRoots(scope)   every root the caller can read, across all
//                                families: 'mine' = rows the caller owns,
//                                'org' = mine plus rows shared with the
//                                caller's organization
//   buildBackup(source, scope)   one logical .pld over the largest root set,
//                                split into parts above the part size
//
// What a client-side backup cannot contain: other members' PRIVATE rows.
// Row-level security hides them from everyone but their owner, admin or
// not. The offboarding dump (service role) is the tool for that, and a
// restore of members' private rows into another organization would change
// their ownership anyway. Restore = Import package on the Data Export page,
// private or shared with the organization.

import { listWells } from '@/lib/wellsRegistry';
import { listSurfaces } from '@/lib/surfacesRegistry';
import { listCulture } from '@/lib/cultureRegistry';
import { listRootCandidates } from './rootsCatalog';
import { buildPackageInto } from './exportPackage';
import { PackageSet, DEFAULT_PART_BYTES } from './packageSet';

/** Root kinds a backup enumerates, beyond wells, surfaces and culture. */
export const BACKUP_KINDS = [
  'petro_project', 'pp_project', 'rp_project', 'correlation_section',
  'seismic_project', 'seismic_volume', 'seismic_line',
  'wp_site', 'po_field', 'epe_case', 'epe_assumption_set', 'sim_case', 'saved_project',
];

const mineOnly = (scope) => scope === 'mine';

/**
 * @param {'mine'|'org'} scope
 * @param {{ userId: string }} who
 * @returns {Promise<Array<{kind, id, name, table?}>>}
 */
export async function discoverBackupRoots(scope, who, deps = {}) {
  const wellsFn = deps.listWells || listWells;
  const surfacesFn = deps.listSurfaces || listSurfaces;
  const cultureFn = deps.listCulture || listCulture;
  const candidatesFn = deps.listRootCandidates || listRootCandidates;
  const keep = (r) => (mineOnly(scope) ? (r.is_own ?? r.mine ?? (r.user_id ? r.user_id === who.userId : true)) : true);
  const roots = [];
  const safe = async (fn) => { try { return await fn(); } catch (e) { return []; } };

  for (const w of await safe(wellsFn)) if (keep(w)) roots.push({ kind: 'well', id: w.id, name: w.name || w.uwi || null });
  for (const s of await safe(surfacesFn)) if (keep({ ...s, mine: s.user_id === who.userId })) roots.push({ kind: 'surface', id: s.id, name: s.name || null });
  for (const c of await safe(cultureFn)) if (keep({ ...c, mine: c.user_id === who.userId })) roots.push({ kind: 'culture', id: c.id, name: c.name || null });
  for (const kind of BACKUP_KINDS) {
    const items = await safe(() => candidatesFn(kind));
    for (const it of items) {
      if (!keep(it)) continue;
      roots.push({ kind: it.kind || kind, id: it.id, name: it.name || null, ...(it.table ? { table: it.table } : {}) });
    }
  }
  // interpretation roots are redundant when their wells are already roots (the
  // Geoscience hook brings them) but harmless: the collector dedupes rows
  return roots;
}

/**
 * Build a backup over the discovered roots. Returns
 * { set, manifest, collection, refs, roots } ; save with savePackageSet.
 */
export async function buildBackup(source, scope, { who, name = null, partBytes = DEFAULT_PART_BYTES, onProgress = () => {}, deps } = {}) {
  onProgress('Listing everything you can back up');
  const roots = await discoverBackupRoots(scope, who, deps);
  if (!roots.length) throw new Error(scope === 'mine' ? 'You have nothing to back up yet.' : 'There is nothing shared with your organization to back up yet.');
  const set = new PackageSet({ partBytes });
  const label = name || (scope === 'mine' ? 'My Petrolord work' : 'Organization backup');
  const built = await buildPackageInto(set, source, roots, { name: label, includeInterpretations: true, includeSidecars: true, onProgress, allowDangling: false, dedupeRoots: true });
  return { ...built, set, roots };
}
