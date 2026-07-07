import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FlaskConical, Save, FolderKanban, Beaker } from 'lucide-react';
import FluidStudioInput from '@/components/fluidstudio/FluidStudioInput';
import FluidStudioResults from '@/components/fluidstudio/FluidStudioResults';
import FluidStudioEmptyState from '@/components/fluidstudio/FluidStudioEmptyState';
import { analyzeFluidSystem, sampleFluidStudioData } from '@/utils/fluidStudioCalculations';

const FluidSystemsStudio = () => {
  const [inputs, setInputs] = useState(sampleFluidStudioData);

  // Pure, synchronous recompute on every keystroke — no backend, no spinner.
  const results = useMemo(() => analyzeFluidSystem(inputs), [inputs]);
  const hasResults = !!results?.pvt?.kpis;

  const loadSample = () => setInputs(sampleFluidStudioData());

  return (
    <>
      <Helmet>
        <title>Fluid Systems & Flow Behavior Studio - Petrolord Suite</title>
        <meta name="description" content="Client-side black-oil PVT and separator-train analysis from reservoir to stock tank." />
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
              {/* Persistence is Phase 2 (needs a migration + edge function). */}
              <Button disabled title="Saving projects — coming soon" variant="outline" className="border-slate-600 text-slate-500 cursor-not-allowed">
                <FolderKanban className="w-4 h-4 mr-2" />Load
              </Button>
              <Button disabled title="Saving projects — coming soon" variant="outline" className="border-slate-600 text-slate-500 cursor-not-allowed">
                <Save className="w-4 h-4 mr-2" />Save
              </Button>
            </div>
          </div>
          <div className="flex items-start md:items-center space-x-4">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-500 p-3 rounded-xl mt-1"><FlaskConical className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-white">Fluid Systems &amp; Flow Behavior Studio</h1>
              <p className="text-cyan-200 text-sm md:text-md">Black-oil PVT &amp; separator-train analysis · reservoir to stock tank</p>
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
                <FluidStudioResults results={results} />
              </motion.div>
            ) : (
              <FluidStudioEmptyState onRunSample={loadSample} />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default FluidSystemsStudio;
