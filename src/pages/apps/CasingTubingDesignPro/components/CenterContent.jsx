import React, { useState } from 'react';
import { useCasingTubingDesign } from '../contexts/CasingTubingDesignContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, Activity, Ruler, Box, Briefcase, Database } from 'lucide-react';
import WellEnvironmentTab from './tabs/WellEnvironmentTab';
import LoadCasesTab from './tabs/LoadCasesTab';
import CasingDesignTab from './tabs/CasingDesignTab';
import TubingDesignTab from './tabs/TubingDesignTab';
import StringVisualizerTab from './tabs/StringVisualizerTab';
import CatalogBrowser from './CatalogBrowser';
import { Button } from '@/components/ui/button';

const CenterContent = () => {
    const { activeTab, setActiveTab, caseDoc, runError } = useCasingTubingDesign();
    const [isCatalogOpen, setIsCatalogOpen] = React.useState(false);

    if (!caseDoc) {
        return (
            <div className="flex-1 bg-pl-bg flex items-center justify-center p-8 text-center">
                <div className="max-w-md">
                    <div className="bg-pl-surface p-6 rounded-full inline-block mb-4 border border-pl-border shadow-pl-sm">
                        <Layers className="w-12 h-12 text-pl-muted" />
                    </div>
                    <h3 className="text-xl font-bold text-pl-text mb-2">Ready to Design</h3>
                    <p className="text-pl-muted mb-6">Pick a site and wellbore with a saved well design (definitive, or the latest draft), then create or choose a design case from the left panel to begin the casing and tubing analysis.</p>
                    <div className="flex justify-center gap-4 text-xs text-pl-muted">
                        <span className="flex items-center"><Activity className="w-3 h-3 mr-1" /> Load Cases</span>
                        <span className="flex items-center"><Ruler className="w-3 h-3 mr-1" /> API 5C3 Ratings</span>
                        <span className="flex items-center"><Box className="w-3 h-3 mr-1" /> Tubing Forces</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-pl-bg flex flex-col overflow-hidden">
            {runError && (
                <div data-testid="ct-run-error" className="px-4 py-1.5 bg-pl-danger-bg border-b border-pl-danger/40 text-pl-danger-text text-xs shrink-0">
                    {runError}
                </div>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full">
                <div className="px-4 pt-2 border-b border-pl-border bg-pl-surface flex justify-between items-center gap-4 overflow-x-auto shrink-0">
                    <TabsList className="bg-transparent border-0 rounded-none h-9 p-0 space-x-6">
                        <TabsTrigger 
                            value="well-loads" 
                            className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pl-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2 pb-2 text-pl-muted data-[state=active]:text-pl-primary-text hover:text-pl-text transition-colors text-xs"
                        >
                            <Activity className="w-3.5 h-3.5 mr-2" /> Well & Loads
                        </TabsTrigger>
                        <TabsTrigger 
                            value="load-cases" 
                            className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pl-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2 pb-2 text-pl-muted data-[state=active]:text-pl-primary-text hover:text-pl-text transition-colors text-xs"
                        >
                            <Briefcase className="w-3.5 h-3.5 mr-2" /> Load Cases
                        </TabsTrigger>
                        <TabsTrigger 
                            value="casing-design" 
                            className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pl-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2 pb-2 text-pl-muted data-[state=active]:text-pl-primary-text hover:text-pl-text transition-colors text-xs"
                        >
                            <Layers className="w-3.5 h-3.5 mr-2" /> Casing Design
                        </TabsTrigger>
                        <TabsTrigger 
                            value="tubing-design" 
                            className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pl-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2 pb-2 text-pl-muted data-[state=active]:text-pl-primary-text hover:text-pl-text transition-colors text-xs"
                        >
                            <Ruler className="w-3.5 h-3.5 mr-2" /> Tubing Design
                        </TabsTrigger>
                        <TabsTrigger 
                            value="visualizer" 
                            className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pl-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-2 pb-2 text-pl-muted data-[state=active]:text-pl-primary-text hover:text-pl-text transition-colors text-xs"
                        >
                            <Box className="w-3.5 h-3.5 mr-2" /> Visualizer
                        </TabsTrigger>
                    </TabsList>
                    
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] h-7 text-pl-muted hover:text-pl-text mb-1"
                        onClick={() => setIsCatalogOpen(true)}
                    >
                        <Database className="w-3 h-3 mr-2" /> Catalog Browser
                    </Button>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden bg-pl-bg p-0 m-0">
                    <TabsContent value="well-loads" className="m-0 p-0 h-full flex-1 min-h-0 flex-col data-[state=active]:flex">
                        <div className="flex-1 p-4 overflow-hidden">
                            <WellEnvironmentTab />
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="load-cases" className="m-0 p-0 h-full flex-1 min-h-0 flex-col data-[state=active]:flex">
                        <div className="flex-1 p-4 overflow-hidden">
                            <LoadCasesTab />
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="casing-design" className="m-0 p-0 h-full flex-1 min-h-0 flex-col data-[state=active]:flex">
                        <CasingDesignTab />
                    </TabsContent>

                    <TabsContent value="tubing-design" className="m-0 p-0 h-full flex-1 min-h-0 flex-col data-[state=active]:flex">
                        <TubingDesignTab />
                    </TabsContent>

                    <TabsContent value="visualizer" className="m-0 p-0 h-full flex-1 min-h-0 flex-col data-[state=active]:flex">
                        <StringVisualizerTab />
                    </TabsContent>
                </div>
            </Tabs>
            
            <CatalogBrowser open={isCatalogOpen} onOpenChange={setIsCatalogOpen} />
        </div>
    );
};

export default CenterContent;