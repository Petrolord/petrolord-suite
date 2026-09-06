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
  let units = seededUnits();

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
          if (patch.age_ma !== undefined) t.age_ma = patch.age_ma === '' || patch.age_ma == null ? null : Number(patch.age_ma);
          if (!t.surface_type) t.surface_type = 'formation_top';
          return { ...t };
        }
      }
      throw new Error('Top not found.');
    },

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
