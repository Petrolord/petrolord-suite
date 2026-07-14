import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Droplet, Flame, TrendingUp } from 'lucide-react';

const GuidedResultsSummaryPanel = ({ results }) => {
    if (!results?.data || !results?.meta) {
        return <div className="h-full flex items-center justify-center text-slate-500">Run a simulation to see the summary.</div>;
    }
    const { data, meta } = results;

    // Determine simple insights
    const sourceLayers = meta.layers.filter((l, i) => {
        const maxTR = Math.max(...(data.transformation[i]?.map(t => t.value) || [0]));
        return maxTR > 0.1;
    });

    const maxTemp = Math.max(...data.temperature.flat().map(t => t.value));
    const maxMaturity = Math.max(...data.maturity.flat().map(t => t.value));

    return (
        <div className="h-full p-6 overflow-y-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Simulation Results Summary</h1>
                <p className="text-slate-400">Key findings from your basin model run.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="p-3 bg-red-900/20 rounded-full text-red-500">
                            <Flame className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">{maxTemp.toFixed(0)}°C</div>
                            <div className="text-xs text-slate-400">Max Temperature</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="p-3 bg-emerald-900/20 rounded-full text-emerald-500">
                            <Droplet className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">{sourceLayers.length}</div>
                            <div className="text-xs text-slate-400">Active Source Rocks</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="p-3 bg-blue-900/20 rounded-full text-blue-500">
                            <TrendingUp className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">{maxMaturity.toFixed(2)} %Ro</div>
                            <div className="text-xs text-slate-400">Peak Maturity</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <section>
                    <h3 className="text-lg font-bold text-white mb-3">Petroleum System Assessment</h3>
                    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 space-y-4">
                        {sourceLayers.length > 0 ? (
                            sourceLayers.map((layer, i) => (
                                <div key={i} className="flex items-start gap-3 pb-4 border-b border-slate-800 last:border-0 last:pb-0">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-bold text-white">{layer.name} - Working Source</h4>
                                        <p className="text-sm text-slate-400 mt-1">
                                            Reached maturity window. Generation potential confirmed.
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-white">No Active Source Rocks</h4>
                                    <p className="text-sm text-slate-400 mt-1">
                                        Simulation indicates source rocks remained immature or were not defined.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <section>
                    <h3 className="text-lg font-bold text-white mb-3">Recommendations</h3>
                    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 text-sm text-slate-300">
                        <ul className="list-disc pl-4 space-y-2">
                            <li>Review burial history plots to confirm timing of trap formation vs charge.</li>
                            <li>Check transformation ratio charts to quantify expelled volumes.</li>
                            <li>Consider running a sensitivity analysis on Heat Flow if maturity is uncertain.</li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default GuidedResultsSummaryPanel;