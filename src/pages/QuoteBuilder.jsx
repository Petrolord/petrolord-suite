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

  // Real-time listener
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

  // Logging
  useEffect(() => {
      if (masterApps.length > 0) {
          const comingSoonCount = masterApps.filter(a => a.status === 'Coming Soon' || a.status === 'coming soon').length;
          const activeCount = masterApps.filter(a => a.status === 'Active' || a.status === 'active').length;
          
          console.log(`[STATUS-CHANGE] Coming Soon apps currently disabled: ${comingSoonCount}`);
          console.log(`[STATUS-CHANGE] Active apps currently enabled: ${activeCount}`);
      }
  }, [masterApps]);

  // Basic catalog fetching simulation
  const fetchCatalog = async () => {
    setIsLoadingCatalog(true);
    setLoadingStatus('Loading catalog...');
    addDebugLog('--- Starting Catalog Fetch Sequence ---');
    
    try {
      // Simulate loading
      await new Promise(resolve => setTimeout(resolve, 1000));
      setMasterApps([]);
      setAppsGroupedByModule({});
      addDebugLog('Catalog loaded successfully');
    } catch (error) {
      setCatalogError(error.message);
      addDebugLog('Catalog loading failed: ' + error.message);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const calculatePricing = () => {
    const basePrice = selectedModules.length * 100;
    const appPrice = selectedApps.length * 50;
    const seatPrice = userSeats * 10;
    const total = basePrice + appPrice + seatPrice;
    
    return {
      modules: basePrice,
      apps: appPrice,
      seats: seatPrice,
      subtotal: total,
      discount: total * (manualDiscount / 100),
      total: total * (1 - manualDiscount / 100)
    };
  };

  const pricing = calculatePricing();

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-lime-300">Quote Builder</h1>
            <p className="text-slate-400 mt-2">Configure your Petrolord Suite subscription</p>
          </div>
          <Button 
            onClick={() => navigate('/dashboard')}
            variant="outline" 
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-slate-900 border-slate-800 p-6">
              <h2 className="text-xl font-semibold mb-4">Module Selection</h2>
              {isLoadingCatalog ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-lime-400" />
                  <span className="ml-3 text-slate-400">{loadingStatus}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {['geoscience', 'reservoir', 'drilling', 'production', 'economics', 'facilities'].map(module => (
                    <div key={module} className="flex items-center space-x-3 p-3 border border-slate-800 rounded">
                      <Checkbox 
                        checked={selectedModules.includes(module)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedModules([...selectedModules, module]);
                          } else {
                            setSelectedModules(selectedModules.filter(m => m !== module));
                          }
                        }}
                      />
                      <span className="capitalize text-white font-medium">{module}</span>
                      <Badge variant="outline" className="ml-auto">$100/month</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="bg-slate-900 border-slate-800 p-6">
              <h2 className="text-xl font-semibold mb-4">User Seats</h2>
              <div className="space-y-4">
                <div>
                  <Label>Number of Users: {userSeats}</Label>
                  <Slider
                    value={[userSeats]}
                    onValueChange={([value]) => setUserSeats(value)}
                    min={1}
                    max={100}
                    step={1}
                    className="mt-2"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Pricing Summary */}
          <div className="space-y-6">
            <Card className="bg-slate-900 border-slate-800 p-6">
              <h2 className="text-xl font-semibold mb-4">Pricing Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Modules ({selectedModules.length})</span>
                  <span>${pricing.modules}/month</span>
                </div>
                <div className="flex justify-between">
                  <span>User Seats ({userSeats})</span>
                  <span>${pricing.seats}/month</span>
                </div>
                <div className="flex justify-between">
                  <span>Apps ({selectedApps.length})</span>
                  <span>${pricing.apps}/month</span>
                </div>
                <div className="border-t border-slate-800 pt-3">
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span>${pricing.total.toFixed(2)}/month</span>
                  </div>
                </div>
              </div>
              
              <Button 
                className="w-full mt-6 bg-lime-600 hover:bg-lime-700"
                onClick={() => {
                  toast({ title: "Quote Generated!", description: "Your quote has been prepared." });
                }}
                disabled={generating}
              >
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Generate Quote
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuoteBuilder;