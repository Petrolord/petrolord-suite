import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useUserEntitlements } from '@/hooks/useUserEntitlements';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Lock, Calendar, Users } from 'lucide-react';
import { StatTile } from '@/components/ui/stat-tile';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

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
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 text-pl-muted opacity-50" aria-hidden="true" />;
    return <ArrowUpDown className={`w-3 h-3 ml-1 text-pl-primary-text ${sortConfig.direction === 'asc' ? '' : 'rotate-180'}`} aria-hidden="true" />;
  };

  return (
    <AccountPage width="max-w-7xl">
      <AccountHeader
        eyebrow="Admin"
        title="Master Apps Viewer"
        description="Registry inspection with real-time entitlement status."
        actions={(
          <Button onClick={refreshAll} variant="outline" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${(loading || entLoading) ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        )}
      />

      {/* Statistics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label="Active Licenses"
          value={entLoading ? '...' : stats.activeEntitlements}
          hint="Apps accessible to your organization"
        />
        <StatTile label="Total Apps" value={stats.total} hint="In the master registry" />
        <StatTile
          label="Orphans (No Module ID)"
          value={stats.orphans.length}
          status={stats.orphans.length > 0 ? 'danger' : 'success'}
          hint={stats.orphans.length > 0 ? 'Apps without a module ID' : 'Every app has a module ID'}
        />
      </div>

      {/* Main Table */}
      <div className="space-y-4">
        <div className="w-full md:w-1/3">
          <Input 
            placeholder="Filter by App Name or Module..." 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            aria-label="Filter by App Name or Module"
          />
        </div>

        <div className="rounded-md border border-pl-border overflow-hidden bg-pl-surface">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 shadow-pl-sm">
                <TableRow>
                  <TableHead className="cursor-pointer hover:text-pl-text transition-colors" onClick={() => handleSort('app_name')}>
                    <div className="flex items-center">App Name <SortIcon column="app_name" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-pl-text transition-colors" onClick={() => handleSort('module')}>
                    <div className="flex items-center">Module <SortIcon column="module" /></div>
                  </TableHead>
                  <TableHead className="text-center">Access Status</TableHead>
                  <TableHead className="text-center">Seat Usage</TableHead>
                  <TableHead className="text-center">Entitlement Expiry</TableHead>
                  <TableHead className="cursor-pointer hover:text-pl-text transition-colors text-right" onClick={() => handleSort('created_at')}>
                    <div className="flex items-center justify-end">Created <SortIcon column="created_at" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-pl-muted">
                      <div className="flex justify-center items-center h-full">Loading records...</div>
                    </TableCell>
                  </TableRow>
                ) : processedApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-pl-muted">No records found matching filters.</TableCell>
                  </TableRow>
                ) : (
                  processedApps.map((app) => {
                    const hasAccess = hasAccessToApp(app.id);
                    const accessInfo = getAppAccessInfo(app.id);
                    
                    return (
                      <TableRow key={app.id} className="transition-colors">
                        <TableCell className="font-medium text-pl-text">
                          {app.app_name}
                          {!app.module_id && <Badge variant="danger" className="ml-2 px-1.5 py-0 text-[10px]">NULL MODULE ID</Badge>}
                        </TableCell>
                        <TableCell className="text-pl-muted">{app.module}</TableCell>
                        
                        {/* Access Status Badge */}
                        <TableCell className="text-center">
                          {hasAccess ? (
                            <Badge variant="success">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                            </Badge>
                          ) : (
                            <Badge variant="neutral">
                              <Lock className="w-3 h-3 mr-1" /> Locked
                            </Badge>
                          )}
                        </TableCell>

                        {/* Seat Usage */}
                        <TableCell className="text-center text-xs text-pl-muted">
                          {accessInfo && accessInfo.seats_allocated ? (
                            <div className="flex items-center justify-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>{accessInfo.seats_used || 0} / {accessInfo.seats_allocated}</span>
                            </div>
                          ) : (
                            <span className="text-pl-muted">-</span>
                          )}
                        </TableCell>

                        {/* Expiry Date */}
                        <TableCell className="text-center">
                          {hasAccess && accessInfo?.expiry_date ? (
                            <div className="flex items-center justify-center text-xs text-pl-muted gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(accessInfo.expiry_date).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-pl-muted">-</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right text-pl-muted text-xs font-pl-mono tabular-nums">
                          {new Date(app.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="p-2 bg-pl-sunken border-t border-pl-border text-xs text-pl-muted flex flex-wrap gap-2 justify-between">
            <span>Showing {processedApps.length} records</span>
            <span>Sorted by {sortConfig.key} ({sortConfig.direction})</span>
          </div>
        </div>
      </div>
    </AccountPage>
  );
};

const MasterAppsViewerPage = () => (
  <AccountScope testId="master-apps-viewer-theme-scope">
    <MasterAppsViewer />
  </AccountScope>
);

export default MasterAppsViewerPage;