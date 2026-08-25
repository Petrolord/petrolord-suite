// Publish a Well Design Studio trajectory into the geo_wells registry
// (WD5): the bridge that makes a plan a first-class geoscience well —
// visible in Well Data Manager, co-rendered in Seismolord's cube and
// sections, usable by petrophysics and correlation. BRIDGE, not merge:
// wp_wellbores.geo_well_id remembers the registry row; republish
// updates that same row (deviation + header), never a duplicate.
// Optional checkshot borrow copies another registry well's
// time-depth so the published well can hang in time domains.

import {
  saveWell, updateWell, getWell,
} from '@/lib/wellsRegistry';
import { updateWellbore, updateDesign } from './wpApi';

export const PUBLISH_ENGINE = 'well-design-studio-wd5';

/**
 * Pure payload builder (jest-tested): the geo_wells shape for a design's
 * grid-metre stations. Deviation is the registry contract ({md, inc,
 * azi} ascending, grid azimuths, metres) — the same shape Seismolord's
 * lattice path builder consumes.
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

/**
 * Publish (or republish) the trajectory. Returns {geoWell, created,
 * borrowedCheckshots}. Side effects: geo_wells row created/updated,
 * wp_wellbores.geo_well_id stamped on first publish, the design row
 * stamped published_geo_well_id + published_at.
 */
export async function publishPlan({
  site, wellbore, design, stations, source = 'plan', borrowFromWellId = null,
}) {
  const publishedAt = new Date().toISOString();
  const payload = preparePublishPayload({
    site, wellbore, design, stations, source, publishedAt,
  });

  let geoWell;
  let created = false;
  if (wellbore.geo_well_id) {
    geoWell = await updateWell(wellbore.geo_well_id, publishPatchFromPayload(payload));
  } else {
    geoWell = await saveWell(payload);
    created = true;
    await updateWellbore(wellbore.id, { geo_well_id: geoWell.id });
  }

  let borrowedCheckshots = 0;
  if (borrowFromWellId && borrowFromWellId !== geoWell.id) {
    const donor = await getWell(borrowFromWellId);
    if (Array.isArray(donor.checkshots) && donor.checkshots.length) {
      geoWell = await updateWell(geoWell.id, {
        checkshots: donor.checkshots,
        crs_provenance: {
          ...payload.crsProvenance,
          checkshots_borrowed_from: { well_id: donor.id, name: donor.name },
        },
      });
      borrowedCheckshots = donor.checkshots.length;
    }
  }

  if (design?.id) {
    await updateDesign(design.id, {
      published_geo_well_id: geoWell.id,
      published_at: publishedAt,
    });
  }
  return { geoWell, created, borrowedCheckshots };
}
