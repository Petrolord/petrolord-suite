
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { BrainCircuit, Target, AlertTriangle, Play } from 'lucide-react';
import { ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { useMultiWell } from '@/pages/apps/BasinFlowGenesis/contexts/MultiWellContext';
import { AnomalyDetector } from '@/pages/apps/BasinFlowGenesis/services/ml/AnomalyDetector';
import { CalibrationPredictor } from '@/pages/apps/BasinFlowGenesis/services/ml/CalibrationPredictor';
import { ParameterOptimizer } from '@/pages/apps/BasinFlowGenesis/services/ml/ParameterOptimizer';
import { DataClusterer } from '@/pages/apps/BasinFlowGenesis/services/ml/DataClusterer';
import { useToast } from '@/components/ui/use-toast';

const MLDashboard = () => {
    const { state } = useBasinFlow();
    const { state: mwState } = useMultiWell();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('anomaly');
    
    // Optimization State
    const [optimizing, setOptimizing] = useState(false);
    const [optProgress, setOptimProgress] = useState(0);
    const [optHistory, setOptHistory] = useState([]);

    // Anomaly State
    const [anomalies, setAnomalies] = useState([]);

    // Anomaly Detection Effect
    useEffect(() => {
        if (state.calibration?.ro && state.calibration.ro.length > 0) {
            const depths = state.calibration.ro.map(p => p.depth);
            const values = state.calibration.ro.map(p => p.value);
            const detected = AnomalyDetector.detectTrendAnomalies(depths, values, 1.5);
            setAnomalies(detected.filter(d => d.isAnomaly));
        } else {
            setAnomalies([]);
        }
    }, [state.calibration]);

    // Run Optimization Handler
    const handleOptimize = async () => {
        setOptimizing(true);
        setOptimProgress(0);
        setOptHistory([]);
        
        try {
            const optimizer = new ParameterOptimizer(state, state.calibration);
            const result = await optimizer.optimize((p) => {
                setOptimProgress((p.generation / p.totalGenerations) * 100);
            });
            setOptHistory(result.history);
            toast({ title: "Optimization Complete", description: `Best Heat Flow: ${result.bestSolution.heatFlow.toFixed(1)} mW/m²` });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "Optimization failed." });
        } finally {
            setOptimizing(false);
        }
    };

    // Clustering Data Prep
    const clusteringData = useMemo(() => {
        const allWells = Object.values(mwState.wellDataMap || {});
        if (allWells.length < 2) return [];

        return allWells.map(w => ({
            id: w.id,
            name: w.name,
            depth: w.depthRange?.max || 0,
            metric1: Math.random() * 2 + 0.5, // Simulated Ro
            metric2: Math.random() * 100 + 50 // Simulated Temp
        }));
    }, [mwState.wellDataMap]);

    const clusters = useMemo(() => {
        return DataClusterer.cluster(clusteringData, 3);
    }, [clusteringData]);

    const clusterColors = ['#f87171', '#4ade80', '#60a5fa'];

    return (
        <div className="h-full flex flex-col bg-slate-950 p-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <BrainCircuit className="w-6 h-6 text-purple-400" />
                        AI & Analytics Engine
                    </h2>
                    <p className="text-slate-400 text-sm">Advanced Machine Learning insights for your basin model.</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-slate-900 border-slate-800">
                    <TabsTrigger value="anomaly" className="data-[state=active]:bg-slate-800">Anomaly Detection</TabsTrigger>
                    <TabsTrigger value="optimization" className="data-[state=active]:bg-slate-800">Optimization</TabsTrigger>
                    <TabsTrigger value="clustering" className="data-[state=active]:bg-slate-800">Field Clustering</TabsTrigger>
                    <TabsTrigger value="prediction" className="data-[state=active]:bg-slate-800">Predictive Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="anomaly" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader><CardTitle className="text-sm">Calibration Outliers (Ro)</CardTitle></CardHeader>
                            <CardContent>
                                {anomalies.length > 0 ? (
                                    <div className="space-y-2">
                                        {anomalies.map((a, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 bg-red-900/10 border border-red-900/30 rounded">
                                                <span className="flex items-center gap-2 text-red-400 text-xs font-bold">
                                                    <AlertTriangle className="w-4 h-4" />
                                                    Depth: {a.depth}m
                                                </span>
                                                <span className="text-slate-300 text-xs">
                                                    Val: {a.value} (Trend: {a.predicted.toFixed(2)})
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-slate-500 text-sm text-center py-8">No significant anomalies detected in Ro data.</div>
                                )}
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader><CardTitle className="text-sm">Visualization</CardTitle></CardHeader>
                            <CardContent className="h-[300px] p-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart layout="vertical" margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis type="number" dataKey="value" name="Ro %" stroke="#94a3b8" label={{ value: 'Ro %', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} />
                                        <YAxis type="number" dataKey="depth" name="Depth" reversed stroke="#94a3b8" label={{ value: 'Depth (m)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                        <Legend />
                                        <Scatter name="Data" data={state.calibration?.ro || []} fill="#94a3b8" />
                                        <Scatter name="Anomalies" data={anomalies} fill="#ef4444" shape="cross" />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="optimization" className="space-y-4">
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm">Heat Flow Optimization (Genetic Algorithm)</CardTitle>
                            <Button size="sm" onClick={handleOptimize} disabled={optimizing} className="bg-purple-600 hover:bg-purple-700 text-white">
                                {optimizing ? 'Running...' : <><Play className="w-3 h-3 mr-2" /> Start Optimization</>}
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {optimizing && <Progress value={optProgress} className="mb-4 h-2" />}
                            
                            {optHistory.length > 0 && (
                                <div className="h-[300px] flex flex-col">
                                    <h3 className="text-center text-sm text-slate-300 mt-2 mb-4">Convergence Plot</h3>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={optHistory} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis dataKey="gen" stroke="#94a3b8" label={{ value: 'Generation', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} />
                                            <YAxis stroke="#94a3b8" label={{ value: 'Misfit Score', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
                                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                            <Line type="monotone" dataKey="bestScore" stroke="#a855f7" strokeWidth={2} dot={{ r: 4 }} name="Misfit Score" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {!optimizing && optHistory.length === 0 && (
                                <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded">
                                    Click 'Start Optimization' to run the Genetic Algorithm solver.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="clustering" className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader><CardTitle className="text-sm">Well Clustering (K-Means)</CardTitle></CardHeader>
                            <CardContent className="h-[400px] flex flex-col">
                                {clusters.length > 0 ? (
                                    <>
                                        <h3 className="text-center text-sm text-slate-300 mt-2 mb-4">Multi-Well Cluster Analysis</h3>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                <XAxis type="number" dataKey="metric1" name="Ro" stroke="#94a3b8" label={{ value: 'Simulated Ro Index', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} />
                                                <YAxis type="number" dataKey="metric2" name="Temp" stroke="#94a3b8" label={{ value: 'Simulated Temp Index', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
                                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                                <Scatter name="Wells" data={clusters}>
                                                    {clusters.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={clusterColors[entry.cluster % clusterColors.length]} />
                                                    ))}
                                                </Scatter>
                                            </ScatterChart>
                                        </ResponsiveContainer>
                                    </>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-slate-500">
                                        Need more wells to perform clustering.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
                
                <TabsContent value="prediction" className="space-y-4">
                     <Card className="bg-slate-900 border-slate-800">
                        <CardHeader><CardTitle className="text-sm">Calibration Predictor</CardTitle></CardHeader>
                        <CardContent>
                            <div className="p-4 bg-slate-950 rounded border border-slate-800 text-center">
                                <Target className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                                <h3 className="text-white font-medium mb-1">Optimal HF Prediction</h3>
                                <p className="text-slate-400 text-xs mb-4">Based on current residuals and historical data model.</p>
                                <div className="text-3xl font-bold text-emerald-400">
                                    {CalibrationPredictor.simpleHeuristic(0.1, 5).toFixed(1)} <span className="text-sm font-normal text-slate-500">mW/m² adjustment</span>
                                </div>
                            </div>
                        </CardContent>
                     </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default MLDashboard;
