import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Layers, Database, GitBranch, Play, Activity, Upload, ChevronLeft, ChevronRight, BarChart2, BookOpen, Layout, Download, HelpCircle } from 'lucide-react';
import { DragDropContext } from 'react-beautiful-dnd';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { ValidationEngine } from '../services/ValidationEngine';
import SimulationRunDialog from './common/SimulationRunDialog';
import ExportDialog from './common/ExportDialog'; 
import HelpCenter from './help/HelpCenter'; // Added
import { useToast } from '@/components/ui/use-toast';

import LayerPropertyEditor from './expert/LayerPropertyEditor';
import CalibrationView from './expert/CalibrationView';
import ScenarioManager from './expert/ScenarioManager';
import TemplateLibrary from './expert/TemplateLibrary';
import BatchProcessor from './expert/BatchProcessor';
import ResultsPanel from './ResultsPanel';
import MultiWellManager from './multiwell/MultiWellManager';
import SensitivityAnalysisView from './sensitivity/SensitivityAnalysisView';
import AdvancedDataImport from './import/AdvancedDataImport';

const ExpertModePanel = () => {
    const { dispatch, runSimulation, state } = useBasinFlow();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('properties');
    const [showMultiWell, setShowMultiWell] = useState(true);
    const [isDndReady, setIsDndReady] = useState(false);
    
    const [isSimDialogOpen, setIsSimDialogOpen] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false); 
    const [isHelpOpen, setIsHelpOpen] = useState(false); // Added

    // Fix for React StrictMode with react-beautiful-dnd
    useEffect(() => {
        const animation = requestAnimationFrame(() => setIsDndReady(true));
        return () => {
            cancelAnimationFrame(animation);
            setIsDndReady(false);
        };
    }, []);

    // Global Keyboard Shortcut for Help
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'F1') {
                e.preventDefault();
                setIsHelpOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleRunClick = () => {
        // Validate Project
        const validation = ValidationEngine.validateProject(state);
        if (!validation.isValid) {
            toast({
                variant: "destructive",
                title: "Validation Failed",
                description: (
                    <ul className="list-disc pl-4 text-xs">
                        {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                )
            });
            return;
        }
        
        if (validation.warnings.length > 0) {
             toast({
                title: "Warning",
                description: "Simulation proceeding with warnings: " + validation.warnings[0],
                className: "bg-amber-900/50 border-amber-500/50 text-amber-200"
            });
        }

        setIsSimDialogOpen(true);
    };

    const handleSimulationComplete = () => {
        setActiveTab('results'); // Auto-switch to results
        toast({ title: "Simulation Success", description: "New results available." });
    };

    const onDragEnd = (result) => {
        if (!result.destination) return;

        const { source, destination } = result;
        
        // Only handle reordering if dropping in the same list
        if (source.droppableId === 'stratigraphy-list' && destination.droppableId === 'stratigraphy-list') {
            const newLayers = Array.from(state.stratigraphy);
            const [reorderedItem] = newLayers.splice(source.index, 1);
            newLayers.splice(destination.index, 0, reorderedItem);

            dispatch({ type: 'REORDER_LAYERS', payload: newLayers });
        }
    };

    return (
        <>
            <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
                {/* Header */}
                <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900 shadow-sm shrink-0 z-20">
                    <div className="flex items-center gap-4 overflow-hidden">
                        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'SET_MODE', payload: null })} className="shrink-0">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Home
                        </Button>
                        <div className="h-6 w-px bg-slate-700 shrink-0" />
                        <h1 className="font-semibold text-white truncate hidden md:block">Expert Mode Workspace</h1>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Help Button */}
                        <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(true)} className="text-slate-400 hover:text-white mr-1" title="Help Center (F1)">
                            <HelpCircle className="w-5 h-5" />
                        </Button>

                        <Button variant="ghost" size="sm" onClick={() => setShowMultiWell(!showMultiWell)} className={`hidden md:flex ${showMultiWell ? 'bg-slate-800' : ''}`}>
                            {showMultiWell ? <ChevronLeft className="w-4 h-4 mr-2"/> : <ChevronRight className="w-4 h-4 mr-2"/>}
                            {showMultiWell ? 'Hide Wells' : 'Show Wells'}
                        </Button>
                        <div className="h-6 w-px bg-slate-700 mx-2 hidden md:block" />
                        
                        <Button variant="outline" size="sm" onClick={() => setIsExportDialogOpen(true)} className="hidden sm:flex">
                            <Download className="w-4 h-4 mr-2" /> Export
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => dispatch({ type: 'SAVE_SCENARIO', payload: { name: `Run ${new Date().toLocaleTimeString()}` } })}
                            className="hidden sm:flex"
                        >
                            Save Scenario
                        </Button>
                        <Button 
                            onClick={handleRunClick} 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[100px]"
                        >
                            <Play className="w-4 h-4 mr-2" /> Simulate
                        </Button>
                    </div>
                </div>

                {/* Main Workspace */}
                <div className="flex-1 overflow-hidden flex relative w-full">
                    {/* Multi-Well Sidebar */}
                    <div className={`shrink-0 h-full transition-all duration-300 border-r border-slate-800 bg-slate-900 relative z-10 ${showMultiWell ? 'w-72 translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden'}`}>
                        <div className="w-72 h-full">
                            <MultiWellManager />
                        </div>
                    </div>

                    {isDndReady ? (
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full overflow-hidden min-w-0 w-full">
                                <div className="px-0 md:px-4 bg-slate-900 border-b border-slate-800 shrink-0">
                                    <TabsList className="h-10 bg-transparent w-full justify-start overflow-x-auto no-scrollbar rounded-none">
                                        <TabsTrigger value="properties" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 md:px-4 flex-shrink-0">
                                            <Layers className="w-4 h-4 mr-2" /> Properties
                                        </TabsTrigger>
                                        <TabsTrigger value="calibration" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 md:px-4 flex-shrink-0">
                                            <Database className="w-4 h-4 mr-2" /> Calibration
                                        </TabsTrigger>
                                        <TabsTrigger value="scenarios" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 md:px-4 flex-shrink-0">
                                            <GitBranch className="w-4 h-4 mr-2" /> Scenarios
                                        </TabsTrigger>
                                        <TabsTrigger value="sensitivity" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 md:px-4 flex-shrink-0">
                                            <Activity className="w-4 h-4 mr-2" /> Sensitivity
                                        </TabsTrigger>
                                        <TabsTrigger value="results" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 md:px-4 flex-shrink-0">
                                            <BarChart2 className="w-4 h-4 mr-2" /> Analysis
                                        </TabsTrigger>
                                        <TabsTrigger value="templates" className="data-[state=active]:border-b-2 data-[state=active]:border-teal-500 rounded-none px-3 md:px-4 flex-shrink-0 text-teal-400">
                                            <BookOpen className="w-4 h-4 mr-2" /> Templates
                                        </TabsTrigger>
                                        <TabsTrigger value="batch" className="data-[state=active]:border-b-2 data-[state=active]:border-pink-500 rounded-none px-3 md:px-4 flex-shrink-0 text-pink-400">
                                            <Layout className="w-4 h-4 mr-2" /> Batch
                                        </TabsTrigger>
                                        <TabsTrigger value="import" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-3 md:px-4 flex-shrink-0">
                                            <Upload className="w-4 h-4 mr-2" /> Import
                                        </TabsTrigger>
                                    </TabsList>
                                </div>

                                <div className="flex-1 overflow-y-auto bg-slate-950 scroll-smooth relative w-full">
                                    <TabsContent value="properties" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <LayerPropertyEditor />
                                    </TabsContent>

                                    <TabsContent value="calibration" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <CalibrationView />
                                    </TabsContent>

                                    <TabsContent value="scenarios" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <ScenarioManager />
                                    </TabsContent>

                                    <TabsContent value="sensitivity" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <SensitivityAnalysisView />
                                    </TabsContent>

                                    <TabsContent value="results" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <ResultsPanel />
                                    </TabsContent>
                                    
                                    <TabsContent value="templates" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <TemplateLibrary />
                                    </TabsContent>

                                    <TabsContent value="batch" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <BatchProcessor />
                                    </TabsContent>
                                    
                                    <TabsContent value="import" className="h-full m-0 p-0 data-[state=inactive]:hidden">
                                        <AdvancedDataImport />
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </DragDropContext>
                    ) : (
                        <div className="flex items-center justify-center h-full w-full text-slate-500">Loading...</div>
                    )}
                </div>
            </div>
            
            <SimulationRunDialog 
                isOpen={isSimDialogOpen}
                onClose={() => setIsSimDialogOpen(false)}
                onComplete={handleSimulationComplete}
                onCancel={() => setIsSimDialogOpen(false)}
            />
            
            <ExportDialog 
                isOpen={isExportDialogOpen}
                onClose={() => setIsExportDialogOpen(false)}
            />

            {/* Help System Integration */}
            <HelpCenter
                isOpen={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
            />
        </>
    );
};

export default ExpertModePanel;