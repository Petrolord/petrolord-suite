
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const classMetrics = [
    { facies: 'Sandstone', precision: 0.88, recall: 0.85, f1: 0.86 },
    { facies: 'Shale', precision: 0.92, recall: 0.90, f1: 0.91 },
    { facies: 'Limestone', precision: 0.85, recall: 0.88, f1: 0.86 },
    { facies: 'Dolomite', precision: 0.80, recall: 0.82, f1: 0.81 },
    { facies: 'Coal', precision: 0.95, recall: 0.90, f1: 0.92 },
];

const ValidationExplainabilityDashboard = () => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            <Card className="bg-slate-900 border-slate-800 flex flex-col">
                <CardHeader className="py-3 border-b border-slate-800">
                    <CardTitle className="text-sm font-medium">Confusion Matrix</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[300px] p-2 flex items-center justify-center text-slate-500">
                    Chart removed
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800 flex flex-col">
                <CardHeader className="py-3 border-b border-slate-800">
                    <CardTitle className="text-sm font-medium">Per-Facies Performance</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[300px] p-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={classMetrics} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                            <XAxis type="number" domain={[0, 1]} tick={{fill: '#94a3b8'}} />
                            <YAxis dataKey="facies" type="category" width={80} tick={{fill: '#94a3b8'}} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9' }} />
                            <Legend />
                            <Bar dataKey="precision" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Precision" />
                            <Bar dataKey="recall" fill="#a855f7" radius={[0, 4, 4, 0]} name="Recall" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
};

export default ValidationExplainabilityDashboard;
