
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart2, PieChart as PieChartIcon, TrendingUp, Maximize2, ChevronDown, ChevronUp, Grid } from 'lucide-react';
import { ScatterChart, Scatter, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { useMultiWell } from '../../contexts/MultiWellContext';
import { useCollaboration } from '../../contexts/CollaborationContext';

const CollapsibleSection = ({ title, icon: Icon, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <Card className="bg-slate-900 border-slate-800 mb-6 transition-all duration-300">
            <CardHeader className="py-3 cursor-pointer hover:bg-slate-800/50 flex flex-row items-center justify-between" onClick={() => setIsOpen(!isOpen)}>
                <CardTitle className="text-sm text-white flex items-center gap-2">
                    {Icon && <Icon className="w-4 h-4 text-indigo-400" />} {title}
                </CardTitle>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </CardHeader>
            {isOpen && <CardContent className="p-4 animate-in fade-in slide-in-from-top-2 duration-300">{children}</CardContent>}
        </Card>
    );
};

const AnalyticsDashboard = () => {
    const { state: bfState } = useBasinFlow();
    const { state: mwState } = useMultiWell();
    const { activeUsers, activityLog } = useCollaboration();

    // ---- Real Data Aggregation ----
    
    // 1. Well Statistics
    const wellStats = useMemo(() => {
        const wells = Object.values(mwState.wellDataMap || {});
        const total = wells.length;
        const withLogs = wells.filter(w => w.logs && w.logs.length > 0).length;
        const withCalibration = wells.filter(w => w.calibration && Object.keys(w.calibration).length > 0).length;
        return { total, withLogs, withCalibration };
    }, [mwState.wellDataMap]);

    // 2. Maturity Trends (Derived from Thermal History of active project if exists)
    const maturityData = useMemo(() => {
        if (bfState.calibration?.ro?.length > 0) {
            return bfState.calibration.ro.map(p => ({
                x: p.value,
                y: p.depth
            }));
        }
        return [];
    }, [bfState.calibration]);

    // 3. Activity/Productivity (Real from Collaboration Context)
    const activityStats = useMemo(() => {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const counts = new Array(7).fill(0);
        
        activityLog.forEach(log => {
            const date = new Date(log.created_at);
            const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1; // Mon=0, Sun=6
            counts[dayIndex]++;
        });
        
        return days.map((day, i) => ({ day, count: counts[i] }));
    }, [activityLog]);

    const pieData = [
        { name: 'Calibrated', value: wellStats.withCalibration },
        { name: 'Uncalibrated', value: wellStats.total - wellStats.withCalibration }
    ];
    const COLORS = ['#10b981', '#334155'];

    return (
        <div className="h-full p-6 bg-slate-950 overflow-y-auto scroll-smooth">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-900/30 rounded-lg">
                        <BarChart2 className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Project Analytics</h2>
                        <p className="text-slate-400 text-xs">Real-time insights derived from simulation and team activity</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="border-slate-700 text-slate-300">
                        <Grid className="w-4 h-4 mr-2" /> Customize View
                    </Button>
                </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="p-4">
                        <p className="text-xs text-slate-500 uppercase font-bold">Total Wells</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{wellStats.total}</h3>
                        <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full" style={{width: '100%'}}></div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="p-4">
                        <p className="text-xs text-slate-500 uppercase font-bold">Calibrated</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{wellStats.withCalibration}</h3>
                        <div className="w-full bg-slate-800 h-1 mt-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full" style={{width: `${wellStats.total ? (wellStats.withCalibration/wellStats.total)*100 : 0}%`}}></div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="p-4">
                        <p className="text-xs text-slate-500 uppercase font-bold">Team Activity (7d)</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{activityLog.length}</h3>
                        <p className="text-[10px] text-slate-400 mt-1">Actions recorded</p>
                    </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="p-4">
                        <p className="text-xs text-slate-500 uppercase font-bold">Current Heat Flow</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{bfState.heatFlow?.value || 0} <span className="text-sm font-normal text-slate-500">mW/m²</span></h3>
                        <p className="text-[10px] text-slate-400 mt-1">Model Parameter</p>
                    </CardContent>
                </Card>
            </div>

            <CollapsibleSection title="Simulation Data Analysis" icon={TrendingUp}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 h-[400px] relative group flex flex-col">
                        <h3 className="text-center text-sm text-slate-300 mt-2 mb-4">Measured Maturity vs Depth</h3>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <Button variant="ghost" size="icon" className="h-6 w-6 bg-slate-800/80"><Maximize2 className="w-3 h-3 text-white" /></Button>
                        </div>
                        {maturityData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart layout="vertical" margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis type="number" dataKey="x" stroke="#94a3b8" label={{ value: 'Vitrinite Reflectance (%)', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} />
                                    <YAxis type="number" dataKey="y" reversed stroke="#94a3b8" label={{ value: 'Depth (m)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                    <Scatter name="Measured Ro" data={maturityData} fill="#f472b6" />
                                </ScatterChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                No maturity calibration data loaded.
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 h-[400px] flex flex-col">
                         <h3 className="text-center text-sm text-slate-300 mt-2 mb-4">Well Calibration Status</h3>
                         <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius="40%"
                                    outerRadius="70%"
                                    fill="#8884d8"
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                                <Legend />
                            </PieChart>
                         </ResponsiveContainer>
                    </div>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Team Performance" icon={BarChart2}>
                <div className="h-[300px] bg-slate-950 border border-slate-800 rounded-lg p-2 w-full flex flex-col">
                    <h3 className="text-center text-sm text-slate-300 mt-2 mb-4">Activity Volume (Last 7 Days)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activityStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="day" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" label={{ value: 'Actions', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} cursor={{fill: '#334155', opacity: 0.4}} />
                            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CollapsibleSection>
        </div>
    );
};

export default AnalyticsDashboard;
