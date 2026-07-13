// In-memory backend for the /dev/well-correlation harness and jest:
// the cross-section app drivable without auth or DB. Seeds the
// deterministic 3-well sampleSection so the e2e asserts exact geometry
// (flatten on Top Dome -> the correlation line is flat across all
// wells). Same interface as registryBackend. Owner-only guards mirror
// RLS: KETA-3 is org-shared read-only.

import { sampleWells } from './sampleSection';

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

export function makeInMemoryBackend() {
  const wells = sampleWells().map((w) => ({ ...w }));
  const curvesByWell = new Map(wells.map((w) => [w.id, w.curves]));
  const topsByWell = new Map(wells.map((w) => [w.id, [...w.tops]]));
  const logMeta = new Map(wells.map((w) => [w.id, w.logMeta]));
  let section = null; // single implicit section (persisted in-memory)

  const own = (wellId, what) => {
    const w = wells.find((x) => x.id === wellId);
    if (!w) throw new Error('Well not found.');
    if (!w.is_own) throw new Error(`Only the owner can ${what} (org sharing is read-only).`);
    return w;
  };

  const publicWell = (w) => ({
    id: w.id, user_id: w.user_id, organization_id: w.organization_id, is_own: w.is_own,
    name: w.name, surface_x: w.surface_x, surface_y: w.surface_y, kb_m: w.kb_m,
  });

  return {
    async listWells() { return wells.map(publicWell); },

    async listTops(wellId) {
      return [...(topsByWell.get(wellId) || [])].sort((a, b) => a.md_m - b.md_m);
    },

    async listLogs(wellId) {
      const meta = logMeta.get(wellId) || {};
      const curves = curvesByWell.get(wellId) || {};
      // a log row per curve present (DEPT + GR), meta where declared
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
      const row = { id: nid('top'), well_id: wellId, name: top.name, md_m: top.mdM, interpreter: top.interpreter || null };
      topsByWell.get(wellId).push(row);
      return row;
    },

    async updateTop(topId, patch) {
      for (const [wellId, tops] of topsByWell) {
        const t = tops.find((x) => x.id === topId);
        if (t) {
          own(wellId, 'edit tops of this well');
          if (patch.mdM !== undefined) t.md_m = patch.mdM;
          if (patch.name !== undefined) t.name = patch.name;
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

    async propagateTop(name, targets) {
      const created = [];
      for (const t of targets) {
        const w = wells.find((x) => x.id === t.wellId);
        if (!w || !w.is_own) continue; // RLS would drop unowned wells
        const tops = topsByWell.get(t.wellId);
        if (tops.some((x) => x.name === name)) continue;
        const row = { id: nid('top'), well_id: t.wellId, name, md_m: t.mdM, interpreter: null };
        tops.push(row);
        created.push(row);
      }
      return created;
    },

    async loadSection() { return section; },
    async saveSection(patch) {
      section = { id: section?.id || 'section-dev', name: 'Default section', ...section, ...patch };
      return section;
    },
  };
}
