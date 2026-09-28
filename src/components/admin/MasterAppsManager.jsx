import React, { useState } from 'react';
import { useMasterApps } from '@/hooks/useMasterApps';
import { logAppBuild } from '@/lib/appBuildLogger'; // Import new utility
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Search, Hammer } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function MasterAppsManager() {
  // Use hook with override to fetch ALL apps including broken/hidden/unbuilt ones
  const { apps, loading, updateApp, refresh } = useMasterApps({ isSuperAdminOverride: true });
  const { toast } = useToast();
  const [filterText, setFilterText] = useState('');
  const [filterModule, setFilterModule] = useState('all');

  const handleToggleFunctional = async (app) => {
    const newVal = !app.is_functional;
    // Use logger instead of direct update for audit trail
    const action = newVal ? 'tested' : 'updated';
    const desc = newVal ? 'Marked as functional by admin' : 'Marked as non-functional by admin';
    
    // We do direct update first for UI responsiveness, then log
    // Or prefer logAppBuild if we want strict consistency. 
    // Let's use logAppBuild for 'tested' events to strictly follow Task 5
    if (newVal) {
        const { success, error } = await logAppBuild(app.id, app.app_name, 'tested', desc);
        if (success) {
            toast({ title: "Updated", description: "App marked as functional and logged." });
            refresh();
        } else {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    } else {
        // Just update directly if unchecking
        const { success, error } = await updateApp(app.id, { is_functional: newVal });
        if (success) refresh();
    }
  };

  const handleToggleBuilt = async (app) => {
    const newVal = !app.is_built;
    // Task 5 says: When built -> log 'created'.
    // If admin toggles 'Is Built' to true manually, we treat it as a manual 'create' event or 'fix'
    const action = newVal ? 'created' : 'updated';
    const desc = newVal ? 'Manually marked as built by admin' : 'Marked as unbuilt by admin';

    if (newVal) {
         const { success, error } = await logAppBuild(app.id, app.app_name, 'created', desc);
         if (success) {
            toast({ title: "Updated", description: "App marked as built and logged." });
            refresh();
         }
    } else {
        const { success, error } = await updateApp(app.id, { is_built: newVal });
        if (success) refresh();
    }
  };

  const handleStatusChange = async (app, newStatus) => {
    // Log status changes
    const { success, error } = await updateApp(app.id, { status: newStatus });
    if (success) {
      // Log silently
      logAppBuild(app.id, app.app_name, 'updated', `Status changed to ${newStatus}`);
      toast({ 
        title: "Status Updated", 
        description: `App status changed to ${newStatus}.`,
      });
    }
  };

  const filteredApps = apps.filter(app => {
    const matchesText = app.app_name.toLowerCase().includes(filterText.toLowerCase()) || 
                        app.description?.toLowerCase().includes(filterText.toLowerCase());
    const matchesModule = filterModule === 'all' || app.module.toLowerCase() === filterModule.toLowerCase();
    return matchesText && matchesModule;
  });

  const builtCount = apps.filter(a => a.is_built).length;
  const functionalCount = apps.filter(a => a.is_functional).length;
  const totalCount = apps.length;

  const modules = Array.from(new Set(apps.map(a => a.module)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-pl-text">Master App Registry</h2>
          <p className="text-pl-muted text-sm">
            Global control center for application visibility, build status, and functionality.
            <br/>
            <span className="text-pl-warning-text font-medium text-xs">Super Admin Mode: You are viewing ALL {totalCount} records.</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Card className="py-2 px-4">
             <div className="flex items-center gap-2">
                <Hammer className="text-pl-muted w-4 h-4" aria-hidden="true"/>
                <span className="text-xl font-bold font-pl-mono tabular-nums text-pl-text">{builtCount}</span>
                <span className="text-xs text-pl-muted uppercase">Built</span>
             </div>
          </Card>
          <Card className="py-2 px-4">
             <div className="flex items-center gap-2">
                <CheckCircle2 className="text-pl-success-text w-4 h-4" aria-hidden="true"/>
                <span className="text-xl font-bold font-pl-mono tabular-nums text-pl-text">{functionalCount}</span>
                <span className="text-xs text-pl-muted uppercase">Functional</span>
             </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center bg-pl-surface p-4 rounded-lg border border-pl-border">
        <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
            <Input 
                placeholder="Search apps..." 
                className="pl-8"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
            />
        </div>
        <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter Module" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {modules.map(m => (
                    <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                ))}
            </SelectContent>
        </Select>
        <Button variant="outline" onClick={refresh}>
            Refresh
        </Button>
      </div>

      <div className="rounded-md border border-pl-border bg-pl-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">App Name</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Is Built</TableHead>
              <TableHead className="text-center">Is Functional</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
                <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-pl-muted">Loading registry...</TableCell>
                </TableRow>
            ) : filteredApps.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-pl-muted">No apps found.</TableCell>
                </TableRow>
            ) : (
                filteredApps.map((app) => (
                  <TableRow key={app.id} className={`${!app.is_functional ? 'bg-pl-danger-bg/40' : ''} ${!app.is_built ? 'opacity-70' : ''}`}>
                    <TableCell className="font-medium text-pl-text">
                        <div className="flex flex-col">
                            <span>{app.app_name}</span>
                            {!app.is_built && <span className="text-[10px] text-pl-warning-text">Pending Development</span>}
                        </div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="neutral" className="capitalize">
                            {app.module}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <Select 
                            defaultValue={app.status} 
                            onValueChange={(val) => handleStatusChange(app, val)}
                        >
                            <SelectTrigger className="h-7 w-[130px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Coming Soon">Coming Soon</SelectItem>
                                <SelectItem value="Maintenance">Maintenance</SelectItem>
                                <SelectItem value="Deprecated">Deprecated</SelectItem>
                            </SelectContent>
                        </Select>
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                            <Switch 
                                checked={app.is_built}
                                onCheckedChange={() => handleToggleBuilt(app)}
                            />
                            <span className="text-[10px] text-pl-muted">{app.is_built ? 'Yes' : 'No'}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                            <Switch 
                                checked={app.is_functional}
                                onCheckedChange={() => handleToggleFunctional(app)}
                            />
                            <span className="text-[10px] text-pl-muted">{app.is_functional ? 'Yes' : 'No'}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-xs text-pl-muted text-right">
                        {new Date(app.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}