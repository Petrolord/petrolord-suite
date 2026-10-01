// Earth Modeling prospect provenance in ReservoirCalc Pro (upgrade U2-004,
// 2026-10-01). Earth Modeling's handoff (src/lib/earthModelProspect.js,
// EM U2-009) fills the simple-method inputs from one model zone. This
// module keeps where they came from with the case: the model, zone, date,
// wells and the model's own flags (open edge, spill, no OWC, per-block
// contacts), so they are saved with the project, printed in the reviewer
// block and repeated with the results. If the user then edits the inputs
// the provenance says so instead of claiming the model's numbers. Pure.

const KEYS = ['area', 'thickness', 'ntg', 'porosity', 'sw', 'fvf', 'bg', 'gasCapFraction', 'owc', 'goc', 'fluidType'];

/** The provenance record stored as inputs.emProspect. */
export function provenanceFromPayload(payload, zoneIndex, inputs) {
  const z = payload?.zones?.[zoneIndex] || {};
  const set = {};
  for (const k of KEYS) if (inputs[k] !== undefined) set[k] = inputs[k];
  return {
    schema: payload?.schema || null,
    id: payload?.id || null,
    model: payload?.model?.name || null,
    zone: z.name || `zone ${zoneIndex + 1}`,
    zoneIndex,
    createdAt: payload?.createdAt || null,
    wells: payload?.wells || [],
    flags: z.flags || [],
    unitSystem: inputs.__unitSystem || null,
    set,
  };
}

/** Inputs the user changed after the handoff (names), or []. */
export function editedSince(prov, inputs) {
  if (!prov?.set) return [];
  const out = [];
  for (const [k, v] of Object.entries(prov.set)) {
    const now = inputs?.[k];
    const same = typeof v === 'number' && typeof now === 'number' ? Math.abs(now - v) <= 1e-9 * Math.max(1, Math.abs(v)) : now === v;
    if (!same) out.push(k);
  }
  return out;
}

/** Lines for the reviewer block and the result warnings. */
export function provenanceLines(inputs, { withFlags = true } = {}) {
  const p = inputs?.emProspect;
  if (!p) return [];
  const edited = editedSince(p, inputs);
  const lines = [
    `Inputs from Earth Modeling: model ${p.model || 'unnamed'}, ${p.zone}${p.createdAt ? `, sent ${p.createdAt.slice(0, 10)}` : ''}${p.id ? ` (handoff ${p.id})` : ''}${p.wells?.length ? `; wells ${p.wells.join(', ')}` : ''}.`,
    edited.length ? `Edited since the handoff: ${edited.join(', ')}; these volumes no longer reproduce the model.` : 'Unchanged since the handoff: the volumes reproduce the model zone.',
  ];
  if (withFlags) for (const f of p.flags || []) lines.push(`Earth Modeling: ${f}`);
  return lines;
}
