import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Database, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SystemHealth = () => {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbStats, setDbStats] = useState({
    appsCount: 0,
    modulesCount: 0,
    legacyAppsCount: 0
  });

  const fetchHealth = async () => {
    setLoading(true);
    try {
      // Fetch Integrity Report View (created via migration)
      const { data: integrityData, error: integrityError } = await supabase
        .from('admin_data_integrity_report')
        .select('*');
      
      if (!integrityError) {
        setReport(integrityData);
      }

      // Fetch Counts
      const { count: appsCount } = await supabase.from('master_apps').select('*', { count: 'exact', head: true });
      const { count: modulesCount } = await supabase.from('modules').select('*', { count: 'exact', head: true });
      const { count: legacyAppsCount } = await supabase.from('apps').select('*', { count: 'exact', head: true });

      setDbStats({ appsCount, modulesCount, legacyAppsCount });

    } catch (err) {
      console.error("Health check failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-white space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="w-8 h-8 text-blue-400" /> 
            System Health & Integrity
          </h1>
          <p className="text-slate-400 mt-1">Database schema verification and orphan record detection.</p>
        </div>
        <Button onClick={fetchHealth} variant="outline" className="border-slate-700 text-slate-300 hover:text-white">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-slate-300">Master Apps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">{dbStats.appsCount || 0}</div>
            <div className="text-xs text-green-400 flex items-center gap-1 mt-2">
              <CheckCircle className="w-3 h-3" /> Canonical Registry
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-slate-300">Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-white">{dbStats.modulesCount || 0}</div>
            <div className="text-xs text-blue-400 flex items-center gap-1 mt-2">
              <CheckCircle className="w-3 h-3" /> Core Domains
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-10"><AlertTriangle className="w-24 h-24"/></div>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-slate-300">Legacy Apps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-amber-500">{dbStats.legacyAppsCount || 0}</div>
            <div className="text-xs text-amber-400 flex items-center gap-1 mt-2">
              <AlertTriangle className="w-3 h-3" /> Deprecated Table
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Data Integrity Report</CardTitle>
          <CardDescription>Issues requiring attention in the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-slate-900">
                <TableHead className="text-slate-400">Issue Type</TableHead>
                <TableHead className="text-slate-400">Count</TableHead>
                <TableHead className="text-slate-400">Description</TableHead>
                <TableHead className="text-slate-400 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center h-24">Loading analysis...</TableCell></TableRow>
              ) : report.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center h-24 text-slate-500">No issues found. Database is healthy.</TableCell></TableRow>
              ) : (
                report.map((row, idx) => (
                  <TableRow key={idx} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell className="font-medium text-white">{row.issue_type}</TableCell>
                    <TableCell className="font-mono text-slate-300">{row.count}</TableCell>
                    <TableCell className="text-slate-400">{row.description}</TableCell>
                    <TableCell className="text-right">
                      {row.count > 0 ? (
                        <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/50">Action Needed</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50">Healthy</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemHealth;