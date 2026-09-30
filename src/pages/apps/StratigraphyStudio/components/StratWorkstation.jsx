// Stratigraphy Studio workstation (ST0, 2026-09-06). The controller on an
// injected backend (registry or in-memory): the Geoscience shell with a
// ribbon (module home, terminology display option, views), an explorer of
// registry wells and the column, a centre view (Column editor, Tops typing
// on the selected well, Glossary) and a dock legend. Owns no section
// drawing: that stays Well Correlation's component and arrives in ST2.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, Loader2, PanelRight, BookOpen, ListTree, Tags, Rows as RowsIcon, Image, GitCompare, Hourglass, Clock, HelpCircle, History, Microscope } from 'lucide-react';
import IntervalsEditor from '@/components/wells/IntervalsEditor';
import ZoneSchemePanel from './ZoneSchemePanel';
import CoreImagesPanel from '@/components/wells/CoreImagesPanel';
import SectionView from './SectionView';
import AgesView from './AgesView';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { SCHEMES } from '@/lib/stratigraphy/vocabulary';
import { useScheme } from '@/lib/stratigraphy/scheme';
import { TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';
import { orderedUnits } from '@/lib/stratigraphy/column';
import { wellDataManagerHref, appPath, WELL_DATA_MANAGER_ID, MAPPING_ID, mapTopHref } from '@/components/wells/appLinks';
import ColumnEditor from './ColumnEditor';
import TopsTyping from './TopsTyping';
import Glossary from './Glossary';
import TimescalePanel from './TimescalePanel';
import BiostratEvents from './BiostratEvents';
import { flagAges, withStamps, changedAges, acceptPlan } from '@/lib/stratigraphy/ageCharts';

const VIEWS = [
  { id: 'column', label: 'Column', icon: ListTree },
  { id: 'tops', label: 'Tops', icon: Tags },
  { id: 'intervals', label: 'Intervals', icon: RowsIcon },
  { id: 'core', label: 'Core', icon: Image },
  { id: 'section', label: 'Section', icon: GitCompare },
  { id: 'wheeler', label: 'Wheeler', icon: Hourglass },
  { id: 'ages', label: 'Ages', icon: Clock },
  { id: 'events', label: 'Events', icon: Microscope },
  { id: 'timescale', label: 'Timescale', icon: History },
  { id: 'glossary', label: 'Glossary', icon: BookOpen },
];

const TIMESCALE_LABEL = TIMESCALE_VERSION;
const SCHEME_LABEL = { catuneanu: 'Catuneanu', exxon: 'Exxon (display)' };

/**
 * @param {Object} p
 * @param {Object} p.backend registry or in-memory backend
 * @param {Object} [p.appPaths] harness route overrides (DEV_APP_PATHS)
 */
export default function StratWorkstation({ backend, appPaths = {} }) {
  const [searchParams] = useSearchParams();
  const [wells, setWells] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedId, setSelectedId] = useState(() => searchParams.get('well') || null);
  const [tops, setTops] = useState([]);
  const [intervals, setIntervals] = useState([]);     // ST1 interval logs of the selected well
  const [coreImages, setCoreImages] = useState([]);   // ST1 core photos of the selected well
  const [project, setProject] = useState(null);       // ST2 app-private view state (strat_projects)
  const [view, setView] = useState('column');
  const [scheme, setScheme] = useScheme();
  const [dockOpen, setDockOpen] = useState(true);
  const [status, setStatus] = useState('Ready.');
  // STRAT-U1-014: who prepared the exported charts (and the field), saved with the view
  const [report, setReport] = useState({ field: '', analyst: '' });
  const [loading, setLoading] = useState(0);
  // STRAT-U2-003: every visible top, read for the chart-version flags
  const [allTops, setAllTops] = useState(null);
  // STRAT-U2-004: depths in Tops, Intervals, Core and Ages read in m or ft (stored metres); saved with the project
  const [unit, setUnit] = useState('m');
  const [accepting, setAccepting] = useState(false);

  const track = useCallback(async (fn) => {
    setLoading((n) => n + 1);
    try { return await fn(); } finally { setLoading((n) => n - 1); }
  }, []);

  const refreshAllTops = useCallback(async () => {
    if (typeof backend.listAllTops !== 'function') { setAllTops([]); return; }
    try { setAllTops(await backend.listAllTops()); } catch (e) { setAllTops([]); setStatus(`The tops could not be read for the timescale check: ${e.message}`); }
  }, [backend]);
  useEffect(() => { refreshAllTops(); }, [refreshAllTops]);

  const refreshUnits = useCallback(async () => {
    try { setUnits(await backend.listUnits()); } catch (e) { setStatus(e.message); }
  }, [backend]);

  useEffect(() => {
    let alive = true;
    track(async () => {
      try {
        const [w, , proj] = await Promise.all([backend.listWells(), refreshUnits(), backend.loadStratProject ? backend.loadStratProject().catch((e) => { setStatus(`Your saved stratigraphy view was not opened: ${e.message} Save view stays refused so it is not overwritten.`); return null; }) : Promise.resolve(null)]);
        if (!alive) return;
        setWells(w);
        setProject(proj || null);
        if (proj?.view?.displayUnit === 'ft') setUnit('ft');
        if (proj?.view?.report) setReport({ field: proj.view.report.field || '', analyst: proj.view.report.analyst || '' });
      } catch (e) {
        if (alive) { setWells([]); setStatus(e.message); }
      }
    });
    return () => { alive = false; };
  }, [backend, refreshUnits, track]);

  const well = useMemo(() => (wells || []).find((w) => w.id === selectedId) || null, [wells, selectedId]);
  // T1 (ST-T1-003): a per-well view opens on the first well instead of an empty pane
  useEffect(() => {
    if (!selectedId && (wells || []).length && ['ages', 'events', 'intervals', 'core', 'tops'].includes(view)) setSelectedId(wells[0].id);
  }, [selectedId, wells, view]);

  const refreshTops = useCallback(async () => {
    if (!selectedId) { setTops([]); setIntervals([]); setCoreImages([]); return; }
    try {
      const [t, iv, ci] = await Promise.all([
        backend.listTops(selectedId),
        backend.listIntervals ? backend.listIntervals(selectedId).catch(() => []) : Promise.resolve([]),
        backend.listCoreImages ? backend.listCoreImages(selectedId).catch(() => []) : Promise.resolve([]),
      ]);
      setTops(t); setIntervals(iv || []); setCoreImages(ci || []);
    } catch (e) { setStatus(e.message); }
  }, [backend, selectedId]);
  // reload the selected well's tops, intervals and photos on every view change too: the
  // Section view records tracts through its own section state (ST2)
  useEffect(() => { refreshTops(); }, [refreshTops, view]);

  const selectWell = (id) => { setSelectedId(id); setView((v) => (['intervals', 'core', 'ages', 'events'].includes(v) ? v : 'tops')); };

  const replaceIntervals = async (kind, rows) => {
    await backend.replaceIntervals(selectedId, kind, rows);
    setIntervals(await backend.listIntervals(selectedId));
  };
  const coreOps = {
    urlOf: (img) => backend.coreImageUrl(img),
    onUpload: async (file, meta) => { await backend.uploadCoreImage(selectedId, file, meta); setCoreImages(await backend.listCoreImages(selectedId)); },
    onUpdate: async (img, patch) => { await backend.updateCoreImage(img.id, patch); setCoreImages(await backend.listCoreImages(selectedId)); },
    onDelete: async (img) => { await backend.deleteCoreImage(img); setCoreImages(await backend.listCoreImages(selectedId)); },
  };

  // STRAT-U2-003: every age typed or filled here is stamped with the chart it
  // was entered under (strat_projects.view.ageCharts, no schema change)
  const stampAges = async (ages) => {
    if (!ages.length) return;
    try {
      await saveProject({ view: { ageCharts: withStamps(project?.view?.ageCharts, ages) } });
    } catch (e) { setStatus(`Saved; the chart version of ${ages.length} age${ages.length === 1 ? '' : 's'} was not recorded: ${e.message}`); }
  };

  const saveColumn = async ({ create, update, remove }) => {
    const idMap = new Map();
    const stamped = [];
    for (const u of create) {
      const row = await backend.saveUnit({ ...u, parent_id: u.parent_id ? (idMap.get(u.parent_id) || u.parent_id) : null });
      idMap.set(u.id, row.id);
      stamped.push(...changedAges('units', { id: row.id }, u));
    }
    for (const { id, patch } of update) {
      const p = { ...patch };
      if (p.parent_id && idMap.has(p.parent_id)) p.parent_id = idMap.get(p.parent_id);
      await backend.updateUnit(id, p);
      stamped.push(...changedAges('units', units.find((x) => x.id === id) || { id }, p));
    }
    for (const u of remove) await backend.deleteUnit(u);
    await stampAges(stamped);
    await refreshUnits();
    await refreshTops();
  };

  const saveTop = async (topId, patch) => {
    const before = tops.find((t) => t.id === topId) || { id: topId };
    await backend.updateTop(topId, patch);
    await stampAges(changedAges('tops', before, patch));
    await refreshTops();
    await refreshAllTops();
  };

  const ageFlags = useMemo(() => (allTops == null ? null : flagAges({
    tops: allTops, units,
    wellName: (id) => (wells || []).find((w) => w.id === id)?.name || 'a well',
    canEdit: (kind, row) => (kind === 'units' ? units.some((u) => u.id === row.id && u.is_own !== false) : !!(wells || []).find((w) => w.id === row.well_id)?.is_own),
    stamps: project?.view?.ageCharts || {},
  })), [allTops, units, wells, project]);
  const flagsById = useMemo(() => {
    const m = new Map();
    for (const f of ageFlags || []) m.set(`${f.kind}:${f.id}:${f.field}`, f);
    return m;
  }, [ageFlags]);

  const acceptChartUpdates = async () => {
    setAccepting(true);
    try {
      const plan = acceptPlan(ageFlags || [], { tops: allTops || [], units });
      let n = 0;
      for (const w of plan.writes) {
        if (w.kind === 'tops') await backend.updateTop(w.id, w.patch); else await backend.updateUnit(w.id, w.patch);
        n += Object.keys(w.patch).length;
      }
      await stampAges(plan.stamps);
      await Promise.all([refreshUnits(), refreshTops(), refreshAllTops()]);
      setStatus(`Accepted the ${TIMESCALE_LABEL} updates: ${n} age${n === 1 ? '' : 's'} moved with their boundary, ${plan.stamps.length} stamped ${TIMESCALE_LABEL}${plan.skipped.length ? `; left as entered: ${plan.skipped.join('; ')}` : ''}.`);
    } catch (e) { setStatus(e.message); } finally { setAccepting(false); }
  };

  const ordered = useMemo(() => orderedUnits(units), [units]);
  // ST4: a unit maps through the top that names it (the selected well's tops first, else none)
  const unitTopName = (unitId) => tops.find((t) => t.unit_id === unitId)?.name || null;

  const ribbon = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
      <ModuleHomeLink module="geoscience" testId="strat-home" />
      <Layers className="w-4 h-4 text-pl-primary-text" />
      <span className="text-sm font-semibold text-pl-text whitespace-nowrap">Stratigraphy Studio</span>
      <span className="hidden 2xl:inline text-[11px] text-pl-muted">the stratigraphic framework on the shared well registry</span>
      <div className="flex flex-wrap items-center gap-1 ml-4">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" data-testid={`strat-view-${v.id}`}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${view === v.id ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted hover:bg-pl-sunken'}`}
            onClick={() => setView(v.id)}>
            <v.icon className="w-3.5 h-3.5" /> {v.label}
            {v.id === 'timescale' && ageFlags?.length > 0 && <span className="ml-0.5 px-1 rounded bg-pl-warning/20 text-pl-warning-text" data-testid="strat-timescale-badge" title={`${ageFlags.length} age${ageFlags.length === 1 ? '' : 's'} entered under an older chart`}>{ageFlags.length}</span>}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-pl-muted" title="Terminology shown on every app; stored codes stay Catuneanu">
          Terms
          <select value={scheme} onChange={(e) => setScheme(e.target.value)} data-testid="strat-scheme"
            className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text">
            {SCHEMES.map((s) => <option key={s} value={s}>{SCHEME_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-pl-muted" title="Depth unit of the Tops, Intervals, Core and Ages tables and the summary PDF; the registry keeps metres">
          Depths
          <select value={unit} data-testid="strat-display-unit" className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text"
            onChange={(e) => { const u = e.target.value === 'ft' ? 'ft' : 'm'; setUnit(u); saveProject({ view: { displayUnit: u } }).catch(() => {}); }}>
            <option value="m">m</option>
            <option value="ft">ft</option>
          </select>
        </label>
        <Link to="/dashboard/apps/geoscience/stratigraphy-studio/help" data-testid="strat-help" title="Open the Stratigraphy Studio help guide"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken">
          <HelpCircle className="w-3.5 h-3.5" /> Help
        </Link>
        <button type="button" data-testid="strat-toggle-dock" title="Show or hide the legend"
          className={`px-2 py-1 text-xs rounded border ${dockOpen ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}
          onClick={() => setDockOpen((v) => !v)}>
          <PanelRight className="w-3.5 h-3.5" />
        </button>
        <ThemeToggle className="h-7 w-7" />
      </div>
    </div>
  );

  const explorer = (
    <ScrollArea className="h-full min-h-0 bg-pl-surface border-r border-pl-border">
      <div className="p-2 space-y-3 text-xs">
        <div>
          <div className="text-pl-muted font-medium mb-1">Wells</div>
          {!wells ? <Loader2 className="w-3 h-3 animate-spin text-pl-muted" /> : !wells.length ? (
            <div className="text-pl-muted">No wells yet. Import them in <Link className="text-pl-primary-text" to={appPath(WELL_DATA_MANAGER_ID, appPaths)}>Well Data Manager</Link>.</div>
          ) : wells.map((w) => (
            <button key={w.id} type="button" data-testid={`strat-well-${w.name}`}
              className={`block w-full text-left px-2 py-1 rounded ${w.id === selectedId ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-text hover:bg-pl-sunken'}`}
              onClick={() => selectWell(w.id)} title={w.is_own ? 'Your well' : 'Shared with you, read-only'}>
              {w.name}{w.is_own ? '' : <span className="ml-1 text-pl-muted">(shared)</span>}
            </button>
          ))}
        </div>
        <div>
          <div className="text-pl-muted font-medium mb-1">Column</div>
          {!ordered.length ? <div className="text-pl-muted">No units yet.</div> : ordered.map((u) => (
            <div key={u.id} className="flex items-center gap-1 text-pl-text" style={{ paddingLeft: u.depth * 10 }} data-testid={`strat-explorer-unit-${u.name}`}>
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: u.colour || '#94a3b8' }} />
              <span className="truncate">{u.name}</span>
              <span className="text-pl-muted">{u.rank}</span>
              {unitTopName(u.id) && (
                <Link to={mapTopHref(unitTopName(u.id), [], appPath(MAPPING_ID, appPaths))} className="ml-auto text-pl-primary-text hover:text-pl-primary-text-hover text-[10px]" title={`Map the structure of ${unitTopName(u.id)} in Mapping & Surface Studio`} data-testid={`strat-map-unit-${u.name}`}>map</Link>
              )}
            </div>
          ))}
        </div>
        {well && well.is_own && (
          <Link to={wellDataManagerHref(well.id, 'Tops', appPath(WELL_DATA_MANAGER_ID, appPaths))} className="text-pl-primary-text hover:text-pl-primary-text-hover" data-testid="strat-edit-well-data">
            Edit {well.name} in Well Data Manager
          </Link>
        )}
      </div>
    </ScrollArea>
  );

  const needWell = <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="strat-need-well">Pick a well on the left.</div>;
  // the view keys of each save merge into the stored ones (the section's view, the age stamps)
  const saveProject = async (patch) => { const row = await backend.saveStratProject({ ...patch, view: { ...(project?.view || {}), ...(patch.view || {}), report }, scheme }); setProject(row); };
  const center = view === 'glossary' ? <ScrollArea className="h-full min-h-0"><Glossary scheme={scheme} /></ScrollArea>
    : view === 'tops' ? <ScrollArea className="h-full min-h-0"><TopsTyping well={well} tops={tops} units={units} scheme={scheme} onSaveTop={saveTop} onStatus={setStatus} ageFlags={flagsById} unit={unit} /></ScrollArea>
    : view === 'events' ? (well ? <ScrollArea className="h-full min-h-0"><BiostratEvents well={well} tops={tops} backend={backend} onStatus={setStatus} onTopsChanged={async () => { await refreshTops(); await refreshAllTops(); }} onAgesEntered={stampAges}
        dictionary={project?.view?.eventDictionary || []} onDictionary={(rows) => saveProject({ view: { eventDictionary: rows } })} unit={unit} report={report} /></ScrollArea> : needWell)
    : view === 'timescale' ? <ScrollArea className="h-full min-h-0"><TimescalePanel flags={ageFlags} onAccept={acceptChartUpdates} busy={accepting} /></ScrollArea>
      : view === 'section' || view === 'wheeler' ? <SectionView backend={backend} mode={view} scheme={scheme} onStatus={setStatus} appPaths={appPaths} saved={project} onSaveProject={saveProject} report={report} />
      : view === 'ages' ? (well ? <ScrollArea className="h-full min-h-0"><AgesView well={well} tops={tops} intervals={intervals} backend={backend} onStatus={setStatus} onTopsChanged={async () => { await refreshTops(); await refreshAllTops(); }} onAgesEntered={stampAges} appPaths={appPaths} report={report} units={units} scheme={scheme} ageCharts={project?.view?.ageCharts || {}} unit={unit} section={null} /></ScrollArea> : needWell)
      : view === 'intervals' ? (well ? <ScrollArea className="h-full min-h-0"><div className="p-3"><ZoneSchemePanel intervals={intervals} canEdit={!!well.is_own} onReplace={replaceIntervals} onStatus={setStatus} /><IntervalsEditor well={well} intervals={intervals} canEdit={!!well.is_own} onReplace={replaceIntervals} onStatus={setStatus} testIdPrefix="strat-intervals" unit={unit} /></div></ScrollArea> : needWell)
        : view === 'core' ? (well ? <ScrollArea className="h-full min-h-0"><div className="p-3"><CoreImagesPanel well={well} images={coreImages} canEdit={!!well.is_own} onStatus={setStatus} testIdPrefix="strat-core" unit={unit} {...coreOps} /></div></ScrollArea> : needWell)
          : <div className="h-full min-h-0 overflow-auto"><ColumnEditor units={units} onSave={saveColumn} onStatus={setStatus} report={report} ageFlags={flagsById} /></div>;

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted">
      <span data-testid="strat-status" className="truncate">{status}</span>
      {loading > 0 && <Loader2 className="w-3 h-3 animate-spin text-pl-muted" />}
      <label className="ml-auto flex items-center gap-1 whitespace-nowrap" title="Printed on exported charts; saved with Save view in the Section view">Prepared by
        <input className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0 text-[11px] text-pl-text w-28" value={report.analyst} onChange={(e) => setReport((r) => ({ ...r, analyst: e.target.value }))} data-testid="strat-report-analyst" />
      </label>
      <label className="flex items-center gap-1 whitespace-nowrap">Field
        <input className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0 text-[11px] text-pl-text w-24" value={report.field} onChange={(e) => setReport((r) => ({ ...r, field: e.target.value }))} data-testid="strat-report-field" />
      </label>
      <span className="whitespace-nowrap">{(wells || []).length} well{(wells || []).length === 1 ? '' : 's'} · {units.length} unit{units.length === 1 ? '' : 's'}</span>
      <span className="whitespace-nowrap text-pl-muted" data-testid="strat-scheme-status">terms: {SCHEME_LABEL[scheme]}</span>
    </div>
  );

  return (
    <WorkspaceShell
      autoSaveId="stratigraphy.workspace.v1"
      minWidth={1000}
      dockDefaultSize={22}
      ribbon={ribbon}
      explorer={explorer}
      center={center}
      dock={<ScrollArea className="h-full min-h-0 bg-pl-surface border-l border-pl-border"><Glossary scheme={scheme} compact /></ScrollArea>}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
