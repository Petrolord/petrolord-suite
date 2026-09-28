import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Database, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile } from '@/components/ui/stat-tile';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

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
    <AccountPage>
      <AccountHeader
        eyebrow="Admin"
        title="System Health & Integrity"
        description="Database schema verification and orphan record detection."
        icon={Database}
        actions={(
          <Button onClick={fetchHealth} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <StatTile
          label="Master Apps"
          value={dbStats.appsCount || 0}
          status="success"
          hint={<span className="inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" aria-hidden="true" /> Canonical Registry</span>}
        />
        <StatTile
          label="Modules"
          value={dbStats.modulesCount || 0}
          status="info"
          hint={<span className="inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" aria-hidden="true" /> Core Domains</span>}
        />
        <StatTile
          label="Legacy Apps"
          value={dbStats.legacyAppsCount || 0}
          status="warning"
          hint={<span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" aria-hidden="true" /> Deprecated Table</span>}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Integrity Report</CardTitle>
          <CardDescription>Issues requiring attention in the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue Type</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center h-24 text-pl-muted">Loading analysis...</TableCell></TableRow>
              ) : report.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center h-24 text-pl-muted">No issues found. Database is healthy.</TableCell></TableRow>
              ) : (
                report.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-pl-text">{row.issue_type}</TableCell>
                    <TableCell className="font-pl-mono tabular-nums text-pl-text">{row.count}</TableCell>
                    <TableCell className="text-pl-muted">{row.description}</TableCell>
                    <TableCell className="text-right">
                      {row.count > 0 ? (
                        <Badge variant="danger" className="gap-1"><AlertTriangle className="w-3 h-3" aria-hidden="true" /> Action Needed</Badge>
                      ) : (
                        <Badge variant="success" className="gap-1"><CheckCircle className="w-3 h-3" aria-hidden="true" /> Healthy</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AccountPage>
  );
};

const SystemHealthPage = () => (
  <AccountScope testId="system-health-theme-scope">
    <SystemHealth />
  </AccountScope>
);

export default SystemHealthPage;