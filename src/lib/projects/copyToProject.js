// Suite Projects P3: copy wells, surfaces and culture layers into another
// project, with provenance. It is the .pld round trip run in memory: the
// selected roots are packaged (a well brings its logs, tops, zones and
// intervals; curve samples and grids are real copies under new ids and new
// storage paths) and imported into the target project. Every copied row gets
// provenance.imported_from (package, source owner, time, build), and a name
// already used in the target is imported as "<name> (imported)".
// Seismic volumes are moved, never copied (their bricks run to gigabytes).
import { makeSupabaseSource } from '@/lib/portability/supabaseSource';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { makeSupabaseSink } from '@/lib/portability/supabaseSink';
import { importPackage } from '@/lib/portability/importPackage';

export const COPYABLE = Object.freeze([
  { table: 'geo_wells', kind: 'well', label: 'Wells' },
  { table: 'geo_surfaces', kind: 'surface', label: 'Surfaces' },
  { table: 'geo_culture', kind: 'culture', label: 'Culture' },
]);

export const isCopyable = (table) => COPYABLE.some((c) => c.table === table);

/**
 * @param {{table: string, ids: string[], target: {id: string, name: string}, sourceName?: string,
 *   onProgress?: Function, deps?: Object}} p
 * @returns {Promise<{copied: number, notes: string[]}>}
 */
export async function copyToProject({ table, ids, target, sourceName = null, onProgress = () => {}, deps = {} }) {
  const spec = COPYABLE.find((c) => c.table === table);
  if (!spec) throw new Error('Only wells, surfaces and culture layers can be copied. Move seismic instead.');
  if (!ids?.length) return { copied: 0, notes: [] };
  if (!target?.id) throw new Error('Choose the project to copy into.');
  const source = (deps.makeSource || makeSupabaseSource)();
  const roots = ids.map((id) => ({ kind: spec.kind, id }));
  const name = `Copy${sourceName ? ` from ${sourceName}` : ''} to ${target.name}`;
  const { writer } = await (deps.build || buildGeosciencePackage)(source, roots, {
    name, includeInterpretations: false, includeSidecars: false, onProgress,
  });
  const bytes = await writer.toUint8Array();
  const sink = (deps.makeSink || makeSupabaseSink)({ projectId: target.id });
  const { plan, summary } = await (deps.importer || importPackage)(bytes, sink, { onProgress });
  const copied = (plan?.planned?.[table] || []).length;
  return { copied, notes: plan?.notes || [], summary };
}
