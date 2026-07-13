// Well Correlation workspace controller (G3.2) on the shared
// WorkspaceShell: section explorer + map path-picker on the left, the
// cross-section viewport in the center, datum/tops/zone controls in
// the right dock, status bar below. Owns all state; every data touch
// goes through the injected backend so /dev/well-correlation runs the
// identical app on the in-memory backend (no auth/DB).
//
// Tops are the SHARED geo_wells_tops rows: pick/drag/propagate writes
// the registry so Seismolord and Mapping see edits immediately.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GitCompare, Loader2, Save } from 'lucide-react';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import { ScrollArea } from '@/components/ui/scroll-area';
import SectionExplorer from './SectionExplorer';
import SectionControls from './SectionControls';
import CrossSection from './CrossSection';
import { allTopNames } from '../engine/section';

const GR_ALIASES = ['GR', 'SGR', 'CGR', 'GRC'];

export default function CorrelationWorkstation({ backend }) {
  const [wells, setWells] = useState(null);
  const [order, setOrder] = useState([]);              // ordered well ids
  const [wellData, setWellData] = useState({});        // id -> {tops, depth, gr}
  const [loading, setLoading] = useState(false);
  const [datum, setDatum] = useState({ mode: 'structural' });
  const [shownTops, setShownTops] = useState([]);
  const [zonePair, setZonePair] = useState(null);
  const [status, setStatus] = useState('Ready.');
  const [dockOpen, setDockOpen] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await backend.listWells();
        if (!live) return;
        setWells(list);
        const section = await backend.loadSection();
        if (section && live) {
          setOrder(section.well_ids || []);
          if (section.datum) setDatum(section.datum);
          setStatus('Restored saved section.');
        }
      } catch (e) { if (live) { setStatus(e.message); setWells([]); } }
    })();
    return () => { live = false; };
  }, [backend]);

  // load tops + GR for a well the first time it enters the section
  const ensureWellData = useCallback(async (wellId) => {
    if (wellData[wellId]) return;
    setLoading(true);
    try {
      const [tops, logs] = await Promise.all([backend.listTops(wellId), backend.listLogs(wellId)]);
      const grLog = logs.find((l) => GR_ALIASES.includes(l.mnemonic.toUpperCase().split(':')[0]));
      const depthLog = logs.find((l) => ['DEPT', 'DEPTH', 'MD'].includes(l.mnemonic.toUpperCase().split(':')[0]));
      let depth = null;
      let gr = null;
      if (grLog && depthLog) {
        [depth, gr] = await Promise.all([backend.downloadCurve(depthLog), backend.downloadCurve(grLog)]);
      }
      setWellData((m) => ({ ...m, [wellId]: { tops, depth, gr } }));
    } catch (e) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }, [backend, wellData]);

  const refreshTops = useCallback(async (wellId) => {
    const tops = await backend.listTops(wellId);
    setWellData((m) => ({ ...m, [wellId]: { ...(m[wellId] || {}), tops } }));
  }, [backend]);

  const toggleWell = async (wellId) => {
    if (order.includes(wellId)) {
      setOrder((o) => o.filter((x) => x !== wellId));
    } else {
      await ensureWellData(wellId);
      setOrder((o) => [...o, wellId]);
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

  // section wells in order, with tops+curves ready
  const sectionWells = useMemo(() => order
    .map((id) => {
      const w = (wells || []).find((x) => x.id === id);
      const d = wellData[id];
      if (!w || !d) return null;
      return {
        id: w.id, name: w.name, is_own: w.is_own, organization_id: w.organization_id,
        tops: d.tops || [], depth: d.depth, gr: d.gr,
      };
    })
    .filter(Boolean), [order, wells, wellData]);

  const topNames = useMemo(() => allTopNames(sectionWells), [sectionWells]);
  // default-show every top the first time the section has any
  useEffect(() => {
    setShownTops((prev) => (prev.length ? prev.filter((n) => topNames.includes(n)) : topNames));
  }, [topNames]);

  const onTopDrag = async (top, newMd) => {
    try {
      await backend.updateTop(top.id, { mdM: newMd });
      await refreshTops(top.well_id);
      setStatus(`Moved ${top.name} on this well to ${newMd} m.`);
    } catch (e) {
      setStatus(e.message);
      await refreshTops(top.well_id); // revert the optimistic drag
    }
  };

  const propagate = async (name, md) => {
    if (!name || !Number.isFinite(md)) { setStatus('Enter a top name and MD to propagate.'); return; }
    const targets = sectionWells.filter((w) => w.is_own).map((w) => ({ wellId: w.id, mdM: md }));
    try {
      const created = await backend.propagateTop(name, targets);
      for (const w of targets) await refreshTops(w.wellId);
      setShownTops((s) => (s.includes(name) ? s : [...s, name]));
      setStatus(`Propagated ${name} to ${created.length} well${created.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const saveSection = async () => {
    try {
      await backend.saveSection({ well_ids: order, datum });
      setStatus('Section saved.');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const canEdit = sectionWells.some((w) => w.is_own);

  const ribbon = (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
      <GitCompare className="w-4 h-4 text-cyan-400" />
      <span className="text-sm font-semibold text-slate-100">Well Correlation</span>
      <span className="text-[11px] text-slate-500">cross-sections on the shared well registry</span>
      <button type="button" data-testid="corr-save"
        className="ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
        onClick={saveSection}>
        <Save className="w-3.5 h-3.5" /> Save section
      </button>
    </div>
  );

  const statusBar = (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400">
      <span data-testid="corr-status" className="truncate">{status}</span>
      <span className="ml-auto whitespace-nowrap">{order.length} well{order.length === 1 ? '' : 's'} · {topNames.length} tops</span>
      <span className="whitespace-nowrap text-slate-600">SI internal (m)</span>
    </div>
  );

  const center = !wells ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading wells…</div>
  ) : !sectionWells.length ? (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="corr-empty">
      {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading section…</> : 'Add wells to the section from the map on the left.'}
    </div>
  ) : (
    <CrossSection wells={sectionWells} datum={datum} shownTops={shownTops} zonePair={zonePair} onTopDrag={onTopDrag} />
  );

  return (
    <WorkspaceShell
      autoSaveId="wellcorrelation.workspace.v1"
      minWidth={1000}
      dockDefaultSize={22}
      ribbon={ribbon}
      explorer={(
        <SectionExplorer
          wells={wells || []}
          order={order}
          onToggle={toggleWell}
          onMove={moveWell}
          onRemove={(id) => setOrder((o) => o.filter((x) => x !== id))}
        />
      )}
      center={center}
      dock={(
        <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
          <SectionControls
            topNames={topNames}
            datum={datum}
            onDatum={setDatum}
            shownTops={shownTops}
            onToggleTop={(n) => setShownTops((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))}
            zonePair={zonePair}
            onZonePair={setZonePair}
            onPropagate={propagate}
            canEdit={canEdit}
          />
        </ScrollArea>
      )}
      dockOpen={dockOpen}
      onDockOpenChange={setDockOpen}
      statusBar={statusBar}
    />
  );
}
