import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BrainCircuit } from 'lucide-react';

const PredictiveAnalytics = () => (
    <div className="h-full p-1 space-y-4">
        <h3 className="text-lg font-bold text-slate-200 flex items-center">
            <BrainCircuit className="w-5 h-5 mr-2 text-pink-400" /> Predictive Forecasts
        </h3>
        <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-950 border-slate-800">
                <CardContent className="p-4">
                    <h4 className="text-sm font-bold text-slate-300 mb-2">Churn Risk Analysis</h4>
                    <p className="text-xs text-slate-500 mb-4">AI-detected accounts at risk of cancellation.</p>
                    <div className="text-xl font-bold text-red-400">12 Accounts</div>
                    <div className="text-[10px] text-slate-400">High Probability ({'>'}80%)</div>
                </CardContent>
            </Card>
            <Card className="bg-slate-950 border-slate-800">
                <CardContent className="p-4">
                    <h4 className="text-sm font-bold text-slate-300 mb-2">Storage Growth Forecast</h4>
                    <p className="text-xs text-slate-500 mb-4">Predicted S3 usage over next 6 months.</p>
                    <div className="text-xl font-bold text-blue-400">+4.5 TB</div>
                    <div className="text-[10px] text-slate-400">Based on linear regression</div>
                </CardContent>
            </Card>
        </div>
    </div>
);

export default PredictiveAnalytics;