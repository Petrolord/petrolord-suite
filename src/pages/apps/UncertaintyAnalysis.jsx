
import React, { useState, useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, BarChartHorizontal, AlertTriangle, Play, SlidersHorizontal, Settings, Trash2, Plus, Library, FolderKanban } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from "@/components/ui/drawer";
import { supabase } from '@/lib/customSupabaseClient';
import { useReservoir } from '@/contexts/ReservoirContext';
import { Checkbox } from '@/components/ui/checkbox';

const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-3 text-left">
        <div className="flex items-center space-x-3"><div className="text-cyan-400">{icon}</div><span className="font-semibold text-white">{title}</span></div>
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }}><ArrowLeft className="w-4 h-4" /></motion.div>
      </button>
      <motion.div initial={false} animate={{ height: isOpen ? 'auto' : 0 }} className="overflow-hidden">
        <div className="p-4 border-t border-gray-700">{children}</div>
      </motion.div>
    </div>
  );
};

const UncertaintyAnalysis = () => {
  const { toast } = useToast();
  const { reservoir, isReady } = useReservoir();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentCase, setCurrentCase] = useState(null);
  const [isScenarioDrawerOpen, setIsScenarioDrawerOpen] = useState(false);

  const [setup, setSetup] = useState({ nsims: 1000, seed: 123, sampling: 'LHS' });
  const [variables, setVariables] = useState([]);

  useEffect(() => {
    const savedProjects = localStorage.getItem('scenario_planner_projects');
    if (savedProjects) {
      setProjects(JSON.parse(savedProjects));
    }
  }, []);

  const loadStateFromCase = (caseData) => {
    setCurrentCase(caseData);
    const baseCase = caseData.payload.base_case;
    const initialVars = [];
    
    // Price Deck
    initialVars.push({ path: 'price_deck.oil_usd_per_bbl', value: baseCase.price_deck.oil_usd_per_bbl, enabled: false, dist: 'NORMAL', p1: baseCase.price_deck.oil_usd_per_bbl, p2: baseCase.price_deck.oil_usd_per_bbl * 0.1 });
    
    // Wells
    baseCase.wells.forEach((well, idx) => {
      initialVars.push({ path: `wells[${idx}].decline.qi_bpd`, value: well.decline.qi_bpd, enabled: true, dist: 'TRI', p1: well.decline.qi_bpd * 0.8, p2: well.decline.qi_bpd * 1.2, p3: well.decline.qi_bpd });
      initialVars.push({ path: `wells[${idx}].decline.Di_per_day`, value: well.decline.Di_per_day, enabled: false, dist: 'UNIFORM', p1: well.decline.Di_per_day * 0.9, p2: well.decline.Di_per_day * 1.1 });
      if (well.decline.model === 'HYP') {
        initialVars.push({ path: `wells[${idx}].decline.b`, value: well.decline.b, enabled: false, dist: 'FIXED', p1: well.decline.b });
      }
    });
    setVariables(initialVars);
  };

  const handleSelectCase = (project, caseData) => {
    setCurrentProject(project);
    loadStateFromCase(caseData);
    setIsScenarioDrawerOpen(false);
  };

  const handleSetupChange = (field, value) => setSetup(prev => ({ ...prev, [field]: value }));
  const handleVarChange = (index, field, value) => {
    const newVars = [...variables];
    newVars[index][field] = value;
    setVariables(newVars);
  };

  const runAnalysis = async () => {
    if (!currentCase) {
      toast({ title: "Error", description: "Select a scenario case first", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResults(null);
    
    const uncertainParams = variables.filter(v => v.enabled).map(v => ({
        path: v.path,
        dist: v.dist,
        p1: parseFloat(v.p1),
        p2: parseFloat(v.p2),
        p3: v.p3 ? parseFloat(v.p3) : undefined,
    }));

    const payload = {
      nsims: setup.nsims,
      base_case: currentCase.payload.base_case,
      uncertain_params: uncertainParams,
    };

    try {
      const { data, error } = await supabase.functions.invoke('scenario-planner-engine', {
        body: { action: 'run_mc', payload }
      });

      if (error) throw new Error(`Edge Function Error: ${error.message}`);
      if (data.error) throw new Error(data.error);

      setResults(data);
      toast({ title: "Analysis Complete!", description: "Uncertainty and sensitivity results are ready." });
    } catch (err) {
      console.error(err);
      toast({ title: "API Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const TornadoChart = ({ data }) => {
    if (!data) return null;
    return (
      <div className="w-full h-[400px] flex items-center justify-center text-slate-500">
        Chart removed
      </div>
    );
  };
  
  const ExceedancePlot = ({ data, title, unit }) => {
    if (!data || data.length === 0) return null;
    return (
        <div className="w-full h-[300px] flex items-center justify-center text-slate-500 bg-slate-800 rounded">
            Chart removed
        </div>
    );
  };

  return (
    <>
      <Helmet><title>Uncertainty Analysis - Petrolord</title></Helmet>
      <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard/reservoir"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
            <div className="flex items-center space-x-3"><div className="bg-gradient-to-r from-teal-500 to-cyan-500 p-2 rounded-lg"><BarChartHorizontal className="w-6 h-6" /></div><div><h1 className="text-2xl font-bold">Reservoir Uncertainty & Sensitivity</h1><p className="text-cyan-300">{currentProject ? `${currentProject.name} > ${currentCase?.name}` : "No scenario case selected"}</p></div></div>
          </div>
          <Drawer open={isScenarioDrawerOpen} onOpenChange={setIsScenarioDrawerOpen}>
              <DrawerTrigger asChild><Button variant="outline"><FolderKanban className="w-4 h-4 mr-2" />Load Scenario Case</Button></DrawerTrigger>
              <DrawerContent className="bg-slate-900 text-white border-slate-700 max-h-[80vh]">
                <DrawerHeader><DrawerTitle>Load Case from Scenario Planner</DrawerTitle><DrawerDescription>Select a project and case to run uncertainty analysis.</DrawerDescription></DrawerHeader>
                <div className="p-4 overflow-y-auto">
                  <div className="space-y-4">
                    {projects.filter(p => p.reservoir_id === reservoir?.id).map(p => (
                      <div key={p.id} className="bg-slate-800 rounded-lg p-3">
                        <h3 className="font-bold text-purple-300">{p.name}</h3>
                        <div className="mt-2 space-y-1">
                          {p.cases.map(c => (
                            <div key={c.id} className="flex items-center justify-between bg-slate-700 p-2 rounded-md">
                              <span>{c.name}</span>
                              <Button size="sm" onClick={() => handleSelectCase(p, c)}>Load</Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
        </motion.div>

        {!isReady ? (
          <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400"></div></div>
        ) : !reservoir?.id ? (
          <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded-lg mb-6 flex items-center justify-center gap-4">
            <AlertTriangle className="w-6 h-6" /><span className="text-lg font-semibold">Please select a reservoir from the main dashboard first.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <CollapsibleSection title="Simulation Setup" icon={<Settings />} defaultOpen>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Simulations</Label><Input type="number" value={setup.nsims} onChange={e => handleSetupChange('nsims', e.target.value)} className="bg-slate-700 border-slate-600" /></div>
                  <div><Label>Sampling</Label><Select value={setup.sampling} onValueChange={v => handleSetupChange('sampling', v)}><SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LHS">LHS</SelectItem><SelectItem value="MC">Monte Carlo</SelectItem></SelectContent></Select></div>
                </div>
              </CollapsibleSection>
              
              <CollapsibleSection title="Uncertain Variables" icon={<SlidersHorizontal />} defaultOpen>
                {!currentCase ? <p className="text-slate-400">Load a scenario case to see variables.</p> : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {variables.map((v, i) => (
                      <div key={i} className="bg-slate-800 p-3 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox id={`check-${i}`} checked={v.enabled} onCheckedChange={val => handleVarChange(i, 'enabled', val)} />
                          <label htmlFor={`check-${i}`} className="font-semibold text-slate-300 flex-grow">{v.path}</label>
                        </div>
                        {v.enabled && (
                          <div className="grid grid-cols-3 gap-2">
                            <Select value={v.dist} onValueChange={val => handleVarChange(i, 'dist', val)}><SelectTrigger className="bg-slate-700 border-slate-600"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED">FIXED</SelectItem><SelectItem value="UNIFORM">UNIFORM</SelectItem><SelectItem value="TRI">TRI</SelectItem><SelectItem value="NORMAL">NORMAL</SelectItem><SelectItem value="LOGNORMAL">LOGNORMAL</SelectItem></SelectContent></Select>
                            <Input value={v.p1} onChange={e => handleVarChange(i, 'p1', e.target.value)} placeholder={v.dist === 'NORMAL' ? 'Mean' : 'Min/P1'} className="bg-slate-700 border-slate-600"/>
                            <Input value={v.p2} onChange={e => handleVarChange(i, 'p2', e.target.value)} placeholder={v.dist === 'NORMAL' ? 'StdDev' : 'Max/P2'} className="bg-slate-700 border-slate-600"/>
                            {v.dist === 'TRI' && <Input value={v.p3} onChange={e => handleVarChange(i, 'p3', e.target.value)} placeholder="Mode" className="bg-slate-700 border-slate-600 col-span-3"/>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              <Button onClick={runAnalysis} disabled={loading || !currentCase} className="w-full bg-gradient-to-r from-cyan-600 to-teal-600">{loading ? 'Running...' : 'Run Analysis'}</Button>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {loading && <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400"></div></div>}
              {!results && !loading && <div className="flex flex-col items-center justify-center h-64 bg-gray-800/50 rounded-lg"><SlidersHorizontal className="w-12 h-12 text-gray-500 mb-4"/><p className="text-gray-400">Load a case, configure variables, and run analysis.</p></div>}
              {results && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Tabs defaultValue="summary">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="charts">Charts</TabsTrigger>
                      <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
                    </TabsList>
                    <TabsContent value="summary" className="bg-gray-800/50 p-4 rounded-b-lg">
                      <h3 className="font-bold text-lg mb-2 text-cyan-300">Output Metrics Summary</h3>
                      <Table>
                        <TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>P10</TableHead><TableHead>P50</TableHead><TableHead>P90</TableHead><TableHead>Mean</TableHead></TableRow></TableHeader>
                        <TableBody>
                          <TableRow><TableCell>NPV (MM USD)</TableCell>
                            <TableCell className="font-mono">{(results.npv_p10_usd / 1e6).toFixed(1)}</TableCell>
                            <TableCell className="font-mono">{(results.npv_p50_usd / 1e6).toFixed(1)}</TableCell>
                            <TableCell className="font-mono">{(results.npv_p90_usd / 1e6).toFixed(1)}</TableCell>
                            <TableCell className="font-mono">{(results.npv_mean_usd / 1e6).toFixed(1)}</TableCell>
                          </TableRow>
                          <TableRow><TableCell>Total Oil (MMbbl)</TableCell>
                            <TableCell className="font-mono">{(results.oil_p10_bbl / 1e6).toFixed(2)}</TableCell>
                            <TableCell className="font-mono">{(results.oil_p50_bbl / 1e6).toFixed(2)}</TableCell>
                            <TableCell className="font-mono">{(results.oil_p90_bbl / 1e6).toFixed(2)}</TableCell>
                            <TableCell className="font-mono">{(results.oil_mean_bbl / 1e6).toFixed(2)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TabsContent>
                    <TabsContent value="charts" className="bg-gray-800/50 p-4 rounded-b-lg">
                       <h3 className="font-bold text-lg mb-2 text-cyan-300">Distributions</h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="w-full h-[300px] flex items-center justify-center text-slate-500 bg-slate-800 rounded">
                              Chart removed
                          </div>
                          <ExceedancePlot data={results.npv_samples_usd} title="NPV Exceedance" unit="NPV (USD)" />
                          <div className="w-full h-[300px] flex items-center justify-center text-slate-500 bg-slate-800 rounded">
                              Chart removed
                          </div>
                          <ExceedancePlot data={results.oil_samples_bbl} title="Total Oil Exceedance" unit="Oil (bbl)" />
                       </div>
                    </TabsContent>
                    <TabsContent value="sensitivity" className="bg-gray-800/50 p-4 rounded-b-lg space-y-4">
                      <TornadoChart data={results.sensitivity} />
                    </TabsContent>
                  </Tabs>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default UncertaintyAnalysis;
