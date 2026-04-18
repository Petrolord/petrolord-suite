import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import ProjectsList from './PetroleumEconomicsStudio/ProjectsList';
import ModelWorkspace from './PetroleumEconomicsStudio/ModelWorkspace';
import TemplatesLibrary from './PetroleumEconomicsStudio/TemplatesLibrary';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PetroleumEconomicsStudio() {
  const [activeView, setActiveView] = useState('projects');

  return (
    <div className="flex flex-col h-full bg-slate-950 w-full overflow-hidden">
      <Helmet>
        <title>Petroleum Economics Studio | Petrolord</title>
      </Helmet>
      
      {/* Main App Navigation Header */}
      <div className="border-b border-slate-800 bg-slate-900 p-4 shrink-0">
        <h1 className="text-2xl font-bold text-white mb-4">Petroleum Economics Studio</h1>
        <Tabs value={activeView} onValueChange={setActiveView} className="w-full max-w-md">
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="projects" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300">
              Projects
            </TabsTrigger>
            <TabsTrigger value="workspace" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300">
              Workspace
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300">
              Templates
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* View Rendering (Internal State Navigation) */}
      <div className="flex-1 overflow-auto relative">
        {activeView === 'projects' && <ProjectsList />}
        {activeView === 'workspace' && <ModelWorkspace />}
        {activeView === 'templates' && <TemplatesLibrary />}
      </div>
    </div>
  );
}