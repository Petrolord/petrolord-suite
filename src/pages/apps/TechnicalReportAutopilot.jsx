import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import InputPanel from '@/components/reportautopilot/InputPanel';
import PreviewPanel from '@/components/reportautopilot/PreviewPanel';
import EmptyState from '@/components/reportautopilot/EmptyState';
import { Bot, Loader2, ArrowLeft, Save } from 'lucide-react';

window.addEventListener("error", e => console.error("GlobalError:", e.error || e.message));
window.addEventListener("unhandledrejection", e => {
  console.error("UnhandledRejection:", e.reason);
});

function ErrorPanel({err}) {
  return (
    <div style={{padding:"16px",background:"#2b1d1d",border:"1px solid #a33",color:"#f3caca",borderRadius:"8px"}}>
      <b>Technical Report Autopilot crashed</b>
      <div style={{marginTop:"8px",whiteSpace:"pre-wrap"}}>{String(err)}</div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err, info){ console.error("TRP ErrorBoundary", err, info); }
  render(){ return this.state.err ? <div className="p-4"><ErrorPanel err={this.state.err}/></div> : this.props.children; }
}

const API_BASE = "https://petrolord-pvt-backend-2025-58b5441b2268.herokuapp.com";

async function apiGetJSON(path){
  const r = await fetch(API_BASE+path, {credentials:"omit"});
  const txt = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} on ${path}\n` + txt.slice(0,400));
  }
  try { return JSON.parse(txt); }
  catch { throw new Error(`Non-JSON response on ${path}\n` + txt.slice(0,400)); }
}

function TechnicalReportAutopilotPageInner() {
  const [formState, setFormState] = useState({
    report_type_id: '',
    project_name: 'Alpha Prospect',
    field_name: 'West Delta',
    well_name: 'A-21',
    author: 'Operations Team',
    date_start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    date_end: new Date().toISOString().split('T')[0],
    objectives: 'Evaluate the drilling performance of well A-21 and identify key areas for optimization in future wells.',
    kpis: [{ key: 'Average ROP', value: '150 ft/hr' }, { key: 'NPT', value: '5%' }],
    notes: 'Focus on the 8.5" section, compare bit performance against offset data.',
    file_ids: [],
    selected_sections: [],
    detail_level: 'standard',
    max_pages: 8,
    gpt4_sections: [],
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [downloadLink, setDownloadLink] = useState(null);
  const [templates, setTemplates] = useState({ types: [], sections: {} });
  const [error, setError] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projectId, setProjectId] = useState(null);
  const mounted = React.useRef(true);

  useEffect(() => {
    if (location.state?.loadedProject) {
      const { project_name, inputs_data, results_data, id } = location.state.loadedProject;
      setFormState({ ...inputs_data, project_name });
      if (results_data) {
        setReportData(results_data);
      }
      setProjectId(id);
      toast({ title: "Project Loaded", description: `Successfully loaded "${project_name}".` });
    }
  }, [location.state, toast]);

  useEffect(()=>{ 
    mounted.current=true; 
    (async ()=>{
      try{
        const data = await apiGetJSON("/trp/templates");
        if (!data || !Array.isArray(data.types) || typeof data.sections !== "object"){
          throw new Error("Templates payload shape invalid");
        }
        if (mounted.current){ setTemplates(data); setLoading(false); }
      } catch(e){
        console.error(e);
        if (mounted.current){ setError(String(e)); setLoading(false); }
      }
    })();
    return ()=>{ mounted.current=false; };
  },[]);

  const handleGenerate = async (inputs) => {
    setFormState(inputs);
    setError("");
    setLoading(true);
    setReportData(null);
    setDownloadLink(null);
    toast({ title: 'Generating Report...', description: 'The AI is drafting your document. Please wait.' });

    try {
        const response = await fetch(`${API_BASE}/trp/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputs)
        });
        const t = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status} on /trp/generate\n`+t.slice(0,400));
        
        const json = JSON.parse(t);
        setReportData(json);
        toast({ title: 'Report Generated!', description: 'Your report draft is ready for review.' });
    } catch(e) {
        console.error(e);
        setError(String(e));
    } finally {
        setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!reportData?.report_id) {
      toast({ variant: 'destructive', title: 'Error', description: 'No report ID found. Please generate a report first.' });
      return;
    }
    setExporting(true);
    setDownloadLink(null);
    toast({ title: 'Exporting Report...', description: 'Preparing DOCX file for download.' });
    
    try {
        const response = await fetch(`${API_BASE}/trp/export-docx?report_id=${reportData.report_id}&title=${encodeURIComponent(formState.project_name || 'report')}`);
        if (!response.ok) {
            throw new Error('Export failed');
        }
        const result = await response.json();
        setDownloadLink(`${API_BASE}${result.download_path}`);
        toast({ title: 'Export Ready!', description: 'Your DOCX file is ready for download.' });

    } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Error exporting report',
          description: err.message,
        });
    } finally {
        setExporting(false);
    }
  };

  const handleSaveProject = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not logged in', description: 'You must be logged in to save a project.' });
      return;
    }
    let currentProjectName = formState.project_name;
    if (!currentProjectName) {
      currentProjectName = window.prompt("Please enter a name for this project:");
      if (!currentProjectName) {
        toast({ variant: 'destructive', title: 'Save Canceled', description: 'Project name is required to save.' });
        return;
      }
      setFormState(prev => ({ ...prev, project_name: currentProjectName }));
    }

    const projectData = {
      user_id: user.id,
      project_name: currentProjectName,
      inputs_data: formState,
      results_data: reportData,
    };

    let response;
    if (projectId) {
      response = await supabase.from('saved_report_autopilot_projects').update(projectData).eq('id', projectId).select();
    } else {
      response = await supabase.from('saved_report_autopilot_projects').insert(projectData).select();
    }

    const { data, error } = response;
    if (error) {
      toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
    } else {
      if (data && data.length > 0) {
        setProjectId(data[0].id);
      }
      toast({ title: 'Project Saved!', description: `"${currentProjectName}" has been saved successfully.` });
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-gradient-to-b from-slate-900 to-gray-900 text-white">
      <div className="text-center">
        <Loader2 className="animate-spin rounded-full h-16 w-16 text-lime-400 mx-auto" />
        <p className="text-white mt-4 text-lg">Loading Autopilot...</p>
      </div>
    </div>
  );
  if (error) return <div className="p-4 bg-gradient-to-b from-slate-900 to-gray-900"><ErrorPanel err={error}/></div>;

  return (
    <>
      <Helmet>
        <title>Technical Report Autopilot - Petrolord</title>
        <meta name="description" content="AI-powered generation of technical reports and documents for the energy sector." />
      </Helmet>
      <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 to-gray-900 text-white">
        <header className="flex items-center justify-between p-4 border-b border-white/10 bg-slate-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/automation')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h1 className="text-lg font-semibold text-white">Technical Report Autopilot</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveProject}>
              <Save className="w-4 h-4 mr-2" /> Save Project
            </Button>
          </div>
        </header>
        <div className="flex flex-grow overflow-hidden">
          <div className="w-full md:w-2/5 xl:w-1/3 p-4 bg-slate-900/50 backdrop-blur-lg border-r border-white/10 overflow-y-auto">
            <InputPanel 
              onGenerate={handleGenerate} 
              loading={loading}
              templates={templates}
              formState={formState}
              setFormState={setFormState}
            />
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            <AnimatePresence>
              {!reportData && !loading && (
                <EmptyState />
              )}
            </AnimatePresence>
            {loading && !reportData &&(
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="animate-spin rounded-full h-16 w-16 text-lime-400 mx-auto" />
                  <p className="text-white mt-4 text-lg">Generating Technical Report...</p>
                  <p className="text-lime-300">Please wait while our AI drafts your document.</p>
                </div>
              </div>
            )}
            {reportData && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="h-full"
              >
                <PreviewPanel 
                  reportData={reportData} 
                  onExport={handleExport}
                  exporting={exporting}
                  downloadLink={downloadLink}
                />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default function TechnicalReportAutopilotPage(){
  return <ErrorBoundary><TechnicalReportAutopilotPageInner/></ErrorBoundary>;
}