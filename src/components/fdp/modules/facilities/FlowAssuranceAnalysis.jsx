import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateFlowAssuranceRisk } from '@/utils/fdp/facilitiesCalculations';
import { ThermometerSnowflake, Activity } from 'lucide-react';

/**
 * EC6-3 (engines #191). The corrosion tile used to read the severity of a
 * hazard that fired on ANY H2S above zero, so 1 ppm at 100 psia read as
 * severe as 5 percent at 5000 psia and a blank H2S read as sweet. The
 * engine screens sour service on the H2S partial pressure against the
 * NACE MR0175 threshold, and the tile reports that screen's own verdict.
 */
const CORROSION_VERDICT = {
    'not-measured': 'H2S not measured',
    'sour-severity-needs-pressure': 'Pressure needed',
    'below-sour-threshold': 'Below sour threshold',
    'sour-service': 'Sour service',
};

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
    let analysis = null;
    let refusal = null;
    try {
        analysis = calculateFlowAssuranceRisk(facility, properties);
    } catch (err) {
        refusal = err.message;
    }
    if (refusal) {
        return (
            <div role="alert" className="flex items-start gap-2 rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
                <Activity className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                <span>The flow assurance screen cannot run: {refusal}.</span>
            </div>
        );
    }
    const severityOf = (type) => analysis.risks.find((r) => r.type === type)?.severity || 'None found';
    const hasApi = Number.isFinite(parseFloat(properties.api));
    const corrosion = analysis.corrosion;

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
                            <div className={`font-bold ${corrosion.status === 'sour-service' ? 'text-red-400' : 'text-white'}`}
                                data-testid="corrosion-verdict">
                                {CORROSION_VERDICT[corrosion.status] || corrosion.status}
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

                    <div className="text-xs text-slate-400 mt-4 space-y-2" data-testid="corrosion-screen">
                        <p>
                            <span className="text-slate-300">Sour service screen:</span> {corrosion.message}
                        </p>
                        <p className="text-slate-500">
                            Screened on the plan's own fluid properties
                            {hasApi ? `: ${properties.api} API` : ': no API entered'}. The corrosion
                            trigger is the H2S partial pressure against the {corrosion.standard} threshold
                            of {corrosion.thresholdPsia} psia ({corrosion.thresholdKpa} kPa), so it takes
                            both an H2S concentration and an operating pressure.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default FlowAssuranceAnalysis;