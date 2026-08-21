import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Briefcase, Plus, ChevronRight, ArrowLeft, HelpCircle, Sparkles, Search, Archive, ArchiveRestore, Copy, Users } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { buildExampleCaseData } from '@/lib/epeExampleCase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate, Link } from 'react-router-dom';

const EpeCaseList = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewCaseDialogOpen, setIsNewCaseDialogOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseDescription, setNewCaseDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingExample, setIsCreatingExample] = useState(false);
  // Wave E: sharing, search, archive, clone, last-run badges
  const [meId, setMeId] = useState(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [lastRunKpis, setLastRunKpis] = useState({}); // case_id -> kpis
  const [cloningId, setCloningId] = useState(null);

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to view cases.', variant: 'destructive' });
      setLoading(false);
      return;
    }

    setMeId(user.id);

    // Wave E: no user_id filter; RLS returns own cases plus cases shared
    // with the organization (read-only).
    const { data, error } = await supabase
      .from('epe_cases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error fetching cases', description: error.message, variant: 'destructive' });
    } else {
      setCases(data);
      fetchLastRunKpis(data);
    }
    setLoading(false);
  };

  // Wave E: last completed run's headline KPIs per case, two batch queries.
  const fetchLastRunKpis = async (caseRows) => {
    const caseIds = (caseRows || []).map((c) => c.id);
    if (caseIds.length === 0) { setLastRunKpis({}); return; }
    const { data: runRows } = await supabase
      .from('epe_runs')
      .select('id, case_id, created_at, status')
      .in('case_id', caseIds)
      .or('status.is.null,status.eq.complete')
      .order('created_at', { ascending: false });
    const latestRunByCase = {};
    (runRows || []).forEach((r) => {
      if (!latestRunByCase[r.case_id]) latestRunByCase[r.case_id] = r;
    });
    const runIds = Object.values(latestRunByCase).map((r) => r.id);
    if (runIds.length === 0) { setLastRunKpis({}); return; }
    const { data: kpiRows } = await supabase
      .from('epe_results')
      .select('run_id, kpis')
      .in('run_id', runIds);
    const kpisByRun = {};
    (kpiRows || []).forEach((r) => { kpisByRun[r.run_id] = r.kpis; });
    const byCase = {};
    for (const [cid, run] of Object.entries(latestRunByCase)) {
      if (kpisByRun[run.id]) byCase[cid] = { ...kpisByRun[run.id], run_date: run.created_at };
    }
    setLastRunKpis(byCase);
  };

  const handleToggleArchive = async (c) => {
    const archiving = !c.archived_at;
    const { error } = await supabase
      .from('epe_cases')
      .update({ archived_at: archiving ? new Date().toISOString() : null })
      .eq('id', c.id);
    if (error) {
      toast({ title: archiving ? 'Archive failed' : 'Unarchive failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: archiving ? 'Case archived' : 'Case restored' });
      fetchCases();
    }
  };

  // Wave E clone-as-what-if: duplicate the case into my workspace (private,
  // unarchived) and copy each data file's parsed rows. Runs are not copied.
  const handleCloneCase = async (c) => {
    setCloningId(c.id);
    try {
      const { data: newCase, error: caseErr } = await supabase
        .from('epe_cases')
        .insert([{ case_name: `${c.case_name} (copy)`, description: c.description, user_id: meId }])
        .select()
        .single();
      if (caseErr) throw new Error(`Creating the copy: ${caseErr.message}`);
      let copied = 0;
      for (const table of ['epe_production_volumes', 'epe_capex', 'epe_opex']) {
        const { data: rows, error: readErr } = await supabase
          .from(table).select('file_name, data').eq('case_id', c.id);
        if (readErr) throw new Error(`Reading ${table}: ${readErr.message}`);
        for (const row of rows || []) {
          const { error: insErr } = await supabase
            .from(table)
            .insert({ case_id: newCase.id, user_id: meId, file_name: row.file_name, data: row.data });
          if (insErr) throw new Error(`Copying ${row.file_name}: ${insErr.message}`);
          copied++;
        }
      }
      toast({ title: 'Case cloned', description: `"${newCase.case_name}" created with ${copied} data file${copied === 1 ? '' : 's'}.` });
      fetchCases();
    } catch (err) {
      toast({ title: 'Clone failed', description: err.message, variant: 'destructive' });
    } finally {
      setCloningId(null);
    }
  };

  const fmtBadgeUsd = (v) => (typeof v === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(v)
    : null);

  const handleNewCase = async () => {
    if (!newCaseName.trim()) {
      toast({ title: 'Validation Error', description: 'Case name is required.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('epe_cases')
      .insert([{ case_name: newCaseName, description: newCaseDescription, user_id: user.id }])
      .select()
      .single();

    if (error) {
      toast({ title: 'Error creating case', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'New case created successfully.' });
      setCases([data, ...cases]);
      setIsNewCaseDialogOpen(false);
      setNewCaseName('');
      setNewCaseDescription('');
      navigate(`/dashboard/apps/economics/epe/cases/${data.id}`);
    }
    setIsSubmitting(false);
  };

  const handleCreateExampleCase = async () => {
    setIsCreatingExample(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Error', description: 'You must be logged in to create a case.', variant: 'destructive' });
        return;
      }

      const example = buildExampleCaseData();

      const { data: newCase, error: caseError } = await supabase
        .from('epe_cases')
        .insert([{ case_name: example.caseName, description: example.caseDescription, user_id: user.id }])
        .select()
        .single();

      if (caseError) throw new Error(`Creating case: ${caseError.message}`);

      const datasets = [
        { table: 'epe_production_volumes', fileName: 'example_production.csv', rows: example.production },
        { table: 'epe_capex', fileName: 'example_capex.csv', rows: example.capex },
        { table: 'epe_opex', fileName: 'example_opex.csv', rows: example.opex },
      ];

      for (const ds of datasets) {
        const { error: dataError } = await supabase
          .from(ds.table)
          .insert({
            case_id: newCase.id,
            user_id: user.id,
            file_name: ds.fileName,
            data: ds.rows,
          });
        if (dataError) throw new Error(`Saving ${ds.fileName}: ${dataError.message}`);
      }

      toast({ title: 'Example case created', description: 'Sample production, CAPEX and OPEX data are ready to explore.' });
      await fetchCases();
    } catch (err) {
      toast({ title: 'Error creating example case', description: err.message, variant: 'destructive' });
    } finally {
      setIsCreatingExample(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Petroleum Economics Studio - Petrolord Suite</title>
        <meta name="description" content="Manage your Enterprise Petroleum Economics cases." />
      </Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard/economics')}
              className="text-white border-white/20 hover:bg-white/10"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Economics
            </Button>
            <Link to="/dashboard/apps/economics/epe/help">
              <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                <HelpCircle className="mr-2 h-4 w-4" /> Help & Guide
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-3 rounded-xl">
                <Briefcase className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white">Petroleum Economics Studio</h1>
                <p className="text-lime-200 text-lg">Case Management</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleCreateExampleCase}
                disabled={isCreatingExample}
                className="text-white border-white/20 hover:bg-white/10"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isCreatingExample ? 'Creating example...' : 'Create example case'}
              </Button>
              <Button onClick={() => setIsNewCaseDialogOpen(true)} className="bg-gradient-to-r from-green-600 to-lime-600 hover:from-green-700 hover:to-lime-700">
                <Plus className="w-4 h-4 mr-2" /> New Case
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6">
          {/* Wave E: search + archive controls */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cases by name or description"
                className="pl-8 bg-gray-800 border-slate-600 text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="accent-lime-400"
              />
              Show archived
            </label>
          </div>
          {loading ? (
            <div className="text-center py-16 text-white">Loading cases...</div>
          ) : (() => {
            const q = search.trim().toLowerCase();
            const visible = cases.filter((c) =>
              (showArchived || !c.archived_at)
              && (!q
                || (c.case_name || '').toLowerCase().includes(q)
                || (c.description || '').toLowerCase().includes(q)));
            const mine = visible.filter((c) => c.user_id === meId);
            const shared = visible.filter((c) => c.user_id !== meId);

            const CaseRow = ({ c, isMine }) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white/5 p-4 rounded-lg flex items-center justify-between gap-3 hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => navigate(`/dashboard/apps/economics/epe/cases/${c.id}`)}
              >
                <div className="min-w-0">
                  <h4 className="font-semibold text-white flex items-center gap-2 flex-wrap">
                    {c.case_name}
                    {c.archived_at && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 border border-slate-600">Archived</span>
                    )}
                    {c.organization_id && isMine && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-300 border border-sky-800" title="Visible read-only to your organization">Shared</span>
                    )}
                  </h4>
                  <p className="text-sm text-slate-400 truncate">{c.description || 'No description'}</p>
                  <p className="text-xs text-slate-500 mt-1">Created: {new Date(c.created_at).toLocaleDateString()}</p>
                  {lastRunKpis[c.id] && (
                    <p className="text-xs text-slate-300 mt-1">
                      Last run: <span className="font-mono text-lime-300">NPV {fmtBadgeUsd(lastRunKpis[c.id].npv) ?? 'n/a'}</span>
                      {typeof lastRunKpis[c.id].irr === 'number' && (
                        <span className="font-mono text-lime-300"> · IRR {lastRunKpis[c.id].irr.toFixed(1)}%</span>
                      )}
                      {lastRunKpis[c.id].fiscal_regime && (
                        <span className="text-slate-400"> · {lastRunKpis[c.id].fiscal_regime}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost" size="icon"
                    title="Clone into my workspace as a what-if copy"
                    disabled={cloningId === c.id}
                    onClick={() => handleCloneCase(c)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {isMine && (
                    <Button
                      variant="ghost" size="icon"
                      title={c.archived_at ? 'Restore this case' : 'Archive this case'}
                      onClick={() => handleToggleArchive(c)}
                      className="text-slate-400 hover:text-white"
                    >
                      {c.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </Button>
                  )}
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </motion.div>
            );

            if (visible.length === 0) {
              return (
                <div className="text-center py-16">
                  <h3 className="text-xl font-semibold text-white">No Cases Found</h3>
                  <p className="text-lime-300 mt-2">
                    {q ? 'No case matches your search.' : 'Get started by creating a new economic case.'}
                  </p>
                </div>
              );
            }
            return (
              <div className="space-y-6">
                <div className="space-y-4">
                  {shared.length > 0 && <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">My Cases</h3>}
                  {mine.length === 0 ? (
                    <p className="text-sm text-slate-500">You have no cases of your own{q ? ' matching this search' : ''}.</p>
                  ) : mine.map((c) => <CaseRow key={c.id} c={c} isMine />)}
                </div>
                {shared.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
                      <Users className="w-4 h-4 text-sky-400" /> Shared with your organization
                      <span className="text-[10px] font-normal normal-case text-slate-500">read-only; clone to work on a copy</span>
                    </h3>
                    {shared.map((c) => <CaseRow key={c.id} c={c} isMine={false} />)}
                  </div>
                )}
              </div>
            );
          })()}
        </motion.div>
      </div>

      <Dialog open={isNewCaseDialogOpen} onOpenChange={setIsNewCaseDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-gray-900 text-white border-slate-700">
          <DialogHeader>
            <DialogTitle>Create New Economic Case</DialogTitle>
            <DialogDescription>Give your new case a name and an optional description.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name</Label>
              <Input id="name" value={newCaseName} onChange={(e) => setNewCaseName(e.target.value)} className="col-span-3 bg-gray-800 border-slate-600" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">Description</Label>
              <Textarea id="description" value={newCaseDescription} onChange={(e) => setNewCaseDescription(e.target.value)} className="col-span-3 bg-gray-800 border-slate-600" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleNewCase} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EpeCaseList;