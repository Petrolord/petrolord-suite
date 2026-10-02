// Publish a Well Design Studio trajectory into the geo_wells registry
// (WD5): the bridge that makes a plan a first-class geoscience well —
// visible in Well Data Manager, co-rendered in Seismolord's cube and
// sections, usable by petrophysics and correlation. BRIDGE, not merge:
// wp_wellbores.geo_well_id remembers the registry row; republish
// updates that same row (deviation + header), never a duplicate.
// Optional checkshot borrow copies another registry well's
// time-depth so the published well can hang in time domains.

import { saveWell, updateWell, getWell, updateWellData, updateWellDatum } from '@/lib/wellsRegistry';
import { readWellDatum, refElevOrNull, datumChangeImpact, datumChangeRecord, datumLine } from '@/lib/wellDatum';
import { updateWellbore, updateDesign } from './wpApi';

export {
  PUBLISH_ENGINE, preparePublishPayload, publishPatchFromPayload, wellboreDatum,
} from './publishPayload';

import {
  preparePublishPayload, publishPatchFromPayload,
} from './publishPayload';

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
  let datumNote = null;
  if (wellbore.geo_well_id) {
    let before = null;
    try { before = await getWell(wellbore.geo_well_id); } catch { before = null; }
    const patch = publishPatchFromPayload(payload);
    // datum corrections recorded before the registry upgrade ride in crs_provenance: keep them
    if (Array.isArray(before?.crs_provenance?.datum_changes)) patch.crs_provenance = { ...patch.crs_provenance, datum_changes: before.crs_provenance.datum_changes };
    geoWell = await updateWell(wellbore.geo_well_id, patch);
    if (payload.datum) {
      const reg = readWellDatum(geoWell);
      const stated = reg.state === 'set' || reg.state === 'legacy-kb';
      if (!stated) {
        // the registry well has no reference elevation yet: the wellbore's becomes it, on record
        const impact = datumChangeImpact(geoWell, payload.datum);
        const record = datumChangeRecord(geoWell, payload.datum, { app: 'well-design-studio', reason: `published from ${design?.name ?? 'a design'}`, impact });
        ({ row: geoWell } = await updateWellDatum(geoWell, payload.datum, { record }));
        datumNote = `Depth reference set from the wellbore: ${datumLine(readWellDatum(geoWell))}.`;
      } else if (Math.abs(reg.refElevM - payload.datum.refElevM) > 1e-6) {
        datumNote = `The registry well keeps its depth reference (${datumLine(reg)}); this wellbore says KB ${payload.datum.refElevM} m. A depth reference is corrected in Well Data Manager, which shows what moves first.`;
      }
    }
  } else {
    geoWell = await saveWell(payload);
    created = true;
    await updateWellbore(wellbore.id, { geo_well_id: geoWell.id });
  }

  let borrowedCheckshots = 0;
  if (borrowFromWellId && borrowFromWellId !== geoWell.id) {
    const donor = await getWell(borrowFromWellId);
    if (Array.isArray(donor.checkshots) && donor.checkshots.length) {
      // A borrowed table is a COPY keyed on TVDSS/TWT: the donor's MDs do
      // not apply to this wellbore, so md_m is stripped and the provenance
      // says where the rows came from (PT1). crs_provenance keeps carrying
      // the borrow note for the CRS badge as before.
      const rows = donor.checkshots.map(({ tvdss_m, twt_ms }) => ({ tvdss_m, twt_ms }));
      const donorUnits = donor.checkshots_provenance?.units_in || { depth_ref: 'tvdss', time: 'twt', depth_unit: 'm' };
      geoWell = await updateWellData(geoWell.id, {
        checkshots: rows,
        checkshotsProvenance: {
          units_in: donorUnits,
          source: 'well-planning-borrow',
          kb_m_used: refElevOrNull(donor) ?? 0,
          deviation_stations_used: 0,
          edited_at: publishedAt,
          note: `borrowed from ${donor.name}`,
        },
      });
      geoWell = await updateWell(geoWell.id, {
        crs_provenance: {
          ...payload.crsProvenance,
          checkshots_borrowed_from: { well_id: donor.id, name: donor.name },
        },
      });
      borrowedCheckshots = rows.length;
    }
  }

  if (design?.id) {
    await updateDesign(design.id, {
      published_geo_well_id: geoWell.id,
      published_at: publishedAt,
    });
  }
  return { geoWell, created, borrowedCheckshots, datumNote };
}
