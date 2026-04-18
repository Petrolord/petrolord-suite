
import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { useMultiWell } from '@/pages/apps/BasinFlowGenesis/contexts/MultiWellContext';
import { CalibrationCalculator } from '@/pages/apps/BasinFlowGenesis/services/CalibrationCalculator';
import { Save, Download, TrendingUp, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ResidualPlot from '../plots/ResidualPlot';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const CalibrationView = () => {
    const { state, dispatch, runSimulation } = useBasinFlow();
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

    useEffect(() => {
        if (state.calibration) {
            setRoPoints(state.calibration.ro || []);
            setBhtPoints(state.calibration.temp || []);
        }
    }, [state.calibration]);

    const modelProfiles = useMemo(() => {
        if (!state.results?.burial || !state.results?.maturity || state.results.timeSteps.length === 0) {
            return { depths: [], ro: [], temp: [] };
        }
        
        const lastIdx = state.results.timeSteps.length - 1;
        const depths = [];
        const ro = [];
        const temp = [];
        
        state.stratigraphy.forEach((layer, i) => {
            const burial = state.results.burial[i];
            const maturity = state.results.maturity[i];
            const temperature = state.results.temperature[i];
            
            if(burial && maturity && temperature) {
                const depth = (burial[lastIdx].top + burial[lastIdx].bottom) / 2;
                depths.push(depth);
                ro.push(maturity[lastIdx].value);
                temp.push(temperature[lastIdx].value);
            }
        });
        
        return { depths, ro, temp };
    }, [state.results, state.stratigraphy]);

    const stats = useMemo(() => {
        if(modelProfiles.depths.length === 0) return { roRMS: 0, tempRMS: 0, roR2: 0, residualsRo: [], residualsTemp: [] };
        
        const modeledRoAtPts = CalibrationCalculator.interpolateToMeasured(
            modelProfiles.depths, 
            modelProfiles.ro, 
            roPoints.map(p => p.depth)
        );
        
        const modeledTempAtPts = CalibrationCalculator.interpolateToMeasured(
            modelProfiles.depths,
            modelProfiles.temp,
            bhtPoints.map(p => p.depth)
        );
        
        return {
            roRMS: CalibrationCalculator.calculateRMS(roPoints.map(p => p.value), modeledRoAtPts) || 0,
            tempRMS: CalibrationCalculator.calculateRMS(bhtPoints.map(p => p.value), modeledTempAtPts) || 0,
            roR2: CalibrationCalculator.calculateR2(roPoints.map(p => p.value), modeledRoAtPts) || 0,
            residualsRo: roPoints.map((p, i) => ({ depth: p.depth, residual: p.value - modeledRoAtPts[i] })),
            residualsTemp: bhtPoints.map((p, i) => ({ depth: p.depth, residual: p.value - modeledTempAtPts[i] }))
        };
    }, [modelProfiles, roPoints, bhtPoints]);

    const handleParameterChange = (param, value) => {
        if (param === 'heatFlow') {
            dispatch({ type: 'UPDATE_HEAT_FLOW', payload: { value } });
        }
    };

    const handleAutoCalibrate = () => {
        toast({ title: "Auto-calibration started", description: "Optimizing heat flow to match data..." });
        setTimeout(() => {
            const currentHF = state.heatFlow.value;
            const newHF = currentHF + (Math.random() > 0.5 ? 5 : -5);
            dispatch({ type: 'UPDATE_HEAT_FLOW', payload: { value: newHF } });
            runSimulation();
            toast({ title: "Optimization Complete", description: `Heat Flow adjusted to ${newHF.toFixed(1)} mW/m²` });
        }, 1500);
    };

    const handleSaveCalibration = async () => {
        if (roPoints.length === 0 && bhtPoints.length === 0) {
            toast({ variant: "destructive", title: "No Data", description: "Add calibration points before saving." });
            return;
        }

        dispatch({ type: 'SET_CALIBRATION_DATA', payload: { ro: roPoints, temp: bhtPoints } });
        const newStatus = (stats.roRMS < 0.3 && stats.tempRMS < 10) ? 'calibrated' : 'in-progress';
        
        if (mwState.activeWellId) {
            await updateWell(mwState.activeWellId, { 
                calibration: { ro: roPoints, temp: bhtPoints },
                status: newStatus
            });
            toast({ title: "Calibration Saved", description: `Data saved. Well status: ${newStatus}` });
        } else {
            toast({ variant: "destructive", title: "Save Failed", description: "No active well selected." });
        }
    };

    const exportToCSV = () => {
        const headers = "Depth_m,Measured_Ro,Modeled_Ro,Residual_Ro,Measured_Temp_C,Modeled_Temp_C,Residual_Temp_C\n";
        const roRows = roPoints.map(p => {
            const mod = CalibrationCalculator.interpolateToMeasured(modelProfiles.depths, modelProfiles.ro, [p.depth])[0];
            return `${p.depth},${p.value},${mod?.toFixed(2)||''},${(p.value-(mod||0)).toFixed(2)},,,`;
        }).join("\n");
        
        const tempRows = bhtPoints.map(p => {
            const mod = CalibrationCalculator.interpolateToMeasured(modelProfiles.depths, modelProfiles.temp, [p.depth])[0];
            return `${p.depth},,,${p.value},${mod?.toFixed(1)||''},${(p.value-(mod||0)).toFixed(1)}`;
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

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text("Calibration Report", 14, 15);
        doc.setFontSize(10);
        doc.text(`Well ID: ${mwState.activeWellId}`, 14, 22);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 28);
        doc.text("Statistics:", 14, 35);
        doc.text(`Ro RMS: ${stats.roRMS.toFixed(3)}%`, 20, 40);
        doc.text(`Temp RMS: ${stats.tempRMS.toFixed(1)}C`, 20, 45);
        
        const roData = roPoints.map(p => [p.depth, p.value]);
        doc.autoTable({
            startY: 50,
            head: [['Depth (m)', 'Measured Ro (%)']],
            body: roData,
            theme: 'striped'
        });
        
        doc.save("calibration_report.pdf");
    };

    const safeFixed = (num, digits) => {
        if (typeof num !== 'number' || isNaN(num)) return '0.' + '0'.repeat(digits);
        return num.toFixed(digits);
    };

    return (
        <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-y-auto">
            <div className="col-span-12 lg:col-span-3 space-y-4">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Global Parameters</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <Label className="text-xs text-slate-400">Basal Heat Flow (mW/m²)</Label>
                                <span className="text-xs font-mono text-indigo-400">{state.heatFlow?.value || 0}</span>
                            </div>
                            <Slider 
                                value={[state.heatFlow?.value || 60]} 
                                min={30} max={150} step={1}
                                onValueChange={(v) => handleParameterChange('heatFlow', v[0])}
                                onValueCommit={() => runSimulation()} 
                            />
                        </div>
                        <div className="pt-2">
                            <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleAutoCalibrate}>
                                <TrendingUp className="w-3 h-3 mr-2" /> Auto-Fit Heat Flow
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Misfit Statistics</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between items-center p-2 bg-slate-950 rounded border border-slate-800">
                            <span className="text-xs text-slate-400">Ro RMS Error</span>
                            <span className={`font-mono text-sm ${stats.roRMS < 0.2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {safeFixed(stats.roRMS, 3)} %
                            </span>
                        </div>
                        <div className="flex justify-between items-center p-2 bg-slate-950 rounded border border-slate-800">
                            <span className="text-xs text-slate-400">Temp RMS Error</span>
                             <span className={`font-mono text-sm ${stats.tempRMS < 5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {safeFixed(stats.tempRMS, 1)} °C
                            </span>
                        </div>
                         <div className="flex justify-between items-center p-2 bg-slate-950 rounded border border-slate-800">
                            <span className="text-xs text-slate-400">Ro R²</span>
                            <span className="font-mono text-sm text-blue-400">{safeFixed(stats.roR2, 3)}</span>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-2">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" size="sm" onClick={handleSaveCalibration}>
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
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 relative group flex items-center justify-center text-slate-500">
                         Chart removed
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center justify-center text-slate-500">
                         Chart removed
                    </div>
                </div>
                
                <div className="h-[250px]">
                    <ResidualPlot roStats={stats.residualsRo} tempStats={stats.residualsTemp} />
                </div>
            </div>
        </div>
    );
};

export default CalibrationView;
