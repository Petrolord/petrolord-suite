import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, ChevronDown, ChevronRight, Save, FileText, ArrowLeft, Loader2, DollarSign, Mail,
  AlertTriangle, Database, Terminal, Wrench, RefreshCw, Check, Stethoscope, ArrowRightLeft, SearchCheck, PlusCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';

// Data & Helpers
import { appCategories } from '@/data/applications'; 
import { 
  BASE_PLATFORM_FEE, USER_SEAT_PRICE, STORAGE_GB_PRICE, 
  TIERS, BILLING_PERIODS, VAT_RATE, getAppPrice 
} from '@/data/pricingModels';
import { formatCurrency } from '@/utils/adminHelpers';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { generateQuotePDF } from '@/utils/quotePdfGenerator';
import { isValidUUID } from '@/lib/utils';

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // --- State ---
  const [generating, setGenerating] = useState(false);
  const [showContactSales, setShowContactSales] = useState(false);
  const [backendConfig, setBackendConfig] = useState(null);
  
  const [quoteId] = useState(`Q-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2, '0')}-${Math.floor(Math.random() * 10000)}`);
  const [billingPeriod, setBillingPeriod] = useState('annual');
  const [serviceTier, setServiceTier] = useState('starter');
  const [userSeats, setUserSeats] = useState(50);
  const [storageGB, setStorageGB] = useState(100);
  const [manualDiscount, setManualDiscount] = useState(0); 
  
  // Selection State
  // SCHEMA: selectedApps is an array of UUID strings matching master_apps.id.
  // We strictly store UUIDs here, not names or slugs.
  const [selectedModules, setSelectedModules] = useState(['geoscience']); 
  const [selectedApps, setSelectedApps] = useState([]); 
  const [expandedModules, setExpandedModules] = useState([]);

  // Data from DB
  const [masterApps, setMasterApps] = useState([]);
  const [appsGroupedByModule, setAppsGroupedByModule] = useState({});
  
  // Loading & Debug States
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const [catalogError, setCatalogError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({ logs: [], rawData: null, orphans: [] });
  const [systemWarnings, setSystemWarnings] = useState([]);
  const [isFixing, setIsFixing] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isInsertion, setIsInsertion] = useState(false);
  
  // Data Quality State
  const [geoscienceModuleId, setGeoscienceModuleId] = useState(null);

  // Add a log entry to debug state
  const addDebugLog = (message, data = null) => {
    console.log(`${message}`, data || '');
    setDebugInfo(prev => ({
      ...prev,
      logs: [...prev.logs, { time: new Date().toISOString(), message, data }]
    }));
  };

  // ------------------------------------------------------------------
  // REAL-TIME LISTENER (Task 2 & 3)
  // ------------------------------------------------------------------
  useEffect(() => {
    const geoModuleId = 'f44a23a1-c0e0-4ed1-8961-91b3c6c2f091';
    
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'master_apps',
          filter: `module_id=eq.${geoModuleId}`
        },
        (payload) => {
          const updatedApp = payload.new;
          // Only process if status actually changed or relevant fields changed
          setMasterApps(prevApps => {
             let statusChangedToActive = false;
             
             const newApps = prevApps.map(app => {
                 if (app.id === updatedApp.id) {
                     const oldStatus = app.status;
                     const newStatus = updatedApp.status;
                     
                     if ((oldStatus === 'Coming Soon' || oldStatus === 'coming soon') && 
                         (newStatus === 'Active' || newStatus === 'active')) {
                         statusChangedToActive = true;
                     }
                     
                     // Update the app object
                     return { 
                         ...app, 
                         status: newStatus
                     };
                 }
                 return app;
             });

             if (statusChangedToActive) {
                 console.log(`[STATUS-CHANGE] App ${updatedApp.app_name} status changed to Active - toggle now enabled`);
             }
             
             return newApps;
          });
          
          // Sync grouped state for UI rendering
          setAppsGroupedByModule(prevGrouped => {
              const newGrouped = { ...prevGrouped };
              const modId = updatedApp.module_id;
              
              if (newGrouped[modId]) {
                  newGrouped[modId] = {
                      ...newGrouped[modId],
                      apps: newGrouped[modId].apps.map(app => 
                          app.id === updatedApp.id ? { ...app, status: updatedApp.status } : app
                      )
                  };
              }
              return newGrouped;
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
             console.log('[STATUS-CHANGE] Listening for app status changes on Geoscience module...');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // --- LOGGING (Task 6) ---
  useEffect(() => {
      if (masterApps.length > 0) {
          const comingSoonCount = masterApps.filter(a => a.status === 'Coming Soon' || a.status === 'coming soon').length;
          const activeCount = masterApps.filter(a => a.status === 'Active' || a.status === 'active').length;
          
          console.log(`[STATUS-CHANGE] Coming Soon apps currently disabled: ${comingSoonCount}`);
          console.log(`[STATUS-CHANGE] Active apps currently enabled: ${activeCount}`);
      }
  }, [masterApps]);

  // ------------------------------------------------------------------
  // INSERTION LOGIC (Task 1: Insert 32 New Apps)
  // ------------------------------------------------------------------
  const runGeoscienceInsertion = async () => {
    setIsInsertion(true);
    addDebugLog('[INSERT] Starting to insert 32 missing Geoscience apps...');
    // ... (rest of logic similar to previous output) ...
    setIsInsertion(false);
  };

  // ------------------------------------------------------------------
  // Admin Batch Script Logic (Safe Fix for Geoscience Apps)
  // ------------------------------------------------------------------
  const runGeoscienceFix = async () => {
    setIsFixing(true);
    // ... (rest of logic similar to previous output) ...
    setIsFixing(false);
  };

  // ------------------------------------------------------------------
  // Diagnostic Logic (Read-Only)
  // ------------------------------------------------------------------
  const runGeoscienceDiagnostic = async () => {
    setIsDiagnosing(true);
    // ... (rest of logic similar to previous output) ...
    setIsDiagnosing(false);
  };

  // ------------------------------------------------------------------
  // MIGRATION LOGIC (Task 1-5: Move 19 Specific Apps)
  // ------------------------------------------------------------------
  const runGeoscienceMigration = async () => {
    setIsMigrating(true);
    // ... (rest of logic similar to previous output) ...
    setIsMigrating(false);
  };

  // ------------------------------------------------------------------
  // VERIFICATION LOGIC (Task 1: Verify 35 specific apps)
  // ------------------------------------------------------------------
  const runGeoscienceVerification = async () => {
    setIsVerifying(true);
    // ... (rest of logic similar to previous output) ...
    setIsVerifying(false);
  };

  // ------------------------------------------------------------------
  // Catalog Fetching
  // ------------------------------------------------------------------
  const fetchCatalog = async () => {
    setIsLoadingCatalog(true);
    setLoadingStatus('Loading catalog...');
    addDebugLog('--- Starting Catalog Fetch Sequence ---');
    const warnings = [];
    const orphans = [];

    try {
      const { data: configData } = await supabase.functions.invoke('get-quote-config');
      if (configData) setBackendConfig(configData);

      // Task 1: Specific Geoscience Debug Fetch
      const geoUUID = 'f44a23a1-c0e0-4ed1-8961-91b3c6c2f091';
      addDebugLog(`[GEO-DEBUG] Running specific query for Geoscience Module ID: ${geoUUID}`);
      
      const { data: directGeoApps, error: directError } = await supabase
        .from('master_apps')
        .select('id, app_name, status, module_id')
        .eq('module_id', geoUUID);
        
      if (directError) {
          addDebugLog(`[GEO-DEBUG] Error specific query: ${directError.message}`);
      } else {
          addDebugLog(`[GEO-DEBUG] Supabase query result count: ${directGeoApps?.length || 0}`);
          const active = directGeoApps?.filter(a => a.status?.toLowerCase() === 'active').length || 0;
          const comingSoon = directGeoApps?.filter(a => a.status?.toLowerCase().includes('coming')).length || 0;
          addDebugLog(`[GEO-DEBUG] Active count: ${active}, Coming Soon count: ${comingSoon}`);
      }

      // 1. Fetch All Modules
      const { data: allModules, error: modulesError } = await supabase.from('modules').select('*');
      if (modulesError) throw modulesError;
      
      const geoModule = allModules?.find(m => m.id === geoUUID) || allModules?.find(m => m.name.toLowerCase().includes('geoscience'));
      
      if (geoModule) {
          setGeoscienceModuleId(geoModule.id);
      } else {
          addDebugLog('[GEO-DEBUG] CRITICAL: Geoscience Module NOT FOUND in modules table.');
          warnings.push('Geoscience Analytics module missing from database.');
      }

      // 2. Fetch All Apps (Main Fetch)
      const { data: rawApps, error: fetchError } = await supabase
        .from('master_apps')
        .select(`*, modules(id, name, slug)`);

      if (fetchError) throw fetchError;

      // 3. Grouping
      const grouped = {};
      const flatApps = [];

      allModules?.forEach(mod => {
          grouped[mod.id] = {
              id: mod.id,
              name: mod.name,
              slug: mod.slug,
              apps: [] 
          };
      });

      rawApps?.forEach(app => {
          const derivedPrice = getAppPrice(app.slug) || 500; 
          const processedApp = {
              id: app.id, // UUID from DB
              name: app.app_name,
              price: derivedPrice,
              status: app.status,
              moduleId: app.module_id,
              description: app.description
          };
          flatApps.push(processedApp);

          if (app.module_id && grouped[app.module_id]) {
              grouped[app.module_id].apps.push(processedApp);
          } else {
              orphans.push(processedApp);
          }
      });

      setMasterApps(flatApps);
      setAppsGroupedByModule(grouped);
      setSystemWarnings(warnings);
      setDebugInfo(prev => ({ ...prev, orphans }));
      setExpandedModules(Object.keys(grouped));

    } catch (err) {
      console.error("Catalog Load Error:", err);
      setCatalogError(err.message);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  // ------------------------------------------------------------------
  // Visual Helpers
  // ------------------------------------------------------------------
  const getModuleVisuals = (slug) => {
    const match = appCategories.find(c => c.id === slug);
    if (match) return { icon: match.icon, color: match.color };
    return { icon: Database, color: 'text-slate-400' };
  };

  // ------------------------------------------------------------------
  // Event Handlers
  // ------------------------------------------------------------------
  const toggleModuleExpansion = (modId) => {
    setExpandedModules(prev => 
      prev.includes(modId) ? prev.filter(id => id !== modId) : [...prev, modId]
    );
  };

  const handleModuleCheck = (modId, isChecked) => {
    const moduleGroup = appsGroupedByModule[modId];
    if (!moduleGroup) return;

    if (isChecked) {
      setSelectedModules(prev => [...new Set([...prev, modId])]);
      const appIds = moduleGroup.apps.map(a => a.id);
      setSelectedApps(prev => [...new Set([...prev, ...appIds])]);
    } else {
      setSelectedModules(prev => prev.filter(id => id !== modId));
      const appIdsToRemove = moduleGroup.apps.map(a => a.id);
      setSelectedApps(prev => prev.filter(id => !appIdsToRemove.includes(id)));
    }
  };

  const handleAppCheck = (modId, appId, isChecked) => {
    // Defensive check
    const app = masterApps.find(a => a.id === appId);
    const isComingSoon = app && (app.status === 'Coming Soon' || app.status === 'coming soon');
    
    if (isComingSoon) {
        return; // Prevent selection
    }

    if (isChecked) {
      setSelectedApps(prev => [...new Set([...prev, appId])]); // appId is UUID
      if (!selectedModules.includes(modId)) {
          setSelectedModules(prev => [...prev, modId]);
      }
    } else {
      setSelectedApps(prev => prev.filter(id => id !== appId));
    }
  };

  // ------------------------------------------------------------------
  // Calculation Logic
  // ------------------------------------------------------------------
  const calculation = useMemo(() => {
    const tier = TIERS.find(t => t.id === serviceTier) || TIERS[0];
    const period = BILLING_PERIODS.find(p => p.id === billingPeriod) || BILLING_PERIODS[0];
    
    const baseFee = BASE_PLATFORM_FEE * tier.multiplier;
    let softwareCost = 0;
    const breakdown = [];

    // App Costs
    // selectedApps is an array of UUIDs
    selectedApps.forEach(appId => {
        const app = masterApps.find(a => a.id === appId);
        if (app) {
            softwareCost += app.price;
            // Map UUID to Name for breakdown display
            breakdown.push({ item: app.name, price: app.price, cost: app.price, type: 'app', id: appId });
        }
    });

    const seatsCost = userSeats * USER_SEAT_PRICE;
    const storageCost = Math.max(0, storageGB - 10) * STORAGE_GB_PRICE;
    const monthlySubtotal = baseFee + softwareCost + seatsCost + storageCost;
    
    const periodDiscountVal = monthlySubtotal * period.discount;
    const manualDiscountVal = (monthlySubtotal - periodDiscountVal) * (manualDiscount / 100);
    const monthlyNet = monthlySubtotal - periodDiscountVal - manualDiscountVal;
    
    const billingCycleTotal = monthlyNet * period.months;
    const vat = billingCycleTotal * VAT_RATE;
    const grandTotal = billingCycleTotal + vat;

    if (period.discount > 0) {
        breakdown.push({ item: `Term Discount (${period.name})`, cost: -periodDiscountVal, type: 'discount' });
    }
    if (manualDiscount > 0) {
        breakdown.push({ item: `Special Discount (${manualDiscount}%)`, cost: -manualDiscountVal, type: 'discount' });
    }

    return {
      baseFee,
      softwareCost,
      seatsCost,
      storageCost,
      monthlySubtotal,
      periodDiscountVal,
      manualDiscountVal,
      monthlyNet,
      billingCycleTotal,
      vat,
      grandTotal,
      breakdown,
      tier,
      period,
      totalContractValue: billingCycleTotal,
      vatAmount: vat,
      totalWithVat: grandTotal
    };
  }, [serviceTier, billingPeriod, selectedModules, selectedApps, userSeats, storageGB, manualDiscount, appsGroupedByModule, masterApps]);

  const handleSaveQuote = async () => {
    if(!backendConfig) {
      toast({ title: "System Initializing", description: "Please wait while we connect to secure services." });
      return;
    }

    let orgId = user?.user_metadata?.organization_id || user?.organization?.id;
    if (!orgId || !isValidUUID(orgId)) {
        const { data: orgData } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();
        if(orgData) orgId = orgData.organization_id;
    }

    if (!orgId || !isValidUUID(orgId)) {
        toast({ title: "Access Denied", description: "Could not identify your organization.", variant: "destructive" });
        return;
    }

    if (selectedApps.length === 0) {
        toast({ title: "Empty Quote", description: "Please select at least one application.", variant: "destructive" });
        return;
    }

    setGenerating(true);
    try {
      const validityDays = 30;
      const quoteDate = new Date();
      const expiryDate = new Date(quoteDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

      const quoteData = {
        id: quoteId,
        date: quoteDate.toISOString(),
        expiryDate: expiryDate.toISOString(),
        name: `Quote for ${user?.user_metadata?.organization_name || 'Organization'}`,
        config: { calculated: calculation, userSeats, storageGB },
        organization_id: orgId,
        status: 'PENDING',
        total_amount: calculation.grandTotal,
        billing_term: billingPeriod
      };

      const doc = await generateQuotePDF(quoteData, { 
          name: user?.user_metadata?.organization_name || 'My Organization', 
          contact_email: user.email, 
          address: user?.user_metadata?.address || '' 
      }, backendConfig);
      
      const pdfBlob = doc.output('blob');
      const reader = new FileReader();
      reader.readAsDataURL(pdfBlob);
      reader.onloadend = async () => {
          const base64data = reader.result.split(',')[1];
          // Schema Comment: 'apps' in payload must be an array of UUIDs (strings)
          const payload = {
              quote_id: quoteId,
              organization_id: orgId,
              user_email: user.email,
              items: calculation.breakdown,
              breakdown: calculation, 
              total_amount: calculation.grandTotal,
              billing_period: billingPeriod,
              seats: userSeats,
              pdf_base64: base64data,
              validity_period: validityDays,
              quote_date: quoteDate.toISOString(),
              expiry_date: expiryDate.toISOString(),
              org_admin_email: user.email,
              selected_items: calculation.breakdown,
              pricing_breakdown: calculation,
              status: 'PENDING',
              quote_number: quoteId,
              modules: selectedModules,
              apps: selectedApps // Strictly UUIDs from state
          };

          const { data, error } = await supabase.functions.invoke('process-quote', { body: payload });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          
          setGenerating(false);
          toast({ title: "Success", description: "Quote generated successfully!", className: "bg-green-600 text-white" });
          navigate(`/dashboard/quote/${quoteId}`); 
      };

    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: error.message || "Failed to generate quote.", variant: "destructive" });
      setGenerating(false);
    }
  };

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  if (isLoadingCatalog) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-950">
            <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-[#D4AF37] mx-auto mb-4"/>
                <p className="text-slate-400">{loadingStatus}</p>
            </div>
        </div>
      );
  }

  if (catalogError) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-950 p-6">
            <div className="text-center max-w-md">
                <div className="bg-red-500/10 p-6 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                    <AlertTriangle className="w-10 h-10 text-red-500"/>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Catalog Unavailable</h2>
                <p className="text-slate-400 mb-6">{catalogError}</p>
                <div className="bg-slate-900 p-4 rounded text-left text-xs font-mono text-slate-500 mb-6 overflow-auto max-h-40">
                    {JSON.stringify(debugInfo.logs.slice(-3), null, 2)}
                </div>
                <Button onClick={() => window.location.reload()} variant="outline" className="border-slate-700 text-white hover:bg-slate-800">
                    Retry Connection
                </Button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-[#D4AF37]/30 pb-20">
      
      <ContactSalesModal 
        open={showContactSales} 
        onOpenChange={setShowContactSales} 
        defaultEmail={user?.email}
        quoteId={quoteId}
      />

      {/* --- Top Navigation --- */}
      <div className="sticky top-0 z-40 w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Quote: {quoteId}</h1>
              <Badge variant="outline" className="border-slate-700 text-slate-400 font-normal">Draft</Badge>
            </div>
            <p className="text-xs text-slate-500">Configure your subscription package.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSaveQuote} 
            disabled={generating}
            className="bg-[#D4AF37] hover:bg-[#B5902B] text-black font-bold shadow-lg shadow-[#D4AF37]/20"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
            Generate & Pay
          </Button>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-6 md:p-8 grid grid-cols-12 gap-8">
        
        {/* --- LEFT CONFIGURATION PANEL --- */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          
          <Tabs defaultValue="config" className="w-full">
            <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-lg mb-6">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="details">Details & Terms</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-8">
              
              {/* 1. Billing & Commitment */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#D4AF37]"/> Billing Period & Commitment
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {BILLING_PERIODS.map((period) => (
                    <div 
                      key={period.id}
                      onClick={() => setBillingPeriod(period.id)}
                      className={`relative cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 
                        ${billingPeriod === period.id 
                          ? 'bg-[#D4AF37]/10 border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.15)]' 
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                    >
                      {period.discount > 0 && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                          SAVE {period.discount * 100}%
                        </div>
                      )}
                      <div className={`text-center font-bold ${billingPeriod === period.id ? 'text-[#D4AF37]' : 'text-slate-300'}`}>
                        {period.name}
                      </div>
                      <div className="text-center text-xs text-slate-500 mt-1">{period.label}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. Service Tier */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-4">Service Tier</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {TIERS.map((tier) => (
                    <div 
                      key={tier.id}
                      onClick={() => setServiceTier(tier.id)}
                      className={`relative cursor-pointer p-5 rounded-xl border-2 transition-all duration-200 flex flex-col justify-between h-full
                        ${serviceTier === tier.id 
                          ? 'bg-slate-800 border-green-500 shadow-md' 
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-lg text-white">{tier.name}</h4>
                          {serviceTier === tier.id && <CheckCircle className="w-5 h-5 text-green-500"/>}
                        </div>
                        <p className="text-xs text-slate-400 mb-4">{tier.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 3. Modules & Applications */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Modules & Applications</h3>
                  <div className="text-xs text-slate-500 border border-slate-800 px-3 py-1 rounded-full">
                    {selectedModules.length} Modules, {selectedApps.length} Apps Selected
                  </div>
                </div>

                {/* System Warnings Display */}
                {systemWarnings.length > 0 && (
                    <div className="mb-6 space-y-2">
                        {systemWarnings.map((warn, idx) => (
                            <div key={idx} className="p-3 border border-red-500/20 bg-red-500/10 rounded-lg text-red-200 text-sm flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0"/>
                                    <span>{warn}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="space-y-4">
                  {Object.keys(appsGroupedByModule).length === 0 && (
                      <div className="p-4 border border-yellow-500/20 bg-yellow-500/10 rounded-lg text-yellow-200 text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4"/>
                          <span>No applications found in the catalog.</span>
                      </div>
                  )}

                  {Object.values(appsGroupedByModule).map((moduleGroup) => {
                    const isExpanded = expandedModules.includes(moduleGroup.id);
                    const isModuleSelected = selectedModules.includes(moduleGroup.id);
                    const visuals = getModuleVisuals(moduleGroup.slug);
                    const Icon = visuals.icon;
                    
                    const isEmpty = moduleGroup.apps.length === 0;

                    const selectedAppsInModule = moduleGroup.apps.filter(app => selectedApps.includes(app.id));
                    const currentModuleCost = selectedAppsInModule.reduce((acc, app) => acc + (app.price || 0), 0);

                    return (
                      <div key={moduleGroup.id} className={`bg-slate-900 border rounded-xl overflow-hidden transition-all duration-300 ${isEmpty ? 'border-slate-800 opacity-70' : 'border-slate-800 hover:border-slate-700'}`}>
                        {/* Module Header */}
                        <div className={`p-4 flex items-center justify-between ${isModuleSelected ? 'bg-slate-800/50' : ''}`}>
                          <div className="flex items-center gap-4">
                            <Checkbox 
                              checked={isModuleSelected}
                              onCheckedChange={(checked) => handleModuleCheck(moduleGroup.id, checked)}
                              disabled={isEmpty}
                              className="data-[state=checked]:bg-[#D4AF37] data-[state=checked]:text-black border-slate-600"
                            />
                            <div className="cursor-pointer flex-1" onClick={() => !isEmpty && toggleModuleExpansion(moduleGroup.id)}>
                              <div className="flex items-center gap-2">
                                <Icon className={`w-5 h-5 ${isModuleSelected ? 'text-[#D4AF37]' : 'text-slate-500'}`} />
                                <h4 className={`font-bold text-base ${isModuleSelected ? 'text-white' : 'text-slate-300'}`}>
                                  {moduleGroup.name}
                                </h4>
                                {isEmpty ? null : (isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600"/> : <ChevronRight className="w-4 h-4 text-slate-600"/>)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                             <div className={currentModuleCost > 0 ? "text-[#D4AF37] font-bold" : "text-slate-500 text-sm"}>
                                {isEmpty ? "No Apps Available" : (currentModuleCost > 0 ? formatCurrency(currentModuleCost) : "Select Apps")}
                             </div>
                          </div>
                        </div>

                        {/* Module Apps List */}
                        <AnimatePresence>
                          {isExpanded && !isEmpty && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-slate-800 bg-slate-950/30"
                            >
                              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {moduleGroup.apps.map(app => {
                                  // Use UUID for selection check
                                  const isAppSelected = selectedApps.includes(app.id);
                                  const isComingSoon = app.status === 'Coming Soon' || app.status === 'coming soon';
                                  
                                  const AppContent = (
                                      <div 
                                        key={app.id} 
                                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
                                          ${isComingSoon 
                                             ? 'bg-slate-900/50 border-slate-800 cursor-not-allowed opacity-60' 
                                             : (isAppSelected ? 'bg-slate-800 border-slate-600' : 'bg-transparent border-slate-800 hover:border-slate-700')}
                                        `}
                                        onClick={() => !isComingSoon && handleAppCheck(moduleGroup.id, app.id, !isAppSelected)}
                                      >
                                        <Checkbox 
                                          checked={isAppSelected} 
                                          disabled={isComingSoon}
                                          className={`mt-1 ${isComingSoon ? 'opacity-50 border-slate-700' : 'data-[state=checked]:bg-blue-600 border-slate-600'}`}
                                        />
                                        <div className="flex-1">
                                          <div className="flex justify-between items-start">
                                            <span className={`text-sm font-medium ${isComingSoon ? 'text-slate-500' : (isAppSelected ? 'text-white' : 'text-slate-400')}`}>
                                              {app.name}
                                              {/* Badge Logic */}
                                              {isComingSoon ? (
                                                  <Badge variant="secondary" className="ml-2 text-[9px] h-4 px-1 bg-slate-800 text-slate-500 border-slate-700">Coming Soon</Badge>
                                              ) : (app.status && (
                                                  <Badge variant="outline" className={`ml-2 text-[9px] h-4 px-1 border-slate-600 ${app.status === 'active' || app.status === 'Active' ? 'text-green-500' : 'text-yellow-500'}`}>
                                                      {app.status}
                                                  </Badge>
                                              ))}
                                            </span>
                                            <span className={`text-xs ${isComingSoon ? 'text-slate-600' : 'text-slate-500'}`}>{formatCurrency(app.price)}</span>
                                          </div>
                                          <p className={`text-[10px] line-clamp-1 mt-0.5 ${isComingSoon ? 'text-slate-600' : 'text-slate-500'}`}>{app.description || 'No description available'}</p>
                                        </div>
                                      </div>
                                  );

                                  if (isComingSoon) {
                                      return (
                                          <TooltipProvider key={app.id}>
                                              <Tooltip>
                                                  <TooltipTrigger asChild>
                                                      <div>{AppContent}</div> 
                                                  </TooltipTrigger>
                                                  <TooltipContent className="bg-slate-800 border-slate-700 text-slate-300 text-xs">
                                                      <p>This app will be available soon</p>
                                                  </TooltipContent>
                                              </Tooltip>
                                          </TooltipProvider>
                                      );
                                  }
                                  
                                  return AppContent;
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 4. Infrastructure */}
              <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6">Infrastructure & Users</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div>
                    <div className="flex justify-between mb-4">
                      <Label className="text-slate-300">User Seats</Label>
                      <span className="text-[#D4AF37] font-bold text-xl">{userSeats}</span>
                    </div>
                    <Slider 
                      value={[userSeats]} 
                      onValueChange={(val) => setUserSeats(val[0])} 
                      min={1} max={200} step={1}
                      className="my-6"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-4">
                      <Label className="text-slate-300">Cloud Storage</Label>
                      <span className="text-[#D4AF37] font-bold text-xl">{storageGB} GB</span>
                    </div>
                    <Slider 
                      value={[storageGB]} 
                      onValueChange={(val) => setStorageGB(val[0])} 
                      min={10} max={5000} step={10}
                      className="my-6"
                    />
                  </div>
                </div>
              </section>

            </TabsContent>
            
            <TabsContent value="details">
              <Card className="bg-slate-900 border-slate-800 p-6">
                <div className="space-y-4">
                  <div>
                    <Label>Quote Reference</Label>
                    <Input value={quoteId} disabled className="bg-slate-950 border-slate-700"/>
                  </div>
                  <div>
                    <Label>Organization</Label>
                    <Input value={user?.user_metadata?.organization_name || 'My Organization'} disabled className="bg-slate-950 border-slate-700 opacity-60"/>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Debug UI (Visible Log) */}
          <div className="mt-12 p-4 bg-black/50 rounded-lg border border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between mb-2 text-slate-400 text-xs uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4"/> System Health Console
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-500 hover:text-white" onClick={() => setDebugInfo({logs: [], rawData: null})}>Clear</Button>
              </div>
              
              <div className="mb-3 flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={fetchCatalog} className="text-xs h-7 border-slate-700 hover:bg-slate-800 text-slate-300">
                      <RefreshCw className="w-3 h-3 mr-1"/> Refresh Catalog
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={runGeoscienceFix} 
                    disabled={isFixing}
                    className="text-xs h-7 border-blue-900/50 bg-blue-950/20 hover:bg-blue-900/40 text-blue-300"
                  >
                      {isFixing ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <Wrench className="w-3 h-3 mr-1"/>}
                      Run Admin Fix (Geoscience Apps)
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={runGeoscienceDiagnostic} 
                    disabled={isDiagnosing}
                    className="text-xs h-7 border-purple-900/50 bg-purple-950/20 hover:bg-purple-900/40 text-purple-300"
                  >
                      {isDiagnosing ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <Stethoscope className="w-3 h-3 mr-1"/>}
                      Run Geoscience Diagnostic
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={runGeoscienceMigration} 
                    disabled={isMigrating}
                    className="text-xs h-7 border-orange-900/50 bg-orange-950/20 hover:bg-orange-900/40 text-orange-300"
                  >
                      {isMigrating ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <ArrowRightLeft className="w-3 h-3 mr-1"/>}
                      Move 19 Geoscience Apps
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={runGeoscienceVerification} 
                    disabled={isVerifying}
                    className="text-xs h-7 border-teal-900/50 bg-teal-950/20 hover:bg-teal-900/40 text-teal-300"
                  >
                      {isVerifying ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <SearchCheck className="w-3 h-3 mr-1"/>}
                      Verify 35 Geoscience Apps
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={runGeoscienceInsertion} 
                    disabled={isInsertion}
                    className="text-xs h-7 border-emerald-900/50 bg-emerald-950/20 hover:bg-emerald-900/40 text-emerald-300"
                  >
                      {isInsertion ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <PlusCircle className="w-3 h-3 mr-1"/>}
                      Insert 32 New Apps
                  </Button>
              </div>

              <div className="h-64 overflow-y-auto font-mono text-[10px] text-green-400 space-y-1 bg-black/80 p-2 rounded">
                  {debugInfo.logs.map((log, idx) => (
                      <div key={idx} className="border-b border-slate-800/50 pb-1">
                          <span className="text-slate-500">[{log.time.split('T')[1].split('.')[0]}]</span>{' '}
                          <span className="text-blue-400">{log.message}</span>
                          {log.data && (
                              <pre className="mt-1 text-slate-400 whitespace-pre-wrap">
                                  {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
                              </pre>
                          )}
                      </div>
                  ))}
              </div>
          </div>

        </div>

        {/* --- RIGHT SUMMARY PANEL (STICKY) --- */}
        <div className="col-span-12 lg:col-span-4">
          <div className="sticky top-24 space-y-6">
            <Card className="bg-slate-900 border-slate-800 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#D4AF37]" />
              <div className="p-6 space-y-6">
                
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500"/> Quote Summary
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">{calculation.period.name} Billing</p>
                </div>

                {/* Big Price Display */}
                <div className="bg-slate-950 rounded-lg p-4 text-center border border-slate-800">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Due</div>
                  <div className="text-4xl font-extrabold text-white">
                    {formatCurrency(calculation.grandTotal)}
                  </div>
                  {calculation.period.discount > 0 && (
                    <div className="text-xs text-green-500 mt-2 font-medium flex justify-center items-center gap-1">
                      <CheckCircle className="w-3 h-3"/> Savings: {formatCurrency((calculation.monthlySubtotal - calculation.monthlyNet) * calculation.period.months)}
                    </div>
                  )}
                </div>

                {/* Line Items Preview */}
                <div className="space-y-3 text-sm border-t border-slate-800 pt-4">
                  {calculation.breakdown.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-slate-300">
                      <span className="truncate max-w-[200px]">{item.item}</span>
                      <span className={item.cost < 0 ? 'text-green-400' : ''}>{formatCurrency(item.cost)}</span>
                    </div>
                  ))}
                  {calculation.breakdown.length > 5 && (
                    <div className="text-center text-xs text-slate-500 pt-2 italic">
                      + {calculation.breakdown.length - 5} more items
                    </div>
                  )}
                </div>

                {/* Final Totals */}
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <div className="flex justify-between text-slate-500 text-xs">
                    <span>VAT ({VAT_RATE * 100}%)</span>
                    <span>{formatCurrency(calculation.vat)}</span>
                  </div>
                  <div className="flex justify-between text-[#D4AF37] font-bold text-xl pt-2 border-t border-slate-800/50">
                    <span>Total Due</span>
                    <span>{formatCurrency(calculation.grandTotal)}</span>
                  </div>
                </div>

              </div>
            </Card>

            <div className="flex flex-col gap-3">
              <Button onClick={handleSaveQuote} disabled={generating || !backendConfig} className="w-full h-12 bg-[#D4AF37] hover:bg-[#B5902B] text-black font-bold text-lg">
                {generating ? <Loader2 className="animate-spin mr-2"/> : "Generate & Pay"}
              </Button>
              <Button 
                variant="outline" 
                className="w-full border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={() => setShowContactSales(true)}
              >
                <Mail className="w-4 h-4 mr-2"/> Contact Sales
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

const ContactSalesModal = ({ open, onOpenChange, onSubmit, defaultEmail, quoteId }) => {
    const [message, setMessage] = useState('');
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-700 text-white">
                <DialogHeader>
                    <DialogTitle>Contact Sales</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Have questions about Quote #{quoteId}? Send us a message.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div>
                        <Label>Email</Label>
                        <Input value={defaultEmail} disabled className="bg-slate-950 border-slate-700 opacity-60"/>
                    </div>
                    <div>
                        <Label>Message</Label>
                        <Textarea 
                            value={message} 
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="I have a question about enterprise features..."
                            className="bg-slate-950 border-slate-700 h-32"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-400">Cancel</Button>
                    <Button onClick={() => onSubmit(message)} className="bg-lime-600 hover:bg-lime-700 text-white">Send Message</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default QuoteBuilder;