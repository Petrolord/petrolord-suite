// Section state shared by Well Correlation and Stratigraphy Studio
// (Stratigraphy ST2, 2026-09-06: the second consumer, so the assembly
// moved here from CorrelationWorkstation unchanged). Owns the registry
// wells, the ordered section, each well's tops / curves / intervals, the
// saved-section state (datum, template layouts, unit, reference, spacing,
// zones, shown tops) and the section wells resolved against the active
// template. The hosts keep their own tops editing, pick modes and status.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWellCurvesCache } from '@/components/wells/useWellCurvesCache';
import { resolveTracks } from '@/components/wells/layout/resolveTracks';
import { buildDefaultLayouts, migrateLayouts, activeTemplate } from '@/components/wells/layout/layoutSchema';
import { makeDepthFrame } from '@/pages/apps/WellDataManager/engine/checkshots';
import { allTopNames } from '@/pages/apps/WellCorrelation/engine/section';
import { orientSectionCurves } from './sectionFrame';
import { useAppUnits } from '@/lib/units/useAppUnits';

export const CORR_PARAMS = { grClean: 30, grClay: 120, cutPhi: 0.08, cutVsh: 0.4, cutSw: 0.6 };
export const DEFAULT_TEMPLATE = 'quicklook';
const defaultLayouts = () => ({ ...buildDefaultLayouts(), activeTemplateId: DEFAULT_TEMPLATE });

/**
 * @param {Object} backend listWells, listTops, listLogs, downloadCurve, loadSection, (listIntervals)
 * @param {{ deepLinkWells?: string[], onStatus?: (msg: string) => void }} [opts]
 */
export function useSectionWells(backend, { deepLinkWells = [], onStatus = () => {}, unitsApp = 'well-correlation' } = {}) {
  // deep link (cross-app navigation, 2026-09-03): ?wells=<id,id> appends
  // those wells to the section once the wells and any saved section loaded
  const deepLinkRef = useRef({ wells: deepLinkWells || [], done: false });
  const [sectionLoaded, setSectionLoaded] = useState(false);
  const [wells, setWells] = useState(null);
  const [order, setOrder] = useState([]);              // ordered well ids
  const [wellData, setWellData] = useState({});        // id -> {tops, curves, logs, inventory}
  const [loading, setLoading] = useState(0);           // wells with curves in flight
  const [datum, setDatum] = useState({ mode: 'structural' });
  const [shownTops, setShownTops] = useState([]);
  const [zoneMode, setZoneMode] = useState('consecutive');
  const [zonePair, setZonePair] = useState(null);
  // Suite unit profile: the depth unit starts from the profile. A saved
  // section (or a host's saved view) opens in the unit it was saved with,
  // like a saved project; the toolbar choice is a session view override.
  // unitNote feeds UnitProfileNote, so the UI says when the view differs.
  const unitsHook = useAppUnits(unitsApp, { depth: { family: 'depth', allowed: ['m', 'ft'] } }, { fallback: { depth: 'm' } });
  const [savedDepthUnit, setSavedDepthUnit] = useState(null);
  const depthUnit = savedDepthUnit || unitsHook.units.depth;
  const setDepthUnit = useCallback((u) => { setSavedDepthUnit(null); unitsHook.setUnit('depth', u); }, [unitsHook]);
  /** A saved view's unit: shown as saved, without becoming a session override. */
  const restoreDepthUnit = useCallback((u) => { if (u === 'm' || u === 'ft') setSavedDepthUnit(u); }, []);
  const unitNote = useMemo(() => ({
    ...unitsHook,
    units: { depth: depthUnit },
    differs: depthUnit !== unitsHook.profileUnits.depth ? ['depth'] : [],
    resetToProfile: () => { setSavedDepthUnit(null); unitsHook.resetToProfile(); },
  }), [unitsHook, depthUnit]);
  const [depthRef, setDepthRef] = useState('md');
  const [spacing, setSpacing] = useState('equal');
  const [columnWidth, setColumnWidth] = useState('auto'); // U2-002: 'auto' | 'fit' | px
  const [layouts, setLayouts] = useState(defaultLayouts);
  // WC-U1-006: a saved section this build cannot open (a newer build's row)
  // is kept out of reach of Save, so it is never overwritten by an empty one
  const [sectionRefused, setSectionRefused] = useState(null);
  // the saved row as restored (hosts compare against it for unsaved changes
  // and keep their own extra keys: ghost, report header)
  const [savedRow, setSavedRow] = useState(null);
  // U2-001 named sections: the row this state belongs to (null = not saved yet)
  const [sectionId, setSectionId] = useState(null);
  const [sectionName, setSectionName] = useState(null);
  const curvesCache = useWellCurvesCache(backend);
  const wellDataRef = useRef({});
  const pendingRef = useRef(new Set());
  useEffect(() => { wellDataRef.current = wellData; }, [wellData]);

  const applySaved = useCallback((section) => {
    setOrder(section.well_ids || []);
    if (section.datum) setDatum(section.datum);
    const tl = section.track_layout || {};
    if (tl.layouts) setLayouts({ ...migrateLayouts(tl.layouts), activeTemplateId: tl.layouts.activeTemplateId || DEFAULT_TEMPLATE });
    if (tl.depthUnit === 'm' || tl.depthUnit === 'ft') setSavedDepthUnit(tl.depthUnit);
    if (['md', 'tvd', 'tvdss', 'twt'].includes(tl.depthRef)) setDepthRef(tl.depthRef);
    if (tl.spacing === 'equal' || tl.spacing === 'proportional' || tl.spacing === 'line') setSpacing(tl.spacing);
    if (tl.columnWidth === 'auto' || tl.columnWidth === 'fit' || (Number(tl.columnWidth) >= 40 && Number(tl.columnWidth) <= 600)) setColumnWidth(tl.columnWidth === 'auto' || tl.columnWidth === 'fit' ? tl.columnWidth : Number(tl.columnWidth));
    if (['none', 'consecutive', 'pair'].includes(tl.zoneMode)) setZoneMode(tl.zoneMode);
    if (Array.isArray(tl.shownTops)) setShownTops(tl.shownTops);
    if (Array.isArray(tl.zonePair) && tl.zonePair.length === 2) setZonePair(tl.zonePair);
  }, []);

  // a stored row into the state; wells gone from the registry are left out
  // and counted (WC-U1-007)
  const restore = useCallback((section, list, verb) => {
    const known = new Set((list || []).map((w) => w.id));
    const ids = section.well_ids || [];
    const missing = ids.filter((id) => !known.has(id));
    applySaved({ ...section, well_ids: ids.filter((id) => known.has(id)) });
    setSavedRow(section);
    setSectionId(section.id || null);
    setSectionName(section.name || null);
    setSectionRefused(null);
    const label = section.name ? ` ${section.name}` : '';
    onStatus(missing.length
      ? `${verb}${label}. ${missing.length} of its ${ids.length} wells ${missing.length === 1 ? 'is' : 'are'} no longer in your registry (deleted or no longer shared) and ${missing.length === 1 ? 'was' : 'were'} left out.`
      : `${verb}${label}.`);
  }, [applySaved]); // eslint-disable-line react-hooks/exhaustive-deps

  // the section part of the state back to a blank section (view settings,
  // unit, reference, template and column width stay as the user has them)
  const clearSection = useCallback(() => {
    setOrder([]);
    setDatum({ mode: 'structural' });
    setShownTops([]);
    setZoneMode('consecutive');
    setZonePair(null);
  }, []);

  /** U2-001: open a named section by id (the whole state is replaced). */
  const openSection = useCallback(async (id) => {
    try {
      const row = await backend.loadSection(id);
      if (!row) throw new Error('That section no longer exists (deleted in another tab?).');
      clearSection();
      restore(row, wells || [], 'Opened section');
      return row;
    } catch (e) {
      // WC-U1-006 per section: a row this build cannot open is never overwritten
      clearSection();
      setSavedRow(null);
      setSectionId(id);
      setSectionRefused(e.message);
      onStatus(e.message);
      return null;
    }
  }, [backend, wells, restore, clearSection]); // eslint-disable-line react-hooks/exhaustive-deps

  /** U2-001: start a blank section bound to a row just created (or none). */
  const startSection = useCallback((row = null) => {
    clearSection();
    setSectionRefused(null);
    setSectionId(row?.id || null);
    setSectionName(row?.name || null);
    setSavedRow(row || { track_layout: {} });
  }, [clearSection]);

  useEffect(() => {
    let live = true;
    (async () => {
      let list;
      try {
        list = await backend.listWells();
        if (!live) return;
        setWells(list);
      } catch (e) {
        if (live) { onStatus(e.message); setWells([]); setSectionLoaded(true); }
        return;
      }
      // WC-U1-006: the saved section loads on its own, so a row this build
      // cannot open (or a failed read) never empties the wells list
      try {
        const section = await backend.loadSection();
        if (section && live) restore(section, list, 'Restored saved section');
      } catch (e) {
        if (live) { setSectionRefused(e.message); onStatus(e.message); }
      }
      if (live) setSectionLoaded(true);
    })();
    return () => { live = false; };
  }, [backend, applySaved]);

  // load tops + every curve for a well the first time it enters the section
  const ensureWellData = useCallback(async (wellId) => {
    if (wellDataRef.current[wellId] || pendingRef.current.has(wellId)) return;
    pendingRef.current.add(wellId);
    setLoading((n) => n + 1);
    try {
      const [tops, cwRaw, intervals, zones] = await Promise.all([backend.listTops(wellId), curvesCache.getCurves(wellId), backend.listIntervals ? backend.listIntervals(wellId).catch(() => []) : Promise.resolve([]),
        backend.listZones ? backend.listZones(wellId).catch(() => []) : Promise.resolve([])]); // U2-008: published zones
      const cw = orientSectionCurves(cwRaw); // WC-U1-003: G1-era bottom-up curves read top-down
      setWellData((m) => ({ ...m, [wellId]: { tops, intervals: intervals || [], zones: zones || [], curves: cw.curves, logs: cw.logs, inventory: cw.inventory, reoriented: cw.reoriented } }));
    } catch (e) {
      onStatus(e.message);
    } finally {
      pendingRef.current.delete(wellId);
      setLoading((n) => n - 1);
    }
  }, [backend, curvesCache]);

  useEffect(() => {
    const dl = deepLinkRef.current;
    if (dl.done || !dl.wells.length || !wells || !sectionLoaded) return;
    dl.done = true;
    const ids = dl.wells.filter((id) => wells.some((w) => w.id === id));
    if (!ids.length) { onStatus('The linked wells are not in your registry.'); return; }
    (async () => {
      for (const id of ids) await ensureWellData(id);
      setOrder((o) => [...o, ...ids.filter((id) => !o.includes(id))]);
      onStatus(`Added ${ids.length} linked well${ids.length === 1 ? '' : 's'} to the section.`);
    })();
  }, [wells, sectionLoaded, ensureWellData]);

  // wells restored from a saved section need their data too
  useEffect(() => { for (const id of order) ensureWellData(id); }, [order, ensureWellData]);

  const refreshTops = useCallback(async (wellId) => {
    const tops = await backend.listTops(wellId);
    setWellData((m) => ({ ...m, [wellId]: { ...(m[wellId] || {}), tops } }));
  }, [backend]);

  const toggleWell = async (wellId) => {
    if (order.includes(wellId)) {
      setOrder((o) => o.filter((x) => x !== wellId));
    } else {
      await ensureWellData(wellId);
      setOrder((o) => (o.includes(wellId) ? o : [...o, wellId]));
    }
  };

  const moveWell = (wellId, dir) => setOrder((o) => {
    const i = o.indexOf(wellId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return o;
    const next = [...o];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // section wells in order with tops, curves and the template resolved
  // against each well's own inventory (missing curves drop out per well)
  const template = useMemo(() => activeTemplate(layouts), [layouts]);
  const sectionWells = useMemo(() => order
    .map((id) => {
      const w = (wells || []).find((x) => x.id === id);
      const d = wellData[id];
      if (!w || !d) return null;
      let frame = null;
      try {
        frame = makeDepthFrame({ deviation: w.deviation, kbM: w.kb_m, tdMdM: w.td_md_m });
      } catch { frame = null; }
      const tracks = resolveTracks(template, {
        curves: d.curves || {}, logs: d.logs || {}, outputs: {}, faciesData: null, facies: [], params: CORR_PARAMS,
        intervals: d.intervals || [], depth: d.curves?.DEPT || null,
      });
      return {
        id: w.id, name: w.name, uwi: w.uwi, is_own: w.is_own, organization_id: w.organization_id,
        surface_x: w.surface_x, surface_y: w.surface_y, kb_m: w.kb_m, crs: w.crs ?? null, xy_unit: w.xy_unit ?? null,
        checkshots: Array.isArray(w.checkshots) ? w.checkshots : null, // U2-003/U2-004 time-depth
        tops: d.tops || [], depth: d.curves?.DEPT || null, tracks, frame, reoriented: !!d.reoriented,
      };
    })
    .filter(Boolean), [order, wells, wellData, template]);

  const topNames = useMemo(() => allTopNames(sectionWells), [sectionWells]);
  // default-show every top the first time the section has any; keep the
  // user's choice afterwards, dropping names that left the section
  useEffect(() => {
    setShownTops((prev) => (prev.length ? prev.filter((n) => topNames.includes(n)) : topNames));
  }, [topNames]);
  const logSources = useMemo(() => {
    const s = new Set();
    for (const id of order) for (const m of Object.keys(wellData[id]?.logs || {})) s.add(m);
    return [...s].sort();
  }, [order, wellData]);


  return {
    wells, order, setOrder, wellData, setWellData, loading, sectionLoaded,
    datum, setDatum, shownTops, setShownTops, zoneMode, setZoneMode, zonePair, setZonePair,
    depthUnit, setDepthUnit, restoreDepthUnit, unitNote, depthRef, setDepthRef, spacing, setSpacing, columnWidth, setColumnWidth, layouts, setLayouts,
    template, sectionWells, topNames, logSources, ensureWellData, refreshTops, toggleWell, moveWell, applySaved,
    sectionRefused, savedRow, setSavedRow,
    sectionId, setSectionId, sectionName, setSectionName, openSection, startSection, restore,
  };
}
