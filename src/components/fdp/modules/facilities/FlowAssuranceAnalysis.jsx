import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateFlowAssuranceRisk } from '@/utils/fdp/facilitiesCalculations';
import { ThermometerSnowflake, Activity } from 'lucide-react';

/**
 * EC6-0. This ran against mock fluid properties (28 API, 10 ppm H2S), so
 * every facility in every plan came back with Corrosion High, and the three
 * tiles above the hazard list were literals that contradicted the list
 * underneath them (the tile said Hydrate Medium while the list said
 * Hydrates High). It reads the plan's own fluid properties now, and the
 * tiles are the hazards the engine actually found.
 */
const FlowAssuranceAnalysis = ({ facility, fluidProps }) => {
    if (!facility) return <div className="text-slate-500 p-4">Select a facility to view analysis.</div>;

    const properties = fluidProps || {};
    const analysis = calculateFlowAssuranceRisk(facility, properties);
    const severityOf = (type) => analysis.risks.find((r) => r.type === type)?.severity || 'None found';
    const hasApi = Number.isFinite(parseFloat(properties.api));
    const hasH2s = Number.isFinite(parseFloat(properties.h2s));

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                    <div className="flex items-center">
                        <ThermometerSnowflake className="w-5 h-5 mr-2 text-blue-300" />
                        Flow Assurance Risks
                    </div>
                    <span
                        data-testid="flow-assurance-score"
                        className={`text-sm px-3 py-1 rounded-full ${analysis.score > 0 ? 'bg-amber-900 text-amber-200' : 'bg-slate-800 text-slate-300'}`}
                    >
                        Hazard score {analysis.score}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* EC6-2: the engine retired its Low/Medium/High level, which
                        borrowed the risk register's words for a different
                        quantity. The score is shown with the triggers that
                        produced it and the hazards each one names. */}
                    <div className="text-xs text-slate-400" data-testid="flow-assurance-breakdown">
                        {analysis.contributions.length === 0 ? (
                            <p>Score 0: no screening trigger fired on this facility and fluid.</p>
                        ) : (
                            <ul className="space-y-1">
                                {analysis.contributions.map((c) => (
                                    <li key={c.trigger}>
                                        <span className="text-slate-200">{c.trigger}</span>: {c.points} point{c.points === 1 ? '' : 's'} ({c.hazards.join(', ')})
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                        <div className="p-2 bg-slate-800 rounded">
                            <div className="text-slate-500">Hydrates</div>
                            <div className="font-bold text-white">{severityOf('Hydrates')}</div>
                        </div>
                        <div className="p-2 bg-slate-800 rounded">
                            <div className="text-slate-500">Wax</div>
                            <div className="font-bold text-white">{severityOf('Wax')}</div>
                        </div>
                        <div className="p-2 bg-slate-800 rounded">
                            <div className="text-slate-500">Corrosion</div>
                            <div className={`font-bold ${severityOf('Corrosion') === 'High' ? 'text-red-400' : 'text-white'}`}>
                                {severityOf('Corrosion')}
                            </div>
                        </div>
                    </div>

                    <h4 className="text-sm font-medium text-slate-300 mb-2">Detected Hazards</h4>
                    <div className="space-y-2">
                        {analysis.risks.map((risk, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded border border-slate-700">
                                <div>
                                    <div className="text-white font-medium">{risk.type}</div>
                                    <div className="text-xs text-slate-400">Mitigation: {risk.mitigation}</div>
                                </div>
                                <div className={`text-xs font-bold px-2 py-1 rounded ${risk.severity === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {risk.severity}
                                </div>
                            </div>
                        ))}
                        {analysis.risks.length === 0 && <p className="text-sm text-slate-500">No significant flow assurance risks detected based on current inputs.</p>}
                    </div>

                    <p className="text-xs text-slate-500 mt-4">
                        Screened on the plan's own fluid properties
                        {hasApi ? `: ${properties.api} API` : ': no API entered'}
                        {hasH2s ? `, ${properties.h2s} ppm H2S` : ', no H2S figure entered'}.
                        {!hasH2s ? ' Without an H2S figure the corrosion screen cannot fire.' : ''}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};

export default FlowAssuranceAnalysis;