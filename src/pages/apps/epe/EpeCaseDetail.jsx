import React, { useState, useEffect, useCallback } from 'react';
import EpeDataUploader from '@/components/epe/EpeDataUploader';
import EpeDataFileCard from '@/components/epe/EpeDataFileCard';
    import { Helmet } from 'react-helmet';
    import { useParams, Link, useNavigate } from 'react-router-dom';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
    import { ArrowLeft, Upload, FileText, BarChart, Play, Plus, Loader2, Trash2, FileSpreadsheet, FileJson, Contrast as Compare, Users, Lock, Unlock, BadgeCheck, GitBranch } from 'lucide-react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';

    // PP0 state kind, same registration as EpeCaseList (idempotent)
    const EPE_CASE_KIND = 'epe-case';
    registerStateKind(EPE_CASE_KIND, { current: 1, label: 'economics case' });
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useDropzone } from 'react-dropzone';
    import Papa from 'papaparse';
    import {
      Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
    } from '@/components/ui/dialog';
    import { Label } from '@/components/ui/label';
    import { Input } from '@/components/ui/input';
    // Wave E (audit 4.13): the Forecast Scenario Hub handoff. compareCases is
    // the SAME shared util the Hub itself renders from (canonical DCA engine
    // under the hood), so an imported profile matches the Hub bbl for bbl.
    import { compareCases } from '@/utils/forecastScenarioCalculations';

    // Wave A (audit finding 1.1): the engine sums every file in a slot, so
    // multiple files are only correct when they are complementary.
    const MultiFileWarning = ({ count, scenarios = false }) => (
      <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-200 text-xs">
        <span className="font-bold shrink-0">!</span>
        <span>
          {count} files in this slot. The engine adds together the files a run actually uses. If one is a revision of another,
          delete the outdated file or the run will double-count.
          {scenarios ? ' Files tagged with different reserves scenarios do not sum; each run prices one scenario.' : ''}
        </span>
      </div>
    );

    // Wave F (3.6): reserves scenario chip for production file cards.
    const ScenarioChip = ({ label }) => (
      <span className="inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-900/50 text-cyan-300 border border-cyan-800">
        {label || 'Base'}
      </span>
    );

    const EpeCaseDetail = () => {
      const { caseId } = useParams();
      const navigate = useNavigate();
      const { toast } = useToast();
      const { user } = useAuth();
      const [caseDetails, setCaseDetails] = useState(null);
      const [productionVolumes, setProductionVolumes] = useState([]);
      const [capex, setCapex] = useState([]);
      const [opex, setOpex] = useState([]);
      const [runs, setRuns] = useState([]);
      const [runKpis, setRunKpis] = useState({}); // Wave D: run_id -> kpis for the history table
      const [loading, setLoading] = useState(true);
      const [processingFileId, setProcessingFileId] = useState(null);
      // Wave E: sharing + import state
      const [myOrgId, setMyOrgId] = useState(null);
      const [shareBusy, setShareBusy] = useState(false);
      const [fshOpen, setFshOpen] = useState(false);
      const [fshProjects, setFshProjects] = useState([]);
      const [fshProjectId, setFshProjectId] = useState('');
      const [fshCaseIdx, setFshCaseIdx] = useState('');
      const [fshStartYear, setFshStartYear] = useState(String(new Date().getFullYear()));
      const [fshReplace, setFshReplace] = useState(true);
      const [fshBusy, setFshBusy] = useState(false);

      const isOwner = !!caseDetails && !!user && caseDetails.user_id === user.id;

      // Wave E: the user's active organization (for the share toggle), same
      // resolution as TeamManagement.
      useEffect(() => {
        if (!user?.id) return;
        let alive = true;
        (async () => {
          const { data } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          if (alive) setMyOrgId(data?.organization_id ?? null);
        })();
        return () => { alive = false; };
      }, [user?.id]);

      const handleToggleShare = async () => {
        if (!isOwner) return;
        const sharing = !caseDetails.organization_id;
        if (sharing && !myOrgId) return;
        setShareBusy(true);
        const { error } = await writeStamped(EPE_CASE_KIND,
          { organization_id: sharing ? myOrgId : null },
          (row) => supabase.from('epe_cases').update(row).eq('id', caseId));
        if (error) {
          toast({ variant: 'destructive', title: sharing ? 'Share failed' : 'Unshare failed', description: error.message });
        } else {
          toast({
            title: sharing ? 'Case shared with your organization' : 'Case is private again',
            description: sharing ? 'Teammates can view this case, its data and results. Only you can edit or run.' : undefined,
          });
          fetchData();
        }
        setShareBusy(false);
      };

      const handleToggleLock = async (run) => {
        const { error } = await supabase
          .from('epe_runs')
          .update({ locked: !run.locked })
          .eq('id', run.id);
        if (error) {
          toast({ variant: 'destructive', title: 'Could not update lock', description: error.message });
        } else {
          toast({ title: run.locked ? 'Run unlocked' : 'Run locked', description: run.locked ? undefined : 'Locked runs cannot be deleted until unlocked.' });
          fetchData();
        }
      };

      const handleToggleApprove = async (run) => {
        const approving = !run.approved_at;
        const { error } = await supabase
          .from('epe_runs')
          .update(approving
            ? { approved_by: user.id, approved_at: new Date().toISOString() }
            : { approved_by: null, approved_at: null })
          .eq('id', run.id);
        if (error) {
          toast({ variant: 'destructive', title: 'Could not update approval', description: error.message });
        } else {
          toast({ title: approving ? 'Run approved' : 'Approval removed' });
          fetchData();
        }
      };

      const openFshDialog = async () => {
        setFshOpen(true);
        const { data, error } = await supabase
          .from('saved_scenario_hub_projects')
          .select('id, project_name, inputs_data, updated_at')
          .order('updated_at', { ascending: false });
        if (error) {
          toast({ variant: 'destructive', title: 'Could not list scenario sets', description: error.message });
          setFshProjects([]);
        } else {
          setFshProjects(data || []);
        }
        setFshProjectId('');
        setFshCaseIdx('');
      };

      const handleFshImport = async () => {
        const project = fshProjects.find((p) => p.id === fshProjectId);
        const scenarioCases = project?.inputs_data?.cases || [];
        const idx = parseInt(fshCaseIdx, 10);
        const scenario = Number.isFinite(idx) ? scenarioCases[idx] : null;
        const startYear = parseInt(fshStartYear, 10);
        if (!scenario || !Number.isFinite(startYear)) {
          toast({ variant: 'destructive', title: 'Pick a scenario and a start year' });
          return;
        }
        setFshBusy(true);
        try {
          // Same math as the Hub's own display and CSV export.
          const { summaries } = compareCases([scenario]);
          const s = summaries[0];
          if (!s || s.error) throw new Error(s?.error || 'The scenario could not be evaluated.');
          const rows = s.annual.map((bbl, i) => ({ year: startYear + i, oil_bbl: Math.round(bbl) }));
          if (rows.length === 0) throw new Error('The scenario produced no annual volumes.');

          const { data: newRow, error: insErr } = await supabase
            .from('epe_production_volumes')
            .insert({
              case_id: caseId,
              user_id: user.id,
              file_name: `FSH - ${scenario.name || 'scenario'}.generated`,
              data: rows,
            })
            .select('id')
            .single();
          if (insErr) throw new Error(insErr.message);

          let replaced = 0;
          // Wave F: the import lands untagged (Base scenario), so replacing
          // only supersedes other Base-scenario files; tagged scenario files
          // are untouched.
          const baseFiles = productionVolumes.filter((f) => (f.scenario_label ?? null) === null);
          if (fshReplace && baseFiles.length > 0) {
            const { error: delErr, count } = await supabase
              .from('epe_production_volumes')
              .delete({ count: 'exact' })
              .eq('case_id', caseId)
              .is('scenario_label', null)
              .neq('id', newRow.id);
            if (delErr) {
              toast({ variant: 'destructive', title: 'Could not remove the previous file(s)', description: `${delErr.message}. Delete them manually or the engine will sum both.` });
            } else {
              replaced = count || 0;
            }
          }

          const totalMMbbl = rows.reduce((t, r) => t + r.oil_bbl, 0) / 1e6;
          toast({
            title: 'Production profile imported',
            description: `${rows.length} years, ${totalMMbbl.toLocaleString('en-US', { maximumFractionDigits: 2 })} MMbbl from "${scenario.name}".`
              + (replaced > 0 ? ` Replaced ${replaced} previous file${replaced > 1 ? 's' : ''}.` : ''),
          });
          setFshOpen(false);
          fetchData();
        } catch (err) {
          toast({ variant: 'destructive', title: 'Import failed', description: err.message });
        } finally {
          setFshBusy(false);
        }
      };

      const fetchData = useCallback(async () => {
        if (!user || !caseId) return;
        setLoading(true);
        try {
          const [caseRes, prodRes, capexRes, opexRes, runsRes] = await Promise.all([
            supabase.from('epe_cases').select('*').eq('id', caseId).single(),
            supabase.from('epe_production_volumes').select('*').eq('case_id', caseId),
            supabase.from('epe_capex').select('*').eq('case_id', caseId),
            supabase.from('epe_opex').select('*').eq('case_id', caseId),
            supabase.from('epe_runs').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
          ]);

          if (caseRes.error) throw caseRes.error;
          setCaseDetails(openStateRow(EPE_CASE_KIND, caseRes.data));

          if (prodRes.error) throw prodRes.error;
          setProductionVolumes(prodRes.data);

          if (capexRes.error) throw capexRes.error;
          setCapex(capexRes.data);

          if (opexRes.error) throw opexRes.error;
          setOpex(opexRes.data);

          if (runsRes.error) throw runsRes.error;
          setRuns(runsRes.data);

          // Wave D (audit 4.4): the run list is a decision table, so pull each
          // run's headline KPIs in one batch query.
          const runIds = (runsRes.data || []).map((r) => r.id);
          if (runIds.length > 0) {
            const { data: kpiRows } = await supabase
              .from('epe_results')
              .select('run_id, kpis')
              .in('run_id', runIds);
            const kpiMap = {};
            (kpiRows || []).forEach((r) => { kpiMap[r.run_id] = r.kpis; });
            setRunKpis(kpiMap);
          } else {
            setRunKpis({});
          }

        } catch (error) {
          toast({ variant: 'destructive', title: 'Failed to fetch case details', description: error.message });
          navigate('/dashboard/apps/economics/epe/cases');
        } finally {
          setLoading(false);
        }
      }, [caseId, user, toast, navigate]);

      useEffect(() => {
        fetchData();
      }, [fetchData]);

      const handleProcessFile = async (file) => {
        setProcessingFileId(file.id);
        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('epe-uploads')
            .download(file.data.storagePath);
          
          if (downloadError) throw downloadError;

          const text = await fileData.text();
          const parsedData = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });

          // Here you would typically do more validation and processing
          // For now, we just update the record to show it's "processed"
          // by replacing the storage path with the actual data.
          const { error: updateError } = await supabase
            .from(`epe_${file.dataType || (file.file_name.toLowerCase().includes('prod') ? 'production_volumes' : file.file_name.toLowerCase().includes('capex') ? 'capex' : 'opex')}`)
            .update({ data: parsedData.data })
            .eq('id', file.id);

          if (updateError) throw updateError;

          toast({ title: 'Processing Complete', description: `${file.file_name} has been processed.` });
          fetchData(); // Refresh data
        } catch (error) {
          toast({ variant: 'destructive', title: 'Processing failed', description: error.message });
        } finally {
          setProcessingFileId(null);
        }
      };

      const handleDeleteRun = async (runId, runName) => {
        // Wave D: any run can be deleted; results row goes first so no orphan
        // is left if the second delete fails.
        if (!window.confirm(`Delete run "${runName}" and its results? This cannot be undone.`)) return;
        try {
          const { error: resErr } = await supabase.from('epe_results').delete().eq('run_id', runId);
          if (resErr) throw resErr;
          const { error } = await supabase.from('epe_runs').delete().eq('id', runId);
          if (error) throw error;
          toast({ title: 'Run deleted' });
          fetchData();
        } catch (error) {
          toast({ variant: 'destructive', title: 'Could not delete run', description: error.message });
        }
      };

      // Compact KPI formatting for the run history strip (Wave D).
      const fmtCompactUsd = (v) => (typeof v === 'number'
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(v)
        : null);

      const handleDeleteFile = async (fileId, table, fileName) => {
        // Wave E (audit 4.11): destructive action gets a confirm.
        if (!window.confirm(`Delete ${fileName || 'this file'}? The engine will no longer see its data.`)) return;
        try {
          const { error } = await supabase.from(table).delete().eq('id', fileId);
          if (error) throw error;
          toast({ title: 'File deleted' });
          fetchData();
        } catch (error) {
          toast({ variant: 'destructive', title: 'Failed to delete file', description: error.message });
        }
      };

      if (loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-16 h-16 animate-spin text-cyan-400" /></div>;
      }

      return (
        <>
          <Helmet>
            <title>{caseDetails?.case_name || 'Case Detail'} - Petroleum Economics Studio</title>
          </Helmet>
          <div className="p-4 sm:p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <Link to="/dashboard/apps/economics/epe/cases">
                  <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Cases</Button>
                </Link>
                <div>
                  <h1 className="text-3xl font-bold text-white">{caseDetails?.case_name}</h1>
                  <p className="text-slate-400">{caseDetails?.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && (
                  <Button
                    variant="outline"
                    onClick={handleToggleShare}
                    disabled={shareBusy || (!caseDetails?.organization_id && !myOrgId)}
                    title={!caseDetails?.organization_id && !myOrgId
                      ? 'Join an organization to share cases'
                      : caseDetails?.organization_id
                        ? 'Shared read-only with your organization. Click to make it private.'
                        : 'Make this case visible read-only to your organization.'}
                    className={caseDetails?.organization_id ? 'border-sky-600 text-sky-300' : ''}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    {caseDetails?.organization_id ? 'Shared with organization' : 'Share with organization'}
                  </Button>
                )}
                <Link to={`/dashboard/apps/economics/epe/cases/${caseId}/compare`}>
                  <Button variant="outline"><Compare className="w-4 h-4 mr-2" />Compare Runs</Button>
                </Link>
                {isOwner && (
                  <Link to={`/dashboard/apps/economics/epe/cases/${caseId}/run`}>
                    <Button><Play className="w-4 h-4 mr-2" />New Run</Button>
                  </Link>
                )}
              </div>
            </div>

            {!isOwner && (
              <div className="mb-6 flex items-center gap-2 p-3 bg-sky-900/20 border border-sky-800/50 rounded-lg text-sky-200 text-sm">
                <Users className="w-4 h-4 shrink-0" />
                Shared by a teammate. Read-only: you can view data, runs and results, and clone the case from the case list to work on your own copy.
              </div>
            )}

            <Tabs defaultValue="data" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="data">Data Management</TabsTrigger>
                <TabsTrigger value="runs">Run History</TabsTrigger>
              </TabsList>
              <TabsContent value="data">
                <div className="grid md:grid-cols-3 gap-6 mt-6">
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle>Production Volumes</CardTitle>
                      <CardDescription>Upload production forecast files.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {productionVolumes.length > 1 && <MultiFileWarning count={productionVolumes.length} scenarios />}
                      {productionVolumes.map(f => (
                        <div key={f.id}>
                          <div className="flex justify-end -mb-2 relative z-10 pr-2 pt-1">
                            <ScenarioChip label={f.scenario_label} />
                          </div>
                          <EpeDataFileCard file={f} onProcess={(f2) => handleProcessFile({...f2, dataType: 'production_volumes'})} onDelete={isOwner ? () => handleDeleteFile(f.id, 'epe_production_volumes', f.file_name) : undefined} processing={processingFileId === f.id} />
                        </div>
                      ))}
                      {isOwner && (
                        <>
                          <EpeDataUploader caseId={caseId} onSuccess={fetchData} dataType="production_volumes" existingCount={productionVolumes.length} existingFiles={productionVolumes.map(f => ({ id: f.id, scenario_label: f.scenario_label }))} />
                          <Button variant="outline" size="sm" onClick={openFshDialog} className="w-full">
                            <GitBranch className="w-4 h-4 mr-2" />Import from Forecast Scenario Hub
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle>CAPEX</CardTitle>
                      <CardDescription>Upload capital expenditure files.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {capex.length > 1 && <MultiFileWarning count={capex.length} />}
                      {capex.map(f => <EpeDataFileCard key={f.id} file={f} onProcess={(f2) => handleProcessFile({...f2, dataType: 'capex'})} onDelete={isOwner ? () => handleDeleteFile(f.id, 'epe_capex', f.file_name) : undefined} processing={processingFileId === f.id} />)}
                      {isOwner && <EpeDataUploader caseId={caseId} onSuccess={fetchData} dataType="capex" existingCount={capex.length} />}
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle>OPEX</CardTitle>
                      <CardDescription>Upload operational expenditure files.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {opex.length > 1 && <MultiFileWarning count={opex.length} />}
                      {opex.map(f => <EpeDataFileCard key={f.id} file={f} onProcess={(f2) => handleProcessFile({...f2, dataType: 'opex'})} onDelete={isOwner ? () => handleDeleteFile(f.id, 'epe_opex', f.file_name) : undefined} processing={processingFileId === f.id} />)}
                      {isOwner && <EpeDataUploader caseId={caseId} onSuccess={fetchData} dataType="opex" existingCount={opex.length} />}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="runs">
                <Card className="bg-slate-800/50 border-slate-700 mt-6">
                  <CardHeader>
                    <CardTitle>Run History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {runs.length > 0 ? (
                      <ul className="space-y-3">
                        {runs.map(run => {
                          const status = run.status || 'complete';
                          return (
                            <li key={run.id} className="p-3 bg-slate-800 rounded-md flex justify-between items-center gap-4">
                              <div className="min-w-0">
                                <p className="font-semibold text-cyan-400 flex items-center gap-2">
                                  {run.run_name}
                                  {status === 'failed' && (
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">Failed</span>
                                  )}
                                  {status === 'running' && (
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-800">Running</span>
                                  )}
                                  {run.locked && (
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600 inline-flex items-center gap-1"><Lock className="w-2.5 h-2.5" />Locked</span>
                                  )}
                                  {run.approved_at && (
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800 inline-flex items-center gap-1" title={`Approved ${new Date(run.approved_at).toLocaleString()}`}><BadgeCheck className="w-2.5 h-2.5" />Approved</span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-400">Run on: {new Date(run.created_at).toLocaleString()}</p>
                                {status === 'failed' && run.error_message && (
                                  <p className="text-xs text-red-400/80 mt-1 truncate" title={run.error_message}>{run.error_message}</p>
                                )}
                                {/* Wave D: headline KPIs make the list a decision table */}
                                {status === 'complete' && runKpis[run.id] && (
                                  <p className="text-xs text-slate-300 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                    <span>NPV <span className="font-mono text-lime-300">{fmtCompactUsd(runKpis[run.id].npv) ?? 'n/a'}</span></span>
                                    <span>IRR <span className="font-mono text-lime-300">{typeof runKpis[run.id].irr === 'number' ? `${runKpis[run.id].irr.toFixed(1)}%` : 'n/a'}</span></span>
                                    <span>Payback <span className="font-mono text-lime-300">{typeof runKpis[run.id].payback_years === 'number' ? `${runKpis[run.id].payback_years.toFixed(2)} yrs` : (runKpis[run.id].payback ?? 'n/a')}</span></span>
                                    {runKpis[run.id].fiscal_regime && (
                                      <span>Regime <span className="font-mono text-slate-400">{runKpis[run.id].fiscal_regime}</span></span>
                                    )}
                                    {runKpis[run.id].engine_version && (
                                      <span className="text-slate-500" title="Engine version that produced this result">v{runKpis[run.id].engine_version}</span>
                                    )}
                                  </p>
                                )}
                              </div>
                              {status === 'failed' ? (
                                isOwner ? (
                                  <Button variant="ghost" size="icon" className="hover:text-red-400 shrink-0" title="Delete failed run"
                                    onClick={() => handleDeleteRun(run.id, run.run_name)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                ) : null
                              ) : (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Link to={`/dashboard/apps/economics/epe/runs/${run.id}`}>
                                    <Button variant="secondary">View Results</Button>
                                  </Link>
                                  {isOwner && status === 'complete' && (
                                    <>
                                      <Button variant="ghost" size="icon"
                                        title={run.locked ? 'Unlock this run' : 'Lock this run so it cannot be deleted'}
                                        onClick={() => handleToggleLock(run)}>
                                        {run.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                      </Button>
                                      <Button variant="ghost" size="icon"
                                        className={run.approved_at ? 'text-emerald-400' : ''}
                                        title={run.approved_at ? 'Remove approval' : 'Approve this run'}
                                        onClick={() => handleToggleApprove(run)}>
                                        <BadgeCheck className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                  {isOwner && (
                                    <Button variant="ghost" size="icon" className="hover:text-red-400"
                                      title={run.locked ? 'Unlock the run before deleting it' : 'Delete run'}
                                      disabled={run.locked}
                                      onClick={() => handleDeleteRun(run.id, run.run_name)}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="text-center py-12">
                        <BarChart className="mx-auto h-12 w-12 text-slate-500" />
                        <h3 className="mt-2 text-lg font-medium text-white">No runs yet</h3>
                        <p className="mt-1 text-sm text-slate-400">Create a new run to see results here.</p>
                        <Link to={`/dashboard/apps/economics/epe/cases/${caseId}/run`} className="mt-4 inline-block">
                          <Button><Plus className="mr-2 h-4 w-4" />Start a New Run</Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Wave E (audit 4.13): Forecast Scenario Hub import */}
          <Dialog open={fshOpen} onOpenChange={setFshOpen}>
            <DialogContent className="sm:max-w-[480px] bg-gray-900 text-white border-slate-700">
              <DialogHeader>
                <DialogTitle>Import from Forecast Scenario Hub</DialogTitle>
                <DialogDescription>
                  Pick a saved scenario set and one of its cases. The annual profile is rebuilt with the same decline engine the Hub uses and loaded into this case's production slot.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm text-white">Scenario set</Label>
                  <select
                    value={fshProjectId}
                    onChange={(e) => { setFshProjectId(e.target.value); setFshCaseIdx(''); }}
                    className="w-full mt-1 bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
                  >
                    <option value="">Choose a saved scenario set</option>
                    {fshProjects.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.project_name}{pr.updated_at ? ` (${new Date(pr.updated_at).toLocaleDateString()})` : ''}
                      </option>
                    ))}
                  </select>
                  {fshProjects.length === 0 && (
                    <p className="text-xs text-slate-500 mt-1">No saved scenario sets found. Save one in Forecast Scenario Hub first.</p>
                  )}
                </div>
                {fshProjectId && (
                  <div>
                    <Label className="text-sm text-white">Case</Label>
                    <select
                      value={fshCaseIdx}
                      onChange={(e) => setFshCaseIdx(e.target.value)}
                      className="w-full mt-1 bg-gray-800 border border-slate-600 rounded px-2 py-2 text-sm text-white"
                    >
                      <option value="">Choose a case</option>
                      {(fshProjects.find((pr) => pr.id === fshProjectId)?.inputs_data?.cases || []).map((c, i) => (
                        <option key={i} value={String(i)}>
                          {c.name} (qi {c.qi} bbl/d, {c.declineAnnualPct}%/yr, b {c.b}, {c.years} yr)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <Label className="text-sm text-white">First production year</Label>
                  <Input
                    type="number" step="1"
                    value={fshStartYear}
                    onChange={(e) => setFshStartYear(e.target.value)}
                    className="mt-1 bg-gray-800 border-slate-600 text-white"
                  />
                </div>
                {productionVolumes.length > 0 && (
                  <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fshReplace}
                      onChange={(e) => setFshReplace(e.target.checked)}
                      className="mt-0.5 accent-cyan-500"
                    />
                    <span>
                      Replace the {productionVolumes.length} existing production file{productionVolumes.length > 1 ? 's' : ''} (recommended). The engine sums every file in the slot.
                    </span>
                  </label>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFshOpen(false)}>Cancel</Button>
                <Button onClick={handleFshImport} disabled={fshBusy || !fshProjectId || fshCaseIdx === ''}>
                  {fshBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitBranch className="w-4 h-4 mr-2" />}
                  Import profile
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      );
    };

    export default EpeCaseDetail;