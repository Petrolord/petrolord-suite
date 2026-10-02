// In-memory backend for the /dev/well-correlation harness and jest:
// the cross-section app drivable without auth or DB. Seeds the
// deterministic 3-well sampleSection so the e2e asserts exact geometry
// (flatten on Top Dome -> the correlation line is flat across all
// wells). Same interface as registryBackend. Owner-only guards mirror
// RLS: KETA-3 is org-shared read-only.

//
// AppUpgrade WC-U1 (2026-09-29): seedable for the evidence kit. `seedWells`
// adds wells in the stored registry shape (curves as plain arrays, tops,
// logMeta with start/stop so a G1-era bottom-up well stays bottom-up), and
// `section` seeds a saved geo_correlation_sections row, opened through the
// same PP0 state kind as the registry (a newer-build row is refused).

import { makeHarnessSharing, colleagueShared } from '@/lib/recordSharing';
import { sampleWells, sampleSurfaces, sampleUnits, samplePetro, SAMPLE_UNIT_OF } from './sampleSection';
import { KETA3D, ketaBrickSource } from './sampleSeismic';
import { assembleSectionBackdrop } from '@/pages/apps/Seismolord/services/sectionBackdrop';
import { openSectionRow } from '@/components/wells/section/sectionState';
import { sectionNameProblem, DEFAULT_SECTION_NAME } from '@/components/wells/section/sectionNames';

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

const asCurves = (curves) => Object.fromEntries(Object.entries(curves || {})
  .map(([k, v]) => [k, v instanceof Float32Array || v instanceof Float64Array ? v : Float32Array.from(v, (x) => (x == null ? NaN : x))]));

/**
 * @param {{ seedWells?: Object[], sample?: boolean, section?: ?Object, sections?: Object[] }} [opts]
 *   sections (U2-001) seeds several saved rows, newest last
 *   sample false drops the 3-well KETA section (a scale or hostile run alone)
 */
export function makeInMemoryBackend({ seedWells = [], sample = true, section: seedSection = null, sections: seedSections = [], surfaces: seedSurfaces = null, sharedSections = false, sharing: sharingOpts = {} } = {}) {
  // U2-008: the harness sample carries a published PAY, zones and unit links
  const sampleSet = sample ? sampleWells().map((w) => {
    const p = samplePetro(w);
    return {
      ...w,
      tops: w.tops.map((t) => ({ ...t, unit_id: SAMPLE_UNIT_OF[t.name] || t.unit_id || null })),
      zones: p.zones,
      curves: p.pay ? { ...w.curves, PAY: p.pay } : w.curves,
      logMeta: p.pay ? { ...w.logMeta, PAY: { ...w.logMeta.GR, unit: 'FLAG' } } : w.logMeta,
    };
  }) : [];
  const wells = [...sampleSet, ...seedWells.map((w) => ({ ...w, curves: asCurves(w.curves) }))].map((w) => ({ ...w }));
  const curvesByWell = new Map(wells.map((w) => [w.id, w.curves]));
  const topsByWell = new Map(wells.map((w) => [w.id, [...(w.tops || [])]]));
  const intervalsByWell = new Map(wells.map((w) => [w.id, [...(w.intervals || [])]]));   // ST1 seeded lithology
  const zonesByWell = new Map(wells.map((w) => [w.id, [...(w.zones || [])]]));           // U2-008 Petrophysics zones
  const units = [...(sample ? sampleUnits() : []), ...seedWells.flatMap((w) => w.units || [])];
  const logMeta = new Map(wells.map((w) => [w.id, w.logMeta]));
  // U2-001: named sections, owner-only rows like the registry; `clock` orders
  // them by last save (newest first), as updated_at does
  // Organisation sharing: the rows live in the in-memory mirror of the
  // sharing rules (src/lib/recordSharing), so the harness shows the same
  // control and refusals as the database. `sharedSections` adds two sections
  // a colleague shared (harness ?shared=1).
  let clock = 0;
  const T = 'geo_correlation_sections';
  const sharing = makeHarnessSharing(sharingOpts);
  const ME = sharing.me;
  sharing.db.seed(T, [...(seedSection ? [seedSection] : []), ...seedSections]
    .map((r) => ({ ...r, id: r.id || nid('section'), name: r.name || DEFAULT_SECTION_NAME, _t: ++clock })), { owner: ME });
  if (sharedSections) {
    const ids = wells.slice(0, 2).map((w) => w.id);
    sharing.db.seed(T, [
      colleagueShared({ id: 'section-ada-view', name: 'Regional dip line (Ada)', well_ids: ids, datum: { mode: 'structural' }, track_layout: {}, _t: ++clock }),
      colleagueShared({ id: 'section-ada-edit', name: 'Field strike line, team', well_ids: ids, datum: { mode: 'structural' }, track_layout: {}, _t: ++clock }, { access: 'edit' }),
    ]);
  }
  const visible = () => sharing.db.select(T, ME).data || [];
  const mine = () => visible().filter((r) => r.user_id === ME);
  const newest = () => [...mine()].sort((a, b) => b._t - a._t)[0] || null;
  const strip = (r) => { if (!r) return null; const { _t, ...rest } = r; return { ...rest }; };

  const own = (wellId, what) => {
    const w = wells.find((x) => x.id === wellId);
    if (!w) throw new Error('Well not found.');
    if (!w.is_own) throw new Error(`Only the owner can ${what} (org sharing is read-only).`);
    return w;
  };

  const publicWell = (w) => ({
    id: w.id, user_id: w.user_id, organization_id: w.organization_id, is_own: w.is_own,
    name: w.name, surface_x: w.surface_x, surface_y: w.surface_y, kb_m: w.kb_m,
    td_md_m: w.td_md_m ?? null, deviation: w.deviation ?? null, uwi: w.uwi ?? null,
    crs: w.crs ?? null, xy_unit: w.xy_unit ?? null, crs_provenance: w.crs_provenance ?? null,
    checkshots: w.checkshots ?? [],
  });

  return {
    async listWells() { return wells.map(publicWell); },

    async listIntervals(wellId, kind = null) {
      return (intervalsByWell.get(wellId) || []).filter((r) => !kind || r.kind === kind).map((r) => ({ ...r }));
    },

    // U2-003: geo_surfaces rows with their grids (the sample has one
    // Seismolord time horizon and one depth horizon over the KETA wells)
    async listSurfaces() {
      return (seedSurfaces ?? (sample ? sampleSurfaces() : [])).map(({ grid, ...row }) => ({ ...row }));
    },
    async downloadSurfaceGrid(row) {
      const s = (seedSurfaces ?? (sample ? sampleSurfaces() : [])).find((x) => x.id === row.id);
      if (!s) throw new Error('Surface grid not found.');
      return Float32Array.from(s.grid);
    },

    // Seismolord U2-002: the synthetic KETA 3D volume under the sample wells
    async listSeismicVolumes() {
      return sample ? [{ id: KETA3D.id, name: KETA3D.name, crs: KETA3D.crs, status: 'ready', kind: 'seismic' }] : [];
    },
    async loadSeismicBackdrop(volume, sectionWells) {
      if (volume.id !== KETA3D.id) throw new Error('Volume not found.');
      const { geom, getBrick } = ketaBrickSource();
      const out = await assembleSectionBackdrop({
        getBrick, geom, geometry: KETA3D.geometry, wells: sectionWells, volumeCrs: KETA3D.crs,
      });
      return { ...out, volumeName: KETA3D.name };
    },

    async listZones(wellId) { return (zonesByWell.get(wellId) || []).map((z) => ({ ...z, properties: { ...(z.properties || {}) } })); },
    async listUnits() { return units.map((u) => ({ ...u })); },

    async listAllTops() {
      return [...topsByWell.values()].flat().map((t) => ({ ...t }));
    },

    async listTops(wellId) {
      return [...(topsByWell.get(wellId) || [])].sort((a, b) => a.md_m - b.md_m);
    },

    async listLogs(wellId) {
      const meta = logMeta.get(wellId) || {};
      const curves = curvesByWell.get(wellId) || {};
      // a log row per curve present (DEPT, GR, RT, RHOB, NPHI), meta where declared
      return Object.keys(curves).map((mnemonic) => ({
        id: `${wellId}-log-${mnemonic}`,
        well_id: wellId,
        mnemonic,
        n_samples: curves[mnemonic].length,
        ...(meta[mnemonic] || {}),
        storage_path: `dev/${wellId}/${mnemonic}.f32`,
      }));
    },

    async downloadCurve(log) {
      const c = curvesByWell.get(log.well_id);
      const data = c?.[log.mnemonic];
      if (!data) throw new Error(`No curve data for ${log.mnemonic}.`);
      return data;
    },

    async saveTop(wellId, top) {
      own(wellId, 'add tops to this well');
      const row = { id: nid('top'), well_id: wellId, name: top.name, md_m: top.mdM, interpreter: top.interpreter || null,
        surface_type: top.surface_type || 'formation_top', unit_id: top.unit_id || null, confidence: top.confidence || null, age_ma: top.age_ma ?? null, notes: top.notes || null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      topsByWell.get(wellId).push(row);
      return row;
    },

    async updateTop(topId, patch) {
      for (const [wellId, tops] of topsByWell) {
        const t = tops.find((x) => x.id === topId);
        if (t) {
          own(wellId, 'edit tops of this well');
          t.updated_at = new Date().toISOString();
          if (patch.mdM !== undefined) t.md_m = patch.mdM;
          if (patch.name !== undefined) t.name = patch.name;
          for (const k of ['surface_type', 'unit_id', 'confidence', 'age_ma', 'notes', 'hiatus_to_ma']) if (patch[k] !== undefined) t[k] = patch[k] === '' ? null : patch[k];
          return t;
        }
      }
      throw new Error('Top not found.');
    },

    async deleteTop(top) {
      own(top.well_id, 'delete tops of this well');
      const tops = topsByWell.get(top.well_id);
      const i = tops.findIndex((x) => x.id === top.id);
      if (i >= 0) tops.splice(i, 1);
    },

    async propagateTop(name, targets, attrs = {}) {
      const created = [];
      for (const t of targets) {
        const w = wells.find((x) => x.id === t.wellId);
        if (!w || !w.is_own) continue; // RLS would drop unowned wells
        const tops = topsByWell.get(t.wellId);
        if (tops.some((x) => x.name === name)) continue;
        const row = { id: nid('top'), well_id: t.wellId, name, md_m: t.mdM, interpreter: attrs.interpreter || null, confidence: attrs.confidence || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        tops.push(row);
        created.push(row);
      }
      return created;
    },

    async listSections() {
      return [...visible()].sort((a, b) => b._t - a._t)
        .map((r) => { const { _t, well_ids, datum, track_layout, ...rest } = r; return { ...rest, wellCount: (well_ids || []).length, updated_at: r.updated_at || null }; });
    },
    async loadSection(id = null) {
      const r = id ? visible().find((x) => x.id === id) : newest();
      if (id && !r) throw new Error('That section no longer exists, or it is no longer shared with you.');
      if (r) sharing.store.trackOpened(T, r);
      return openSectionRow(strip(r));
    },
    async saveSection(patch, { id = null } = {}) {
      const target = id ? { id } : newest();
      if (target) {
        const { data, error } = await sharing.store.update(T, target.id, { ...patch, _t: ++clock }, { note: 'Section saved' });
        if (error) throw new Error(error.name === 'RecordConflict' ? error.message : 'That section no longer exists (deleted in another tab?).');
        return strip(data);
      }
      const { data, error } = sharing.db.insert(T, ME, { id: id || 'section-dev', user_id: ME, name: DEFAULT_SECTION_NAME, ...patch, _t: ++clock });
      if (error) throw new Error(error.message);
      sharing.store.trackOpened(T, data);
      return strip(data);
    },
    async createSection(name, patch = {}) {
      const problem = sectionNameProblem(name, mine());
      if (problem) throw new Error(problem);
      const { data, error } = sharing.db.insert(T, ME, { ...patch, id: nid('section'), user_id: ME, name: String(name).trim(), _t: ++clock });
      if (error) throw new Error(error.message);
      sharing.store.trackOpened(T, data);
      return strip(data);
    },
    async renameSection(id, name) {
      const r = mine().find((x) => x.id === id);
      if (!r) throw new Error('Only the owner can rename a section.');
      const problem = sectionNameProblem(name, mine(), id);
      if (problem) throw new Error(problem);
      const { data, error } = sharing.db.update(T, ME, id, { name: String(name).trim() });
      if (error || !data.length) throw new Error('Only the owner can rename a section.');
      if (sharing.store.trackedVersion(T, id) != null) sharing.store.trackOpened(T, data[0]);
      return { id, name: data[0].name };
    },
    async deleteSection(id) {
      const { data } = sharing.db.remove(T, ME, id);
      if (!data || !data.length) throw new Error('Only the owner can delete a section.');
    },
    sharing: sharing.store,
    /** test seam: the in-memory database and the colleague's store */
    _sharing: sharing,
  };
}
