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
import { REPORT_TEMPLATES, selectedSectionsFor } from '@/data/reportAutopilotTemplates';
import { buildDocxBlob, docxFileName } from '@/utils/reportAutopilotDocx';
import { saveAs } from 'file-saver';

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

/**
 * Generation is unavailable (E4, kept through the 2026-08-29 rebuild).
 *
 * The rebuild moved generation onto a Supabase edge function, so the dead
 * Heroku host is gone. This panel stays for the case that remains: the
 * function is reachable but not configured, or the model call fails. The
 * point of it is unchanged. A user cannot fix either, and should not be left
 * guessing whether their inputs caused it.
 */
export function ServiceUnavailablePanel({ detail }) {
  return (
    <div className="max-w-2xl mx-auto mt-10 rounded-lg border border-amber-800/60 bg-amber-950/30 p-6">
      <h2 className="text-lg font-semibold text-amber-200">Report generation is unavailable</h2>
      <p className="mt-3 text-sm text-amber-100/80">
        The report writer is not responding. Nothing you entered caused this, and there is
        no setting that will work around it.
      </p>
      <p className="mt-3 text-sm text-amber-100/80">
        Everything else in the app still works: you can build up a report brief and save it as a
        project, and it will be there when generation is restored. Exporting a document is not
        possible in the meantime.
      </p>
      {detail && (
        <details className="mt-4">
          <summary className="text-xs text-amber-200/70 cursor-pointer">Technical detail</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[11px] text-amber-100/60">{String(detail)}</pre>
        </details>
      )}
    </div>
  );
}

/**
 * True when the failure is the writer being unreachable or unconfigured,
 * rather than something the user can act on.
 *
 * The distinction matters because the two need opposite responses: an outage
 * gets an explanation and a disabled button, a bad brief gets a toast telling
 * the user what to change.
 */
export const isServiceUnavailable = (err) => {
  const msg = String(err || '');
  return /HTTP (404|502|503|504)/.test(msg)
    || /Non-JSON response/.test(msg)
    || /Failed to fetch/i.test(msg)
    || /NetworkError/i.test(msg)
    || /fetch is not defined/i.test(msg)
    // Supabase reports any non-2xx from a function with this phrasing, and
    // the function's own not-configured and upstream-failure messages.
    || /non-2xx status/i.test(msg)
    || /not configured/i.test(msg)
    || /LLM request failed/i.test(msg)
    || /could not be reached/i.test(msg);
};

/** True when the user can fix it by changing the brief. */
export const isUserFixable = (err) => /Select at least one section/i.test(String(err || ''));

class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err, info){ console.error("TRP ErrorBoundary", err, info); }
  render(){ return this.state.err ? <div className="p-4"><ErrorPanel err={this.state.err}/></div> : this.props.children; }
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
    attachments: [],
    selected_sections: [],
    detail_level: 'standard',
    max_pages: 8,
    gpt4_sections: [],
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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

  // Templates are static configuration and live in the client now, so the
  // app opens with no network call at all: the brief is fillable and a
  // project is saveable even if the report writer is down.
  useEffect(() => {
    mounted.current = true;
    setTemplates(REPORT_TEMPLATES);
    setLoading(false);
    return () => { mounted.current = false; };
  }, []);

  const handleGenerate = async (inputs) => {
    setFormState(inputs);
    setError('');
    setLoading(true);
    setReportData(null);
    toast({ title: 'Writing the report', description: 'Each section is drafted from the brief you gave.' });

    try {
      const chosen = selectedSectionsFor(inputs.report_type_id, inputs.selected_sections);
      if (chosen.length === 0) throw new Error('Select at least one section to write.');
      const typeName = REPORT_TEMPLATES.types.find((t) => t.id === inputs.report_type_id)?.name;

      const { data, error: fnError } = await supabase.functions.invoke('report-autopilot', {
        body: {
          sections: chosen.map((s2) => ({ id: s2.id, name: s2.name, brief: s2.brief })),
          input: { ...inputs, report_type_name: typeName },
        },
      });
      if (fnError) throw new Error(fnError.message || 'The report writer could not be reached.');
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.sections) || data.sections.length === 0) {
        throw new Error('The report writer returned nothing.');
      }

      setReportData(data);
      toast({ title: 'Draft ready', description: `${data.sections.length} sections written. Review before sending it anywhere.` });
    } catch (e) {
      console.error(e);
      const message = String(e.message || e);
      if (isUserFixable(message)) {
        // Something the user can change; a toast, not an outage banner.
        toast({ variant: 'destructive', title: 'Check the brief', description: message });
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // The document is assembled here from the sections on screen, so what is
  // exported is exactly what was reviewed. The old export asked a service for
  // a download link into itself; the service is gone and the link with it.
  const handleExport = async () => {
    if (!reportData?.sections?.length) {
      toast({ variant: 'destructive', title: 'Nothing to export', description: 'Write the report first.' });
      return;
    }
    setExporting(true);
    try {
      const title = formState.project_name || 'Technical Report';
      const blob = await buildDocxBlob({
        title,
        meta: [
          formState.field_name && `Field: ${formState.field_name}`,
          formState.well_name && `Well: ${formState.well_name}`,
          (formState.date_start || formState.date_end) && `Period: ${formState.date_start || '?'} to ${formState.date_end || '?'}`,
          formState.author && `Prepared by: ${formState.author}`,
        ],
        sections: reportData.sections,
        footNote: `Drafted with Petrolord Technical Report Autopilot on ${new Date().toLocaleDateString()}. This is a draft: every figure and statement should be checked against source data before the document is issued.`,
      });
      saveAs(blob, docxFileName(title));
      toast({ title: 'Document saved', description: 'Review it before issuing.' });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Export failed', description: err.message });
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
  // A service outage is not a crash. The brief is still editable and
  // saveable; only generation and export are gone.
  const serviceDown = isServiceUnavailable(error);
  if (error && !serviceDown) {
    return <div className="p-4 bg-gradient-to-b from-slate-900 to-gray-900"><ErrorPanel err={error}/></div>;
  }

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
              loading={loading || serviceDown}
              templates={templates}
              formState={formState}
              setFormState={setFormState}
            />
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            <AnimatePresence>
              {!reportData && !loading && serviceDown && (
                <ServiceUnavailablePanel detail={error} />
              )}
              {!reportData && !loading && !serviceDown && (
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