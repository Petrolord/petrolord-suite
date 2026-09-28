import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, Droplet, Flame, TrendingUp } from 'lucide-react';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import { fmtTemp, tempSymbol } from '../services/units';

const GuidedResultsSummaryPanel = ({ results }) => {
    const { units } = useBasinFlow();
    if (!results?.data || !results?.meta) {
        return <div className="h-full flex items-center justify-center text-pl-muted">Run a simulation to see the summary.</div>;
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
                <h1 className="text-2xl font-bold text-pl-text">Simulation Results Summary</h1>
                <p className="text-pl-muted">Key findings from your basin model run.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="p-3 bg-pl-sunken rounded-full text-pl-primary-text">
                            <Flame className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-pl-text">{fmtTemp(maxTemp, units.temp, 0)}{tempSymbol(units.temp)}</div>
                            <div className="text-xs text-pl-muted">Max Temperature</div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="p-3 bg-pl-sunken rounded-full text-pl-primary-text">
                            <Droplet className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-pl-text">{sourceLayers.length}</div>
                            <div className="text-xs text-pl-muted">Active Source Rocks</div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 flex items-center gap-4">
                        <div className="p-3 bg-pl-sunken rounded-full text-pl-primary-text">
                            <TrendingUp className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-pl-text">{maxMaturity.toFixed(2)} %Ro</div>
                            <div className="text-xs text-pl-muted">Peak Maturity</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <section>
                    <h3 className="text-lg font-bold text-pl-text mb-3">Petroleum System Assessment</h3>
                    <div className="bg-pl-surface rounded-lg border border-pl-border p-4 space-y-4">
                        {sourceLayers.length > 0 ? (
                            sourceLayers.map((layer, i) => (
                                <div key={i} className="flex items-start gap-3 pb-4 border-b border-pl-border last:border-0 last:pb-0">
                                    <CheckCircle2 className="w-5 h-5 text-pl-success-text mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-bold text-pl-text">{layer.name} - Working Source</h4>
                                        <p className="text-sm text-pl-muted mt-1">
                                            Reached maturity window. Generation potential confirmed.
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-pl-warning-text mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-bold text-pl-text">No Active Source Rocks</h4>
                                    <p className="text-sm text-pl-muted mt-1">
                                        Simulation indicates source rocks remained immature or were not defined.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <section>
                    <h3 className="text-lg font-bold text-pl-text mb-3">Recommendations</h3>
                    <div className="bg-pl-surface rounded-lg border border-pl-border p-4 text-sm text-pl-text">
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