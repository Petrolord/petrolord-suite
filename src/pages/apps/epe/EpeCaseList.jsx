import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Briefcase, Plus, ChevronRight, ArrowLeft, HelpCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
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

    const { data, error } = await supabase
      .from('epe_cases')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error fetching cases', description: error.message, variant: 'destructive' });
    } else {
      setCases(data);
    }
    setLoading(false);
  };

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

  return (
    <>
      <Helmet>
        <title>EPE Cases - Petrolord Suite</title>
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
                <h1 className="text-4xl font-bold text-white">Enterprise Petroleum Economics</h1>
                <p className="text-lime-200 text-lg">Case Management</p>
              </div>
            </div>
            <Button onClick={() => setIsNewCaseDialogOpen(true)} className="bg-gradient-to-r from-green-600 to-lime-600 hover:from-green-700 hover:to-lime-700">
              <Plus className="w-4 h-4 mr-2" /> New Case
            </Button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6">
          {loading ? (
            <div className="text-center py-16 text-white">Loading cases...</div>
          ) : cases.length === 0 ? (
            <div className="text-center py-16">
              <h3 className="text-xl font-semibold text-white">No Cases Found</h3>
              <p className="text-lime-300 mt-2">Get started by creating a new economic case.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cases.map((c) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  className="bg-white/5 p-4 rounded-lg flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => navigate(`/dashboard/apps/economics/epe/cases/${c.id}`)}
                >
                  <div>
                    <h4 className="font-semibold text-white">{c.case_name}</h4>
                    <p className="text-sm text-slate-400">{c.description || 'No description'}</p>
                    <p className="text-xs text-slate-500 mt-1">Created: {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </motion.div>
              ))}
            </div>
          )}
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