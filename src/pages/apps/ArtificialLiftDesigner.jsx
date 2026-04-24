import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Zap, Wind, Wrench, CheckSquare, Save, FolderOpen } from 'lucide-react';
import CandidateScreening from '@/components/artificiallift/CandidateScreening';
import GasLiftDesign from '@/components/artificiallift/GasLiftDesign';
import ESPDesign from '@/components/artificiallift/ESPDesign';
import RodPumpDesign from '@/components/artificiallift/RodPumpDesign';
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

const initialGasLiftInputs = {
  tubingID: 2.441,
  wellDepth: 8000,
  whp: 200,
  bhp: 2000,
  liquidRate: 1500,
  waterCut: 30,
  gor: 300,
  oilApi: 35,
  gasGravity: 0.7,
  waterSalinity: 30000,
  wellheadTemp: 120,
  bottomholeTemp: 180,
  surfaceInjectionPressure: 1500,
  injectionGasGravity: 0.65,
  valveSpacingSafetyFactor: 100,
};

const initialEspInputs = {
  targetRate: 2500,
  wellDepth: 7500,
  pumpDepth: 7000,
  whp: 150,
  waterCut: 50,
  gor: 500,
  oilApi: 32,
  gasGravity: 0.75,
  tubingID: 3.958,
  casingID: 6.366,
  frequency: 60,
  pumpModel: 'REDADN2600',
};

const initialRodPumpInputs = {
  strokeLength: 120,
  pumpingSpeed: 10,
  pumpDepth: 6000,
  pumpDiameter: 1.75,
  tubingPressure: 200,
  casingPressure: 100,
  liquidRate: 300,
  waterCut: 60,
  oilApi: 30,
  rodString: "7/8,3/4",
  rodPercentages: "50,50",
};

const ArtificialLiftDesigner = () => {
  const [activeTab, setActiveTab] = useState("screening");
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isLoadOpen, setIsLoadOpen] = useState(false);
  const [currentDesignName, setCurrentDesignName] = useState('');

  // Lifted state for all modules to support full save/load
  const [screeningInputs, setScreeningInputs] = useState(initialScreeningInputs);
  const [gasLiftInputs, setGasLiftInputs] = useState(initialGasLiftInputs);
  const [espInputs, setEspInputs] = useState(initialEspInputs);
  const [rodPumpInputs, setRodPumpInputs] = useState(initialRodPumpInputs);

  const getCurrentDesignData = () => {
    return {
      activeTab,
      screeningInputs,
      gasLiftInputs,
      espInputs,
      rodPumpInputs
    };
  };

  const handleLoadData = (data, name) => {
    if (data.screeningInputs) setScreeningInputs(data.screeningInputs);
    if (data.gasLiftInputs) setGasLiftInputs(data.gasLiftInputs);
    if (data.espInputs) setEspInputs(data.espInputs);
    if (data.rodPumpInputs) setRodPumpInputs(data.rodPumpInputs);
    if (data.activeTab) setActiveTab(data.activeTab);
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full min-h-0">
            <TabsList className="grid w-full grid-cols-4 bg-slate-800/80 mb-6 border border-slate-700 p-1 rounded-lg">
              <TabsTrigger value="screening" className="data-[state=active]:bg-lime-500/20 data-[state=active]:text-lime-400"><CheckSquare className="w-4 h-4 mr-2" />Candidate Screening</TabsTrigger>
              <TabsTrigger value="gas_lift" className="data-[state=active]:bg-lime-500/20 data-[state=active]:text-lime-400"><Wind className="w-4 h-4 mr-2" />Gas Lift Design</TabsTrigger>
              <TabsTrigger value="esp" className="data-[state=active]:bg-lime-500/20 data-[state=active]:text-lime-400"><Zap className="w-4 h-4 mr-2" />ESP Design</TabsTrigger>
              <TabsTrigger value="rod_pump" className="data-[state=active]:bg-lime-500/20 data-[state=active]:text-lime-400"><Wrench className="w-4 h-4 mr-2" />Rod Pump Design</TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar pb-6">
              <TabsContent value="screening" className="m-0 h-full">
                <CandidateScreening inputs={screeningInputs} setInputs={setScreeningInputs} onProceed={setActiveTab} />
              </TabsContent>
              <TabsContent value="gas_lift" className="m-0 h-full">
                <GasLiftDesign inputs={gasLiftInputs} setInputs={setGasLiftInputs} />
              </TabsContent>
              <TabsContent value="esp" className="m-0 h-full">
                <ESPDesign inputs={espInputs} setInputs={setEspInputs} />
              </TabsContent>
              <TabsContent value="rod_pump" className="m-0 h-full">
                <RodPumpDesign inputs={rodPumpInputs} setInputs={setRodPumpInputs} />
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