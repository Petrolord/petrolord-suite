import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { LineChart, BarChart2, BrainCircuit, Database } from 'lucide-react';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import AnalyticsOverview from './analytics/AnalyticsOverview';
import DataAnalyticsEngine from './analytics/DataAnalyticsEngine';
import PredictiveAnalyticsEngine from './analytics/PredictiveAnalyticsEngine';

const AdvancedAnalyticsModule = () => {
    const { state } = useFDP();
    const [activeTool, setActiveTool] = useState('overview');

    const renderTool = () => {
        switch(activeTool) {
            case 'data': return <DataAnalyticsEngine />;
            case 'predictive': return <PredictiveAnalyticsEngine />;
            default: return <AnalyticsOverview onNavigate={setActiveTool} />;
        }
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Advanced Analytics</h2>
                    <p className="text-slate-400">Unlock insights using statistical analysis and machine learning.</p>
                </div>
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <Button 
                        variant={activeTool === 'overview' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTool('overview')}
                        className="text-xs"
                    >
                        <BarChart2 className="w-4 h-4 mr-2" /> Overview
                    </Button>
                    <Button 
                        variant={activeTool === 'data' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTool('data')}
                        className="text-xs"
                    >
                        <Database className="w-4 h-4 mr-2" /> Data Mining
                    </Button>
                    <Button 
                        variant={activeTool === 'predictive' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTool('predictive')}
                        className="text-xs"
                    >
                        <BrainCircuit className="w-4 h-4 mr-2" /> Predictive ML
                    </Button>
                </div>
            </div>

            {renderTool()}
        </div>
    );
};

export default AdvancedAnalyticsModule;