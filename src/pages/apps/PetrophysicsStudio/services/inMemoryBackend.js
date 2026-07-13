// In-memory backend for the /dev/petrophysics-studio harness and jest:
// the workstation drivable without auth or DB (the harness
// philosophy). Same interface as registryBackend.
//
// The seeded well IS the analytic type well from
// test-data/petrophysics/typewell.json — the same fixture the oracle
// goldens are generated from — so the e2e suite asserts the ORACLE'S
// zone numbers straight off the screen (net 18.0 m in SAND A with the
// default parameter set). A second, org-shared read-only well
// exercises the owner-only zone guards.

import typewell from '../../../../../test-data/petrophysics/typewell.json';

const CURVE_UNITS = { DEPT: 'M', GR: 'GAPI', RHOB: 'G/C3', NPHI: 'V/V', DT: 'US/M', RT: 'OHMM' };

let seq = 0;
const nextId = (p) => { seq += 1; return `${p}-${seq}`; };

const toArray = (vals) => Float64Array.from(vals, (v) => (v === null ? NaN : v));

export function makeInMemoryBackend() {
  const curveStore = new Map();   // log id -> Float64Array
  const logsByWell = new Map();
  const topsByWell = new Map();
  const zonesByWell = new Map();
  const wells = [];

  const addWell = ({ name, isOwn, org }) => {
    const id = nextId('well');
    wells.push({
      id,
      user_id: isOwn ? 'user-dev' : 'user-other',
      organization_id: org || null,
      name,
      uwi: name,
      surface_x: 501000,
      surface_y: 6700200,
      kb_m: 30,
      td_md_m: 2100,
      crs_note: 'EPSG:32630 (demo)',
      units_note: 'SI',
      deviation: [],
      checkshots: [],
      created_at: new Date(2026, 6, 13).toISOString(),
      updated_at: new Date(2026, 6, 13).toISOString(),
      is_own: isOwn,
      tops: [],
    });
    logsByWell.set(id, []);
    topsByWell.set(id, []);
    zonesByWell.set(id, []);
    return id;
  };

  const addLogs = (wellId) => {
    const depth = typewell.curves.DEPT;
    for (const [mnemonic, vals] of Object.entries(typewell.curves)) {
      const id = nextId('log');
      curveStore.set(id, toArray(vals));
      logsByWell.get(wellId).push({
        id,
        well_id: wellId,
        mnemonic,
        description: `${mnemonic} (analytic type well)`,
        unit: CURVE_UNITS[mnemonic] || null,
        start_md_m: depth[0],
        stop_md_m: depth[depth.length - 1],
        step_m: 0.5,
        n_samples: vals.length,
        null_count: vals.filter((v) => v === null).length,
        source_file: 'typewell.json',
        provenance: { synthetic: true },
        storage_path: `dev/${wellId}/${id}.f32`,
      });
    }
  };

  // own well: the analytic type well, one zone pre-seeded
  const ownId = addWell({ name: 'KETA TYPE-1', isOwn: true });
  addLogs(ownId);
  topsByWell.set(ownId, [
    { id: nextId('top'), well_id: ownId, name: 'Top Sand A', md_m: 2010 },
    { id: nextId('top'), well_id: ownId, name: 'Top Shale', md_m: 2030 },
    { id: nextId('top'), well_id: ownId, name: 'Top Sand B', md_m: 2050 },
  ]);
  zonesByWell.set(ownId, [{
    id: nextId('zone'),
    well_id: ownId,
    name: 'SAND A',
    top_md_m: typewell.params.zones.SAND_A[0],
    base_md_m: typewell.params.zones.SAND_A[1],
    properties: {},
  }]);

  // org-shared read-only well (same curves; zones locked)
  const sharedId = addWell({ name: 'AKOMA-2 (org shared)', isOwn: false, org: 'org-dev' });
  addLogs(sharedId);
  zonesByWell.set(sharedId, [{
    id: nextId('zone'),
    well_id: sharedId,
    name: 'MAIN',
    top_md_m: 2010,
    base_md_m: 2080,
    properties: { phi_avg: 0.21, published_by: 'other user' },
  }]);

  const ownZoneWell = (wellId) => {
    const w = wells.find((x) => x.id === wellId);
    if (!w) throw new Error('Well not found.');
    if (!w.is_own) throw new Error('Only the owner can edit zones (org sharing is read-only).');
    return w;
  };

  const ownWell = (wellId, what) => {
    const w = wells.find((x) => x.id === wellId);
    if (!w) throw new Error('Well not found.');
    if (!w.is_own) throw new Error(`Only the owner can ${what} (org sharing is read-only).`);
    return w;
  };

  // project persistence survives page reloads via sessionStorage so
  // the e2e can prove restore; each Playwright context starts clean
  const PROJECT_KEY = 'petro.dev.project.v1';

  return {
    async listWells() { return [...wells]; },
    async listLogs(wellId) { return [...(logsByWell.get(wellId) || [])]; },
    async downloadCurve(log) {
      const data = curveStore.get(log.id);
      if (!data) throw new Error(`No curve data for ${log.mnemonic}.`);
      return data;
    },
    async listTops(wellId) { return [...(topsByWell.get(wellId) || [])]; },

    async listZones(wellId) {
      return [...(zonesByWell.get(wellId) || [])].sort((a, b) => a.top_md_m - b.top_md_m);
    },
    async saveZone(wellId, z) {
      ownZoneWell(wellId);
      if (!(z.baseMdM > z.topMdM)) throw new Error('Zone base must be below its top.');
      const zone = {
        id: nextId('zone'), well_id: wellId, name: z.name,
        top_md_m: z.topMdM, base_md_m: z.baseMdM, properties: {},
      };
      zonesByWell.get(wellId).push(zone);
      return zone;
    },
    async updateZone(zoneId, patch) {
      for (const [wellId, zones] of zonesByWell) {
        const z = zones.find((x) => x.id === zoneId);
        if (z) {
          ownZoneWell(wellId);
          Object.assign(z, patch);
          return z;
        }
      }
      throw new Error('Zone not found.');
    },
    async deleteZone(zone) {
      ownZoneWell(zone.well_id);
      const zones = zonesByWell.get(zone.well_id);
      const i = zones.findIndex((x) => x.id === zone.id);
      if (i >= 0) zones.splice(i, 1);
    },

    /** Mirrors registryBackend.publishCurves incl. the
     *  overwrite-own-output rule and the owner-only RLS guard. */
    async publishCurves(wellId, preparedLogs, projectId) {
      ownWell(wellId, 'publish curves to this well');
      const logs = logsByWell.get(wellId);
      const mnemonics = new Set(preparedLogs.map((l) => l.mnemonic));
      for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i];
        if (l.provenance?.computed && l.provenance?.engine === 'petrophysics-studio'
          && l.provenance?.project_id === projectId && mnemonics.has(l.mnemonic)) {
          curveStore.delete(l.id);
          logs.splice(i, 1);
        }
      }
      return preparedLogs.map((log) => {
        const id = nextId('log');
        curveStore.set(id, log.data);
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
          source_file: null,
          provenance: log.provenance || {},
          storage_path: `dev/${wellId}/${id}.f32`,
        };
        logs.push(row);
        return row;
      });
    },

    async publishZone(zone, properties) {
      ownZoneWell(zone.well_id);
      const z = (zonesByWell.get(zone.well_id) || []).find((x) => x.id === zone.id);
      if (!z) throw new Error('Zone not found.');
      z.properties = properties;
      return z;
    },

    async loadProject() {
      try {
        const raw = window.sessionStorage.getItem(PROJECT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    async saveProject(patch) {
      const prev = (await this.loadProject()) || { id: 'project-dev', name: 'Default project' };
      const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
      try {
        window.sessionStorage.setItem(PROJECT_KEY, JSON.stringify(next));
      } catch { /* jsdom without storage — keep in-memory only */ }
      return next;
    },
  };
}
