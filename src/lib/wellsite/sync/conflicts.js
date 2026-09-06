// Conflict detection (WS6, spec section 38): after every pull and every
// local versioned commit. A chain with two heads (nobody names them as
// previous, nobody resolves them) is a conflict; so are two open official
// calls or two finals for one formation. Observations never conflict.
// The same rule is the server's ws_conflicts view.

import { chainHeads } from '../records';
import { topConflicts } from '../tops';

const VERSIONED = new Set(['interpretation', 'decision', 'narrative', 'event']);

export function recordConflicts(records) {
  const out = [];
  const byChain = new Map();
  for (const r of records) {
    if (!VERSIONED.has(r.kind)) continue;
    if (!byChain.has(r.chain_id)) byChain.set(r.chain_id, []);
    byChain.get(r.chain_id).push(r);
  }
  for (const [chainId, list] of byChain) {
    const heads = chainHeads(list);
    if (heads.length > 1) out.push({ id: `record:${chainId}`, entity: 'record', kind: list[0].kind, subtype: list[0].subtype || null, chain_id: chainId, conflict: 'chain_heads', head_ids: heads.map((h) => h.id), well_id: list[0].well_id });
  }
  return out;
}

/** Recompute and store the conflicts of a well; returns them. */
export async function detectConflicts(db, wellId) {
  const records = await db.records.where('[well_id+kind+occurred_at]').between([wellId, ''], [wellId, '￿']).toArray();
  const tops = await db.tops.where('[well_id+formation_key]').between([wellId, ''], [wellId, '￿']).toArray();
  const list = [
    ...recordConflicts(records),
    ...topConflicts(tops).map((c) => ({ id: `top:${c.chainId || c.formationKey}:${c.kind}`, entity: 'top', kind: 'top', subtype: c.formationKey, chain_id: c.chainId, conflict: c.kind, head_ids: c.headIds, well_id: wellId })),
  ];
  await db.transaction('rw', db.conflicts, async () => {
    await db.conflicts.where('well_id').equals(wellId).delete();
    if (list.length) await db.conflicts.bulkPut(list.map((c) => ({ ...c, detected_at: Date.now() })));
  });
  return list;
}
