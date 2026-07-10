import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Waves, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';

// Walking-skeleton shell: proves page → seismolord-engine edge function →
// Storage manifest round-trip. The interpretation canvas (WebGL2), Zustand
// store and workers come in later phases (see docs/scope/Seismolord-PLAYBOOK.md).
export default function Seismolord() {
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const checkBackend = useCallback(async () => {
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('seismolord-engine', {
        body: { action: 'ping' },
      });
      if (fnError) throw fnError;
      setResult(data);
    } catch (e) {
      setError(e.message || 'Backend check failed');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  return (
    <>
      <Helmet>
        <title>Seismolord - Petrolord Suite</title>
        <meta
          name="description"
          content="Seismic interpretation: SEG-Y loading, inline/crossline/time-slice viewing, horizon and fault picking, surface gridding and export."
        />
      </Helmet>

      <div className="p-4 sm:p-8 max-w-[1920px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="flex items-center space-x-4 mb-4">
            <Link to="/dashboard/geoscience">
              <Button variant="outline" size="sm" className="border-lime-400/50 text-lime-300 hover:bg-lime-500/20">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Geoscience
              </Button>
            </Link>
          </div>

          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-3 rounded-xl shadow-lg shadow-blue-500/20">
              <Waves className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Seismolord</h1>
              <p className="text-cyan-200 text-lg mt-1">
                Seismic interpretation — SEG-Y loading, section viewing, horizon &amp; fault picking, surface export
              </p>
            </div>
          </div>
        </motion.div>

        <Card className="bg-slate-900/60 border-slate-700 max-w-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-white">Backend connectivity</CardTitle>
            <Button variant="outline" size="sm" onClick={checkBackend} disabled={checking}>
              <RefreshCw className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
              Check backend
            </Button>
          </CardHeader>
          <CardContent>
            {checking && (
              <div className="flex items-center text-slate-300">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Calling seismolord-engine…
              </div>
            )}
            {!checking && result && (
              <div>
                <div className="flex items-center text-emerald-400 mb-3">
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  <span className="font-semibold">
                    {result.status === 'ok' ? 'status: "ok"' : `status: ${String(result.status)}`}
                  </span>
                </div>
                <pre className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 text-sm text-slate-200 overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
            {!checking && error && (
              <div className="flex items-start text-red-400">
                <XCircle className="w-5 h-5 mr-2 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
