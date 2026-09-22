import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateFacilityCost } from '@/utils/fdp/facilitiesCalculations';
import { DollarSign } from 'lucide-react';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull, MONEY_MM_DECIMALS } from '@/lib/fullPrecision';

const FacilitiesCostEstimation = ({ facility }) => {
    // W3 (D3): Full precision prints the estimate in $MM at 4 decimals.
    const { full } = useFullPrecision();
    const mm = (v) => (full ? formatFull(v, MONEY_MM_DECIMALS) : v.toFixed(1));
    if (!facility) return <div className="text-slate-500 p-4">Select a facility to view costs.</div>;

    const costs = calculateFacilityCost(facility);
    const lifeOfField = facility.designLife || 20;
    const totalLifecycle = costs.capex + (costs.opex * lifeOfField) + costs.decommissioning;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4">
                        <div className="text-xs text-slate-400 uppercase">Total CAPEX</div>
                        <div className="text-2xl font-bold text-orange-400">${mm(costs.capex)}M</div>
                        <div className="text-xs text-slate-500 mt-1">Initial investment</div>
                    </div>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4">
                        <div className="text-xs text-slate-400 uppercase">Annual OPEX</div>
                        <div className="text-2xl font-bold text-orange-300">${mm(costs.opex)}M</div>
                        <div className="text-xs text-slate-500 mt-1">Per year operation</div>
                    </div>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4">
                        <div className="text-xs text-slate-400 uppercase">Decommissioning</div>
                        <div className="text-2xl font-bold text-orange-200" data-testid="decommissioning">
                            ${mm(costs.decommissioning)}M
                        </div>
                        <div className="text-xs text-slate-500 mt-1">15 percent of the sized capex</div>
                    </div>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <div className="p-4">
                        <div className="text-xs text-slate-400 uppercase">Lifecycle Cost</div>
                        <div className="text-2xl font-bold text-white">${mm(totalLifecycle)}M</div>
                        <div className="text-xs text-slate-500 mt-1">{lifeOfField} years + decom</div>
                    </div>
                </Card>
            </div>

            {/* EC6-0: this breakdown was three literal bars, 35 / 45 / 20
                percent, printed for every facility type including onshore
                plants and subsea tie-backs, against an estimate nobody had
                split that way. A split the studio does not compute is not
                shown. */}
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-sm font-medium text-white flex items-center">
                        <DollarSign className="w-4 h-4 mr-2 text-green-500" />
                        What is in this estimate
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-300">
                        A class 5 screening figure from the facility type and its nameplate: a base
                        cost for the type, scaled by size to the power 0.7 for capex and 0.6 for
                        opex, with decommissioning at 15 percent of the base. There is no
                        hull-and-topsides split behind it, so none is drawn.
                    </p>
                    <p className="text-xs text-slate-500 mt-3">
                        The facility list shows the capex you entered; this card shows what the
                        screening estimate makes of the same facility. They are two different
                        numbers and they are meant to be compared.
                    </p>
                    {/* EC6-8 (engines #191): this estimate is no longer shown and
                        left out of the cash flow. */}
                    <p className="text-xs text-slate-400 mt-3" data-testid="decommissioning-in-economics">
                        The decommissioning figure is charged in the final production year of the plan's
                        economics when the plan carries no ABEX cost item. Enter an ABEX cost item to use
                        your own figure instead.
                    </p>
                </CardContent>
            </Card>

        </div>
    );
};

export default FacilitiesCostEstimation;