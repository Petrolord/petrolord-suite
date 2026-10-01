
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useBasinFlow, stampRun } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { useMultiWell } from '@/pages/apps/BasinFlowGenesis/contexts/MultiWellContext';
import { CalibrationCalculator } from '@/pages/apps/BasinFlowGenesis/services/CalibrationCalculator';
import { HeatFlowFitter } from '@/pages/apps/BasinFlowGenesis/services/HeatFlowFitter';
import { SimulationEngine } from '@/pages/apps/BasinFlowGenesis/services/SimulationEngine';
import { calibrationProfile } from '@/pages/apps/BasinFlowGenesis/services/resultsView';
import { presentDayHeatFlow } from '@/pages/apps/BasinFlowGenesis/services/history';
import { Save, Download, TrendingUp, FileText, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ResidualPlot from '../plots/ResidualPlot';
import CalibrationProfilePlot from '../plots/CalibrationProfilePlot';
import CalibrationPointsEditor from './CalibrationPointsEditor';
import RunNotes, { resultState } from '../common/RunNotes';
import { calibrationCoverage, fitAtBound } from '@/pages/apps/BasinFlowGenesis/services/honesty';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { BHT_METHODS, correctedTemperatures, bhtMethodText } from '@/pages/apps/BasinFlowGenesis/services/bht';
import { basinReportPdf } from '@/pages/apps/BasinFlowGenesis/services/report';
import { depthToDisplay, tempToDisplay, tempDeltaToDisplay, depthLabel, tempLabel, tempSymbol } from '@/pages/apps/BasinFlowGenesis/services/units';

const CalibrationView = () => {
    const { state, dispatch, runSimulation, units } = useBasinFlow();
    const zU = units.depth; const tU = units.temp;
    const zD = (m) => depthToDisplay(m, zU);
    const tD = (c) => tempToDisplay(c, tU);
    const { updateWell, state: mwState } = useMultiWell();
    const { toast } = useToast();

    const [roPoints, setRoPoints] = useState(state.calibration?.ro || [
        { id: 1, depth: 2000, value: 0.55 },
        { id: 2, depth: 3500, value: 1.15 }
    ]);

    const [bhtPoints, setBhtPoints] = useState(state.calibration?.temp || [
        { id: 1, depth: 1500, value: 65 },
        { id: 2, depth: 3000, value: 110 }
    ]);

    // BF-U2-006: the temperatures compared are the corrected BHTs (raw kept)
    const bht = state.calibration?.bht || { method: 'none', circulationH: null };
    const corrected = useMemo(() => correctedTemperatures({ temp: bhtPoints, bht }), [bhtPoints, bht.method, bht.circulationH]); // eslint-disable-line react-hooks/exhaustive-deps
    const tempPoints = corrected.points;
    const setBht = (patch) => dispatch({ type: 'SET_CALIBRATION_DATA', payload: { bht: { ...bht, ...patch } } });

    const [isFitting, setIsFitting] = useState(false);
    const [fitNote, setFitNote] = useState(null);

    useEffect(() => {
        if (state.calibration) {
            setRoPoints(state.calibration.ro || []);
            setBhtPoints(state.calibration.temp || []);
        }
    }, [state.calibration]);

    // Present-day modelled profile, shallow to deep. U2-004: through the
    // whole column (slices about 100 m thick), so a point inside a thick
    // layer meets the Ro at its own depth; layer centres for older results.
    const modelProfiles = useMemo(() => {
        const prof = calibrationProfile(state.results);
        return {
            depths: prof.map(p => p.depth),
            ro: prof.map(p => p.ro),
            temp: prof.map(p => p.temp),
        };
    }, [state.results]);

    // BF-U1-013: with no result there is no misfit (it read 0.000 in green)
    const stats = useMemo(() => {
        if(modelProfiles.depths.length === 0) return { roRMS: NaN, tempRMS: NaN, roR2: NaN, residualsRo: [], residualsTemp: [], none: true };

        const modeledRoAtPts = CalibrationCalculator.interpolateToMeasured(
            modelProfiles.depths,
            modelProfiles.ro,
            roPoints.map(p => p.depth)
        );

        const modeledTempAtPts = CalibrationCalculator.interpolateToMeasured(
            modelProfiles.depths,
            modelProfiles.temp,
            tempPoints.map(p => p.depth)
        );

        return {
            roRMS: roPoints.length ? CalibrationCalculator.calculateRMS(roPoints.map(p => p.value), modeledRoAtPts) : NaN,
            tempRMS: tempPoints.length ? CalibrationCalculator.calculateRMS(tempPoints.map(p => p.value), modeledTempAtPts) : NaN,
            roR2: roPoints.length > 1 ? CalibrationCalculator.calculateR2(roPoints.map(p => p.value), modeledRoAtPts) : NaN,
            residualsRo: roPoints.map((p, i) => ({ depth: p.depth, residual: p.value - modeledRoAtPts[i] })),
            residualsTemp: tempPoints.map((p, i) => ({ depth: p.depth, residual: p.value - modeledTempAtPts[i] }))
        };
    }, [modelProfiles, roPoints, tempPoints]);

    // the slider edits the present-day value; a history is shifted so its
    // youngest point lands on the slider (the shape is kept)
    const handleParameterChange = (param, value) => {
        if (param !== 'heatFlow') return;
        if (state.heatFlow?.type === 'variable' && state.heatFlow.history?.length) {
            const shift = value - presentDayHeatFlow(state.heatFlow);
            dispatch({ type: 'UPDATE_HEAT_FLOW', payload: { value, history: state.heatFlow.history.map((p) => ({ ...p, value: p.value + shift })) } });
        } else {
            dispatch({ type: 'UPDATE_HEAT_FLOW', payload: { value } });
        }
    };

    const handleAutoCalibrate = async () => {
        if (roPoints.length === 0 && bhtPoints.length === 0) {
            toast({ variant: "destructive", title: "No Data", description: "Add calibration points before auto-fitting." });
            return;
        }
        setIsFitting(true);
        toast({ title: "Auto-calibration started", description: "Optimizing heat flow against the calibration data..." });
        try {
            const fitted = await HeatFlowFitter.fit(state, roPoints, tempPoints);
            dispatch({ type: 'UPDATE_HEAT_FLOW', payload: fitted.heatFlow });
            await runSimulationWith(fitted.heatFlow);
            // BF-U1-013: a fit on the search bound is not a fit; say so
            const variable = state.heatFlow?.type === 'variable';
            const x = variable ? (fitted.heatFlow.value / (state.heatFlow.value || 60)) : fitted.heatFlow.value;
            const bound = fitAtBound(x, HeatFlowFitter.bounds(state.heatFlow));
            const msg = variable
                ? `Heat-flow history scaled by ${x.toFixed(2)}; present-day ${presentDayHeatFlow(fitted.heatFlow).toFixed(1)} mW/m2. Weighted misfit ${fitted.misfit.toFixed(2)} (1 = 0.1 %Ro or 10 C per point).`
                : `Heat flow fitted to ${fitted.heatFlow.value.toFixed(1)} mW/m2. Weighted misfit ${fitted.misfit.toFixed(2)} (1 = 0.1 %Ro or 10 C per point).`;
            setFitNote(bound ? `${msg} The fit stopped at the ${bound} end of the search range (${HeatFlowFitter.bounds(state.heatFlow).join(' to ')}${variable ? ' times the history' : ' mW/m2'}): the data want a value outside it, so check the stratigraphy, erosion or the points.` : msg);
            toast({ title: bound ? 'Fit on the search bound' : 'Optimization Complete', description: msg });
        } catch (e) {
            toast({ variant: "destructive", title: "Auto-fit failed", description: e.message });
        } finally {
            setIsFitting(false);
        }
    };

    // runSimulation() reads context state, which won't include the
    // fitted heat flow until the next render — run explicitly.
    const runSimulationWith = async (heatFlow) => {
        const results = stampRun(await SimulationEngine.run({ ...state, heatFlow }), { ...state, heatFlow }, mwState.activeWellId);
        dispatch({ type: 'SET_RESULTS', payload: results });
    };

    const handleSaveCalibration = async () => {
        if (roPoints.length === 0 && bhtPoints.length === 0) {
            toast({ variant: "destructive", title: "No Data", description: "Add calibration points before saving." });
            return;
        }

        dispatch({ type: 'SET_CALIBRATION_DATA', payload: { ro: roPoints, temp: bhtPoints, bht } });
        // BF-U1-013: "Calibrated" only from a current result that fits every kind of point given
        const rs = resultState(state.results, state, mwState.activeWellId);
        const fits = !stats.none && rs && !rs.stale
            && (roPoints.length === 0 || stats.roRMS < 0.3) && (bhtPoints.length === 0 || stats.tempRMS < 10);
        const newStatus = fits ? 'calibrated' : 'in-progress';

        if (mwState.activeWellId) {
            await updateWell(mwState.activeWellId, {
                calibration: { ro: roPoints, temp: bhtPoints, bht },
                status: newStatus
            });
            toast({ title: "Calibration Saved", description: fits ? 'Points saved; the current result fits them (Ro RMS under 0.3 %, temperature RMS under 10 C): marked Calibrated.' : `Points saved; not marked Calibrated: ${stats.none || !rs ? 'run the model first' : rs.stale ? 'the result is out of date, run the model again' : 'the misfit is above Ro RMS 0.3 % or temperature RMS 10 C'}.` });
        } else {
            toast({ variant: "destructive", title: "Save Failed", description: "No active well selected." });
        }
    };

    const exportToCSV = () => {
        const headers = `Depth_${zU},Measured_Ro,Modeled_Ro,Residual_Ro,Measured_Temp_${tU},Modeled_Temp_${tU},Residual_Temp_${tU},Raw_Temp_${tU},BHT_Correction\n`;
        const roRows = roPoints.map(p => {
            const mod = CalibrationCalculator.interpolateToMeasured(modelProfiles.depths, modelProfiles.ro, [p.depth])[0];
            return `${zD(p.depth).toFixed(2)},${p.value},${mod?.toFixed(2)||''},${(p.value-(mod||0)).toFixed(2)},,,`;
        }).join("\n");

        const tempRows = tempPoints.map(p => {
            const mod = CalibrationCalculator.interpolateToMeasured(modelProfiles.depths, modelProfiles.temp, [p.depth])[0];
            return `${zD(p.depth).toFixed(2)},,,${tD(p.value).toFixed(1)},${Number.isFinite(mod) ? tD(mod).toFixed(1) : ''},${tempDeltaToDisplay(p.value-(mod||0), tU).toFixed(1)},${tD(p.raw ?? p.value).toFixed(1)},${p.method || 'none'}`;
        }).join("\n");

        const csvContent = "data:text/csv;charset=utf-8," + headers + roRows + "\n" + tempRows;
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `calibration_data_${mwState.activeWellId || 'export'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // BF-U1-016: the calibration PDF is the model report (reviewer block,
    // calibration misfit, present day); it printed only the well's uuid
    const exportToPDF = async () => {
        try {
            const [{ jsPDF }, { loadPetrolordLogo }] = await Promise.all([import('jspdf'), import('@/lib/pdfBrand')]);
            const logo = await loadPetrolordLogo().catch(() => null);
            const modelName = mwState.wellDataMap?.[mwState.activeWellId]?.name || '';
            const st = { ...state, calibration: { ro: roPoints, temp: bhtPoints, bht } };
            const doc = basinReportPdf(jsPDF, { modelName, state: st, results: state.results, units, report: state.settings?.report || {}, notes: [], stale: resultState(state.results, state, mwState.activeWellId) }, { logo });
            doc.save(`basin-calibration-${(modelName || 'model').replace(/[^\w.-]+/g, '_')}.pdf`);
        } catch (e) {
            toast({ variant: 'destructive', title: 'The PDF could not be made', description: e.message });
        }
    };

    const safeFixed = (num, digits) => {
        if (typeof num !== 'number' || isNaN(num)) return EMPTY_VALUE;
        return num.toFixed(digits);
    };
    const coverage = calibrationCoverage([...roPoints, ...tempPoints], modelProfiles.depths);

    // plots in the display units (the stats above stay SI)
    const modeledRoProfile = modelProfiles.depths.map((d, i) => ({ depth: zD(d), value: modelProfiles.ro[i] }));
    const modeledTempProfile = modelProfiles.depths.map((d, i) => ({ depth: zD(d), value: tD(modelProfiles.temp[i]) }));
    const roPointsD = roPoints.map((p) => ({ ...p, depth: zD(p.depth) }));
    const bhtPointsD = tempPoints.map((p) => ({ ...p, depth: zD(p.depth), value: tD(p.value) }));
    const residualsD = {
        ro: stats.residualsRo.map((r) => ({ ...r, depth: zD(r.depth) })),
        temp: stats.residualsTemp.map((r) => ({ ...r, depth: zD(r.depth), residual: tempDeltaToDisplay(r.residual, tU) })),
    };

    return (
        <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-y-auto">
            <div className="col-span-12"><RunNotes showModel={false} testid="bf-cal-run-notes" /></div>
            <div className="col-span-12 lg:col-span-3 space-y-4">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Global Parameters</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <Label className="text-xs text-pl-muted">Basal Heat Flow (mW/m²)</Label>
                                <span className="text-xs font-mono text-pl-text">{presentDayHeatFlow(state.heatFlow).toFixed(0)}</span>
                            </div>
                            <Slider
                                value={[presentDayHeatFlow(state.heatFlow) || 60]}
                                min={30} max={150} step={1}
                                onValueChange={(v) => handleParameterChange('heatFlow', v[0])}
                                onValueCommit={() => runSimulation()}
                            />
                        </div>
                        <div className="pt-2">
                            <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleAutoCalibrate} disabled={isFitting} data-testid="bf-cal-autofit">
                                {isFitting
                                    ? <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                                    : <TrendingUp className="w-3 h-3 mr-2" />}
                                {isFitting ? 'Fitting…' : 'Auto-Fit Heat Flow'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Calibration points</CardTitle></CardHeader>
                    <CardContent>
                        <CalibrationPointsEditor
                            ro={roPoints}
                            temp={bhtPoints}
                            units={units}
                            onChange={({ ro, temp }) => dispatch({ type: 'SET_CALIBRATION_DATA', payload: { ro, temp } })}
                        />
                    </CardContent>
                </Card>
                <Card data-testid="bf-cal-bht">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">BHT correction</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-xs">
                        <select data-testid="bf-cal-bht-method" value={bht.method || 'none'} onChange={(e) => setBht({ method: e.target.value })}
                            className="w-full h-7 bg-pl-surface border border-pl-border-strong rounded px-1 text-xs text-pl-text">
                            {BHT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                        {bht.method === 'horner' && (
                            <label className="flex items-center justify-between gap-2 text-pl-muted">Circulation time (h)
                                <input type="number" step="any" min="0" data-testid="bf-cal-bht-circ" value={bht.circulationH ?? ''}
                                    onChange={(e) => { const v = parseFloat(e.target.value); setBht({ circulationH: Number.isFinite(v) && v > 0 ? v : null }); }}
                                    className="h-7 w-20 bg-pl-surface border border-pl-border-strong rounded px-1 text-xs text-pl-text" />
                            </label>
                        )}
                        <p className="text-[11px] text-pl-muted">{bht.method === 'horner' ? 'Runs at one depth, each with its shut-in time, extrapolate to the formation temperature.' : bht.method === 'none' ? 'Log BHTs read cool; a correction raises them toward the formation temperature.' : 'One BHT per depth, corrected by the published depth polynomial.'} DST points are never corrected.</p>
                        {bht.method !== 'none' && tempPoints.some((p) => p.method !== 'none') && (
                            <table className="w-full" data-testid="bf-cal-bht-table">
                                <thead><tr className="text-pl-muted text-left"><th className="font-normal">Depth ({zU})</th><th className="font-normal">Raw ({tempSymbol(tU)})</th><th className="font-normal">Used ({tempSymbol(tU)})</th></tr></thead>
                                <tbody>
                                    {tempPoints.map((p, i) => (
                                        <tr key={i} className="border-t border-pl-border" data-testid={`bf-cal-bht-row-${i}`}>
                                            <td className="font-mono">{zD(p.depth).toFixed(0)}</td>
                                            <td className="font-mono">{tD(p.raw ?? p.value).toFixed(1)}</td>
                                            <td className="font-mono" title={p.note || ''}>{tD(p.value).toFixed(1)}{p.method === 'none' ? ' (raw)' : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {corrected.notes.map((n, i) => <p key={i} className="text-[11px] text-pl-warning-text" data-testid="bf-cal-bht-note">{n}</p>)}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-pl-text">Misfit Statistics</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {stats.none && <p className="text-[11px] text-pl-muted" data-testid="bf-cal-no-run">No result yet: run the model to compare it with the points.</p>}
                        {coverage.outside.length > 0 && (
                            <p className="text-[11px] text-pl-warning-text" data-testid="bf-cal-outside">
                                {coverage.outside.length} point{coverage.outside.length === 1 ? ' lies' : 's lie'} outside the modelled column ({zD(coverage.top).toFixed(0)} to {zD(coverage.base).toFixed(0)} {zU}); {coverage.outside.length === 1 ? 'it is' : 'they are'} compared with the nearest modelled value, which is extrapolation.
                            </p>
                        )}
                        {fitNote && <p className="text-[11px] text-pl-text" data-testid="bf-cal-fit-note">{fitNote}</p>}
                        <div className="flex justify-between items-center p-2 bg-pl-sunken rounded border border-pl-border">
                            <span className="text-xs text-pl-muted">Ro RMS Error</span>
                            <span className={`font-mono text-sm ${Number.isNaN(stats.roRMS) ? 'text-pl-muted' : stats.roRMS < 0.2 ? 'text-pl-success-text' : 'text-pl-warning-text'}`} data-testid="bf-cal-ro-rms">
                                {safeFixed(stats.roRMS, 3)}{Number.isNaN(stats.roRMS) ? '' : ' %'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center p-2 bg-pl-sunken rounded border border-pl-border">
                            <span className="text-xs text-pl-muted">Temp RMS Error</span>
                             <span className={`font-mono text-sm ${Number.isNaN(stats.tempRMS) ? 'text-pl-muted' : stats.tempRMS < 5 ? 'text-pl-success-text' : 'text-pl-warning-text'}`} data-testid="bf-cal-temp-rms">
                                {safeFixed(tempDeltaToDisplay(stats.tempRMS, tU), 1)}{Number.isNaN(stats.tempRMS) ? '' : ` ${tempSymbol(tU)}`}
                            </span>
                        </div>
                         <div className="flex justify-between items-center p-2 bg-pl-sunken rounded border border-pl-border">
                            <span className="text-xs text-pl-muted">Ro R²</span>
                            <span className="font-mono text-sm text-pl-text">{safeFixed(stats.roR2, 3)}</span>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" onClick={handleSaveCalibration}>
                        <Save className="w-3 h-3 mr-2" /> Save
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportToCSV} title="Export CSV">
                        <Download className="w-3 h-3 mr-2" /> CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportToPDF} title="Export PDF Report" className="col-span-2">
                        <FileText className="w-3 h-3 mr-2" /> PDF Report
                    </Button>
                </div>
            </div>

            <div className="col-span-12 lg:col-span-9 space-y-4">
                <div className="grid grid-cols-2 gap-4 h-[400px]">
                    <CalibrationProfilePlot
                        title="Vitrinite Reflectance vs Depth"
                        xLabel="%Ro"
                        depthLabel={depthLabel(zU)}
                        modeled={modeledRoProfile}
                        measured={roPointsD}
                        color="#db2777"
                    />
                    <CalibrationProfilePlot
                        title="Temperature vs Depth"
                        xLabel={tempLabel(tU)}
                        depthLabel={depthLabel(zU)}
                        modeled={modeledTempProfile}
                        measured={bhtPointsD}
                        color="#d97706"
                    />
                </div>

                <div className="h-[250px]">
                    <ResidualPlot roStats={residualsD.ro} tempStats={residualsD.temp} depthLabel={depthLabel(zU)} tempUnit={tempSymbol(tU)} />
                </div>
            </div>
        </div>
    );
};

export default CalibrationView;
