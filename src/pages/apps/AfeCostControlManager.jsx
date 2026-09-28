import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { PlusCircle, Search, FileText, LayoutDashboard, Table2, Receipt, History, Users, Link2, FileBarChart, SlidersHorizontal } from 'lucide-react';
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
import { FullPrecisionProvider, FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';
import { AppHeader } from '@/components/ui/app-shell';

const AfeCostControlManagerInner = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [afes, setAfes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeAfe, setActiveAfe] = useState(null);
  const [costItems, setCostItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [changes, setChanges] = useState([]);
  // EC5-0: the AFE's saved partners, so the summary PDF bills from real rows.
  const [partners, setPartners] = useState([]);
  const [partnersError, setPartnersError] = useState(null);
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
    await fetchPartners(afeId);
  };

  const fetchPartners = async (afeId) => {
    const { data, error } = await supabase
      .from('afe_partners')
      .select('*')
      .eq('afe_id', afeId)
      .order('created_at', { ascending: true });
    setPartners(error ? [] : (data || []));
    setPartnersError(error ? error.message : null);
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
    ((a.afe_number || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (a.afe_name || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
    (filterStatus === 'All' || a.status === filterStatus)
  );

  return (
    <div className="flex min-h-screen flex-col text-pl-text">
      <Helmet><title>AFE Manager - Petrolord</title></Helmet>

      <AppHeader
        title="AFE & Cost Control"
        eyebrow="Economics"
        subtitle="Budgets, commitments, invoices and partner billing"
        icon={FileText}
        backTo="/dashboard/economics"
        actions={(
          <>
            <FullPrecisionToggle app="afe-cost-control" />
            <AfeHelpGuide />
            <Button size="sm" onClick={() => setIsWizardOpen(true)}>
              <PlusCircle className="w-4 h-4 mr-2" /> New AFE
            </Button>
          </>
        )}
      />

      {/* Main Layout */}
      <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
        {/* Sidebar List */}
        <aside className="max-h-80 w-full shrink-0 overflow-y-auto border-b border-pl-border bg-pl-surface md:max-h-none md:w-80 md:border-b-0 md:border-r">
          <div className="p-4 sticky top-0 bg-pl-surface z-10 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" />
              <Input 
                placeholder="Search AFEs..." 
                className="pl-8"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full">
                            <SlidersHorizontal className="w-3 h-3 mr-2" /> Filters
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-pl-muted">Status</Label>
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
                aria-current={activeAfe?.id === afe.id ? 'true' : undefined}
                className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                  activeAfe?.id === afe.id ? 'bg-pl-primary/10 border-pl-primary' : 'border-transparent hover:bg-pl-sunken'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm text-pl-text truncate">{afe.afe_number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${afe.status === 'Approved' ? 'border-pl-success/40 bg-pl-success-bg text-pl-success-text' : 'border-pl-border bg-pl-sunken text-pl-muted'}`}>{afe.status}</span>
                </div>
                <p className="text-xs text-pl-muted truncate mb-2">{afe.afe_name}</p>
                <p className="text-xs font-pl-mono tabular-nums text-pl-text">${(Number(afe.budget)||0).toLocaleString()}</p>
              </div>
            ))}
            {filteredAfes.length === 0 && <div className="text-center p-4 text-pl-muted text-sm">No AFEs found.</div>}
          </div>
        </aside>

        {/* Content Area */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {activeAfe ? (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold text-pl-text">{[activeAfe.afe_number, activeAfe.afe_name].filter(Boolean).join(' - ')}</h2>
                  <p className="text-pl-muted text-sm mt-1">
                    Project: {projects.find(p => p.id === activeAfe.project_id)?.name || 'Unlinked'} {activeAfe.class ? ` • Class: ${activeAfe.class}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-pl-muted">Total Budget</div>
                  <div className="text-xl font-pl-mono tabular-nums font-semibold text-pl-text">${(Number(activeAfe.budget)||0).toLocaleString()} {activeAfe.currency}</div>
                </div>
              </div>

              <Tabs defaultValue="dashboard" className="w-full">
                <TabsList className="h-auto max-w-full flex-wrap justify-start">
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
                  <JVPartnerManagement afe={activeAfe} costItems={costItems} onPartnersChanged={() => fetchPartners(activeAfe.id)} />
                </TabsContent>

                <TabsContent value="reports" className="mt-4">
                  <ReportingEngine afe={activeAfe} costItems={costItems} partners={partners} partnersError={partnersError} />
                </TabsContent>

                <TabsContent value="integrations" className="mt-4">
                  <IntegrationsTab afe={activeAfe} />
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center text-pl-muted">
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

// W3 (D3): the Full precision switch prints CPI and SPI at 6 decimals.
const AfeCostControlManager = () => (
  <div className="min-h-screen" data-testid="afe-theme-scope">
    <FullPrecisionProvider>
      <AfeCostControlManagerInner />
    </FullPrecisionProvider>
  </div>
);

export default AfeCostControlManager;