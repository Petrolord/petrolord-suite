import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Search, ArrowLeft } from 'lucide-react';
import InputPanel from '@/components/analogfinder/InputPanel';
import ResultsPanel from '@/components/analogfinder/ResultsPanel';
import EmptyState from '@/components/analogfinder/EmptyState';
import { 
  validateInputs, 
  generateAnalogResults, 
  getMatchingWeights,
  generateCSV,
  generateJSON
} from '@/utils/analogfinderCalculations';

const AnalogFinder = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  
  const [formData, setFormData] = useState({
    fieldName: '',
    latitude: '',
    longitude: '',
    maxSearchDistance: 'global',
    netPayThickness: '',
    meanPorosity: '',
    meanSaturation: '',
    lithologyType: 'sandstone',
    depositionalEnvironment: 'fluvial-channel-overbank',
    structuralSetting: 'anticlinal-trap',
    driveMethod: 'water-drive',
    wellLogFile: null,
    seismicFile: null
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    setFormData(prev => ({
      ...prev,
      [fieldName]: file
    }));
  };

  const handleRunAnalogFinder = async () => {
    if (!validateInputs(formData)) {
      toast({
        title: "Invalid Inputs",
        description: "Please fill in all required fields with valid positive numbers.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setLoading(true);
    
    try {
      // Simulate AI processing time for better UX
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const analogResults = await generateAnalogResults(formData);
      
      const searchResults = {
        analogs: analogResults,
        weights: getMatchingWeights(),
        searchCriteria: formData
      };

      setResults(searchResults);
      
      toast({
        title: "AnalogFinder Search Complete! 🎉",
        description: `Found ${analogResults.length} matching analog fields.`,
        duration: 4000,
      });
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Search Failed",
        description: "There was an error running the analog search. Please try again.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!results) return;
    
    const csvContent = generateCSV(results);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analog_results_${formData.fieldName.replace(/\s+/g, '_')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!results) return;
    
    const jsonData = generateJSON(formData, results);
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analog_summary_${formData.fieldName.replace(/\s+/g, '_')}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>AnalogFinder - Petrolord Suite</title>
        <meta name="description" content="AI-powered global field analog search by reservoir properties for benchmarking and development planning." />
      </Helmet>

      <div className="p-4 sm:p-8 max-w-[1920px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center space-x-4 mb-4">
            <Link to="/dashboard/geoscience">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Geoscience
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-3 rounded-xl shadow-lg shadow-green-500/20">
              <Search className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">AnalogFinder</h1>
              <p className="text-lime-200 text-lg mt-1">AI-powered global field analog search by reservoir properties</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 xl:col-span-3">
            <InputPanel 
              formData={formData}
              handleInputChange={handleInputChange}
              handleFileChange={handleFileChange}
              handleRunAnalogFinder={handleRunAnalogFinder}
              loading={loading}
            />
          </div>

          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {results ? (
              <ResultsPanel 
                results={results}
                downloadCSV={downloadCSV}
                downloadJSON={downloadJSON}
              />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AnalogFinder;