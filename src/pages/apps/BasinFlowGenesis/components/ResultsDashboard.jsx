import React from 'react';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import ResultsPanel from './ResultsPanel';
import GuidedResultsSummaryPanel from './GuidedResultsSummaryPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExportDialog from './common/ExportDialog';

const ResultsDashboard = ({ onBack }) => {
    const { state } = useBasinFlow();
    const { results } = state;
    const [exportOpen, setExportOpen] = React.useState(false);

    return (
        <div className="h-full flex flex-col bg-slate-950">
            <div className="border-b border-slate-800 p-4 flex justify-between items-center bg-slate-900">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <Button variant="ghost" size="icon" onClick={onBack}>
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-lg font-bold text-white">Simulation Results</h1>
                        <p className="text-xs text-slate-400">
                            Project: {state.project?.name || 'Untitled'} | Scenario: {state.activeScenarioId || 'Current'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" size="sm" data-testid="bf-dashboard-export" onClick={() => setExportOpen(true)}>
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                </div>
                <ExportDialog isOpen={exportOpen} onClose={() => setExportOpen(false)} />
            </div>

            <div className="flex-1 overflow-hidden">
                <Tabs defaultValue="summary" className="h-full flex flex-col">
                    <div className="px-6 pt-4 bg-slate-900 border-b border-slate-800 shrink-0">
                        <TabsList className="bg-slate-950 border border-slate-800">
                            <TabsTrigger value="summary">Dashboard</TabsTrigger>
                            <TabsTrigger value="detailed">Detailed Plots</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        <TabsContent value="summary" className="h-full m-0 absolute inset-0 overflow-y-auto">
                            <GuidedResultsSummaryPanel results={results} />
                        </TabsContent>
                        <TabsContent value="detailed" className="h-full m-0 absolute inset-0">
                            <ResultsPanel />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    );
};

export default ResultsDashboard;