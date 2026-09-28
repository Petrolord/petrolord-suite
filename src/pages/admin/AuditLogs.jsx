import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, Eye, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    if (user) fetchLogs();
  }, [user]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
        const orgUser = await getUserOrgRow(user.id);
        if (orgUser) {
            const { data, error } = await supabase
                .from('organization_audit_logs')
                .select('*')
                .eq('organization_id', orgUser.organization_id)
                .order('created_at', { ascending: false })
                .limit(100); // Pagination could be added
            
            if (error) throw error;
            setLogs(data);
        }
    } catch (err) {
        console.error("Error fetching logs:", err);
    } finally {
        setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
      const matchesAction = filterAction === 'all' || log.action === filterAction;
      const matchesSearch = 
        log.actor_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.resource_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        JSON.stringify(log.details).toLowerCase().includes(searchTerm.toLowerCase());
      return matchesAction && matchesSearch;
  });

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const downloadCSV = () => {
      const headers = ['Date', 'Actor', 'Action', 'Resource Type', 'Details', 'IP'];
      const rows = filteredLogs.map(l => [
          new Date(l.created_at).toLocaleString(),
          l.actor_id || 'System',
          l.action,
          l.resource_type,
          JSON.stringify(l.details).replace(/,/g, ';'), // simple csv escape
          l.ip_address
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
  };

  return (
    <AccountPage>
      <AccountHeader
        eyebrow="Administration"
        icon={ShieldAlert}
        title="Audit Logs"
        description="Track all activities and security events within your organization."
        actions={<Button onClick={downloadCSV} variant="outline"><Download className="w-4 h-4 mr-2"/> Export CSV</Button>}
      />

      <Card>
        <CardHeader className="flex flex-col md:flex-row gap-4 justify-between pb-2">
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
                    <Input 
                        placeholder="Search logs..." 
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select value={filterAction} onValueChange={setFilterAction}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filter by Action" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        {uniqueActions.map(action => (
                            <SelectItem key={action} value={action}>{action}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24 text-pl-muted">Loading logs...</TableCell></TableRow>
                    ) : filteredLogs.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24 text-pl-muted">No logs found.</TableCell></TableRow>
                    ) : (
                        filteredLogs.map(log => (
                            <TableRow key={log.id}>
                                <TableCell className="text-pl-text font-pl-mono tabular-nums text-xs">
                                    {new Date(log.created_at).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="neutral">{log.action}</Badge>
                                </TableCell>
                                <TableCell className="text-pl-text text-sm truncate max-w-[150px]" title={log.actor_id}>
                                    {log.actor_id ? log.actor_id.substring(0,8) + '...' : 'System'}
                                </TableCell>
                                <TableCell className="text-pl-muted text-sm">
                                    {log.resource_type}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)} aria-label="View log details">
                                        <Eye className="w-4 h-4 text-pl-muted"/>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(val) => !val && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>Log Details</DialogTitle>
                <DialogDescription>Event ID: {selectedLog?.id}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 font-pl-mono text-sm text-pl-text">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-pl-sunken p-3 rounded border border-pl-border min-w-0">
                        <p className="text-pl-muted text-xs uppercase">IP Address</p>
                        <p>{selectedLog?.ip_address}</p>
                    </div>
                    <div className="bg-pl-sunken p-3 rounded border border-pl-border min-w-0">
                        <p className="text-pl-muted text-xs uppercase">User Agent</p>
                        <p className="truncate" title={selectedLog?.user_agent}>{selectedLog?.user_agent}</p>
                    </div>
                </div>
                <div className="bg-pl-sunken p-4 rounded border border-pl-border overflow-auto max-h-96">
                    <p className="text-pl-muted text-xs uppercase mb-2">Full Details JSON</p>
                    <pre className="text-pl-text whitespace-pre-wrap">
                        {JSON.stringify(selectedLog?.details, null, 2)}
                    </pre>
                </div>
            </div>
        </DialogContent>
      </Dialog>
    </AccountPage>
  );
}

export default function AuditLogs() {
  return (
    <AccountScope testId="audit-logs-theme-scope">
      <AuditLogsPage />
    </AccountScope>
  );
}
