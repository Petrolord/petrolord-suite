
import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, GitBranch, AlertTriangle, Play, HelpCircle, Save, FolderKanban, Plus, Library, Trash2, PlusCircle, Copy, Contrast as Compare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from "@/components/ui/drawer";
import { useReservoir } from '@/contexts/ReservoirContext';
import { supabase } from '@/lib/customSupabaseClient';
import { v4 as uuidv4 } from 'uuid';

const NewReservoirModal = ({ onReservoirCreated, onOpenChange, open, triggerButton }) => {
  const [formData, setFormData] = useState({ name: '', basin: '', field: '', country: '', operator: '', fluid: 'oil', drive: 'solution_gas', unit_system: 'FIELD' });
  const { toast } = useToast();
  const handleSubmit = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('reservoir-engine', {
        body: { action: 'create', payload: formData },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      toast({ title: "Success!", description: "Reservoir created." });
      onReservoirCreated({ id: data.id, name: data.name });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 text-white border-slate-700">
        <DialogHeader><DialogTitle>Create New Reservoir</DialogTitle><DialogDescription>Enter minimal details for a new reservoir.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-4">
          {Object.keys(formData).map(key => (
            <div className="grid grid-cols-4 items-center gap-4" key={key}><Label htmlFor={key} className="text-right capitalize">{key.replace('_', ' ')}</Label><Input id={key} name={key} value={formData[key]} onChange={e => setFormData({...formData, [e.target.name]: e.target.value})} className="col-span-3 bg-slate-800 border-slate-600" /></div>
          ))}
        </div>
        <DialogFooter><Button onClick={handleSubmit} className="bg-lime-600 hover:bg-lime-700">Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SelectReservoirDrawer = ({ onSelectReservoir, onReservoirCreated }) => {
    const [open, setOpen] = useState(false);
    const [reservoirs, setReservoirs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isNewReservoirModalOpen, setIsNewReservoirModalOpen] = useState(false);
    const { toast } = useToast();
    const fetchReservoirs = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('reservoir-engine', { body: { action: 'list' } });
            if (error) throw error;
            if (data.error) throw new Error(data.error);
            setReservoirs(data);
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    useEffect(() => { if (open) fetchReservoirs(); }, [open, fetchReservoirs]);
    const handleSelect = (reservoir) => { onSelectReservoir(reservoir); setOpen(false); };
    const handleReservoirCreatedAndSelect = (newReservoir) => {
        onReservoirCreated(newReservoir);
        setIsNewReservoirModalOpen(false);
        setOpen(false);
    };
    return (
        <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild><Button variant="outline"><Library className="w-4 h-4 mr-2" />Select Reservoir</Button></DrawerTrigger>
            <DrawerContent className="bg-slate-900 text-white border-slate-700"><DrawerHeader><DrawerTitle>My Reservoirs</DrawerTitle><DrawerDescription>Select a reservoir to load its data.</DrawerDescription></DrawerHeader>
                <div className="p-4">{isLoading ? <p>Loading...</p> : reservoirs.length > 0 ? <div className="space-y-2">{reservoirs.map((r) => (<div key={r.id} className="flex items-center justify-between p-2 rounded-md bg-slate-800 hover:bg-slate-700"><div><p className="font-semibold">{r.name}</p><p className="text-sm text-lime-300">{r.field} ({r.basin})</p></div><Button size="sm" onClick={() => handleSelect(r)}>Select</Button></div>))}</div> : <div className="text-center space-y-4"><p>You have no reservoirs yet.</p></div>}
                <div className="mt-4 flex justify-center">
                    <NewReservoirModal onReservoirCreated={handleReservoirCreatedAndSelect} open={isNewReservoirModalOpen} onOpenChange={setIsNewReservoirModalOpen} triggerButton={<Button><Plus className="w-4 h-4 mr-2" />Create New Reservoir</Button>} />
                </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
};

const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-3 text-left">
        <div className="flex items-center space-x-3"><div className="text-purple-400">{icon}</div><span className="font-semibold text-white">{title}</span></div>
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }}><ArrowLeft className="w-4 h-4" /></motion.div>
      </button>
      <motion.div initial={false} animate={{ height: isOpen ? 'auto' : 0 }} className="overflow-hidden">
        <div className="p-4 border-t border-gray-700">{children}</div>
      </motion.div>
    </div>
  );
};

const ScenarioPlanner = () => {
  const { toast } = useToast();
  const location = useLocation();
  const { reservoir, setReservoir, isReady } = useReservoir();
  const [loading, setLoading] = useState(false);
  const [mcLoading, setMcLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [mcResults, setMcResults] = useState(null);
  const [schemaInfo, setSchemaInfo] = useState(null);
  const [isNewReservoirModalOpen, setIsNewReservoirModalOpen] = useState(false);
  
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentCase, setCurrentCase] = useState(null);
  const [isScenarioDrawerOpen, setIsScenarioDrawerOpen] = useState(false);
  const [comparisonCases, setComparisonCases] = useState([]);
  const [isComparing, setIsComparing] = useState(false);

  const [setup, setSetup] = useState({ start_date: '2025-01-01', months: 120, curtailment: 'none' });
  const [priceDeck, setPriceDeck] = useState({ oil_usd_per_bbl: 80, gas_usd_per_mscf: 3.5 });
  const [facility, setFacility] = useState({ oil_capacity_bpd: 50000, gas_capacity_mscfd: 100, water_capacity_bpd: 80000, global_uptime_frac: 0.95 });
  const [costs, setCosts] = useState({ capex_per_well_usd: 5000000, opex_oil_usd_per_bbl: 5, opex_water_usd_per_bbl: 2, fixed_opex_usd_per_month: 100000, royalty_frac: 0.125, tax_rate: 0.35, discount_rate_annual: 0.1 });
  const [wells, setWells] = useState([
    { id: uuidv4(), name: 'Well-1', start_date: '2025-01-01', decline: { model: 'HYP', qi_bpd: 2000, Di_per_day: 0.005, b: 1.2, econ_limit_bpd: 10 }, ramp_months: 2, uptime_frac: 0.98, gor_scf_per_stb: 800, wor_model: { type: 'watercut_fixed_frac', value: 0.1 }, capex_override_usd: null, enabled: true },
    { id: uuidv4(), name: 'Well-2', start_date: '2026-01-01', decline: { model: 'EXP', qi_bpd: 1800, Di_per_day: 0.004, b: null, econ_limit_bpd: 15 }, ramp_months: 1, uptime_frac: 0.97, gor_scf_per_stb: 750, wor_model: { type: 'a_b', a: 0.01, b: 1.1 }, capex_override_usd: 6000000, enabled: true },
  ]);
  const [mcInputs, setMcInputs] = useState({ nsims: 1000, decline_var: { qi: { type: 'tri', min: 0.8, mode: 1, max: 1.2 } }, price_var: { oil: { type: 'norm', mean: 80, std: 10 } } });

  // Load and save projects from/to localStorage
  useEffect(() => {
    const savedProjects = localStorage.getItem('scenario_planner_projects');
    if (savedProjects) {
      setProjects(JSON.parse(savedProjects));
    }
  }, []);

  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('scenario_planner_projects', JSON.stringify(projects));
    }
  }, [projects]);


  const loadStateFromCase = (caseData) => {
    const { base_case } = caseData.payload;
    setSetup(base_case.setup);
    setPriceDeck(base_case.price_deck);
    setFacility(base_case.facility);
    setCosts(base_case.costs);
    setWells(base_case.wells.map(w => ({...w, id: w.id || uuidv4() })));
    setResults(caseData.results || null);
    setMcResults(caseData.mc_results || null);
    setCurrentCase(caseData);
  };

  const handleSelectCase = (project, caseData) => {
    setCurrentProject(project);
    loadStateFromCase(caseData);
    setIsScenarioDrawerOpen(false);
    setIsComparing(false);
  };

  const handleCreateNewProject = async () => {
    if (!reservoir.id) {
      toast({ title: "Error", description: "A reservoir must be selected first.", variant: "destructive" });
      return;
    }
    const projectName = prompt("Enter new project name:", `Forecast for ${reservoir.name}`);
    if (!projectName) return;

    const newCase = {
      id: uuidv4(),
      name: "Base Case",
      payload: { reservoir_id: reservoir.id, base_case: { setup, price_deck: priceDeck, facility, costs, wells } },
      results: null,
      mc_results: null,
      created_at: new Date().toISOString(),
    };
    const newProject = {
      id: uuidv4(),
      name: projectName,
      reservoir_id: reservoir.id,
      cases: [newCase],
      created_at: new Date().toISOString(),
    };
    
    setProjects([...projects, newProject]);
    setCurrentProject(newProject);
    handleSelectCase(newProject, newCase);
  };

  const handleSaveCase = () => {
    if (!currentProject || !currentCase) {
      toast({ title: "Error", description: "No active project or case. Create or load one first.", variant: "destructive" });
      return;
    }
    const caseName = prompt("Save as:", currentCase.name);
    if (!caseName) return;

    const newCaseData = {
      ...currentCase,
      id: uuidv4(),
      name: caseName,
      payload: { reservoir_id: reservoir.id, base_case: { setup, price_deck: priceDeck, facility, costs, wells } },
      results,
      mc_results: mcResults,
      created_at: new Date().toISOString(),
    };

    const updatedProject = {
      ...currentProject,
      cases: [...currentProject.cases, newCaseData]
    };

    setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
    setCurrentCase(newCaseData);
    toast({ title: "Case Saved!", description: `Saved as "${caseName}" in project "${currentProject.name}".` });
  };
  
  const handleUpdateCurrentCase = () => {
    if (!currentProject || !currentCase) {
      toast({ title: "Error", description: "No active case to update.", variant: "destructive" });
      return;
    }
    const updatedCase = {
      ...currentCase,
      payload: { reservoir_id: reservoir.id, base_case: { setup, price_deck: priceDeck, facility, costs, wells } },
      results,
      mc_results: mcResults,
    };
    const updatedProject = {
      ...currentProject,
      cases: currentProject.cases.map(c => c.id === updatedCase.id ? updatedCase : c)
    };
    setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
    setCurrentCase(updatedCase);
    toast({ title: "Case Updated!", description: `Case "${currentCase.name}" has been updated.` });
  };

  const handleWellChange = (id, field, value, subfield = null, subsubfield = null) => {
    setWells(wells.map(w => {
      if (w.id !== id) return w;
      if (subsubfield) return { ...w, [field]: { ...w[field], [subfield]: { ...w[field][subfield], [subsubfield]: value } } };
      if (subfield) return { ...w, [field]: { ...w[field], [subfield]: value } };
      return { ...w, [field]: value };
    }));
  };
  const addWell = () => setWells([...wells, { id: uuidv4(), name: `Well-${wells.length + 1}`, start_date: '2027-01-01', decline: { model: 'EXP', qi_bpd: 1500, Di_per_day: 0.003 }, ramp_months: 1, uptime_frac: 0.95, gor_scf_per_stb: 900, wor_model: { type: 'watercut_fixed_frac', value: 0.2 }, enabled: true }]);
  const deleteWell = (id) => setWells(wells.filter(w => w.id !== id));

  const runAnalysis = async (action, body, setter, loaderSetter) => {
    if (!reservoir?.id) {
      toast({ title: "Error", description: "Select or create a reservoir first", variant: "destructive" });
      return;
    }
    loaderSetter(true);
    setter(null);
    try {
      const { data, error } = await supabase.functions.invoke('scenario-planner-engine', {
        body: { action, payload: body }
      });
      if (error) throw new Error(`Edge Function Error: ${error.message}`);
      if (data.error) throw new Error(data.error);
      setter(data);
      toast({ title: "Analysis Complete!", description: "Results have been updated." });
      return data;
    } catch (err) {
      console.error(err);
      toast({ title: "API Error", description: err.message, variant: "destructive" });
    } finally {
      loaderSetter(false);
    }
  };

  const handleRun = async () => {
    const payload = {
      reservoir_id: reservoir.id,
      base_case: { setup, price_deck: priceDeck, facility, costs, wells: wells.map(({ id, ...w }) => w) }
    };
    const res = await runAnalysis('run_deterministic', payload, setResults, setLoading);
    if (res) {
        setResults(res);
        // Also update the current case with the new results
        if (currentCase) {
            const updatedCase = { ...currentCase, results: res };
            setCurrentCase(updatedCase);
            const updatedProject = {
                ...currentProject,
                cases: currentProject.cases.map(c => c.id === updatedCase.id ? updatedCase : c)
            };
            setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
        }
    }
  };

  const handleRunMc = async () => {
    const payload = { ...mcInputs, base_case: { setup, price_deck: priceDeck, facility, costs, wells: wells.map(({ id, ...w }) => w) } };
    const res = await runAnalysis('run_mc', payload, setMcResults, setMcLoading);
    if (res) setMcResults(res);
  };

  const fetchSchema = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scenario-planner-engine', { body: { action: 'get_schema' } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setSchemaInfo(data);
    } catch (error) {
      toast({ title: "Failed to fetch schema", description: error.message, variant: "destructive" });
    }
  };
  
  const handleCompare = () => {
    const selectedCases = projects.flatMap(p => p.cases.filter(c => c.selectedForCompare));
    if (selectedCases.length < 2) {
      toast({ title: "Not enough cases", description: "Please select at least 2 cases to compare.", variant: "destructive" });
      return;
    }
    setComparisonCases(selectedCases);
    setIsComparing(true);
    setIsScenarioDrawerOpen(false);
  };

  const toggleCompareSelection = (projectId, caseId) => {
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        cases: p.cases.map(c => c.id === caseId ? { ...c, selectedForCompare: !c.selectedForCompare } : c)
      };
    }));
  };

  const ComparisonView = () => (
    <div className="lg:col-span-3 space-y-6">
      <h2 className="text-2xl font-bold text-center">Scenario Comparison</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {comparisonCases.map(c => (
          <div key={c.id} className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-bold text-lg text-purple-300">{c.name}</h3>
            {c.results?.kpis && (
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <p>NPV:</p><p className="font-mono text-right">${(c.results.kpis.npv_usd / 1e6).toFixed(1)} MM</p>
                <p>Total Oil:</p><p className="font-mono text-right">{(c.results.kpis.total_oil_bbl / 1e6).toFixed(2)} MMbbl</p>
                <p>Peak Oil:</p><p className="font-mono text-right">{Math.round(c.results.kpis.peak_oil_rate_bpd).toLocaleString()} bpd</p>
                <p>Payback:</p><p className="font-mono text-right">{c.results.kpis.payback_month} mo</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="w-full h-[300px] bg-slate-800 flex items-center justify-center text-slate-500 rounded">
            Chart removed
        </div>
        <div className="w-full h-[300px] bg-slate-800 flex items-center justify-center text-slate-500 rounded">
            Chart removed
        </div>
      </div>
      <Button onClick={() => setIsComparing(false)}>Back to Editor</Button>
    </div>
  );

  return (
    <>
      <Helmet><title>Scenario Planner - Petrolord</title></Helmet>
      <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard/reservoir"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
            <div className="flex items-center space-x-3"><div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-2 rounded-lg"><GitBranch className="w-6 h-6" /></div><div><h1 className="text-2xl font-bold">Production Forecasting & Scenario Planner</h1><p className="text-purple-300">{currentProject ? `${currentProject.name} > ${currentCase?.name}` : "No project selected"}</p></div></div>
          </div>
          <div className="flex items-center space-x-2">
            <Drawer open={isScenarioDrawerOpen} onOpenChange={setIsScenarioDrawerOpen}>
              <DrawerTrigger asChild><Button variant="outline" size="sm"><FolderKanban className="w-4 h-4 mr-2" />My Scenarios</Button></DrawerTrigger>
              <DrawerContent className="bg-slate-900 text-white border-slate-700 max-h-[80vh]">
                <DrawerHeader><DrawerTitle>Scenario Manager</DrawerTitle><DrawerDescription>Manage your projects and cases.</DrawerDescription></DrawerHeader>
                <div className="p-4 overflow-y-auto">
                  <div className="space-y-4">
                    {projects.filter(p => p.reservoir_id === reservoir.id).map(p => (
                      <div key={p.id} className="bg-slate-800 rounded-lg p-3">
                        <h3 className="font-bold text-purple-300">{p.name}</h3>
                        <div className="mt-2 space-y-1">
                          {p.cases.map(c => (
                            <div key={c.id} className="flex items-center justify-between bg-slate-700 p-2 rounded-md">
                              <div className="flex items-center gap-2">
                                <Checkbox id={`compare-${c.id}`} checked={!!c.selectedForCompare} onCheckedChange={() => toggleCompareSelection(p.id, c.id)} />
                                <label htmlFor={`compare-${c.id}`}>{c.name}</label>
                              </div>
                              <Button size="sm" onClick={() => handleSelectCase(p, c)}>Load</Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-4 justify-center">
                    <Button onClick={handleCreateNewProject}><Plus className="w-4 h-4 mr-2" />New Project</Button>
                    <Button onClick={handleCompare} variant="secondary"><Compare className="w-4 h-4 mr-2" />Compare Selected</Button>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
            <Button size="sm" onClick={handleUpdateCurrentCase} disabled={!currentCase}><Save className="w-4 h-4 mr-2" />Update Case</Button>
            <Button size="sm" onClick={handleSaveCase} variant="secondary"><Copy className="w-4 h-4 mr-2" />Save as New Case</Button>
          </div>
        </motion.div>

        {!isReady ? (
          <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400"></div></div>
        ) : !reservoir?.id ? (
          <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded-lg mb-6 flex items-center justify-center gap-4">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-lg font-semibold">No Reservoir Selected. Please select or create one to begin.</span>
            <SelectReservoirDrawer onSelectReservoir={setReservoir} onReservoirCreated={setReservoir} />
            <NewReservoirModal onReservoirCreated={setReservoir} open={isNewReservoirModalOpen} onOpenChange={setIsNewReservoirModalOpen} triggerButton={<Button><Plus className="w-4 h-4 mr-2" />Create Reservoir</Button>} />
          </div>
        ) : isComparing ? (
          <ComparisonView />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <CollapsibleSection title="Scenario Setup" icon={<GitBranch />} defaultOpen>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Start Date</Label><Input type="date" value={setup.start_date} onChange={e => setSetup({ ...setup, start_date: e.target.value })} /></div>
                  <div><Label>Months</Label><Input type="number" value={setup.months} onChange={e => setSetup({ ...setup, months: parseInt(e.target.value) })} /></div>
                  <div><Label>Curtailment</Label><Select value={setup.curtailment} onValueChange={v => setSetup({ ...setup, curtailment: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="proportional">Proportional</SelectItem></SelectContent></Select></div>
                </div>
              </CollapsibleSection>
              <CollapsibleSection title="Price Deck & Costs" icon={<GitBranch />}>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Oil Price ($/bbl)</Label><Input type="number" value={priceDeck.oil_usd_per_bbl} onChange={e => setPriceDeck({ ...priceDeck, oil_usd_per_bbl: parseFloat(e.target.value) })} /></div>
                  <div><Label>Gas Price ($/Mscf)</Label><Input type="number" value={priceDeck.gas_usd_per_mscf} onChange={e => setPriceDeck({ ...priceDeck, gas_usd_per_mscf: parseFloat(e.target.value) })} /></div>
                  <div><Label>Fixed OPEX ($/mo)</Label><Input type="number" value={costs.fixed_opex_usd_per_month} onChange={e => setCosts({ ...costs, fixed_opex_usd_per_month: parseFloat(e.target.value) })} /></div>
                  <div><Label>Discount Rate (ann.)</Label><Input type="number" step="0.01" value={costs.discount_rate_annual} onChange={e => setCosts({ ...costs, discount_rate_annual: parseFloat(e.target.value) })} /></div>
                </div>
              </CollapsibleSection>
              <CollapsibleSection title="Wells" icon={<GitBranch />} defaultOpen>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {wells.map(w => (
                    <div key={w.id} className="bg-gray-700/50 p-3 rounded-md space-y-2">
                      <div className="flex justify-between items-center">
                        <Input className="text-lg font-bold w-1/2" value={w.name} onChange={e => handleWellChange(w.id, 'name', e.target.value)} />
                        <div className="flex items-center gap-2">
                          <Checkbox checked={w.enabled} onCheckedChange={v => handleWellChange(w.id, 'enabled', v)} />
                          <Button variant="ghost" size="icon" onClick={() => deleteWell(w.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label>Start Date</Label><Input type="date" value={w.start_date} onChange={e => handleWellChange(w.id, 'start_date', e.target.value)} /></div>
                        <div><Label>Model</Label><Select value={w.decline.model} onValueChange={v => handleWellChange(w.id, 'decline', v, 'model')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EXP">Exponential</SelectItem><SelectItem value="HYP">Hyperbolic</SelectItem></SelectContent></Select></div>
                        <div><Label>qi (bpd)</Label><Input type="number" value={w.decline.qi_bpd} onChange={e => handleWellChange(w.id, 'decline', parseFloat(e.target.value), 'qi_bpd')} /></div>
                        <div><Label>Di (/day)</Label><Input type="number" step="0.0001" value={w.decline.Di_per_day} onChange={e => handleWellChange(w.id, 'decline', parseFloat(e.target.value), 'Di_per_day')} /></div>
                        {w.decline.model === 'HYP' && <div><Label>b-factor</Label><Input type="number" step="0.1" value={w.decline.b} onChange={e => handleWellChange(w.id, 'decline', parseFloat(e.target.value), 'b')} /></div>}
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={addWell} variant="outline" className="w-full mt-2"><PlusCircle className="w-4 h-4 mr-2" />Add Well</Button>
              </CollapsibleSection>
              <div className="flex gap-2">
                <Button onClick={handleRun} disabled={loading || !reservoir.id} className="w-full bg-gradient-to-r from-blue-600 to-purple-600">{loading ? 'Running...' : 'Run Deterministic'}</Button>
                <Dialog><DialogTrigger asChild><Button variant="outline" onClick={fetchSchema}><HelpCircle className="w-4 h-4" /></Button></DialogTrigger><DialogContent className="bg-slate-900 text-white"><DialogHeader><DialogTitle>API Schema</DialogTitle></DialogHeader><pre className="text-xs max-h-[60vh] overflow-auto">{schemaInfo ? JSON.stringify(schemaInfo, null, 2) : 'Loading...'}</pre></DialogContent></Dialog>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {loading && <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400"></div></div>}
              {results && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                    <div className="bg-gray-800 p-3 rounded-lg"><p className="text-sm text-gray-400">NPV</p><p className="text-xl font-bold font-mono">${(results.kpis.npv_usd / 1e6).toFixed(1)} MM</p></div>
                    <div className="bg-gray-800 p-3 rounded-lg"><p className="text-sm text-gray-400">Total Oil</p><p className="text-xl font-bold font-mono">{(results.kpis.total_oil_bbl / 1e6).toFixed(2)} MMbbl</p></div>
                    <div className="bg-gray-800 p-3 rounded-lg"><p className="text-sm text-gray-400">Peak Oil</p><p className="text-xl font-bold font-mono">{Math.round(results.kpis.peak_oil_rate_bpd).toLocaleString()} bpd</p></div>
                    <div className="bg-gray-800 p-3 rounded-lg"><p className="text-sm text-gray-400">Payback</p><p className="text-xl font-bold font-mono">{results.kpis.payback_month} mo</p></div>
                    <div className="bg-gray-800 p-3 rounded-lg"><p className="text-sm text-gray-400">Total CAPEX</p><p className="text-xl font-bold font-mono">${(results.kpis.total_capex_usd / 1e6).toFixed(1)} MM</p></div>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="w-full h-[300px] bg-slate-800 flex items-center justify-center text-slate-500 rounded">
                        Chart removed
                    </div>
                    <div className="w-full h-[300px] bg-slate-800 flex items-center justify-center text-slate-500 rounded">
                        Chart removed
                    </div>
                  </div>
                </motion.div>
              )}
              <CollapsibleSection title="Monte Carlo Simulation" icon={<GitBranch />}>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Simulations</Label><Input type="number" value={mcInputs.nsims} onChange={e => setMcInputs({ ...mcInputs, nsims: parseInt(e.target.value) })} /></div>
                  <Button onClick={handleRunMc} disabled={mcLoading || !reservoir.id} className="w-full bg-gradient-to-r from-rose-600 to-red-600 mt-4 col-span-2">{mcLoading ? 'Running MC...' : 'Run Monte Carlo'}</Button>
                </div>
                {mcLoading && <div className="flex justify-center items-center h-32">Running simulations...</div>}
                {mcResults && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gray-700 p-2 rounded"><p className="text-xs">NPV P10</p><p className="font-mono">${(mcResults.npv_p10_usd / 1e6).toFixed(1)}MM</p></div>
                      <div className="bg-gray-700 p-2 rounded"><p className="text-xs">NPV P50</p><p className="font-mono">${(mcResults.npv_p50_usd / 1e6).toFixed(1)}MM</p></div>
                      <div className="bg-gray-700 p-2 rounded"><p className="text-xs">NPV P90</p><p className="font-mono">${(mcResults.npv_p90_usd / 1e6).toFixed(1)}MM</p></div>
                    </div>
                    <div className="mt-4 w-full h-[250px] bg-slate-800 flex items-center justify-center text-slate-500 rounded">
                        Chart removed
                    </div>
                  </motion.div>
                )}
              </CollapsibleSection>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ScenarioPlanner;
