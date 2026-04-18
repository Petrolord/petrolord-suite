import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, Eye, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AuditLogs() {
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
        const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();
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
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-white space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldAlert className="w-8 h-8 text-blue-400"/> Audit Logs</h1>
            <p className="text-slate-400">Track all activities and security events within your organization.</p>
        </div>
        <Button onClick={downloadCSV} variant="outline" className="border-slate-700"><Download className="w-4 h-4 mr-2"/> Export CSV</Button>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="flex flex-col md:flex-row gap-4 justify-between pb-2">
            <div className="flex gap-2 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Search logs..." 
                        className="pl-8 bg-slate-950 border-slate-700"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select value={filterAction} onValueChange={setFilterAction}>
                    <SelectTrigger className="w-[180px] bg-slate-950 border-slate-700">
                        <SelectValue placeholder="Filter by Action" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                        <SelectItem value="all">All Actions</SelectItem>
                        {uniqueActions.map(action => (
                            <SelectItem key={action} value={action}>{action}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-slate-900">
                        <TableHead className="text-slate-400">Date & Time</TableHead>
                        <TableHead className="text-slate-400">Action</TableHead>
                        <TableHead className="text-slate-400">Actor</TableHead>
                        <TableHead className="text-slate-400">Resource</TableHead>
                        <TableHead className="text-slate-400 text-right">Details</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24">Loading logs...</TableCell></TableRow>
                    ) : filteredLogs.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center h-24 text-slate-500">No logs found.</TableCell></TableRow>
                    ) : (
                        filteredLogs.map(log => (
                            <TableRow key={log.id} className="border-slate-800 hover:bg-slate-800/50">
                                <TableCell className="text-slate-300 font-mono text-xs">
                                    {new Date(log.created_at).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="bg-slate-800 border-slate-700 text-blue-400">{log.action}</Badge>
                                </TableCell>
                                <TableCell className="text-white text-sm truncate max-w-[150px]" title={log.actor_id}>
                                    {log.actor_id ? log.actor_id.substring(0,8) + '...' : 'System'}
                                </TableCell>
                                <TableCell className="text-slate-400 text-sm">
                                    {log.resource_type}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                                        <Eye className="w-4 h-4 text-slate-400 hover:text-white"/>
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
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
            <DialogHeader>
                <DialogTitle>Log Details</DialogTitle>
                <DialogDescription>Event ID: {selectedLog?.id}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 font-mono text-sm">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950 p-3 rounded border border-slate-800">
                        <p className="text-slate-500 text-xs uppercase">IP Address</p>
                        <p>{selectedLog?.ip_address}</p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800">
                        <p className="text-slate-500 text-xs uppercase">User Agent</p>
                        <p className="truncate" title={selectedLog?.user_agent}>{selectedLog?.user_agent}</p>
                    </div>
                </div>
                <div className="bg-slate-950 p-4 rounded border border-slate-800 overflow-auto max-h-96">
                    <p className="text-slate-500 text-xs uppercase mb-2">Full Details JSON</p>
                    <pre className="text-green-400 whitespace-pre-wrap">
                        {JSON.stringify(selectedLog?.details, null, 2)}
                    </pre>
                </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}