// Actual surveys workspace (WD3): survey runs per wellbore (manual,
// CSV or wells-registry import), the definitive composite, the survey
// listing, plan-vs-actual comparison (overlaid charts + delta table)
// and the project-ahead solve from the last actual station to a
// target. All persistence in metres/grid (wp_surveys); display in the
// wellbore's depth unit.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import {
  Plus, Trash2, Pencil, Ruler, GitCompareArrows, Crosshair, ListOrdered,
} from 'lucide-react';
import { useWellPlanningStore } from '../state/WellPlanningStore';
import * as wpApi from '../services/wpApi';
import {
  compositeStations, computeActualTable, planVsActual, projectAhead,
} from '../services/surveyUtils';
import { M_TO_FT, defaultVsAzimuth, computeWellPath } from '../engine/surveyMath';
import SurveyDialog from '../components/SurveyDialog';
import PlanViewChart from '../charts/PlanViewChart';
import { SectionViewPanel, InclinationPanel } from '../charts/TrajectoryCharts';

const SOURCE_BADGE = {
  manual: 'bg-slate-700 text-slate-300',
  csv: 'bg-sky-900/60 text-sky-300',
  geo_wells: 'bg-emerald-900/60 text-emerald-300',
};

const SurveysTab = () => {
  const { user, wellbore, designs, targets: siteTargets } = useWellPlanningStore();
  const { toast } = useToast();

  const [surveys, setSurveys] = useState([]);
  const [dialog, setDialog] = useState(null); // {survey|null}
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('listing'); // listing | compare | project
  const [targetId, setTargetId] = useState('');
  const [maxDls, setMaxDls] = useState(3);

  const mdUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';
  const mu = useCallback((v) => (mdUnit === 'ft' ? v * M_TO_FT : v), [mdUnit]);
  const kbM = wellbore?.kb_elev_m || 0;
  const headX = wellbore?.head_x ?? 0;
  const headY = wellbore?.head_y ?? 0;

  const refreshSurveys = useCallback(async (wellboreId) => {
    if (!wellboreId) { setSurveys([]); return; }
    try {
      setSurveys(await wpApi.listSurveys(wellboreId));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed to load surveys', description: e.message });
    }
  }, [toast]);

  useEffect(() => { refreshSurveys(wellbore?.id); setSelectedId(null); }, [wellbore?.id, refreshSurveys]);

  // Grid stations per survey: the cached grid conversion, or the raw
  // stations for pre-cache rows (raw is grid when no reference stored).
  const gridStationsOf = (s) => (Array.isArray(s.computed) && s.computed.length >= 2 ? s.computed : s.stations);

  const selected = surveys.find((s) => s.id === selectedId) || null;

  const composite = useMemo(() => compositeStations(
    surveys.filter((s) => s.is_in_definitive).map((s) => ({ stations: gridStationsOf(s) })),
  ), [surveys]);

  // The plan to compare against: the definitive design, else the
  // latest design with saved stations.
  const planDesign = useMemo(() => {
    const withStations = (designs || []).filter((d) => Array.isArray(d.stations) && d.stations.length >= 2);
    return withStations.find((d) => d.status === 'definitive')
      || withStations[withStations.length - 1] || null;
  }, [designs]);
  const planStations = planDesign?.stations || null;

  // Actual stations shown: the selected run, else the composite.
  const actualStations = useMemo(() => {
    if (selected) return gridStationsOf(selected);
    return composite.length >= 2 ? composite : null;
  }, [selected, composite]);
  const actualName = selected ? selected.name : 'Definitive composite';

  // Tables in metres (grid frame), VS on the plan's default azimuth so
  // both series share the section frame.
  const planTableM = useMemo(() => (planStations
    ? computeActualTable(planStations, { kbM }) : null), [planStations, kbM]);
  const vsAzimuthDeg = useMemo(() => {
    if (!planStations) return null;
    return defaultVsAzimuth(computeWellPath(planStations, { surfaceX: 0, surfaceY: 0, kb: kbM }));
  }, [planStations, kbM]);
  const actualTableM = useMemo(() => (actualStations && actualStations.length >= 2
    ? computeActualTable(actualStations, { kbM, vsAzimuthDeg }) : null),
  [actualStations, kbM, vsAzimuthDeg]);

  const toUserRows = useCallback((rows) => rows && rows.map((r) => ({
    ...r,
    md: mu(r.md), tvd: mu(r.tvd), tvdss: mu(r.tvdss),
    n: mu(r.n), e: mu(r.e), vs: mu(r.vs), closureDist: mu(r.closureDist),
  })), [mu]);
  const planRows = useMemo(() => toUserRows(planTableM), [planTableM, toUserRows]);
  const actualRows = useMemo(() => toUserRows(actualTableM), [actualTableM, toUserRows]);

  const deltas = useMemo(() => {
    if (!planStations || !actualStations || actualStations.length < 2) return [];
    return planVsActual(planStations, actualStations);
  }, [planStations, actualStations]);

  // Project-ahead: from the last actual station to the chosen target,
  // in user units (the solver's rates follow the depth-unit rule).
  const target = (siteTargets || []).find((t) => t.id === targetId);
  const projection = useMemo(() => {
    if (!actualTableM || !target) return null;
    const last = actualTableM[actualTableM.length - 1];
    return projectAhead({
      from: {
        md: mu(last.md), inc: last.inc, azi: last.azi,
        n: mu(last.n), e: mu(last.e), tvd: mu(last.tvd),
      },
      target: {
        n: mu((target.center_y || 0) - headY),
        e: mu((target.center_x || 0) - headX),
        tvd: mu((target.tvdss_m || 0) + kbM),
      },
      mdUnit,
      maxDls: parseFloat(maxDls) || null,
    });
  }, [actualTableM, target, mu, headX, headY, kbM, mdUnit, maxDls]);

  // ---- actions ----
  const handleSave = async (payload) => {
    if (dialog?.survey?.id) {
      await wpApi.updateSurvey(dialog.survey.id, payload);
    } else {
      await wpApi.saveSurvey({ ...payload, wellbore_id: wellbore.id }, user.id);
    }
    await refreshSurveys(wellbore.id);
    toast({ title: 'Survey saved', className: 'bg-green-600 text-white' });
  };

  const toggleDefinitive = async (s) => {
    try {
      await wpApi.updateSurvey(s.id, { is_in_definitive: !s.is_in_definitive });
      await refreshSurveys(wellbore.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Update failed', description: e.message });
    }
  };

  const handleDelete = async (s) => {
    try {
      await wpApi.deleteSurvey(s.id);
      if (selectedId === s.id) setSelectedId(null);
      await refreshSurveys(wellbore.id);
      toast({ title: 'Survey deleted' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    }
  };

  if (!wellbore) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
        Select a wellbore in the tree to manage its actual surveys.
      </div>
    );
  }

  const dlsKey = mdUnit === 'ft' ? 'dls100ft' : 'dls30m';

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-4">
      {/* LEFT: survey runs */}
      <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-full lg:w-[360px] flex flex-col bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center">
            <Ruler className="w-4 h-4 mr-2 text-lime-400" /> Survey runs
          </h2>
          <Button size="sm" onClick={() => setDialog({ survey: null })} className="h-7 bg-[#4CAF50] hover:bg-[#43a047] text-white text-xs" data-testid="new-survey">
            <Plus className="w-3 h-3 mr-1" /> New
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {surveys.length === 0 && (
              <p className="p-3 text-xs text-slate-500">
                No actual surveys yet. Import MWD stations manually, from a CSV file, or from a wells-registry deviation.
              </p>
            )}
            {surveys.map((s) => (
              <div key={s.id}
                className={`rounded border p-2 text-xs cursor-pointer ${selectedId === s.id ? 'border-lime-600 bg-slate-800' : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800'}`}
                onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">{s.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${SOURCE_BADGE[s.source] || SOURCE_BADGE.manual}`}>{s.source}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-500 hover:text-slate-200" onClick={(e) => { e.stopPropagation(); setDialog({ survey: s }); }}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); handleDelete(s); }}><Trash2 className="h-3 w-3" /></Button>
                  </span>
                </div>
                <div className="mt-1 text-slate-500">
                  MD {mu(s.md_from_m ?? 0).toFixed(0)} to {mu(s.md_to_m ?? 0).toFixed(0)} {mdUnit}
                  {' '}({(s.stations || []).length} stations)
                  {s.instrument_toolcode ? ` | ${s.instrument_toolcode}` : ''}
                </div>
                <label className="mt-1 flex items-center gap-2 text-slate-400" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={s.is_in_definitive} onCheckedChange={() => toggleDefinitive(s)} className="h-3.5 w-3.5 border-slate-600" />
                  In definitive composite
                </label>
              </div>
            ))}
            {composite.length >= 2 && (
              <div className="rounded border border-slate-700 bg-slate-800/60 p-2 text-[11px] text-slate-400">
                Definitive composite: {composite.length} stations, MD {mu(composite[0].md).toFixed(0)} to {mu(composite[composite.length - 1].md).toFixed(0)} {mdUnit}. The deeper run wins from its tie-on down.
              </div>
            )}
          </div>
        </ScrollArea>
      </motion.div>

      {/* RIGHT: listing / compare / project ahead */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between p-2 border-b border-slate-800">
          <div className="flex bg-slate-800 rounded p-1">
            <Button variant="ghost" size="sm" onClick={() => setView('listing')} className={`h-7 px-3 text-xs ${view === 'listing' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><ListOrdered className="w-3 h-3 mr-1" /> Listing</Button>
            <Button variant="ghost" size="sm" onClick={() => setView('compare')} className={`h-7 px-3 text-xs ${view === 'compare' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><GitCompareArrows className="w-3 h-3 mr-1" /> Plan vs actual</Button>
            <Button variant="ghost" size="sm" onClick={() => setView('project')} className={`h-7 px-3 text-xs ${view === 'project' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}><Crosshair className="w-3 h-3 mr-1" /> Project ahead</Button>
          </div>
          <span className="text-[10px] text-slate-500 pr-2">
            Showing {actualStations ? actualName : 'no survey'}
            {planDesign ? ` | plan: ${planDesign.name} r${planDesign.revision}${planDesign.status === 'definitive' ? ' (definitive)' : ''}` : ' | no saved plan'}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {!actualRows && (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
              Add a survey run, or flag runs into the definitive composite, to see the listing here.
            </div>
          )}

          {view === 'listing' && actualRows && (
            <Table>
              <TableHeader className="bg-slate-800 sticky top-0">
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-300">MD ({mdUnit})</TableHead>
                  <TableHead className="text-slate-300">Inc (deg)</TableHead>
                  <TableHead className="text-slate-300">Azi grid (deg)</TableHead>
                  <TableHead className="text-slate-300">TVD ({mdUnit})</TableHead>
                  <TableHead className="text-slate-300">North ({mdUnit})</TableHead>
                  <TableHead className="text-slate-300">East ({mdUnit})</TableHead>
                  <TableHead className="text-slate-300">VS ({mdUnit})</TableHead>
                  <TableHead className="text-slate-300">DLS (/{mdUnit === 'ft' ? '100ft' : '30m'})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actualRows.map((r, i) => (
                  <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell className="font-mono text-lime-400">{r.md.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-slate-300">{r.inc.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-slate-300">{r.azi.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-slate-300">{r.tvd.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-slate-400">{r.n.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-slate-400">{r.e.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-slate-400">{r.vs.toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-slate-400">{r[dlsKey].toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {view === 'compare' && actualRows && (
            !planRows ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
                No saved plan stations to compare against. Save a design on the Design tab (or set one definitive) first.
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-800 h-[46%] min-h-[260px]">
                  <PlanViewChart rows={planRows}
                    extraPaths={[{ points: actualRows.map((r) => [r.e, r.n]), color: '#b91c1c', dash: '5 3' }]}
                    unit={mdUnit} title={`Plan view (plan vs ${actualName})`} />
                  <SectionViewPanel rows={planRows} unit={mdUnit} vsAzimuthDeg={vsAzimuthDeg}
                    overlays={[{ name: actualName, rows: actualRows, color: '#b91c1c' }]} />
                  <InclinationPanel rows={planRows} unit={mdUnit}
                    overlays={[{ name: actualName, rows: actualRows, color: '#b91c1c' }]} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto border-t border-slate-800">
                  <Table>
                    <TableHeader className="bg-slate-800 sticky top-0">
                      <TableRow className="border-slate-700">
                        <TableHead className="text-slate-300">MD ({mdUnit})</TableHead>
                        <TableHead className="text-slate-300">Plan Inc/Azi</TableHead>
                        <TableHead className="text-slate-300">Actual Inc/Azi</TableHead>
                        <TableHead className="text-slate-300">dInc (deg)</TableHead>
                        <TableHead className="text-slate-300">dAzi (deg)</TableHead>
                        <TableHead className="text-slate-300">dTVD ({mdUnit})</TableHead>
                        <TableHead className="text-slate-300">dN ({mdUnit})</TableHead>
                        <TableHead className="text-slate-300">dE ({mdUnit})</TableHead>
                        <TableHead className="text-slate-300">Separation ({mdUnit})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deltas.map((d, i) => (
                        <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="font-mono text-lime-400">{mu(d.md).toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-slate-400">{d.plan.inc.toFixed(2)} / {d.plan.azi.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-slate-300">{d.actual.inc.toFixed(2)} / {d.actual.azi.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-slate-300">{d.dInc.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-slate-300">{d.dAzi.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-slate-300">{mu(d.dTvd).toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-slate-400">{mu(d.dN).toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-slate-400">{mu(d.dE).toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-amber-400">{mu(d.sep3d).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          )}

          {view === 'project' && actualRows && (
            <div className="p-4 max-w-2xl space-y-4">
              <p className="text-xs text-slate-400">
                One exact continuous-build arc from the last actual station ({actualName}, MD {actualRows[actualRows.length - 1].md.toFixed(1)} {mdUnit}) to a target. Apply it on the Design tab with the Curve to target method when steering.
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label className="text-xs">Target</Label>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger className="h-9 bg-slate-800 border-slate-700" data-testid="project-target"><SelectValue placeholder="Select target..." /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {(siteTargets || []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name} ({t.tvdss_m?.toFixed(0)} m TVDSS)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Max DLS (deg/{mdUnit === 'ft' ? '100ft' : '30m'})</Label>
                  <Input type="number" value={maxDls} onChange={(e) => setMaxDls(e.target.value)} className="h-9 bg-slate-800 border-slate-700" />
                </div>
              </div>

              {projection && !projection.feasible && (
                <div className="rounded-md border border-red-900/40 bg-red-900/15 px-3 py-2 text-xs text-red-300" data-testid="project-error">
                  {projection.error}
                </div>
              )}
              {projection?.feasible && (
                <div className="rounded-md border border-slate-700 bg-slate-800/50 p-3 text-xs text-slate-300 space-y-1" data-testid="project-result">
                  {projection.report.straight ? (
                    <p>The target lies straight ahead: hold for {projection.report.endMdDelta.toFixed(1)} {mdUnit}.</p>
                  ) : (
                    <>
                      <p>Required dogleg <span className="font-mono text-lime-400">{projection.report.dls.toFixed(2)}</span> deg/{mdUnit === 'ft' ? '100ft' : '30m'} at toolface <span className="font-mono text-lime-400">{projection.report.toolfaceDeg.toFixed(1)}</span> deg.</p>
                      <p>Arc length <span className="font-mono">{projection.report.arcLen.toFixed(1)}</span> {mdUnit}, landing at MD <span className="font-mono">{projection.landing.md.toFixed(1)}</span> {mdUnit} with attitude <span className="font-mono">{projection.report.endInc.toFixed(1)}</span> deg inc / <span className="font-mono">{projection.report.endAzi.toFixed(1)}</span> deg grid azi.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog !== null && (
        <SurveyDialog
          open
          onOpenChange={(o) => { if (!o) setDialog(null); }}
          wellbore={wellbore}
          survey={dialog.survey}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

export default SurveysTab;
