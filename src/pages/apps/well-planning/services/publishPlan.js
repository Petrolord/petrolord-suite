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

export {
  PUBLISH_ENGINE, preparePublishPayload, publishPatchFromPayload,
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
