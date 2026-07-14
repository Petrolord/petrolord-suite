import React from 'react';
import { PlotlyStressProfileChart } from './charts/StressCharts';
import { PlotlyMudWeightWindowChart } from './charts/PressureCharts';

const VisualizationPanel = () => {
    return (
        <div className="h-full p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 h-[500px]">
                <PlotlyStressProfileChart />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 h-[500px]">
                <PlotlyMudWeightWindowChart />
            </div>
        </div>
    );
};

export default VisualizationPanel;