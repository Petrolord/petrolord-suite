import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  History, Search, Filter, Hammer, CheckCircle2, AlertTriangle, 
  GitCommit, Clock, User, FileText, Database 
} from 'lucide-react';

const ActionBadge = ({ action }) => {
  // Badge variants: status colour with the action word and an icon.
  const styles = {
    created: "info",
    updated: "warning",
    fixed: "neutral",
    tested: "success",
    seeded: "neutral"
  };
  
  const icons = {
    created: Hammer,
    updated: GitCommit,
    fixed: AlertTriangle,
    tested: CheckCircle2,
    seeded: Database
  };

  const Icon = icons[action] || FileText;

  return (
    <Badge variant={styles[action] || styles.updated} className="flex items-center gap-1 w-fit">
      <Icon className="w-3 h-3" />
      <span className="capitalize">{action}</span>
    </Badge>
  );
};

const TimelineItem = ({ item, isLast }) => (
  <div className="relative pl-8 pb-8">
    {!isLast && <div className="absolute left-[11px] top-8 bottom-0 w-px bg-pl-border" />}
    <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-pl-surface border border-pl-border-strong flex items-center justify-center z-10">
      <div className={`h-2 w-2 rounded-full ${
        item.action === 'created' ? 'bg-pl-info' :
        item.action === 'tested' ? 'bg-pl-success' :
        'bg-pl-muted'
      }`} />
    </div>
    
    <div className="bg-pl-surface border border-pl-border rounded-lg p-4">
      <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
        <div>
          <h4 className="font-semibold text-pl-text">{item.app_name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <ActionBadge action={item.action} />
            <span className="text-xs text-pl-muted flex items-center gap-1">
              <Clock className="w-3 h-3" /> {new Date(item.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-pl-muted bg-pl-sunken px-2 py-1 rounded border border-pl-border">
          <User className="w-3 h-3" />
          {item.built_by || 'Unknown'}
        </div>
      </div>
      <p className="text-sm text-pl-muted leading-relaxed">
        {item.description || "No description provided."}
      </p>
    </div>
  </div>
);

export default function BuildHistoryAdmin() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [view, setView] = useState('table');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('app_build_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (searchTerm) {
        query = query.ilike('app_name', `%${searchTerm}%`);
      }

      const { data, error } = await query.limit(100); // Limit for performance
      if (error) throw error;
      setHistory(data);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [searchTerm, actionFilter]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-pl-border pb-4">
        <div>
          <h2 className="text-2xl font-bold text-pl-text flex items-center gap-2">
            <History className="text-pl-primary-text" aria-hidden="true" /> Build History
          </h2>
          <p className="text-pl-muted text-sm">Track creation, updates, fixes, and testing of applications.</p>
        </div>
        <div className="flex items-center gap-2 bg-pl-sunken p-1 rounded-lg border border-pl-border">
          <Button 
            variant={view === 'table' ? 'secondary' : 'ghost'} 
            size="sm" 
            onClick={() => setView('table')}
          >
            Table
          </Button>
          <Button 
            variant={view === 'timeline' ? 'secondary' : 'ghost'} 
            size="sm" 
            onClick={() => setView('timeline')}
          >
            Timeline
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center bg-pl-surface p-4 rounded-lg border border-pl-border">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
          <Input 
            placeholder="Search by app name..." 
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="tested">Tested</SelectItem>
            <SelectItem value="seeded">Seeded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto bg-pl-surface rounded-lg border border-pl-border">
        {loading ? (
          <div className="p-8 text-center text-pl-muted">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-pl-muted">No history found matching filters.</div>
        ) : view === 'table' ? (
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>App Name</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Builder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-pl-muted text-xs whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium text-pl-text">
                    {item.app_name}
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={item.action} />
                  </TableCell>
                  <TableCell className="text-pl-muted text-sm max-w-md truncate" title={item.description}>
                    {item.description}
                  </TableCell>
                  <TableCell className="text-pl-muted text-xs">
                    {item.built_by}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-6 max-w-3xl mx-auto">
            {history.map((item, idx) => (
              <TimelineItem key={item.id} item={item} isLast={idx === history.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}