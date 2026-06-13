import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { calculateEconomics } from '@/utils/petroleumEconomicsEngine';
import { generateDemoData } from '@/data/petroleumEconomicsDemoData';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const PetroleumEconomicsContext = createContext();

export const PetroleumEconomicsProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate(); 
  
  const [currentProject, setCurrentProject] = useState(null);
  const [currentModel, setCurrentModel] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [activeScenario, setActiveScenario] = useState(null);
  
  // Status States
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [economicsStatus, setEconomicsStatus] = useState('not_run'); 
  const [lastRunTime, setLastRunTime] = useState(null);

  // --- Inputs State ---
  const [modelSettings, setModelSettings] = useState({
      startYear: new Date().getFullYear(),
      endYear: new Date().getFullYear() + 20,
      frequency: 'annual',
      currency: 'USD',
      discountRate: 0.1,
      inflationRate: 0.02,
      inflationEnabled: true,
      priceDeckType: 'flat'
  });

  const [streams, setStreams] = useState([
      { id: 'oil', name: 'Oil', active: true },
      { id: 'gas', name: 'Gas', active: true },
      { id: 'condensate', name: 'Condensate', active: false },
  ]);

  const [productionData, setProductionData] = useState([]); 
  const [costData, setCostData] = useState({ capexProfile: [], opexProfile: [] }); 
  const [assumptions, setAssumptions] = useState({
      workingInterest: 100,
      netRevenueInterest: 85,
      taxRate: 35,
      royaltyRate: 12.5,
      uptime: 95
  });

  const [fiscalTerms, setFiscalTerms] = useState(null);
  const [priceAssumptions, setPriceAssumptions] = useState({
      oilPrice: 70, 
      gasPrice: 3.5, 
      escalation: 0.02
  });

  const [validationIssues, setValidationIssues] = useState([]);
  const [calculationResults, setCalculationResults] = useState(null);
  const [comparisonData, setComparisonData] = useState({}); 
  const [auditLogs, setAuditLogs] = useState([]);
  const [scenarioNotes, setScenarioNotes] = useState({});
  const [fdpSnapshots, setFdpSnapshots] = useState([]);
  const [afeBudgets, setAfeBudgets] = useState([]);
  const [sensitivityResults, setSensitivityResults] = useState(null);
  const [importedData, setImportedData] = useState(null);

  // History for Undo/Redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const saveTimeoutRef = useRef(null);

  // --- Create Project Function ---
  const createProject = useCallback(async (projectData) => {
      if (!user) {
          toast({ variant: "destructive", title: "Error", description: "User not authenticated" });
          return false;
      }
      
      setLoading(true);
      try {
          // Create the project
          const projectPayload = {
              name: projectData.name,
              description: projectData.description || '',
              location: projectData.location || '',
              country: projectData.country || '',
              project_type: 'upstream_development',
              currency: 'USD',
              status: 'active',
              created_by: user.id,
              updated_by: user.id
          };
          
          const { data: newProject, error: projectError } = await supabase
              .from('econ_projects')
              .insert(projectPayload)
              .select()
              .single();
          
          if (projectError) {
              console.error("Project creation error:", projectError);
              throw projectError;
          }
          
          // Create base model for the project
          const modelPayload = {
              project_id: newProject.id,
              name: `${projectData.name} - Base Model`,
              description: 'Initial base economic model',
              base_year: new Date().getFullYear(),
              created_by: user.id,
              updated_by: user.id,
              status: 'active',
              currency: 'USD',
              forecast_years: 20,
              model_type: 'deterministic'
          };
          
          const { data: newModel, error: modelError } = await supabase
              .from('econ_models_v2')
              .insert(modelPayload)
              .select()
              .single();
              
          if (modelError) {
              console.error("Model creation error:", modelError);
              throw modelError;
          }
          
          // Create base scenario
          const scenarioPayload = {
              model_id: newModel.id,
              name: 'Base Case',
              description: 'Base case scenario',
              scenario_type: 'base',
              is_base_scenario: true,
              status: 'draft',
              created_by: user.id,
              updated_by: user.id
          };
          
          const { data: newScenario, error: scenarioError } = await supabase
              .from('econ_scenarios_v2')
              .insert(scenarioPayload)
              .select()
              .single();
              
          if (scenarioError) {
              console.error("Scenario creation error:", scenarioError);
              throw scenarioError;
          }
          
          // Initialize default fiscal terms
          const fiscalPayload = {
              scenario_id: newScenario.id,
              fiscal_regime: 'royalty_tax',
              terms_json: {
                  template_type: 'royalty_tax',
                  royalty_rate: 12.5,
                  tax_rate: 30,
                  depreciation_method: 'straight_line',
                  ring_fence: false
              }
          };
          
          await supabase
              .from('econ_fiscal_terms')
              .insert(fiscalPayload);
              
          toast({ 
              title: "Project Created", 
              description: `Successfully created ${projectData.name} with base model and scenario.` 
          });
          
          // Navigate to the new model workspace
          setTimeout(() => {
              navigate(`/dashboard/apps/petroleum-economics-studio/workspace/${newModel.id}`);
          }, 500);
          
          return true;
          
      } catch (error) {
          console.error("Error creating project:", error);
          toast({ 
              variant: "destructive", 
              title: "Creation Failed", 
              description: error.message || "Failed to create project. Please try again." 
          });
          return false;
      } finally {
          setLoading(false);
      }
  }, [user, toast, navigate]);

  // --- Snapshot History Logic ---
  const takeSnapshot = useCallback(() => {
      const snapshot = {
          modelSettings,
          productionData,
          costData,
          assumptions,
          fiscalTerms,
          priceAssumptions
      };
      
      // If we are in the middle of history stack, truncate future
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(snapshot);
      
      // Limit history size
      if (newHistory.length > 20) newHistory.shift();
      
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  }, [modelSettings, productionData, costData, assumptions, fiscalTerms, priceAssumptions, history, historyIndex]);

  const undo = useCallback(() => {
      if (historyIndex > 0) {
          const prevSnapshot = history[historyIndex - 1];
          setHistoryIndex(historyIndex - 1);
          // Restore state
          setModelSettings(prevSnapshot.modelSettings);
          setProductionData(prevSnapshot.productionData);
          setCostData(prevSnapshot.costData);
          setAssumptions(prevSnapshot.assumptions);
          setFiscalTerms(prevSnapshot.fiscalTerms);
          setPriceAssumptions(prevSnapshot.priceAssumptions);
          toast({ title: "Undone", description: "Reverted to previous state." });
      }
  }, [history, historyIndex, toast]);

  const redo = useCallback(() => {
      if (historyIndex < history.length - 1) {
          const nextSnapshot = history[historyIndex + 1];
          setHistoryIndex(historyIndex + 1);
          // Restore state
          setModelSettings(nextSnapshot.modelSettings);
          setProductionData(nextSnapshot.productionData);
          setCostData(nextSnapshot.costData);
          setAssumptions(nextSnapshot.assumptions);
          setFiscalTerms(nextSnapshot.fiscalTerms);
          setPriceAssumptions(nextSnapshot.priceAssumptions);
          toast({ title: "Redone", description: "Restored state." });
      }
  }, [history, historyIndex, toast]);

  // Hook into setProductionData etc. to take snapshots occasionally?
  // For simplicity, we manually call takeSnapshot on major actions like "Run" or "Load Demo"
  // Or expose takeSnapshot to UI components to call onBlur

  // --- Calculate Progress ---
  const progress = useMemo(() => {
      return {
          setup: !!modelSettings.startYear,
          inputs: productionData.length > 0 && costData.capexProfile?.length > 0,
          ready: fiscalTerms !== null && priceAssumptions.oilPrice > 0,
          results: economicsStatus === 'complete'
      };
  }, [modelSettings, productionData, costData, fiscalTerms, priceAssumptions, economicsStatus]);


  // --- Fetching Logic (Same as before) ---
  const fetchScenarioDetails = useCallback(async (scenarioId) => {
    if (!scenarioId) return;
    try {
        const { data: inputs, error: inputError } = await supabase.from('econ_inputs').select('*').eq('scenario_id', scenarioId);
        if (inputError) throw inputError;

        if (inputs && inputs.length > 0) {
            inputs.forEach(item => {
                if (item.input_key === 'modelSettings' && item.input_json) setModelSettings(item.input_json);
                if (item.input_key === 'productionData' && item.input_json) setProductionData(item.input_json);
                if (item.input_key === 'costData' && item.input_json) setCostData(item.input_json);
                if (item.input_key === 'assumptions' && item.input_json) setAssumptions(item.input_json);
                if (item.input_key === 'priceAssumptions' && item.input_json) setPriceAssumptions(item.input_json);
                if (item.input_key === 'streams' && item.input_json) setStreams(item.input_json);
            });
        }
        
        const { data: fiscal, error: fiscalError } = await supabase.from('econ_fiscal_terms').select('*').eq('scenario_id', scenarioId).single();
        if (!fiscalError && fiscal) setFiscalTerms(fiscal.terms_json);
        else setFiscalTerms({ template_type: 'royalty_tax', royalty_rate: 12.5, tax_rate: 30 });

        // Take initial snapshot
        // We delay slightly to ensure state update propagates
        setTimeout(() => {
             // takeSnapshot(); // Logic circular dependency if we use the state directly here
             // Simplification: handled by component useEffect or manual call
        }, 500);

    } catch (err) {
        console.error("Error fetching scenario:", err);
    }
  }, []);

  const fetchModelDetails = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
        const { data: model } = await supabase.from('econ_models_v2').select('*').eq('id', id).single();
        setCurrentModel(model);
        if (model?.project_id) {
             const { data: proj } = await supabase.from('econ_projects').select('*').eq('id', model.project_id).single();
             if (proj) setCurrentProject(proj);
        }
        const { data: scen } = await supabase.from('econ_scenarios_v2').select('*').eq('model_id', id).order('created_at', { ascending: true });
        setScenarios(scen || []);
        if (scen && scen.length > 0) {
            const base = scen.find(s => s.is_base_scenario) || scen[0];
            setActiveScenario(base);
            await fetchScenarioDetails(base.id);
        }
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  }, [fetchScenarioDetails]);

  // --- Saving & Running ---
  const saveInputs = useCallback(async () => {
      if (!activeScenario || activeScenario.is_locked) return;
      try {
          const inputPayloads = [
              { scenario_id: activeScenario.id, input_key: 'modelSettings', input_json: modelSettings },
              { scenario_id: activeScenario.id, input_key: 'productionData', input_json: productionData },
              { scenario_id: activeScenario.id, input_key: 'costData', input_json: costData },
              { scenario_id: activeScenario.id, input_key: 'assumptions', input_json: assumptions },
              { scenario_id: activeScenario.id, input_key: 'priceAssumptions', input_json: priceAssumptions },
              { scenario_id: activeScenario.id, input_key: 'streams', input_json: streams },
          ];
          await supabase.from('econ_inputs').upsert(inputPayloads, { onConflict: 'scenario_id, input_key' });
          if (fiscalTerms) {
              await supabase.from('econ_fiscal_terms').upsert({
                  scenario_id: activeScenario.id,
                  fiscal_regime: fiscalTerms.template_type,
                  terms_json: fiscalTerms
              }, { onConflict: 'scenario_id' });
          }
      } catch (err) {
          console.error(err);
      }
  }, [activeScenario, modelSettings, productionData, costData, assumptions, priceAssumptions, streams, fiscalTerms]);

  const runEconomics = useCallback(async (autoNavigate = true) => {
      if (!activeScenario) {
          toast({ variant: "destructive", title: "Error", description: "No active scenario selected" });
          return;
      }
      
      setCalculating(true);
      setEconomicsStatus('running');
      
      try {
          // Save inputs first
          await saveInputs();
          
          // Validate required inputs
          if (!productionData.length) {
              throw new Error("Production data is required");
          }
          
          if (!fiscalTerms) {
              throw new Error("Fiscal terms must be configured");
          }
          
          // Run calculation engine
          const inputData = {
              modelSettings,
              productionData,
              costData,
              assumptions,
              fiscalTerms,
              priceAssumptions
          };
          
          const results = await calculateEconomics(inputData);
          
          if (!results) {
              throw new Error("Calculation engine returned no results");
          }
          
          setCalculationResults(results);
          setEconomicsStatus('complete');
          setLastRunTime(new Date());
          
          // Save results to database
          const resultPayload = {
              scenario_id: activeScenario.id,
              calculation_results: results,
              metrics: results.metrics,
              run_timestamp: new Date().toISOString()
          };
          
          await supabase.from('econ_results').upsert(resultPayload, { onConflict: 'scenario_id' });
          
          toast({ 
              title: "Economics Complete", 
              description: `NPV: ${results.metrics?.npv ? `$${(results.metrics.npv / 1000000).toFixed(1)}MM` : 'N/A'}` 
          });
          
          // Auto-navigate to dashboard if requested
          if (autoNavigate) {
              // Auto-switch to Dashboard tab logic would go here
              // This is typically handled by the parent component
          }
          
      } catch (error) {
          console.error("Economics calculation failed:", error);
          setEconomicsStatus('error');
          toast({ 
              variant: "destructive", 
              title: "Calculation Failed", 
              description: error.message || "Economics calculation encountered an error" 
          });
      } finally {
          setCalculating(false);
      }
  }, [activeScenario, saveInputs, modelSettings, productionData, costData, assumptions, fiscalTerms, priceAssumptions, toast]);

  // Placeholder functions for other context methods
  const loadDemoModel = useCallback((type) => {
      const demoData = generateDemoData(type);
      setProductionData(demoData.production);
      setCostData(demoData.costs);
      setPriceAssumptions(demoData.prices);
      setFiscalTerms(demoData.fiscal);
      toast({ title: "Demo Loaded", description: `${type} template loaded successfully` });
  }, [toast]);
  
  const createScenario = useCallback(async (name, description) => {
      // Implementation would create new scenario
      console.log("Creating scenario:", name, description);
  }, []);
  
  const updateAssumptions = useCallback((updates) => {
      setAssumptions(prev => ({ ...prev, ...updates }));
  }, []);
  
  const saveFiscalTerms = useCallback(async (terms) => {
      setFiscalTerms(terms);
      return true;
  }, []);
  
  const updateScenarioStatus = useCallback((id, status, reason) => {
      console.log("Updating scenario status:", id, status, reason);
  }, []);
  
  const fetchComparisonResults = useCallback((scenarioIds) => {
      console.log("Fetching comparison for:", scenarioIds);
  }, []);
  
  const calculateIncrementalMetrics = useCallback((base, alt, baseMetrics, altMetrics, discountRate) => {
      return {
          npvDelta: (altMetrics.npv || 0) - (baseMetrics.npv || 0),
          irrDelta: (altMetrics.irr || 0) - (baseMetrics.irr || 0)
      };
  }, []);
  
  const saveScenarioNote = useCallback(async (scenarioId, section, text) => {
      console.log("Saving note:", scenarioId, section, text);
  }, []);
  
  const deleteScenarioNote = useCallback(async (scenarioId, section) => {
      console.log("Deleting note:", scenarioId, section);
  }, []);
  
  const applyQuickFix = useCallback((issue) => {
      console.log("Applying quick fix:", issue);
  }, []);

  const contextValue = {
    // State
    currentProject,
    currentModel,
    scenarios,
    activeScenario,
    loading,
    saving,
    calculating,
    economicsStatus,
    lastRunTime,
    modelSettings,
    streams,
    productionData,
    costData,
    assumptions,
    fiscalTerms,
    priceAssumptions,
    validationIssues,
    calculationResults,
    comparisonData,
    auditLogs,
    scenarioNotes,
    fdpSnapshots,
    afeBudgets,
    sensitivityResults,
    importedData,
    history,
    historyIndex,
    progress,
    
    // Actions
    createProject,
    fetchModelDetails,
    setActiveScenario,
    setModelSettings,
    setStreams,
    setProductionData,
    setCostData,
    updateAssumptions,
    setPriceAssumptions,
    saveFiscalTerms,
    runEconomics,
    loadDemoModel,
    createScenario,
    updateScenarioStatus,
    fetchComparisonResults,
    calculateIncrementalMetrics,
    saveScenarioNote,
    deleteScenarioNote,
    applyQuickFix,
    undo,
    redo,
    takeSnapshot
  };

  return (
    <PetroleumEconomicsContext.Provider value={contextValue}>
      {children}
    </PetroleumEconomicsContext.Provider>
  );
};

export const usePetroleumEconomics = () => {
  const context = useContext(PetroleumEconomicsContext);
  if (context === undefined) {
    throw new Error('usePetroleumEconomics must be used within a PetroleumEconomicsProvider');
  }
  return context;
};