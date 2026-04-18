import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, ChevronRight, ChevronLeft, CreditCard,
  Building, Layers, AppWindow, Users, Shield, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/adminHelpers';
import { appCategories } from '@/data/applications';

const STEPS = [
  { id: 1, title: 'Modules', icon: Layers },
  { id: 2, title: 'Applications', icon: AppWindow },
  { id: 3, title: 'Configuration', icon: Users },
  { id: 4, title: 'Review', icon: CheckCircle }
];

const MODULE_PRICING = {
  geoscience: 500,
  reservoir: 500,
  drilling: 450,
  production: 400,
  economics: 350,
  facilities: 400,
  hse: 0
};

const BASE_SEAT_PRICE = 49;

export default function GetQuote() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [quoteGenerating, setQuoteGenerating] = useState(false);
  
  // State
  const [selectedModules, setSelectedModules] = useState([]);
  const [availableApps, setAvailableApps] = useState([]);
  const [selectedApps, setSelectedApps] = useState([]);
  const [seats, setSeats] = useState(5);
  const [billingTerm, setBillingTerm] = useState('monthly');
  const [addOns, setAddOns] = useState([]);
  const [orgId, setOrgId] = useState(searchParams.get('org_id') || null);

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
    
    // Modules base
    selectedModules.forEach(m => subtotal += (MODULE_PRICING[m] || 0));
    
    // Apps
    selectedApps.forEach(appId => {
      const app = availableApps.find(a => a.id === appId);
      if (app) subtotal += (parseFloat(app.price) || 0);
    });

    // Seats
    subtotal += (seats * BASE_SEAT_PRICE);

    // Term discount
    const multiplier = billingTerm === 'annual' ? 12 : (billingTerm === 'quarterly' ? 3 : 1);
    const discount = billingTerm === 'annual' ? 0.15 : (billingTerm === 'quarterly' ? 0.10 : 0);
    
    const gross = subtotal * multiplier;
    const discounted = gross * (1 - discount);
    
    return {
      monthly: subtotal,
      gross,
      discountAmount: gross * discount,
      net: discounted,
      vat: discounted * 0.075,
      total: discounted * 1.075
    };
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
          apps: selectedApps,
          seats,
          billing_term: billingTerm,
          add_ons: addOns,
          user_id: user.id,
          user_email: user.email,
          organization_id: orgId, // Can be null if new
          user_name: user.user_metadata?.full_name || user.email.split('@')[0]
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
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-lime-500/30">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <img src="https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/2e67bfd0151fc6ba8faf620cf9d545c4.png" alt="Petrolord" className="h-10 w-10" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-lime-400 to-emerald-500 bg-clip-text text-transparent">
              Petrolord Suite Configurator
            </h1>
          </div>
          {user && (
            <div className="text-sm text-slate-400">
              Configuring for: <span className="text-white font-medium">{user.email}</span>
            </div>
          )}
        </div>

        {/* Progress Steps */}
        <div className="mb-12 relative">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-800 -z-10 rounded-full" />
          <div className="absolute top-1/2 left-0 h-1 bg-lime-500 -z-10 rounded-full transition-all duration-500" 
               style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }} />
          
          <div className="flex justify-between">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              
              return (
                <div key={step.id} className="flex flex-col items-center gap-2 bg-slate-950 px-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                    ${isActive ? 'border-lime-500 bg-lime-500/20 text-lime-400 shadow-[0_0_15px_rgba(132,204,22,0.5)]' : 
                      isCompleted ? 'border-lime-500 bg-lime-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-500'}`}>
                    {isCompleted ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? 'text-lime-400' : isCompleted ? 'text-lime-500' : 'text-slate-500'}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl shadow-2xl min-h-[500px]">
          <CardContent className="p-8">
            <AnimatePresence mode="wait">
              
              {/* STEP 1: MODULES */}
              {currentStep === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                  <h2 className="text-2xl font-bold mb-2">Select Modules</h2>
                  <p className="text-slate-400 mb-8">Choose the core domains you need access to.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {appCategories.filter(c => c.id !== 'hse').map((category) => (
                      <div key={category.id} 
                           className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:scale-[1.02]
                             ${selectedModules.includes(category.id) ? 'border-lime-500 bg-lime-500/10' : 'border-slate-800 bg-slate-800/50 hover:border-slate-600'}`}
                           onClick={() => handleModuleToggle(category.id)}>
                        <div className="flex justify-between items-start mb-3">
                          <category.icon className={`w-8 h-8 ${selectedModules.includes(category.id) ? 'text-lime-400' : 'text-slate-500'}`} />
                          <Checkbox checked={selectedModules.includes(category.id)} className="data-[state=checked]:bg-lime-500 data-[state=checked]:border-lime-500" />
                        </div>
                        <h3 className="font-semibold text-lg mb-1">{category.name}</h3>
                        <p className="text-sm text-slate-400 mb-4 h-10 line-clamp-2">{category.description}</p>
                        <div className="text-lime-400 font-mono text-sm">Starts at ${MODULE_PRICING[category.id]}/mo</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* STEP 2: APPS */}
              {currentStep === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                  <h2 className="text-2xl font-bold mb-2">Select Applications</h2>
                  <p className="text-slate-400 mb-8">Refine your subscription by selecting specific premium applications.</p>
                  
                  {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-lime-500" /></div>
                  ) : availableApps.length === 0 ? (
                    <div className="text-center py-20 text-slate-500">No specific apps available for selected modules.</div>
                  ) : (
                    <div className="space-y-8">
                      {selectedModules.map(modId => {
                        const modApps = availableApps.filter(a => a.module_id === modId);
                        if (modApps.length === 0) return null;
                        const modName = appCategories.find(c => c.id === modId)?.name;
                        
                        return (
                          <div key={modId}>
                            <h3 className="text-lg font-semibold text-lime-400 mb-4 border-b border-slate-800 pb-2">{modName}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {modApps.map(app => (
                                <div key={app.id} 
                                     className={`flex items-start gap-4 p-4 rounded-lg border transition-all cursor-pointer
                                       ${selectedApps.includes(app.id) ? 'border-lime-500 bg-lime-900/20' : 'border-slate-800 hover:border-slate-700'}`}
                                     onClick={() => setSelectedApps(prev => prev.includes(app.id) ? prev.filter(id => id !== app.id) : [...prev, app.id])}>
                                  <Checkbox checked={selectedApps.includes(app.id)} />
                                  <div>
                                    <div className="font-medium">{app.name}</div>
                                    <div className="text-sm text-slate-400">{app.description}</div>
                                    <div className="text-xs text-lime-300 mt-1">+${app.price}/mo</div>
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
                  <p className="text-slate-400 mb-8">Adjust seats and billing terms to fit your needs.</p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      {/* Seats */}
                      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                        <div className="flex justify-between mb-4">
                          <label className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-lime-400"/> User Seats</label>
                          <span className="text-2xl font-bold text-lime-400">{seats}</span>
                        </div>
                        <Slider 
                          value={[seats]} 
                          onValueChange={(val) => setSeats(val[0])} 
                          min={1} max={100} step={1} 
                          className="mb-2"
                        />
                        <div className="text-xs text-slate-400 flex justify-between">
                          <span>1 User</span>
                          <span>100 Users</span>
                        </div>
                      </div>

                      {/* Billing Term */}
                      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                        <label className="font-semibold flex items-center gap-2 mb-4"><CreditCard className="w-4 h-4 text-lime-400"/> Billing Cycle</label>
                        <div className="flex gap-4">
                          {['monthly', 'quarterly', 'annual'].map(term => (
                            <div key={term} 
                                 onClick={() => setBillingTerm(term)}
                                 className={`flex-1 p-4 rounded-lg border text-center cursor-pointer transition-all
                                   ${billingTerm === term ? 'border-lime-500 bg-lime-500/20 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
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
                    <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 h-fit">
                      <h3 className="text-xl font-bold mb-6 border-b border-slate-800 pb-4">Estimated Cost</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Modules Cost</span>
                          <span>{formatCurrency(selectedModules.reduce((acc, m) => acc + (MODULE_PRICING[m]||0), 0))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Apps Add-on</span>
                          <span>{formatCurrency(selectedApps.reduce((acc, id) => acc + (availableApps.find(a=>a.id===id)?.price||0), 0))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Seats ({seats} @ ${BASE_SEAT_PRICE})</span>
                          <span>{formatCurrency(seats * BASE_SEAT_PRICE)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-white pt-2 border-t border-slate-800">
                          <span>Monthly Subtotal</span>
                          <span>{formatCurrency(totals.monthly)}</span>
                        </div>
                        {totals.discountAmount > 0 && (
                          <div className="flex justify-between text-lime-400">
                            <span>Term Discount</span>
                            <span>-{formatCurrency(totals.discountAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-400">
                          <span>VAT (7.5%)</span>
                          <span>{formatCurrency(totals.vat)}</span>
                        </div>
                        <div className="flex justify-between text-2xl font-bold text-lime-400 pt-4 border-t border-slate-800 mt-2">
                          <span>Total</span>
                          <span>{formatCurrency(totals.total)}</span>
                        </div>
                        <div className="text-xs text-center text-slate-500 mt-4">
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
                    <CheckCircle className="w-16 h-16 text-lime-500 mx-auto mb-4" />
                    <h2 className="text-3xl font-bold mb-2">Ready to Generate Quote</h2>
                    <p className="text-slate-400">Review your configuration before finalizing.</p>
                  </div>

                  <div className="max-w-2xl mx-auto bg-slate-800/30 border border-slate-700 rounded-xl p-8">
                    <div className="grid grid-cols-2 gap-y-6 text-sm">
                      <div>
                        <div className="text-slate-500 mb-1">Modules</div>
                        <div className="font-medium">{selectedModules.length} Selected</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Applications</div>
                        <div className="font-medium">{selectedApps.length} Premium Apps</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Organization</div>
                        <div className="font-medium">{user?.user_metadata?.organization_name || 'New Organization'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">User Limit</div>
                        <div className="font-medium">{seats} Seats</div>
                      </div>
                      <div className="col-span-2 pt-4 border-t border-slate-700">
                        <div className="flex justify-between items-center">
                          <div className="text-lg font-semibold">Total Contract Value</div>
                          <div className="text-2xl font-bold text-lime-400">{formatCurrency(totals.total)}</div>
                        </div>
                        <div className="text-right text-xs text-slate-500 mt-1">Valid for 14 days</div>
                      </div>
                    </div>
                  </div>

                  {!user && (
                    <div className="max-w-2xl mx-auto mt-8 bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex gap-3 items-center text-amber-200">
                      <Shield className="w-5 h-5 flex-shrink-0" />
                      <p className="text-sm">You need to log in or create an account to save this quote and proceed with payment.</p>
                      <Button variant="outline" size="sm" className="ml-auto border-amber-500/50 hover:bg-amber-500/20 text-amber-100" onClick={() => navigate('/login')}>Log In</Button>
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
            className="border-slate-700 hover:bg-slate-800 text-white w-32"
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          {currentStep < 4 ? (
            <Button 
              onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
              disabled={selectedModules.length === 0}
              className="bg-lime-600 hover:bg-lime-700 text-white w-32"
            >
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button 
              onClick={handleGenerateQuote}
              disabled={quoteGenerating}
              className="bg-gradient-to-r from-lime-500 to-green-600 hover:from-lime-600 hover:to-green-700 text-white px-8 shadow-lg shadow-lime-900/20"
            >
              {quoteGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
              Generate Official Quote
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}