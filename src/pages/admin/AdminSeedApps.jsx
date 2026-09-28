import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Database, CheckCircle, AlertTriangle, CloudRain, Server } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

/**
 * The seeder panel. The Admin centre renders it inside its own theme scope;
 * the /admin/seed-apps route renders it through the page below.
 */
export const AdminSeedAppsPanel = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const { toast } = useToast();

  const addLog = (msg) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

  const handleSeed = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setLogs([]); // Clear previous logs
    try {
      addLog('Starting legacy seed process...');
      const { data, error } = await supabase.functions.invoke('seed-master-apps');
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Unknown error');
      
      setResult(data.summary);
      addLog('Legacy seed complete.');
    } catch (err) {
      console.error('Seeding failed:', err);
      setError(err.message);
      addLog(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdgeInsert = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setLogs([]); // Clear logs
    
    try {
        addLog('[EDGE-INSERT] Calling Edge Function to insert 32 apps...');
        
        // Invoke Edge Function
        const { data, error } = await supabase.functions.invoke('insert-geoscience-apps', {
            method: 'POST'
        });

        if (error) throw error;
        
        addLog(`[EDGE-INSERT] Response: ${JSON.stringify(data)}`);

        if (data.success) {
            toast({ title: "Success", description: `Inserted ${data.inserted} apps via Edge Function.` });
            
            // Follow-up Verification
            addLog('[EDGE-INSERT] Verifying database state...');
            
            const { data: apps, error: verifyError } = await supabase
                .from('master_apps')
                .select('status')
                .eq('module_id', 'f44a23a1-c0e0-4ed1-8961-91b3c6c2f091');
                
            if (verifyError) throw verifyError;

            const total = apps.length;
            const active = apps.filter(a => a.status === 'Active').length;
            const comingSoon = apps.filter(a => a.status === 'Coming Soon').length;

            addLog(`[EDGE-INSERT] Verification: Geoscience module now has ${total} apps`);
            addLog(`[EDGE-INSERT] Active apps: ${active}`);
            addLog(`[EDGE-INSERT] Coming Soon apps: ${comingSoon}`);
        } else {
            throw new Error(data.error || 'Function returned failure');
        }

    } catch (err) {
        console.error('Edge insert failed:', err);
        setError(err.message);
        addLog(`[EDGE-INSERT] Error: ${err.message}`);
        toast({ title: "Error", description: "Edge insertion failed", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-pl-text">
            <Database className="w-6 h-6 text-pl-primary-text" aria-hidden="true" />
            Master Apps Seeder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-pl-muted">
            Select a seeding method below. The Legacy Seeder handles generic app seeding, while the Edge Function
            specifically targets the 32 Geoscience applications using server-side logic.
          </p>

          <div className="flex flex-col md:flex-row gap-4 pt-4">
            <Button 
              onClick={handleSeed} 
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CloudRain className="w-4 h-4 mr-2" />}
              Legacy Seed (Local)
            </Button>

            <Button 
              onClick={handleEdgeInsert} 
              disabled={loading}
              className="flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
              Insert 32 Apps (Edge Function)
            </Button>
          </div>

          {/* Logs Terminal */}
          <div className="bg-pl-sunken border border-pl-border rounded-md p-4 font-pl-mono text-xs max-h-60 overflow-y-auto">
            <div className="text-pl-muted mb-2 uppercase tracking-wider">Console Output</div>
            {logs.length === 0 && <span className="text-pl-muted italic">Ready...</span>}
            {logs.map((log, i) => (
                <div key={i} className="text-pl-text border-b border-pl-border py-1 break-words">
                    {log}
                </div>
            ))}
          </div>

          {error && (
            <div role="alert" className="bg-pl-danger-bg border border-pl-danger/40 p-4 rounded-md flex items-center gap-3 text-pl-danger-text">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Operation Failed</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-pl-success-bg border border-pl-success/40 p-4 rounded-md space-y-4">
              <div className="flex items-center gap-2 text-pl-success-text mb-2">
                <CheckCircle className="w-5 h-5" aria-hidden="true" />
                <span className="font-semibold">Legacy Seeding Summary</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm text-pl-text">
                <div className="bg-pl-surface p-3 rounded border border-pl-border">
                  <span className="block text-xs text-pl-muted uppercase">Total Inserted</span>
                  <span className="font-pl-mono tabular-nums text-2xl font-bold text-pl-text">{result.total_inserted}</span>
                </div>
                {/* Result details */}
              </div>
            </div>
          )}
        </CardContent>
    </Card>
  );
};

/** The /admin/seed-apps page: the panel in its own theme scope with a header. */
const AdminSeedApps = () => (
  <AccountScope testId="seed-apps-theme-scope">
    <AccountPage width="max-w-3xl">
      <AccountHeader
        eyebrow="Admin"
        title="Seed Tools"
        description="Seed the master app registry."
        icon={Database}
      />
      <AdminSeedAppsPanel />
    </AccountPage>
  </AccountScope>
);

export default AdminSeedApps;