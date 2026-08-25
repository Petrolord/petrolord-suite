
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2, GripVertical, Download, AlertCircle, RefreshCw, Activity, Table as TableIcon, LayoutGrid } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toLonLat } from '@/lib/crs';
import { isTransformableTag } from '@/lib/crs/tags';
import Papa from 'papaparse';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { compileSegments } from '../engine/segmentCompiler';
import { M_TO_FT } from '../engine/surveyMath';
import { useWellPlanning } from '../contexts/WellPlanningContext';
import TrajectoryKPIs from '../components/TrajectoryKPIs';
import {
  PlanViewPanel, SectionViewPanel, InclinationPanel, DlsPanel,
} from '../charts/TrajectoryCharts';

// Trajectory design on the validated drilling engine (Well Design
// Studio WD0). All lengths and rates stay in the well's depth unit end
// to end; rates are deg/30m (metric) or deg/100ft (feet) of that SAME
// unit — the engine enforces it. N/E are relative to the wellhead;
// absolute coordinates (well CRS is metres) are derived only where
// lat/lon is displayed.

const TrajectoryTab = ({ wellId, user }) => {
    const [well, setWell] = useState(null);
    const [units, setUnits] = useState('feet');
    const [viewMode, setViewMode] = useState('section'); // section | plots | table

    const [surfaceN, setSurfaceN] = useState(0);
    const [surfaceE, setSurfaceE] = useState(0);
    const [kbElevation, setKbElevation] = useState(0);
    const [kickoffAzi, setKickoffAzi] = useState(0);
    const [segments, setSegments] = useState([{ id: 'seg-1', type: 'Hold', length: 1000, buildRate: 0, turnRate: 0, errors: {} }]);

    const [targets, setTargets] = useState([]);
    const [selectedTargets, setSelectedTargets] = useState([]);
    const [lockToTarget, setLockToTarget] = useState(false);
    const [constraints, setConstraints] = useState({ maxDLS: 3, maxBuildRate: 3, kop: 1000 });

    const [planRows, setPlanRows] = useState(null);
    const [qaResult, setQaResult] = useState(null);
    const [compileError, setCompileError] = useState(null);
    const [solving, setSolving] = useState(false);

    const { trajectoryDraft, updateTrajectoryDraft } = useWellPlanning();
    const { toast } = useToast();
    const draftAppliedFor = useRef(null);

    const mdUnit = units === 'meters' ? 'm' : 'ft';
    const depthUnitLabel = mdUnit;
    // Well/target coordinates live in the well CRS (metres); depth-unit
    // conversion is only needed at that boundary.
    const metersToUser = useCallback((v) => (mdUnit === 'ft' ? v * M_TO_FT : v), [mdUnit]);
    const userToMeters = useCallback((v) => (mdUnit === 'ft' ? v / M_TO_FT : v), [mdUnit]);

    const getGeoCoords = useCallback((easting, northing) => {
        if (!well?.crs || well.crs === 'EPSG:4326' || !isTransformableTag(well.crs)) {
            return null;
        }
        try {
            const { lon, lat } = toLonLat(well.crs, easting, northing);
            return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
        } catch (e) { return null; }
    }, [well?.crs]);

    useEffect(() => {
        const loadData = async () => {
            if (!wellId) return;
            const { data: w } = await supabase.from('wells').select('*').eq('id', wellId).single();
            if (w) {
                setWell(w);
                setUnits(w.depth_unit || 'feet');
                setSurfaceN(w.surface_y || 0);
                setSurfaceE(w.surface_x || 0);
                setKbElevation(w.kb_elev || 0);
            }
            const { data: t } = await supabase.from('well_targets').select('*').eq('well_id', wellId).order('priority');
            if (t) setTargets(t);
        };
        loadData();
    }, [wellId]);

    // Apply the saved draft once per well; segment edits write the draft
    // back, so keeping this reactive to trajectoryDraft loops.
    useEffect(() => {
        if (!trajectoryDraft || draftAppliedFor.current === wellId) return;
        draftAppliedFor.current = wellId;
        if (trajectoryDraft.segments?.length) setSegments(trajectoryDraft.segments);
        if (trajectoryDraft.constraints) setConstraints((c) => ({ ...c, ...trajectoryDraft.constraints }));
        if (Number.isFinite(trajectoryDraft.kickoffAzi)) setKickoffAzi(trajectoryDraft.kickoffAzi);
        setLockToTarget(trajectoryDraft.lockToTarget || false);
    }, [wellId, trajectoryDraft]);

    const calculateTrajectory = useCallback(() => {
        if (segments.length === 0) { setPlanRows(null); return; }
        try {
            const compiled = compileSegments({
                mdUnit,
                tieOn: { md: 0, inc: 0, azi: parseFloat(kickoffAzi) || 0 },
                maxDls: parseFloat(constraints.maxDLS) || null,
                segments: segments.map((s) => {
                    const type = (s.type || 'Hold').toLowerCase();
                    const length = parseFloat(s.length || 0);
                    if (type === 'build') return { kind: 'build', rate: parseFloat(s.buildRate || 0), length };
                    if (type === 'turn') return { kind: 'turn', rate: parseFloat(s.turnRate || 0), length };
                    return { kind: 'hold', length };
                }).filter((s) => s.length > 0 && (s.kind === 'hold' || Math.abs(s.rate) > 0)),
                kb: parseFloat(kbElevation) || 0,
            });
            setPlanRows(compiled.table);
            setQaResult(compiled.qa);
            setCompileError(null);
        } catch (e) {
            setPlanRows(null);
            setQaResult(null);
            setCompileError(e.message);
        }
    }, [segments, kickoffAzi, kbElevation, constraints.maxDLS, mdUnit]);

    useEffect(() => {
        const timer = setTimeout(calculateTrajectory, 300);
        return () => clearTimeout(timer);
    }, [calculateTrajectory]);

    const handleDragEnd = (result) => {
        if (!result.destination) return;
        const items = Array.from(segments);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setSegments(items);
        updateTrajectoryDraft({ segments: items });
    };

    const updateSegment = (index, field, value) => {
        const newSegments = [...segments];
        newSegments[index] = { ...newSegments[index], [field]: value };
        setSegments(newSegments);
        updateTrajectoryDraft({ segments: newSegments });
    };

    const addSegment = () => {
        const id = `seg-${Date.now()}`;
        const newSegments = [...segments, { id, type: 'Hold', length: 100, buildRate: 0, turnRate: 0, errors: {} }];
        setSegments(newSegments);
        updateTrajectoryDraft({ segments: newSegments });
    };

    const removeSegment = (index) => {
        const newSegments = segments.filter((_, i) => i !== index);
        setSegments(newSegments);
        updateTrajectoryDraft({ segments: newSegments });
    };

    // Closed-form slant (build-hold) solve to the selected target. The
    // WD2 wave replaces this with engines/drilling profileDesign; the
    // geometry here is the exact circle-tangent construction:
    //   theta = atan2(D - R, dV) + asin(R / c),  c = |target - centre side|
    const handleAutoSolve = () => {
        if (selectedTargets.length === 0) {
            toast({ variant: 'destructive', title: 'No target selected', description: 'Select a target to solve to.' });
            return;
        }
        setSolving(true);
        try {
            const target = targets.find((t) => t.id === selectedTargets[0]);
            if (!target) throw new Error('Target not found');

            const rate = parseFloat(constraints.maxBuildRate);
            if (!(rate > 0)) throw new Error('Build rate must be positive.');
            const kop = parseFloat(constraints.kop) || 0;
            const interval = mdUnit === 'ft' ? 100 : 30;
            const R = interval / (rate * (Math.PI / 180));

            // Target geometry in the user's depth unit, relative to the wellhead.
            const dE = metersToUser((target.x || 0) - (parseFloat(surfaceE) || 0));
            const dN = metersToUser((target.y || 0) - (parseFloat(surfaceN) || 0));
            const D = Math.hypot(dE, dN);
            const dV = metersToUser(target.tvd_m || 0) - kop;
            if (dV <= 0) throw new Error('Target TVD is above the kickoff point.');

            const c = Math.hypot(D - R, dV);
            if (c < R) {
                const rMin = (D * D + dV * dV) / (2 * D);
                const rateMin = (interval / rMin) * (180 / Math.PI);
                throw new Error(`Target is inside the build circle. Increase the build rate above ${rateMin.toFixed(2)} deg/${interval}${mdUnit} or lower the KOP.`);
            }
            const theta = Math.atan2(D - R, dV) + Math.asin(R / c);
            if (!(theta > 0)) throw new Error('No positive-inclination solution; check KOP and target.');
            const buildLen = R * theta;
            const holdLen = Math.sqrt(Math.max(0, c * c - R * R));
            const thetaDeg = theta * (180 / Math.PI);
            // Compass azimuth to the target: atan2(dE, dN).
            const azm = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;

            const newSegments = [
                { id: 'auto-1', type: 'Hold', length: kop, buildRate: 0, turnRate: 0, errors: {} },
                { id: 'auto-2', type: 'Build', length: +buildLen.toFixed(2), buildRate: rate, turnRate: 0, errors: {} },
                { id: 'auto-3', type: 'Hold', length: +holdLen.toFixed(2), buildRate: 0, turnRate: 0, errors: {} },
            ];
            setSegments(newSegments);
            setKickoffAzi(+azm.toFixed(2));
            updateTrajectoryDraft({ segments: newSegments, kickoffAzi: +azm.toFixed(2), lockToTarget: true });
            toast({ title: 'Solve complete', description: `Build to ${thetaDeg.toFixed(1)} deg at azimuth ${azm.toFixed(1)} deg hits the target.`, className: 'bg-green-600 text-white' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Solver error', description: e.message });
        } finally {
            setSolving(false);
        }
    };

    const handleExportCsv = () => {
        if (!planRows) return;
        const csv = Papa.unparse(planRows.map((r) => ({
            [`MD_${depthUnitLabel}`]: r.md.toFixed(2),
            Inc_deg: r.inc.toFixed(3),
            Azi_deg: r.azi.toFixed(3),
            [`TVD_${depthUnitLabel}`]: r.tvd.toFixed(2),
            [`TVDSS_${depthUnitLabel}`]: r.tvdss.toFixed(2),
            [`North_${depthUnitLabel}`]: r.n.toFixed(2),
            [`East_${depthUnitLabel}`]: r.e.toFixed(2),
            [`DLS_deg_per_${mdUnit === 'ft' ? '100ft' : '30m'}`]: (mdUnit === 'ft' ? r.dls100ft : r.dls30m).toFixed(3),
            [`VS_${depthUnitLabel}`]: r.vs.toFixed(2),
        })));
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${well?.name || 'well'}-survey.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const planSummary = useMemo(() => {
        if (!planRows || planRows.length < 2) return null;
        const last = planRows[planRows.length - 1];
        const bhAbs = {
            x: (parseFloat(surfaceE) || 0) + userToMeters(last.e),
            y: (parseFloat(surfaceN) || 0) + userToMeters(last.n),
        };
        return {
            totalMD: last.md,
            totalTVD: last.tvd,
            horizontalDisplacement: last.closureDist,
            maxInclination: Math.max(...planRows.map((s) => s.inc)),
            maxDLS: Math.max(...planRows.map((s) => (mdUnit === 'ft' ? s.dls100ft : s.dls30m))),
            bottomHole: getGeoCoords(bhAbs.x, bhAbs.y),
        };
    }, [planRows, surfaceE, surfaceN, userToMeters, mdUnit, getGeoCoords]);

    const chartTargets = useMemo(() => targets.map((t) => ({
        id: t.id,
        name: t.name,
        e: metersToUser((t.x || 0) - (parseFloat(surfaceE) || 0)),
        n: metersToUser((t.y || 0) - (parseFloat(surfaceN) || 0)),
    })), [targets, surfaceE, surfaceN, metersToUser]);

    const vsAzimuthDeg = planRows && planRows.length > 1
        ? planRows[planRows.length - 1].closureAzi : null;

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-4">
            {/* LEFT SIDEBAR: Controls */}
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-full lg:w-[400px] flex flex-col bg-slate-900 border-r border-slate-800 rounded-lg overflow-hidden shrink-0">
                <div className="p-4 border-b border-slate-800 bg-slate-900 z-10">
                    <h2 className="text-lg font-bold text-white flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-lime-400" />
                        Trajectory Design
                    </h2>
                </div>

                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-6">
                        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                            <Label className="text-slate-400 text-xs uppercase font-bold">Design Settings</Label>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <div><Label className="text-[10px]">Max DLS (/{mdUnit === 'ft' ? '100ft' : '30m'})</Label><Input type="number" value={constraints.maxDLS} onChange={e => setConstraints({ ...constraints, maxDLS: e.target.value })} className="h-7 bg-slate-900 text-xs" /></div>
                                <div><Label className="text-[10px]">KOP ({depthUnitLabel})</Label><Input type="number" value={constraints.kop} onChange={e => setConstraints({ ...constraints, kop: e.target.value })} className="h-7 bg-slate-900 text-xs" /></div>
                                <div><Label className="text-[10px]">KO Azi (deg)</Label><Input type="number" value={kickoffAzi} onChange={e => { setKickoffAzi(e.target.value); updateTrajectoryDraft({ kickoffAzi: parseFloat(e.target.value) || 0 }); }} className="h-7 bg-slate-900 text-xs" /></div>
                            </div>
                        </div>

                        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                            <div className="flex justify-between items-center">
                                <Label className="text-slate-400 text-xs uppercase font-bold">Targeting</Label>
                                <div className="flex items-center space-x-2">
                                    <Label htmlFor="lock" className="text-[10px] cursor-pointer">Auto-Solve</Label>
                                    <Checkbox id="lock" checked={lockToTarget} onCheckedChange={setLockToTarget} />
                                </div>
                            </div>

                            <Select value={selectedTargets[0] || ''} onValueChange={(v) => setSelectedTargets([v])}>
                                <SelectTrigger className="bg-slate-900 border-slate-700 h-8 text-xs"><SelectValue placeholder="Select Target..." /></SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    {targets.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.tvd_m}m TVD)</SelectItem>)}
                                </SelectContent>
                            </Select>

                            {lockToTarget && (
                                <>
                                    <div><Label className="text-[10px]">Build rate (deg/{mdUnit === 'ft' ? '100ft' : '30m'})</Label><Input type="number" value={constraints.maxBuildRate} onChange={e => setConstraints({ ...constraints, maxBuildRate: e.target.value })} className="h-7 bg-slate-900 text-xs" /></div>
                                    <Button size="sm" onClick={handleAutoSolve} disabled={solving} className="w-full bg-lime-600 hover:bg-lime-700 text-white h-8 text-xs">
                                        {solving ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                                        Solve Path
                                    </Button>
                                </>
                            )}
                        </div>

                        {!lockToTarget && (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-slate-400 text-xs uppercase font-bold">Segments</Label>
                                    <Button size="sm" variant="ghost" onClick={addSegment} className="h-6 w-6 p-0 hover:bg-slate-800"><Plus className="w-4 h-4 text-lime-400" /></Button>
                                </div>

                                <DragDropContext onDragEnd={handleDragEnd}>
                                    <Droppable droppableId="segments">
                                        {(provided) => (
                                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                                {segments.map((seg, index) => (
                                                    <Draggable key={seg.id} draggableId={seg.id} index={index}>
                                                        {(provided) => (
                                                            <div ref={provided.innerRef} {...provided.draggableProps} className="bg-slate-800 border border-slate-700 rounded p-2 text-xs group">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <div {...provided.dragHandleProps} className="cursor-grab text-slate-600 hover:text-slate-400"><GripVertical className="w-4 h-4" /></div>
                                                                    <span className="font-bold text-lime-400">#{index + 1}</span>
                                                                    <Select value={seg.type} onValueChange={(v) => updateSegment(index, 'type', v)}>
                                                                        <SelectTrigger className="h-6 w-24 bg-slate-900 border-none text-[10px]"><SelectValue /></SelectTrigger>
                                                                        <SelectContent className="bg-slate-800"><SelectItem value="Hold">Hold</SelectItem><SelectItem value="Build">Build</SelectItem><SelectItem value="Turn">Turn</SelectItem></SelectContent>
                                                                    </Select>
                                                                    <Button variant="ghost" size="icon" onClick={() => removeSegment(index)} className="ml-auto h-5 w-5 text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></Button>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2 pl-6">
                                                                    <div className="flex items-center justify-between"><span className="text-slate-500">Len:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.length} onChange={(e) => updateSegment(index, 'length', e.target.value)} /></div>
                                                                    {seg.type !== 'Hold' && <div className="flex items-center justify-between"><span className="text-slate-500">{seg.type === 'Turn' ? 'TR' : 'BR'}:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.type === 'Turn' ? seg.turnRate : seg.buildRate} onChange={(e) => updateSegment(index, seg.type === 'Turn' ? 'turnRate' : 'buildRate', e.target.value)} /></div>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </motion.div>

            {/* RIGHT MAIN AREA */}
            <div className="flex-1 flex flex-col min-w-0 gap-4">
                <TrajectoryKPIs summary={planSummary} qc={qaResult} depthUnit={depthUnitLabel} />

                {compileError && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-900/40 bg-red-900/15 px-3 py-2 text-xs text-red-300">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {compileError}
                    </div>
                )}

                <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 flex flex-col overflow-hidden relative">
                    <div className="flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900/90 backdrop-blur z-10 absolute top-0 left-0 right-0">
                        <div className="flex bg-slate-800 rounded p-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('section')} className={`h-7 px-3 text-xs ${viewMode === 'section' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><Activity className="w-3 h-3 mr-1" /> Section</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('plots')} className={`h-7 px-3 text-xs ${viewMode === 'plots' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><LayoutGrid className="w-3 h-3 mr-1" /> Plots</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('table')} className={`h-7 px-3 text-xs ${viewMode === 'table' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><TableIcon className="w-3 h-3 mr-1" /> Survey</Button>
                        </div>
                        <Button size="sm" onClick={handleExportCsv} disabled={!planRows} className="h-7 bg-lime-600 hover:bg-lime-700 text-white text-xs"><Download className="w-3 h-3 mr-1" /> Export CSV</Button>
                    </div>

                    <div className="flex-1 pt-12 relative">
                        {viewMode === 'section' && planRows && (
                            <div className="h-full w-full bg-white">
                                <SectionViewPanel rows={planRows} unit={depthUnitLabel} vsAzimuthDeg={vsAzimuthDeg} />
                            </div>
                        )}

                        {viewMode === 'plots' && planRows && (
                            <div className="grid grid-cols-2 grid-rows-2 gap-px bg-slate-800 h-full w-full">
                                <PlanViewPanel rows={planRows} targets={chartTargets} unit={depthUnitLabel} />
                                <SectionViewPanel rows={planRows} unit={depthUnitLabel} vsAzimuthDeg={vsAzimuthDeg} />
                                <InclinationPanel rows={planRows} unit={depthUnitLabel} />
                                <DlsPanel rows={planRows} unit={depthUnitLabel} />
                            </div>
                        )}

                        {viewMode === 'table' && planRows && (
                            <div className="h-full overflow-auto bg-slate-900">
                                <Table>
                                    <TableHeader className="bg-slate-800 sticky top-0">
                                        <TableRow className="border-slate-700">
                                            <TableHead className="text-slate-300">MD ({depthUnitLabel})</TableHead>
                                            <TableHead className="text-slate-300">Inc (deg)</TableHead>
                                            <TableHead className="text-slate-300">Azi (deg)</TableHead>
                                            <TableHead className="text-slate-300">TVD ({depthUnitLabel})</TableHead>
                                            <TableHead className="text-slate-300">North ({depthUnitLabel})</TableHead>
                                            <TableHead className="text-slate-300">East ({depthUnitLabel})</TableHead>
                                            <TableHead className="text-slate-300">VS ({depthUnitLabel})</TableHead>
                                            <TableHead className="text-slate-300">DLS (/{mdUnit === 'ft' ? '100ft' : '30m'})</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {planRows.map((s, i) => (
                                            <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50">
                                                <TableCell className="font-mono text-lime-400">{s.md.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-300">{s.inc.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-300">{s.azi.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-300">{s.tvd.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-400">{s.n.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-400">{s.e.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-400">{s.vs.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-400">{(mdUnit === 'ft' ? s.dls100ft : s.dls30m).toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrajectoryTab;
