import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import CollapsibleSection from '@/components/nodalanalysis/CollapsibleSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculateGasLiftDesign } from '@/utils/gasLiftCalculations';
import { Settings, Droplet, Thermometer, Wind, BarChart2, TrendingUp, Cpu } from 'lucide-react';

const CustomTooltip = ({ active, payload, label, xUnit, yUnit, xName, yName }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-800/80 backdrop-blur-sm p-2 border border-lime-400/50 rounded-md shadow-lg">
                {payload.map((p, i) => (
                    <p key={i} style={{ color: p.color }} className="text-white">
                        {`${p.name}: ${p.value.toFixed(1)} ${yUnit[p.dataKey] || ''}`}
                    </p>
                ))}
                 <p className="label text-lime-300">{`${xName}: ${label.toFixed(1)} ${xUnit}`}</p>
            </div>
        );
    }
    return null;
};

const GasLiftDesign = ({ inputs, setInputs }) => {
    const [results, setResults] = useState(null);

    useEffect(() => {
        const designResults = calculateGasLiftDesign(inputs);
        setResults(designResults);
    }, [inputs]);

    const handleInputChange = (key, value) => {
        setInputs(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-1 bg-slate-800/50 p-4 rounded-lg"
            >
                <h2 className="text-xl font-bold text-white mb-4">Gas Lift Design Inputs</h2>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    <CollapsibleSection title="Well & Production" icon={<Settings />} defaultOpen>
                        <div className="grid grid-cols-2 gap-2 p-1">
                            <div><Label className="text-slate-200">Well Depth (ft)</Label><Input type="number" value={inputs.wellDepth} onChange={e => handleInputChange('wellDepth', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Tubing ID (in)</Label><Input type="number" value={inputs.tubingID} onChange={e => handleInputChange('tubingID', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Liquid Rate (bbl/d)</Label><Input type="number" value={inputs.liquidRate} onChange={e => handleInputChange('liquidRate', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">WHP (psi)</Label><Input type="number" value={inputs.whp} onChange={e => handleInputChange('whp', e.target.value)} className="text-slate-900 bg-white" /></div>
                        </div>
                    </CollapsibleSection>
                    <CollapsibleSection title="Fluid Properties" icon={<Droplet />}>
                       <div className="grid grid-cols-2 gap-2 p-1">
                            <div><Label className="text-slate-200">Water Cut (%)</Label><Input type="number" value={inputs.waterCut} onChange={e => handleInputChange('waterCut', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">GOR (scf/bbl)</Label><Input type="number" value={inputs.gor} onChange={e => handleInputChange('gor', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Oil API</Label><Input type="number" value={inputs.oilApi} onChange={e => handleInputChange('oilApi', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Gas Gravity</Label><Input type="number" value={inputs.gasGravity} onChange={e => handleInputChange('gasGravity', e.target.value)} className="text-slate-900 bg-white" /></div>
                       </div>
                    </CollapsibleSection>
                     <CollapsibleSection title="Temperatures" icon={<Thermometer />}>
                       <div className="grid grid-cols-2 gap-2 p-1">
                            <div><Label className="text-slate-200">WHT (°F)</Label><Input type="number" value={inputs.wellheadTemp} onChange={e => handleInputChange('wellheadTemp', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">BHT (°F)</Label><Input type="number" value={inputs.bottomholeTemp} onChange={e => handleInputChange('bottomholeTemp', e.target.value)} className="text-slate-900 bg-white" /></div>
                       </div>
                    </CollapsibleSection>
                    <CollapsibleSection title="Injection System" icon={<Wind />}>
                       <div className="grid grid-cols-2 gap-2 p-1">
                            <div><Label className="text-slate-200">Surface Inj P (psi)</Label><Input type="number" value={inputs.surfaceInjectionPressure} onChange={e => handleInputChange('surfaceInjectionPressure', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Inj Gas Gravity</Label><Input type="number" value={inputs.injectionGasGravity} onChange={e => handleInputChange('injectionGasGravity', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Valve Spacing SF (psi)</Label><Input type="number" value={inputs.valveSpacingSafetyFactor} onChange={e => handleInputChange('valveSpacingSafetyFactor', e.target.value)} className="text-slate-900 bg-white" /></div>
                       </div>
                    </CollapsibleSection>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2 space-y-6"
            >
                {results && (
                    <>
                        <div className="bg-slate-800/50 p-4 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center"><TrendingUp className="w-6 h-6 mr-2 text-lime-400" /> Key Design Results</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div className="bg-black/20 p-3 rounded-lg">
                                    <p className="text-sm text-slate-300">Injection Depth</p>
                                    <p className="text-2xl font-bold text-white">{results.injectionDepth.toFixed(0)} <span className="text-base font-normal text-slate-400">ft</span></p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg">
                                    <p className="text-sm text-slate-300">Required Gas Rate</p>
                                    <p className="text-2xl font-bold text-white">{results.requiredGasRate.toFixed(2)} <span className="text-base font-normal text-slate-400">MMscf/d</span></p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg">
                                    <p className="text-sm text-slate-300">Resulting BHP</p>
                                    <p className="text-2xl font-bold text-white">{results.resultingBhp.toFixed(0)} <span className="text-base font-normal text-slate-400">psi</span></p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg">
                                    <p className="text-sm text-slate-300">Valves Required</p>
                                    <p className="text-2xl font-bold text-white">{results.valveDepths.length}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="bg-slate-800/50 p-4 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center"><BarChart2 className="w-6 h-6 mr-2 text-lime-400" />Pressure & Temperature Gradients</h3>
                             <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={results.gradientData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                                    <XAxis dataKey="depth" stroke="#a3e635" type="number" domain={[0, 'dataMax']} label={{ value: 'Depth (ft)', position: 'insideBottom', offset: -5, fill: '#a3e635' }} reversed={true} />
                                    <YAxis yAxisId="left" stroke="#38bdf8" label={{ value: 'Pressure (psi)', angle: -90, position: 'insideLeft', fill: '#38bdf8' }}/>
                                    <YAxis yAxisId="right" orientation="right" stroke="#facc15" label={{ value: 'Temp (°F)', angle: 90, position: 'insideRight', fill: '#facc15' }}/>
                                    <Tooltip content={<CustomTooltip xUnit="ft" yUnit={{flowingPressure: 'psi', casingPressure: 'psi', temperature: '°F'}} xName="Depth" yName="Value" />} />
                                    <Legend />
                                    <Line yAxisId="left" type="monotone" dataKey="flowingPressure" name="Flowing Tubing P" stroke="#38bdf8" dot={false} strokeWidth={2} />
                                    <Line yAxisId="left" type="monotone" dataKey="casingPressure" name="Injection Gas P" stroke="#10b981" dot={false} strokeWidth={2} />
                                    <Line yAxisId="right" type="monotone" dataKey="temperature" name="Temperature" stroke="#facc15" dot={false} strokeWidth={2} />
                                    <ReferenceLine yAxisId="left" x={results.injectionDepth} stroke="red" strokeDasharray="4 4" label={{ value: `Injection @ ${results.injectionDepth.toFixed(0)}ft`, fill: 'red', position: 'insideTop' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        
                        <div className="bg-slate-800/50 p-4 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center"><Cpu className="w-6 h-6 mr-2 text-lime-400" />Valve Spacing Design</h3>
                            <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-lime-300 uppercase bg-black/20">
                                    <tr>
                                        <th scope="col" className="px-4 py-2">Valve #</th>
                                        <th scope="col" className="px-4 py-2">Depth (ft)</th>
                                        <th scope="col" className="px-4 py-2">P @ Valve (psi)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.valveDepths.map((valve, index) => (
                                        <tr key={index} className="border-b border-slate-700">
                                            <td className="px-4 py-2 font-medium text-white">{index + 1}</td>
                                            <td className="px-4 py-2 text-slate-300">{valve.depth.toFixed(0)}</td>
                                            <td className="px-4 py-2 text-slate-300">{valve.pressure.toFixed(0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default GasLiftDesign;