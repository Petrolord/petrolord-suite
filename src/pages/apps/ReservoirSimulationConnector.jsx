
import React, { useState, useCallback, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, AlertTriangle, Layers, UploadCloud, FileText, Settings, BarChart2, History, Edit, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useReservoir } from '@/contexts/ReservoirContext';
import { supabase } from '@/lib/customSupabaseClient';

const ENGINE_NAME = 'reservoir-simulation-connector-engine';

const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-3 text-left">
        <div className="flex items-center space-x-3"><div className="text-emerald-400">{icon}</div><span className="font-semibold text-white">{title}</span></div>
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }}><ArrowLeft className="w-4 h-4" /></motion.div>
      </button>
      <motion.div initial={false} animate={{ height: isOpen ? 'auto' : 0 }} className="overflow-hidden">
        <div className="p-4 border-t border-gray-700">{children}</div>
      </motion.div>
    </div>
  );
};

const ReservoirSimulationConnector = () => {
  const { toast } = useToast();
  const { reservoir, isReady } = useReservoir();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [cases, setCases] = useState([]);
  const [activeCase, setActiveCase] = useState(null);

  const fetchProjects = useCallback(async () => {
    if (!reservoir.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(ENGINE_NAME, {
        body: { action: 'list_projects', payload: { reservoir_id: reservoir.id } }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setProjects(data);
      if (data.length > 0) {
        setActiveProject(data[0]);
      } else {
        setActiveProject(null);
        setCases([]);
        setActiveCase(null);
      }
    } catch (err) {
      toast({ title: "Error fetching projects", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [reservoir.id, toast]);

  useEffect(() => {
    if (isReady && reservoir.id) {
      fetchProjects();
    }
  }, [isReady, reservoir.id, fetchProjects]);

  const fetchCases = useCallback(async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(ENGINE_NAME, {
        body: { action: 'list_cases', payload: { project_id: activeProject.id } }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setCases(data);
      setActiveCase(data.find(c => c.id === activeCase?.id) || null);
    } catch (err) {
      toast({ title: "Error fetching cases", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeProject, activeCase?.id, toast]);

  useEffect(() => {
    if (activeProject) {
      fetchCases();
    }
  }, [activeProject, fetchCases]);

  const onDropBundle = useCallback(async (acceptedFiles) => {
    if (!reservoir.id) { toast({ title: "No Reservoir Selected", description: "Please select or create a reservoir first.", variant: "destructive" }); return; }
    const file = acceptedFiles[0];
    if (!file) return;
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const filePath = `${user.user.id}/${reservoir.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('sim-decks').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.functions.invoke(ENGINE_NAME, {
        body: { action: 'create_project_from_bundle', payload: { reservoir_id: reservoir.id, project_name: file.name.replace('.zip', ''), storage_path: filePath } }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast({ title: "Project Created!", description: "Deck bundle processed and project created." });
      fetchProjects();
    } catch (err) {
      toast({ title: "API Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, reservoir.id, fetchProjects]);

  const { getRootProps: getBundleRootProps, getInputProps: getBundleInputProps, isDragActive: isBundleDragActive } = useDropzone({ onDrop: onDropBundle, accept: { 'application/zip': ['.zip'] } });

  const onDropResults = useCallback(async (acceptedFiles) => {
    if (!activeCase) { toast({ title: "No Case Selected", description: "Please select a case to ingest results for.", variant: "destructive" }); return; }
    const file = acceptedFiles[0];
    if (!file) return;
    setLoading(true);
    const fileContent = await file.text();
    try {
      const { data, error } = await supabase.functions.invoke(ENGINE_NAME, {
        body: { action: 'ingest_results', payload: { case_id: activeCase.id, csv_data: fileContent } }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast({ title: "Results Ingested!", description: "Case results have been updated." });
      fetchCases();
    } catch (err) {
      toast({ title: "API Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeCase, toast, fetchCases]);

  const { getRootProps: getResultsRootProps, getInputProps: getResultsInputProps, isDragActive: isResultsDragActive } = useDropzone({ onDrop: onDropResults, accept: { 'text/csv': ['.csv'] } });

  const handleCreateCase = async () => {
    if (!activeProject) return;
    const caseName = prompt("Enter new case name:", `Case ${cases.length + 1}`);
    if (!caseName) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(ENGINE_NAME, {
        body: { action: 'create_case', payload: { project_id: activeProject.id, case_name: caseName, overrides: {} } }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: "Case Created!" });
      fetchCases();
    } catch (err) {
      toast({ title: "Error creating case", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  
  const handleScoreHistory = async () => {
    if (!activeCase) return;
    const sampleHistory = "date,oil_rate\n2025-01-01,980\n2025-02-01,950\n2025-03-01,920";
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(ENGINE_NAME, {
        body: { action: 'score_history_match', payload: { case_id: activeCase.id, history_csv: sampleHistory } }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast({ title: "History Match Scored!" });
      fetchCases();
    } catch (err) {
      toast({ title: "Error scoring history", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet><title>Reservoir Simulation Connector - Petrolord</title></Helmet>
      <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard/reservoir"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
            <div className="flex items-center space-x-3"><div className="bg-gradient-to-r from-green-500 to-emerald-500 p-2 rounded-lg"><Layers className="w-6 h-6" /></div><div><h1 className="text-2xl font-bold">Reservoir Simulation Connector</h1><p className="text-emerald-300">{reservoir.id ? `For Reservoir: ${reservoir.name || reservoir.id}` : "No reservoir selected"}</p></div></div>
          </div>
        </motion.div>

        {!reservoir.id && isReady && (
          <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-200 p-4 rounded-lg mb-6 flex items-center justify-center gap-4">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-lg font-semibold">Please select a reservoir from the main dashboard to begin.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <CollapsibleSection title="1. Projects" icon={<UploadCloud />} defaultOpen>
              <div {...getBundleRootProps()} className={`p-6 border-2 border-dashed rounded-lg cursor-pointer text-center ${isBundleDragActive ? 'border-emerald-400 bg-emerald-900/50' : 'border-gray-600'} ${!reservoir.id ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input {...getBundleInputProps()} disabled={!reservoir.id} />
                <UploadCloud className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <p>Drag & drop a ZIP file here to create a new project</p>
              </div>
              {loading && <div className="text-center p-4"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}
              <div className="mt-4 space-y-2">
                {projects.map(p => (
                  <div key={p.id} onClick={() => setActiveProject(p)} className={`p-3 rounded-lg cursor-pointer ${activeProject?.id === p.id ? 'bg-emerald-800/50 ring-2 ring-emerald-500' : 'bg-gray-800 hover:bg-gray-700'}`}>
                    <p className="font-semibold">{p.project_name}</p>
                    <p className="text-xs text-gray-400">Created: {new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
              {activeProject && (<div className="mt-4 space-y-2"><h4 className="font-semibold">Discovered Variables:</h4><div className="flex flex-wrap gap-2">{activeProject.base_deck_info?.variables.map(v => <span key={v} className="bg-gray-700 px-2 py-1 rounded text-sm font-mono">{v}</span>)}</div><h4 className="font-semibold mt-2">File Tree:</h4><ul className="text-sm font-mono text-gray-300 list-disc list-inside">{activeProject.base_deck_info?.file_tree.map(f => <li key={f}>{f}</li>)}</ul></div>)}
            </CollapsibleSection>

            <CollapsibleSection title="2. Build & Manage Cases" icon={<Settings />} defaultOpen>
              <Button onClick={handleCreateCase} disabled={!activeProject || loading}>Create New Case</Button>
              <Table className="mt-4"><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {cases.map(c => (<TableRow key={c.id} onClick={() => setActiveCase(c)} className={`cursor-pointer ${activeCase?.id === c.id ? 'bg-slate-700' : ''}`}><TableCell>{c.case_name}</TableCell><TableCell>{c.status}</TableCell><TableCell className="space-x-2"><Button size="sm" variant="outline" onClick={(e) => {e.stopPropagation(); toast({title: "Feature coming soon!"})}}><Edit className="w-4 h-4"/></Button></TableCell></TableRow>))}
                </TableBody>
              </Table>
            </CollapsibleSection>
          </div>

          <div className="space-y-4">
            <CollapsibleSection title="3. Results & Analysis" icon={<BarChart2 />} defaultOpen>
              <div {...getResultsRootProps()} className={`p-6 border-2 border-dashed rounded-lg cursor-pointer text-center ${isResultsDragActive ? 'border-emerald-400 bg-emerald-900/50' : 'border-gray-600'} ${!activeCase ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input {...getResultsInputProps()} disabled={!activeCase} />
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <p>Drag & drop results CSV here for the selected case</p>
              </div>
              {activeCase?.results && (
                  <div className="mt-4">
                      <h4 className="font-bold text-lg mb-2 text-emerald-300">Results for Case {activeCase.case_name}</h4>
                      <div className="w-full h-[300px] flex items-center justify-center text-slate-500 bg-slate-800 rounded">
                          Chart removed
                      </div>
                  </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="4. History Matching" icon={<History />} defaultOpen>
              <Button onClick={handleScoreHistory} disabled={!activeCase?.results || loading}>Score Against History</Button>
              {activeCase?.history_match_score && (<div className="mt-4 p-3 bg-gray-800 rounded-md"><h4 className="font-semibold text-emerald-300 mb-2">History Match Score for {activeCase.case_name}</h4><div className="grid grid-cols-3 gap-2 text-center"><div><p className="text-sm text-gray-400">RMSE</p><p className="font-mono text-lg">{activeCase.history_match_score.rmse.toFixed(2)}</p></div><div><p className="text-sm text-gray-400">MAPE</p><p className="font-mono text-lg">{activeCase.history_match_score.mape.toFixed(2)}%</p></div><div><p className="text-sm text-gray-400">N</p><p className="font-mono text-lg">{activeCase.history_match_score.n}</p></div></div></div>)}
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </>
  );
};

export default ReservoirSimulationConnector;
