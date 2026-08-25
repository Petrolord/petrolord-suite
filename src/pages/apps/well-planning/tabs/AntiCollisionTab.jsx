// Anti-collision tab (WD4): the ISCWSA separation-rule scan of the
// selected design (or the definitive actual composite) against offset
// wellbores. Offsets come from the site's other wp_wellbores
// (definitive/latest designs) and from geo_wells registry wells with
// deviations in the same CRS. Uncertainty is the validated Rev4 error
// model (through the design's survey program when one exists); results
// render as ladder + traveling-cylinder charts and save immutably to
// wp_ac_runs.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, Shield, Play, Save, Trash2, AlertTriangle, History,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { listWells } from '@/lib/wellsRegistry';
import { useWellPlanningStore } from '../state/WellPlanningStore';
import { M_TO_FT } from '../engine/surveyMath';
import {
  resolveMagReference, buildAcWell, runAntiCollisionScan, serializeAcRun,
  deserializeAcRun, DEFAULT_AC_PARAMS,
} from '../services/acUtils';
import { compositeStations } from '../services/surveyUtils';
import * as wpApi from '../services/wpApi';
import LadderChart from '../charts/LadderChart';
import TravelingCylinderChart from '../charts/TravelingCylinderChart';

const STATUS_CHIP = {
  'no-go': 'bg-red-500/20 text-red-300',
  review: 'bg-amber-500/20 text-amber-300',
  clear: 'bg-green-500/20 text-green-300',
};

const AntiCollisionTab = () => {
  const {
    user, site, wellbore, design, wellbores, selection,
  } = useWellPlanningStore();
  const { toast } = useToast();

  const mdUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';
  const metersToUser = useCallback((v) => (mdUnit === 'ft' ? v * M_TO_FT : v), [mdUnit]);
  const userToMeters = useCallback((v) => (mdUnit === 'ft' ? v / M_TO_FT : v), [mdUnit]);

  const [reference, setReference] = useState('plan'); // plan | composite
  const [surveys, setSurveys] = useState([]);
  const [designsByWellbore, setDesignsByWellbore] = useState({});
  const [geoWells, setGeoWells] = useState(null);
  const [checkedOffsets, setCheckedOffsets] = useState({});
  const [params, setParams] = useState(DEFAULT_AC_PARAMS);
  const [running, setRunning] = useState(false);
  const [scan, setScan] = useState(null);            // live results
  const [viewedRun, setViewedRun] = useState(null);  // stored run being viewed
  const [runs, setRuns] = useState([]);
  const [saving, setSaving] = useState(false);
  const [chartMode, setChartMode] = useState('sf');  // sf | distance
  const [tcFrame, setTcFrame] = useState('highside');

  // ---- data loading -------------------------------------------------------

  useEffect(() => {
    if (!wellbore?.id) { setSurveys([]); return; }
    wpApi.listSurveys(wellbore.id).then(setSurveys).catch(() => setSurveys([]));
  }, [wellbore?.id]);

  useEffect(() => {
    // Definitive/latest designs for the site's OTHER wellbores (offset
    // candidates). Sequential fetch is fine at pad scale.
    let live = true;
    (async () => {
      const map = {};
      for (const w of wellbores.filter((x) => x.id !== wellbore?.id)) {
        try {
          const designs = await wpApi.listDesigns(w.id);
          const withStations = designs.filter((d) => Array.isArray(d.stations) && d.stations.length >= 2);
          map[w.id] = withStations.find((d) => d.status === 'definitive')
            || withStations[withStations.length - 1] || null;
        } catch (e) { map[w.id] = null; }
      }
      if (live) setDesignsByWellbore(map);
    })();
    return () => { live = false; };
  }, [wellbores, wellbore?.id]);

  useEffect(() => {
    listWells().then(setGeoWells).catch(() => setGeoWells([]));
  }, []);

  useEffect(() => {
    if (!design?.id) { setRuns([]); return; }
    wpApi.listAcRuns(design.id).then(setRuns).catch(() => setRuns([]));
  }, [design?.id]);

  // ---- reference + offset assembly ---------------------------------------

  const magRef = useMemo(() => resolveMagReference(site, wellbore), [site, wellbore]);

  const gridStationsOf = (s) => (Array.isArray(s.computed) && s.computed.length >= 2 ? s.computed : s.stations);
  const composite = useMemo(() => compositeStations(
    surveys.filter((s) => s.is_in_definitive).map((s) => ({ stations: gridStationsOf(s) })),
  ), [surveys]);

  const refStations = useMemo(() => {
    if (reference === 'composite') return composite.length >= 2 ? composite : null;
    return Array.isArray(design?.stations) && design.stations.length >= 2 ? design.stations : null;
  }, [reference, design, composite]);

  const offsetCandidates = useMemo(() => {
    const out = [];
    for (const w of wellbores.filter((x) => x.id !== wellbore?.id)) {
      const d = designsByWellbore[w.id];
      if (!d || !Number.isFinite(w.head_x) || !Number.isFinite(w.head_y)) continue;
      out.push({
        id: `wp:${w.id}`,
        label: `${w.name} — ${d.name} r${d.revision}${d.status === 'definitive' ? ' (definitive)' : ''}`,
        kind: 'wp-plan',
        stations: d.stations,
        headX: w.head_x,
        headY: w.head_y,
        kbElevM: w.kb_elev_m || 0,
      });
    }
    for (const g of (geoWells || [])) {
      if (g.id === wellbore?.geo_well_id) continue;
      if (!Array.isArray(g.deviation) || g.deviation.length < 2) continue;
      if ((g.crs || null) !== (site?.crs || null)) continue;
      if (!Number.isFinite(g.surface_x) || !Number.isFinite(g.surface_y)) continue;
      out.push({
        id: `geo:${g.id}`,
        label: `${g.name} (registry)`,
        kind: 'geo',
        stations: g.deviation,
        headX: g.surface_x,
        headY: g.surface_y,
        kbElevM: g.kb_m || 0,
      });
    }
    return out;
  }, [wellbores, designsByWellbore, geoWells, wellbore, site?.crs]);

  const selectedOffsets = offsetCandidates.filter((c) => checkedOffsets[c.id]);

  // ---- run ----------------------------------------------------------------

  const handleRun = () => {
    if (!refStations || !magRef || selectedOffsets.length === 0) return;
    setRunning(true);
    setViewedRun(null);
    // setTimeout lets the spinner paint before the synchronous scan.
    setTimeout(() => {
      try {
        const refWell = buildAcWell({
          stations: refStations,
          headX: wellbore.head_x ?? 0,
          headY: wellbore.head_y ?? 0,
          kbElevM: wellbore.kb_elev_m || 0,
          magRef,
          radius: params.refRadius,
        });
        const offsets = selectedOffsets.map((c) => ({
          id: c.id,
          label: c.label,
          kind: c.kind,
          well: buildAcWell({
            stations: c.stations,
            headX: c.headX,
            headY: c.headY,
            kbElevM: c.kbElevM,
            magRef,
            radius: params.offRadius,
          }),
        }));
        setScan(runAntiCollisionScan(refWell, offsets, params));
      } catch (e) {
        toast({ variant: 'destructive', title: 'Anti-collision scan failed', description: e.message });
        setScan(null);
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  const handleSaveRun = async () => {
    if (!scan || !design?.id) return;
    setSaving(true);
    try {
      const row = serializeAcRun({ designId: design.id, reference, results: scan, params });
      await wpApi.saveAcRun(row, user.id);
      setRuns(await wpApi.listAcRuns(design.id));
      toast({ title: 'Anti-collision run saved', className: 'bg-green-600 text-white' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRun = async (id) => {
    try {
      await wpApi.deleteAcRun(id);
      setRuns(await wpApi.listAcRuns(design.id));
      if (viewedRun?.id === id) setViewedRun(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    }
  };

  const displayed = viewedRun ? deserializeAcRun(viewedRun) : scan;
  const displayedParams = viewedRun ? { ...DEFAULT_AC_PARAMS, ...viewedRun.params } : params;

  // ---- guards -------------------------------------------------------------

  if (!wellbore || !design) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
        Select a design in the tree to run anti-collision.
      </div>
    );
  }

  const setP = (field, value) => setParams((p) => ({ ...p, [field]: value }));
  const numP = (field, user = false) => (e) => {
    const v = parseFloat(e.target.value);
    setP(field, Number.isFinite(v) ? (user ? userToMeters(v) : v) : DEFAULT_AC_PARAMS[field]);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-140px)]">
      {/* left rail: setup */}
      <div className="w-full lg:w-[340px] shrink-0 flex flex-col bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-3 border-b border-slate-800 flex items-center gap-2">
          <Shield className="h-4 w-4 text-lime-400" />
          <h2 className="text-sm font-bold text-white">Anti-collision setup</h2>
        </div>
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-4">
            {!magRef && (
              <div className="flex gap-2 rounded-md border border-red-900/50 bg-red-900/15 px-3 py-2 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                No geomagnetic reference: the wellbore has no cached magnetic model and the site CRS
                cannot resolve the wellhead to lat/lon. Re-save the wellbore with a transformable site CRS.
              </div>
            )}
            {magRef && (
              <p className="text-[10px] text-slate-500">
                Error model: ISCWSA MWD Rev4 · field {(magRef.bTotalNT / 1000).toFixed(2)} uT,
                dip {magRef.dipDeg.toFixed(1)}°, declination {magRef.declinationDeg.toFixed(2)}°
                ({magRef.source === 'cache' ? 'cached on wellbore' : 'live WMM2025'})
              </p>
            )}

            <div>
              <Label className="text-xs text-slate-400">Reference trajectory</Label>
              <Select value={reference} onValueChange={setReference}>
                <SelectTrigger className="h-8 mt-1 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 text-white">
                  <SelectItem value="plan" className="text-xs">
                    Plan — {design.name} r{design.revision}
                  </SelectItem>
                  <SelectItem value="composite" className="text-xs" disabled={composite.length < 2}>
                    Actual — definitive composite{composite.length < 2 ? ' (none)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
              {reference === 'plan' && !refStations && (
                <p className="mt-1 text-[10px] text-amber-400">
                  This design has no saved station cache. Save it in the Design tab first.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs text-slate-400">Offset wells ({selectedOffsets.length} selected)</Label>
              <div className="mt-1 space-y-1">
                {offsetCandidates.length === 0 && (
                  <p className="text-[10px] text-slate-500">
                    No candidates: other wellbores on this site need a saved design, and registry wells
                    need a deviation in the site CRS ({site?.crs || 'unset'}).
                  </p>
                )}
                {offsetCandidates.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 cursor-pointer hover:bg-slate-800">
                    <Checkbox
                      checked={!!checkedOffsets[c.id]}
                      onCheckedChange={(v) => setCheckedOffsets((prev) => ({ ...prev, [c.id]: !!v }))}
                    />
                    <span className="truncate">{c.label}</span>
                    <span className="ml-auto text-[9px] uppercase text-slate-500">{c.kind === 'geo' ? 'registry' : 'plan'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <Label className="text-[10px] uppercase font-bold text-slate-400">Separation rule (SPE-187073)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-[10px]">k</Label><Input type="number" step="0.1" defaultValue={params.k} onBlur={numP('k')} className="h-7 bg-slate-900 text-xs" /></div>
                <div><Label className="text-[10px]">σpa (m)</Label><Input type="number" step="0.1" defaultValue={params.sigmaPa} onBlur={numP('sigmaPa')} className="h-7 bg-slate-900 text-xs" /></div>
                <div><Label className="text-[10px]">Sm (m)</Label><Input type="number" step="0.1" defaultValue={params.Sm} onBlur={numP('Sm')} className="h-7 bg-slate-900 text-xs" /></div>
                <div><Label className="text-[10px]">Ref radius ({mdUnit})</Label><Input type="number" step="0.01" defaultValue={+metersToUser(params.refRadius).toFixed(3)} onBlur={numP('refRadius', true)} className="h-7 bg-slate-900 text-xs" /></div>
                <div><Label className="text-[10px]">Off radius ({mdUnit})</Label><Input type="number" step="0.01" defaultValue={+metersToUser(params.offRadius).toFixed(3)} onBlur={numP('offRadius', true)} className="h-7 bg-slate-900 text-xs" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">No-go SF below</Label><Input type="number" step="0.1" defaultValue={params.noGo} onBlur={numP('noGo')} className="h-7 bg-slate-900 text-xs" /></div>
                <div><Label className="text-[10px]">Review SF below</Label><Input type="number" step="0.1" defaultValue={params.review} onBlur={numP('review')} className="h-7 bg-slate-900 text-xs" /></div>
              </div>
            </div>

            <Button
              onClick={handleRun}
              disabled={running || !refStations || !magRef || selectedOffsets.length === 0}
              className="w-full h-8 bg-lime-600 hover:bg-lime-700 text-white text-xs"
              data-testid="run-anticollision"
            >
              {running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
              Run separation scan
            </Button>

            {/* run history */}
            <div>
              <Label className="text-xs text-slate-400 flex items-center gap-1"><History className="h-3.5 w-3.5" /> Run history</Label>
              <div className="mt-1 space-y-1">
                {runs.length === 0 && <p className="text-[10px] text-slate-500">No saved runs for this design.</p>}
                {runs.map((r) => (
                  <div key={r.id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-[10px] cursor-pointer ${viewedRun?.id === r.id ? 'bg-slate-700' : 'bg-slate-800/60 hover:bg-slate-800'}`}
                    onClick={() => { setViewedRun(viewedRun?.id === r.id ? null : r); }}
                  >
                    <span className={`rounded-full px-1.5 py-0.5 uppercase ${STATUS_CHIP[r.summary?.status] || ''}`}>{r.summary?.status}</span>
                    <span className="text-slate-300">min SF {r.summary?.overallMinSf ?? '--'}</span>
                    <span className="text-slate-500">{new Date(r.created_at).toLocaleString()}</span>
                    <Button variant="ghost" size="icon" className="ml-auto h-5 w-5 text-slate-600 hover:text-red-400"
                      onClick={(e) => { e.stopPropagation(); handleDeleteRun(r.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* right: results */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {!displayed && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 text-center">
            <Shield className="h-10 w-10 text-slate-700" />
            <p className="max-w-md text-sm text-slate-500">
              Pick offset wells and run the separation scan. Results show the SPE-187073
              separation factor per station with ladder and traveling-cylinder views.
            </p>
          </div>
        )}

        {displayed && (
          <>
            {viewedRun && (
              <div className="rounded-md border border-sky-900/50 bg-sky-900/15 px-3 py-1.5 text-xs text-sky-300">
                Viewing saved run from {new Date(viewedRun.created_at).toLocaleString()} (reference: {viewedRun.reference}). Click it again in the history to return to live results.
              </div>
            )}

            {/* summary cards */}
            <div className="flex flex-wrap gap-2">
              {displayed.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-bold ${STATUS_CHIP[r.classification.status]}`}>
                    {r.classification.status}
                  </span>
                  <div className="text-xs">
                    <div className="text-slate-200">{r.label}</div>
                    <div className="text-slate-500">
                      min SF {Number.isFinite(r.clearance.summary.minSf) ? r.clearance.summary.minSf.toFixed(2) : '--'}
                      {' '}at MD {metersToUser(r.clearance.summary.minSfMd ?? 0).toFixed(0)} {mdUnit}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* charts */}
            <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-px bg-slate-800 rounded-lg overflow-hidden border border-slate-800">
              <div className="relative flex flex-col bg-white min-h-[280px]">
                <div className="absolute right-2 top-1 z-10 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setChartMode('sf')} className={`h-6 px-2 text-[10px] ${chartMode === 'sf' ? 'bg-slate-200' : ''}`}>SF</Button>
                  <Button size="sm" variant="ghost" onClick={() => setChartMode('distance')} className={`h-6 px-2 text-[10px] ${chartMode === 'distance' ? 'bg-slate-200' : ''}`}>Distance</Button>
                </div>
                <LadderChart
                  results={displayed}
                  mode={chartMode}
                  unit={mdUnit}
                  thresholds={{ noGo: displayedParams.noGo, review: displayedParams.review }}
                  metersToUser={metersToUser}
                />
              </div>
              <div className="relative flex flex-col bg-white min-h-[280px]">
                <div className="absolute right-2 top-1 z-10 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setTcFrame('highside')} className={`h-6 px-2 text-[10px] ${tcFrame === 'highside' ? 'bg-slate-200' : ''}`}>Highside</Button>
                  <Button size="sm" variant="ghost" onClick={() => setTcFrame('north')} className={`h-6 px-2 text-[10px] ${tcFrame === 'north' ? 'bg-slate-200' : ''}`}>North</Button>
                </div>
                <TravelingCylinderChart
                  results={displayed}
                  referenceFrame={tcFrame}
                  unit={mdUnit}
                  metersToUser={metersToUser}
                />
              </div>
            </div>

            {/* violations table + save */}
            <div className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300">
                  Stations below review threshold ({displayedParams.review})
                </span>
                {!viewedRun && (
                  <Button size="sm" onClick={handleSaveRun} disabled={saving || !scan}
                    className="h-7 bg-[#4CAF50] hover:bg-[#43a047] text-white text-xs">
                    {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                    Save run
                  </Button>
                )}
              </div>
              <div className="max-h-44 overflow-auto">
                <Table>
                  <TableHeader className="bg-slate-800 sticky top-0">
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-300 text-xs">Offset</TableHead>
                      <TableHead className="text-slate-300 text-xs">Ref MD ({mdUnit})</TableHead>
                      <TableHead className="text-slate-300 text-xs">SF</TableHead>
                      <TableHead className="text-slate-300 text-xs">C-C dist ({mdUnit})</TableHead>
                      <TableHead className="text-slate-300 text-xs">Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayed.flatMap((r) => r.clearance.md
                      .map((md, i) => ({ md, sf: r.clearance.sf[i], dist: r.clearance.distanceCC[i] }))
                      .filter((row) => row.sf < displayedParams.review)
                      .map((row, i) => (
                        <TableRow key={`${r.id}-${i}`} className="border-slate-800">
                          <TableCell className="text-xs text-slate-300">{r.label}</TableCell>
                          <TableCell className="font-mono text-xs text-lime-400">{metersToUser(row.md).toFixed(0)}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-300">{row.sf.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">{metersToUser(row.dist).toFixed(1)}</TableCell>
                          <TableCell>
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase ${row.sf < displayedParams.noGo ? STATUS_CHIP['no-go'] : STATUS_CHIP.review}`}>
                              {row.sf < displayedParams.noGo ? 'no-go' : 'review'}
                            </span>
                          </TableCell>
                        </TableRow>
                      )))}
                    {displayed.every((r) => r.clearance.sf.every((v) => v >= displayedParams.review)) && (
                      <TableRow className="border-slate-800">
                        <TableCell colSpan={5} className="text-center text-xs text-slate-500">
                          No stations below the review threshold.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AntiCollisionTab;
