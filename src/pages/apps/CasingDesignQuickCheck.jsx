import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Layers, ArrowLeft, Save } from 'lucide-react';
import InputPanel from '@/components/casingdesign/InputPanel';
import ResultsPanel from '@/components/casingdesign/ResultsPanel';
import EmptyState from '@/components/casingdesign/EmptyState';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { runCasingDesignCheck } from '@/utils/casingDesignCalculations';

const CasingAndTubingDesign = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [currentInputs, setCurrentInputs] = useState(null);
  const [initialInputs, setInitialInputs] = useState(null);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.loadedProject) {
      const { loadedProject } = location.state;
      setInitialInputs(loadedProject.inputs_data);
      setCurrentInputs(loadedProject.inputs_data);
      setResults(loadedProject.results_data);
      toast({
        title: "Project Loaded",
        description: `Successfully loaded "${loadedProject.project_name}".`,
      });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate, toast]);

  const handleCalculate = async (inputs) => {
    setLoading(true);
    setResults(null);
    setCurrentInputs(inputs);
    toast({
      title: "Analyzing Casing Design... ⚙️",
      description: "Running burst, collapse, and tension calculations for all strings and load cases.",
    });

    try {
      const apiResults = await runCasingDesignCheck(inputs);
      setResults(apiResults);
      toast({
        title: "Analysis Complete! ✅",
        description: `Overall status: ${apiResults.summary.overallStatus}.`,
      });
    } catch (error) {
      console.error("Casing Design Error:", error);
      toast({
        title: "Analysis Failed",
        description: error.message || "An error occurred during the design check.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProject = async () => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not Authenticated', description: 'Please log in to save your project.' });
        return;
    }
    if (!results || !currentInputs) {
        toast({ variant: 'destructive', title: 'No Data', description: 'Please run a check before saving.' });
        return;
    }

    const projectName = prompt('Enter a name for your project:', currentInputs.projectName || 'My Casing Design');
    if (!projectName) return;

    const projectData = {
        user_id: user.id,
        project_name: projectName,
        inputs_data: { ...currentInputs, projectName },
        results_data: results,
    };

    const { error } = await supabase.from('saved_casing_design_projects').insert([projectData]);

    if (error) {
        toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
    } else {
        toast({ title: 'Project Saved!', description: `Project "${projectName}" has been saved.` });
    }
  };

  return (
    <>
      <Helmet>
        <title>Casing & Tubing Design - Petrolord Suite</title>
        <meta name="description" content="Design and analyze wellbore tubulars (casing and tubing) to ensure mechanical integrity." />
      </Helmet>
      <div className="p-4 md:p-8 bg-slate-900 text-white min-h-screen">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <Link to="/dashboard/drilling">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Drilling
              </Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-3 rounded-xl">
              <Layers className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-white">Casing & Tubing Design</h1>
              <p className="text-lime-200 text-md md:text-lg">Lifecycle Load & Integrity Analysis</p>
            </div>
          </div>
        </motion.div>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-2/5">
            <InputPanel onCalculate={handleCalculate} loading={loading} initialInputs={initialInputs} />
          </div>
          <div className="lg:w-3/5">
            <div className="flex justify-end mb-4">
              <Button onClick={handleSaveProject} disabled={!results || loading} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                  <Save className="w-4 h-4 mr-2" />
                  Save Project
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-full bg-white/5 rounded-xl border border-white/10 p-6">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lime-400 mx-auto"></div>
                  <p className="text-white mt-4 text-lg">Analyzing Design...</p>
                  <p className="text-lime-300">Please wait while we run the numbers.</p>
                </div>
              </div>
            ) : results ? (
              <ResultsPanel results={results} />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CasingAndTubingDesign;