
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Loader2, Plus, Trash2, GripVertical, Lock, Unlock, Download, AlertCircle, RefreshCw, Box, Activity, Map as MapIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import proj4 from 'proj4';
import Papa from 'papaparse';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { runForwardSurvey } from '@/lib/wellpath-kernel';
import { useWellPlanning } from '../contexts/WellPlanningContext';
import { solveBuildHold } from '@/utils/trajectorySolver';

import WellTrajectory3DView from '../components/WellTrajectory3DView';
import TrajectoryKPIs from '../components/TrajectoryKPIs';

const TrajectoryTab = ({ wellId, user }) => {
    // Basic State
    const [well, setWell] = useState(null);
    const [units, setUnits] = useState('feet');
    const [exaggeration, setExaggeration] = useState(1);
    const [viewMode, setViewMode] = useState('3d'); // 3d, 2d, table
    
    // Design State
    const [designMethod, setDesignMethod] = useState('User Defined');
    const [surfaceN, setSurfaceN] = useState(0);
    const [surfaceE, setSurfaceE] = useState(0);
    const [kbElevation, setKbElevation] = useState(0);
    const [segments, setSegments] = useState([{ id: 'seg-1', type: 'Hold', length: 1000, buildRate: 0, turnRate: 0, targetInc: 0, targetAzm: 0, errors: {} }]);
    
    // Target & Constraints
    const [targets, setTargets] = useState([]);
    const [selectedTargets, setSelectedTargets] = useState([]);
    const [lockToTarget, setLockToTarget] = useState(false);
    const [constraints, setConstraints] = useState({
        maxDLS: 3,
        maxBuildRate: 3,
        maxTurnRate: 3,
        finalTangentLength: 0,
        kop: 1000,
    });

    // Results
    const [planName, setPlanName] = useState('');
    const [planResult, setPlanResult] = useState(null);
    const [qaResult, setQaResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [solving, setSolving] = useState(false);

    const { trajectoryDraft, updateTrajectoryDraft } = useWellPlanning();
    const { toast } = useToast();

    // --- Helpers ---
    const METERS_TO_FEET = 3.28084;
    const depthUnitLabel = units === 'meters' ? 'm' : 'ft';
    const convertToMeters = useCallback((val) => (units === 'feet' ? parseFloat(val || 0) / METERS_TO_FEET : parseFloat(val || 0)), [units]);
    const convertFromMeters = useCallback((val) => (units === 'feet' ? parseFloat(val || 0) * METERS_TO_FEET : parseFloat(val || 0)), [units]);

    // Geo Projection
    const getGeoCoords = useCallback((easting, northing) => {
        if (!well?.crs || well.crs === 'EPSG:4326' || !proj4.defs(well.crs)) {
            return { lat: 0, lon: 0 };
        }
        try {
            const [lon, lat] = proj4(well.crs, 'EPSG:4326', [easting, northing]);
            return { lat, lon };
        } catch (e) { return { lat: 0, lon: 0 }; }
    }, [well?.crs]);

    // --- Data Loading ---
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

            if (trajectoryDraft) {
                setSegments(trajectoryDraft.segments || []);
                setConstraints(trajectoryDraft.constraints || {});
                setLockToTarget(trajectoryDraft.lockToTarget || false);
            }
        };
        loadData();
    }, [wellId, trajectoryDraft]);

    // --- Calculations ---
    const calculateTrajectory = useCallback(() => {
        if (segments.length === 0) return;

        const kernelOptions = {
            surface: { n: parseFloat(surfaceN), e: parseFloat(surfaceE), kb_m: convertToMeters(kbElevation) },
            segments: segments.map(s => ({
                type: s.type,
                length_m: convertToMeters(s.length),
                buildRate_dpm: parseFloat(s.buildRate || 0),
                turnRate_dpm: parseFloat(s.turnRate || 0)
            })),
            units: units,
            getGeoCoords
        };

        const { stations, qa } = runForwardSurvey(kernelOptions);
        setPlanResult(stations);
        setQaResult(qa);
    }, [segments, surfaceN, surfaceE, kbElevation, units, convertToMeters, getGeoCoords]);

    useEffect(() => {
        const timer = setTimeout(calculateTrajectory, 300);
        return () => clearTimeout(timer);
    }, [calculateTrajectory]);

    // --- Handlers ---
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
        const newSeg = { id, type: 'Hold', length: 100, buildRate: 0, turnRate: 0, targetInc: 0, targetAzm: 0, errors: {} };
        const newSegments = [...segments, newSeg];
        setSegments(newSegments);
        updateTrajectoryDraft({ segments: newSegments });
    };

    const removeSegment = (index) => {
        const newSegments = segments.filter((_, i) => i !== index);
        setSegments(newSegments);
        updateTrajectoryDraft({ segments: newSegments });
    };

    // --- Auto Solve ---
    const handleAutoSolve = () => {
        if (selectedTargets.length === 0) {
            toast({ variant: 'destructive', title: 'No Target Selected', description: 'Please select a target to lock to.' });
            return;
        }
        
        setSolving(true);
        try {
            const target = targets.find(t => t.id === selectedTargets[0]);
            if (!target) throw new Error("Target not found");

            const start = { vs: 0, tvd: convertToMeters(constraints.kop), inc: 0 }; 
            const tgt = { 
                vs: Math.sqrt(Math.pow(target.x - surfaceE, 2) + Math.pow(target.y - surfaceN, 2)), 
                tvd: target.tvd_m 
            };
            
            const rate = parseFloat(constraints.maxBuildRate);
            const courseLen = units === 'meters' ? 30 : 100;
            
            const solution = solveBuildHold(start, tgt, rate, courseLen);
            
            if (!solution.success) {
                throw new Error(solution.error || "Solver failed to find a valid path.");
            }

            const kopM = convertToMeters(constraints.kop);
            const buildLen = convertFromMeters(solution.buildLength);
            const holdLen = convertFromMeters(solution.holdLength);
            const azm = (Math.atan2(target.y - surfaceN, target.x - surfaceE) * 180 / Math.PI + 360) % 360;

            const newSegments = [
                { id: 'auto-1', type: 'Hold', length: constraints.kop, buildRate: 0, turnRate: 0, targetInc: 0, targetAzm: 0, errors: {} },
                { id: 'auto-2', type: 'Build', length: buildLen.toFixed(2), buildRate: rate, turnRate: 0, targetInc: solution.maxInc.toFixed(2), targetAzm: azm.toFixed(2), errors: {} },
                { id: 'auto-3', type: 'Hold', length: holdLen.toFixed(2), buildRate: 0, turnRate: 0, targetInc: solution.maxInc.toFixed(2), targetAzm: azm.toFixed(2), errors: {} }
            ];

            setSegments(newSegments);
            updateTrajectoryDraft({ segments: newSegments, lockToTarget: true });
            toast({ title: "Auto-Solve Successful", description: "Trajectory adjusted to hit target.", className: "bg-green-600 text-white" });

        } catch (e) {
            toast({ variant: 'destructive', title: 'Solver Error', description: e.message });
        } finally {
            setSolving(false);
        }
    };

    // --- Rendering ---
    
    const planSummary = useMemo(() => {
        if (!planResult || planResult.length < 2) return null;
        const last = planResult[planResult.length - 1];
        const start = planResult[0];
        const maxInc = Math.max(...planResult.map(s => s.INC));
        const maxDls = Math.max(...planResult.map(s => s.DLS || 0));
        
        return {
            totalMD: convertFromMeters(last.MD),
            totalTVD: convertFromMeters(last.TVD + convertToMeters(kbElevation)),
            horizontalDisplacement: convertFromMeters(last.ClosureDist),
            maxInclination: maxInc,
            maxDLS: maxDls,
            wellheadLat: start.lat,
            wellheadLon: start.lon
        };
    }, [planResult, kbElevation, convertFromMeters, convertToMeters]);

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
                        {/* Design Method */}
                        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                            <Label className="text-slate-400 text-xs uppercase font-bold">Design Method</Label>
                            <Select value={designMethod} onValueChange={setDesignMethod}>
                                <SelectTrigger className="bg-slate-900 border-slate-700 h-8"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    <SelectItem value="User Defined">User Defined</SelectItem>
                                    <SelectItem value="Build-Hold">Build & Hold (J-Type)</SelectItem>
                                    <SelectItem value="S-Shape">S-Shape</SelectItem>
                                </SelectContent>
                            </Select>
                            
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <div><Label className="text-[10px]">Max DLS</Label><Input type="number" value={constraints.maxDLS} onChange={e => setConstraints({...constraints, maxDLS: e.target.value})} className="h-7 bg-slate-900 text-xs" /></div>
                                <div><Label className="text-[10px]">KOP ({depthUnitLabel})</Label><Input type="number" value={constraints.kop} onChange={e => setConstraints({...constraints, kop: e.target.value})} className="h-7 bg-slate-900 text-xs" /></div>
                            </div>
                        </div>

                        {/* Targets */}
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
                                <Button size="sm" onClick={handleAutoSolve} disabled={solving} className="w-full bg-lime-600 hover:bg-lime-700 text-white h-8 text-xs">
                                    {solving ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                                    Solve Path
                                </Button>
                            )}
                        </div>

                        {/* Segments Editor */}
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
                                                                    <span className="font-bold text-lime-400">#{index+1}</span>
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
                
                {/* KPI Header */}
                <TrajectoryKPIs summary={planSummary} qc={qaResult} depthUnit={depthUnitLabel} />

                {/* Visualization Area */}
                <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 flex flex-col overflow-hidden relative">
                    <div className="flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900/90 backdrop-blur z-10 absolute top-0 left-0 right-0">
                        <div className="flex bg-slate-800 rounded p-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('3d')} className={`h-7 px-3 text-xs ${viewMode === '3d' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><Box className="w-3 h-3 mr-1"/> 3D</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('2d')} className={`h-7 px-3 text-xs ${viewMode === '2d' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><Activity className="w-3 h-3 mr-1"/> Plots</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('table')} className={`h-7 px-3 text-xs ${viewMode === 'table' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><TableIcon className="w-3 h-3 mr-1"/> Survey</Button>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                            {viewMode === '3d' && (
                                <div className="flex items-center space-x-2">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold">Vert Exag</span>
                                    <Slider min={1} max={10} step={0.5} value={[exaggeration]} onValueChange={([v]) => setExaggeration(v)} className="w-24" />
                                    <span className="text-xs font-mono text-lime-400 w-6">{exaggeration}x</span>
                                </div>
                            )}
                            <Button size="sm" className="h-7 bg-lime-600 hover:bg-lime-700 text-white text-xs"><Download className="w-3 h-3 mr-1"/> Export</Button>
                        </div>
                    </div>

                    <div className="flex-1 pt-12 bg-black relative">
                        {viewMode === '3d' && (
                            <WellTrajectory3DView 
                                planResult={planResult} 
                                targets={targets} 
                                exaggeration={exaggeration} 
                            />
                        )}
                        
                        {viewMode === '2d' && planResult && (
                            <div className="grid grid-cols-2 gap-px bg-slate-800 h-full w-full">
                                <div className="bg-white relative flex items-center justify-center text-slate-500">
                                    Chart removed
                                </div>
                                <div className="bg-white relative flex items-center justify-center text-slate-500">
                                    Chart removed
                                </div>
                                <div className="bg-white relative flex items-center justify-center text-slate-500">
                                    Chart removed
                                </div>
                                <div className="bg-white relative flex items-center justify-center text-slate-500">
                                    Chart removed
                                </div>
                            </div>
                        )}

                        {viewMode === 'table' && planResult && (
                            <div className="h-full overflow-auto bg-slate-900">
                                <Table>
                                    <TableHeader className="bg-slate-800 sticky top-0">
                                        <TableRow className="border-slate-700">
                                            <TableHead className="text-slate-300">MD</TableHead>
                                            <TableHead className="text-slate-300">Inc</TableHead>
                                            <TableHead className="text-slate-300">Azm</TableHead>
                                            <TableHead className="text-slate-300">TVD</TableHead>
                                            <TableHead className="text-slate-300">North</TableHead>
                                            <TableHead className="text-slate-300">East</TableHead>
                                            <TableHead className="text-slate-300">DLS</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {planResult.map((s, i) => (
                                            <TableRow key={i} className="border-slate-800 hover:bg-slate-800/50">
                                                <TableCell className="font-mono text-lime-400">{convertFromMeters(s.MD).toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-300">{s.INC.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-300">{s.AZM.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-300">{convertFromMeters(s.TVD).toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-400">{s.North.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-400">{s.East.toFixed(2)}</TableCell>
                                                <TableCell className="font-mono text-slate-400">{s.DLS ? s.DLS.toFixed(2) : '-'}</TableCell>
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
