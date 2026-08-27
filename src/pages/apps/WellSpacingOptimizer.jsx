import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Target, ArrowLeft, Calculator, TrendingUp, DollarSign } from 'lucide-react';
import InputPanel from '@/components/wellspacing/InputPanel';
import ResultsPanel from '@/components/wellspacing/ResultsPanel';
import EmptyState from '@/components/wellspacing/EmptyState';
import { 
  validateInputs, 
  calculateOptimalSpacing,
  generateCSV,
  generateJSON
} from '@/utils/wellSpacingCalculations';

const WellSpacingOptimizer = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  
  const [formData, setFormData] = useState({
    fieldName: '',
    latitude: '',
    longitude: '',
    reservoirArea: '',
    avgNetPayThickness: '',
    porosity: '',
    initialWaterSaturation: '',
    reservoirTemperature: '',
    reservoirPressure: '',
    recoveryFactor: '',
    wellPatternType: '5-spot',
    oilGravity: '',
    gasGravity: '',
    initialSolutionGOR: '',
    wellCost: '',
    operatingExpense: '',
    minEconomicFlowRate: '',
    typicalWellDeclineRate: '',
    oilPrice: '',
    gasPrice: '',
    discountRate: '',
    projectDuration: '',
    royaltiesTaxes: '',
    minSpacing: '',
    maxSpacing: '',
    spacingIncrement: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLocationSelect = (lat, lng) => {
    setFormData(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng
    }));
  };

  const handleCalculate = async () => {
    const { ok, errors } = validateInputs(formData);
    if (!ok) {
      toast({
        title: errors.length === 1 ? 'One input needs attention' : `${errors.length} inputs need attention`,
        // Name the offending fields. With two dozen inputs on screen, "fill in
        // all required fields" left users hunting.
        description: errors.slice(0, 4).join(' ') + (errors.length > 4 ? ' ...' : ''),
        variant: "destructive",
        duration: 7000,
      });
      return;
    }

    setLoading(true);

    try {
      // The sweep is a few hundred closed-form evaluations and returns in
      // milliseconds. There used to be a hard-coded three second wait here,
      // which read as a heavy simulation running.
      const spacingResults = await calculateOptimalSpacing(formData);

      setResults(spacingResults);

      toast({
        title: "Spacing economics ready",
        description: `${spacingResults.spacingResults.length} spacings evaluated. Read the table and pick the case that fits your development plan.`,
        duration: 4000,
      });
    } catch (error) {
      toast({
        title: "Calculation Failed",
        description: error?.message || "There was an error evaluating the spacing cases. Please try again.",
        variant: "destructive",
        duration: 4000,
      });
    }
    
    setLoading(false);
  };

  const downloadCSV = () => {
    if (!results) return;
    
    const csvContent = generateCSV(results);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'well_spacing_results.csv';
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
    a.download = 'well_spacing_summary.json';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>Well Spacing Optimizer - Petrolord Suite</title>
        <meta name="description" content="Compare well spacing cases on capex, volume, cost per barrel and NPV at a stated recovery factor." />
      </Helmet>

      <div className="p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center space-x-4 mb-4">
            <Link to="/dashboard/reservoir">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Reservoir
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-xl">
              <Target className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white">Well Spacing Optimizer</h1>
              <p className="text-lime-200 text-lg">Optimize well spacing for maximum NPV and field recovery</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <InputPanel 
            formData={formData}
            handleInputChange={handleInputChange}
            handleLocationSelect={handleLocationSelect}
            handleCalculate={handleCalculate}
            loading={loading}
          />

          <div className="lg:col-span-2 space-y-6">
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

export default WellSpacingOptimizer;