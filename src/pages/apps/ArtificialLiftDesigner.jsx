import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, CheckSquare, Save, FolderOpen } from 'lucide-react';
import CandidateScreening from '@/components/artificiallift/CandidateScreening';
import SaveDesignDialog from '@/components/artificiallift/SaveDesignDialog';
import LoadDesignsDialog from '@/components/artificiallift/LoadDesignsDialog';

const initialScreeningInputs = {
  targetRate: 3000,
  depth: 8000,
  gor: 800,
  waterCut: 20,
  apiGravity: 35,
  isOffshore: false,
  hasSand: false,
  isDeviated: true,
  powerAvailable: true,
  gasAvailable: true,
};

const ArtificialLiftDesigner = () => {
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isLoadOpen, setIsLoadOpen] = useState(false);
  const [currentDesignName, setCurrentDesignName] = useState('');

  const [screeningInputs, setScreeningInputs] = useState(initialScreeningInputs);
  // Design-tab inputs from saves made before P0 are carried through
  // untouched, so nothing a user stored is lost and the P4-P6 studios
  // can offer to import them.
  const [legacyDesignInputs, setLegacyDesignInputs] = useState(null);

  const getCurrentDesignData = () => {
    return {
      activeTab: 'screening',
      screeningInputs,
      ...(legacyDesignInputs || {})
    };
  };

  const handleLoadData = (data, name) => {
    if (data.screeningInputs) setScreeningInputs(data.screeningInputs);
    const { gasLiftInputs, espInputs, rodPumpInputs } = data;
    const legacy = { gasLiftInputs, espInputs, rodPumpInputs };
    setLegacyDesignInputs(Object.values(legacy).some(Boolean) ? legacy : null);
    setCurrentDesignName(name);
  };

  return (
    <>
      <Helmet>
        <title>Artificial Lift Designer - Petrolord Suite</title>
        <meta name="description" content="Design, analyze, and optimize ESP, Gas Lift, and Rod Pumping systems." />
      </Helmet>
      
      <div className="flex h-screen flex-col bg-slate-900 text-white font-sans overflow-hidden">
        <header className="flex-shrink-0 bg-slate-900/90 backdrop-blur-lg border-b border-slate-800 p-4 flex items-center justify-between z-10">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard/production">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="h-6 w-px bg-slate-700 mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="bg-lime-500/20 p-2 rounded-lg border border-lime-500/30">
                <Zap className="w-5 h-5 text-lime-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white tracking-tight">
                  {currentDesignName || "Artificial Lift Designer"}
                </h1>
                <p className="text-xs text-slate-400">Design & Optimization</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Button 
              variant="outline" 
              onClick={() => setIsLoadOpen(true)}
              className="border-slate-700 hover:bg-slate-800"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Load Design
            </Button>
            <Button 
              onClick={() => setIsSaveOpen(true)}
              className="bg-lime-600 hover:bg-lime-500 text-slate-950 font-semibold shadow-lg shadow-lime-900/20"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Design
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-hidden flex flex-col relative">
          {/* Production P0: the three design tabs are gone (Production-ROADMAP.md §3 #9).
              Their math was silently wrong: ESP TDH omitted net lift (stage counts ~10x off),
              the gas-lift gradient was an invented fudge with no multiphase model, and the
              "Mills method" rod code was neither Mills nor API RP 11L (and parsed rod
              diameter "7/8" as 7.8 in). Full design ships as the Gas Lift (P4), ESP (P5)
              and Rod Pump (P6) studios on the validated nodal + PVT engines. The screening
              matrix below is the honest part of this app and stays. */}
          <Tabs value="screening" className="flex-1 flex flex-col h-full min-h-0">
            <TabsList className="grid w-full grid-cols-1 bg-slate-800/80 mb-6 border border-slate-700 p-1 rounded-lg">
              <TabsTrigger value="screening" className="data-[state=active]:bg-lime-500/20 data-[state=active]:text-lime-400"><CheckSquare className="w-4 h-4 mr-2" />Candidate Screening</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar pb-6">
              <TabsContent value="screening" className="m-0 h-full">
                <CandidateScreening inputs={screeningInputs} setInputs={setScreeningInputs} />
              </TabsContent>
            </div>
          </Tabs>
        </main>
      </div>

      <SaveDesignDialog 
        isOpen={isSaveOpen} 
        onOpenChange={setIsSaveOpen} 
        designData={getCurrentDesignData()} 
        currentName={currentDesignName}
      />
      
      <LoadDesignsDialog 
        isOpen={isLoadOpen} 
        onOpenChange={setIsLoadOpen} 
        onLoad={handleLoadData} 
      />
    </>
  );
};

export default ArtificialLiftDesigner;