import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, ChevronRight, ChevronLeft, CreditCard,
  Building, Layers, AppWindow, Users, Shield, Loader2, Minus, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AccountScope } from '@/components/account/accountChrome';
import { formatCurrency } from '@/utils/adminHelpers';
import { appCategories } from '@/data/applications';
import { MODULE_PRICING, BASE_PLATFORM_FEE } from '@/data/pricingModels';
import { priceApp, modulesCharge, platformFeeWaived } from '@/data/quotePricing';

const STEPS = [
  { id: 1, title: 'Modules', icon: Layers },
  { id: 2, title: 'Applications', icon: AppWindow },
  { id: 3, title: 'Configuration', icon: Users },
  { id: 4, title: 'Review', icon: CheckCircle }
];

// Module pricing comes from src/data/pricingModels.js, which mirrors
// pricing_config.module_pricing. The server re-prices every quote and is
// authoritative; this is preview only.
const BASE_SEAT_PRICE = 49;

function GetQuotePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user, organization } = useAuth();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [quoteGenerating, setQuoteGenerating] = useState(false);
  
  // State
  const [selectedModules, setSelectedModules] = useState([]);
  const [availableApps, setAvailableApps] = useState([]);
  const [selectedApps, setSelectedApps] = useState([]);
  const [appSeats, setAppSeats] = useState({}); // { [appId]: seatCount } — per-app seats
  const [billingTerm, setBillingTerm] = useState('monthly');
  // Suite promo code (early-adopter discounts). Verified live via the
  // verify-promo-code edge fn; generate-quote re-validates server-side and
  // is authoritative for the final total.
  const [promoCode, setPromoCode] = useState('');
  const [promoInfo, setPromoInfo] = useState(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState(null);

  // Select/deselect an app, keeping its per-app seat count in sync (default 1).
  const toggleApp = (appId) => {
    setSelectedApps(prev => {
      const has = prev.includes(appId);
      setAppSeats(s => {
        const next = { ...s };
        if (has) delete next[appId]; else next[appId] = next[appId] || 1;
        return next;
      });
      return has ? prev.filter(id => id !== appId) : [...prev, appId];
    });
  };

  const setSeatsFor = (appId, n) => setAppSeats(s => ({ ...s, [appId]: Math.max(1, n) }));
  // An app is covered by a module the customer has already bought, in which
  // case its licence is included and only its seats are charged.
  //
  // availableApps is fetched with `module_ids: selectedModules`, so every app
  // in the list belongs to a selected module by construction. The explicit
  // matches below are there so this stays correct if that ever changes, and
  // the fallback states the assumption rather than hiding it.
  //
  // The server re-prices every quote against master_apps.module_id and is
  // authoritative; this only decides what the preview shows.
  const isCoveredByModule = (app) => {
    if (!app || selectedModules.length === 0) return false;
    const candidates = [app.module_slug, app.module_id, app.module]
      .filter(Boolean)
      .map(v => String(v).toLowerCase());
    if (candidates.some(v => selectedModules.includes(v))) return true;
    return true; // fetched per selected module
  };

  const getTotalSeats = () => selectedApps.reduce((acc, id) => acc + (appSeats[id] || 1), 0);
  // Per-app lines under the shared pricing rules (src/data/quotePricing.js,
  // mirrored by generate-quote): Essentials seats for light apps, no charge
  // for an app quoted with its host, no licence for a module-covered app.
  const appLines = () => {
    const apps = selectedApps.map(id => availableApps.find(a => a.id === id)).filter(Boolean);
    const quotedSlugs = new Set(apps.map(a => a.slug));
    return apps.map(app => priceApp(
      { slug: app.slug, moduleSlug: isCoveredByModule(app) ? (app.module_id || selectedModules[0]) : null, price: app.price, seats: appSeats[app.id] || 1 },
      { moduleSlugs: selectedModules, quotedSlugs },
    ));
  };
  const getSeatsCost = () => appLines().reduce((acc, l) => acc + l.seatCost, 0);
  const getAppsLicence = () => appLines().reduce((acc, l) => acc + l.licence, 0);
  const getModules = () => modulesCharge(selectedModules);
  const getPlatformFee = () => (platformFeeWaived(selectedModules, billingTerm) ? 0 : BASE_PLATFORM_FEE);
  const [addOns, setAddOns] = useState([]);
  // Use the explicit ?org_id, the upgrade-button state, or fall back to the
  // logged-in admin's own org (in-app upgrade). Null only for brand-new signups.
  const [orgId, setOrgId] = useState(
    searchParams.get('org_id') || location.state?.targetOrgId || null
  );
  // Once auth resolves, adopt the user's org if we still don't have one.
  useEffect(() => {
    if (!orgId && organization?.id) setOrgId(organization.id);
  }, [organization?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load apps when modules change
  useEffect(() => {
    if (selectedModules.length > 0) {
      fetchActiveApps();
    } else {
      setAvailableApps([]);
    }
  }, [selectedModules]);

  const fetchActiveApps = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-active-apps', {
        body: { module_ids: selectedModules }
      });
      if (error) throw error;
      if (data?.apps) {
        setAvailableApps(data.apps);
      }
    } catch (error) {
      console.error('Error fetching apps:', error);
      // Fallback to local data if edge function fails or for demo
      const localApps = appCategories
        .filter(cat => selectedModules.includes(cat.id))
        .flatMap(cat => cat.apps.map(app => ({
          ...app,
          module_id: cat.id,
          price: 99 // Default price if not fetched
        })));
      setAvailableApps(localApps);
    } finally {
      setLoading(false);
    }
  };

  const handleModuleToggle = (moduleId) => {
    setSelectedModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
    // Clear apps from deselected module
    if (selectedModules.includes(moduleId)) {
      setSelectedApps(prev => prev.filter(appId => 
        availableApps.find(a => a.id === appId)?.module_id !== moduleId
      ));
    }
  };

  const calculateTotal = () => {
    let subtotal = 0;
    
    // Modules. A module includes every app in it, so its price REPLACES
    // those apps' a la carte prices. Adding both was the double-count that
    // made this preview disagree with the quote the server generated.
    // Every module together is the all-access price.
    subtotal += getModules().total;

    // Apps, charged only where they are not already covered by a selected
    // module. Seats still apply to every app either way.
    subtotal += getAppsLicence();

    // Seats (per app, graduated tiers)
    subtotal += getSeatsCost();

    // Platform fee, waived with a module licence or an annual term.
    subtotal += getPlatformFee();

    // Promo (preview only; generate-quote re-validates and is authoritative).
    // 'all' scope discounts the whole monthly subtotal; a module scope is
    // shown as applied at quote generation (server computes the exact value).
    let promoAmount = 0;
    if (promoInfo && promoInfo.scope === 'all') {
      promoAmount = subtotal * (Number(promoInfo.percent) / 100);
      subtotal -= promoAmount;
    }

    // Term discount
    const multiplier = billingTerm === 'annual' ? 12 : (billingTerm === 'quarterly' ? 3 : 1);
    const discount = billingTerm === 'annual' ? 0.15 : (billingTerm === 'quarterly' ? 0.10 : 0);

    const gross = subtotal * multiplier;
    const discounted = gross * (1 - discount);

    return {
      monthly: subtotal,
      promoAmount,
      gross,
      discountAmount: gross * discount,
      net: discounted,
      vat: discounted * 0.075,
      total: discounted * 1.075
    };
  };

  // Share links (/get-quote?promo=CODE) pre-apply the promo so a prospect
  // clicking a marketing link never has to type the code.
  useEffect(() => {
    const linkCode = (searchParams.get('promo') || '').trim();
    if (!linkCode || promoInfo) return;
    setPromoCode(linkCode.toUpperCase());
    (async () => {
      setPromoChecking(true);
      try {
        const { data, error } = await supabase.functions.invoke('verify-promo-code', { body: { code: linkCode } });
        if (!error && data?.found && data.status === 'valid') {
          setPromoInfo(data);
        } else if (data?.found) {
          const why = { inactive: 'is no longer active', expired: 'has expired', exhausted: 'has been fully redeemed' }[data.status] || 'is not valid';
          setPromoError(`This code ${why}.`);
        }
      } catch { /* leave the code typed in for a manual retry */ }
      finally { setPromoChecking(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleGenerateQuote = async () => {
    if (!user) {
      toast({ title: "Authentication Required", description: "Please log in to save your quote.", variant: "destructive" });
      navigate('/login?redirect=/get-quote');
      return;
    }

    setQuoteGenerating(true);
    try {
      const totals = calculateTotal();
      
      const { data, error } = await supabase.functions.invoke('generate-quote', {
        body: {
          modules: selectedModules,
          // Per-app seats: generate-quote stores these as the per-app seats_allocated.
          apps: selectedApps.map(id => ({ id, seats: appSeats[id] || 1 })),
          seats: getTotalSeats(),
          billing_term: billingTerm,
          add_ons: addOns,
          user_id: user.id,
          user_email: user.email,
          organization_id: orgId, // Can be null if new
          user_name: user.user_metadata?.full_name || user.email.split('@')[0],
          promo_code: promoInfo ? promoInfo.code : null
        }
      });

      if (error) throw error;

      toast({ title: "Quote Generated!", description: `Quote ID: ${data.quote_id}` });
      // Store ID in local storage just in case
      localStorage.setItem('last_quote_id', data.quote_id);
      
      // Redirect to dashboard with the quote
      navigate(`/dashboard/quote/${data.quote_id}`);

    } catch (error) {
      console.error('Quote generation failed:', error);
      toast({ title: "Error", description: error.message || "Failed to generate quote", variant: "destructive" });
    } finally {
      setQuoteGenerating(false);
    }
  };

  const totals = calculateTotal();

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl text-pl-text">
        
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-10 md:mb-12">
          <div className="flex items-center gap-3 min-w-0">
            <img src="https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/2e67bfd0151fc6ba8faf620cf9d545c4.png" alt="Petrolord" className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pl-accent-text">Get a quote</p>
              <h1 className="text-xl sm:text-2xl font-bold text-pl-text">
                Petrolord Suite Configurator
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user && (
              <div className="text-sm text-pl-muted min-w-0 break-all">
                Configuring for: <span className="text-pl-text font-medium">{user.email}</span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-10 md:mb-12 relative isolate">
          <div className="absolute top-5 left-0 w-full h-1 bg-pl-border -z-10 rounded-full" aria-hidden="true" />
          <div className="absolute top-5 left-0 h-1 bg-pl-primary -z-10 rounded-full transition-all duration-500" aria-hidden="true"
               style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }} />
          
          <div className="flex justify-between">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              
              return (
                <div key={step.id} className="flex flex-col items-center gap-2 bg-pl-bg px-1 sm:px-2" aria-current={isActive ? 'step' : undefined}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                    ${isActive ? 'border-pl-primary bg-pl-raised text-pl-primary-text ring-4 ring-pl-primary/20' : 
                      isCompleted ? 'border-pl-primary bg-pl-primary text-pl-primary-fg' : 'border-pl-border-strong bg-pl-surface text-pl-muted'}`}>
                    {isCompleted ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs sm:text-sm font-medium ${isActive ? 'text-pl-text' : isCompleted ? 'text-pl-primary-text' : 'text-pl-muted'}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <Card className="shadow-pl-md min-h-[500px]">
          <CardContent className="p-4 sm:p-8">
            <AnimatePresence mode="wait">
              
              {/* STEP 1: MODULES */}
              {currentStep === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                  <h2 className="text-2xl font-bold mb-2">Select Modules</h2>
                  <p className="text-pl-muted mb-8">Choose the core domains you need access to.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {appCategories.filter(c => c.id !== 'hse').map((category) => (
                      <div key={category.id} 
                           className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:scale-[1.02]
                             ${selectedModules.includes(category.id) ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border bg-pl-raised hover:border-pl-border-strong'}`}
                           onClick={() => handleModuleToggle(category.id)}>
                        <div className="flex justify-between items-start mb-3">
                          <category.icon className={`w-8 h-8 ${selectedModules.includes(category.id) ? 'text-pl-primary-text' : 'text-pl-muted'}`} />
                          <Checkbox checked={selectedModules.includes(category.id)} />
                        </div>
                        <h3 className="font-semibold text-lg mb-1">{category.name}</h3>
                        <p className="text-sm text-pl-muted mb-4 h-10 line-clamp-2">{category.description}</p>
                        <div className="text-pl-primary-text font-pl-mono tabular-nums text-sm">Starts at ${MODULE_PRICING[category.id]}/mo</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* STEP 2: APPS */}
              {currentStep === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                  <h2 className="text-2xl font-bold mb-2">Select Applications</h2>
                  <p className="text-pl-muted mb-8">Refine your subscription by selecting specific premium applications.</p>
                  
                  {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-pl-primary-text" /></div>
                  ) : availableApps.length === 0 ? (
                    <div className="text-center py-20 text-pl-muted">No specific apps available for selected modules.</div>
                  ) : (
                    <div className="space-y-8">
                      {selectedModules.map(modId => {
                        const modApps = availableApps.filter(a => a.module_id === modId);
                        if (modApps.length === 0) return null;
                        const modName = appCategories.find(c => c.id === modId)?.name;
                        
                        return (
                          <div key={modId}>
                            <h3 className="text-lg font-semibold text-pl-text mb-4 border-b border-pl-border pb-2">{modName}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {modApps.map(app => (
                                <div key={app.id} 
                                     className={`flex items-start gap-4 p-4 rounded-lg border transition-all cursor-pointer
                                       ${selectedApps.includes(app.id) ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border bg-pl-raised hover:border-pl-border-strong'}`}
                                     onClick={() => toggleApp(app.id)}>
                                  <Checkbox checked={selectedApps.includes(app.id)} />
                                  <div>
                                    <div className="font-medium">{app.name}</div>
                                    <div className="text-sm text-pl-muted">{app.description}</div>
                                    <div className="text-xs text-pl-primary-text font-pl-mono tabular-nums mt-1">+${app.price}/mo</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* STEP 3: CONFIGURATION */}
              {currentStep === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                  <h2 className="text-2xl font-bold mb-2">Configure Plan</h2>
                  <p className="text-pl-muted mb-8">Adjust seats and billing terms to fit your needs.</p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      {/* Seats — per app */}
                      <div className="bg-pl-raised p-4 sm:p-6 rounded-xl border border-pl-border">
                        <div className="flex flex-wrap justify-between gap-2 mb-4">
                          <label className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-pl-muted" aria-hidden="true"/> Seats per App</label>
                          <span className="text-sm text-pl-muted font-pl-mono tabular-nums">{getTotalSeats()} total · {formatCurrency(getSeatsCost())}/mo</span>
                        </div>
                        {selectedApps.length === 0 ? (
                          <p className="text-sm text-pl-muted">Select apps in the previous step to allocate seats.</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedApps.map(id => {
                              const app = availableApps.find(a => a.id === id);
                              const n = appSeats[id] || 1;
                              return (
                                <div key={id} className="flex items-center justify-between gap-3">
                                  <span className="text-sm truncate">{app?.name || 'App'}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Fewer seats"
                                      onClick={() => setSeatsFor(id, n - 1)} disabled={n <= 1}>
                                      <Minus className="w-3 h-3" />
                                    </Button>
                                    <span className="w-8 text-center font-bold font-pl-mono tabular-nums text-pl-text">{n}</span>
                                    <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="More seats"
                                      onClick={() => setSeatsFor(id, n + 1)}>
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Billing Term */}
                      <div className="bg-pl-raised p-4 sm:p-6 rounded-xl border border-pl-border">
                        <label className="font-semibold flex items-center gap-2 mb-4"><CreditCard className="w-4 h-4 text-pl-muted" aria-hidden="true"/> Billing Cycle</label>
                        <div className="flex gap-2 sm:gap-4">
                          {['monthly', 'quarterly', 'annual'].map(term => (
                            <div key={term} 
                                 onClick={() => setBillingTerm(term)}
                                 className={`flex-1 min-w-0 p-3 sm:p-4 rounded-lg border text-center cursor-pointer transition-all
                                   ${billingTerm === term ? 'border-pl-primary bg-pl-primary/10 text-pl-text' : 'border-pl-border text-pl-muted hover:border-pl-border-strong'}`}>
                              <div className="capitalize font-bold">{term}</div>
                              <div className="text-xs mt-1">
                                {term === 'annual' ? 'Save 15%' : term === 'quarterly' ? 'Save 10%' : 'Standard'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Summary Preview */}
                    <div className="bg-pl-sunken p-4 sm:p-6 rounded-xl border border-pl-border h-fit">
                      <h3 className="text-xl font-bold mb-6 border-b border-pl-border pb-4">Estimated Cost</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-pl-muted">{getModules().allAccess ? 'All-access Suite licence' : 'Modules Cost'}</span>
                          <span>{formatCurrency(getModules().total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-pl-muted">Apps Add-on</span>
                          <span>{formatCurrency(getAppsLicence())}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-pl-muted">Platform fee</span>
                          <span>{getPlatformFee() === 0 ? 'Included' : formatCurrency(getPlatformFee())}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-pl-muted">Seats ({getTotalSeats()}, tiered)</span>
                          <span>{formatCurrency(getSeatsCost())}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-pl-text pt-2 border-t border-pl-border">
                          <span>Monthly Subtotal</span>
                          <span>{formatCurrency(totals.monthly)}</span>
                        </div>
                        {totals.promoAmount > 0 && promoInfo && (
                          <div className="flex justify-between gap-3 text-pl-primary-text">
                            <span>Promo {promoInfo.code} ({promoInfo.percent}%)</span>
                            <span>-{formatCurrency(totals.promoAmount)}</span>
                          </div>
                        )}
                        {totals.discountAmount > 0 && (
                          <div className="flex justify-between gap-3 text-pl-primary-text">
                            <span>Term Discount</span>
                            <span>-{formatCurrency(totals.discountAmount)}</span>
                          </div>
                        )}
                        <div className="pt-3 border-t border-pl-border">
                          <div className="text-xs text-pl-muted mb-1">Promo code</div>
                          {promoInfo ? (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-pl-primary-text font-pl-mono">{promoInfo.code}</span>
                              <button
                                type="button"
                                className="text-xs text-pl-muted hover:text-pl-text"
                                onClick={() => { setPromoInfo(null); setPromoCode(''); setPromoError(null); }}
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                value={promoCode}
                                onChange={(e) => { setPromoCode(e.target.value); setPromoError(null); }}
                                placeholder="e.g. FOUNDING50"
                                aria-label="Promo code"
                                className="flex-1 min-w-0 rounded-md bg-pl-raised border border-pl-border-strong px-2 py-1.5 text-sm font-pl-mono text-pl-text placeholder:text-pl-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCheckPromoCode}
                                disabled={promoChecking || !promoCode.trim()}
                                className="shrink-0"
                              >
                                {promoChecking ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Apply'}
                              </Button>
                            </div>
                          )}
                          {promoError && <p className="text-xs text-pl-danger-text mt-1" role="alert">{promoError}</p>}
                          {promoInfo && promoInfo.scope !== 'all' && (
                            <p className="text-xs text-pl-muted mt-1">
                              {promoInfo.percent}% off the {promoInfo.scope} module, applied when the quote is generated.
                            </p>
                          )}
                        </div>
                        <div className="flex justify-between text-pl-muted">
                          <span>VAT (7.5%)</span>
                          <span>{formatCurrency(totals.vat)}</span>
                        </div>
                        <div className="flex justify-between text-2xl font-bold text-pl-text pt-4 border-t border-pl-border mt-2">
                          <span>Total</span>
                          <span>{formatCurrency(totals.total)}</span>
                        </div>
                        <div className="text-xs text-center text-pl-muted mt-4">
                          Billed {billingTerm}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 4: REVIEW */}
              {currentStep === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                  <div className="text-center mb-10">
                    <CheckCircle className="w-16 h-16 text-pl-primary-text mx-auto mb-4" aria-hidden="true" />
                    <h2 className="text-2xl sm:text-3xl font-bold mb-2">Ready to Generate Quote</h2>
                    <p className="text-pl-muted">Review your configuration before finalizing.</p>
                  </div>

                  <div className="max-w-2xl mx-auto bg-pl-raised border border-pl-border rounded-xl p-4 sm:p-8">
                    <div className="grid grid-cols-2 gap-y-6 text-sm">
                      <div>
                        <div className="text-pl-muted mb-1">Modules</div>
                        <div className="font-medium">{selectedModules.length} Selected</div>
                      </div>
                      <div>
                        <div className="text-pl-muted mb-1">Applications</div>
                        <div className="font-medium">{selectedApps.length} Premium Apps</div>
                      </div>
                      <div>
                        <div className="text-pl-muted mb-1">Organization</div>
                        <div className="font-medium">{user?.user_metadata?.organization_name || 'New Organization'}</div>
                      </div>
                      <div>
                        <div className="text-pl-muted mb-1">User Limit</div>
                        <div className="font-medium">{getTotalSeats()} Seats</div>
                      </div>
                      <div className="col-span-2 pt-4 border-t border-pl-border">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <div className="text-lg font-semibold">Total Contract Value</div>
                          <div className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{formatCurrency(totals.total)}</div>
                        </div>
                        <div className="text-right text-xs text-pl-muted mt-1">Valid for 14 days</div>
                      </div>
                    </div>
                  </div>

                  {!user && (
                    <div className="max-w-2xl mx-auto mt-8 bg-pl-warning-bg border border-pl-warning/40 p-4 rounded-lg flex flex-wrap sm:flex-nowrap gap-3 items-center text-pl-warning-text">
                      <Shield className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                      <p className="text-sm">You need to log in or create an account to save this quote and proceed with payment.</p>
                      <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate('/login')}>Log In</Button>
                    </div>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button 
            variant="outline" 
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1 || quoteGenerating}
            className="w-28 sm:w-32"
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          {currentStep < 4 ? (
            <Button 
              onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
              disabled={selectedModules.length === 0}
              className="w-28 sm:w-32"
            >
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button 
              onClick={handleGenerateQuote}
              disabled={quoteGenerating}
              className="px-4 sm:px-8"
            >
              {quoteGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
              Generate Official Quote
            </Button>
          )}
        </div>

    </div>
  );
}

export default function GetQuote() {
  return (
    <AccountScope testId="get-quote-theme-scope">
      <GetQuotePage />
    </AccountScope>
  );
}