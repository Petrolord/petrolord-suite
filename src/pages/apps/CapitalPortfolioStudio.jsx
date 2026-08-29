import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ArrowLeft, PlusCircle, Package, Edit, Trash2, Zap, BarChart2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProjectForm from '@/components/capitalportfoliostudio/ProjectForm';
import PortfolioForm from '@/components/capitalportfoliostudio/PortfolioForm';
import OptimizationResults from '@/components/capitalportfoliostudio/OptimizationResults';
import PortfolioComparison from '@/components/capitalportfoliostudio/PortfolioComparison';
import { optimizePortfolio, projectEmv } from '@/utils/portfolioOptimizer';
import PortfolioHelpGuide from '@/components/capitalportfoliostudio/PortfolioHelpGuide';

const CapitalPortfolioStudio = () => {
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
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [comparisonIds, setComparisonIds] = useState(new Set());
  const [isComparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState([]);

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
  // risked-EMV knapsack, efficient frontier, and the normal-approximation
  // portfolio risk summary. totalNpv is kept as an alias of totalEmv for
  // the comparison view's field names.
  const runSingleOptimization = (portfolio, candidateProjects) => {
    const result = optimizePortfolio({ projects: candidateProjects, capexLimit: portfolio.capex_limit });
    return { ...portfolio, ...result, totalNpv: result.totalEmv };
  };

  const runOptimization = () => {
    if (!activePortfolio) return;
    const candidateProjects = projects.filter(p => selectedProjectIds.has(p.id));
    const result = runSingleOptimization(activePortfolio, candidateProjects);
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
    const results = portfoliosToCompare.map(p => runSingleOptimization(p, projects));
    setComparisonData(results);
    setComparisonOpen(true);
  };

  const formatCurrency = (value, unit = 'MM') => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0) + (unit ? ` ${unit}` : '');

  return (
    <>
      <Helmet>
        <title>Capital Portfolio Studio</title>
        <meta name="description" content="Optimize your capital allocation with advanced portfolio analysis." />
      </Helmet>
      <div className="flex flex-col h-full bg-slate-900 text-white p-4 md:p-8">
        <header className="flex-shrink-0 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/dashboard/economics">
                <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-2 rounded-lg">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl md:text-3xl font-bold">Capital Portfolio Studio</h1>
              </div>
            </div>
            <PortfolioHelpGuide />
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/10 rounded-xl p-6 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Portfolios</h2>
                <Button onClick={() => handleOpenPortfolioDialog()} size="sm" className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
                  <PlusCircle className="w-4 h-4 mr-2" /> Create
                </Button>
              </div>
              <Button onClick={handleRunComparison} disabled={comparisonIds.size < 2} className="w-full mb-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white disabled:opacity-50">
                <BarChart2 className="w-4 h-4 mr-2" /> Compare ({comparisonIds.size})
              </Button>
              <div className="space-y-2 overflow-y-auto">
                {loading ? (
                  <p className="text-center text-slate-400">Loading portfolios...</p>
                ) : portfolios.length === 0 ? (
                  <div className="text-center text-slate-400 py-16">
                    <p>No portfolios yet. Create your first scenario!</p>
                  </div>
                ) : (
                  portfolios.map(p => (
                    <div key={p.id}
                      className={`p-3 rounded-lg transition-all border-2 ${activePortfolio?.id === p.id ? 'bg-blue-500/30 border-blue-400' : 'border-transparent hover:bg-white/10'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3 flex-grow cursor-pointer" onClick={() => setActivePortfolio(p)}>
                          <Checkbox id={`compare-${p.id}`} checked={comparisonIds.has(p.id)} onCheckedChange={() => handleComparisonSelection(p.id)} onClick={(e) => e.stopPropagation()} />
                          <div>
                            <p className="font-semibold text-white">{p.name}</p>
                            <p className="text-sm text-slate-300">Limit: <span className="text-amber-300">{formatCurrency(p.capex_limit)}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenPortfolioDialog(p); }} className="text-blue-400 hover:text-blue-300 h-7 w-7"><Edit className="w-4 h-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="text-red-500 hover:text-red-400 h-7 w-7"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                            <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
                              <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription className="text-slate-400">This will permanently delete the portfolio "{p.name}".</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeletePortfolio(p.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-full bg-white/5 border border-white/10 rounded-xl">
                <div className="text-center">
                  <Package className="mx-auto h-12 w-12 text-slate-500" />
                  <h3 className="mt-2 text-lg font-medium text-white">Select a portfolio</h3>
                  <p className="mt-1 text-slate-400">Choose a portfolio from the list or create a new one to start.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <Card className="bg-white/5 border-white/10 text-white">
                  <CardHeader>
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <CardTitle className="text-2xl">{activePortfolio.name} - Workbench</CardTitle>
                      <div className="flex gap-2">
                        <Button onClick={() => handleOpenProjectDialog()} variant="outline" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                          <PlusCircle className="w-4 h-4 mr-2" /> Add Project
                        </Button>
                        <Button onClick={runOptimization} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                          <Zap className="w-4 h-4 mr-2" /> Run Optimization
                        </Button>
                      </div>
                    </div>
                    <p className="text-slate-300">Select projects to include. The optimizer maximizes risked EMV under the CAPEX limit: <span className="font-bold text-amber-300">{formatCurrency(activePortfolio.capex_limit)}</span></p>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-64 overflow-y-auto pr-2">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-white/20 hover:bg-transparent">
                            <TableHead className="w-[50px]"><Checkbox checked={selectedProjectIds.size === projects.length && projects.length > 0} onCheckedChange={(checked) => setSelectedProjectIds(checked ? new Set(projects.map(p => p.id)) : new Set())} /></TableHead>
                            <TableHead className="text-white">Project</TableHead>
                            <TableHead className="text-white text-right">CAPEX</TableHead>
                            <TableHead className="text-white text-right">NPV P50</TableHead>
                            <TableHead className="text-white text-right">POS</TableHead>
                            <TableHead className="text-white text-right">Risked EMV</TableHead>
                            <TableHead className="w-[70px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {projects.map(p => (
                            <TableRow key={p.id} className="border-b-white/10">
                              <TableCell><Checkbox checked={selectedProjectIds.has(p.id)} onCheckedChange={() => handleProjectSelectionChange(p.id)} /></TableCell>
                              <TableCell className="font-medium">
                                {p.name}
                                {p.source_type === 'epe_mc' && (
                                  <span className="ml-2 text-[10px] text-emerald-300 bg-emerald-900/30 border border-emerald-500/30 rounded px-1.5 py-0.5" title={p.source_label || 'Linked EPE Monte Carlo run'}>EPE MC</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-amber-300">{formatCurrency(p.capex)}</TableCell>
                              <TableCell className="text-right text-slate-200">{formatCurrency(p.npv_p50)}</TableCell>
                              <TableCell className="text-right text-slate-300">{Math.round((p.pos ?? 1) * 100)}%</TableCell>
                              <TableCell className="text-right text-lime-300">{formatCurrency(projectEmv(p))}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenProjectDialog(p)} className="text-blue-400 hover:text-blue-300 h-7 w-7"><Edit className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteProject(p.id)} className="text-red-500 hover:text-red-400 h-7 w-7"><Trash2 className="w-4 h-4" /></Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {projects.length === 0 && (
                            <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-6">No projects yet. Use Add Project to create one, typed or linked to an EPE Monte Carlo run.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <OptimizationResults result={optimizationResult} />
              </motion.div>
            )}
          </div>
        </div>
      </div>
      <Dialog open={isProjectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Edit' : 'Add'} Project</DialogTitle>
          </DialogHeader>
          <ProjectForm
            project={editingProject}
            onSave={handleSaveProject}
            onCancel={handleCloseProjectDialog}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={isPortfolioDialogOpen} onOpenChange={setPortfolioDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
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

export default CapitalPortfolioStudio;