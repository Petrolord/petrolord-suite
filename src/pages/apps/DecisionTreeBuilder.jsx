import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  GitMerge, Save, FolderOpen, Trash2, Download, FilePlus2,
} from 'lucide-react';
import { rollback } from '@/lib/decisionTree';
import { TEMPLATES } from '@/components/decisiontree/templates';
import TreeNodeEditor from '@/components/decisiontree/TreeNodeEditor';
import TreeDiagram from '@/components/decisiontree/TreeDiagram';
import DecisionTreeHelpGuide from '@/components/decisiontree/DecisionTreeHelpGuide';
import { firstMoveLabel, isIndifferentFirstMove } from '@/components/decisiontree/firstMoveLabel';
import { FullPrecisionProvider, FullPrecisionToggle, useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull, MONEY_MM_DECIMALS } from '@/lib/fullPrecision';
import { ThemedApp } from '@/design/ThemeProvider';
import { AppHeader } from '@/components/ui/app-shell';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

// Decision Tree Builder (D3, docs/scope/Economics-ROADMAP.md): multi-stage
// EMV decision trees on the canonical src/lib/decisionTree.js engine. The
// VOI Analyzer's single-stage analysis is available here as the
// "Value of information" template, built Bayes-consistently from signal
// reliabilities. Terminal payoffs can link an EPE Monte Carlo run so tree
// EMVs sit on full-fiscal probabilistic valuations.

const TABLE = 'saved_decision_tree_projects';

const fmtMM = (v) => (Number.isFinite(v) ? `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} $MM` : 'N/A');
// W3 (D3): with Full precision on, the KPI cards print $MM at 4 decimals with
// no digit grouping; off, fmtMM as before.
const fmtMMFull = (v) => (Number.isFinite(v) ? `${formatFull(v, MONEY_MM_DECIMALS)} $MM` : 'N/A');

const KpiCard = ({ title, value, words = false }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-pl-muted">{title}</p>
    <p className={`mt-1 text-xl font-semibold text-pl-text ${words ? '' : 'font-pl-mono tabular-nums'}`}>{value}</p>
  </div>
);

const DecisionTreeBuilderInner = () => {
  const { toast } = useToast();
  const { full } = useFullPrecision();
  const money = full ? fmtMMFull : fmtMM;
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

  return (
    <>
      <Helmet>
        <title>Decision Tree Builder - Petrolord Suite</title>
        <meta name="description" content="Multi-stage decision trees with EMV rollback for petroleum investment decisions." />
      </Helmet>
      <AppHeader
        title="Decision Tree Builder"
        eyebrow="Economics"
        subtitle="Multi-stage EMV decision analysis. Values in $MM."
        icon={GitMerge}
        backTo="/dashboard/economics"
        backLabel="Back"
        actions={(
          <>
            <FullPrecisionToggle app="decision-tree-builder" />
            <DecisionTreeHelpGuide />
          </>
        )}
      />
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 text-pl-text sm:px-6">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-pl-border pb-4">
          <NativeSelect
            onChange={(e) => { if (TEMPLATES[e.target.value]) { setTree(TEMPLATES[e.target.value].build()); } e.target.value = ''; }}
            defaultValue=""
            aria-label="New from template"
            className="h-9 w-full sm:w-56"
          >
            <option value="" disabled>New from template...</option>
            {Object.entries(TEMPLATES).map(([key, t]) => <option key={key} value={key}>{t.name}</option>)}
          </NativeSelect>
          <Input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="h-9 w-full sm:w-48"
            placeholder="Project name"
            aria-label="Project name"
          />
          <Button size="sm" onClick={saveProject}><Save className="w-4 h-4 mr-1" /> Save</Button>
          <Button size="sm" variant="outline" onClick={() => setShowProjects((s) => !s)}><FolderOpen className="w-4 h-4 mr-1" /> Open</Button>
          <Button size="sm" variant="outline" onClick={exportJson}><Download className="w-4 h-4 mr-1" /> JSON</Button>
          <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}><FilePlus2 className="w-4 h-4 mr-1" /> Import</Button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>

        {/* Saved projects */}
        {showProjects && (
          <div className="mb-4 rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm">
            <h3 className="mb-2 text-sm font-semibold text-pl-text">Saved decisions</h3>
            {projects.length === 0 && <p className="text-xs text-pl-muted">No saved decisions yet.</p>}
            {projects.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-pl-border py-1 text-sm">
                <button type="button" className="text-pl-primary-text hover:text-pl-primary-text-hover hover:underline" onClick={() => loadProject(p.id)}>{p.project_name}</button>
                <div className="flex items-center gap-3 text-xs text-pl-muted">
                  {new Date(p.updated_at).toLocaleString()}
                  <button type="button" onClick={() => deleteProject(p.id)} aria-label="Delete saved decision" title="Delete" className="hover:text-pl-danger-text"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <KpiCard title="Optimal EMV" value={root ? money(root.emv) : 'N/A'} />
          <KpiCard title="Recommended first move" value={firstMoveLabel(root)} words />
          <KpiCard
            title="Next best alternative"
            value={root?.type === 'decision' && root.branches.length > 1
              ? money(Math.max(...root.branches.filter((_, i) => i !== root.bestBranchIndex).map((b) => b.branchValue)))
              : 'N/A'}
          />
          {/* EC4-1: at a tie the advantage is 0.00, which reads as a real
              lead of nothing. Say what it is instead. */}
          <KpiCard
            title="Decision advantage"
            value={isIndifferentFirstMove(root)
              ? 'Indifferent'
              : (root?.type === 'decision' && root.branches.length > 1
                ? money(root.emv - Math.max(...root.branches.filter((_, i) => i !== root.bestBranchIndex).map((b) => b.branchValue)))
                : 'N/A')}
          />
        </div>

        {analysis.error && (
          <div role="alert" className="mb-4 rounded-lg border border-pl-danger/40 bg-pl-danger-bg p-3 text-sm text-pl-danger-text">
            {analysis.error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Editor */}
          <div className="overflow-x-auto rounded-lg border border-pl-border bg-pl-surface p-4 shadow-pl-sm">
            <h3 className="mb-2 text-sm font-semibold text-pl-text">Tree structure</h3>
            <p className="text-xs text-pl-muted mb-3">
              Decisions pick their best branch; chance branches need probabilities that sum to 1. Branch costs are cash out when that branch is taken. Outcome payoffs are $MM, typed directly or linked to a saved EPE Monte Carlo run (the tree then uses its mean NPV, the EMV basis).
            </p>
            <TreeNodeEditor node={tree} onChange={setTree} onLinkMcRun={openMcPicker} />
          </div>

          {/* Diagram */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-pl-text">Rolled-back tree</h3>
            {root
              ? <TreeDiagram annotated={root} />
              : <div className="rounded-lg border border-pl-border bg-pl-surface p-6 text-sm text-pl-muted">Fix the highlighted input error to see the tree.</div>}
          </div>
        </div>

        {/* MC run picker */}
        {mcPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMcPicker(null)}>
            <div role="dialog" aria-modal="true" aria-label="Link an EPE Monte Carlo run" className="w-full max-w-lg max-h-[70vh] overflow-y-auto rounded-xl border border-pl-border bg-pl-raised p-5 text-pl-text shadow-pl-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-3 text-sm font-semibold">Link an EPE Monte Carlo run</h3>
              {(mcRuns || []).length === 0 && (
                <p className="text-xs text-pl-muted">No saved Monte Carlo runs. Run one from an EPE result's Risk tab first.</p>
              )}
              {(mcRuns || []).map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => pickMcRun(run)}
                  className="w-full text-left py-2 px-3 rounded hover:bg-pl-sunken border-b border-pl-border"
                >
                  <span className="text-sm text-pl-primary-text">{run.epe_run_configs?.config_name || 'EPE run'}</span>
                  <span className="block text-xs text-pl-muted">
                    NPV mean {(run.results?.npv?.mean / 1e6).toFixed(1)} $MM, P90 {(run.results?.npv?.p90 / 1e6).toFixed(1)} / P10 {(run.results?.npv?.p10 / 1e6).toFixed(1)} · {new Date(run.created_at).toLocaleString()}
                  </span>
                </button>
              ))}
              <div className="mt-3 text-right">
                <Button size="sm" variant="outline" onClick={() => setMcPicker(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const DecisionTreeBuilder = () => (
  <ThemedApp className="min-h-screen" data-testid="dtb-theme-scope">
    <FullPrecisionProvider>
      <DecisionTreeBuilderInner />
    </FullPrecisionProvider>
  </ThemedApp>
);

export default DecisionTreeBuilder;
