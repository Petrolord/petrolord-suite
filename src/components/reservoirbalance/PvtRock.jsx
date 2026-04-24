import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { AlertTriangle, CheckCircle, Calculator, RefreshCw } from 'lucide-react';
import { pvtCalcs } from '@/utils/pvtCalculations';

// Robust number formatting utility to prevent .toFixed() crashes on undefined/strings
const formatNum = (val, decimals = 2, fallback = '0') => {
    if (val === null || val === undefined) return fallback;
    const num = parseFloat(val);
    return isNaN(num) ? fallback : num.toFixed(decimals);
};

const PvtRock = ({ pvtData, onPvtDataChange }) => {
    const { toast } = useToast();
    
    // Initialize input parameters safely from props or defaults
    const [inputs, setInputs] = useState(() => pvtData?.inputs || {
        api: 35, 
        gasGravity: 0.75, 
        temp: 220, 
        pb: 3500, 
        correlations: { pb_rs_bo: 'standing', viscosity: 'beal_cook_spillman' }
    });

    const [generatedPvtTable, setGeneratedPvtTable] = useState([]);
    const [activePlot, setActivePlot] = useState('bo');

    // Determine if we have valid uploaded table data from the Data Hub
    const hasUploadedTable = useMemo(() => {
        return Array.isArray(pvtData?.pvtTable) && pvtData.pvtTable.length > 0;
    }, [pvtData?.pvtTable]);

    // Track the source of truth for the UI (Uploaded via DataHub vs Correlated via Engine)
    const [dataSource, setDataSource] = useState(hasUploadedTable ? 'uploaded' : 'correlated');

    useEffect(() => {
        if (pvtData?.inputs) {
            setInputs(pvtData.inputs);
        }
        // If a new valid table is uploaded, switch to it automatically
        if (hasUploadedTable && dataSource !== 'uploaded') {
            setDataSource('uploaded');
        }
    }, [pvtData, hasUploadedTable, dataSource]);

    const handleGenerateTable = useCallback(() => {
        try {
            if (!inputs || Object.keys(inputs).length === 0) return;
            
            const parsedInputs = {
                api: parseFloat(inputs.api),
                gasGravity: parseFloat(inputs.gasGravity),
                temp: parseFloat(inputs.temp),
                pb: parseFloat(inputs.pb),
                correlations: inputs.correlations || { pb_rs_bo: 'standing', viscosity: 'beal_cook_spillman' }
            };
            
            // Input Validation
            if (isNaN(parsedInputs.api) || parsedInputs.api <= 0 ||
                isNaN(parsedInputs.gasGravity) || parsedInputs.gasGravity <= 0 ||
                isNaN(parsedInputs.temp) || parsedInputs.temp <= 0 ||
                isNaN(parsedInputs.pb) || parsedInputs.pb <= 0) {
                throw new Error("Please ensure all parameters are valid positive numbers.");
            }

            // Generate using Engine
            const table = pvtCalcs.generatePvtTable(parsedInputs);
            if (!table || !Array.isArray(table) || table.length === 0) throw new Error("Generated table is empty.");
            
            setGeneratedPvtTable(table);
            setDataSource('correlated'); // Force UI to show the newly correlated data
            
            // Automatically push to parent context so MB immediately uses it
            if (onPvtDataChange) {
                onPvtDataChange({
                    inputs: parsedInputs,
                    pvtTable: table,
                });
            }

            toast({
                title: 'PVT Engine Calculated',
                description: `Generated ${table.length} data points and applied to project.`,
                variant: 'default',
                className: 'bg-emerald-950 text-white border-emerald-800'
            });
        } catch (error) {
            toast({
                title: 'Calculation Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    }, [inputs, toast, onPvtDataChange]);
    
    // Auto-generate if no data exists at all on mount
    useEffect(() => {
        if (!hasUploadedTable && generatedPvtTable.length === 0) {
            handleGenerateTable();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    // Normalize keys to ensure charts/tables work regardless of upload naming conventions
    // This adds a final layer of defense enforcing number types
    const effectivePvtData = useMemo(() => {
        const rawData = dataSource === 'uploaded' ? pvtData?.pvtTable : generatedPvtTable;
        if (!Array.isArray(rawData)) return [];
        
        const safeNum = (val, fallback = 0) => {
            if (val === null || val === undefined) return fallback;
            const parsed = parseFloat(val);
            return isNaN(parsed) ? fallback : parsed;
        };

        return rawData.map(row => ({
            ...row,
            // Fallbacks in case DataHub mapping failed or it's raw engine data
            pressure: safeNum(row.pressure ?? row.Pressure_psia ?? row.Pressure, 0),
            Bo: safeNum(row.Bo ?? row.bo ?? row['Oil_FVF_bbl_per_STB'], 1.0),
            Rs: safeNum(row.Rs ?? row.rs ?? row['Solution_GOR_SCF_per_STB'], 0),
            Bg: safeNum(row.Bg ?? row.bg, 0),
            oil_viscosity: safeNum(row.oil_viscosity ?? row.muo ?? row.mu_o, 1.0),
        })).filter(row => row.pressure > 0); // Remove completely invalid rows to protect charts
    }, [dataSource, pvtData?.pvtTable, generatedPvtTable]);
    
    const handleInputChange = (key, value, isNested = false) => {
        if (isNested) {
            const [parent, child] = key.split('.');
            setInputs(prev => ({ ...prev, [parent]: { ...prev[parent], [child]: value } }));
        } else {
            setInputs(prev => ({ ...prev, [key]: value }));
        }
    };

    const plotConfig = {
        bo: { dataKey: 'Bo', name: 'Oil FVF (bbl/STB)', color: '#a3e635' },
        rs: { dataKey: 'Rs', name: 'Solution GOR (scf/STB)', color: '#38bdf8' },
        muo: { dataKey: 'oil_viscosity', name: 'Oil Viscosity (cP)', color: '#f87171' },
    };
    const currentPlot = plotConfig[activePlot];

    return (
        <div className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <CardTitle className="text-lime-300">PVT & Rock Properties</CardTitle>
                        <CardDescription>Define empirical fluid properties or visualize data loaded from the Data Hub.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    {/* Controls Panel */}
                    <div className="md:col-span-2 space-y-4">
                        <Card className="bg-slate-900/50 border-slate-700 h-full flex flex-col shadow-lg">
                            <CardHeader className="border-b border-slate-800 bg-slate-900/80 p-4">
                                <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                                    <Calculator className="w-4 h-4 text-lime-400" />
                                    Correlation Engine
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 p-4 flex-1">
                                <div className="grid grid-cols-2 gap-4">
                                    <InputGroup label="Oil Gravity (°API)" id="api" value={inputs?.api || ''} onChange={e => handleInputChange('api', e.target.value)} />
                                    <InputGroup label="Gas Gravity (SG)" id="gasGravity" value={inputs?.gasGravity || ''} onChange={e => handleInputChange('gasGravity', e.target.value)} />
                                    <InputGroup label="Res. Temp (°F)" id="temp" value={inputs?.temp || ''} onChange={e => handleInputChange('temp', e.target.value)} />
                                    <InputGroup label="Bubble Point (psia)" id="pb" value={inputs?.pb || ''} onChange={e => handleInputChange('pb', e.target.value)} />
                                </div>
                                 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                                    <div className="space-y-2">
                                        <Label className="text-xs text-slate-400">Pb, Rs, Bo</Label>
                                        <Select value={inputs?.correlations?.pb_rs_bo || 'standing'} onValueChange={v => handleInputChange('correlations.pb_rs_bo', v, true)}>
                                            <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="standing">Standing</SelectItem>
                                                <SelectItem value="vasquez_beggs">Vasquez-Beggs</SelectItem>
                                                <SelectItem value="glaso">Glaso</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                     <div className="space-y-2">
                                        <Label className="text-xs text-slate-400">Oil Viscosity</Label>
                                        <Select value={inputs?.correlations?.viscosity || 'beal_cook_spillman'} onValueChange={v => handleInputChange('correlations.viscosity', v, true)}>
                                            <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="beal_cook_spillman">Beal et al.</SelectItem>
                                                <SelectItem value="beggs_robinson">Beggs-Robinson</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="pt-4 mt-auto">
                                  <Button onClick={handleGenerateTable} className="w-full bg-lime-600 hover:bg-lime-500 text-slate-950 font-semibold shadow-md">
                                    <RefreshCw className="w-4 h-4 mr-2" /> Recalculate PVT Table
                                  </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table View */}
                    <div className="md:col-span-3 space-y-4">
                         <Card className="bg-slate-900/50 border-slate-700 h-full flex flex-col shadow-lg">
                             <CardHeader className="border-b border-slate-800 bg-slate-900/80 p-4">
                                 <div className="flex justify-between items-center">
                                     <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">PVT Data Table</CardTitle>
                                     <div className="flex gap-3 items-center">
                                         {hasUploadedTable && dataSource === 'correlated' && (
                                            <Button variant="outline" size="sm" onClick={() => setDataSource('uploaded')} className="h-7 text-xs">
                                                Revert to Uploaded
                                            </Button>
                                         )}
                                         {dataSource === 'uploaded' ? (
                                             <div className="flex items-center text-[11px] uppercase tracking-wide font-semibold text-green-400 bg-green-400/10 px-2 py-1 rounded">
                                                 <CheckCircle className="w-3 h-3 mr-1.5" /> Using Uploaded Data
                                             </div>
                                         ) : (
                                             <div className="flex items-center text-[11px] uppercase tracking-wide font-semibold text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                                                 <AlertTriangle className="w-3 h-3 mr-1.5" /> Using Correlation
                                             </div>
                                         )}
                                     </div>
                                 </div>
                             </CardHeader>
                             <CardContent className="p-0 flex-1">
                                 <ScrollArea className="h-[320px] w-full">
                                     {effectivePvtData.length > 0 ? (
                                         <Table>
                                             <TableHeader className="bg-slate-950 sticky top-0 z-10">
                                                 <TableRow className="border-slate-800">
                                                    <TableHead className="text-xs text-slate-400 font-semibold py-2">Pressure <span className="text-[10px] block font-normal text-slate-500">(psia)</span></TableHead>
                                                    <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right">Bo <span className="text-[10px] block font-normal text-slate-500">(rb/stb)</span></TableHead>
                                                    <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right">Rs <span className="text-[10px] block font-normal text-slate-500">(scf/stb)</span></TableHead>
                                                    <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right">Bg <span className="text-[10px] block font-normal text-slate-500">(rb/scf)</span></TableHead>
                                                    <TableHead className="text-xs text-slate-400 font-semibold py-2 text-right pr-4">Oil Visc <span className="text-[10px] block font-normal text-slate-500">(cp)</span></TableHead>
                                                 </TableRow>
                                             </TableHeader>
                                             <TableBody>
                                                 {effectivePvtData.map((row, i) => (
                                                     <TableRow key={i} className="border-slate-800/50 hover:bg-slate-800/50">
                                                        <TableCell className="font-mono text-xs text-slate-300 py-1.5">{formatNum(row.pressure, 0)}</TableCell>
                                                        <TableCell className="font-mono text-xs text-lime-400 text-right py-1.5">{formatNum(row.Bo, 3)}</TableCell>
                                                        <TableCell className="font-mono text-xs text-sky-400 text-right py-1.5">{formatNum(row.Rs, 0)}</TableCell>
                                                        <TableCell className="font-mono text-xs text-rose-400 text-right py-1.5">{formatNum(row.Bg, 4)}</TableCell>
                                                        <TableCell className="font-mono text-xs text-amber-400 text-right py-1.5 pr-4">{formatNum(row.oil_viscosity, 3)}</TableCell>
                                                     </TableRow>
                                                 ))}
                                             </TableBody>
                                         </Table>
                                     ) : (
                                        <div className="h-full flex items-center justify-center text-slate-500 text-sm p-8">
                                            No valid PVT data to display. Please verify inputs or uploaded file.
                                        </div>
                                     )}
                                 </ScrollArea>
                             </CardContent>
                         </Card>
                    </div>
                </CardContent>
            </Card>

            {/* Visualizer Panel */}
            <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
                 <CardHeader className="border-b border-slate-800 bg-slate-900/50 p-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <CardTitle className="text-sm font-bold text-slate-200 uppercase tracking-wider">Property Visualizer</CardTitle>
                        <Tabs value={activePlot} onValueChange={setActivePlot} className="w-[300px]">
                            <TabsList className="grid w-full grid-cols-3 bg-slate-950 border border-slate-700">
                                <TabsTrigger value="bo" className="text-xs data-[state=active]:bg-lime-600 data-[state=active]:text-slate-950">Bo</TabsTrigger>
                                <TabsTrigger value="rs" className="text-xs data-[state=active]:bg-sky-600 data-[state=active]:text-white">Rs</TabsTrigger>
                                <TabsTrigger value="muo" className="text-xs data-[state=active]:bg-rose-600 data-[state=active]:text-white">Visc.</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-6">
                    {effectivePvtData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={350}>
                            <ComposedChart data={effectivePvtData} margin={{ top: 5, right: 30, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis 
                                    dataKey="pressure" 
                                    type="number" 
                                    domain={['dataMin', 'dataMax']} 
                                    stroke="#475569" 
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    label={{ value: 'Pressure (psia)', position: 'bottom', offset: 0, fill: '#cbd5e1', fontSize: 12 }} 
                                />
                                <YAxis 
                                    yAxisId="left" 
                                    stroke={currentPlot.color} 
                                    tick={{ fill: currentPlot.color, fontSize: 12 }}
                                    domain={['auto', 'auto']}
                                    label={{ value: currentPlot.name, angle: -90, position: 'insideLeft', fill: currentPlot.color, fontSize: 12 }} 
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px' }} 
                                    itemStyle={{ color: currentPlot.color, fontWeight: 'bold' }}
                                    labelStyle={{ color: '#e2e8f0', marginBottom: '4px', paddingBottom: '4px', borderBottom: '1px solid #1e293b' }} 
                                    formatter={(value) => formatNum(value, 3)}
                                />
                                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', color: '#cbd5e1' }} />
                                <Line 
                                    yAxisId="left" 
                                    type="monotone" 
                                    dataKey={currentPlot.dataKey} 
                                    name={currentPlot.name} 
                                    stroke={currentPlot.color} 
                                    strokeWidth={3} 
                                    dot={false} 
                                    activeDot={{ r: 6, fill: currentPlot.color, stroke: '#fff', strokeWidth: 2 }}
                                    isAnimationActive={false} 
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[350px] flex items-center justify-center text-slate-500">
                            No data points available to visualize.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

const InputGroup = ({ label, id, ...props }) => (
    <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs text-slate-400">{label}</Label>
        <Input 
            id={id} 
            {...props} 
            type={props.type || "number"} 
            className="h-9 bg-slate-950 border-slate-700 text-slate-200 focus:border-lime-500 focus:ring-lime-500" 
        />
    </div>
);

export default PvtRock;