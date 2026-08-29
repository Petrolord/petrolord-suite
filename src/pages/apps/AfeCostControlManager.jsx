import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ArrowLeft, PlusCircle, Search, FileText, LayoutDashboard, Table2, Receipt, History, Users, Link2, FileBarChart, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import AFEDashboard from '@/components/afe/AFEDashboard';
import CostBreakdownTab from '@/components/afe/CostBreakdownTab';
import InvoicesTab from '@/components/afe/InvoicesTab';
import BudgetChangesTab from '@/components/afe/BudgetChangesTab';
import AFECreationWizard from '@/components/afe/AFECreationWizard';
import JVPartnerManagement from '@/components/afe/JVPartnerManagement';
import ReportingEngine from '@/components/afe/ReportingEngine';
import IntegrationsTab from '@/components/afe/IntegrationsTab';
import AfeHelpGuide from '@/components/afe/AfeHelpGuide';

const AfeCostControlManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [afes, setAfes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeAfe, setActiveAfe] = useState(null);
  const [costItems, setCostItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('All');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    
    // 1. Fetch AFEs
    const { data: afesData, error: afesError } = await supabase.from('afes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (afesError) toast({ variant: 'destructive', title: 'Error', description: afesError.message });
    else setAfes(afesData || []);

    // 2. Fetch Projects (for linking)
    const { data: projectsData } = await supabase.from('projects').select('id, name').eq('user_id', user.id);
    setProjects(projectsData || []);

    setLoading(false);
  };

  const fetchAfeDetails = async (afeId) => {
    const { data: items } = await supabase.from('afe_cost_items').select('*').eq('afe_id', afeId);
    const { data: invs } = await supabase.from('afe_invoices').select('*').eq('afe_id', afeId);
    const { data: chgs } = await supabase.from('afe_changes').select('*').eq('afe_id', afeId);

    setCostItems(items || []);
    setInvoices(invs || []);
    setChanges(chgs || []);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleSelectAfe = (afe) => {
    setActiveAfe(afe);
    fetchAfeDetails(afe.id);
  };

  const handleRefresh = () => {
    if (activeAfe) fetchAfeDetails(activeAfe.id);
    fetchData(); 
  };

  const filteredAfes = afes.filter(a => 
    (a.afe_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.afe_name.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (filterStatus === 'All' || a.status === filterStatus)
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      <Helmet><title>AFE Manager - Petrolord</title></Helmet>
      
      {/* Header */}
      <header className="flex-shrink-0 p-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard/economics">
              <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-400" />
              AFE & Cost Control
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <AfeHelpGuide />
            <Button onClick={() => setIsWizardOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              <PlusCircle className="w-4 h-4 mr-2" /> New AFE
            </Button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar List */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900 overflow-y-auto hidden md:block">
          <div className="p-4 sticky top-0 bg-slate-900 z-10 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Search AFEs..." 
                className="pl-8 bg-slate-800 border-slate-700"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full border-slate-700 text-slate-400 hover:text-white">
                            <SlidersHorizontal className="w-3 h-3 mr-2" /> Filters
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-60">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-400">Status</Label>
                            <div className="flex flex-col gap-2">
                                {['All', 'Draft', 'Submitted', 'Approved', 'Closed'].map(s => (
                                    <div key={s} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`status-${s}`} 
                                            checked={filterStatus === s}
                                            onCheckedChange={() => setFilterStatus(s)}
                                        />
                                        <Label htmlFor={`status-${s}`}>{s}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
          </div>
          <div className="px-2 space-y-1 pb-4">
            {filteredAfes.map(afe => (
              <div 
                key={afe.id}
                onClick={() => handleSelectAfe(afe)}
                className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                  activeAfe?.id === afe.id ? 'bg-blue-900/20 border-blue-500/50' : 'border-transparent hover:bg-slate-800'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm text-white truncate">{afe.afe_number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${afe.status === 'Approved' ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-400'}`}>{afe.status}</span>
                </div>
                <p className="text-xs text-slate-400 truncate mb-2">{afe.afe_name}</p>
                <p className="text-xs font-mono text-blue-300">${(Number(afe.budget)||0).toLocaleString()}</p>
              </div>
            ))}
            {filteredAfes.length === 0 && <div className="text-center p-4 text-slate-500 text-sm">No AFEs found.</div>}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
          {activeAfe ? (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-white">{activeAfe.afe_number} - {activeAfe.afe_name}</h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Project: {projects.find(p => p.id === activeAfe.project_id)?.name || 'Unlinked'} • Class: {activeAfe.class}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Total Budget</div>
                  <div className="text-xl font-mono font-bold text-blue-400">${(Number(activeAfe.budget)||0).toLocaleString()} {activeAfe.currency}</div>
                </div>
              </div>

              <Tabs defaultValue="dashboard" className="w-full">
                <TabsList className="bg-slate-900 border border-slate-800">
                  <TabsTrigger value="dashboard"><LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard</TabsTrigger>
                  <TabsTrigger value="costs"><Table2 className="w-4 h-4 mr-2" /> Cost Breakdown</TabsTrigger>
                  <TabsTrigger value="invoices"><Receipt className="w-4 h-4 mr-2" /> Invoices</TabsTrigger>
                  <TabsTrigger value="changes"><History className="w-4 h-4 mr-2" /> Changes</TabsTrigger>
                  <TabsTrigger value="partners"><Users className="w-4 h-4 mr-2" /> Partners</TabsTrigger>
                  <TabsTrigger value="reports"><FileBarChart className="w-4 h-4 mr-2" /> Reports</TabsTrigger>
                  <TabsTrigger value="integrations"><Link2 className="w-4 h-4 mr-2" /> Integrations</TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="mt-4">
                  <AFEDashboard afe={activeAfe} costItems={costItems} invoices={invoices} />
                </TabsContent>

                <TabsContent value="costs" className="mt-4">
                  <CostBreakdownTab afeId={activeAfe.id} costItems={costItems} onRefresh={handleRefresh} />
                </TabsContent>

                <TabsContent value="invoices" className="mt-4">
                  <InvoicesTab afeId={activeAfe.id} invoices={invoices} costItems={costItems} onRefresh={handleRefresh} />
                </TabsContent>

                <TabsContent value="changes" className="mt-4">
                  <BudgetChangesTab afeId={activeAfe.id} changes={changes} currentBudget={activeAfe.budget} onRefresh={handleRefresh} />
                </TabsContent>

                <TabsContent value="partners" className="mt-4">
                  <JVPartnerManagement afe={activeAfe} costItems={costItems} />
                </TabsContent>

                <TabsContent value="reports" className="mt-4">
                  <ReportingEngine afe={activeAfe} costItems={costItems} />
                </TabsContent>

                <TabsContent value="integrations" className="mt-4">
                  <IntegrationsTab afe={activeAfe} />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p>Select an AFE from the sidebar or create a new one to get started.</p>
            </div>
          )}
        </main>
      </div>

      <AFECreationWizard 
        open={isWizardOpen} 
        onOpenChange={setIsWizardOpen} 
        projects={projects}
        onSuccess={fetchData}
      />
    </div>
  );
};

export default AfeCostControlManager;