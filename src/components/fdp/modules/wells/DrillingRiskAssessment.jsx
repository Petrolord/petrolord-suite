import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

/**
 * EC6-0. The three rows here were literals: Stuck Pipe, Loss of Circulation
 * and Shale Instability, with their phases and mitigations, printed on every
 * plan whether or not anyone had thought about drilling risk. They read the
 * plan's own risk register now, and an empty register says so.
 */
const DrillingRiskAssessment = ({ risks = [] }) => {
    const drillingRisks = (risks || []).filter((r) => {
        const haystack = `${r.source || ''} ${r.type || ''} ${r.category || ''}`.toLowerCase();
        return haystack.includes('drill');
    });

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium text-white flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" />
                    Drilling Risks
                </CardTitle>
            </CardHeader>
            <CardContent>
                {drillingRisks.length === 0 ? (
                    <p className="text-sm text-slate-400">
                        No drilling risks in this plan's register yet. Log them on the Risk Management
                        tab and they appear here.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-800 text-slate-400">
                                <tr>
                                    <th className="p-3">Risk</th>
                                    <th className="p-3">Probability</th>
                                    <th className="p-3">Impact</th>
                                    <th className="p-3">Mitigation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {drillingRisks.map((risk) => (
                                    <tr key={risk.id} className="hover:bg-slate-800/30">
                                        <td className="p-3 text-white font-medium">{risk.name || risk.description || 'Unnamed risk'}</td>
                                        <td className="p-3 text-slate-300">{risk.probability ?? '-'}</td>
                                        <td className="p-3 text-slate-300">{risk.impact ?? '-'}</td>
                                        <td className="p-3 text-slate-400">
                                            {risk.mitigation || risk.mitigationStrategy || 'None recorded'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default DrillingRiskAssessment;
