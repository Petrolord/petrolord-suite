// Seismic horizons in a well section, shared by Well Correlation and
// Stratigraphy Studio (AppUpgrade STRAT-U2-002, 2026-09-30: moved here
// unchanged from CorrelationWorkstation, where WC-U2-003 built it, so the
// stratigrapher's section draws the same horizons).
//
// Read only from the surface registry: the time and depth structure
// surfaces Seismolord converts its horizons to (geo_surfaces). A checked
// horizon is sampled where each wellbore crosses it and becomes a
// read-only marker in every well it reaches, offered to Flatten and
// Stretch; wells it cannot place are named per horizon. Nothing is written.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { horizonCandidates, horizonAtWell, horizonLabel } from './horizons';

/**
 * @param {Object} backend listSurfaces and downloadSurfaceGrid (both optional: no horizons without them)
 * @param {Array} sectionWells the section wells (useSectionWells)
 * @param {Array<string>} topNames the section's top names
 * @param {(msg: string) => void} [onStatus]
 */
export function useSectionHorizons(backend, sectionWells, topNames, onStatus = () => {}) {
  const [hzRows, setHzRows] = useState([]);   // geo_surfaces rows
  const [hzGrids, setHzGrids] = useState({}); // id -> grid
  const [hzOn, setHzOn] = useState([]);       // ids drawn
  const canHorizons = typeof backend?.listSurfaces === 'function';
  useEffect(() => {
    if (!canHorizons) return undefined;
    let live = true;
    backend.listSurfaces().then((rows) => { if (live) setHzRows(rows || []); }).catch((e) => { if (live) onStatus(`Horizons could not be listed: ${e.message}`); });
    return () => { live = false; };
  }, [backend, canHorizons]); // eslint-disable-line react-hooks/exhaustive-deps
  const hzList = useMemo(() => horizonCandidates(hzRows), [hzRows]);
  const loadGrid = useCallback(async (id) => {
    const row = hzRows.find((r) => r.id === id);
    if (!row) return false;
    try {
      const grid = await backend.downloadSurfaceGrid(row);
      setHzGrids((g) => ({ ...g, [id]: grid }));
      return true;
    } catch (e) { onStatus(`Horizon ${row.name}: ${e.message}`); return false; }
  }, [backend, hzRows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { for (const id of hzOn) if (!hzGrids[id]) loadGrid(id); }, [hzOn, hzGrids, loadGrid]);
  const toggleHorizon = (id) => setHzOn((on) => (on.includes(id) ? on.filter((x) => x !== id) : [...on, id]));
  // each drawn horizon becomes a read-only marker in every well it crosses
  const horizonPicks = useMemo(() => {
    const byWell = {}; const problems = {}; const names = [];
    for (const id of hzOn) {
      const c = hzList.find((x) => x.id === id);
      const row = hzRows.find((r) => r.id === id);
      const grid = hzGrids[id];
      if (!c || !row || !grid) continue;
      const name = horizonLabel(c);
      names.push(name);
      problems[id] = [];
      for (const w of sectionWells) {
        const hit = horizonAtWell(row, grid, w);
        if (hit.problem) { problems[id].push(`${w.name} (${hit.problem})`); continue; }
        (byWell[w.id] ||= []).push({ id: `hz:${id}:${w.id}`, well_id: w.id, name, md_m: hit.md, readonly: true, horizon: true, surface_type: 'formation_top', twt_ms: hit.twt });
      }
    }
    return { byWell, problems, names };
  }, [hzOn, hzList, hzRows, hzGrids, sectionWells]);
  const viewWells = useMemo(() => (horizonPicks.names.length
    ? sectionWells.map((w) => ({ ...w, tops: [...w.tops, ...(horizonPicks.byWell[w.id] || [])] }))
    : sectionWells), [sectionWells, horizonPicks]);
  const datumNames = useMemo(() => [...topNames, ...horizonPicks.names], [topNames, horizonPicks.names]);

  return { canHorizons, hzRows, hzList, hzGrids, hzOn, setHzOn, toggleHorizon, horizonPicks, viewWells, datumNames };
}
