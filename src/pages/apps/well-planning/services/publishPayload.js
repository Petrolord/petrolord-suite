// Pure publish-payload builders (WD6 split from publishPlan.js so the
// e2e spec can import them in node without the Supabase client — no
// '@' aliases or I/O here). publishPlan.js re-exports these; consumers
// keep their import paths.

export const PUBLISH_ENGINE = 'well-design-studio-wd5';

/**
 * The geo_wells shape for a design's grid-metre stations. Deviation is
 * the registry contract ({md, inc, azi} ascending, grid azimuths,
 * metres) — the same shape Seismolord's lattice path builder consumes.
 */
export function preparePublishPayload({
  site, wellbore, design, stations, source = 'plan', publishedAt = null,
}) {
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('Publishing needs at least 2 trajectory stations.');
  }
  for (let i = 1; i < stations.length; i++) {
    if (!(stations[i].md > stations[i - 1].md)) {
      throw new Error(`Stations must have ascending MD (station ${i}).`);
    }
  }
  if (!Number.isFinite(wellbore?.head_x) || !Number.isFinite(wellbore?.head_y)) {
    throw new Error('The wellbore has no wellhead coordinates; set them before publishing.');
  }
  const deviation = stations.map((s) => ({
    md: +s.md.toFixed(3), inc: +s.inc.toFixed(4), azi: +((s.azi % 360 + 360) % 360).toFixed(4),
  }));
  return {
    name: wellbore.name,
    uwi: wellbore.uwi || null,
    surfaceX: wellbore.head_x,
    surfaceY: wellbore.head_y,
    kbM: wellbore.kb_elev_m ?? 0,
    tdMdM: deviation[deviation.length - 1].md,
    crs: site?.crs || null,
    xyUnit: site?.xy_unit || null,
    crsProvenance: {
      source: PUBLISH_ENGINE,
      site_id: site?.id ?? null,
      wellbore_id: wellbore.id ?? null,
      design_id: design?.id ?? null,
      design_revision: design?.revision ?? null,
      trajectory_source: source,
      published_at: publishedAt,
    },
    crsNote: `Published from Well Design Studio (${design?.name ?? 'design'} r${design?.revision ?? '?'}, ${source}).`,
    unitsNote: 'Deviation: MD metres, azimuths grid north.',
    deviation,
  };
}

/** The registry PATCH shape for a republish onto an existing row. */
export function publishPatchFromPayload(payload) {
  return {
    name: payload.name,
    uwi: payload.uwi,
    surface_x: payload.surfaceX,
    surface_y: payload.surfaceY,
    kb_m: payload.kbM,
    td_md_m: payload.tdMdM,
    crs: payload.crs,
    xy_unit: payload.xyUnit,
    crs_provenance: payload.crsProvenance,
    crs_note: payload.crsNote,
    units_note: payload.unitsNote,
    deviation: payload.deviation,
  };
}
