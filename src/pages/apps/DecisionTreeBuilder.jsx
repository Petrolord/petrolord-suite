import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  ArrowLeft, GitMerge, Save, FolderOpen, Trash2, Download, FilePlus2,
} from 'lucide-react';
import { rollback } from '@/lib/decisionTree';
import { TEMPLATES } from '@/components/decisiontree/templates';
import TreeNodeEditor from '@/components/decisiontree/TreeNodeEditor';
import TreeDiagram from '@/components/decisiontree/TreeDiagram';
import DecisionTreeHelpGuide from '@/components/decisiontree/DecisionTreeHelpGuide';

// Decision Tree Builder (D3, docs/scope/Economics-ROADMAP.md): multi-stage
// EMV decision trees on the canonical src/lib/decisionTree.js engine. The
// VOI Analyzer's single-stage analysis is available here as the
// "Value of information" template, built Bayes-consistently from signal
// reliabilities. Terminal payoffs can link an EPE Monte Carlo run so tree
// EMVs sit on full-fiscal probabilistic valuations.

const TABLE = 'saved_decision_tree_projects';

const fmtMM = (v) => (Number.isFinite(v) ? `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} $MM` : 'N/A');

const KpiCard = ({ title, value, accent }) => (
  <div className="bg-white/5 p-4 rounded-lg">
    <p className="text-xs text-slate-300 uppercase tracking-wide">{title}</p>
    <p className={`text-xl font-bold mt-1 ${accent || 'text-white'}`}>{value}</p>
  </div>
);

const DecisionTreeBuilder = () => {
  const { toast } = useToast();
  const [tree, setTree] = useState(() => TEMPLATES.drillFarmOut.build());
  const [projectName, setProjectName] = useState('Untitled decision');
  const [projects, setProjects] = useState([]);
  const [showProjects, setShowProjects] = useState(false);
  const [mcRuns, setMcRuns] = useState(null); // null = not fetched yet
  const [mcPicker, setMcPicker] = useState(null); // callback awaiting a pick
  const importRef = useRef(null);

  const analysis = useMemo(() => {
    try {
      return { annotated: rollback(tree), error: null };
    } catch (err) {
      return { annotated: null, error: err.message };
    }
  }, [tree]);

  const refreshProjects = async () => {
    const { data, error } = await supabase.from(TABLE)
      .select('id, project_name, updated_at')
      .order('updated_at', { ascending: false });
    if (!error) setProjects(data || []);
  };

  useEffect(() => { refreshProjects(); }, []);

  const saveProject = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from(TABLE).insert([{
      user_id: userData?.user?.id,
      project_name: projectName || 'Untitled decision',
      inputs_data: { tree },
    }]);
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: error.message });
    } else {
      toast({ title: 'Saved', description: `"${projectName}" saved.` });
      refreshProjects();
    }
  };

  const loadProject = async (id) => {
    const { data, error } = await supabase.from(TABLE)
      .select('project_name, inputs_data').eq('id', id).maybeSingle();
    if (error || !data?.inputs_data?.tree) {
      toast({ variant: 'destructive', title: 'Load failed', description: error?.message || 'Project has no tree.' });
      return;
    }
    setTree(data.inputs_data.tree);
    setProjectName(data.project_name);
    setShowProjects(false);
    toast({ title: 'Loaded', description: `"${data.project_name}" loaded.` });
  };

  const deleteProject = async (id) => {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (!error) refreshProjects();
  };

  const openMcPicker = async (applyPayoff) => {
    if (mcRuns === null) {
      const { data } = await supabase.from('epe_mc_runs')
        .select('id, created_at, results, epe_run_configs(config_name)')
        .order('created_at', { ascending: false })
        .limit(25);
      setMcRuns(data || []);
    }
    setMcPicker(() => applyPayoff);
  };

  const pickMcRun = (run) => {
    const npv = run?.results?.npv;
    if (!npv) return;
    // EPE NPVs are USD; tree payoffs are $MM.
    mcPicker({
      mean: npv.mean / 1e6,
      p90: npv.p90 / 1e6,
      p50: npv.p50 / 1e6,
      p10: npv.p10 / 1e6,
      ref: run.id,
      label: run.epe_run_configs?.config_name || 'EPE MC run',
    });
    setMcPicker(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ projectName, tree }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projectName || 'decision-tree').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.tree?.type) throw new Error('File has no tree');
        setTree(parsed.tree);
        if (parsed.projectName) setProjectName(parsed.projectName);
        toast({ title: 'Imported', description: 'Tree loaded from file.' });
      } catch (err) {
        toast({ variant: 'destructive', title: 'Import failed', description: err.message });
      }
    };
    reader.readAsText(file);
  };

  const root = analysis.annotated;
  const bestBranch = root?.type === 'decision' ? root.branches[root.bestBranchIndex] : null;

  return (
    <>
      <Helmet>
        <title>Decision Tree Builder - Petrolord Suite</title>
        <meta name="description" content="Multi-stage decision trees with EMV rollback for petroleum investment decisions." />
      </Helmet>
      <div className="p-4 md:p-6 min-h-screen bg-slate-950 text-white">
        {/* Header */}
        <div className="mb-4 border-b border-slate-800 pb-4">
          <Link to="/dashboard/economics">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-sky-500 to-indigo-500 p-2 rounded-xl shadow-lg">
                <GitMerge className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Decision Tree Builder</h1>
                <p className="text-slate-400 text-xs">Multi-stage EMV decision analysis. Values in $MM.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DecisionTreeHelpGuide />
              <select
                onChange={(e) => { if (TEMPLATES[e.target.value]) { setTree(TEMPLATES[e.target.value].build()); } e.target.value = ''; }}
                defaultValue=""
                className="px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-sm"
              >
                <option value="" disabled>New from template...</option>
                {Object.entries(TEMPLATES).map(([key, t]) => <option key={key} value={key}>{t.name}</option>)}
              </select>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="px-2 py-1.5 rounded bg-slate-800 border border-slate-600 text-sm w-48"
                placeholder="Project name"
              />
              <Button size="sm" onClick={saveProject} className="bg-lime-600 hover:bg-lime-500 text-white"><Save className="w-4 h-4 mr-1" /> Save</Button>
              <Button size="sm" variant="outline" onClick={() => setShowProjects((s) => !s)} className="border-slate-600 text-slate-200"><FolderOpen className="w-4 h-4 mr-1" /> Open</Button>
              <Button size="sm" variant="outline" onClick={exportJson} className="border-slate-600 text-slate-200"><Download className="w-4 h-4 mr-1" /> JSON</Button>
              <Button size="sm" variant="outline" onClick={() => importRef.current?.click()} className="border-slate-600 text-slate-200"><FilePlus2 className="w-4 h-4 mr-1" /> Import</Button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
            </div>
          </div>
        </div>

        {/* Saved projects */}
        {showProjects && (
          <div className="mb-4 bg-white/5 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">Saved decisions</h3>
            {projects.length === 0 && <p className="text-xs text-slate-400">No saved decisions yet.</p>}
            {projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1 border-b border-white/5 text-sm">
                <button type="button" className="text-sky-300 hover:text-sky-200" onClick={() => loadProject(p.id)}>{p.project_name}</button>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {new Date(p.updated_at).toLocaleString()}
                  <button type="button" onClick={() => deleteProject(p.id)} className="hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <KpiCard title="Optimal EMV" value={root ? fmtMM(root.emv) : 'N/A'} accent="text-lime-300" />
          <KpiCard title="Recommended first move" value={bestBranch ? bestBranch.label : root ? (root.type === 'chance' ? 'Chance root' : 'Single outcome') : 'N/A'} accent="text-sky-300" />
          <KpiCard
            title="Next best alternative"
            value={root?.type === 'decision' && root.branches.length > 1
              ? fmtMM(Math.max(...root.branches.filter((_, i) => i !== root.bestBranchIndex).map((b) => b.branchValue)))
              : 'N/A'}
          />
          <KpiCard
            title="Decision advantage"
            value={root?.type === 'decision' && root.branches.length > 1
              ? fmtMM(root.emv - Math.max(...root.branches.filter((_, i) => i !== root.bestBranchIndex).map((b) => b.branchValue)))
              : 'N/A'}
          />
        </div>

        {analysis.error && (
          <div className="mb-4 bg-red-900/30 border border-red-500/40 rounded-lg p-3 text-sm text-red-200">
            {analysis.error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Editor */}
          <div className="bg-white/5 rounded-lg p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold mb-2">Tree structure</h3>
            <p className="text-xs text-slate-400 mb-3">
              Decisions pick their best branch; chance branches need probabilities that sum to 1. Branch costs are cash out when that branch is taken. Outcome payoffs are $MM, typed directly or linked to a saved EPE Monte Carlo run (the tree then uses its mean NPV, the EMV basis).
            </p>
            <TreeNodeEditor node={tree} onChange={setTree} onLinkMcRun={openMcPicker} />
          </div>

          {/* Diagram */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Rolled-back tree</h3>
            {root
              ? <TreeDiagram annotated={root} />
              : <div className="bg-white/5 rounded-lg p-6 text-sm text-slate-400">Fix the highlighted input error to see the tree.</div>}
          </div>
        </div>

        {/* MC run picker */}
        {mcPicker && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setMcPicker(null)}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-lg max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold mb-3">Link an EPE Monte Carlo run</h3>
              {(mcRuns || []).length === 0 && (
                <p className="text-xs text-slate-400">No saved Monte Carlo runs. Run one from an EPE result's Risk tab first.</p>
              )}
              {(mcRuns || []).map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => pickMcRun(run)}
                  className="w-full text-left py-2 px-3 rounded hover:bg-slate-800 border-b border-white/5"
                >
                  <span className="text-sm text-sky-300">{run.epe_run_configs?.config_name || 'EPE run'}</span>
                  <span className="block text-xs text-slate-400">
                    NPV mean {(run.results?.npv?.mean / 1e6).toFixed(1)} $MM, P90 {(run.results?.npv?.p90 / 1e6).toFixed(1)} / P10 {(run.results?.npv?.p10 / 1e6).toFixed(1)} · {new Date(run.created_at).toLocaleString()}
                  </span>
                </button>
              ))}
              <div className="mt-3 text-right">
                <Button size="sm" variant="outline" className="border-slate-600 text-slate-200" onClick={() => setMcPicker(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default DecisionTreeBuilder;
