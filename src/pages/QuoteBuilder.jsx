import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, ChevronDown, ChevronRight, Save, FileText, ArrowLeft, Loader2, DollarSign, Mail,
  AlertTriangle, Database, Users
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
  BASE_PLATFORM_FEE, STORAGE_GB_PRICE,
  TIERS, BILLING_PERIODS, VAT_RATE,
  SEAT_TIERS, ESSENTIALS_SEAT_TIERS, MODULE_PRICING
} from '@/data/pricingModels';
import { priceApp, appSeatCost, isEssentialsApp, modulesCharge, platformFeeWaived } from '@/data/quotePricing';
import { formatCurrency } from '@/utils/adminHelpers';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { generateQuotePDF } from '@/utils/quotePdfGenerator';
import { isValidUUID } from '@/lib/utils';
import { resolveUserOrgId } from '@/lib/orgContext';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { COMPACT_FIELD_THEMED } from '@/components/ui/native-select';
import { AccountScope, accountCallout } from '@/components/account/accountChrome';

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  
  // --- State ---
  const [generating, setGenerating] = useState(false);
  const [showContactSales, setShowContactSales] = useState(false);

  const [quoteId] = useState(`Q-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2, '0')}-${Math.floor(Math.random() * 10000)}`);
  const [billingPeriod, setBillingPeriod] = useState('annual');
  const [serviceTier, setServiceTier] = useState('starter');
  const [appSeats, setAppSeats] = useState({}); // { [appId]: seatCount } — per-app seats
  const [storageGB, setStorageGB] = useState(10); // default to the free allowance; no storage charge until the user opts in
  const [manualDiscount, setManualDiscount] = useState(0);
  // NextGen Expert bridge code (Academy Expert certificates issue a
  // single-use module discount code). Verified live via the
  // verify-bridge-code edge fn; generate-quote re-verifies server-side.
  const [bridgeCode, setBridgeCode] = useState('');
  const [bridgeInfo, setBridgeInfo] = useState(null); // verify payload when status === 'valid'
  const [bridgeChecking, setBridgeChecking] = useState(false);
  const [bridgeError, setBridgeError] = useState(null);
  // Suite promo code (early-adopter discounts). Verified live via the
  // verify-promo-code edge fn; generate-quote re-validates server-side.
  const [promoCode, setPromoCode] = useState('');
  const [promoInfo, setPromoInfo] = useState(null); // verify payload when status === 'valid'
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState(null);
  
  // Selection State
  // SCHEMA: selectedApps is an array of UUID strings matching master_apps.id.
  // We strictly store UUIDs here, not names or slugs.
  // SCHEMA: selectedModules holds module UUIDs whose whole-module licence is
  // being bought (module checkbox). Ticking single apps leaves it alone, so
  // those apps are quoted a la carte. Sent to generate-quote as slugs.
  const [selectedModules, setSelectedModules] = useState([]); 
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
  // Catalog Fetching
  // ------------------------------------------------------------------
  const fetchCatalog = async () => {
    setIsLoadingCatalog(true);
    setLoadingStatus('Loading catalog...');
    addDebugLog('--- Starting Catalog Fetch Sequence ---');
    const warnings = [];
    const orphans = [];

    try {
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
          // The licence price is master_apps.price, the value generate-quote charges.
          const processedApp = {
              id: app.id, // UUID from DB
              slug: app.slug,
              name: app.app_name,
              price: Number(app.price) || 0,
              status: app.status,
              moduleId: app.module_id,
              moduleSlug: app.modules?.slug || null, // matches NextGen bridge suite_module
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
    return { icon: Database, color: 'text-pl-muted' };
  };

  // ------------------------------------------------------------------
  // Event Handlers
  // ------------------------------------------------------------------
  const toggleModuleExpansion = (modId) => {
    setExpandedModules(prev => 
      prev.includes(modId) ? prev.filter(id => id !== modId) : [...prev, modId]
    );
  };

  // Per-app seat helpers.
  const setSeatsFor = (appId, n) => setAppSeats(s => ({ ...s, [appId]: Math.max(1, n) }));
  const getTotalSeats = () => selectedApps.reduce((acc, id) => acc + (appSeats[id] || 1), 0);
  const ensureSeats = (ids) => setAppSeats(s => {
    const next = { ...s };
    ids.forEach(id => { if (!next[id]) next[id] = 1; });
    return next;
  });
  const dropSeats = (ids) => setAppSeats(s => {
    const next = { ...s };
    ids.forEach(id => { delete next[id]; });
    return next;
  });

  const handleModuleCheck = (modId, isChecked) => {
    const moduleGroup = appsGroupedByModule[modId];
    if (!moduleGroup) return;

    if (isChecked) {
      setSelectedModules(prev => [...new Set([...prev, modId])]);
      const appIds = moduleGroup.apps.map(a => a.id);
      setSelectedApps(prev => [...new Set([...prev, ...appIds])]);
      ensureSeats(appIds);
    } else {
      setSelectedModules(prev => prev.filter(id => id !== modId));
      const appIdsToRemove = moduleGroup.apps.map(a => a.id);
      setSelectedApps(prev => prev.filter(id => !appIdsToRemove.includes(id)));
      dropSeats(appIdsToRemove);
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
      ensureSeats([appId]);
    } else {
      setSelectedApps(prev => prev.filter(id => id !== appId));
      dropSeats([appId]);
    }
  };

  // ------------------------------------------------------------------
  // Calculation Logic
  // ------------------------------------------------------------------
  const calculation = useMemo(() => {
    const tier = TIERS.find(t => t.id === serviceTier) || TIERS[0];
    const period = BILLING_PERIODS.find(p => p.id === billingPeriod) || BILLING_PERIODS[0];
    
    // Module licences are bought by slug; every module together is the
    // all-access price. The platform fee is waived with a module licence or
    // an annual term. Mirrors generate-quote (authoritative).
    const moduleSlugs = selectedModules.map(id => appsGroupedByModule[id]?.slug).filter(Boolean);
    const modCharge = modulesCharge(moduleSlugs);
    const feeWaived = platformFeeWaived(moduleSlugs, billingPeriod);
    const baseFee = feeWaived ? 0 : BASE_PLATFORM_FEE * tier.multiplier;
    let softwareCost = modCharge.total;
    let seatsCost = 0;
    const breakdown = [];

    // Every recurring charge is pushed to breakdown as an explicit, labelled line
    // item so the summary panel can reconcile to the total — no hidden fees.
    // 1) Base platform fee (always present, even with no apps selected).
    breakdown.push({
      item: `Base Platform Fee — ${tier.name}`,
      cost: baseFee,
      type: 'base',
      note: feeWaived ? 'Waived with a module licence or an annual term' : (tier.multiplier !== 1 ? `${BASE_PLATFORM_FEE} × ${tier.multiplier} tier` : 'Platform access & support')
    });
    if (modCharge.allAccess) {
      breakdown.push({ item: 'All-access Suite licence', cost: modCharge.total, type: 'module', note: 'Every module, all applications included' });
    } else {
      moduleSlugs.forEach(slug => breakdown.push({ item: `${appsGroupedByModule[selectedModules.find(id => appsGroupedByModule[id]?.slug === slug)]?.name || slug} module`, cost: MODULE_PRICING[slug] || 0, type: 'module', note: 'All applications in the module included' }));
    }
    // A module's share of the module charge (the all-access price spreads
    // across the modules), for module-scoped bridge and promo discounts.
    const modListSum = moduleSlugs.reduce((a, m) => a + (MODULE_PRICING[m] || 0), 0);
    const moduleShare = (slug) => moduleSlugs.includes(slug) && modListSum > 0 ? (MODULE_PRICING[slug] || 0) * modCharge.total / modListSum : 0;
    const quotedSlugs = new Set(selectedApps.map(id => masterApps.find(a => a.id === id)?.slug).filter(Boolean));
    const lineFor = (app) => priceApp(
      { slug: app.slug, moduleSlug: app.moduleSlug, price: app.price, seats: appSeats[app.id] || 1 },
      { moduleSlugs, quotedSlugs },
    );

    // 2) App + per-app seat costs. selectedApps is an array of UUIDs.
    selectedApps.forEach(appId => {
        const app = masterApps.find(a => a.id === appId);
        if (app) {
            const nSeats = appSeats[appId] || 1;
            const line = lineFor(app); // licence 0 when module-covered or included with its host
            softwareCost += line.licence;
            seatsCost += line.seatCost;
            const note = line.includedWith ? `Included with ${masterApps.find(a => a.slug === line.includedWith)?.name || line.includedWith}`
              : line.covered ? 'Included in the module licence' : undefined;
            breakdown.push({ item: `${app.name} — license`, price: app.price, cost: line.licence, type: 'app', id: appId, seats: nSeats, note });
            breakdown.push({ item: `${app.name} — ${nSeats} seat${nSeats === 1 ? '' : 's'}${isEssentialsApp(app.slug) ? ' (Essentials)' : ''}`, cost: line.seatCost, type: 'seats', id: appId, indent: true });
        }
    });

    const totalSeats = getTotalSeats();
    const storageCost = Math.max(0, storageGB - 10) * STORAGE_GB_PRICE;
    // 3) Cloud storage (always shown; first 10 GB free).
    breakdown.push({
      item: `Cloud Storage — ${storageGB} GB`,
      cost: storageCost,
      type: 'storage',
      note: storageGB > 10 ? `${storageGB - 10} GB billable × $${STORAGE_GB_PRICE} (first 10 GB free)` : 'Within free allowance'
    });

    // NextGen Expert bridge: percentage off the certified module's monthly
    // cost (app licenses + their seats). Mirrors generate-quote, which is
    // authoritative and re-verifies the code server-side.
    let bridgeDiscountVal = 0;
    if (bridgeInfo) {
      let bridgeableCost = 0;
      selectedApps.forEach(appId => {
        const app = masterApps.find(a => a.id === appId);
        if (app && String(app.moduleSlug || '').toLowerCase() === String(bridgeInfo.suite_module).toLowerCase()) {
          const line = lineFor(app);
          bridgeableCost += line.licence + line.seatCost;
        }
      });
      bridgeableCost += moduleShare(String(bridgeInfo.suite_module).toLowerCase());
      bridgeDiscountVal = bridgeableCost * (Number(bridgeInfo.discount_pct) / 100);
    }

    // Suite promo: scope 'all' takes the percentage off the whole monthly
    // subtotal (post-bridge); a module scope mirrors the bridge semantics.
    // Mirrors generate-quote, which is authoritative and re-validates.
    let promoDiscountVal = 0;
    if (promoInfo) {
      if (promoInfo.scope === 'all') {
        promoDiscountVal = (baseFee + softwareCost + seatsCost + storageCost - bridgeDiscountVal) * (Number(promoInfo.percent) / 100);
      } else {
        let promoableCost = 0;
        selectedApps.forEach(appId => {
          const app = masterApps.find(a => a.id === appId);
          if (app && String(app.moduleSlug || '').toLowerCase() === String(promoInfo.scope).toLowerCase()) {
            const line = lineFor(app);
            promoableCost += line.licence + line.seatCost;
          }
        });
        promoableCost += moduleShare(String(promoInfo.scope).toLowerCase());
        promoDiscountVal = promoableCost * (Number(promoInfo.percent) / 100);
      }
    }

    const monthlySubtotal = baseFee + softwareCost + seatsCost + storageCost - bridgeDiscountVal - promoDiscountVal;

    const periodDiscountVal = monthlySubtotal * period.discount;
    const manualDiscountVal = (monthlySubtotal - periodDiscountVal) * (manualDiscount / 100);
    const monthlyNet = monthlySubtotal - periodDiscountVal - manualDiscountVal;
    
    const billingCycleTotal = monthlyNet * period.months;
    const vat = billingCycleTotal * VAT_RATE;
    const grandTotal = billingCycleTotal + vat;

    // Discounts are rendered directly from periodDiscountVal / manualDiscountVal
    // in the summary panel, so they are not pushed as breakdown line items.

    return {
      baseFee,
      softwareCost,
      seatsCost,
      storageCost,
      monthlySubtotal,
      bridgeDiscountVal,
      promoDiscountVal,
      periodDiscountVal,
      manualDiscountVal,
      monthlyNet,
      billingCycleTotal,
      vat,
      grandTotal,
      breakdown,
      tier,
      period,
      totalSeats,
      totalContractValue: billingCycleTotal,
      vatAmount: vat,
      totalWithVat: grandTotal
    };
  }, [serviceTier, billingPeriod, selectedModules, selectedApps, appSeats, storageGB, manualDiscount, appsGroupedByModule, masterApps, bridgeInfo, promoInfo]);

  const handleCheckBridgeCode = async () => {
    const code = bridgeCode.trim();
    if (!code) return;
    setBridgeChecking(true);
    setBridgeError(null);
    setBridgeInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-bridge-code', { body: { code } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.found) {
        setBridgeError('Code not recognized. Check it on your NextGen certificates page.');
      } else if (data.status !== 'valid') {
        const why = { redeemed: 'has already been used', expired: 'has expired', voided: 'is no longer valid' }[data.status] || 'is not valid';
        setBridgeError(`This code ${why}.`);
      } else {
        setBridgeInfo(data);
      }
    } catch (e) {
      setBridgeError(e.message || 'Could not verify the code. Please try again.');
    } finally {
      setBridgeChecking(false);
    }
  };

  const handleClearBridgeCode = () => {
    setBridgeCode('');
    setBridgeInfo(null);
    setBridgeError(null);
  };

  const handleCheckPromoCode = async () => {
    const code = promoCode.trim();
    if (!code) return;
    setPromoChecking(true);
    setPromoError(null);
    setPromoInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-promo-code', { body: { code } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.found) {
        setPromoError('Code not recognized. Check the code and try again.');
      } else if (data.status !== 'valid') {
        const why = { inactive: 'is no longer active', expired: 'has expired', exhausted: 'has been fully redeemed' }[data.status] || 'is not valid';
        setPromoError(`This code ${why}.`);
      } else {
        setPromoInfo(data);
      }
    } catch (e) {
      setPromoError(e.message || 'Could not verify the code. Please try again.');
    } finally {
      setPromoChecking(false);
    }
  };

  const handleClearPromoCode = () => {
    setPromoCode('');
    setPromoInfo(null);
    setPromoError(null);
  };

  const handleSaveQuote = async () => {
    // Resolve the caller's org from metadata first, then from the canonical
    // organization_members table (membership consolidation 20260713300000).
    // If none resolves we deliberately leave orgId null and let generate-quote
    // auto-provision a brand-new organization (its no-org branch), so a
    // first-time user can bootstrap one from here.
    let orgId = user?.user_metadata?.organization_id || user?.organization?.id;
    if (!orgId || !isValidUUID(orgId)) {
        orgId = await resolveUserOrgId(user.id);
    }
    if (orgId && !isValidUUID(orgId)) orgId = null;

    if (selectedApps.length === 0) {
        toast({ title: "Empty Quote", description: "Please select at least one application.", variant: "destructive" });
        return;
    }

    setGenerating(true);
    try {
      // generate-quote is authoritative: it re-derives pricing (per-app tiered
      // seats, tier multiplier, term/manual discounts, VAT), renders the PDF,
      // emails it, and inserts the quote. We send the configuration, not a price.
      const { data, error } = await supabase.functions.invoke('generate-quote', {
        body: {
          modules: selectedModules.map(id => appsGroupedByModule[id]?.slug).filter(Boolean),
          // Per-app seats: generate-quote stores these as per-app seats_allocated.
          apps: selectedApps.map(id => ({ id, seats: appSeats[id] || 1 })),
          seats: calculation.totalSeats,
          billing_term: billingPeriod,
          service_tier: serviceTier,
          storage_gb: storageGB,
          manual_discount: manualDiscount,
          bridge_code: bridgeInfo ? bridgeInfo.code : null,
          promo_code: promoInfo ? promoInfo.code : null,
          add_ons: [],
          user_id: user.id,
          user_email: user.email,
          organization_id: orgId,
          user_name: user?.user_metadata?.full_name || user.email.split('@')[0]
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGenerating(false);
      toast({ title: "Success", description: "Quote generated successfully!", className: "bg-green-600 text-white" });
      const newId = data?.quote_id || quoteId;
      navigate(`/dashboard/quote/${newId}`);
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
        <div className="flex items-center justify-center h-screen">
            <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-pl-primary-text mx-auto mb-4" aria-hidden="true"/>
                <p className="text-pl-muted">{loadingStatus}</p>
            </div>
        </div>
      );
  }

  if (catalogError) {
      return (
        <div className="flex items-center justify-center h-screen p-6">
            <div className="text-center max-w-md">
                <div className="bg-pl-danger-bg p-6 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                    <AlertTriangle className="w-10 h-10 text-pl-danger-text" aria-hidden="true"/>
                </div>
                <h2 className="text-2xl font-bold text-pl-text mb-2">Catalog Unavailable</h2>
                <p className="text-pl-muted mb-6">{catalogError}</p>
                <div className="bg-pl-sunken border border-pl-border p-4 rounded-md text-left text-xs font-pl-mono text-pl-muted mb-6 overflow-auto max-h-40">
                    {JSON.stringify(debugInfo.logs.slice(-3), null, 2)}
                </div>
                <Button onClick={() => window.location.reload()} variant="outline">
                    Retry Connection
                </Button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen text-pl-text pb-20">
      
      <ContactSalesModal 
        open={showContactSales} 
        onOpenChange={setShowContactSales} 
        defaultEmail={user?.email}
        quoteId={quoteId}
      />

      {/* --- Top Navigation --- */}
      <div className="sticky top-0 z-40 w-full bg-pl-surface/95 backdrop-blur border-b border-pl-border px-4 py-3 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pl-accent-text">Upgrade</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-pl-text">Quote: <span className="font-pl-mono">{quoteId}</span></h1>
              <Badge variant="neutral" className="font-normal">Draft</Badge>
            </div>
            <p className="text-xs text-pl-muted">Configure your subscription package.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button 
            onClick={handleSaveQuote} 
            disabled={generating}
            variant="accent"
            className="font-bold shadow-pl-sm"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
            Generate & Pay
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 py-6 sm:px-6 md:p-8 grid grid-cols-12 gap-6 md:gap-8">
        
        {/* --- LEFT CONFIGURATION PANEL --- */}
        <div className="col-span-12 lg:col-span-8 space-y-8 min-w-0">
          
          <Tabs defaultValue="config" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="details">Details & Terms</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-8">
              
              {/* 1. Billing & Commitment */}
              <section>
                <h3 className="text-lg font-semibold text-pl-text mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-pl-muted" aria-hidden="true"/> Billing Period & Commitment
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                  {BILLING_PERIODS.map((period) => (
                    <div 
                      key={period.id}
                      onClick={() => setBillingPeriod(period.id)}
                      className={`relative cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 
                        ${billingPeriod === period.id 
                          ? 'bg-pl-primary/10 border-pl-primary shadow-pl-sm' 
                          : 'bg-pl-surface border-pl-border hover:border-pl-border-strong'}`}
                    >
                      {period.discount > 0 && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-pl-accent text-pl-accent-fg text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                          SAVE {period.discount * 100}%
                        </div>
                      )}
                      <div className={`text-center font-bold ${billingPeriod === period.id ? 'text-pl-primary-text' : 'text-pl-text'}`}>
                        {period.name}
                      </div>
                      <div className="text-center text-xs text-pl-muted mt-1">{period.label}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. Service Tier */}
              <section>
                <h3 className="text-lg font-semibold text-pl-text mb-4">Service Tier</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {TIERS.map((tier) => (
                    <div 
                      key={tier.id}
                      onClick={() => setServiceTier(tier.id)}
                      className={`relative cursor-pointer p-5 rounded-xl border-2 transition-all duration-200 flex flex-col justify-between h-full
                        ${serviceTier === tier.id 
                          ? 'bg-pl-primary/10 border-pl-primary shadow-pl-sm' 
                          : 'bg-pl-surface border-pl-border hover:border-pl-border-strong'}`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-lg text-pl-text">{tier.name}</h4>
                          {serviceTier === tier.id && <CheckCircle className="w-5 h-5 text-pl-primary-text" aria-label="Selected"/>}
                        </div>
                        <p className="text-xs text-pl-muted mb-4">{tier.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 3. Modules & Applications */}
              <section>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="text-lg font-semibold text-pl-text">Modules & Applications</h3>
                  <div className="text-xs text-pl-muted border border-pl-border bg-pl-sunken px-3 py-1 rounded-full">
                    {selectedModules.length} Modules, {selectedApps.length} Apps Selected
                  </div>
                </div>

                {/* System Warnings Display */}
                {systemWarnings.length > 0 && (
                    <div className="mb-6 space-y-2">
                        {systemWarnings.map((warn, idx) => (
                            <div key={idx} className={`${accountCallout('danger')} flex items-center justify-between gap-2`}>
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true"/>
                                    <span>{warn}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="space-y-4">
                  {Object.keys(appsGroupedByModule).length === 0 && (
                      <div className={`${accountCallout('warning')} flex items-center gap-2`}>
                          <AlertTriangle className="w-4 h-4" aria-hidden="true"/>
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
                    const currentModuleCost = isModuleSelected
                      ? (MODULE_PRICING[moduleGroup.slug] || 0)
                      : selectedAppsInModule.reduce((acc, app) => acc + (app.price || 0), 0);

                    return (
                      <div key={moduleGroup.id} className={`bg-pl-surface border rounded-xl overflow-hidden transition-all duration-300 ${isEmpty ? 'border-pl-border opacity-70' : 'border-pl-border hover:border-pl-border-strong'}`}>
                        {/* Module Header */}
                        <div className={`p-4 flex items-center justify-between gap-3 ${isModuleSelected ? 'bg-pl-primary/10' : ''}`}>
                          <div className="flex min-w-0 items-center gap-4">
                            <Checkbox 
                              checked={isModuleSelected}
                              onCheckedChange={(checked) => handleModuleCheck(moduleGroup.id, checked)}
                              disabled={isEmpty}
                              aria-label={`Select the whole ${moduleGroup.name} module`}
                            />
                            <div className="cursor-pointer flex-1 min-w-0" onClick={() => !isEmpty && toggleModuleExpansion(moduleGroup.id)}>
                              <div className="flex items-center gap-2">
                                <Icon className={`w-5 h-5 shrink-0 ${isModuleSelected ? 'text-pl-primary-text' : 'text-pl-muted'}`} aria-hidden="true" />
                                <h4 className="font-bold text-base text-pl-text">
                                  {moduleGroup.name}
                                </h4>
                                {isEmpty ? null : (isExpanded ? <ChevronDown className="w-4 h-4 text-pl-muted" aria-hidden="true"/> : <ChevronRight className="w-4 h-4 text-pl-muted" aria-hidden="true"/>)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                             <div className={currentModuleCost > 0 ? "text-pl-text font-bold font-pl-mono tabular-nums" : "text-pl-muted text-sm"}>
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
                              className="border-t border-pl-border bg-pl-sunken/50"
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
                                             ? 'bg-pl-sunken border-pl-border cursor-not-allowed opacity-60' 
                                             : (isAppSelected ? 'bg-pl-raised border-pl-primary' : 'bg-pl-surface border-pl-border hover:border-pl-border-strong')}
                                        `}
                                        onClick={() => !isComingSoon && handleAppCheck(moduleGroup.id, app.id, !isAppSelected)}
                                      >
                                        <Checkbox 
                                          checked={isAppSelected} 
                                          disabled={isComingSoon}
                                          className={`mt-1 ${isComingSoon ? 'opacity-50' : ''}`}
                                          aria-label={`Select ${app.name}`}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex justify-between items-start gap-2">
                                            <span className={`text-sm font-medium ${isComingSoon ? 'text-pl-muted' : 'text-pl-text'}`}>
                                              {app.name}
                                              {/* Badge Logic */}
                                              {isComingSoon ? (
                                                  <Badge variant="neutral" className="ml-2 text-[9px] h-4 px-1">Coming Soon</Badge>
                                              ) : (app.status && (
                                                  <Badge variant={app.status === 'active' || app.status === 'Active' ? 'success' : 'warning'} className="ml-2 text-[9px] h-4 px-1">
                                                      {app.status}
                                                  </Badge>
                                              ))}
                                            </span>
                                            <span className="text-xs whitespace-nowrap font-pl-mono tabular-nums text-pl-muted">{formatCurrency(app.price)}/mo license</span>
                                          </div>
                                          <p className="text-[10px] line-clamp-1 mt-0.5 text-pl-muted">{app.description || 'No description available'}</p>
                                          {isAppSelected && !isComingSoon && (() => {
                                            const n = appSeats[app.id] || 1;
                                            return (
                                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-pl-border" onClick={(e) => e.stopPropagation()}>
                                                <span className="text-[10px] text-pl-muted flex items-center gap-1">
                                                  <Users className="w-3 h-3"/> + Seats · {formatCurrency(appSeatCost(app.slug, n))}/mo
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                  <button type="button" onClick={(e) => { e.stopPropagation(); setSeatsFor(app.id, n - 1); }}
                                                    disabled={n <= 1}
                                                    aria-label={`Fewer seats for ${app.name}`}
                                                    className="w-5 h-5 rounded border border-pl-border-strong bg-pl-surface hover:bg-pl-sunken disabled:opacity-40 flex items-center justify-center text-pl-text">−</button>
                                                  <span className="w-6 text-center text-xs font-bold font-pl-mono tabular-nums text-pl-text">{n}</span>
                                                  <button type="button" onClick={(e) => { e.stopPropagation(); setSeatsFor(app.id, n + 1); }}
                                                    aria-label={`More seats for ${app.name}`}
                                                    className="w-5 h-5 rounded border border-pl-border-strong bg-pl-surface hover:bg-pl-sunken flex items-center justify-center text-pl-text">+</button>
                                                </div>
                                              </div>
                                            );
                                          })()}
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
                                                  <TooltipContent className="text-xs">
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
              <section className="bg-pl-surface border border-pl-border rounded-xl p-4 sm:p-6 shadow-pl-sm">
                <h3 className="text-lg font-semibold text-pl-text mb-6">Infrastructure & Users</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  <div>
                    <div className="flex justify-between mb-2">
                      <Label>User Seats</Label>
                      <span className="text-pl-text font-bold text-xl font-pl-mono tabular-nums">{calculation.totalSeats}</span>
                    </div>
                    <p className="text-xs text-pl-muted mb-3">
                      Seats are set per app above. Volume tiers: 1–5 ${SEAT_TIERS[0].price}, 6–15 ${SEAT_TIERS[1].price}, 16–40 ${SEAT_TIERS[2].price}, 41+ ${SEAT_TIERS[3].price} /seat·mo; Essentials apps ${ESSENTIALS_SEAT_TIERS[0].price}, ${ESSENTIALS_SEAT_TIERS[1].price}, ${ESSENTIALS_SEAT_TIERS[2].price}, ${ESSENTIALS_SEAT_TIERS[3].price}.
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {selectedApps.length === 0 ? (
                        <p className="text-xs text-pl-muted">Select apps to allocate seats.</p>
                      ) : selectedApps.map(id => {
                        const app = masterApps.find(a => a.id === id);
                        const n = appSeats[id] || 1;
                        return (
                          <div key={id} className="flex justify-between text-xs text-pl-muted">
                            <span className="truncate mr-2">{app?.name || 'App'} · {n} seat{n === 1 ? '' : 's'}</span>
                            <span className="text-pl-text shrink-0 font-pl-mono tabular-nums">{formatCurrency(app ? appSeatCost(app.slug, n) : 0)}/mo</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-4">
                      <Label>Cloud Storage</Label>
                      <span className="text-pl-text font-bold text-xl font-pl-mono tabular-nums">{storageGB} GB</span>
                    </div>
                    <Slider
                      value={[storageGB]}
                      onValueChange={(val) => setStorageGB(val[0])}
                      min={10} max={5000} step={10}
                      className="my-6"
                      aria-label="Cloud storage in GB"
                    />
                    <p className="text-xs text-pl-muted">
                      First 10 GB free, then ${STORAGE_GB_PRICE}/GB·mo.
                      {storageGB > 10 ? (
                        <> {storageGB - 10} GB billable = <span className="text-pl-text font-pl-mono tabular-nums">{formatCurrency(calculation.storageCost)}/mo</span>.</>
                      ) : (
                        <> Currently within free allowance.</>
                      )}
                    </p>
                  </div>
                </div>
              </section>

            </TabsContent>
            
            <TabsContent value="details">
              <Card className="p-4 sm:p-6">
                <div className="space-y-4">
                  <div>
                    <Label>Quote Reference</Label>
                    <Input value={quoteId} disabled className="font-pl-mono"/>
                  </div>
                  <div>
                    <Label>Organization</Label>
                    <Input value={user?.user_metadata?.organization_name || 'My Organization'} disabled/>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

        </div>

        {/* --- RIGHT SUMMARY PANEL (STICKY) --- */}
        <div className="col-span-12 lg:col-span-4 min-w-0">
          <div className="sticky top-24 space-y-6">
            <Card className="shadow-pl-md overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-pl-accent" aria-hidden="true" />
              <div className="p-4 sm:p-6 space-y-6">
                
                <div>
                  <h3 className="text-xl font-bold text-pl-text flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-pl-muted" aria-hidden="true"/> Quote Summary
                  </h3>
                  <p className="text-pl-muted text-sm mt-1">{calculation.period.name} Billing</p>
                </div>

                {/* Big Price Display */}
                <div className="bg-pl-sunken rounded-lg p-4 text-center border border-pl-border">
                  <div className="text-xs text-pl-muted uppercase tracking-wider mb-1">Total Due</div>
                  <div className="text-3xl sm:text-4xl font-extrabold font-pl-mono tabular-nums text-pl-text break-words">
                    {formatCurrency(calculation.grandTotal)}
                  </div>
                  {calculation.period.discount > 0 && (
                    <div className="text-xs text-pl-text mt-2 font-medium flex justify-center items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-pl-primary-text" aria-hidden="true"/> Savings: {formatCurrency((calculation.monthlySubtotal - calculation.monthlyNet) * calculation.period.months)}
                    </div>
                  )}
                </div>

                {/* Recurring (monthly) charges — every line item, fully itemized */}
                <div className="space-y-2.5 text-sm border-t border-pl-border pt-4">
                  <div className="text-[10px] text-pl-muted uppercase tracking-wider mb-1">Recurring charges (per month)</div>
                  {calculation.breakdown.filter(i => i.type !== 'discount').map((item, idx) => (
                    <div key={idx} className={item.indent ? 'pl-3' : ''}>
                      <div className="flex justify-between gap-2 text-pl-text">
                        <span className="truncate max-w-[210px]">{item.item}</span>
                        <span className="shrink-0 font-pl-mono tabular-nums">{formatCurrency(item.cost)}/mo</span>
                      </div>
                      {item.note && (
                        <div className="text-[10px] text-pl-muted">{item.note}</div>
                      )}
                    </div>
                  ))}
                  {calculation.bridgeDiscountVal > 0 && bridgeInfo && (
                    <div className="flex justify-between gap-2 text-pl-text">
                      <span className="truncate max-w-[210px]">NextGen Expert Bridge ({bridgeInfo.discount_pct}% off {bridgeInfo.suite_module})</span>
                      <span className="shrink-0 font-pl-mono tabular-nums">−{formatCurrency(calculation.bridgeDiscountVal)}/mo</span>
                    </div>
                  )}
                  {calculation.promoDiscountVal > 0 && promoInfo && (
                    <div className="flex justify-between gap-2 text-pl-text">
                      <span className="truncate max-w-[210px]">Promo {promoInfo.code} ({promoInfo.percent}% off{promoInfo.scope === 'all' ? '' : ` ${promoInfo.scope}`})</span>
                      <span className="shrink-0 font-pl-mono tabular-nums">−{formatCurrency(calculation.promoDiscountVal)}/mo</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 text-pl-text font-semibold pt-2 border-t border-pl-border">
                    <span>Monthly Subtotal</span>
                    <span className="font-pl-mono tabular-nums">{formatCurrency(calculation.monthlySubtotal)}/mo</span>
                  </div>
                </div>

                {/* NextGen Expert bridge code */}
                <div className="space-y-2 border-t border-pl-border pt-4">
                  <div className="text-[10px] text-pl-muted uppercase tracking-wider">NextGen Expert code</div>
                  {bridgeInfo ? (
                    <div className={accountCallout('success')}>
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true"/>
                        <span className="truncate">{bridgeInfo.code}</span>
                      </div>
                      <p className="text-xs text-pl-text mt-1">
                        {bridgeInfo.discount_pct}% off the {bridgeInfo.suite_module} module for {bridgeInfo.holder} (cert {bridgeInfo.certificate_number}).
                      </p>
                      {calculation.bridgeDiscountVal <= 0 && (
                        <p className="text-xs text-pl-warning-text mt-1">
                          Add a {bridgeInfo.suite_module} app to the quote to use this code.
                        </p>
                      )}
                      <Button variant="ghost" size="sm" onClick={handleClearBridgeCode} className="h-7 px-2 mt-1 text-xs">
                        Remove code
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Input
                          value={bridgeCode}
                          onChange={(e) => { setBridgeCode(e.target.value); setBridgeError(null); }}
                          placeholder="PLB-XXXXXXXXXX"
                          className="h-9 text-sm font-pl-mono"
                        />
                        <Button
                          onClick={handleCheckBridgeCode}
                          disabled={bridgeChecking || !bridgeCode.trim()}
                          variant="outline"
                          className="h-9 shrink-0"
                        >
                          {bridgeChecking ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Apply'}
                        </Button>
                      </div>
                      {bridgeError && <p className="text-xs text-pl-danger-text" role="alert">{bridgeError}</p>}
                      <p className="text-[10px] text-pl-muted">
                        Earned an Expert certificate at NextGen Academy? Your discount code is on your certificates page.
                      </p>
                    </>
                  )}
                </div>

                {/* Suite promo code */}
                <div className="space-y-2 border-t border-pl-border pt-4">
                  <div className="text-[10px] text-pl-muted uppercase tracking-wider">Promo code</div>
                  {promoInfo ? (
                    <div className={accountCallout('success')}>
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true"/>
                        <span className="truncate">{promoInfo.code}</span>
                      </div>
                      <p className="text-xs text-pl-text mt-1">
                        {promoInfo.percent}% off {promoInfo.scope === 'all' ? 'your subscription' : `the ${promoInfo.scope} module`}.
                      </p>
                      {promoInfo.scope !== 'all' && calculation.promoDiscountVal <= 0 && (
                        <p className="text-xs text-pl-warning-text mt-1">
                          Add a {promoInfo.scope} app to the quote to use this code.
                        </p>
                      )}
                      <Button variant="ghost" size="sm" onClick={handleClearPromoCode} className="h-7 px-2 mt-1 text-xs">
                        Remove code
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Input
                          value={promoCode}
                          onChange={(e) => { setPromoCode(e.target.value); setPromoError(null); }}
                          placeholder="e.g. FOUNDING50"
                          className="h-9 text-sm font-pl-mono"
                        />
                        <Button
                          onClick={handleCheckPromoCode}
                          disabled={promoChecking || !promoCode.trim()}
                          variant="outline"
                          className="h-9 shrink-0"
                        >
                          {promoChecking ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Apply'}
                        </Button>
                      </div>
                      {promoError && <p className="text-xs text-pl-danger-text" role="alert">{promoError}</p>}
                    </>
                  )}
                </div>

                {/* Sales-only special discount. The server rejects manual_discount
                    from anyone who is not a platform super admin, so this input is
                    hidden for customers rather than failing at submit. */}
                {isSuperAdmin && (
                  <div className="flex items-center justify-between gap-3 text-sm border-t border-pl-border pt-4">
                    <label htmlFor="sales-discount" className="text-pl-text">Sales discount (%)</label>
                    <input
                      id="sales-discount"
                      type="number"
                      min="0"
                      max="100"
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className={`${COMPACT_FIELD_THEMED} !w-20 text-right text-sm font-pl-mono tabular-nums`}
                    />
                  </div>
                )}

                {/* Discounts (applied to the monthly subtotal) */}
                {(calculation.periodDiscountVal > 0 || calculation.manualDiscountVal > 0) && (
                  <div className="space-y-2 text-sm border-t border-pl-border pt-4">
                    {calculation.periodDiscountVal > 0 && (
                      <div className="flex justify-between gap-2 text-pl-text">
                        <span>Term Discount ({calculation.period.name})</span>
                        <span className="font-pl-mono tabular-nums">−{formatCurrency(calculation.periodDiscountVal)}/mo</span>
                      </div>
                    )}
                    {calculation.manualDiscountVal > 0 && (
                      <div className="flex justify-between gap-2 text-pl-text">
                        <span>Special Discount ({manualDiscount}%)</span>
                        <span className="font-pl-mono tabular-nums">−{formatCurrency(calculation.manualDiscountVal)}/mo</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2 text-pl-text font-semibold pt-2 border-t border-pl-border">
                      <span>Net Monthly</span>
                      <span className="font-pl-mono tabular-nums">{formatCurrency(calculation.monthlyNet)}/mo</span>
                    </div>
                  </div>
                )}

                {/* Billing term → VAT → Total chain */}
                <div className="space-y-2 border-t border-pl-border pt-4">
                  {calculation.period.months > 1 && (
                    <div className="flex justify-between gap-2 text-pl-muted text-sm">
                      <span>Billing Term ({calculation.monthlyNet > 0 ? `${formatCurrency(calculation.monthlyNet)} × ${calculation.period.months} mo` : `${calculation.period.months} mo`})</span>
                      <span className="font-pl-mono tabular-nums">{formatCurrency(calculation.billingCycleTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 text-pl-muted text-sm">
                    <span>VAT ({VAT_RATE * 100}%)</span>
                    <span className="font-pl-mono tabular-nums">{formatCurrency(calculation.vat)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-pl-text font-bold text-xl pt-2 border-t-2 border-pl-border-strong">
                    <span>Total Due</span>
                    <span className="font-pl-mono tabular-nums">{formatCurrency(calculation.grandTotal)}</span>
                  </div>
                  <p className="text-[10px] text-pl-muted pt-1">
                    Total billed once for the full {calculation.period.name.toLowerCase()} term, VAT included.
                  </p>
                </div>

              </div>
            </Card>

            <div className="flex flex-col gap-3">
              <Button onClick={handleSaveQuote} disabled={generating} variant="accent" className="w-full h-12 font-bold text-lg">
                {generating ? <Loader2 className="animate-spin mr-2"/> : "Generate & Pay"}
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Contact Sales</DialogTitle>
                    <DialogDescription>
                        Have questions about Quote #{quoteId}? Send us a message.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div>
                        <Label>Email</Label>
                        <Input value={defaultEmail} disabled/>
                    </div>
                    <div>
                        <Label>Message</Label>
                        <Textarea 
                            value={message} 
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="I have a question about enterprise features..."
                            className="h-32"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => onSubmit(message)}>Send Message</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// Design system rollout batch 1E: the page wraps itself in <ThemedApp>, so
// the loading, error and quote screens all follow the user's theme.
const QuoteBuilderPage = () => (
  <AccountScope testId="quote-builder-theme-scope">
    <QuoteBuilder />
  </AccountScope>
);

export default QuoteBuilderPage;