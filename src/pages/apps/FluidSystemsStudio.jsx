import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, FlaskConical, Save, FolderKanban, Beaker, HelpCircle } from 'lucide-react';
import FluidStudioInput from '@/components/fluidstudio/FluidStudioInput';
import FluidStudioResults from '@/components/fluidstudio/FluidStudioResults';
import FluidStudioEmptyState from '@/components/fluidstudio/FluidStudioEmptyState';
import FluidStudioHelpGuide from '@/components/fluidstudio/FluidStudioHelpGuide';
import { SaveProjectDialog, LoadProjectsDrawer } from '@/components/fluidstudio/FluidStudioPersistence';
import { analyzeFluidSystem, sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runEosFlash } from '@/utils/fluidstudio/eosAnalysis';

const FluidSystemsStudio = () => {
  const [inputs, setInputs] = useState(sampleFluidStudioData);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { toast } = useToast();

  // Pure, synchronous recompute on every keystroke — no backend, no spinner.
  const results = useMemo(() => analyzeFluidSystem(inputs), [inputs]);
  const hasResults = !!results?.pvt?.kpis;

  // Compositional path (FS5): opt-in beside the black-oil default. The flash
  // is fast enough to recompute synchronously; the envelope card owns the
  // slow worker path.
  const eos = useMemo(
    () => (inputs.fluidModel === 'eos' ? runEosFlash(inputs.streamA?.composition) : null),
    [inputs],
  );

  const loadSample = () => setInputs(sampleFluidStudioData());

  // Load restores inputs only; results recompute via useMemo.
  const handleLoadProject = (project) => {
    if (project?.inputs_data) setInputs(project.inputs_data);
    toast({ title: 'Project loaded', description: `"${project.project_name}" restored.` });
  };

  return (
    <>
      <Helmet>
        <title>Fluid Systems & Flow Behavior Studio - Petrolord Suite</title>
        <meta name="description" content="Client-side black-oil PVT, blending, separator and flow-assurance analysis from reservoir to stock tank." />
      </Helmet>
      <div className="flex flex-col h-screen bg-gray-900 text-white">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-4 md:p-6 border-b border-white/10 bg-black/20 backdrop-blur-lg"
        >
          <div className="flex items-center justify-between space-x-4 mb-4">
            <Link to="/dashboard/reservoir">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" />Back to Reservoir
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <Button onClick={loadSample} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <Beaker className="w-4 h-4 mr-2" />Sample
              </Button>
              <Button onClick={() => setHelpOpen(true)} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <HelpCircle className="w-4 h-4 mr-2" />Help
              </Button>
              <Button onClick={() => setLoadOpen(true)} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <FolderKanban className="w-4 h-4 mr-2" />Load
              </Button>
              <Button onClick={() => setSaveOpen(true)} disabled={!hasResults} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <Save className="w-4 h-4 mr-2" />Save
              </Button>
            </div>
          </div>
          <div className="flex items-start md:items-center space-x-4">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-500 p-3 rounded-xl mt-1"><FlaskConical className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-white">Fluid Systems &amp; Flow Behavior Studio</h1>
              <p className="text-cyan-200 text-sm md:text-md">Black-oil PVT, blending, separator &amp; flow assurance · reservoir to stock tank</p>
            </div>
          </div>
        </motion.div>

        <div className="flex-grow flex overflow-hidden">
          <div className="w-full md:w-1/3 xl:w-1/4 p-6 bg-slate-900/50 backdrop-blur-lg border-r border-white/10 overflow-y-auto">
            <FluidStudioInput inputs={inputs} setInputs={setInputs} />
          </div>
          <div className="flex-1 p-6 overflow-y-auto">
            {hasResults ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                <FluidStudioResults results={results} eos={eos} composition={inputs.streamA?.composition} />
              </motion.div>
            ) : (
              <FluidStudioEmptyState onRunSample={loadSample} />
            )}
          </div>
        </div>

        <SaveProjectDialog open={saveOpen} onOpenChange={setSaveOpen} inputs={inputs} results={results} />
        <LoadProjectsDrawer open={loadOpen} onOpenChange={setLoadOpen} onSelect={handleLoadProject} />
        <FluidStudioHelpGuide isOpen={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </>
  );
};

export default FluidSystemsStudio;
