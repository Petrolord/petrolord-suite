import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, GitCompare, CopyCheck as CheckboxIcon, DollarSign, TrendingUp, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const EpeRunComparison = () => {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [availableRuns, setAvailableRuns] = useState([]);
  const [selectedRunIds, setSelectedRunIds] = useState([]);
  const [comparisonResults, setComparisonResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    const fetchRuns = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Authentication Error', description: 'Could not get user.', variant: 'destructive' });
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('epe_runs')
        .select('id, run_name, created_at')
        .eq('case_id', caseId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast({ title: 'Error fetching runs', description: error.message, variant: 'destructive' });
      } else {
        setAvailableRuns(data);
      }
      setLoading(false);
    };
    fetchRuns();
  }, [caseId, toast, navigate]);

  const handleCheckboxChange = (runId) => {
    setSelectedRunIds(prev =>
      prev.includes(runId) ? prev.filter(id => id !== runId) : [...prev, runId]
    );
  };

  const handleCompare = async () => {
    if (selectedRunIds.length < 2) {
      toast({ title: 'Selection Error', description: 'Please select at least two runs to compare.', variant: 'destructive' });
      return;
    }
    setLoadingComparison(true);
    setComparisonResults([]);

    try {
      const fetchedResults = await Promise.all(
        selectedRunIds.map(async (runId) => {
          const { data: runData, error: runError } = await supabase
            .from('epe_runs')
            .select('run_name')
            .eq('id', runId)
            .single();
          if (runError) throw new Error(`Failed to fetch run name for ${runId}: ${runError.message}`);

          const { data: resultData, error: resultError } = await supabase
            .from('epe_results')
            .select('kpis')
            .eq('run_id', runId)
            .single();
          if (resultError) throw new Error(`Failed to fetch results for run ${runId}: ${resultError.message}`);

          return {
            id: runId,
            name: runData.run_name,
            kpis: resultData.kpis,
          };
        })
      );
      setComparisonResults(fetchedResults);
      toast({ title: 'Success', description: 'Runs compared successfully.' });
    } catch (error) {
      console.error('Comparison failed:', error);
      toast({ title: 'Comparison Failed', description: error.message || 'An error occurred during comparison.', variant: 'destructive' });
    } finally {
      setLoadingComparison(false);
    }
  };

  const formatCurrency = (value) => {
    if (typeof value !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(value);
  };

  return (
    <>
      <Helmet><title>Compare Runs - EPE</title></Helmet>
      <div className="p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link to={`/dashboard/apps/economics/epe/cases/${caseId}`}>
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Case Details</Button>
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-3 rounded-xl"><GitCompare className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-4xl font-bold text-white">Compare Economic Runs</h1>
              <p className="text-lime-200 text-lg">Select runs to compare for Case ID: {caseId}</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Available Runs</h2>
          {loading ? (
            <div className="text-center py-8 text-white">Loading runs...</div>
          ) : availableRuns.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No runs available for this case.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableRuns.map(run => (
                <div key={run.id} className="flex items-center space-x-2 bg-gray-800 p-3 rounded-md">
                  <Checkbox
                    id={run.id}
                    checked={selectedRunIds.includes(run.id)}
                    onCheckedChange={() => handleCheckboxChange(run.id)}
                    className="border-slate-500 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                  />
                  <label htmlFor={run.id} className="text-white cursor-pointer flex-grow">
                    {run.run_name} <span className="text-xs text-slate-400">({new Date(run.created_at).toLocaleDateString()})</span>
                  </label>
                </div>
              ))}
            </div>
          )}
          <Button onClick={handleCompare} disabled={selectedRunIds.length < 2 || loadingComparison} className="mt-6 w-full bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600">
            {loadingComparison ? 'Comparing...' : 'Compare Selected Runs'}
          </Button>
        </motion.div>

        {comparisonResults.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Comparison Results</h2>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-white">Metric</TableHead>
                  {comparisonResults.map(run => (
                    <TableHead key={run.id} className="text-white">{run.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-slate-800">
                  <TableCell className="font-medium text-white flex items-center"><DollarSign className="w-4 h-4 mr-2 text-green-400" /> NPV</TableCell>
                  {comparisonResults.map(run => (
                    <TableCell key={run.id} className="text-lime-300">{formatCurrency(run.kpis.npv)}</TableCell>
                  ))}
                </TableRow>
                <TableRow className="border-slate-800">
                  <TableCell className="font-medium text-white flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-blue-400" /> IRR</TableCell>
                  {comparisonResults.map(run => (
                    <TableCell key={run.id} className="text-lime-300">{run.kpis.irr ? `${run.kpis.irr.toFixed(2)}%` : 'N/A'}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-white flex items-center"><Clock className="w-4 h-4 mr-2 text-orange-400" /> Payback</TableCell>
                  {comparisonResults.map(run => (
                    <TableCell key={run.id} className="text-lime-300">{run.kpis.payback}</TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default EpeRunComparison;