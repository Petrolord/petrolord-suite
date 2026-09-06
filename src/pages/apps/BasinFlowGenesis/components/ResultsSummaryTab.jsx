import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Droplet, Flame } from 'lucide-react';
import { finalDepthProfile } from '../services/resultsView';

const ResultsSummaryTab = ({ results }) => {
    if (!results?.data || !results?.meta) {
        return <div className="h-full flex items-center justify-center text-slate-500">Run a simulation to see the summary.</div>;
    }
    const { data, meta } = results;
    
    // Calculate simple stats
    // Find active source rocks
    const sourceLayers = meta.layers.filter((l, i) => {
        const maxTR = Math.max(...(data.transformation[i]?.map(t => t.value) || [0]));
        return maxTR > 0.1;
    });
    
    const maxTemp = Math.max(...data.temperature.flat().map(t => t.value));
    const maxMaturity = Math.max(...data.maturity.flat().map(t => t.value));
    // present-day state per layer, shallow to deep (BF0: the number a
    // tester compares with a measured Ro profile)
    const present = finalDepthProfile(results).map((row) => ({
        ...row,
        id: meta.layers.find((l) => l.name === row.name)?.id || row.name,
    }));

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-y-auto pb-10">
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Key Findings</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className={`p-1.5 rounded-full ${sourceLayers.length > 0 ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                <Droplet className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white">Hydrocarbon Generation</h4>
                                <p className="text-xs text-slate-400 mt-1">
                                    {sourceLayers.length > 0 
                                        ? `${sourceLayers.length} layer(s) reached generation window.` 
                                        : "No significant generation detected."}
                                </p>
                            </div>
                        </div>
                         <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded-full bg-red-900/50 text-red-400">
                                <Flame className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white">Thermal Maximum</h4>
                                <p className="text-xs text-slate-400 mt-1">
                                    Basin reached a maximum temperature of <span className="text-white font-mono">{maxTemp.toFixed(1)}°C</span>.
                                    Max maturity: <span className="text-white font-mono">{maxMaturity.toFixed(2)} %Ro</span>.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Active Source Rocks</CardTitle>
                </CardHeader>
                <CardContent>
                     {sourceLayers.length === 0 ? (
                        <div className="text-xs text-slate-500 italic">No active source rocks identified in this scenario.</div>
                     ) : (
                         <ul className="space-y-2">
                             {sourceLayers.map((layer, i) => (
                                 <li key={i} className="flex justify-between items-center text-xs border-b border-slate-800 pb-2 last:border-0">
                                     <span className="text-slate-200">{layer.name}</span>
                                     <span className="text-green-400">Active</span>
                                 </li>
                             ))}
                         </ul>
                     )}
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800 col-span-1 md:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Present day by layer</CardTitle>
                </CardHeader>
                <CardContent>
                    <table className="w-full text-xs text-slate-200" data-testid="bf-present-table">
                        <thead>
                            <tr className="text-slate-500 text-left">
                                <th className="font-normal">Layer</th>
                                <th className="font-normal text-right">Top (m)</th>
                                <th className="font-normal text-right">Base (m)</th>
                                <th className="font-normal text-right">Temperature (°C)</th>
                                <th className="font-normal text-right">Ro (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {present.map((row) => (
                                <tr key={row.id} className="border-t border-slate-800">
                                    <td className="py-1">{row.name}</td>
                                    <td className="py-1 text-right font-mono">{row.top.toFixed(0)}</td>
                                    <td className="py-1 text-right font-mono">{row.bottom.toFixed(0)}</td>
                                    <td className="py-1 text-right font-mono">{row.temp.toFixed(1)}</td>
                                    <td className="py-1 text-right font-mono" data-testid={`bf-present-ro-${row.id}`}>{row.ro.toFixed(3)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800 col-span-1 md:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400">Reading the result</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3 items-start p-3 bg-blue-900/10 border border-blue-900/30 rounded">
                        <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-300">
                            {sourceLayers.length > 0
                                ? `${sourceLayers.length} source layer(s) passed 10% transformation. Compare the present-day Ro column with measured vitrinite data in the Calibration tab, then fit the heat flow.`
                                : 'No source layer passed 10% transformation. Check the source rock TOC, HI and kerogen, the heat-flow history and the burial depth before reading charge from this model.'}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ResultsSummaryTab;