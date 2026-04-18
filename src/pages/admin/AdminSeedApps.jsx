import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Database, CheckCircle, AlertTriangle, CloudRain, Server } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const AdminSeedApps = () => {
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
    <div className="p-6 bg-slate-950 min-h-screen text-slate-100 flex items-center justify-center">
      <Card className="w-full max-w-3xl bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl text-white">
            <Database className="w-6 h-6 text-blue-400" />
            Master Apps Seeder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-slate-400">
            Select a seeding method below. The Legacy Seeder handles generic app seeding, while the Edge Function
            specifically targets the 32 Geoscience applications using server-side logic.
          </p>

          <div className="flex flex-col md:flex-row gap-4 pt-4">
            <Button 
              onClick={handleSeed} 
              disabled={loading}
              variant="outline"
              className="flex-1 border-slate-700 hover:bg-slate-800"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CloudRain className="w-4 h-4 mr-2 text-sky-400" />}
              Legacy Seed (Local)
            </Button>

            <Button 
              onClick={handleEdgeInsert} 
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Server className="w-4 h-4 mr-2" />}
              Insert 32 Apps (Edge Function)
            </Button>
          </div>

          {/* Logs Terminal */}
          <div className="bg-black/50 border border-slate-800 rounded-md p-4 font-mono text-xs max-h-60 overflow-y-auto">
            <div className="text-slate-500 mb-2 uppercase tracking-wider">Console Output</div>
            {logs.length === 0 && <span className="text-slate-600 italic">Ready...</span>}
            {logs.map((log, i) => (
                <div key={i} className="text-green-400 border-b border-white/5 py-1">
                    {log}
                </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-md flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Operation Failed</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-md space-y-4">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Legacy Seeding Summary</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                <div className="bg-slate-950 p-3 rounded border border-slate-800">
                  <span className="block text-xs text-slate-500 uppercase">Total Inserted</span>
                  <span className="text-2xl font-bold text-white">{result.total_inserted}</span>
                </div>
                {/* Result details */}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSeedApps;