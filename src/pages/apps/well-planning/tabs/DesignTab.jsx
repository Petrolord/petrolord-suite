
import React, { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2, GripVertical, Download, AlertCircle, Wand2, Activity, Table as TableIcon, LayoutGrid, Save, Box, Share2, Target } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toLonLat } from '@/lib/crs';
import { isTransformableTag } from '@/lib/crs/tags';
import Papa from 'papaparse';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { compileSegments } from '../engine/segmentCompiler';
import { M_TO_FT } from '../engine/surveyMath';
import { DEFAULT_VERTICAL_TOLERANCE_M, MAX_VERTICAL_TOLERANCE_M } from '../engine/profileDesign';
import { resolveWellhead, targetsToChart } from '../services/targetFrame';
import { gridAzimuthDelta } from '../services/surveyUtils';
import {
  resolveMagReference, computeStationUncertainty, eouPlanEllipses, eouSectionBand,
} from '../services/acUtils';
import { useWellPlanning } from '../contexts/WellPlanningContext';
import { useWellPlanningStore } from '../state/WellPlanningStore';
import { updateDesign, getSurveyProgram } from '../services/wpApi';
import TrajectoryKPIs from '../components/TrajectoryKPIs';
import SolverDialog from '../components/SolverDialog';
import SurveyProgramEditor from '../components/SurveyProgramEditor';
import PublishDialog from '../components/PublishDialog';
import WellpathCubeView from '../components/WellpathCubeView';
import MudWindowPanel from '../charts/MudWindowPanel';
import PlanEditorTable from '../components/PlanEditorTable';
import { Undo2, Redo2, TableProperties } from 'lucide-react';
import {
    resolvePlan, derivePlanTable, applyPlanEdit, changeSegmentType, insertSegment,
    deleteSegment, moveSegment, historyReducer, initHistory, makeSegmentId,
    SEGMENT_TYPES, SEGMENT_TYPE_LABELS,
} from '../services/planEditor';
import { buildTrajectoryContract, exportFormats } from '../services/trajectoryContract';
import { loadPpfgCurves, buildMudWindow, mudWindowSummary } from '../services/ppfg';
import { compositeStations } from '../services/surveyUtils';
import { listSurveys, listDesigns } from '../services/wpApi';
import { listTops } from '@/lib/wellsRegistry';
import PlanViewChart from '../charts/PlanViewChart';
import { DEFAULT_EXAGGERATION } from '../services/sectionScale';
import {
  SectionViewPanel, InclinationPanel, DlsPanel,
} from '../charts/TrajectoryCharts';

// Trajectory design on the validated drilling engine (WD0), rewired to
// the wp_* data model (WD1): the design's segments/tie-on load from
// wp_designs, unsaved edits live in the localStorage draft keyed by the
// design id, and Save writes segments + a station cache (metres, the
// registry convention) back to the row. All lengths and rates stay in
// the wellbore's depth unit end to end; wellhead/targets are site-CRS
// metres and convert only at the boundary.

const ENGINE_VERSION = 'drilling-wd2';

const DesignTab = () => {
    const { user, site, wellbore, design, designs, targets: siteTargets, wellbores, refreshDesigns, refreshWellbores } = useWellPlanningStore();
    const { trajectoryDraft, updateTrajectoryDraft } = useWellPlanning();
    const { toast } = useToast();

    const [viewMode, setViewMode] = useState('section'); // section | plots | plan | table | 3d
    const [kickoffAzi, setKickoffAzi] = useState(0);
    // Plan Editor: the segments array lives in one undo/redo history
    // (services/planEditor historyReducer) shared by the segments panel,
    // the Plan table, solver applies, insert/delete and drag reorder.
    const [planHistory, dispatchPlan] = useReducer(historyReducer, undefined, () => initHistory({ segments: [] }));
    const segments = planHistory.present.segments;
    const [planSpans, setPlanSpans] = useState(null);
    const [solverOpen, setSolverOpen] = useState(false);
    const [constraints, setConstraints] = useState({ maxDLS: 3 });
    const [planRows, setPlanRows] = useState(null);
    const [stations, setStations] = useState(null);
    const [qaResult, setQaResult] = useState(null);
    const [compileError, setCompileError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [programOpen, setProgramOpen] = useState(false);
    const [programIntervals, setProgramIntervals] = useState(null);
    const [showEou, setShowEou] = useState(true);
    const [publishOpen, setPublishOpen] = useState(false);
    const [showPpfg, setShowPpfg] = useState(false);
    const [showTargets, setShowTargets] = useState(true);
    // Section scale (true scale by default; one setting shared by the
    // Section view and the Plots grid) and DLS path colouring.
    const [sectionEx, setSectionEx] = useState(DEFAULT_EXAGGERATION);
    const [showDlsColor, setShowDlsColor] = useState(false);
    const [ppfg, setPpfg] = useState(null);          // {rows, summary} | 'loading' | 'none' | null
    const [scene3d, setScene3d] = useState(null);    // {composite, offsets, tops} lazy-loaded
    const loadedFor = useRef(null);

    const mdUnit = wellbore?.depth_unit === 'ft' ? 'ft' : 'm';
    const depthUnitLabel = mdUnit;
    const metersToUser = useCallback((v) => (mdUnit === 'ft' ? v * M_TO_FT : v), [mdUnit]);
    const userToMeters = useCallback((v) => (mdUnit === 'ft' ? v / M_TO_FT : v), [mdUnit]);
    // Wellhead in site-CRS metres (explicit head, else slot + pad
    // origin). No fallback to 0/0: without it targets, slots and lease
    // lines are not drawn and the banner below says why (they used to be
    // drawn at their absolute coordinates, autoscaling the plan view to
    // hundreds of thousands of feet).
    const wellhead = useMemo(() => resolveWellhead(wellbore, site), [wellbore, site]);
    const headX = wellhead?.x ?? 0;
    const headY = wellhead?.y ?? 0;
    const kbUser = metersToUser(wellbore?.kb_elev_m || 0);
    // Survey listing interval in the wellbore unit (stations every N).
    const defaultStationInterval = mdUnit === 'ft' ? 100 : 30;
    const stationInterval = (() => {
        const v = parseFloat(constraints.stationInterval);
        return Number.isFinite(v) && v > 0 ? v : defaultStationInterval;
    })();
    // Vertical tolerance (metres, horizontal): a target this close to
    // straight below the design end is solved as a vertical hold.
    const verticalToleranceM = (() => {
        const v = parseFloat(constraints.verticalTolM);
        return Number.isFinite(v) && v >= 0 && v <= MAX_VERTICAL_TOLERANCE_M ? v : DEFAULT_VERTICAL_TOLERANCE_M;
    })();

    // Load the design payload once per design; the localStorage draft
    // (unsaved work) wins over the saved row.
    useEffect(() => {
        if (!design || loadedFor.current === design.id) return;
        loadedFor.current = design.id;
        const draft = trajectoryDraft;
        const savedSegments = Array.isArray(design.segments) && design.segments.length
            ? design.segments : [{ id: 'seg-1', type: 'Hold', length: mdUnit === 'ft' ? 1000 : 300, buildRate: 0, turnRate: 0 }];
        dispatchPlan({ type: 'reset', value: { segments: draft?.segments?.length ? draft.segments : savedSegments } });
        const savedAzi = design.tie_on?.azi ?? 0;
        setKickoffAzi(Number.isFinite(draft?.kickoffAzi) ? draft.kickoffAzi : savedAzi);
        if (draft?.constraints) setConstraints((c) => ({ ...c, ...draft.constraints }));
    }, [design, trajectoryDraft, mdUnit]);

    // Survey program (WD4): loaded per design; a saved program routes
    // the uncertainty engine through per-tool runs with tie-on carry.
    useEffect(() => {
        if (!design?.id) { setProgramIntervals(null); return; }
        getSurveyProgram(design.id)
            .then((row) => setProgramIntervals(Array.isArray(row?.intervals) && row.intervals.length ? row.intervals : null))
            .catch(() => setProgramIntervals(null));
    }, [design?.id]);

    // Positional uncertainty (WD4): ISCWSA MWD Rev4 over the compiled
    // stations (metres/grid), EOU overlays at 2 sigma. Needs a
    // geomagnetic reference; without one the overlay is off, loudly.
    const magRef = useMemo(() => resolveMagReference(site, wellbore), [site, wellbore]);
    const gridMeterStations = useMemo(() => (stations && stations.length >= 2
        ? stations.map((s) => ({ md: userToMeters(s.md), inc: s.inc, azi: s.azi }))
        : null), [stations, userToMeters]);
    const uncertainty = useMemo(() => {
        if (!showEou || !magRef || !gridMeterStations || !planRows) return null;
        try {
            const { totalCov, programUsed } = computeStationUncertainty(
                gridMeterStations, magRef, { programIntervals },
            );
            return {
                totalCov,
                ellipses: eouPlanEllipses(planRows, totalCov, { k: 2, every: 8, metersToUser }),
                band: eouSectionBand(planRows, totalCov, { k: 2, metersToUser }),
                programUsed,
            };
        } catch (e) { return null; }
    }, [showEou, magRef, gridMeterStations, planRows, programIntervals, metersToUser]);

    // 3D scene context (WD5): lazy-loaded the first time the 3D view
    // opens — actual composite runs, the site's other definitive
    // designs (offsets) and registry tops on the bridged geo_well.
    useEffect(() => {
        if (viewMode !== '3d' || scene3d || !wellbore?.id) return;
        let live = true;
        (async () => {
            const out = { composite: null, offsets: [], tops: [] };
            try {
                const surveys = await listSurveys(wellbore.id);
                const gridOf = (s) => (Array.isArray(s.computed) && s.computed.length >= 2 ? s.computed : s.stations);
                const comp = compositeStations(
                    surveys.filter((s) => s.is_in_definitive).map((s) => ({ stations: gridOf(s) })),
                );
                if (comp.length >= 2) out.composite = comp;
            } catch (e) { /* composite is optional */ }
            for (const w of (wellbores || []).filter((x) => x.id !== wellbore.id)) {
                if (!Number.isFinite(w.head_x)) continue;
                try {
                    const ds = await listDesigns(w.id);
                    const withStations = ds.filter((d) => Array.isArray(d.stations) && d.stations.length >= 2);
                    const pick = withStations.find((d) => d.status === 'definitive')
                        || withStations[withStations.length - 1];
                    if (pick) {
                        out.offsets.push({
                            id: w.id, label: w.name, stations: pick.stations,
                            headX: w.head_x, headY: w.head_y, kbElevM: w.kb_elev_m || 0,
                        });
                    }
                } catch (e) { /* skip unreadable wellbores */ }
            }
            if (wellbore.geo_well_id) {
                try {
                    out.tops = (await listTops(wellbore.geo_well_id))
                        .map((t) => ({ name: t.name, mdM: t.md_m }));
                } catch (e) { /* tops are optional */ }
            }
            if (live) setScene3d(out);
        })();
        return () => { live = false; };
    }, [viewMode, scene3d, wellbore, wellbores]);
    useEffect(() => { setScene3d(null); }, [wellbore?.id]);

    const cubeWells = useMemo(() => {
        if (!gridMeterStations) return [];
        const out = [{
            id: 'plan', label: `${wellbore?.name || 'well'} (plan)`, color: '#166534',
            stations: gridMeterStations, headX: wellbore?.head_x ?? 0, headY: wellbore?.head_y ?? 0,
            kbElevM: wellbore?.kb_elev_m || 0, cov: uncertainty?.totalCov || null, kind: 'plan',
        }];
        if (scene3d?.composite) {
            out.push({
                id: 'actual', label: `${wellbore?.name || 'well'} (actual)`, color: '#b91c1c',
                stations: scene3d.composite, headX: wellbore?.head_x ?? 0, headY: wellbore?.head_y ?? 0,
                kbElevM: wellbore?.kb_elev_m || 0, kind: 'actual',
            });
        }
        const palette = ['#1d4ed8', '#7c3aed', '#0f766e', '#be185d', '#b45309'];
        (scene3d?.offsets || []).forEach((o, i) => {
            out.push({
                id: `off-${o.id}`, label: o.label, color: palette[i % palette.length],
                stations: o.stations, headX: o.headX, headY: o.headY,
                kbElevM: o.kbElevM, kind: 'offset',
            });
        });
        return out;
    }, [gridMeterStations, wellbore, uncertainty, scene3d]);

    const cubeTops = useMemo(() => (scene3d?.tops || [])
        .map((t) => ({ ...t, wellId: 'plan' })), [scene3d]);

    // PPFG mud window (WD5): the pore-pressure prognosis published to
    // the bridged registry well, hung on this design's trajectory.
    useEffect(() => {
        if (!showPpfg || !gridMeterStations) return;
        if (!wellbore?.geo_well_id) { setPpfg('none'); return; }
        let live = true;
        setPpfg('loading');
        loadPpfgCurves(wellbore.geo_well_id)
            .then((curves) => {
                if (!live) return;
                const rows = buildMudWindow(curves, gridMeterStations, { kbElevM: wellbore.kb_elev_m || 0 });
                setPpfg(rows.length ? { rows, summary: mudWindowSummary(rows) } : 'none');
            })
            .catch(() => { if (live) setPpfg('none'); });
        return () => { live = false; };
    }, [showPpfg, wellbore?.geo_well_id, gridMeterStations, wellbore?.kb_elev_m]);

    const handleExport = (format) => {
        if (!gridMeterStations) return;
        try {
            const contract = buildTrajectoryContract({
                site, wellbore, design, stations: gridMeterStations, magRef,
                generatedAt: new Date().toISOString(),
            });
            const fmt = exportFormats(contract, `${wellbore?.name || 'well'}-${design?.name || 'design'}`)
                .find((f) => f.id === format);
            const data = fmt.make();
            const blob = new Blob([data], { type: fmt.mime });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fmt.filename;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Export failed', description: e.message });
        }
    };

    const getGeoCoords = useCallback((easting, northing) => {
        if (!site?.crs || !isTransformableTag(site.crs)) return null;
        try {
            const { lon, lat } = toLonLat(site.crs, easting, northing);
            return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
        } catch (e) { return null; }
    }, [site?.crs]);

    // Azimuths are entered in the wellbore's azimuth reference; the
    // compile runs in grid (WD3 chain: magnetic + declination + grid
    // convergence, per the validated toGridAzimuths convention). A
    // non-grid reference with no cached angles falls back to grid,
    // loudly.
    const aziRef = wellbore?.azimuth_reference || 'grid';
    const aziDelta = useMemo(() => {
        try { return gridAzimuthDelta(aziRef, wellbore); } catch (e) { return null; }
    }, [aziRef, wellbore]);
    const aziRefWarning = aziRef !== 'grid' && aziDelta == null
        ? `The wellbore's azimuth reference is ${aziRef} north but its cached convergence/declination is missing. Re-save the wellbore (with a site CRS) to cache them; azimuths are treated as grid until then.`
        : null;

    const calculateTrajectory = useCallback(() => {
        if (!segments.length) { setPlanRows(null); setStations(null); setPlanSpans(null); return; }
        const tieOn = { md: 0, inc: 0, azi: (parseFloat(kickoffAzi) || 0) + (aziDelta || 0) };
        // UI segments -> compiler segments (same skip rule as before;
        // Inc Azi MD rows resolve to one arc from the incoming attitude).
        const resolved = resolvePlan(segments, { mdUnit, tieOn, aziDelta: aziDelta || 0 });
        setPlanSpans(resolved.spans);
        try {
            const compiled = compileSegments({
                mdUnit,
                tieOn,
                maxDls: parseFloat(constraints.maxDLS) || null,
                subdivideMd: stationInterval,
                segments: resolved.compilerSegments,
                kb: kbUser,
            });
            setPlanRows(compiled.table);
            setStations(compiled.stations);
            setQaResult(compiled.qa);
            setCompileError(resolved.errors.length ? resolved.errors.join(' ') : null);
        } catch (e) {
            setPlanRows(null);
            setStations(null);
            setQaResult(null);
            setCompileError(e.message);
        }
    }, [segments, kickoffAzi, kbUser, constraints.maxDLS, stationInterval, mdUnit, aziDelta]);

    useEffect(() => {
        const timer = setTimeout(calculateTrajectory, 300);
        return () => clearTimeout(timer);
    }, [calculateTrajectory]);

    const handleSaveDesign = async () => {
        if (!design || !stations) return;
        setSaving(true);
        try {
            await updateDesign(design.id, {
                segments,
                tie_on: { md: 0, inc: 0, azi: parseFloat(kickoffAzi) || 0 },
                // Station cache in metres (registry convention).
                stations: stations.map((s) => ({
                    md: userToMeters(s.md), inc: s.inc, azi: s.azi,
                })),
                engine_version: ENGINE_VERSION,
            });
            const after = await refreshDesigns(wellbore.id);
            // Tester fix 2026-09-07: the other Drilling studios read the definitive design first;
            // a saved draft now works there as the latest plan, but say how to promote it.
            const hasDefinitive = (Array.isArray(after) ? after : designs || []).some((d) => d.status === 'definitive');
            toast({
                title: 'Design saved',
                description: hasDefinitive
                    ? `${design.name} r${design.revision} updated.`
                    : `${design.name} r${design.revision} updated. It is a draft: the other Drilling studios will use it as the latest plan; Set definitive (design menu in the tree) makes it the plan of record.`,
                className: 'bg-green-600 text-white',
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    // Every segment change goes through here: one history step (typing
    // bursts on one field fold together) and the localStorage draft.
    const commitSegments = (next, { coalesceKey, kickoffAzi: nextAzi, prevKickoffAzi } = {}) => {
        if (next === segments) return;
        dispatchPlan({
            type: 'commit', coalesceKey, at: Date.now(),
            value: { segments: next, kickoffAzi: nextAzi, prevKickoffAzi },
        });
        updateTrajectoryDraft({ segments: next });
    };

    // Undo/redo restore the segments; a solver apply that also moved the
    // KO azimuth restores that too.
    const stepHistory = (dir) => {
        const target = dir === 'undo'
            ? planHistory.past[planHistory.past.length - 1]
            : planHistory.future[0];
        if (!target) return;
        dispatchPlan({ type: dir });
        const patch = { segments: target.segments };
        const azi = dir === 'undo' ? planHistory.present.prevKickoffAzi : target.kickoffAzi;
        if (azi !== undefined) { setKickoffAzi(azi); patch.kickoffAzi = azi; }
        updateTrajectoryDraft(patch);
    };
    const stepHistoryRef = useRef(stepHistory);
    stepHistoryRef.current = stepHistory;

    const handleDragEnd = (result) => {
        if (!result.destination) return;
        commitSegments(moveSegment(segments, result.source.index, result.destination.index));
    };

    const updateSegment = (index, field, value) => {
        const newSegments = [...segments];
        // A hand edit ends what the solver's note ("Vertical to target")
        // said about the segment.
        const { note, ...rest } = newSegments[index];
        newSegments[index] = { ...rest, [field]: value };
        commitSegments(newSegments, { coalesceKey: `${newSegments[index].id ?? index}:${field}` });
    };

    const addSegment = () => {
        const id = makeSegmentId();
        commitSegments([...segments, { id, type: 'Hold', length: 100, buildRate: 0, turnRate: 0 }]);
    };

    const removeSegment = (index) => {
        commitSegments(deleteSegment(segments, index));
    };

    // The design-method solvers live in engines/drilling profileDesign;
    // SolverDialog returns compiler-ready UI segments plus the mode.
    const handleSolverApply = ({ segments: solved, kickoffAzi: azi, mode }) => {
        const next = mode === 'append' ? [...segments, ...solved] : solved;
        const patch = { segments: next };
        const step = {};
        if (azi != null && mode !== 'append') {
            // Solvers work in grid azimuths; the KO Azi field is in the
            // wellbore's azimuth reference.
            const refAzi = +(((azi - (aziDelta || 0)) % 360 + 360) % 360).toFixed(2);
            step.kickoffAzi = refAzi;
            step.prevKickoffAzi = kickoffAzi;
            setKickoffAzi(refAzi);
            patch.kickoffAzi = refAzi;
        }
        dispatchPlan({ type: 'commit', at: Date.now(), value: { segments: next, ...step } });
        updateTrajectoryDraft(patch);
    };

    // Attitude and position at the current design end (user units,
    // wellhead-relative) for the append-mode solvers.
    const currentEnd = useMemo(() => {
        if (!planRows || planRows.length < 2) return null;
        const last = planRows[planRows.length - 1];
        return { inc: last.inc, azi: last.azi, n: last.n, e: last.e, tvd: last.tvd, md: last.md };
    }, [planRows]);

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
        a.download = `${wellbore?.name || 'well'}-${design?.name || 'design'}-survey.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const planSummary = useMemo(() => {
        if (!planRows || planRows.length < 2) return null;
        const last = planRows[planRows.length - 1];
        const bh = getGeoCoords(headX + userToMeters(last.e), headY + userToMeters(last.n));
        return {
            totalMD: last.md,
            totalTVD: last.tvd,
            horizontalDisplacement: last.closureDist,
            // reduce, not Math.max(...rows): the spread is a call with one
            // argument per station, and a long plan overflows the stack
            // (RangeError: Maximum call stack size exceeded).
            maxInclination: planRows.reduce((m, s) => (s.inc > m ? s.inc : m), -Infinity),
            maxDLS: planRows.reduce((m, s) => {
                const d = mdUnit === 'ft' ? s.dls100ft : s.dls30m;
                return d > m ? d : m;
            }, -Infinity),
            bottomHole: bh,
        };
    }, [planRows, headX, headY, userToMeters, mdUnit, getGeoCoords]);

    // Targets in wellhead-relative offsets in the wellbore unit, through
    // the one conversion the solver uses too (services/targetFrame.js).
    // Targets that cannot be placed are listed, never drawn.
    const targetFrame = useMemo(
        () => targetsToChart(siteTargets || [], { wellhead, mdUnit, kbM: wellbore?.kb_elev_m || 0 }),
        [siteTargets, wellhead, mdUnit, wellbore],
    );
    const chartTargets = targetFrame.rows;
    const targetProblems = targetFrame.problems;

    const chartSlots = useMemo(() => {
        const slots = Array.isArray(site?.slots) ? site.slots : [];
        if (site?.origin_x == null || !wellhead) return [];
        return slots.map((s) => ({
            name: s.name,
            e: metersToUser(site.origin_x + (s.dx_m || 0) - headX),
            n: metersToUser(site.origin_y + (s.dy_m || 0) - headY),
        }));
    }, [site, wellhead, headX, headY, metersToUser]);

    const chartLeaseLines = useMemo(() => {
        const lines = Array.isArray(site?.lease_lines) ? site.lease_lines : [];
        if (!wellhead) return [];
        return lines.map((l) => ({
            kind: l.kind,
            points: (l.points || []).map(([px, py]) => [
                metersToUser(px - headX), metersToUser(py - headY),
            ]),
        }));
    }, [site, wellhead, headX, headY, metersToUser]);

    const vsAzimuthDeg = planRows && planRows.length > 1
        ? planRows[planRows.length - 1].closureAzi : null;

    // Targets projected into the section frame: VS is the N/E offset
    // projected onto the same VS azimuth the survey rows use.
    const sectionTargets = useMemo(() => {
        if (!Number.isFinite(vsAzimuthDeg)) return [];
        const az = (vsAzimuthDeg * Math.PI) / 180;
        return chartTargets
            .filter((t) => Number.isFinite(t.tvd))
            .map((t) => ({
                id: t.id, name: t.name, tvd: t.tvd,
                vs: t.n * Math.cos(az) + t.e * Math.sin(az),
            }));
    }, [chartTargets, vsAzimuthDeg]);

    // DLS colour scale: the design's Max DLS is the reference (segments
    // above it are flagged); with none set the ramp runs to the plan max.
    const dlsScale = useMemo(() => {
        if (!showDlsColor) return null;
        const maxDls = parseFloat(constraints.maxDLS);
        return {
            key: mdUnit === 'ft' ? 'dls100ft' : 'dls30m',
            unitLabel: `deg/${mdUnit === 'ft' ? '100ft' : '30m'}`,
            maxDls: Number.isFinite(maxDls) && maxDls > 0 ? maxDls : null,
            scaleMax: planSummary?.maxDLS ?? null,
        };
    }, [showDlsColor, constraints.maxDLS, mdUnit, planSummary]);

    const eouSectionOverlays = useMemo(() => (uncertainty?.band ? [
        { name: 'TVD −2σ', rows: uncertainty.band.up, color: '#0284c7', dash: '3 3' },
        { name: 'TVD +2σ', rows: uncertainty.band.down, color: '#0284c7', dash: '3 3' },
    ] : []), [uncertainty]);

    // Plan Editor rows: a view of `segments` (defining inputs) and the
    // compiled survey (computed cells), one row per section end.
    const planTableRows = useMemo(() => (planSpans ? derivePlanTable({
        segments, spans: planSpans, planRows, mdUnit, aziDelta: aziDelta || 0, targets: chartTargets,
    }) : []), [segments, planSpans, planRows, mdUnit, aziDelta, chartTargets]);

    // Segments a table edit replaced lose the solver's note, as a hand
    // edit in the segment list does.
    const dropChangedNotes = (next) => next.map((seg, i) => {
        if (seg === segments[i] || !seg?.note) return seg;
        const { note, ...rest } = seg;
        return rest;
    });

    const handlePlanEdit = (row, field, text) => {
        try {
            commitSegments(dropChangedNotes(applyPlanEdit(segments, row, field, text)));
            return true;
        } catch (e) {
            toast({ variant: 'destructive', title: 'Not applied', description: e.message });
            return false;
        }
    };
    const handleTypeChange = (index, type) => {
        const row = planTableRows.find((r) => r.segIndex === index) || null;
        commitSegments(dropChangedNotes(changeSegmentType(segments, index, type, row)));
    };

    // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo. Text fields keep
    // their own native undo while focused.
    const designEditable = design?.status === 'draft';
    useEffect(() => {
        if (!designEditable) return undefined;
        const onKey = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const k = e.key.toLowerCase();
            if (k !== 'z' && k !== 'y') return;
            const el = e.target;
            if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
            e.preventDefault();
            stepHistoryRef.current(k === 'y' || e.shiftKey ? 'redo' : 'undo');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [designEditable]);

    if (!design) {
        return (
            <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
                Select a design in the tree, or create one from a wellbore's menu.
            </div>
        );
    }

    const readOnly = design.status !== 'draft';

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-4">
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="w-full lg:w-[400px] flex flex-col bg-slate-900 border-r border-slate-800 rounded-lg overflow-hidden shrink-0">
                <div className="p-4 border-b border-slate-800 bg-slate-900 z-10 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-lime-400" />
                        {design.name} <span className="ml-2 text-xs font-normal text-slate-500">r{design.revision} {design.status !== 'draft' ? `(${design.status})` : ''}</span>
                    </h2>
                    <Button size="sm" onClick={handleSaveDesign} disabled={saving || readOnly || !stations} title={readOnly ? 'Definitive and archived designs are read-only; duplicate as a new revision to edit.' : 'Save design'} className="h-7 bg-[#4CAF50] hover:bg-[#43a047] text-white text-xs">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Save
                    </Button>
                </div>

                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-6">
                        {readOnly && (
                            <div className="rounded-md border border-amber-800/50 bg-amber-900/15 px-3 py-2 text-xs text-amber-300">
                                This design is {design.status}. Duplicate it as a new revision from the tree to make changes.
                            </div>
                        )}
                        <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                            <Label className="text-slate-400 text-xs uppercase font-bold">Design Settings</Label>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <div><Label className="text-[10px]">Station every ({mdUnit})</Label><Input type="number" min="1" step="1" value={constraints.stationInterval ?? defaultStationInterval} data-testid="design-station-interval" title="Survey listing interval: a station is emitted every this many depth units along holds and curves (the trajectory itself does not change)" onChange={e => { setConstraints({ ...constraints, stationInterval: e.target.value }); updateTrajectoryDraft({ constraints: { ...constraints, stationInterval: e.target.value } }); }} className="h-7 bg-slate-900 text-xs" disabled={readOnly} /></div>
                                <div><Label className="text-[10px]">Max DLS (/{mdUnit === 'ft' ? '100ft' : '30m'})</Label><Input type="number" value={constraints.maxDLS} onChange={e => { setConstraints({ ...constraints, maxDLS: e.target.value }); updateTrajectoryDraft({ constraints: { ...constraints, maxDLS: e.target.value } }); }} className="h-7 bg-slate-900 text-xs" disabled={readOnly} /></div>
                                <div><Label className="text-[10px]">Vertical tol (m)</Label><Input type="number" min="0" max={MAX_VERTICAL_TOLERANCE_M} step="0.1" value={constraints.verticalTolM ?? DEFAULT_VERTICAL_TOLERANCE_M} data-testid="design-vertical-tolerance" title="A target within this horizontal distance of straight below the design end is designed as a vertical hold, with every design method" onChange={e => { setConstraints({ ...constraints, verticalTolM: e.target.value }); updateTrajectoryDraft({ constraints: { ...constraints, verticalTolM: e.target.value } }); }} className="h-7 bg-slate-900 text-xs" disabled={readOnly} /></div>
                                <div><Label className="text-[10px]">KO Azi (deg {aziRef})</Label><Input type="number" value={kickoffAzi} onChange={e => { setKickoffAzi(e.target.value); updateTrajectoryDraft({ kickoffAzi: parseFloat(e.target.value) || 0 }); }} className="h-7 bg-slate-900 text-xs" disabled={readOnly} /></div>
                                <div className="flex items-end">
                                    {!readOnly && (
                                        <Button size="sm" onClick={() => setSolverOpen(true)} className="h-7 w-full bg-lime-600 hover:bg-lime-700 text-white text-xs" data-testid="open-solver">
                                            <Wand2 className="mr-1 h-3 w-3" /> Design methods
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <Button size="sm" variant="outline" onClick={() => setProgramOpen(true)} className="h-7 flex-1 border-slate-700 text-slate-300 text-xs" data-testid="open-survey-program">
                                    Survey program{programIntervals ? ` (${programIntervals.length})` : ''}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setShowEou((v) => !v)}
                                    className={`h-7 flex-1 border-slate-700 text-xs ${showEou ? 'text-sky-300' : 'text-slate-500'}`}
                                    title={magRef ? 'Ellipse-of-uncertainty overlay (ISCWSA MWD Rev4, 2 sigma)' : 'Needs a geomagnetic reference: re-save the wellbore with a transformable site CRS.'}>
                                    EOU {showEou && uncertainty ? 'on (2σ)' : 'off'}
                                </Button>
                            </div>
                            {showEou && !magRef && (
                                <p className="text-[10px] text-amber-400">
                                    Uncertainty needs a geomagnetic reference. Re-save the wellbore (with a transformable site CRS) to cache its magnetic model.
                                </p>
                            )}
                            <p className="text-[10px] text-slate-500">
                                Wellhead {Number.isFinite(wellbore?.head_x) ? `${wellbore.head_x.toFixed(1)} E, ${wellbore.head_y.toFixed(1)} N` : 'not set'}
                                {Number.isFinite(wellbore?.grid_convergence_deg) ? ` | convergence ${Number(wellbore.grid_convergence_deg).toFixed(3)} deg` : ''}
                                {Number.isFinite(wellbore?.mag_declination_deg) ? ` | declination ${Number(wellbore.mag_declination_deg).toFixed(3)} deg` : ''}
                                {` | KB ${kbUser.toFixed(1)} ${depthUnitLabel}`}
                            </p>
                            {aziRefWarning && (
                                <p className="text-[10px] text-amber-400">{aziRefWarning}</p>
                            )}
                        </div>

                        {(
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-slate-400 text-xs uppercase font-bold">Segments</Label>
                                    {!readOnly && (
                                        <div className="flex items-center gap-1">
                                            <Button size="sm" variant="ghost" onClick={() => stepHistory('undo')} disabled={!planHistory.past.length} className="h-6 w-6 p-0 hover:bg-slate-800" title="Undo (Ctrl+Z)" data-testid="segments-undo"><Undo2 className="w-3.5 h-3.5 text-slate-300" /></Button>
                                            <Button size="sm" variant="ghost" onClick={() => stepHistory('redo')} disabled={!planHistory.future.length} className="h-6 w-6 p-0 hover:bg-slate-800" title="Redo (Ctrl+Shift+Z)" data-testid="segments-redo"><Redo2 className="w-3.5 h-3.5 text-slate-300" /></Button>
                                            <Button size="sm" variant="ghost" onClick={addSegment} className="h-6 w-6 p-0 hover:bg-slate-800" title="Add a segment"><Plus className="w-4 h-4 text-lime-400" /></Button>
                                        </div>
                                    )}
                                </div>

                                <DragDropContext onDragEnd={handleDragEnd}>
                                    <Droppable droppableId="segments">
                                        {(provided) => (
                                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                                {segments.map((seg, index) => (
                                                    <Draggable key={seg.id || index} draggableId={String(seg.id || index)} index={index} isDragDisabled={readOnly}>
                                                        {(dragProvided) => (
                                                            <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} className="bg-slate-800 border border-slate-700 rounded p-2 text-xs group">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <div {...dragProvided.dragHandleProps} className="cursor-grab text-slate-600 hover:text-slate-400"><GripVertical className="w-4 h-4" /></div>
                                                                    <span className="font-bold text-lime-400">#{index + 1}</span>
                                                                    <Select value={seg.type} onValueChange={(v) => handleTypeChange(index, v)} disabled={readOnly}>
                                                                        <SelectTrigger className="h-6 w-24 bg-slate-900 border-none text-[10px]"><SelectValue /></SelectTrigger>
                                                                        <SelectContent className="bg-slate-800">{SEGMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t === 'Build' ? 'Build' : SEGMENT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                                                                    </Select>
                                                                    {seg.note && <span className="truncate rounded bg-lime-900/40 px-1.5 py-0.5 text-[10px] text-lime-300" data-testid="segment-note" title={seg.note}>{seg.note}</span>}
                                                                    {!readOnly && <Button variant="ghost" size="icon" onClick={() => removeSegment(index)} className="ml-auto h-5 w-5 text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></Button>}
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2 pl-6">
                                                                    {seg.type === 'IncAziMD' ? (
                                                                        <>
                                                                            <div className="flex items-center justify-between"><span className="text-slate-500">MD:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.md ?? ''} onChange={(e) => updateSegment(index, 'md', e.target.value)} disabled={readOnly} data-testid={`seg-${index}-md`} /></div>
                                                                            <div className="flex items-center justify-between"><span className="text-slate-500">Inc:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.inc ?? ''} onChange={(e) => updateSegment(index, 'inc', e.target.value)} disabled={readOnly} data-testid={`seg-${index}-inc`} /></div>
                                                                            <div className="flex items-center justify-between"><span className="text-slate-500">Azi:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.azi ?? ''} onChange={(e) => updateSegment(index, 'azi', e.target.value)} disabled={readOnly} data-testid={`seg-${index}-azi`} title={`Azimuth in the wellbore's ${aziRef} reference`} /></div>
                                                                        </>
                                                                    ) : (
                                                                    <div className="flex items-center justify-between"><span className="text-slate-500">Len:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.length} onChange={(e) => updateSegment(index, 'length', e.target.value)} disabled={readOnly} /></div>
                                                                    )}
                                                                    {(seg.type === 'Build' || seg.type === 'Turn') && <div className="flex items-center justify-between"><span className="text-slate-500">{seg.type === 'Turn' ? 'TR' : 'BR'}:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.type === 'Turn' ? seg.turnRate : seg.buildRate} onChange={(e) => updateSegment(index, seg.type === 'Turn' ? 'turnRate' : 'buildRate', e.target.value)} disabled={readOnly} /></div>}
                                                                    {seg.type === 'ToolfaceArc' && (
                                                                        <>
                                                                            <div className="flex items-center justify-between"><span className="text-slate-500">DLS:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.dls} onChange={(e) => updateSegment(index, 'dls', e.target.value)} disabled={readOnly} /></div>
                                                                            <div className="flex items-center justify-between"><span className="text-slate-500">TF:</span><Input type="number" className="h-6 w-16 bg-slate-900 text-right px-1 text-[10px]" value={seg.toolface} onChange={(e) => updateSegment(index, 'toolface', e.target.value)} disabled={readOnly} /></div>
                                                                        </>
                                                                    )}
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

            <div className="flex-1 flex flex-col min-w-0 gap-4">
                <TrajectoryKPIs summary={planSummary} qc={qaResult} depthUnit={depthUnitLabel} />

                {compileError && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-900/40 bg-red-900/15 px-3 py-2 text-xs text-red-300">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {compileError}
                    </div>
                )}
                {showTargets && targetProblems.length > 0 && (
                    <div className="rounded-lg border border-amber-800/50 bg-amber-900/15 px-3 py-2 text-xs text-amber-300" data-testid="design-target-problems">
                        <div className="flex items-center gap-2 font-medium">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {targetProblems.length === (siteTargets || []).length
                                ? 'No target can be placed relative to this wellhead.'
                                : `${targetProblems.length} of ${(siteTargets || []).length} targets cannot be placed and are not drawn.`}
                        </div>
                        <ul className="mt-1 space-y-0.5 pl-6 list-disc">
                            {targetProblems.slice(0, 4).map((p) => (
                                <li key={p.id || p.name}>{p.error}</li>
                            ))}
                            {targetProblems.length > 4 && <li>and {targetProblems.length - 4} more.</li>}
                        </ul>
                    </div>
                )}

                <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 flex flex-col overflow-hidden relative">
                    <div className="flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900/90 backdrop-blur z-10 absolute top-0 left-0 right-0">
                        <div className="flex bg-slate-800 rounded p-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('section')} className={`h-7 px-3 text-xs ${viewMode === 'section' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><Activity className="w-3 h-3 mr-1" /> Section</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('plots')} className={`h-7 px-3 text-xs ${viewMode === 'plots' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><LayoutGrid className="w-3 h-3 mr-1" /> Plots</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('plan')} className={`h-7 px-3 text-xs ${viewMode === 'plan' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`} data-testid="view-plan" title="Plan editor: one row per section, edit the defining values in place"><TableProperties className="w-3 h-3 mr-1" /> Plan</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('table')} className={`h-7 px-3 text-xs ${viewMode === 'table' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}><TableIcon className="w-3 h-3 mr-1" /> Survey</Button>
                            <Button variant="ghost" size="sm" onClick={() => setViewMode('3d')} className={`h-7 px-3 text-xs ${viewMode === '3d' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`} data-testid="view-3d"><Box className="w-3 h-3 mr-1" /> 3D</Button>
                        </div>
                        <div className="flex items-center gap-2">
                            {(viewMode === 'section' || viewMode === 'plots') && (
                                <Button size="sm" variant="ghost" onClick={() => setShowTargets((v) => !v)}
                                    className={`h-7 px-2 text-xs ${showTargets ? 'bg-slate-700 text-amber-300' : 'text-slate-400'}`}
                                    title="Show site targets on the section and plan views">
                                    <Target className="w-3 h-3 mr-1" /> Targets
                                </Button>
                            )}
                            {(viewMode === 'section' || viewMode === 'plots') && (
                                <Button size="sm" variant="ghost" onClick={() => setShowDlsColor((v) => !v)}
                                    className={`h-7 px-2 text-xs ${showDlsColor ? 'bg-slate-700 text-lime-300' : 'text-slate-400'}`}
                                    data-testid="toggle-dls-colour"
                                    title="Colour the path by dogleg severity on the section and plan views; segments above the design's Max DLS are flagged in red">
                                    DLS colour
                                </Button>
                            )}
                            {viewMode === 'section' && (
                                <Button size="sm" variant="ghost" onClick={() => setShowPpfg((v) => !v)}
                                    className={`h-7 px-2 text-xs ${showPpfg ? 'bg-slate-700 text-sky-300' : 'text-slate-400'}`}
                                    title={wellbore?.geo_well_id ? 'Pore/frac mud window from the bridged registry well' : 'Needs a bridged registry well with a published PPFG prognosis (publish this design, then run Pore Pressure Studio on it).'}>
                                    PPFG
                                </Button>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" disabled={!planRows} className="h-7 bg-lime-600 hover:bg-lime-700 text-white text-xs" data-testid="export-menu">
                                        <Download className="w-3 h-3 mr-1" /> Export
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-slate-800 text-white border-slate-700">
                                    <DropdownMenuItem className="text-xs" onClick={handleExportCsv}>Survey CSV ({depthUnitLabel}, quick)</DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs" onClick={() => handleExport('json')}>Trajectory contract (JSON)</DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs" onClick={() => handleExport('csv')}>Trajectory CSV (m, full)</DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs" onClick={() => handleExport('xlsx')}>Excel workbook</DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs" onClick={() => handleExport('dxf')}>DXF (CAD wellpath)</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button size="sm" onClick={() => setPublishOpen(true)}
                                disabled={!Array.isArray(design?.stations) || design.stations.length < 2}
                                title={Array.isArray(design?.stations) && design.stations.length >= 2 ? 'Publish this design to the geo_wells registry (Seismolord, correlation, petrophysics)' : 'Save the design first — publishing uses the saved station cache.'}
                                className="h-7 bg-sky-700 hover:bg-sky-600 text-white text-xs" data-testid="open-publish">
                                <Share2 className="w-3 h-3 mr-1" /> Publish
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 pt-12 relative">
                        {viewMode === 'section' && planRows && (
                            <div className="flex h-full w-full bg-white">
                                <div className="min-w-0 flex-1">
                                    <SectionViewPanel rows={planRows} unit={depthUnitLabel} vsAzimuthDeg={vsAzimuthDeg} overlays={eouSectionOverlays} targets={showTargets ? sectionTargets : []} exaggeration={sectionEx} onExaggerationChange={setSectionEx} dlsScale={dlsScale} />
                                </div>
                                {showPpfg && (
                                    <div className="w-[340px] shrink-0 border-l border-slate-200">
                                        {ppfg === 'loading' && (
                                            <div className="flex h-full items-center justify-center text-xs text-slate-500">
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading PPFG curves…
                                            </div>
                                        )}
                                        {ppfg === 'none' && (
                                            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-500">
                                                {wellbore?.geo_well_id
                                                    ? 'No PPFG prognosis on the bridged registry well. Run Pore Pressure Studio on it and publish the PP/FP curves.'
                                                    : 'No bridged registry well. Publish this design first, then run Pore Pressure Studio on the published well.'}
                                            </div>
                                        )}
                                        {ppfg && typeof ppfg === 'object' && (
                                            <MudWindowPanel rows={ppfg.rows} summary={ppfg.summary} sourceLabel="registry PPFG" />
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {viewMode === '3d' && gridMeterStations && (
                            <WellpathCubeView
                                wells={cubeWells}
                                targets={siteTargets || []}
                                tops={cubeTops}
                                background="light"
                            />
                        )}

                        {viewMode === 'plots' && planRows && (
                            <div className="grid grid-cols-2 grid-rows-2 gap-px bg-slate-800 h-full w-full">
                                <PlanViewChart rows={planRows} targets={showTargets ? chartTargets : []} slots={chartSlots} leaseLines={chartLeaseLines} unit={depthUnitLabel} ellipses={uncertainty?.ellipses || []} dlsScale={dlsScale} />
                                <SectionViewPanel rows={planRows} unit={depthUnitLabel} vsAzimuthDeg={vsAzimuthDeg} overlays={eouSectionOverlays} targets={showTargets ? sectionTargets : []} exaggeration={sectionEx} onExaggerationChange={setSectionEx} dlsScale={dlsScale} />
                                <InclinationPanel rows={planRows} unit={depthUnitLabel} />
                                <DlsPanel rows={planRows} unit={depthUnitLabel} />
                            </div>
                        )}

                        {viewMode === 'plan' && (
                            <div className="absolute inset-0 top-12 bg-slate-900">
                                <PlanEditorTable
                                    rows={planTableRows}
                                    readOnly={readOnly}
                                    mdUnit={mdUnit}
                                    aziRef={aziRef}
                                    onEdit={handlePlanEdit}
                                    onChangeType={(row, type) => handleTypeChange(row.segIndex, type)}
                                    onInsert={(at) => commitSegments(insertSegment(segments, at, { mdUnit }))}
                                    onDelete={(index) => commitSegments(deleteSegment(segments, index))}
                                    onUndo={() => stepHistory('undo')}
                                    onRedo={() => stepHistory('redo')}
                                    canUndo={planHistory.past.length > 0}
                                    canRedo={planHistory.future.length > 0}
                                />
                            </div>
                        )}

                        {viewMode === 'table' && planRows && (
                            <div className="absolute inset-0 top-12 overflow-auto bg-slate-900" data-testid="design-survey-table">
                                <Table>
                                    <TableHeader className="bg-slate-800 sticky top-0">
                                        <TableRow className="border-slate-700">
                                            <TableHead className="text-slate-300">MD ({depthUnitLabel})</TableHead>
                                            <TableHead className="text-slate-300">Inc (deg)</TableHead>
                                            <TableHead className="text-slate-300">Azi grid (deg)</TableHead>
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

            <PublishDialog
                open={publishOpen}
                onOpenChange={setPublishOpen}
                site={site}
                wellbore={wellbore}
                design={design}
                stations={design?.stations || []}
                source="plan"
                onPublished={() => { refreshDesigns(wellbore.id); refreshWellbores(site.id); }}
            />

            <SurveyProgramEditor
                open={programOpen}
                onOpenChange={setProgramOpen}
                design={design}
                tdMdM={stations && stations.length ? userToMeters(stations[stations.length - 1].md) : null}
                mdUnit={mdUnit}
                userId={user?.id}
                onSaved={(intervals) => setProgramIntervals(intervals)}
            />

            <SolverDialog
                open={solverOpen}
                onOpenChange={setSolverOpen}
                targets={siteTargets || []}
                wellbore={wellbore}
                site={site}
                mdUnit={mdUnit}
                kbM={wellbore?.kb_elev_m || 0}
                currentEnd={currentEnd}
                verticalToleranceM={verticalToleranceM}
                onApply={handleSolverApply}
            />
        </div>
    );
};

export default DesignTab;
