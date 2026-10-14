// QI Studio reads (QI programme Q1 / A4): the shared wells registry (wells,
// curve metadata, zones, tops), Seismolord's volumes and the surfaces
// registry. Read only: QI Studio never edits another app's records. The one
// write is a new derived volume for an inversion (Q8a), registered as
// Seismolord registers an attribute volume, which the seismic worker fills.

import { listWells, listLogs, listZones, listTops, downloadCurve } from '@/lib/wellsRegistry';
import { supabase } from '@/lib/customSupabaseClient';
import { getManifest, deleteVolume } from '@/pages/apps/Seismolord/services/volumesService';
import { listHorizons } from '@/pages/apps/Seismolord/services/horizonsService';
import { assertQuota } from '@/pages/apps/Seismolord/services/seismicStorage';
import { assertFloat32Parent, derivedStorageBytes } from '@/pages/apps/Seismolord/services/attributeSurveyMeta';
import { volumeDir } from '../../../../../packages/engines/engines/seismolord/manifest';
import { volumeFrame } from './inversionWells';
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { readDepthSurface } from '@/lib/readDepthSurface';
import { listDatasets } from '@/lib/qiService';
import { loadGatherForWell } from '@/lib/rockPhysicsGather';
import { scanRemoteFile, startRemoteConversion } from '@/pages/apps/Seismolord/services/serverImport';
import { DEFAULT_MAPPING } from '../../../../../packages/engines/engines/seismolord/segyScan';
import { stampProject, scopeToProject, whenProjectScopeReady } from '@/lib/projects/projectScope';
import { saveZoneMapAsSurface } from '@/pages/apps/Seismolord/services/surfacesService';
import { latticeToWorldGrid } from '../../../../../packages/engines/engines/seismolord/surfaceOnLattice';
import { surveyAffine, cellSpacing, surveyBounds } from '../../../../../packages/engines/engines/seismolord/surveyGeometry';
import { geomFromManifest } from '../../../../../packages/engines/engines/seismolord/sliceAssembly';
import { exportGridSpec } from '@/lib/gridding/gridding';

/** A new derived row ('ingesting', kind 'attribute') on a parent volume, as Seismolord registers an attribute volume. */
async function registerDerived(parent, name, attributeParams) {
  const manifest = await getManifest(parent);
  assertFloat32Parent(manifest);
  await assertQuota(derivedStorageBytes(manifest));
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to compute a volume.');
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('seismic_volumes').insert(stampProject({
    id, user_id: user.id, name, storage_path: volumeDir(user.id, id), status: 'ingesting', kind: 'attribute',
    parent_volume_id: parent.id, attribute_params: attributeParams, crs: parent.crs ?? null, survey_meta: {},
  })).select().single();
  if (error) throw new Error(`Could not register the volume: ${error.message}`);
  return data;
}

export function makeRegistryBackend() {
  return {
    listWells,
    async loadWell(well) {
      const [logs, zones, tops] = await Promise.all([listLogs(well.id), listZones(well.id), listTops(well.id)]);
      return { well, logs, zones, tops };
    },
    async listVolumes() {
      await whenProjectScopeReady();
      const { data, error } = await scopeToProject(supabase.from('seismic_volumes')
        .select('id, name, kind, status, user_id, created_at, storage_path, crs, attribute_params, survey_meta'))
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load seismic volumes: ${error.message}`);
      // seismic volumes, and stacks matched to a reference (Q5), which a study uses as stacks
      return (data || []).filter((v) => (v.status || 'ready') === 'ready' && (!v.kind || v.kind === 'seismic' || (v.kind === 'attribute' && v.attribute_params?.name === 'qi_matched_stack')));
    },
    async loadVolumeFrame(volume) {
      return volumeFrame(await getManifest(volume));
    },
    async listHorizons(volumeId) {
      return (await listHorizons(volumeId)).filter((h) => h.is_own);
    },
    downloadCurve,
    async registerInversionVolume({ volume, name, summary }) {
      return registerDerived(volume, name, { name: 'qi_inversion', params: summary });
    },
    async registerPrestackVolume({ volume, name, summary }) {
      return registerDerived(volume, name, { name: 'qi_prestack_inversion', params: summary });
    },
    async registerMatchedVolume({ volume, name, summary }) {
      return registerDerived(volume, name, { name: 'qi_matched_stack', params: summary });
    },
    async registerAvoVolume({ volume, name, summary }) {
      return registerDerived(volume, name, { name: 'qi_avo', params: summary });
    },
    async registerPropertyVolume({ aiVolumeId, name, summary }) {
      const { data: ai, error } = await supabase.from('seismic_volumes').select('id, storage_path, crs').eq('id', aiVolumeId).maybeSingle();
      if (error || !ai) throw new Error('The impedance volume was not found.');
      return registerDerived(ai, name, { name: 'qi_property', params: summary });
    },
    removeVolume: deleteVolume,
    listSurfaces,
    listDatasets,
    loadRockPhysicsGather: (well) => loadGatherForWell(supabase, well.id),
    /** An angle stack in the worker store into a Seismolord volume: the server import's own scan and conversion. */
    async convertStack(d) {
      const remote = { remote: true, datasetId: d.id, name: d.original_filename, size: Number(d.bytes), fingerprint: d.meta?.fingerprint };
      const { scan } = await scanRemoteFile(remote, DEFAULT_MAPPING);
      if (!scan) throw new Error('The stack could not be scanned.');
      return startRemoteConversion({ remote, mapping: DEFAULT_MAPPING, scan, nativeCrs: null, name: d.name });
    },
    /** A registry surface read through the one door: elevation in metres, or an attribute map (xy in metres). */
    async loadSurface(row, { attribute = false } = {}) {
      const grid = await downloadSurfaceGrid(row);
      return readDepthSurface(row, grid, attribute ? { accept: ['attribute'], xy: 'm' } : { accept: ['elevation', 'depth'], as: 'elevation', xy: 'm' });
    },
    /** A zone map the worker wrote (QI upgrade P1.5): the float32 lattice grid. */
    async downloadZoneMap(path) {
      const { data, error } = await supabase.storage.from('seismic').download(path);
      if (error) throw new Error(`Could not read the zone map: ${error.message}`);
      return new Float32Array(await data.arrayBuffer());
    },
    /** Grid a lattice zone map onto the survey's world grid and save it as an attribute surface of the stack. */
    async saveZoneMap({ seismic, values, name, unit, provenance }) {
      const manifest = await getManifest(seismic);
      const affine = surveyAffine(manifest.geometry);
      if (!affine) throw new Error('The volume has no usable survey coordinates for a map.');
      const geom = geomFromManifest(manifest);
      if (values.length !== geom.nIl * geom.nXl) throw new Error('The zone map is not on this volume\'s lattice.');
      const spec = exportGridSpec(surveyBounds(affine, manifest.geometry.il.count, manifest.geometry.xl.count), 0, cellSpacing(affine).xl || 25);
      const { z, live } = latticeToWorldGrid(values, affine, geom, spec);
      if (!live) throw new Error('The zone map has no values to save.');
      return saveZoneMapAsSurface({ volume: seismic, name, unit, g: { z }, spec, provenance });
    },
    /** Remove the worker's lattice files once the maps are saved. */
    async removeZoneMapFiles(paths) {
      if (!paths?.length) return;
      await supabase.storage.from('seismic').remove(paths);
    },
    async countSurfaces() {
      await whenProjectScopeReady();
      const { count, error } = await scopeToProject(supabase.from('geo_surfaces').select('id', { count: 'exact', head: true }));
      return error ? 0 : (count || 0);
    },
  };
}
