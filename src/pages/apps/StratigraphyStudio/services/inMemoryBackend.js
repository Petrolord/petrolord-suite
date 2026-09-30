// In-memory backend for the /dev/stratigraphy-studio harness and jest
// (Stratigraphy Studio ST0): the app drivable without auth or DB. Wells and
// tops are the Well Correlation sample section (KETA-1/2/3, KETA-3
// org-shared and read-only), the stratigraphic column is a seeded
// three-level Niger Delta style column. Same interface as registryBackend;
// owner-only guards mirror RLS.

import { sampleWells, sampleSurfaces, samplePetro } from '../../WellCorrelation/services/sampleSection';
import { openSectionRow } from '@/components/wells/section/sectionState';
import { openStratProjectRow } from '@/lib/stratigraphy/stratProjectState';
import { makeInMemoryBackend as makeBasinMemory } from '../../BasinFlowGenesis/services/backend';

// AppUpgrade STRAT-U1-011 (2026-09-30): the harness was blind to surveys,
// CRSs and checkshots (publicWell dropped them, carried from WDM-U1-018),
// so no deviated or feet path had ever run here. It now serves the whole
// well header, can be seeded (hostile wells, saved rows of each release,
// several named sections) and opens rows through the state-version door
// the registry uses.
const asCurves = (curves) => Object.fromEntries(Object.entries(curves || {})
  .map(([k, v]) => [k, v instanceof Float32Array || v instanceof Float64Array ? v : Float32Array.from(v, (x) => (x == null ? NaN : x))]));

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

export function seededUnits() {
  return [
    { id: 'unit-agbada', user_id: 'user-a', organization_id: null, name: 'Agbada', rank: 'group', parent_id: null, order_index: 0, age_top_ma: 2.58, age_base_ma: 33.9, colour: '#f59e0b', lithology: null, notes: null },
    { id: 'unit-agbada-upper', user_id: 'user-a', organization_id: null, name: 'Upper Agbada', rank: 'formation', parent_id: 'unit-agbada', order_index: 0, age_top_ma: 2.58, age_base_ma: 15.98, colour: '#fbbf24', lithology: null, notes: null },
    { id: 'unit-agbada-lower', user_id: 'user-a', organization_id: null, name: 'Lower Agbada', rank: 'formation', parent_id: 'unit-agbada', order_index: 1, age_top_ma: 15.98, age_base_ma: 33.9, colour: '#d97706', lithology: null, notes: null },
    { id: 'unit-akata', user_id: 'user-a', organization_id: null, name: 'Akata', rank: 'group', parent_id: null, order_index: 1, age_top_ma: 33.9, age_base_ma: 56.0, colour: '#64748b', lithology: null, notes: null },
  ];
}

/**
 * @param {{ sample?: boolean, seedWells?: Object[], sections?: Object[], project?: ?Object, units?: ?Object[] }} [opts]
 *   sections: saved geo_correlation_sections rows, newest LAST (the default
 *   is the KETA section); project: a saved strat_projects row
 */
export function makeInMemoryBackend({ sample = true, seedWells = [], sections: seedSections = null, project: seedProject = null, units: seedUnits = null, surfaces: seedSurfaces = null } = {}) {
  // STRAT-U2-002: the sample carries Well Correlation's published Petrophysics
  // (PAY on KETA-1, zones) and its two Seismolord horizons, so the studio
  // section can draw strips and horizons on the harness
  const sampleSet = sample ? sampleWells().map((w) => {
    const p = samplePetro(w);
    return { ...w, zones: p.zones, curves: p.pay ? { ...w.curves, PAY: p.pay } : w.curves, logMeta: p.pay ? { ...w.logMeta, PAY: { ...w.logMeta.GR, unit: 'FLAG' } } : w.logMeta };
  }) : [];
  const wells = [...sampleSet, ...seedWells.map((w) => ({ ...w, curves: asCurves(w.curves) }))].map((w) => ({ ...w }));
  const zonesByWell = new Map(wells.map((w) => [w.id, [...(w.zones || [])]]));
  const surfaces = () => seedSurfaces ?? (sample ? sampleSurfaces() : []);
  const topsByWell = new Map(wells.map((w) => [w.id, w.tops.map((t) => ({ ...t }))]));
  const intervalsByWell = new Map(wells.map((w) => [w.id, (w.intervals || []).map((r) => ({ ...r }))]));   // ST1 seeded lithology
  const coreImagesByWell = new Map();
  const imgSeq = { n: 0 };
  let units = seedUnits ? seedUnits.map((u) => ({ ...u })) : seededUnits();
  const curvesByWell = new Map(wells.map((w) => [w.id, w.curves]));
  const logMeta = new Map(wells.map((w) => [w.id, w.logMeta]));
  // ST2: the shared section (Well Correlation's rows) seeded over the wells, and the view state;
  // WC-U2-001 named sections: several rows, the newest opens by default
  let clock = 0;
  const sections = (seedSections || [{ id: 'section-1', name: 'KETA section', well_ids: wells.map((w) => w.id), datum: { mode: 'structural' }, track_layout: {} }])
    .map((r) => ({ ...r, id: r.id || `section-${clock + 1}`, _t: ++clock }));
  const newest = () => [...sections].sort((a, b) => b._t - a._t)[0] || null;
  const strip = (r) => { if (!r) return null; const { _t, ...rest } = r; return { ...rest }; };
  let project = seedProject ? { ...seedProject } : null;
  const basinModels = [];   // ST3 handoff record for tests
  // STRAT-U1-019: the handoff lands in the Basin harness's own store, so "Open Basin" shows it
  const basin = makeBasinMemory();

  const own = (wellId, what) => {
    const w = wells.find((x) => x.id === wellId);
    if (!w) throw new Error('Well not found.');
    if (!w.is_own) throw new Error(`Only the owner can ${what} (org sharing is read-only).`);
    return w;
  };

  const publicWell = (w) => ({
    id: w.id, user_id: w.user_id, organization_id: w.organization_id, is_own: w.is_own,
    name: w.name, surface_x: w.surface_x, surface_y: w.surface_y, kb_m: w.kb_m, td_md_m: w.td_md_m ?? null,
    deviation: w.deviation ?? null, uwi: w.uwi ?? null, crs: w.crs ?? null, xy_unit: w.xy_unit ?? null,
    crs_provenance: w.crs_provenance ?? null, checkshots: w.checkshots ?? [],
  });

  return {
    async listWells() { return wells.map(publicWell); },

    async listAllTops() { return [...topsByWell.values()].flat().map((t) => ({ ...t })); },

    async listTops(wellId) {
      return [...(topsByWell.get(wellId) || [])].sort((a, b) => a.md_m - b.md_m).map((t) => ({ ...t }));
    },

    async updateTop(topId, patch) {
      for (const [wellId, tops] of topsByWell) {
        const t = tops.find((x) => x.id === topId);
        if (t) {
          own(wellId, 'edit tops of this well');
          if (patch.mdM !== undefined) t.md_m = Number(patch.mdM);
          if (patch.name !== undefined) t.name = patch.name;
          for (const k of ['surface_type', 'unit_id', 'confidence', 'notes']) if (patch[k] !== undefined) t[k] = patch[k] === '' ? null : patch[k];
          for (const k of ['age_ma', 'hiatus_to_ma']) if (patch[k] !== undefined) t[k] = patch[k] === '' || patch[k] == null ? null : Number(patch[k]);
          if (!t.surface_type) t.surface_type = 'formation_top';
          return { ...t };
        }
      }
      throw new Error('Top not found.');
    },

    // ---- ST1 interval logs + core photos (same contract as stratRegistry) ----
    async listIntervals(wellId, kind = null) {
      return (intervalsByWell.get(wellId) || []).filter((r) => !kind || r.kind === kind).map((r) => ({ ...r }));
    },
    async replaceIntervals(wellId, kind, rows) {
      own(wellId, 'edit intervals of this well');
      const keep = (intervalsByWell.get(wellId) || []).filter((r) => r.kind !== kind);
      const added = rows.map((r) => ({ id: nid('int'), well_id: wellId, kind, top_md_m: Number(r.top_md_m), base_md_m: Number(r.base_md_m), code: String(r.code), label: r.label || null, properties: r.properties || {}, source: r.source || 'interpretation', interpreter: r.interpreter || null }));
      intervalsByWell.set(wellId, [...keep, ...added].sort((a, b) => a.top_md_m - b.top_md_m));
      return added;
    },
    async listCoreImages(wellId) { return (coreImagesByWell.get(wellId) || []).map((r) => ({ ...r })); },
    async uploadCoreImage(wellId, file, meta) {
      own(wellId, 'add core photos to this well');
      if (!file) throw new Error('Choose an image first.');
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`"${file.name}" is ${file.type || 'of unknown type'}; core photos must be JPEG, PNG or WebP.`);
      if (file.size > 5 * 1024 * 1024) throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB; the limit is 5 MB per image.`);
      const top = Number(meta.top_md_m); const base = Number(meta.base_md_m);
      if (!Number.isFinite(top) || !Number.isFinite(base) || !(base > top)) throw new Error('Give the photo a top and a base depth, base below top.');
      imgSeq.n += 1;
      const id = `img-${imgSeq.n}`;
      const row = { id, well_id: wellId, top_md_m: top, base_md_m: base, storage_path: `dev/${wellId}/core/${id}`, content_type: file.type, caption: meta.caption || null, width: meta.width || null, height: meta.height || null, bytes: file.size, _url: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : null };
      if (!coreImagesByWell.has(wellId)) coreImagesByWell.set(wellId, []);
      coreImagesByWell.get(wellId).push(row);
      return { ...row };
    },
    async updateCoreImage(imageId, patch) {
      for (const [wellId, list] of coreImagesByWell) {
        const img = list.find((x) => x.id === imageId);
        if (img) {
          own(wellId, 'edit core photos of this well');
          if (patch.top_md_m !== undefined) img.top_md_m = Number(patch.top_md_m);
          if (patch.base_md_m !== undefined) img.base_md_m = Number(patch.base_md_m);
          if (patch.caption !== undefined) img.caption = patch.caption || null;
          return { ...img };
        }
      }
      throw new Error('Core photo not found.');
    },
    async deleteCoreImage(image) {
      own(image.well_id, 'delete core photos of this well');
      const list = coreImagesByWell.get(image.well_id) || [];
      const i = list.findIndex((x) => x.id === image.id);
      if (i >= 0) list.splice(i, 1);
    },
    async coreImageUrl(image) {
      return (coreImagesByWell.get(image.well_id) || []).find((x) => x.id === image.id)?._url || null;
    },

    // ---- ST2: curves, the shared section, the view state ----
    async listLogs(wellId) {
      const meta = logMeta.get(wellId) || {};
      return Object.keys(curvesByWell.get(wellId) || {}).map((mnemonic) => ({ id: `${wellId}-log-${mnemonic}`, well_id: wellId, mnemonic, unit: meta[mnemonic]?.unit || '', description: '', n_samples: (curvesByWell.get(wellId)[mnemonic] || []).length }));
    },
    async downloadCurve(log) {
      const c = (curvesByWell.get(log.well_id) || {})[log.mnemonic];
      if (!c) throw new Error('Curve not found.');
      return c instanceof Float32Array ? c : Float32Array.from(c);
    },
    async listSurfaces() { return surfaces().map(({ grid, ...row }) => ({ ...row })); },
    async downloadSurfaceGrid(row) {
      const found = surfaces().find((x) => x.id === row.id);
      if (!found) throw new Error('Surface grid not found.');
      return Float32Array.from(found.grid);
    },
    async listZones(wellId) { return (zonesByWell.get(wellId) || []).map((z) => ({ ...z, properties: { ...(z.properties || {}) } })); },
    async listSections() {
      return [...sections].sort((a, b) => b._t - a._t)
        .map((r) => ({ id: r.id, name: r.name || 'Section', wellCount: (r.well_ids || []).length, updated_at: r.updated_at || null }));
    },
    async loadSection(id = null) {
      if (id) {
        const r = sections.find((x) => x.id === id);
        if (!r) throw new Error('That section no longer exists (deleted in another tab?).');
        return openSectionRow(strip(r));
      }
      return openSectionRow(strip(newest()));
    },
    async saveSection(patch, { id = null } = {}) {
      const target = id ? sections.find((x) => x.id === id) : newest();
      if (target) { Object.assign(target, patch, { _t: ++clock }); return strip(target); }
      const row = { id: 'section-1', name: 'Section', ...patch, _t: ++clock };
      sections.push(row);
      return strip(row);
    },
    async loadStratProject() { return openStratProjectRow(project ? { ...project } : null); },
    async saveStratProject(patch) {
      if (project) openStratProjectRow({ ...project }); // a newer build's row is never overwritten
      project = { ...(project || { id: 'strat-1', name: 'Default' }), ...patch };
      return { ...project };
    },

    async saveTop(wellId, top) {
      own(wellId, 'add tops to this well');
      const row = { id: nid('top'), well_id: wellId, name: top.name, md_m: Number(top.mdM), interpreter: top.interpreter || null,
        surface_type: top.surface_type || 'formation_top', unit_id: top.unit_id || null, confidence: top.confidence || null,
        age_ma: top.age_ma == null || top.age_ma === '' ? null : Number(top.age_ma), hiatus_to_ma: top.hiatus_to_ma == null ? null : Number(top.hiatus_to_ma), notes: top.notes || null };
      topsByWell.get(wellId).push(row);
      topsByWell.get(wellId).sort((a, b) => a.md_m - b.md_m);
      return { ...row };
    },
    async currentUserId() { return 'user-a'; },
    async createBasinModel(row) { basinModels.push({ ...row }); await basin.insertWell({ ...row }); return { ...row }; },
    _basinModels: () => basinModels,

    async listUnits() { return units.map((u) => ({ ...u })); },

    async saveUnit(u) {
      const name = String(u.name || '').trim();
      if (!name) throw new Error('The unit needs a name.');
      const row = {
        id: nid('unit'), user_id: 'user-a', organization_id: null, name, rank: u.rank || 'formation', parent_id: u.parent_id || null,
        order_index: u.order_index == null || u.order_index === '' ? null : Number(u.order_index),
        age_top_ma: u.age_top_ma == null || u.age_top_ma === '' ? null : Number(u.age_top_ma),
        age_base_ma: u.age_base_ma == null || u.age_base_ma === '' ? null : Number(u.age_base_ma),
        colour: u.colour || null, lithology: u.lithology || null, notes: u.notes || null,
      };
      units.push(row);
      return { ...row };
    },

    async updateUnit(id, patch) {
      const u = units.find((x) => x.id === id);
      if (!u) throw new Error('Only the owner can edit stratigraphic units (org sharing is read-only).');
      for (const k of ['name', 'rank', 'parent_id', 'colour', 'lithology', 'notes']) if (patch[k] !== undefined) u[k] = patch[k] === '' ? null : patch[k];
      if (patch.name !== undefined && !String(patch.name).trim()) throw new Error('The unit needs a name.');
      for (const k of ['order_index', 'age_top_ma', 'age_base_ma']) if (patch[k] !== undefined) u[k] = patch[k] == null || patch[k] === '' ? null : Number(patch[k]);
      return { ...u };
    },

    async deleteUnit(unit) {
      const i = units.findIndex((x) => x.id === unit.id);
      if (i < 0) throw new Error('Only the owner can delete stratigraphic units (org sharing is read-only).');
      units.splice(i, 1);
      // FK on delete set null: children and tops keep their rows
      for (const u of units) if (u.parent_id === unit.id) u.parent_id = null;
      for (const tops of topsByWell.values()) for (const t of tops) if (t.unit_id === unit.id) t.unit_id = null;
    },
  };
}
