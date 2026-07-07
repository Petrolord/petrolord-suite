import React, { useState, useEffect, useCallback } from 'react';
    import { Helmet } from 'react-helmet';
    import { motion } from 'framer-motion';
    import { Link } from 'react-router-dom';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { Droplets, ArrowLeft, AlertTriangle, Plus, Library, Save, FolderKanban } from 'lucide-react';
    import DataSelectionPanel from '@/components/waterflood/DataSelectionPanel';
    import KPIPanel from '@/components/waterflood/KPIPanel';
    import ChartsPanel from '@/components/waterflood/ChartsPanel';
    import InsightsPanel from '@/components/waterflood/InsightsPanel';
    import EmptyState from '@/components/waterflood/EmptyState';
    import DataQualityPanel from '@/components/waterflood/DataQualityPanel';
    import GatedFeatureNotice from '@/components/waterflood/GatedFeatureNotice';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
    import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from "@/components/ui/drawer";
    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import { useReservoir } from '@/contexts/ReservoirContext';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';

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

    const SaveProjectModal = ({ open, onOpenChange, inputs, results, reservoirId }) => {
        const [projectName, setProjectName] = useState('');
        const { toast } = useToast();
        const { user } = useAuth();

        const handleSave = async () => {
            if (!projectName) {
                toast({ variant: "destructive", title: "Project name is required." });
                return;
            }
            try {
                const { error } = await supabase.functions.invoke('waterflood-engine', {
                    body: { action: 'save_project', payload: { userId: user.id, reservoirId, projectName, inputs, results } }
                });
                if (error) throw error;
                toast({ title: "Project Saved!", description: `"${projectName}" has been saved.` });
                onOpenChange(false);
                setProjectName('');
            } catch (error) {
                toast({ variant: "destructive", title: "Save Failed", description: error.message });
            }
        };

        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[425px] bg-slate-900 text-white border-slate-700">
                    <DialogHeader><DialogTitle>Save Project</DialogTitle><DialogDescription>Enter a name for your project.</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Label htmlFor="name" className="text-right">Project Name</Label>
                        <Input id="name" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="col-span-3 bg-slate-700 border-slate-600" />
                    </div>
                    <DialogFooter><Button onClick={handleSave} className="bg-lime-600 hover:bg-lime-700">Save Project</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };

    const LoadProjectsDrawer = ({ open, onOpenChange, onSelectProject }) => {
        const [projects, setProjects] = useState([]);
        const [loading, setLoading] = useState(false);
        const { toast } = useToast();
        const { user } = useAuth();

        useEffect(() => {
            if (open && user) {
                const fetchProjects = async () => {
                    setLoading(true);
                    try {
                        const { data, error } = await supabase.functions.invoke('waterflood-engine', { body: { action: 'load_projects', payload: { userId: user.id } } });
                        if (error) throw error;
                        setProjects(data);
                    } catch (error) {
                        toast({ variant: "destructive", title: "Failed to load projects", description: error.message });
                    } finally {
                        setLoading(false);
                    }
                };
                fetchProjects();
            }
        }, [open, user, toast]);

        return (
            <Drawer open={open} onOpenChange={onOpenChange}>
                <DrawerContent className="bg-slate-900 text-white border-slate-700">
                    <DrawerHeader><DrawerTitle>Load Project</DrawerTitle><DrawerDescription>Select a saved project to load its data.</DrawerDescription></DrawerHeader>
                    <div className="p-4">
                        {loading ? <p>Loading...</p> : projects.length > 0 ? (
                            <div className="space-y-2">
                                {projects.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-slate-800 hover:bg-slate-700">
                                        <div>
                                            <p className="font-semibold">{p.project_name}</p>
                                            <p className="text-sm text-lime-300">Saved: {new Date(p.created_at).toLocaleString()}</p>
                                        </div>
                                        <Button size="sm" onClick={() => { onSelectProject(p); onOpenChange(false); }}>Load</Button>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-center">No saved projects found.</p>}
                    </div>
                </DrawerContent>
            </Drawer>
        );
    };

    const WaterfloodDashboard = () => {
      const { toast } = useToast();
      const { reservoir, setReservoir, isReady } = useReservoir();
      const [loading, setLoading] = useState(true);
      const [dashboardData, setDashboardData] = useState(null);
      const [inputData, setInputData] = useState(null);
      const [healthOk, setHealthOk] = useState(true);
      const [isNewReservoirModalOpen, setIsNewReservoirModalOpen] = useState(false);
      const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
      const [isLoadDrawerOpen, setIsLoadDrawerOpen] = useState(false);

      const runAnalysis = useCallback(async (body) => {
        setLoading(true);
        setDashboardData(null);
        setInputData(body);
         try {
            const { data, error } = await supabase.functions.invoke('waterflood-engine', { body });
            if (error) throw new Error(`Edge Function Error: ${error.message}`);
            if (data.error) throw new Error(data.error);

            setDashboardData({ ...data, lastUpdated: new Date().toISOString() });
            toast({ title: "Analysis Complete! 🎉", description: `Dashboard is updated.` });
        } catch (error) {
            toast({ title: "Analysis Failed", description: error.message, variant: "destructive" });
            setHealthOk(false);
        } finally {
            setLoading(false);
        }
      }, [toast]);
      
      const handleAnalysis = (payload, isFile = false) => {
        const body = {
            action: 'run_analysis',
            is_file: isFile,
            payload: isFile ? payload.file_content : payload.rows,
            config: payload.config,
        };
        runAnalysis(body);
      };

      useEffect(() => {
        const runSampleOnLoad = () => {
          const body = {
            action: 'run_sample_analysis',
            config: {
                start_date: '2024-01-01',
                end_date: '2024-12-31',
                unit_system: 'field',
                bw: 1.0,
                bo: 1.2,
                smooth_window_days: 5,
                vrr_window_days: 30,
                target_vrr: 1.0,
            }
          };
          runAnalysis(body);
        };
        runSampleOnLoad();
      }, [runAnalysis]);


      const handleSaveProject = () => {
        if (!dashboardData) {
            toast({ variant: "destructive", title: "No results to save", description: "Please run an analysis first." });
            return;
        }
        setIsSaveModalOpen(true);
      };

      const handleLoadProject = (project) => {
        setInputData(project.inputs_data);
        setDashboardData(project.results_data);
        toast({ title: "Project Loaded", description: `"${project.project_name}" has been loaded.` });
      };

      return (
        <>
          <Helmet><title>Waterflood Efficiency Dashboard - Petrolord</title></Helmet>
          <div className="p-4 sm:p-8 bg-gray-900 text-white min-h-screen">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <Link to="/dashboard/reservoir"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
                <div className="flex items-center space-x-2">
                  <Button onClick={() => setIsLoadDrawerOpen(true)} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20"><FolderKanban className="w-4 h-4 mr-2" />Load</Button>
                  <Button onClick={handleSaveProject} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20"><Save className="w-4 h-4 mr-2" />Save</Button>
                </div>
              </div>
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-gradient-to-r from-cyan-500 to-blue-500 p-3 rounded-xl"><Droplets className="w-8 h-8 text-white" /></div>
                <div><h1 className="text-4xl font-bold text-white">Waterflood Efficiency Dashboard</h1><p className="text-lime-200 text-lg">{reservoir?.id ? `For Reservoir: ${reservoir.name}` : "No reservoir selected"}</p></div>
              </div>
            </motion.div>

            {!isReady ? (
                <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400"></div></div>
            ) : (
              <>
                {!reservoir?.id && (
                  <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded-lg mb-6 flex items-center justify-center gap-4">
                    <AlertTriangle className="w-6 h-6" />
                    <span className="text-lg font-semibold">No Reservoir Selected. Select or create one to save results.</span>
                    <SelectReservoirDrawer onSelectReservoir={setReservoir} onReservoirCreated={setReservoir} />
                    <NewReservoirModal onReservoirCreated={setReservoir} open={isNewReservoirModalOpen} onOpenChange={setIsNewReservoirModalOpen} triggerButton={<Button><Plus className="w-4 h-4 mr-2" />Create Reservoir</Button>} />
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                  <div className="lg:col-span-1"><DataSelectionPanel onAnalyze={handleAnalysis} loading={loading} /></div>
                  <div className="lg:col-span-3 space-y-6">
                    {loading ? (<div className="flex items-center justify-center h-96 bg-white/10 rounded-xl"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-lime-400"></div></div>) : dashboardData ? (
                      <>
                        <DataQualityPanel data={dashboardData.data_quality} />
                        <KPIPanel kpis={dashboardData.kpis} lastUpdated={dashboardData.lastUpdated} />
                        <ChartsPanel dailySeries={dashboardData.daily_series} vrrSeries={dashboardData.vrr_series} />
                        <InsightsPanel alerts={{ ...dashboardData.alerts, injectivity_issue: [] }} />
                        <GatedFeatureNotice
                          title="Pattern Response"
                          message="Injector–producer lag and correlation require a time-shifted cross-correlation of injection and offset-producer rate histories, which is not yet available in this release. Results are withheld rather than shown as unverified estimates."
                        />
                        <GatedFeatureNotice
                          title="Injector Recommendations"
                          message="Injection-rate optimization is not yet available. A defensible suggested rate requires VRR-balanced pattern allocation; until that is implemented, no recommendation is shown."
                        />
                        <GatedFeatureNotice
                          title="Hall Plot Analysis"
                          message="Hall plot injectivity diagnostics require measured injection pressure (wellhead or bottomhole), which is not part of the current data schema. This analysis is disabled until pressure ingestion is added."
                        />
                      </>
                    ) : (<EmptyState apiHealthy={healthOk} />)}
                  </div>
                </div>
              </>
            )}
          </div>
          <SaveProjectModal open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen} inputs={inputData} results={dashboardData} reservoirId={reservoir?.id} />
          <LoadProjectsDrawer open={isLoadDrawerOpen} onOpenChange={setIsLoadDrawerOpen} onSelectProject={handleLoadProject} />
        </>
      );
    };

    export default WaterfloodDashboard;