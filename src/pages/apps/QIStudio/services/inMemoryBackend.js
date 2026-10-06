// In-memory QI Studio backend for the dev harness and tests: three wells
// with different gaps (one complete, one with no shear log or checkshots,
// one with no elevation and a digitized density), one seismic volume.

const log = (mnemonic, start, stop, extra = {}) => ({ id: `${mnemonic}-${start}`, mnemonic, start_md_m: start, stop_md_m: stop, step_m: 0.5, ...extra });
const zones = (wellId) => [
  { id: `${wellId}-a`, name: 'SAND A', top_md_m: 2000, base_md_m: 2080 },
  { id: `${wellId}-b`, name: 'SAND B', top_md_m: 2300, base_md_m: 2360 },
];

export function makeInMemoryBackend() {
  const wells = [
    {
      well: { id: 'qi-w1', name: 'KETA-1', kb_m: 30, depth_ref_elev_m: 30, depth_ref_kind: 'KB', checkshots: [{ tvdss_m: 1500, twt_ms: 1300 }, { tvdss_m: 2400, twt_ms: 1950 }], deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 3000, inc: 0, azi: 0 }], is_own: true },
      logs: [log('GR', 1500, 2800), log('DT', 1500, 2800), log('DTSM', 1500, 2800), log('RHOB', 1500, 2800), log('PHIE', 1500, 2800), log('VSH', 1500, 2800), log('SW', 1500, 2800)],
    },
    {
      well: { id: 'qi-w2', name: 'AKOMA-2', kb_m: 28, depth_ref_elev_m: 28, depth_ref_kind: 'KB', checkshots: [], deviation: [], is_own: true },
      logs: [log('GR', 1800, 2500), log('DTCO', 1800, 2500), log('RHOZ', 1800, 2500), log('PHIT', 1800, 2500), log('VSH', 1800, 2500), log('SW', 1800, 2500)],
    },
    {
      well: { id: 'qi-w3', name: 'BONSU-3', depth_ref_kind: 'KB', depth_ref_elev_m: null, ground_elev_m: null, checkshots: [{ tvdss_m: 1900, twt_ms: 1600 }, { tvdss_m: 2300, twt_ms: 1880 }], deviation: [], is_own: true },
      logs: [log('GR', 1900, 2340), log('DT', 1900, 2340), log('RHOB_DIG', 1900, 2340, { provenance: { digitized: true } })],
    },
  ];
  return {
    async listWells() { return wells.map((w) => w.well); },
    async loadWell(well) {
      const w = wells.find((x) => x.well.id === well.id);
      return { well: w.well, logs: w.logs, zones: zones(w.well.id), tops: [] };
    },
    async listVolumes() { return [{ id: 'qi-v1', name: 'Keta 3D full stack', kind: 'seismic', status: 'ready' }]; },
    async countSurfaces() { return 2; },
  };
}
