import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  ArrowLeft, ShieldCheck, Lock, Calendar, Box, RefreshCw, AlertCircle, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { appCategories } from '@/data/applications';

// Helper for normalizing IDs
const normalizeId = (id) => id ? id.toLowerCase().trim().replace(/&/g, 'and').replace(/\s+/g, '-') : '';

export default function ModuleAccess() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { organization } = useAuth();
  
  const [activeLicenses, setActiveLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // We explicitly fetch purchased_modules here to get seats_allocated and detailed metadata
  // instead of relying on the lightweight hook which might abstract away seat counts.
  const fetchModuleData = async () => {
    if (!organization?.id) return;
    
    try {
      setLoading(true);
      
      // 1. Fetch Purchases
      const { data: purchases, error: purError } = await supabase
        .from('purchased_modules')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('status', 'active');

      if (purError) throw purError;

      // 2. Fetch Assignments to calculate usage
      // We need to count how many rows in app_seat_assignments exist for each module/app
      const { data: assignments, error: assignError } = await supabase
        .from('app_seat_assignments')
        .select('app_id, module_id') // module_id might not be in assignments, usually just app_id
        .eq('organization_id', organization.id);

      if (assignError) throw assignError;

      // 3. Fetch Master Apps for Name mapping
      const { data: masterApps } = await supabase
        .from('master_apps')
        .select('id, app_name, slug, module_id');

      // Map UUIDs to Names/Slugs for robust matching
      const idToName = {};
      const uuidToModuleId = {};
      
      masterApps?.forEach(app => {
        idToName[app.id] = app.app_name;
        uuidToModuleId[app.id] = app.module_id;
      });

      // 4. Calculate seat usage
      // Assignments typically store app_id (UUID).
      // If purchase is Module-Level (app_id is NULL), we need to count ANY assignment 
      // to an app that belongs to that module.
      
      const usageMap = {}; // Key: Purchased Module ID (row ID or module_id) -> Count

      // Helper to increment usage
      const incUsage = (key) => {
          usageMap[key] = (usageMap[key] || 0) + 1;
      };

      assignments?.forEach(a => {
          const appUuid = a.app_id;
          const parentModuleUuid = uuidToModuleId[appUuid];
          
          // Increment for direct app match
          incUsage(appUuid);
          
          // Increment for parent module match (if assignment tracks to module license)
          if (parentModuleUuid) incUsage(parentModuleUuid);
      });

      // Enrich purchases with display names and usage counts
      const enrichedPurchases = purchases.map(p => {
        let used = 0;
        
        // Determine what ID to use for usage lookup
        // Priority: Module UUID -> App UUID -> Module Slug -> App ID (text)
        if (p.module_uuid && !p.app_id) {
             used = usageMap[p.module_uuid] || 0;
        } else if (p.app_uuid) {
             used = usageMap[p.app_uuid] || 0;
        } else if (p.module_id) {
             // Fallback for slug-based lookups
             // This is imperfect but helps if UUIDs are missing
             used = usageMap[p.module_id] || 0;
        }

        // Try to find nice name
        let name = p.module_name || p.app_id;
        if (p.app_uuid && idToName[p.app_uuid]) name = idToName[p.app_uuid];
        else if (p.app_id && idToName[p.app_id]) name = idToName[p.app_id]; 
        else {
            // Try matching categories from static data
            const cat = appCategories.find(c => c.id === normalizeId(p.module_id));
            if (cat) name = `Module: ${cat.name}`;
        }

        return {
            ...p,
            display_name: name,
            seats_used: used,
            // Fallback for allocated seats if null (unlimited)
            seats_allocated: p.seats_allocated !== null ? p.seats_allocated : -1 
        };
      });

      setActiveLicenses(enrichedPurchases);

    } catch (err) {
      console.error("ModuleAccess data fetch error:", err);
      toast({ title: "Error loading data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organization?.id) {
      fetchModuleData();
    }
  }, [organization?.id]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchModuleData();
    // Simulate delay for feel
    setTimeout(() => {
        setSyncing(false);
        toast({ title: "Sync Complete", description: "Subscriptions and access rights refreshed.", className: "bg-green-600 text-white" });
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">App & Seat Management</h1>
                    <p className="text-slate-400">Manage licenses and user assignments per application.</p>
                </div>
            </div>
            <Button onClick={handleSync} disabled={syncing} variant="outline" className="border-slate-700 hover:bg-slate-800">
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`}/>
                {syncing ? 'Syncing...' : 'Sync Data'}
            </Button>
        </div>

        <div className="space-y-8">
            
            {/* Active Licenses Section */}
            <section>
                <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <Box className="w-5 h-5 text-lime-400"/> Active Licenses
                </h2>
                
                {loading ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-lg border border-slate-800">Loading module data...</div>
                ) : activeLicenses.length === 0 ? (
                    <Card className="bg-slate-900 border-slate-800 border-dashed">
                        <CardContent className="p-8 text-center">
                            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2"/>
                            <p className="text-slate-400 mb-4">No active subscriptions found.</p>
                            <Button className="bg-lime-600 hover:bg-lime-700 text-white" onClick={() => navigate('/dashboard/upgrade')}>
                                Purchase Modules
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {activeLicenses.map(mod => {
                            const used = mod.seats_used || 0;
                            const total = mod.seats_allocated; // Can be -1 for unlimited
                            const isUnlimited = total === -1 || total === null;
                            
                            // Determine type
                            const isBundle = !mod.app_id || mod.app_id.includes('module');

                            return (
                                <Card key={mod.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
                                    <CardContent className="p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="font-bold text-lg text-white">{mod.display_name}</h3>
                                                <Badge className="bg-green-500/20 text-green-400 border-green-500/50 hover:bg-green-500/30">Active</Badge>
                                            </div>
                                            <div className="text-sm text-slate-400 flex items-center gap-4">
                                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> Expires: {mod.expiry_date ? new Date(mod.expiry_date).toLocaleDateString() : 'Never'}</span>
                                                <span className="text-slate-600">|</span>
                                                <span className="flex items-center gap-1">Type: {isBundle ? 'Module Bundle' : 'Single App'}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-white flex items-center justify-end gap-2">
                                                    {used} <span className="text-slate-500 text-lg font-normal">/ {isUnlimited ? '∞' : total}</span>
                                                </div>
                                                <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                                                    <Users className="w-3 h-3"/> Seats Used
                                                </p>
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                className="border-slate-700 hover:bg-slate-800"
                                                onClick={() => navigate('/dashboard/employees')}
                                            >
                                                Manage Seats
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Overview / Availability Matrix */}
            <section>
                <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-5 h-5 text-blue-400"/> Availability Overview
                </h2>
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Module Status</CardTitle>
                        <CardDescription>Status of core modules based on your active subscriptions.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                        {appCategories.filter(c => c.id !== 'hse').map(cat => {
                            // Check if any license belongs to this module (UUID or Slug match)
                            const active = activeLicenses.some(l => 
                                (l.module_id && l.module_id.toLowerCase() === cat.id) || 
                                (l.module_name && l.module_name.toLowerCase() === cat.name.toLowerCase()) ||
                                (l.module_uuid && l.module_uuid === cat.id) // Assuming cat.id might track to UUID in some contexts, mostly it's slug
                            );
                            
                            return (
                                <div key={cat.id} className={`p-3 rounded border flex items-center justify-between ${active ? 'bg-slate-950 border-green-900/30' : 'bg-slate-950/50 border-slate-800 opacity-60'}`}>
                                    <span className="font-medium text-sm">{cat.name}</span>
                                    {active ? <ShieldCheck className="w-4 h-4 text-green-500"/> : <Lock className="w-4 h-4 text-slate-600"/>}
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </section>

        </div>
      </div>
    </div>
  );
}