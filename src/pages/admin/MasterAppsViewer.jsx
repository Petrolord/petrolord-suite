import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Lock, Calendar, Users } from 'lucide-react';

const MasterAppsViewer = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'app_name', direction: 'asc' });
  
  // Task 6: Integrate Entitlements Hook
  const { 
    loading: entLoading, 
    refetch: refreshEntitlements, 
    hasAccessToApp, 
    getAppAccessInfo,
    entitlements
  } = useUserEntitlements();

  const fetchApps = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('master_apps')
        .select('*');
      
      if (error) throw error;
      setApps(data || []);
    } catch (error) {
      console.error('Error fetching master apps:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
    refreshEntitlements(); // Ensure entitlements are fresh
  }, []);

  const refreshAll = () => {
    fetchApps();
    refreshEntitlements();
  };

  // Statistics Calculations
  const stats = useMemo(() => {
    const total = apps.length;
    const byModule = {};
    const orphans = [];
    const activeEntitlements = entitlements?.accessible_app_ids?.length || 0;

    apps.forEach(app => {
      const mod = app.module || 'Unknown';
      byModule[mod] = (byModule[mod] || 0) + 1;

      if (!app.module_id) {
        orphans.push(app);
      }
    });

    return { total, byModule, orphans, activeEntitlements };
  }, [apps, entitlements]);

  // Filtering and Sorting
  const processedApps = useMemo(() => {
    let result = [...apps];

    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(app => 
        (app.app_name?.toLowerCase() || '').includes(lowerFilter) ||
        (app.module?.toLowerCase() || '').includes(lowerFilter)
      );
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [apps, filterText, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-600 opacity-50" />;
    return <ArrowUpDown className={`w-3 h-3 ml-1 ${sortConfig.direction === 'asc' ? 'text-blue-400' : 'text-orange-400'}`} />;
  };

  return (
    <div className="p-6 bg-slate-950 min-h-screen text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Master Apps Viewer</h1>
          <p className="text-slate-400">Registry inspection with real-time entitlement status.</p>
        </div>
        <Button onClick={refreshAll} variant="outline" className="gap-2 border-slate-700 hover:bg-slate-800">
          <RefreshCw className={`w-4 h-4 ${(loading || entLoading) ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      {/* Statistics Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Active Licenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-lime-400">
              {entLoading ? '...' : stats.activeEntitlements}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Apps accessible to your organization
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Registry Stats</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-6">
             <div>
                <span className="text-2xl font-bold text-white">{stats.total}</span>
                <span className="text-xs text-slate-500 ml-2">Total Apps</span>
             </div>
             <div>
                <span className={`text-2xl font-bold ${stats.orphans.length > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {stats.orphans.length}
                </span>
                <span className="text-xs text-slate-500 ml-2">Orphans (No Module ID)</span>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800 w-full md:w-1/3">
          <Input 
            placeholder="Filter by App Name or Module..." 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="bg-transparent border-none focus-visible:ring-0 text-white placeholder:text-slate-500"
          />
        </div>

        <div className="rounded-md border border-slate-800 overflow-hidden bg-slate-900">
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-950 sticky top-0 z-10 shadow-sm">
                <TableRow className="border-slate-800 hover:bg-slate-950">
                  <TableHead className="cursor-pointer text-slate-300 hover:text-white transition-colors" onClick={() => handleSort('app_name')}>
                    <div className="flex items-center">App Name <SortIcon column="app_name" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer text-slate-300 hover:text-white transition-colors" onClick={() => handleSort('module')}>
                    <div className="flex items-center">Module <SortIcon column="module" /></div>
                  </TableHead>
                  <TableHead className="text-center text-slate-300">Access Status</TableHead>
                  <TableHead className="text-center text-slate-300">Seat Usage</TableHead>
                  <TableHead className="text-center text-slate-300">Entitlement Expiry</TableHead>
                  <TableHead className="cursor-pointer text-slate-300 hover:text-white transition-colors text-right" onClick={() => handleSort('created_at')}>
                    <div className="flex items-center justify-end">Created <SortIcon column="created_at" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                      <div className="flex justify-center items-center h-full">Loading records...</div>
                    </TableCell>
                  </TableRow>
                ) : processedApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">No records found matching filters.</TableCell>
                  </TableRow>
                ) : (
                  processedApps.map((app) => {
                    const hasAccess = hasAccessToApp(app.id);
                    const accessInfo = getAppAccessInfo(app.id);
                    
                    return (
                      <TableRow key={app.id} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                        <TableCell className="font-medium text-slate-200">
                          {app.app_name}
                          {!app.module_id && <span className="ml-2 text-[10px] text-red-500 font-bold bg-red-950 px-1 rounded">NULL MODULE ID</span>}
                        </TableCell>
                        <TableCell className="text-slate-400">{app.module}</TableCell>
                        
                        {/* Access Status Badge */}
                        <TableCell className="text-center">
                          {hasAccess ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500 border-slate-700 bg-slate-900">
                              <Lock className="w-3 h-3 mr-1" /> Locked
                            </Badge>
                          )}
                        </TableCell>

                        {/* Seat Usage */}
                        <TableCell className="text-center text-xs text-slate-400">
                          {accessInfo && accessInfo.seats_allocated ? (
                            <div className="flex items-center justify-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>{accessInfo.seats_used || 0} / {accessInfo.seats_allocated}</span>
                            </div>
                          ) : (
                            <span className="text-slate-700">-</span>
                          )}
                        </TableCell>

                        {/* Expiry Date */}
                        <TableCell className="text-center">
                          {hasAccess && accessInfo?.expiry_date ? (
                            <div className="flex items-center justify-center text-xs text-slate-400 gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(accessInfo.expiry_date).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right text-slate-500 text-xs tabular-nums">
                          {new Date(app.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="p-2 bg-slate-950 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
            <span>Showing {processedApps.length} records</span>
            <span>Sorted by {sortConfig.key} ({sortConfig.direction})</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterAppsViewer;