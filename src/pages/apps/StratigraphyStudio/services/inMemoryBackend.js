// In-memory backend for the /dev/stratigraphy-studio harness and jest
// (Stratigraphy Studio ST0): the app drivable without auth or DB. Wells and
// tops are the Well Correlation sample section (KETA-1/2/3, KETA-3
// org-shared and read-only), the stratigraphic column is a seeded
// three-level Niger Delta style column. Same interface as registryBackend;
// owner-only guards mirror RLS.

import { sampleWells } from '../../WellCorrelation/services/sampleSection';

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

export function makeInMemoryBackend() {
  const wells = sampleWells().map((w) => ({ ...w }));
  const topsByWell = new Map(wells.map((w) => [w.id, w.tops.map((t) => ({ ...t }))]));
  const intervalsByWell = new Map(wells.map((w) => [w.id, (w.intervals || []).map((r) => ({ ...r }))]));   // ST1 seeded lithology
  const coreImagesByWell = new Map();
  const imgSeq = { n: 0 };
  let units = seededUnits();
  const curvesByWell = new Map(wells.map((w) => [w.id, w.curves]));
  const logMeta = new Map(wells.map((w) => [w.id, w.logMeta]));
  // ST2: the shared section (Well Correlation's rows) seeded over all three wells, and the view state
  let section = { id: 'section-1', well_ids: wells.map((w) => w.id), datum: { mode: 'structural' }, track_layout: {} };
  let project = null;
  const basinModels = [];   // ST3 handoff target (the harness has no Basin store)

  const own = (wellId, what) => {
    const w = wells.find((x) => x.id === wellId);
    if (!w) throw new Error('Well not found.');
    if (!w.is_own) throw new Error(`Only the owner can ${what} (org sharing is read-only).`);
    return w;
  };

  const publicWell = (w) => ({
    id: w.id, user_id: w.user_id, organization_id: w.organization_id, is_own: w.is_own,
    name: w.name, surface_x: w.surface_x, surface_y: w.surface_y, kb_m: w.kb_m, td_md_m: w.td_md_m ?? null,
  });

  return {
    async listWells() { return wells.map(publicWell); },

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
    async loadSection() { return section ? { ...section } : null; },
    async saveSection(patch) { section = { ...(section || { id: 'section-1' }), ...patch }; return { ...section }; },
    async loadStratProject() { return project ? { ...project } : null; },
    async saveStratProject(patch) { project = { ...(project || { id: 'strat-1', name: 'Default' }), ...patch }; return { ...project }; },

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
    async createBasinModel(row) { basinModels.push({ ...row }); return { ...row }; },
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
