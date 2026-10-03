import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { PlusCircle, Package, Edit, Trash2, Zap, BarChart2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProjectForm from '@/components/capitalportfoliostudio/ProjectForm';
import PortfolioForm from '@/components/capitalportfoliostudio/PortfolioForm';
import OptimizationResults from '@/components/capitalportfoliostudio/OptimizationResults';
import PortfolioComparison from '@/components/capitalportfoliostudio/PortfolioComparison';
import { optimizePortfolio, PortfolioInputError } from '@/utils/portfolioOptimizer';
import { emvOrRefusal, projectRefusal, posText } from '@/components/capitalportfoliostudio/projectRefusal';
import PortfolioHelpGuide from '@/components/capitalportfoliostudio/PortfolioHelpGuide';
import { FullPrecisionProvider, FullPrecisionToggle, useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull, MONEY_MM_DECIMALS } from '@/lib/fullPrecision';
import { AppHeader } from '@/components/ui/app-shell';
import { signedTone } from '@/components/ui/numeric-table';
import { buildLabel } from '@/lib/platformBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { getRrvPortfolioCandidate } from '@/pages/apps/riskedreserves/services/rrvPortfolioService';
import {
  isRrvProject, readRrvLink, rrvEditedFields, rrvLinkState, refreshRrvProject, rrvStateSentence, RRV_NPV_NOTE,
} from '@/components/capitalportfoliostudio/rrvIntake';

// right-aligned mono figures for the project inventory (NumericTable recipe)
const numCell = (tone) => `text-right font-pl-mono tabular-nums whitespace-nowrap ${tone || 'text-pl-text'}`;

/** Under a Risked Reserves project's name: where it came from, what moved there since, what was typed here. */
function RrvRowNotes({ p, state, checking, onRefresh }) {
  const link = readRrvLink(p);
  const edited = rrvEditedFields(p);
  const sentence = checking ? null : rrvStateSentence(state);
  return (
    <span className="block font-normal" data-testid={`cp-rrv-row-${p.name}`} data-state={checking ? 'checking' : state.state}>
      <span className="ml-0 mt-0.5 inline-block text-[10px] text-pl-muted bg-pl-sunken border border-pl-border rounded px-1.5 py-0.5" title={link?.label || 'Risked Reserves valuation'}>
        RRV{link?.contract?.sharedFromColleague ? ' (shared)' : ''}
      </span>
      <span className="ml-1 text-[10px] text-pl-muted">Pg {link ? `${(link.contract.pg * 100).toFixed(1)}%` : EMPTY_VALUE}, risk score not provided</span>
      {sentence && (
        <span className="block text-[10px] text-pl-warning-text" data-testid={`cp-rrv-state-${p.name}`}>
          {sentence}{' '}
          {state.state === 'changed' && state.contract && (
            <button type="button" className="underline text-pl-primary-text" data-testid={`cp-rrv-refresh-${p.name}`} onClick={() => onRefresh(p, state.contract)}>
              <RefreshCw className="inline w-3 h-3 mr-0.5" />Refresh
            </button>
          )}
        </span>
      )}
      {edited.length > 0 && (
        <span className="block text-[10px] text-pl-warning-text" data-testid={`cp-rrv-edited-${p.name}`}>
          Edited after intake: {edited.map((e) => e.label).join(', ')}
        </span>
      )}
    </span>
  );
}

const CapitalPortfolioStudioInner = () => {
  const { full } = useFullPrecision();
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolio, setActivePortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isProjectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isPortfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
  // Economics E5: average pairwise correlation between project outcomes. Zero
  // is the independence the roll-up used to assume unconditionally.
  const [correlation, setCorrelation] = useState(0);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [comparisonIds, setComparisonIds] = useState(new Set());
  const [isComparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState([]);
  // Risked Reserves Valuation U2-009: a valuation sent by link (?rrvValuation=<id>)
  const [rrvOffer, setRrvOffer] = useState(null);
  const [rrvNote, setRrvNote] = useState(null);
  const [params, setParams] = useSearchParams();
  const linkedValuation = params.get('rrvValuation');

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('portfolio_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error fetching projects', description: error.message });
    } else {
      setProjects(data);
    }
  }, [user, toast]);

  const fetchPortfolios = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error fetching portfolios', description: error.message });
    } else {
      setPortfolios(data);
    }
  }, [user, toast]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchProjects(), fetchPortfolios()]);
      setLoading(false);
    };
    if (user) {
      fetchData();
    }
  }, [user, fetchProjects, fetchPortfolios]);

  // a valuation sent from Risked Reserves Valuation opens the project form,
  // filled. The link is read once and dropped from the address; the answer
  // is kept for as long as the page is open (the param change re-runs this
  // effect, so it must not cancel the read).
  const linkDone = useRef(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (!user || !linkedValuation || linkDone.current === linkedValuation) return;
    linkDone.current = linkedValuation;
    getRrvPortfolioCandidate(supabase, linkedValuation, { build: buildLabel() }).then((r) => {
      if (!mounted.current) return;
      if (r?.ok) {
        setRrvOffer(r.contract);
        setEditingProject(null);
        setProjectDialogOpen(true);
        setRrvNote(`Risked Reserves Valuation sent "${r.contract.prospectName}". Check the project and create it to add it to your inventory.`);
      } else {
        setRrvNote(r ? `The Risked Reserves valuation in the link cannot be taken in: ${r.reason}` : 'The Risked Reserves valuation in the link was not found on your account, or is no longer shared with you.');
      }
    }).catch((e) => { if (mounted.current) setRrvNote(e.message); });
    const next = new URLSearchParams(params); next.delete('rrvValuation'); setParams(next, { replace: true });
  }, [user, linkedValuation]); // eslint-disable-line react-hooks/exhaustive-deps

  // each Risked Reserves project's valuation is read again by id, so "source
  // changed since" survives a reload; undefined in the map: not readable now
  const [rrvNow, setRrvNow] = useState(() => new Map());
  const rrvIds = useMemo(() => [...new Set(projects.filter(isRrvProject).map((p) => p.source_ref).filter(Boolean))].sort().join('|'), [projects]);
  useEffect(() => {
    if (!rrvIds) return undefined;
    let live = true;
    for (const id of rrvIds.split('|')) {
      getRrvPortfolioCandidate(supabase, id, { build: buildLabel() }).then((r) => r, () => undefined).then((r) => { if (live) setRrvNow((m) => new Map(m).set(id, r)); });
    }
    return () => { live = false; };
  }, [rrvIds]);

  const refreshRrv = async (p, contract) => {
    const { error } = await supabase.from('portfolio_projects').update(refreshRrvProject(p, contract, { build: buildLabel() })).eq('id', p.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Refresh failed', description: error.message });
      return;
    }
    toast({ title: 'Refreshed', description: `${p.name} now carries the valuation as it is in Risked Reserves Valuation. Values typed here are kept.` });
    fetchProjects();
  };

  useEffect(() => {
    if (activePortfolio) {
      const initialSelected = new Set(projects.map(p => p.id));
      setSelectedProjectIds(initialSelected);
      setOptimizationResult(null);
    }
  }, [activePortfolio, projects]);

  const handleOpenProjectDialog = (project = null) => {
    setEditingProject(project);
    setProjectDialogOpen(true);
  };

  const handleCloseProjectDialog = () => {
    setEditingProject(null);
    setProjectDialogOpen(false);
    setRrvOffer(null);
  };

  const handleSaveProject = () => {
    handleCloseProjectDialog();
    fetchProjects();
  };

  const handleDeleteProject = async (projectId) => {
    const { error } = await supabase.from('portfolio_projects').delete().eq('id', projectId);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to delete project', description: error.message });
    } else {
      toast({ title: 'Success!', description: 'Project deleted.' });
      fetchProjects();
    }
  };

  const handleOpenPortfolioDialog = (portfolio = null) => {
    setEditingPortfolio(portfolio);
    setPortfolioDialogOpen(true);
  };

  const handleClosePortfolioDialog = () => {
    setEditingPortfolio(null);
    setPortfolioDialogOpen(false);
  };

  const handleSavePortfolio = () => {
    handleClosePortfolioDialog();
    fetchPortfolios();
  };

  const handleDeletePortfolio = async (portfolioId) => {
    const { error } = await supabase.from('portfolios').delete().eq('id', portfolioId);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to delete portfolio', description: error.message });
    } else {
      toast({ title: 'Success!', description: 'Portfolio deleted.' });
      if (activePortfolio?.id === portfolioId) {
        setActivePortfolio(null);
      }
      setComparisonIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(portfolioId);
        return newSet;
      });
      fetchPortfolios();
    }
  };

  const handleProjectSelectionChange = (projectId) => {
    setSelectedProjectIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  // Optimization math lives in src/utils/portfolioOptimizer.js (D4):
  // risked-EMV knapsack, efficient frontier, and the portfolio risk summary
  // (seeded Monte Carlo since EC5-0). totalNpv is kept as an alias of
  // totalEmv for the comparison view's field names.
  const runSingleOptimization = (portfolio, candidateProjects) => {
    const result = optimizePortfolio({
      projects: candidateProjects,
      capexLimit: portfolio.capex_limit,
      correlation,
    });
    return { ...portfolio, ...result, totalNpv: result.totalEmv };
  };

  // EC5-0: the engine refuses a project it cannot optimise (a negative
  // capex) with a PortfolioInputError. Say so instead of crashing the page.
  const tryOptimization = (fn) => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof PortfolioInputError || err?.name === 'PortfolioInputError') {
        toast({ variant: 'destructive', title: 'Cannot optimize this portfolio', description: err.message });
        return null;
      }
      throw err;
    }
  };

  const runOptimization = () => {
    if (!activePortfolio) return;
    const candidateProjects = projects.filter(p => selectedProjectIds.has(p.id));
    const result = tryOptimization(() => runSingleOptimization(activePortfolio, candidateProjects));
    if (!result) {
      setOptimizationResult(null);
      return;
    }
    setOptimizationResult(result);
    toast({
      title: "Optimization Complete!",
      description: `Found optimal portfolio with ${result.optimalProjects.length} projects.`,
    });
  };

  const handleComparisonSelection = (portfolioId) => {
    setComparisonIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(portfolioId)) {
        newSet.delete(portfolioId);
      } else {
        newSet.add(portfolioId);
      }
      return newSet;
    });
  };

  const handleRunComparison = () => {
    const portfoliosToCompare = portfolios.filter(p => comparisonIds.has(p.id));
    const results = tryOptimization(() => portfoliosToCompare.map(p => runSingleOptimization(p, projects)));
    if (!results) return;
    setComparisonData(results);
    setComparisonOpen(true);
  };

  // EC5-6 and EC5-7: every refusal the engine would raise on Run, listed
  // before the user presses it.
  const projectRefusals = projects.map(projectRefusal).filter(Boolean);

  const formatCurrency = (value, unit = 'MM') => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0) + (unit ? ` ${unit}` : '');

  return (
    <>
      <Helmet>
        <title>Capital Portfolio Studio</title>
        <meta name="description" content="Optimize your capital allocation with advanced portfolio analysis." />
      </Helmet>
      <AppHeader
        backTo="/dashboard/economics"
        backLabel="Back to Economics"
        icon={Package}
        title="Capital Portfolio Studio"
        subtitle="Risked EMV portfolio optimisation under a capital limit"
        actions={(
          <>
            <FullPrecisionToggle app="capital-portfolio" />
            <PortfolioHelpGuide />
          </>
        )}
      />
      <div className="flex flex-col h-full p-4 md:p-8">
        {rrvNote && (
          <p className="mb-4 rounded-lg border border-pl-border bg-pl-surface px-3 py-2 text-sm text-pl-text" data-testid="cp-rrv-note">
            {rrvNote}{' '}
            <button type="button" className="underline text-pl-primary-text" onClick={() => setRrvNote(null)}>Dismiss</button>
          </p>
        )}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-pl-surface border border-pl-border rounded-xl p-4 sm:p-6 h-full flex flex-col shadow-pl-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-pl-text">Portfolios</h2>
                <Button onClick={() => handleOpenPortfolioDialog()} size="sm">
                  <PlusCircle className="w-4 h-4 mr-2" /> Create
                </Button>
              </div>
              <Button onClick={handleRunComparison} disabled={comparisonIds.size < 2} variant="outline" className="w-full mb-4">
                <BarChart2 className="w-4 h-4 mr-2" /> Compare ({comparisonIds.size})
              </Button>
              <div className="space-y-2 overflow-y-auto">
                {loading ? (
                  <p className="text-center text-pl-muted">Loading portfolios...</p>
                ) : portfolios.length === 0 ? (
                  <div className="text-center text-pl-muted py-16">
                    <p>No portfolios yet. Create your first scenario!</p>
                  </div>
                ) : (
                  portfolios.map(p => (
                    <div key={p.id}
                      className={`p-3 rounded-lg transition-all border-2 ${activePortfolio?.id === p.id ? 'bg-pl-sunken border-pl-primary' : 'border-transparent hover:bg-pl-sunken'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3 flex-grow cursor-pointer" onClick={() => setActivePortfolio(p)}>
                          <Checkbox id={`compare-${p.id}`} checked={comparisonIds.has(p.id)} onCheckedChange={() => handleComparisonSelection(p.id)} onClick={(e) => e.stopPropagation()} />
                          <div>
                            <p className="font-semibold text-pl-text">{p.name}</p>
                            <p className="text-sm text-pl-muted">Limit: <span className="font-pl-mono tabular-nums text-pl-text">{formatCurrency(p.capex_limit)}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenPortfolioDialog(p); }} className="text-pl-muted hover:text-pl-text h-7 w-7" aria-label={`Edit ${p.name}`}><Edit className="w-4 h-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="text-pl-danger-text hover:text-pl-danger-text h-7 w-7" aria-label={`Delete ${p.name}`}><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the portfolio "{p.name}".</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePortfolio(p.id)} className="bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90">Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
          <div className="lg:col-span-3">
            {!activePortfolio ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-full min-h-[16rem] bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm">
                <div className="text-center">
                  <Package className="mx-auto h-12 w-12 text-pl-muted" aria-hidden="true" />
                  <h3 className="mt-2 text-lg font-medium text-pl-text">Select a portfolio</h3>
                  <p className="mt-1 text-pl-muted">Choose a portfolio from the list or create a new one to start.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl">{activePortfolio.name} - Workbench</CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => handleOpenProjectDialog()} variant="outline">
                          <PlusCircle className="w-4 h-4 mr-2" /> Add Project
                        </Button>
                        <Button onClick={runOptimization}>
                          <Zap className="w-4 h-4 mr-2" /> Run Optimization
                        </Button>
                      </div>
                    </div>
                    <p className="text-pl-muted">Select projects to include. The optimizer maximizes risked EMV under the CAPEX limit: <span className="font-semibold font-pl-mono tabular-nums text-pl-text">{formatCurrency(activePortfolio.capex_limit)}</span></p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label htmlFor="portfolio-correlation" className="text-sm text-pl-muted">
                        Average correlation between projects
                      </label>
                      <input
                        id="portfolio-correlation"
                        type="range" min="0" max="0.9" step="0.05"
                        value={correlation}
                        onChange={(e) => setCorrelation(Number(e.target.value))}
                        className="w-48 max-w-full accent-pl-primary"
                      />
                      <span className="text-sm font-pl-mono tabular-nums text-pl-text">{correlation.toFixed(2)}</span>
                    </div>
                    <p className="mt-1 text-xs text-pl-muted max-w-2xl">
                      Zero treats every project as independent, which is the friendliest assumption a
                      portfolio can be given. Projects that share a basin, a partner, a rig contract
                      or a price deck move together, and the loss they can produce at once is larger
                      than independence implies. Correlation widens the spread and the chance of a
                      loss; it does not change the expected value.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {projectRefusals.length > 0 && (
                      <div role="alert" data-testid="portfolio-refusals" className="mb-3 rounded-lg border border-pl-danger/40 bg-pl-danger-bg p-3 text-sm text-pl-danger-text space-y-1">
                        <p>These projects cannot be optimised until they are corrected:</p>
                        {projectRefusals.map((msg) => <p key={msg} className="text-xs">{msg}</p>)}
                      </div>
                    )}
                    <div className="max-h-[28rem] overflow-y-auto pr-2">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[50px]"><Checkbox checked={selectedProjectIds.size === projects.length && projects.length > 0} onCheckedChange={(checked) => setSelectedProjectIds(checked ? new Set(projects.map(p => p.id)) : new Set())} /></TableHead>
                            <TableHead>Project</TableHead>
                            <TableHead className="text-right">CAPEX</TableHead>
                            <TableHead className="text-right">NPV P50</TableHead>
                            <TableHead className="text-right">POS</TableHead>
                            <TableHead className="text-right">Risked EMV</TableHead>
                            <TableHead className="w-[70px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {projects.map(p => {
                            const refusal = projectRefusal(p);
                            const { emv } = emvOrRefusal(p);
                            return (
                            <TableRow key={p.id}>
                              <TableCell><Checkbox checked={selectedProjectIds.has(p.id)} onCheckedChange={() => handleProjectSelectionChange(p.id)} /></TableCell>
                              <TableCell className="font-medium">
                                {p.name}
                                {p.source_type === 'epe_mc' && (
                                  <span className="ml-2 text-[10px] text-pl-muted bg-pl-sunken border border-pl-border rounded px-1.5 py-0.5" title={p.source_label || 'Linked EPE Monte Carlo run'}>EPE MC</span>
                                )}
                                {isRrvProject(p) && <RrvRowNotes p={p} state={rrvLinkState(p, rrvNow.has(p.source_ref) ? rrvNow.get(p.source_ref) : undefined)} checking={!rrvNow.has(p.source_ref)} onRefresh={refreshRrv} />}
                              </TableCell>
                              <TableCell className={numCell()}>{formatCurrency(p.capex)}</TableCell>
                              <TableCell className={numCell(signedTone(Number(p.npv_p50)))}>
                                {formatCurrency(p.npv_p50)}
                                {isRrvProject(p) && <span className="block text-[10px] text-pl-muted font-sans" title={`Success-case mean value: ${RRV_NPV_NOTE}`} data-testid={`cp-mean-${p.name}`}>success-case mean</span>}
                              </TableCell>
                              <TableCell className={numCell()}>{posText(p, refusal)}</TableCell>
                              <TableCell className={numCell(emv === null ? '' : signedTone(emv))}>
                                {emv === null ? <span className="text-pl-danger-text" title={refusal || undefined}>n/a</span> : (full ? `${formatFull(emv, MONEY_MM_DECIMALS)} $MM` : formatCurrency(emv))}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenProjectDialog(p)} className="text-pl-muted hover:text-pl-text h-7 w-7" title="Edit project"><Edit className="w-4 h-4" /></Button>
                                {/* CPS-T1-003: a project delete asks first, as a portfolio delete does */}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-pl-danger-text hover:text-pl-danger-text h-7 w-7" title="Delete project"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                                      <AlertDialogDescription>The project is removed from every portfolio. This cannot be undone.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteProject(p.id)} className="bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                            );
                          })}
                          {projects.length === 0 && (
                            <TableRow><TableCell colSpan={7} className="text-center text-pl-muted py-6">No projects yet. Use Add Project to create one, typed or linked to an EPE Monte Carlo run.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {projects.some(isRrvProject) && (
                      <p className="mt-2 text-xs text-pl-muted" data-testid="cp-rrv-footnote">
                        Projects from Risked Reserves Valuation carry the success-case mean value in the NPV P50 column (marked), {RRV_NPV_NOTE}. Their P90 and P10 are the values of the success-case P90 and P10 sizes, their CAPEX is the exploration well cost, their chance of success is Pg, and they have no risk score.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <OptimizationResults result={optimizationResult} />
              </motion.div>
            )}
          </div>
        </div>
      </div>
      <Dialog open={isProjectDialogOpen} onOpenChange={setProjectDialogOpen}>
        {/* the form with a Risked Reserves provenance card is taller than a laptop screen */}
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Edit' : 'Add'} Project</DialogTitle>
          </DialogHeader>
          <ProjectForm
            key={editingProject?.id || (rrvOffer ? `rrv-${rrvOffer.valuationId}` : 'new')}
            offer={editingProject ? null : rrvOffer}
            project={editingProject}
            onSave={handleSaveProject}
            onCancel={handleCloseProjectDialog}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={isPortfolioDialogOpen} onOpenChange={setPortfolioDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPortfolio ? 'Edit' : 'Create'} Portfolio</DialogTitle>
          </DialogHeader>
          <PortfolioForm
            portfolio={editingPortfolio}
            onSave={handleSavePortfolio}
            onCancel={handleClosePortfolioDialog}
          />
        </DialogContent>
      </Dialog>
      <PortfolioComparison isOpen={isComparisonOpen} onClose={() => setComparisonOpen(false)} comparisonData={comparisonData} />
    </>
  );
};

// W3 (D3): the Full precision switch prints the risked EMV, success-case NPV,
// P90 / P10 and the inventory EMV column at 4 decimals in $MM.
//
// Design system rollout batch 2E (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. The frontier and comparison charts keep the
// white chart standard.
const CapitalPortfolioStudio = () => (
  <div className="min-h-screen" data-testid="portfolio-theme-scope">
    <FullPrecisionProvider>
      <CapitalPortfolioStudioInner />
    </FullPrecisionProvider>
  </div>
);

export default CapitalPortfolioStudio;