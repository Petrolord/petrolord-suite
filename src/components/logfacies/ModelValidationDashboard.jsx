
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ModelValidationDashboard = () => {
    const labels = ['Sand', 'Shale', 'Lime', 'Dolo', 'Coal'];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle>Confusion Matrix</CardTitle></CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center text-slate-500">
                    Chart removed
                </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle>Class Performance Metrics</CardTitle></CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {labels.map((label, i) => (
                            <div key={i} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-300">{label}</span>
                                    <span className="text-slate-400">F1-Score: {(0.8 + Math.random() * 0.15).toFixed(2)}</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500" 
                                        style={{ width: `${(0.8 + Math.random() * 0.15) * 100}%` }} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ModelValidationDashboard;
