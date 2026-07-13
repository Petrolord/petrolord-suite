// In-memory backend for the /dev/well-data-manager harness and jest:
// the FULL app (import → view → share → delete) drivable without auth
// or DB. Same interface as registryBackend; parsing still runs the REAL
// engine (via the worker in the browser, synchronously in jest).
//
// Ownership: everything created here belongs to 'user-dev'; a seeded
// org-shared well from 'user-other' exercises the read-only path
// (is_own=false rows hide the owner-only actions, like RLS would
// reject them server-side).

import { parseLas } from '../engine/lasParse';
import { prepareLogs, suggestWellHeader } from '../engine/lasImport';

const DEV_USER = 'user-dev';
const DEV_ORG = 'org-dev';

let seq = 0;
const nextId = (p) => { seq += 1; return `${p}-${seq}`; };

/** @param {{seedSharedWell?: boolean, worker?: boolean}} [opts]
 *  worker: parse through the real worker facade (browser harness) vs
 *  inline on this thread (jest / jsdom, where module workers 404). */
export function makeInMemoryBackend(opts = {}) {
  const wells = [];
  const topsByWell = new Map();
  const logsByWell = new Map();
  const curveStore = new Map(); // storage_path -> Float32Array

  if (opts.seedSharedWell !== false) {
    const id = nextId('well');
    wells.push({
      id,
      user_id: 'user-other',
      organization_id: DEV_ORG,
      name: 'AKOMA-2 (org shared)',
      uwi: 'AKOMA-2',
      surface_x: 501300,
      surface_y: 6700480,
      kb_m: 28,
      td_md_m: 2100,
      crs_note: 'EPSG:32630 (demo)',
      units_note: 'SI',
      deviation: [],
      checkshots: [],
      created_at: new Date(2026, 0, 15).toISOString(),
      updated_at: new Date(2026, 0, 15).toISOString(),
      is_own: false,
    });
    topsByWell.set(id, [
      { id: nextId('top'), well_id: id, name: 'Top Dome', md_m: 1502.5, interpreter: 'ama' },
      { id: nextId('top'), well_id: id, name: 'Base Seal', md_m: 1688.0, interpreter: 'ama' },
    ]);
    logsByWell.set(id, []);
  }

  const ownWell = (wellId, what) => {
    const w = wells.find((x) => x.id === wellId);
    if (!w) throw new Error(`Well not found.`);
    if (!w.is_own) throw new Error(`Only the owner can ${what} this well (org sharing is read-only).`);
    return w;
  };

  const update = async (wellId, patch) => {
    const w = ownWell(wellId, 'edit');
    Object.assign(w, patch, { updated_at: new Date(2026, 6, 13, 1, 0, seq).toISOString() });
    return w;
  };

  return {
    async listWells() {
      return [...wells].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },

    async saveWell(w) {
      const well = {
        id: nextId('well'),
        user_id: DEV_USER,
        organization_id: null,
        name: w.name,
        uwi: w.uwi || null,
        surface_x: w.surfaceX,
        surface_y: w.surfaceY,
        kb_m: w.kbM ?? 0,
        td_md_m: w.tdMdM ?? null,
        crs_note: w.crsNote || null,
        units_note: w.unitsNote || null,
        deviation: w.deviation || [],
        checkshots: w.checkshots || [],
        created_at: new Date(2026, 6, 13, 0, 0, seq).toISOString(),
        updated_at: new Date(2026, 6, 13, 0, 0, seq).toISOString(),
        is_own: true,
      };
      wells.push(well);
      topsByWell.set(well.id, []);
      logsByWell.set(well.id, []);
      return well;
    },

    updateWell: update,

    async deleteWell(well) {
      ownWell(well.id, 'delete');
      const i = wells.findIndex((x) => x.id === well.id);
      wells.splice(i, 1);
      (logsByWell.get(well.id) || []).forEach((l) => curveStore.delete(l.storage_path));
      topsByWell.delete(well.id);
      logsByWell.delete(well.id);
    },

    async myOrgId() { return DEV_ORG; },
    shareWell: (wellId) => update(wellId, { organization_id: DEV_ORG }),
    unshareWell: (wellId) => update(wellId, { organization_id: null }),

    async listTops(wellId) {
      return [...(topsByWell.get(wellId) || [])].sort((a, b) => a.md_m - b.md_m);
    },

    async replaceTops(wellId, tops) {
      ownWell(wellId, 'edit tops of');
      const rows = tops.map((t) => ({
        id: nextId('top'),
        well_id: wellId,
        name: t.name,
        md_m: t.md ?? t.md_m,
        interpreter: t.interpreter || null,
      }));
      topsByWell.set(wellId, rows);
      return rows;
    },

    async listLogs(wellId) { return [...(logsByWell.get(wellId) || [])]; },

    async saveLogs(wellId, logs) {
      ownWell(wellId, 'add logs to');
      const saved = logs.map((log) => {
        const id = nextId('log');
        const path = `${DEV_USER}/${wellId}/logs/${id}.f32`;
        curveStore.set(path, log.data);
        const row = {
          id,
          well_id: wellId,
          mnemonic: log.mnemonic,
          description: log.description || null,
          unit: log.unit || null,
          start_md_m: log.startMdM,
          stop_md_m: log.stopMdM,
          step_m: log.stepM,
          n_samples: log.nSamples,
          null_count: log.nullCount,
          source_file: log.provenance?.source_file || null,
          provenance: log.provenance || {},
          storage_path: path,
          created_at: new Date(2026, 6, 13, 2, 0, seq).toISOString(),
        };
        logsByWell.get(wellId).push(row);
        return row;
      });
      return saved;
    },

    async deleteLog(log) {
      ownWell(log.well_id, 'delete logs of');
      curveStore.delete(log.storage_path);
      const arr = logsByWell.get(log.well_id) || [];
      const i = arr.findIndex((l) => l.id === log.id);
      if (i >= 0) arr.splice(i, 1);
    },

    async downloadCurve(log) {
      const data = curveStore.get(log.storage_path);
      if (!data) throw new Error(`Curve ${log.mnemonic}: no object at ${log.storage_path}.`);
      return data;
    },

    async parseLasFile(file) {
      if (opts.worker) {
        const { parseLasFile } = await import('./lasImportService');
        return parseLasFile(file);
      }
      const text = await file.text();
      const parsed = parseLas(text);
      const prep = prepareLogs(parsed, { sourceFile: file.name || null });
      return {
        meta: {
          version: parsed.version,
          wrap: parsed.wrap,
          nullValue: parsed.nullValue,
          well: parsed.well,
          params: parsed.params,
          depthUnit: parsed.depthUnit,
          suggestedHeader: suggestWellHeader(parsed),
          curves: parsed.curves.map(({ data, ...rest }) => rest),
        },
        prep,
      };
    },
  };
}
