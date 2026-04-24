import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CollapsibleSection from '@/components/nodalanalysis/CollapsibleSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculateRodPumpDesign } from '@/utils/rodPumpCalculations';
import { Settings, Droplet, Wrench, BarChart2, TrendingUp, Hammer as Drill } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-800/80 backdrop-blur-sm p-2 border border-lime-400/50 rounded-md shadow-lg">
                <p className="label text-lime-300">{`${payload[0].name}: ${payload[0].value.toFixed(0)} lbs`}</p>
                <p className="label text-slate-400">{`Position: ${label.toFixed(2)} in`}</p>
            </div>
        );
    }
    return null;
};

const RodPumpDesign = ({ inputs, setInputs }) => {
    const [results, setResults] = useState(null);

    useEffect(() => {
        const designResults = calculateRodPumpDesign(inputs);
        setResults(designResults);
    }, [inputs]);

    const handleInputChange = (key, value) => {
        setInputs(prev => ({ ...prev, [key]: value }));
    };
    
    const handleFloatInputChange = (key, value) => {
        setInputs(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="lg:col-span-1 bg-slate-800/50 p-4 rounded-lg"
            >
                <h2 className="text-xl font-bold text-white mb-4">Rod Pump Design Inputs</h2>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    <CollapsibleSection title="Well & Production" icon={<Settings />} defaultOpen>
                        <div className="grid grid-cols-2 gap-2 p-1">
                            <div><Label className="text-slate-200">Pump Depth (ft)</Label><Input type="number" value={inputs.pumpDepth} onChange={e => handleFloatInputChange('pumpDepth', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Liquid Rate (bbl/d)</Label><Input type="number" value={inputs.liquidRate} onChange={e => handleFloatInputChange('liquidRate', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Tubing P (psi)</Label><Input type="number" value={inputs.tubingPressure} onChange={e => handleFloatInputChange('tubingPressure', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Casing P (psi)</Label><Input type="number" value={inputs.casingPressure} onChange={e => handleFloatInputChange('casingPressure', e.target.value)} className="text-slate-900 bg-white" /></div>
                        </div>
                    </CollapsibleSection>
                    <CollapsibleSection title="Fluid Properties" icon={<Droplet />}>
                       <div className="grid grid-cols-2 gap-2 p-1">
                            <div><Label className="text-slate-200">Water Cut (%)</Label><Input type="number" value={inputs.waterCut} onChange={e => handleFloatInputChange('waterCut', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Oil API</Label><Input type="number" value={inputs.oilApi} onChange={e => handleFloatInputChange('oilApi', e.target.value)} className="text-slate-900 bg-white" /></div>
                       </div>
                    </CollapsibleSection>
                     <CollapsibleSection title="Equipment Design" icon={<Wrench />} defaultOpen>
                       <div className="space-y-2 p-1">
                            <div><Label className="text-slate-200">Stroke Length (in)</Label><Input type="number" value={inputs.strokeLength} onChange={e => handleFloatInputChange('strokeLength', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Pumping Speed (spm)</Label><Input type="number" value={inputs.pumpingSpeed} onChange={e => handleFloatInputChange('pumpingSpeed', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Pump Diameter (in)</Label><Input type="number" value={inputs.pumpDiameter} onChange={e => handleFloatInputChange('pumpDiameter', e.target.value)} className="text-slate-900 bg-white" /></div>
                       </div>
                    </CollapsibleSection>
                    <CollapsibleSection title="Rod String" icon={<Drill />}>
                       <div className="space-y-2 p-1">
                            <div><Label className="text-slate-200">Rod Sizes (in, comma-sep)</Label><Input type="text" value={inputs.rodString} onChange={e => handleInputChange('rodString', e.target.value)} className="text-slate-900 bg-white" /></div>
                            <div><Label className="text-slate-200">Percentages (%, comma-sep)</Label><Input type="text" value={inputs.rodPercentages} onChange={e => handleInputChange('rodPercentages', e.target.value)} className="text-slate-900 bg-white" /></div>
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
                                    <p className="text-sm text-slate-300">Peak Load</p>
                                    <p className="text-2xl font-bold text-white">{results.peakLoad.toFixed(0)} <span className="text-base font-normal text-slate-400">lbs</span></p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg">
                                    <p className="text-sm text-slate-300">Min Load</p>
                                    <p className="text-2xl font-bold text-white">{results.minLoad.toFixed(0)} <span className="text-base font-normal text-slate-400">lbs</span></p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg">
                                    <p className="text-sm text-slate-300">Gearbox Torque</p>
                                    <p className="text-2xl font-bold text-white">{results.gearboxTorque.toFixed(0)} <span className="text-base font-normal text-slate-400">in-lbs</span></p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg">
                                    <p className="text-sm text-slate-300">Pump Fillage</p>
                                    <p className="text-2xl font-bold text-white">{results.pumpFillage.toFixed(1)} <span className="text-base font-normal text-slate-400">%</span></p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-slate-800/50 p-4 rounded-lg">
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center"><BarChart2 className="w-6 h-6 mr-2 text-lime-400" />Surface Dynamometer Card</h3>
                                 <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={results.surfaceCard} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                                        <XAxis dataKey="position" stroke="#a3e635" type="number" domain={['dataMin', 'dataMax']} label={{ value: 'Position (in)', position: 'insideBottom', offset: -5, fill: '#a3e635' }}/>
                                        <YAxis stroke="#38bdf8" label={{ value: 'Load (lbs)', angle: -90, position: 'insideLeft', fill: '#38bdf8' }}/>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="load" name="Surface Load" stroke="#38bdf8" dot={false} strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-lg">
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center"><BarChart2 className="w-6 h-6 mr-2 text-lime-400" />Downhole Dynamometer Card</h3>
                                 <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={results.downholeCard} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.2)" />
                                        <XAxis dataKey="position" stroke="#a3e635" type="number" domain={['dataMin', 'dataMax']} label={{ value: 'Position (in)', position: 'insideBottom', offset: -5, fill: '#a3e635' }}/>
                                        <YAxis stroke="#facc15" label={{ value: 'Load (lbs)', angle: -90, position: 'insideLeft', fill: '#facc15' }}/>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="load" name="Downhole Load" stroke="#facc15" dot={false} strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
};

export default RodPumpDesign;