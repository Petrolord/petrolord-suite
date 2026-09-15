import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X, AlertCircle } from 'lucide-react';
import { planReservesP50 } from '@/utils/fdp/fdpCalculations';

const DataItem = ({ label, value, status }) => (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
        <span className="text-sm text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">{value || '-'}</span>
            {status === 'ok' && <Check className="w-4 h-4 text-green-500" />}
            {status === 'missing' && <X className="w-4 h-4 text-red-500" />}
            {status === 'warning' && <AlertCircle className="w-4 h-4 text-yellow-500" />}
        </div>
    </div>
);

const FDPDataCompilation = ({ state }) => {
    // EC6-0: the reserves come from the table, per fluid. This used to read
    // `reserves.p50`, a key the plan has never written, and printed
    // "undefined MMbbl" with a red cross on a fully entered plan.
    const oilP50 = planReservesP50(state);
    const gasP50 = planReservesP50(state, 'Gas');
    const reservesLabel = [
        oilP50 > 0 ? `${oilP50} MMbbl oil` : null,
        gasP50 > 0 ? `${gasP50} Bcf gas` : null,
    ].filter(Boolean).join(', ') || 'Not entered';

    return (
        <div className="space-y-4">
            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Compiled Data Points</h3>
                    
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">General & Subsurface</h4>
                            <DataItem label="Project Name" value={state.fieldData?.fieldName} status={state.fieldData?.fieldName ? 'ok' : 'missing'} />
                            <DataItem label="Reserves (P50)" value={reservesLabel} status={oilP50 > 0 || gasP50 > 0 ? 'ok' : 'missing'} />
                            <DataItem label="Fluid Type" value={state.subsurface?.fluidProps?.type} status={'ok'} />
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Development Plan</h4>
                            <DataItem label="Selected Concept" value={state.concepts?.list?.find(c=>c.id===state.concepts.selectedId)?.name || 'None'} status={state.concepts?.selectedId ? 'ok' : 'warning'} />
                            <DataItem label="Well Count" value={state.wells?.list?.length} status={state.wells?.list?.length > 0 ? 'ok' : 'warning'} />
                            <DataItem label="Facilities" value={state.facilities?.list?.length} status={state.facilities?.list?.length > 0 ? 'ok' : 'warning'} />
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Economics & Risk</h4>
                            <DataItem label="CAPEX Estimate" value={`$${state.economics?.capex ?? 0}M`} status={state.economics?.capex > 0 ? 'ok' : 'missing'} />
                            <DataItem
                                label="NPV"
                                value={state.economics?.available === false
                                    ? `Not available: missing ${(state.economics.missing || []).join(', ')}`
                                    : `$${state.economics?.npv}M`}
                                status={state.economics?.available === false ? 'warning' : 'ok'}
                            />
                            <DataItem label="Risk Register" value={`${state.risks?.length + (state.hseData?.hazards?.length||0)} items`} status={(state.risks?.length || state.hseData?.hazards?.length) ? 'ok' : 'warning'} />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default FDPDataCompilation;