// Project Data Inventory: a data source over an app's own backend (the
// in-memory backends of the dev harnesses, or an app backend with the
// per-well reads). The registry source (registrySource.js) reads in bulk;
// this one reads well by well, which is fine for a harness or a study's
// handful of wells.

/**
 * @param {Object} backend listWells(), and loadWell(well) or listLogs/listZones/listTops(wellId); downloadCurve(log); inventorySeismic() optional
 * @param {{seismic?: Function}} [opts] a seismic loader to use instead of backend.inventorySeismic
 */
export function sourceFromBackend(backend, { seismic = null } = {}) {
  return {
    async loadWells({ wellIds = null } = {}) {
      const wells = await backend.listWells();
      const chosen = (wellIds && wellIds.length ? wells.filter((w) => wellIds.includes(w.id)) : wells)
        .slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
      return Promise.all(chosen.map(async (well) => {
        if (backend.loadWell) {
          const r = await backend.loadWell(well);
          return { well: r.well || well, logs: r.logs || [], zones: r.zones || [], tops: r.tops || [] };
        }
        const [logs, zones, tops] = await Promise.all([
          backend.listLogs ? backend.listLogs(well.id) : [],
          backend.listZones ? backend.listZones(well.id).catch(() => []) : [],
          backend.listTops ? backend.listTops(well.id).catch(() => []) : [],
        ]);
        return { well, logs, zones, tops };
      }));
    },
    async loadSeismic(opts) {
      if (seismic) return seismic(opts);
      return backend.inventorySeismic ? backend.inventorySeismic(opts) : {};
    },
    downloadCurve: backend.downloadCurve ? (log) => backend.downloadCurve(log) : null,
  };
}
