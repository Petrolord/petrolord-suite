// In-memory backend for the /dev/well-data-manager harness and jest:
// the FULL app (import → view → share → delete) drivable without auth
// or DB. Same interface as registryBackend; parsing still runs the REAL
// engine (via the worker in the browser, synchronously in jest).
//
// Ownership: everything created here belongs to 'user-dev'; a seeded
// org-shared well from 'user-other' exercises the read-only path
// (is_own=false rows hide the owner-only actions, like RLS would
// reject them server-side).

import { wellNameClashMessage, validateStoredCheckshotsShape } from '@/lib/wellsRegistry';
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
      // entered as MD ft + OWT (Petrel style); stored core TVDSS/TWT with md_m
      checkshots: [
        { tvdss_m: 276.8, twt_ms: 240, md_m: 304.8 },
        { tvdss_m: 581.6, twt_ms: 440, md_m: 609.6 },
        { tvdss_m: 1191.2, twt_ms: 800, md_m: 1219.2 },
      ],
      checkshots_provenance: {
        units_in: { depth_ref: 'md', time: 'owt', depth_unit: 'ft' },
        source: 'well-import', kb_m_used: 28, deviation_stations_used: 0,
        edited_at: new Date(2026, 0, 15).toISOString(),
      },
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
    if (patch && patch.name !== undefined) {
      const msg = wellNameClashMessage(patch.name, wells, { exceptId: wellId, userId: DEV_USER });
      if (msg) throw new Error(msg);
      patch = { ...patch, name: String(patch.name).trim() };
    }
    Object.assign(w, patch, { updated_at: new Date(2026, 6, 13, 1, 0, seq).toISOString() });
    return w;
  };

  return {
    async listWells() {
      return [...wells].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },

    async saveWell(w) {
      // same one-name-per-registry rule as the live registry
      const msg = wellNameClashMessage(w.name, wells, { userId: DEV_USER });
      if (msg) throw new Error(msg);
      const well = {
        id: nextId('well'),
        user_id: DEV_USER,
        organization_id: null,
        name: String(w.name).trim(),
        uwi: w.uwi || null,
        surface_x: w.surfaceX,
        surface_y: w.surfaceY,
        kb_m: w.kbM ?? 0,
        td_md_m: w.tdMdM ?? null,
        crs_note: w.crsNote || null,
        units_note: w.unitsNote || null,
        deviation: w.deviation || [],
        checkshots: w.checkshots || [],
        checkshots_provenance: w.checkshotsProvenance || null,
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

    /** Owner edit of KB / TD / deviation / checkshots with the registry's
     *  validation rules (PT1). */
    async updateWellData(wellId, {
      surfaceX, surfaceY, kbM, tdMdM, deviation, checkshots, checkshotsProvenance,
    } = {}) {
      const w = ownWell(wellId, 'edit');
      const patch = {};
      // PT8: surface coordinates are already in the well's CRS — validate
      // that they are finite, transform nothing.
      for (const [name, value, col] of [['Surface X', surfaceX, 'surface_x'], ['Surface Y', surfaceY, 'surface_y']]) {
        if (value === undefined) continue;
        if (value === null) { patch[col] = null; continue; }
        if (!Number.isFinite(Number(value))) throw new Error(`${name} must be a number in the well's CRS.`);
        patch[col] = Number(value);
      }
      if (kbM !== undefined) {
        if (!Number.isFinite(Number(kbM))) throw new Error('KB must be a number (metres above datum).');
        patch.kb_m = Number(kbM);
      }
      if (tdMdM !== undefined) {
        if (tdMdM !== null && !(Number(tdMdM) > 0)) throw new Error('TD must be a positive number (m MD).');
        patch.td_md_m = tdMdM === null ? null : Number(tdMdM);
      }
      if (deviation !== undefined) {
        const st = (deviation || []).map((d) => ({ md: Number(d.md), inc: Number(d.inc), azi: Number(d.azi) }));
        if (st.length === 1) throw new Error('A deviation survey needs at least 2 stations (or none for a vertical well).');
        for (let i = 0; i < st.length; i++) {
          if (![st[i].md, st[i].inc, st[i].azi].every(Number.isFinite)) throw new Error(`Station ${i + 1}: MD, inclination and azimuth must be numbers.`);
          if (i && !(st[i].md > st[i - 1].md)) throw new Error(`Station ${i + 1}: MD ${st[i].md} does not increase (previous station is at ${st[i - 1].md}).`);
        }
        patch.deviation = st;
      }
      if (checkshots !== undefined) patch.checkshots = validateStoredCheckshotsShape(checkshots);
      if (checkshotsProvenance !== undefined) patch.checkshots_provenance = checkshotsProvenance;
      if (!Object.keys(patch).length) throw new Error('Nothing to update.');
      Object.assign(w, patch, { updated_at: new Date(2026, 6, 13, 3, 0, seq++).toISOString() });
      return w;
    },

    async saveTop(wellId, { name, mdM, interpreter = null }) {
      ownWell(wellId, 'add tops to');
      const row = { id: nextId('top'), well_id: wellId, name, md_m: Number(mdM), interpreter };
      topsByWell.get(wellId).push(row);
      topsByWell.get(wellId).sort((a, b) => a.md_m - b.md_m);
      return row;
    },
    async updateTop(topId, patch) {
      for (const [wellId, list] of topsByWell) {
        const t = list.find((x) => x.id === topId);
        if (t) {
          ownWell(wellId, 'edit tops of');
          if (patch.mdM !== undefined) t.md_m = Number(patch.mdM);
          if (patch.name !== undefined) t.name = patch.name;
          if (patch.interpreter !== undefined) t.interpreter = patch.interpreter;
          list.sort((a, b) => a.md_m - b.md_m);
          return t;
        }
      }
      throw new Error('Top not found.');
    },
    async deleteTop(top) {
      ownWell(top.well_id, 'delete tops of');
      const list = topsByWell.get(top.well_id) || [];
      const i = list.findIndex((x) => x.id === top.id);
      if (i >= 0) list.splice(i, 1);
    },

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
          // LAS 3.0 (2026-09-03): what the reader left out, for the import preview
          delimiter: parsed.delimiter || 'space',
          skippedCurves: parsed.skippedCurves || [],
          ignoredSections: parsed.ignoredSections || [],
          curves: parsed.curves.map(({ data, ...rest }) => rest),
        },
        prep,
      };
    },
  };
}
