// Export a Petrolord Project Package (.pld) (Project Portability PP1 door,
// PP3a families, docs/scope/ProjectPortability-PLAN.md). Pick wells,
// surfaces and culture sets from the registry, production fields, economics
// cases, simulation cases and saved projects, name the package, and save it.
// Assembly lives in src/lib/portability; this dialog only chooses roots,
// reports progress and shows what went in and what was left out.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Package, Search } from 'lucide-react';
import { listWells } from '@/lib/wellsRegistry';
import { listSurfaces } from '@/lib/surfacesRegistry';
import { listCulture } from '@/lib/cultureRegistry';
import { makeSupabaseSource } from '@/lib/portability/supabaseSource';
import { buildGeosciencePackage, PackageIntegrityError } from '@/lib/portability/exportPackage';
import { savePackage, packageFilename } from '@/lib/portability/zipWriter';
import { listRootCandidates } from '@/lib/portability/rootsCatalog';

// PP3a/PP3b sections: key -> the root kinds listed under it
const EXTRA_SECTIONS = [
  // PP3b
  { key: 'wp_site', title: 'Well planning sites', kinds: ['wp_site'], testPrefix: 'pld-wpsite', emptyText: 'No well planning sites.' },
  { key: 'fields', title: 'Production fields', kinds: ['po_field'], testPrefix: 'pld-field', emptyText: 'No production fields.' },
  { key: 'cases', title: 'Economics cases', kinds: ['epe_case', 'epe_assumption_set'], testPrefix: 'pld-case', emptyText: 'No economics cases or assumption sets.' },
  { key: 'sim', title: 'Simulation cases', kinds: ['sim_case'], testPrefix: 'pld-sim', emptyText: 'No simulation cases.' },
  { key: 'saved', title: 'Saved projects', kinds: ['saved_project'], testPrefix: 'pld-saved', emptyText: 'No saved projects.' },
];
const itemKey = (it) => (it.table ? `${it.table}-${it.id}` : it.id);

const norm = (s) => String(s || '').toLowerCase();

function PickList({ title, items, selected, onToggle, testPrefix, search, emptyText, sectionKey, keyOf = (it) => it.id, collapsible = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const shown = items.filter((it) => !search || norm(it.name).includes(norm(search)) || norm(it.uwi).includes(norm(search)) || norm(it.subtitle).includes(norm(search)));
  return (
    <div className="rounded border border-slate-700 bg-slate-950/40">
      <div
        className={`px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800 flex items-center ${collapsible ? 'cursor-pointer select-none' : ''}`}
        data-testid={sectionKey ? `pld-section-${sectionKey}` : undefined}
        onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
      >
        <span>{title} <span className="text-slate-600">({selected.size} of {items.length})</span></span>
        {collapsible ? <span className="ml-auto text-slate-600">{collapsed ? 'show' : 'hide'}</span> : null}
      </div>
      {!collapsed && (
        <div className="max-h-36 overflow-y-auto">
          {shown.length === 0 && (
            <div className="px-2 py-2 text-xs text-slate-500">{emptyText}</div>
          )}
          {shown.map((it) => (
            <label key={keyOf(it)} className="flex items-center gap-2 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer">
              <input
                type="checkbox"
                data-testid={`${testPrefix}-${keyOf(it)}`}
                checked={selected.has(keyOf(it))}
                onChange={() => onToggle(keyOf(it))}
                className="accent-cyan-500"
              />
              <span className="truncate">{it.name || it.uwi || it.id}</span>
              {it.subtitle ? <span className="ml-auto text-[10px] text-slate-500 truncate max-w-[40%]">{it.subtitle}</span> : null}
              {!it.subtitle && it.organization_id ? <span className="ml-auto text-[10px] text-slate-500">shared</span> : null}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PackageExportDialog({ open, onOpenChange, preselect, onStatus }) {
  const [wells, setWells] = useState([]);
  const [surfaces, setSurfaces] = useState([]);
  const [culture, setCulture] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selWells, setSelWells] = useState(new Set());
  const [selSurfaces, setSelSurfaces] = useState(new Set());
  const [selCulture, setSelCulture] = useState(new Set());
  // PP3a: section key -> candidate items (each { kind, id, name, table?, subtitle? })
  const [extraItems, setExtraItems] = useState({});
  // section key -> Set of item keys (id, or table-id for saved projects)
  const [selExtra, setSelExtra] = useState({});
  const [name, setName] = useState('');
  const [includeInterpretations, setIncludeInterpretations] = useState(true);
  const [includeSidecars, setIncludeSidecars] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [percent, setPercent] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSummary(null);
    setError(null);
    setProgress('');
    setPercent(null);
    setLoading(true);
    (async () => {
      try {
        const [w, s, c, ...extra] = await Promise.all([
          listWells().catch(() => []),
          listSurfaces().catch(() => []),
          listCulture().catch(() => []),
          ...EXTRA_SECTIONS.map((sec) => Promise.all(sec.kinds.map((k) => listRootCandidates(k).then((items) => (items || []).map((it) => ({ ...it, kind: k }))).catch(() => [])))
            .then((lists) => lists.flat())),
        ]);
        if (cancelled) return;
        setWells(w || []);
        setSurfaces(s || []);
        setCulture(c || []);
        const items = Object.fromEntries(EXTRA_SECTIONS.map((sec, i) => [sec.key, extra[i] || []]));
        setExtraItems(items);
        const pw = new Set(preselect?.wells || []);
        setSelWells(pw);
        setSelSurfaces(new Set(preselect?.surfaces || []));
        setSelCulture(new Set(preselect?.culture || []));
        // preselected roots for the PP3a sections
        const pre = {};
        let firstExtraName = null;
        for (const r of preselect?.roots || []) {
          const sec = EXTRA_SECTIONS.find((x) => x.kinds.includes(r.kind));
          if (!sec) continue;
          pre[sec.key] = pre[sec.key] || new Set();
          pre[sec.key].add(itemKey(r));
          if (!firstExtraName) firstExtraName = r.name || items[sec.key].find((it) => itemKey(it) === itemKey(r))?.name || null;
        }
        setSelExtra(pre);
        const first = (w || []).find((x) => pw.has(x.id));
        setName(preselect?.name || first?.name || firstExtraName || '');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, preselect]);

  const toggle = (setter) => (id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleExtra = (key) => (itemK) => setSelExtra((prev) => {
    const next = new Set(prev[key] || []);
    if (next.has(itemK)) next.delete(itemK); else next.add(itemK);
    return { ...prev, [key]: next };
  });

  const extraSelectedCount = Object.values(selExtra).reduce((n, set) => n + set.size, 0);
  const totalSelected = selWells.size + selSurfaces.size + selCulture.size + extraSelectedCount;

  const roots = useMemo(() => {
    const nameOf = (list, id) => list.find((x) => x.id === id)?.name || null;
    const extraRoots = [];
    for (const sec of EXTRA_SECTIONS) {
      const sel = selExtra[sec.key];
      if (!sel || !sel.size) continue;
      for (const it of extraItems[sec.key] || []) {
        if (!sel.has(itemKey(it))) continue;
        extraRoots.push({ kind: it.kind, id: it.id, name: it.name || null, ...(it.table ? { table: it.table } : {}) });
      }
    }
    return [
      ...Array.from(selWells).map((id) => ({ kind: 'well', id, name: nameOf(wells, id) })),
      ...Array.from(selSurfaces).map((id) => ({ kind: 'surface', id, name: nameOf(surfaces, id) })),
      ...Array.from(selCulture).map((id) => ({ kind: 'culture', id, name: nameOf(culture, id) })),
      ...extraRoots,
    ];
  }, [selWells, selSurfaces, selCulture, wells, surfaces, culture, selExtra, extraItems]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setSummary(null);
    setPercent(null);
    try {
      const source = makeSupabaseSource();
      const pkgName = name.trim() || roots[0]?.name || 'Petrolord package';
      const { writer, manifest } = await buildGeosciencePackage(source, roots, {
        name: pkgName, includeInterpretations, includeSidecars, onProgress: setProgress,
      });
      setProgress('Saving');
      const res = await savePackage(writer, packageFilename(pkgName), setPercent);
      if (res.method === 'cancelled') {
        setProgress('Save cancelled.');
        onStatus?.('Package save cancelled.');
        return;
      }
      setSummary({ manifest, method: res.method });
      setProgress('Done.');
      onStatus?.(`Exported package "${pkgName}".`);
    } catch (e) {
      const msg = e instanceof PackageIntegrityError ? e.message : (e?.message || String(e));
      setError(msg);
      setProgress('');
      onStatus?.(msg);
    } finally {
      setRunning(false);
    }
  };

  const tableRows = summary ? Object.entries(summary.manifest.tables || {}) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-200" data-testid="pld-export-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="w-4 h-4 text-cyan-400" /> Export project package</DialogTitle>
          <DialogDescription className="text-slate-400">
            A portable .pld file with the selected items, their data, and open-format sidecars where a format exists. Import it into any Petrolord account for an independent copy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="block text-xs text-slate-400">
            Package name
            <input
              data-testid="pld-name"
              className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-slate-200"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: KETA field handover"
            />
          </label>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-1.5 top-2 text-slate-500" />
            <input
              data-testid="pld-search"
              className="w-full rounded bg-slate-950 border border-slate-700 pl-6 pr-2 py-1 text-xs text-slate-200"
              placeholder="Filter by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the registry</div>
          ) : (
            <div className="space-y-1.5">
              <PickList title="Wells" items={wells} selected={selWells} onToggle={toggle(setSelWells)} testPrefix="pld-well" search={search} emptyText="No wells in your registry." />
              <PickList title="Surfaces" items={surfaces} selected={selSurfaces} onToggle={toggle(setSelSurfaces)} testPrefix="pld-surface" search={search} emptyText="No surfaces in your registry." />
              <PickList title="Culture" items={culture} selected={selCulture} onToggle={toggle(setSelCulture)} testPrefix="pld-culture" search={search} emptyText="No culture sets in your registry." />
              {EXTRA_SECTIONS.map((sec) => (
                <PickList
                  key={sec.key}
                  sectionKey={sec.key}
                  collapsible
                  title={sec.title}
                  items={extraItems[sec.key] || []}
                  selected={selExtra[sec.key] || new Set()}
                  onToggle={toggleExtra(sec.key)}
                  keyOf={itemKey}
                  testPrefix={sec.testPrefix}
                  search={search}
                  emptyText={sec.emptyText}
                />
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" data-testid="pld-include-interp" checked={includeInterpretations} onChange={(e) => setIncludeInterpretations(e.target.checked)} className="accent-cyan-500" />
            Include my interpretations that refer only to the selected wells
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" data-testid="pld-include-sidecars" checked={includeSidecars} onChange={(e) => setIncludeSidecars(e.target.checked)} className="accent-cyan-500" />
            Include open-format sidecars (LAS, ZMAP, CSV)
          </label>

          {(running || progress) && (
            <div className="text-xs text-slate-400 flex items-center gap-2" data-testid="pld-progress">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : null}
              <span>{progress}{percent != null && running ? ` ${Math.round(percent)}%` : ''}</span>
            </div>
          )}

          {error && (
            <div className="rounded border border-red-700/60 bg-red-950/40 px-2 py-1.5 text-xs text-red-300" data-testid="pld-error">
              {error}
            </div>
          )}

          {summary && (
            <div className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs space-y-1" data-testid="pld-summary">
              <div className="text-slate-300">
                Saved {summary.method === 'fsa' ? 'to the file you chose' : 'to your downloads'}: {tableRows.reduce((n, [, t]) => n + (t.rows || 0), 0)} rows across {tableRows.length} tables, {(summary.manifest.blobs || []).length} binary files.
              </div>
              <ul className="text-slate-400 grid grid-cols-2 gap-x-3">
                {tableRows.map(([t, info]) => (
                  <li key={t}><span className="text-slate-500">{t}</span> {info.rows}</li>
                ))}
              </ul>
              {(summary.manifest.notes || []).length > 0 && (
                <div>
                  <div className="text-amber-300/90 mt-1">Notes</div>
                  <ul className="list-disc pl-4 text-slate-300">
                    {summary.manifest.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            data-testid="pld-export-run"
            disabled={running || loading || totalSelected === 0}
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
            onClick={run}
          >
            {running ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Package className="w-3.5 h-3.5 mr-1" />}
            Export package
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
