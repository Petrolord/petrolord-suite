// Project CRS change (CRS program, Phase 7): the Petrel-style
// reproject-or-block flow. Once CRS-tagged data exists, the Project CRS
// changes only through here, which converts every owned, tagged dataset
// into the new system:
//   wells    surface XY transformed, deviation untouched (azimuths are
//            grid-relative; the grid rotation between projected CRSs is
//            the convergence difference, recorded in the chain and
//            applied to stored azimuths)
//   surfaces grid reprojected by inverse mapping, storage object
//            replaced, frame row updated
//   seismic  affine refit from the NATIVE declaration (never chained
//            through the old project CRS, so error cannot accumulate);
//            both survey_meta and the storage manifest are patched;
//            traces untouched
//   models   fault polygons transformed; the model grids themselves are
//            recomputed from surfaces on load, so retagging suffices
// UNKNOWN and LOCAL rows are skipped and reported, never guessed at.
//
// Idempotent: every write stamps the new tag and appends to
// crs_provenance.transform_chain; a resumed run skips rows already
// tagged with the target.

import { supabase } from '@/lib/customSupabaseClient';
import { normalizeTag, isTransformableTag } from '@/lib/crs/tags';
import {
  getTransformer, reprojectSurveyAffine, reprojectSurfaceGrid,
  convergenceAt, crsUnit, crsDisplayName,
} from '@/lib/crs';
import { toGridAzimuths } from '../../../packages/engines/engines/seismolord/wellPath';
import { surveyAffine, affineToManifest } from '../../../packages/engines/engines/seismolord/surveyGeometry';
import { getProjectCrs, setProjectCrs } from '@/lib/crs/settingsService';

const chainEntry = (fromTag, toTag) => ({
  from: fromTag, to: toTag, transform: 'proj4', date: new Date().toISOString(),
});

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to reproject project data.');
  return user;
}

async function listOwnTagged(table, userId) {
  const { data, error } = await supabase.from(table)
    .select('*').eq('user_id', userId).not('crs', 'is', null);
  if (error) throw new Error(`Could not list ${table}: ${error.message}`);
  return data || [];
}

/**
 * Reproject all owned, CRS-tagged data into toTag, then move the
 * Project CRS setting. Returns a per-registry report.
 *
 * @param {{toTag: string, onProgress?: (p: {step: string, done: number,
 *   total: number}) => void}} p
 */
export async function reprojectProjectData({ toTag, onProgress = () => {} }) {
  const target = normalizeTag(toTag);
  if (!isTransformableTag(target)) {
    throw new Error('The new Project CRS must be a specific, transformable system.');
  }
  const user = await requireUser();
  const { customDefs } = await getProjectCrs();
  const report = {
    wells: { converted: 0, skipped: 0 },
    surfaces: { converted: 0, skipped: 0 },
    volumes: { converted: 0, skipped: 0 },
    models: { converted: 0, skipped: 0 },
    skippedNames: [],
  };
  const transformerTo = (fromTag) => getTransformer(fromTag, target, customDefs);

  // ---- wells -------------------------------------------------------------
  const wells = await listOwnTagged('geo_wells', user.id);
  for (let i = 0; i < wells.length; i += 1) {
    const w = wells[i];
    onProgress({ step: 'wells', done: i, total: wells.length });
    const from = normalizeTag(w.crs);
    if (from === target) continue;
    if (!isTransformableTag(from)) {
      report.wells.skipped += 1;
      report.skippedNames.push(`${w.name} (${from})`);
      continue;
    }
    const t = transformerTo(from);
    const s = t.forward(w.surface_x, w.surface_y);
    // Stored azimuths are grid-relative; rotate them by the convergence
    // difference between the two grids at the wellhead.
    const dGamma = convergenceAt(target, s.x, s.y, customDefs)
      - convergenceAt(from, w.surface_x, w.surface_y, customDefs);
    const deviation = (w.deviation || []).length
      ? toGridAzimuths(w.deviation, { azimuthRef: 'true', convergenceDeg: dGamma })
      : w.deviation;
    const provenance = {
      ...(w.crs_provenance || {}),
      transform_chain: [...(w.crs_provenance?.transform_chain || []), {
        ...chainEntry(from, target), azimuth_rotation_deg: dGamma,
      }],
    };
    const { error } = await supabase.from('geo_wells')
      .update({
        surface_x: s.x, surface_y: s.y, deviation,
        crs: target, xy_unit: crsUnit(target, customDefs), crs_provenance: provenance,
      })
      .eq('id', w.id);
    if (error) throw new Error(`Could not reproject well ${w.name}: ${error.message}`);
    report.wells.converted += 1;
  }

  // ---- surfaces ----------------------------------------------------------
  const surfaces = await listOwnTagged('geo_surfaces', user.id);
  for (let i = 0; i < surfaces.length; i += 1) {
    const s = surfaces[i];
    onProgress({ step: 'surfaces', done: i, total: surfaces.length });
    const from = normalizeTag(s.crs);
    if (from === target) continue;
    if (!isTransformableTag(from)) {
      report.surfaces.skipped += 1;
      report.skippedNames.push(`${s.name} (${from})`);
      continue;
    }
    const { data: blob, error: dlError } = await supabase.storage.from('surfaces')
      .download(s.storage_path);
    if (dlError) throw new Error(`Could not download surface ${s.name}: ${dlError.message}`);
    const z = new Float32Array(await blob.arrayBuffer());
    const r = reprojectSurfaceGrid({
      spec: { x0: s.origin_x, y0: s.origin_y, dx: s.dx, dy: s.dy, nx: s.nx, ny: s.ny },
      z,
      fromTag: from,
      toTag: target,
      customDefs,
      opts: { nativeUnit: s.xy_unit || 'm' },
    });
    const { error: upError } = await supabase.storage.from('surfaces')
      .update(s.storage_path, new Blob([r.z.buffer], { type: 'application/octet-stream' }), {
        contentType: 'application/octet-stream',
      });
    if (upError) throw new Error(`Could not store reprojected grid for ${s.name}: ${upError.message}`);
    const provenance = {
      ...(s.crs_provenance || {}),
      transform_chain: [...(s.crs_provenance?.transform_chain || []), {
        ...chainEntry(from, target), coverage: r.coverage,
      }],
    };
    const { error } = await supabase.from('geo_surfaces')
      .update({
        origin_x: r.spec.x0, origin_y: r.spec.y0, dx: r.spec.dx, dy: r.spec.dy,
        nx: r.spec.nx, ny: r.spec.ny,
        crs: target, xy_unit: crsUnit(target, customDefs), crs_provenance: provenance,
      })
      .eq('id', s.id);
    if (error) throw new Error(`Could not reproject surface ${s.name}: ${error.message}`);
    report.surfaces.converted += 1;
  }

  // ---- seismic volumes ---------------------------------------------------
  const volumes = await listOwnTagged('seismic_volumes', user.id);
  for (let i = 0; i < volumes.length; i += 1) {
    const v = volumes[i];
    onProgress({ step: 'volumes', done: i, total: volumes.length });
    const from = normalizeTag(v.crs);
    if (from === target) continue;
    if (!isTransformableTag(from)) {
      report.volumes.skipped += 1;
      report.skippedNames.push(`${v.name} (${from})`);
      continue;
    }
    const meta = v.survey_meta || {};
    // Always from NATIVE: the original declaration, or the current
    // frame when the volume was imported without a transform.
    const nativeTag = normalizeTag(meta.crs?.native) !== 'UNKNOWN'
      ? normalizeTag(meta.crs.native) : from;
    const nativeAffine = meta.crs?.native_affine
      ? surveyAffine({ affine: meta.crs.native_affine })
      : surveyAffine(meta);
    const nativeCorners = meta.crs?.native_corners || meta.corners;
    if (!nativeAffine) {
      report.volumes.skipped += 1;
      report.skippedNames.push(`${v.name} (no usable survey geometry)`);
      continue;
    }
    const r = reprojectSurveyAffine({
      affine: nativeAffine,
      nIl: meta.il?.count || 2,
      nXl: meta.xl?.count || 2,
      fromTag: nativeTag,
      toTag: target,
      customDefs,
    });
    const t = getTransformer(nativeTag, target, customDefs);
    const corners = {};
    for (const key of ['first', 'last']) {
      const c = nativeCorners?.[key];
      corners[key] = c && Number.isFinite(c.x) ? { ...t.forward(c.x, c.y) } : c;
    }
    const crsBlock = {
      project: target,
      native: nativeTag,
      native_affine: meta.crs?.native_affine || affineToManifest(nativeAffine),
      native_corners: nativeCorners,
      native_xy_unit: meta.crs?.native_xy_unit || crsUnit(nativeTag, customDefs),
      transform: 'proj4',
      max_residual_m: r.maxResidualM,
    };
    const surveyMeta = {
      ...meta, corners, affine: affineToManifest(r.affine), crs: crsBlock,
    };
    // Patch the storage manifest too — it is what every viewer reads.
    const manifestPath = `${v.storage_path}/manifest.json`;
    const { data: mBlob } = await supabase.storage.from('seismic').download(manifestPath);
    if (mBlob) {
      const manifest = JSON.parse(await mBlob.text());
      manifest.geometry.affine = affineToManifest(r.affine);
      manifest.geometry.corners = corners;
      manifest.geometry.crs = crsBlock;
      await supabase.storage.from('seismic').update(
        manifestPath,
        new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }),
        { contentType: 'application/json' },
      );
    }
    const { error } = await supabase.from('seismic_volumes')
      .update({ crs: target, survey_meta: surveyMeta })
      .eq('id', v.id);
    if (error) throw new Error(`Could not reproject volume ${v.name}: ${error.message}`);
    report.volumes.converted += 1;
  }

  // ---- earth models ------------------------------------------------------
  const models = await listOwnTagged('em_models', user.id);
  for (let i = 0; i < models.length; i += 1) {
    const m = models[i];
    onProgress({ step: 'models', done: i, total: models.length });
    const from = normalizeTag(m.crs);
    if (from === target) continue;
    if (!isTransformableTag(from)) {
      report.models.skipped += 1;
      report.skippedNames.push(`${m.name} (${from})`);
      continue;
    }
    const t = transformerTo(from);
    const definition = {
      ...m.definition,
      faultPolygons: (m.definition?.faultPolygons || []).map((p) => ({
        ...p,
        vertices: (p.vertices || []).map(([x, y]) => {
          const q = t.forward(x, y);
          return [q.x, q.y];
        }),
      })),
    };
    const { error } = await supabase.from('em_models')
      .update({ definition, crs: target })
      .eq('id', m.id);
    if (error) throw new Error(`Could not retag model ${m.name}: ${error.message}`);
    report.models.converted += 1;
  }

  // Data first, setting last: an interrupted run leaves the old Project
  // CRS in place with some rows already carrying the new tag — a rerun
  // skips those and finishes the rest.
  await setProjectCrs({
    tag: target,
    name: crsDisplayName(target, customDefs),
    xyUnit: crsUnit(target, customDefs),
    allowWithData: true,
  });
  onProgress({ step: 'done', done: 1, total: 1 });
  return report;
}
