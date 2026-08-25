// One-time importer from the legacy hand-created Well Planning tables
// (wells + well_targets; no repo DDL, per-user, WD1 audit) into the
// migration-managed wp_* family. trajectory_plans is deliberately
// ignored: the audit found no writer ever existed in this codebase, so
// its rows are stale demo data.
//
// Everything lands under one site named 'Imported wells' with CRS null
// (the registry's legacy-unknown convention: badge, not block). Targets
// import as point targets with provenance {source:'legacy'}. Legacy
// tables stay untouched; a later cleanup wave drops them.

import { supabase } from '@/lib/customSupabaseClient';
import * as wpApi from './wpApi';

export async function scanLegacyData(userId) {
  const [{ data: wells, error: e1 }, { data: targets, error: e2 }] = await Promise.all([
    supabase.from('wells').select('id, name, depth_unit, surface_x, surface_y, kb_elev, crs, status').eq('user_id', userId),
    supabase.from('well_targets').select('*'),
  ]);
  if (e1 && e2) return { wells: [], targets: [] }; // legacy tables gone: nothing to do
  return { wells: wells || [], targets: (targets || []).filter((t) => (wells || []).some((w) => w.id === t.well_id)) };
}

const LEGACY_STATUS = {
  Planning: 'planning', Drilling: 'drilling', Approved: 'planning',
  Completed: 'completed', Abandoned: 'abandoned',
};

export async function importLegacyData(userId, { wells, targets }, onProgress) {
  const site = await wpApi.saveSite({
    name: 'Imported wells',
    description: 'One-time import from the legacy Well Planning tables.',
    crs: wells.find((w) => w.crs)?.crs || null,
    north_reference: 'grid',
  }, userId);

  let done = 0;
  const wellboreBySourceId = {};
  for (const w of wells) {
    const wb = await wpApi.saveWellbore({
      site_id: site.id,
      name: w.name,
      head_x: Number.isFinite(w.surface_x) ? w.surface_x : null,
      head_y: Number.isFinite(w.surface_y) ? w.surface_y : null,
      kb_elev_m: Number.isFinite(w.kb_elev) ? w.kb_elev : 0,
      depth_unit: w.depth_unit === 'feet' ? 'ft' : 'm',
      azimuth_reference: 'grid',
      status: LEGACY_STATUS[w.status] || 'planning',
      notes: `Imported from legacy wells table (${w.id}).`,
    }, userId);
    wellboreBySourceId[w.id] = wb;
    done += 1;
    onProgress?.(done, wells.length + targets.length);
  }

  for (const t of targets) {
    await wpApi.saveTarget({
      site_id: site.id,
      name: t.name || 'Imported target',
      kind: t.tolerance_radius_m > 0 ? 'circle' : 'point',
      category: 'geological',
      center_x: Number.isFinite(t.x) ? t.x : 0,
      center_y: Number.isFinite(t.y) ? t.y : 0,
      // Legacy stored TVD below KB; without a reliable legacy datum we
      // keep the value and record the caveat in provenance.
      tvdss_m: Number.isFinite(t.tvdss_m) ? t.tvdss_m : (t.tvd_m || 0),
      geometry: t.tolerance_radius_m > 0 ? { radius_m: t.tolerance_radius_m } : null,
      dip_deg: Number.isFinite(t.dip) ? t.dip : null,
      dip_azimuth_deg: Number.isFinite(t.azimuth) ? t.azimuth : null,
      provenance: {
        source: 'legacy',
        legacy_target_id: t.id,
        legacy_well_id: t.well_id,
        tvd_basis: Number.isFinite(t.tvdss_m) ? 'tvdss' : 'tvd_below_kb_unverified',
      },
      notes: t.notes || null,
    }, userId);
    done += 1;
    onProgress?.(done, wells.length + targets.length);
  }

  return { site, count: done };
}
