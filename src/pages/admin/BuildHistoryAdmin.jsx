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
  const styles = {
    created: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    updated: "bg-amber-500/20 text-amber-400 border-amber-500/50",
    fixed: "bg-purple-500/20 text-purple-400 border-purple-500/50",
    tested: "bg-green-500/20 text-green-400 border-green-500/50",
    seeded: "bg-slate-500/20 text-slate-400 border-slate-500/50"
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
    <Badge variant="outline" className={`${styles[action] || styles.updated} flex items-center gap-1 w-fit`}>
      <Icon className="w-3 h-3" />
      <span className="capitalize">{action}</span>
    </Badge>
  );
};

const TimelineItem = ({ item, isLast }) => (
  <div className="relative pl-8 pb-8">
    {!isLast && <div className="absolute left-[11px] top-8 bottom-0 w-px bg-slate-800" />}
    <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center z-10">
      <div className={`h-2 w-2 rounded-full ${
        item.action === 'created' ? 'bg-blue-500' :
        item.action === 'tested' ? 'bg-green-500' :
        'bg-slate-500'
      }`} />
    </div>
    
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-semibold text-slate-200">{item.app_name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <ActionBadge action={item.action} />
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {new Date(item.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
          <User className="w-3 h-3" />
          {item.built_by || 'Unknown'}
        </div>
      </div>
      <p className="text-sm text-slate-400 leading-relaxed">
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <History className="text-blue-400" /> Build History
          </h2>
          <p className="text-slate-400 text-sm">Track creation, updates, fixes, and testing of applications.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
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

      <div className="flex gap-4 items-center bg-slate-900 p-4 rounded-lg border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
          <Input 
            placeholder="Search by app name..." 
            className="pl-8 bg-slate-950 border-slate-800"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px] bg-slate-950 border-slate-800">
            <SelectValue placeholder="Filter Action" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-800 text-white">
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="tested">Tested</SelectItem>
            <SelectItem value="seeded">Seeded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto bg-slate-950 rounded-lg border border-slate-800">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No history found matching filters.</div>
        ) : view === 'table' ? (
          <Table>
            <TableHeader className="bg-slate-900 sticky top-0 z-10">
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-400">Date</TableHead>
                <TableHead className="text-slate-400">App Name</TableHead>
                <TableHead className="text-slate-400">Action</TableHead>
                <TableHead className="text-slate-400">Description</TableHead>
                <TableHead className="text-slate-400">Builder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id} className="border-slate-800 hover:bg-slate-900/50">
                  <TableCell className="text-slate-400 text-xs whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium text-slate-200">
                    {item.app_name}
                  </TableCell>
                  <TableCell>
                    <ActionBadge action={item.action} />
                  </TableCell>
                  <TableCell className="text-slate-400 text-sm max-w-md truncate" title={item.description}>
                    {item.description}
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs">
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