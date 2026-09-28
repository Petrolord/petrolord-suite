import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { irrReason } from '@/utils/fdp/planEconomics';
import { fmtMM } from '@/utils/fdp/formatting';
import { BarChart, LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { ChartPanel } from '@/components/ui/chart-panel';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';

/**
 * The plan's screening economics.
 *
 * EC6-0: this panel used to build its own case from an ILLUSTRATIVE twenty
 * year profile at $75/bbl, because CostModule passed it no settings. An
 * empty plan with no cost items showed NPV $3,314.2MM in green. It now
 * renders whatever computePlanEconomics made of the plan's own cost items,
 * concept and scenario, and says what is missing when the plan cannot be
 * costed yet.
 */
const EconomicsAnalysis = ({ economics }) => {
    if (!economics?.available) {
        const missing = economics?.missing || ['a costed plan'];
        return (
            <Card>
                <CardContent className="p-6 space-y-3">
                    <div className="flex items-center text-pl-warning-text text-sm font-medium">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        No economics yet for this plan
                    </div>
                    <p className="text-sm text-pl-text">
                        A screening NPV needs the plan's own cost, production and price. This plan is
                        still missing {missing.join(', ')}.
                    </p>
                    <p className="text-xs text-pl-muted">
                        Nothing is assumed on your behalf. Enter the missing item and the figures appear here.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const { metrics, basis, cashflow, inputs, abandonment, reservesCheck } = economics;
    const { npv, irr, payback } = metrics;
    const reason = irrReason(metrics);
    const abex = abandonment || { abandonmentSource: 'none', abandonmentMM: 0 };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <div className="p-4 text-center">
                        <div className="text-xs text-pl-muted uppercase mb-1">NPV @ {basis.discountRate}%</div>
                        <div className={`text-3xl font-bold ${npv >= 0 ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
                            {fmtMM(npv)}
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="p-4 text-center">
                        <div className="text-xs text-pl-muted uppercase mb-1">IRR</div>
                        <div className={`text-3xl font-bold ${irr !== null && irr >= 15 ? 'text-pl-success-text' : 'text-pl-warning-text'}`}>
                            {irr === null ? 'n/a' : `${irr.toFixed(1)}%`}
                        </div>
                        {reason && (
                            <div className="text-[11px] text-pl-muted mt-1" data-testid="irr-reason">{reason}</div>
                        )}
                    </div>
                </Card>
                <Card>
                    <div className="p-4 text-center">
                        <div className="text-xs text-pl-muted uppercase mb-1">Payback Period</div>
                        <div className="text-3xl font-bold font-pl-mono tabular-nums text-pl-text">
                            {payback === null ? 'never' : `${payback.toFixed(1)} yrs`}
                        </div>
                    </div>
                </Card>
            </div>

            <p className="text-xs text-pl-muted">
                CAPEX ${metrics.capex.toFixed(1)}MM and OPEX ${metrics.opex.toFixed(1)}MM a year from this
                plan's cost items, over {basis.years} producing years from {basis.conceptName} at
                ${basis.oilPrice}/bbl ({basis.scenarioName}). Post royalty ({basis.royaltyRate}%) and
                tax ({basis.taxRate}%), discounted mid year at {basis.discountRate}%, through the Suite
                screening economics engine.
            </p>

            {(reservesCheck?.warnings || []).filter((w) => w.code === 'profile-exceeds-p50').map((w) => (
                <div key={w.code} className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-3 text-xs text-pl-warning-text" data-testid="econ-reserves-warning">
                    {w.message}
                </div>
            ))}

            <p className="text-xs text-pl-muted" data-testid="abandonment-basis">
                {abex.abandonmentSource === 'none'
                    ? 'No end-of-life cost is in this case. '
                    : `End of life: $${abex.abandonmentMM.toFixed(1)}MM, charged in year ${abandonment.year}, the final production year. `}
                {abex.abandonmentBasis}
            </p>

            <ChartPanel title="Cash Flow Profile">
                    <ChartFrame height={300}>
                            <ComposedChart data={cashflow}>
                                <CartesianGrid {...GRID_STYLE} />
                                <XAxis dataKey="year" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                                <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} tickFormatter={(v) => Number(v).toFixed(0)}
                                    label={{ value: '$MM', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(y) => `Year ${y}`} formatter={(v) => `$${Number(v).toFixed(1)}MM`} />
                                <Legend {...LEGEND_PROPS} />
                                <Bar dataKey="netCashFlow" name="Net Cash Flow" fill="#3b82f6" barSize={20} />
                                <Line type="monotone" dataKey="cumulativeCashFlow" name="Cumulative CF" stroke="#10b981" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ChartFrame>
            </ChartPanel>
        </div>
    );
};

export default EconomicsAnalysis;
