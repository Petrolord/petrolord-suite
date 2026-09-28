import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Target, HelpCircle } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import InputPanel from '@/components/wellspacing/InputPanel';
import ResultsPanel from '@/components/wellspacing/ResultsPanel';
import EmptyState from '@/components/wellspacing/EmptyState';
import { 
  validateInputs, 
  calculateOptimalSpacing,
  generateCSV,
  generateJSON
} from '@/utils/wellSpacingCalculations';

const WellSpacingOptimizerContent = () => {
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

  // Senior test T1: two dozen required boxes opened blank with nothing to
  // start from. The example is the placeholders the form already shows.
  const handleLoadExample = () => {
    setFormData((prev) => ({
      ...prev,
      fieldName: 'Example field', latitude: '29.7604', longitude: '-95.3698',
      reservoirArea: '5000', avgNetPayThickness: '60', porosity: '15.2', initialWaterSaturation: '0.25',
      reservoirTemperature: '180', reservoirPressure: '3500', recoveryFactor: '35', wellPatternType: '5-spot',
      oilGravity: '35', gasGravity: '0.75', initialSolutionGOR: '500',
      wellCost: '5000000', operatingExpense: '200000', minEconomicFlowRate: '10', typicalWellDeclineRate: '15',
      oilPrice: '75', gasPrice: '3.5', discountRate: '10', projectDuration: '20', royaltiesTaxes: '25',
      minSpacing: '20', maxSpacing: '160', spacingIncrement: '10',
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

      <AppHeader
        backTo="/dashboard/reservoir"
        backLabel="Back to Reservoir"
        icon={Target}
        title="Well Spacing Optimizer"
        subtitle="Compare well spacing cases on capex, volume, cost per barrel and NPV"
        actions={(
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/apps/reservoir/well-spacing-optimizer/help">
              <HelpCircle className="w-4 h-4 mr-2" /> Help guide
            </Link>
          </Button>
        )}
      />
      <div className="p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <InputPanel 
            formData={formData}
            handleInputChange={handleInputChange}
            handleLocationSelect={handleLocationSelect}
            handleCalculate={handleCalculate}
            handleLoadExample={handleLoadExample}
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

// Design system rollout batch 2A (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. The spacing charts keep the white chart
// standard.
const WellSpacingOptimizer = () => (
  <div className="min-h-screen" data-testid="wso-theme-scope">
    <WellSpacingOptimizerContent />
  </div>
);

export default WellSpacingOptimizer;