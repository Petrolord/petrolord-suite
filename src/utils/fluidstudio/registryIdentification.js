/**
 * Identification of a Fluid Systems Studio project proposed from the
 * shared wells registry (FLUID-U2-025). It only proposes: the Report tab
 * shows each value beside the one typed, and nothing changes until the
 * user ticks and applies it (the Well Test pattern, utils/welltest/registryProposal.js).
 *
 * Pure.
 */

/**
 * @param {{well: ?object, zones?: object[], zoneId?: ?string, identification: object}} a
 *   well: a geo_wells row; zones: its zone rows (name, top_md_m, base_md_m)
 * @returns {?{wellId: string, rows: Array<{key: string, label: string, value: string, current: string, same: boolean}>}}
 */
export function proposeFluidIdentification({ well, zones = [], zoneId = null, identification = {} }) {
  if (!well) return null;
  const rows = [];
  const add = (key, label, value) => {
    if (!value) return;
    const current = String(identification?.[key] ?? '').trim();
    rows.push({ key, label, value, current, same: current === value });
  };
  add('well', 'Well', well.uwi ? `${well.name} (${well.uwi})` : well.name);
  const zone = zones.find((z) => String(z.id) === String(zoneId));
  if (zone) {
    add('reservoir', 'Reservoir or zone', zone.name);
    if (Number.isFinite(zone.top_md_m) && Number.isFinite(zone.base_md_m)) {
      add('sampleDepth', 'Sample depth and reference', `${zone.name}: ${Math.round(zone.top_md_m / 0.3048).toLocaleString('en-US')} to ${Math.round(zone.base_md_m / 0.3048).toLocaleString('en-US')} ft MD below the depth reference of ${well.name}`);
    }
  }
  return { wellId: well.id, wellName: well.name, rows };
}

/** The identification after the ticked rows are applied; the registry well is remembered. */
export function applyFluidIdentification(identification, proposal, picked) {
  const next = { ...identification };
  for (const r of proposal?.rows || []) if (picked[r.key] && !r.same) next[r.key] = r.value;
  if (proposal) { next.registryWellId = proposal.wellId || ''; next.registryWellName = proposal.wellName || ''; }
  return next;
}
