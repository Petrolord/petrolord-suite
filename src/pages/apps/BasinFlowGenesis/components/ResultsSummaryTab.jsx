import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Droplet, Flame } from 'lucide-react';
import { finalDepthProfile, eventsChartRows } from '../services/resultsView';
import { fmtDepth, fmtTemp, depthLabel, tempLabel, tempSymbol } from '../services/units';

const ResultsSummaryTab = ({ results, units = { depth: 'm', temp: 'C' } }) => {
    const zU = units.depth; const tU = units.temp;
    if (!results?.data || !results?.meta) {
        return <div className="h-full flex items-center justify-center text-pl-muted">Run a simulation to see the summary.</div>;
    }
    const { data, meta } = results;
    
    // Calculate simple stats
    // Find active source rocks
    const sourceLayers = meta.layers.filter((l, i) => {
        const maxTR = Math.max(...(data.transformation[i]?.map(t => t.value) || [0]));
        return maxTR > 0.1;
    });
    
    const { criticalMoment } = eventsChartRows(results);
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
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-pl-muted">Key Findings</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className={`p-1.5 rounded-full ${sourceLayers.length > 0 ? 'bg-pl-success-bg text-pl-success-text' : 'bg-pl-sunken text-pl-muted'}`}>
                                <Droplet className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-pl-text">Hydrocarbon Generation</h4>
                                <p className="text-xs text-pl-muted mt-1">
                                    {sourceLayers.length > 0 
                                        ? `${sourceLayers.length} source ${sourceLayers.length === 1 ? 'layer passed' : 'layers passed'} 10% transformation.` 
                                        : "No significant generation detected."}
                                </p>
                            </div>
                        </div>
                         <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded-full bg-pl-sunken text-pl-muted">
                                <Flame className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-pl-text">Thermal Maximum</h4>
                                <p className="text-xs text-pl-muted mt-1">
                                    Basin reached a maximum temperature of <span className="text-pl-text font-mono">{fmtTemp(maxTemp, tU)}{tempSymbol(tU)}</span>.
                                    Max maturity: <span className="text-pl-text font-mono">{maxMaturity.toFixed(2)} %Ro</span>.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-pl-muted">Active Source Rocks</CardTitle>
                </CardHeader>
                <CardContent>
                     {sourceLayers.length === 0 ? (
                        <div className="text-xs text-pl-muted italic">No active source rocks identified in this scenario.</div>
                     ) : (
                         <ul className="space-y-2">
                             {sourceLayers.map((layer, i) => (
                                 <li key={i} className="flex justify-between items-center text-xs border-b border-pl-border pb-2 last:border-0">
                                     <span className="text-pl-text">{layer.name}</span>
                                     <span className="text-pl-success-text">Active</span>
                                 </li>
                             ))}
                         </ul>
                     )}
                </CardContent>
            </Card>

            <Card className="col-span-1 md:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-pl-muted">Present day by layer</CardTitle>
                </CardHeader>
                <CardContent>
                    <table className="w-full text-xs text-pl-text" data-testid="bf-present-table">
                        <thead>
                            <tr className="text-pl-muted text-left">
                                <th className="font-normal">Layer</th>
                                <th className="font-normal text-right">{depthLabel(zU, 'Top')}</th>
                                <th className="font-normal text-right">{depthLabel(zU, 'Base')}</th>
                                <th className="font-normal text-right">{tempLabel(tU)}</th>
                                <th className="font-normal text-right">Ro (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {present.map((row) => (
                                <tr key={row.id} className="border-t border-pl-border">
                                    <td className="py-1">{row.name}</td>
                                    <td className="py-1 text-right font-mono" data-testid={`bf-present-top-${row.id}`}>{fmtDepth(row.top, zU)}</td>
                                    <td className="py-1 text-right font-mono">{fmtDepth(row.bottom, zU)}</td>
                                    <td className="py-1 text-right font-mono" data-testid={`bf-present-temp-${row.id}`}>{fmtTemp(row.temp, tU)}</td>
                                    <td className="py-1 text-right font-mono" data-testid={`bf-present-ro-${row.id}`}>{row.ro.toFixed(3)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
            <Card className="col-span-1 md:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-pl-muted">Reading the result</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3 items-start p-3 bg-pl-info-bg border border-pl-info/40 rounded">
                        <CheckCircle2 className="w-4 h-4 text-pl-info-text shrink-0 mt-0.5" />
                        <div className="text-xs text-pl-text">
                            {sourceLayers.length > 0
                                ? `Compare the present-day Ro column with measured vitrinite data in the Calibration tab, then fit the heat flow.${criticalMoment != null ? ` Expulsion peaked at ${criticalMoment} Ma (the critical moment on the Timing tab); traps must be in place by then.` : ''}`
                                : 'No source layer passed 10% transformation. Check the source rock TOC, HI and kerogen, the heat-flow history and the burial depth before reading charge from this model.'}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ResultsSummaryTab;