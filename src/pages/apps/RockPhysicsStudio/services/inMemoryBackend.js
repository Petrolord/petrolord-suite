// In-memory backend for the /dev/rock-physics-studio harness and
// jest: the workstation drivable without auth or DB (the harness
// philosophy). Same interface as registryBackend.
//
// The seeded well is built FROM THE ORACLE GOLDENS' anchor cases so
// the e2e suite asserts the oracle's numbers straight off the screen:
// - BRINE SAND zone: constant Vp 3200 / Vs 1800 / rho 2.25 g/cc /
//   PHIE 0.25 — the gassmann.log_domain golden's starting state.
//   Substituting brine(60degC, 25MPa, S 0.035) -> gas(g 0.6) with
//   K_min 37 GPa must show Vp 2905.70, Vs 1890.98, rho 2038.71.
// - Shale background: Vp 2900 / Vs 1330 / rho 2.29 — the upper
//   halfspace of every Rutherford-Williams AVO golden.
// - GAS SAND zone: Vp 2540 / Vs 1620 / rho 2.09 — the class-III
//   lower halfspace, so the interface at "Top Gas Sand" must read
//   A = -0.1118, B = -0.2437, class III.
// A second, org-shared well has NO DTS so the estimated-Vs provenance
// badge path is drivable.

let seq = 0;
const nextId = (p) => { seq += 1; return `${p}-${seq}`; };

const DEPTH_START = 2000;
const DEPTH_STOP = 2100;
const STEP = 0.5;

// intervals are INCLUSIVE both ends, matching prep.zoneIndices, so a
// zone's samples are exactly its layer's constants (exactness is the
// point of the fixture)
const LAYERS = [
  { name: 'BRINE SAND', top: 2020, base: 2040, vp: 3200, vs: 1800, rhoGcc: 2.25, phie: 0.25, vsh: 0 },
  { name: 'GAS SAND', top: 2060, base: 2080, vp: 2540, vs: 1620, rhoGcc: 2.09, phie: 0.25, vsh: 0 },
];
const SHALE = { vp: 2900, vs: 1330, rhoGcc: 2.29, phie: 0.08, vsh: 1 };

function layerAt(d) {
  return LAYERS.find((l) => d >= l.top && d <= l.base) || SHALE;
}

function buildCurves({ withDts }) {
  const n = Math.round((DEPTH_STOP - DEPTH_START) / STEP) + 1;
  const c = { DEPT: [], DT: [], RHOB: [], PHIE: [], VSH: [] };
  if (withDts) c.DTS = [];
  for (let i = 0; i < n; i++) {
    const d = DEPTH_START + i * STEP;
    const L = layerAt(d);
    c.DEPT.push(d);
    c.DT.push(1e6 / L.vp);            // US/M
    if (withDts) c.DTS.push(1e6 / L.vs);
    c.RHOB.push(L.rhoGcc);            // G/C3
    c.PHIE.push(L.phie);
    c.VSH.push(L.vsh);
  }
  return c;
}

const CURVE_UNITS = { DEPT: 'M', DT: 'US/M', DTS: 'US/M', RHOB: 'G/C3', PHIE: 'V/V', VSH: 'V/V' };

export function makeInMemoryBackend() {
  const curveStore = new Map();
  const logsByWell = new Map();
  const topsByWell = new Map();
  const zonesByWell = new Map();
  const wells = [];

  const addWell = ({ name, isOwn, org, withDts }) => {
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
      td_md_m: DEPTH_STOP,
      crs_note: 'EPSG:32630 (demo)',
      units_note: 'SI',
      deviation: [],
      checkshots: [],
      created_at: new Date(2026, 6, 14).toISOString(),
      updated_at: new Date(2026, 6, 14).toISOString(),
      is_own: isOwn,
    });
    const curves = buildCurves({ withDts });
    const logs = [];
    for (const [mnemonic, vals] of Object.entries(curves)) {
      const logId = nextId('log');
      curveStore.set(logId, Float64Array.from(vals));
      logs.push({
        id: logId,
        well_id: id,
        mnemonic,
        description: `${mnemonic} (oracle-anchored fixture)`,
        unit: CURVE_UNITS[mnemonic] || null,
        start_md_m: DEPTH_START,
        stop_md_m: DEPTH_STOP,
        step_m: STEP,
        n_samples: vals.length,
        null_count: 0,
        source_file: 'inMemoryBackend.js',
        provenance: { synthetic: true },
        storage_path: `dev/${id}/${logId}.f32`,
      });
    }
    logsByWell.set(id, logs);
    topsByWell.set(id, LAYERS.flatMap((l) => ([
      { id: nextId('top'), well_id: id, name: `Top ${l.name}`, md_m: l.top },
      { id: nextId('top'), well_id: id, name: `Base ${l.name}`, md_m: l.base },
    ])).sort((a, b) => a.md_m - b.md_m));
    zonesByWell.set(id, LAYERS.map((l) => ({
      id: nextId('zone'),
      well_id: id,
      name: l.name,
      top_md_m: l.top,
      base_md_m: l.base,
      properties: {},
    })));
    return id;
  };

  addWell({ name: 'KETA RP-1', isOwn: true, withDts: true });
  addWell({ name: 'AKOMA-2 (org shared)', isOwn: false, org: 'org-dev', withDts: false });

  // project persistence survives page reloads via sessionStorage so
  // the e2e can prove restore; first load seeds the analytic-fixture
  // project (K_min 37 GPa is the log_domain golden's mineral modulus)
  const PROJECT_KEY = 'rp.dev.project.v1';
  const SEED_PROJECT = {
    id: 'rp-project-dev',
    name: 'Default project',
    rock: { minerals: { quartz: 1, calcite: 0, dolomite: 0, clay: 0 }, kminOverrideGPa: '37', phiConst: 0.2 },
  };

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

    async loadProject() {
      try {
        const raw = window.sessionStorage.getItem(PROJECT_KEY);
        return raw ? JSON.parse(raw) : SEED_PROJECT;
      } catch {
        return SEED_PROJECT;
      }
    },

    async saveProject(patch) {
      const prev = (await this.loadProject()) || SEED_PROJECT;
      const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
      try {
        window.sessionStorage.setItem(PROJECT_KEY, JSON.stringify(next));
      } catch { /* jsdom without storage — keep in-memory only */ }
      return next;
    },
  };
}
