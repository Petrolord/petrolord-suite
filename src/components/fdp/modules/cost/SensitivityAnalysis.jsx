import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

/**
 * NPV sensitivity for the plan in front of the user.
 *
 * EC6-0: every bar here used to be a literal. The chart was drawn around
 * "Base Case ($245MM)" whatever the plan said, and the caption said so in
 * dollars that belonged to no project. It now plots the screening engine's
 * own sweep (plus and minus 30 percent on each driver) of the same case the
 * NPV card above it reports.
 */
const SensitivityAnalysis = ({ economics }) => {
    if (!economics?.available) {
        return (
            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-6">
                    <div className="flex items-center text-amber-400 text-sm font-medium mb-2">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        No sensitivity yet
                    </div>
                    <p className="text-sm text-slate-300">
                        The sweep runs on this plan's own case. It appears once the plan has the
                        cost, production and price the NPV needs.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const base = economics.metrics.npv;
    const tornadoData = economics.sensitivity
        .map((d) => ({
            name: `${d.name} (+/- 30%)`,
            min: Math.min(d.lowParamNPV, d.highParamNPV) - base,
            max: Math.max(d.lowParamNPV, d.highParamNPV) - base,
        }))
        .sort((a, b) => (b.max - b.min) - (a.max - a.min));

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white text-sm">NPV Sensitivity (Tornado Chart)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            layout="vertical"
                            data={tornadoData}
                            margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
                            stackOffset="sign"
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                            <XAxis type="number" stroke="#94a3b8" />
                            <YAxis dataKey="name" type="category" stroke="#94a3b8" width={120} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                            />
                            <Bar dataKey="min" fill="#ef4444" name="Downside Impact" stackId="a">
                                {tornadoData.map((entry, index) => (
                                    <Cell key={`cell-min-${index}`} fill="#ef4444" />
                                ))}
                            </Bar>
                            <Bar dataKey="max" fill="#22c55e" name="Upside Impact" stackId="a">
                                {tornadoData.map((entry, index) => (
                                    <Cell key={`cell-max-${index}`} fill="#22c55e" />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500 text-center mt-4">
                    Change in NPV ($MM) against this plan's base case (${base.toFixed(1)}MM), each
                    driver swept plus and minus 30 percent.
                </p>
            </CardContent>
        </Card>
    );
};

export default SensitivityAnalysis;
