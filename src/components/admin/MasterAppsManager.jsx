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
            toast({ title: "Updated", description: "App marked as functional and logged.", className: "bg-green-600 text-white" });
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
            toast({ title: "Updated", description: "App marked as built and logged.", className: "bg-blue-600 text-white" });
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
        className: "bg-green-600 text-white"
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
          <h2 className="text-2xl font-bold text-white">Master App Registry</h2>
          <p className="text-slate-400 text-sm">
            Global control center for application visibility, build status, and functionality.
            <br/>
            <span className="text-amber-500 font-medium text-xs">Super Admin Mode: You are viewing ALL {totalCount} records.</span>
          </p>
        </div>
        <div className="flex gap-4">
          <Card className="bg-slate-900 border-slate-800 py-2 px-4">
             <div className="flex items-center gap-2">
                <Hammer className="text-blue-500 w-4 h-4"/>
                <span className="text-xl font-bold text-white">{builtCount}</span>
                <span className="text-xs text-slate-500 uppercase">Built</span>
             </div>
          </Card>
          <Card className="bg-slate-900 border-slate-800 py-2 px-4">
             <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-500 w-4 h-4"/>
                <span className="text-xl font-bold text-white">{functionalCount}</span>
                <span className="text-xs text-slate-500 uppercase">Functional</span>
             </div>
          </Card>
        </div>
      </div>

      <div className="flex gap-4 items-center bg-slate-900 p-4 rounded-lg border border-slate-800">
        <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <Input 
                placeholder="Search apps..." 
                className="pl-8 bg-slate-950 border-slate-800"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
            />
        </div>
        <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-[180px] bg-slate-950 border-slate-800">
                <SelectValue placeholder="Filter Module" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-white">
                <SelectItem value="all">All Modules</SelectItem>
                {modules.map(m => (
                    <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                ))}
            </SelectContent>
        </Select>
        <Button variant="outline" onClick={refresh} className="border-slate-700 hover:bg-slate-800">
            Refresh
        </Button>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-950">
            <TableRow className="border-slate-800 hover:bg-slate-950">
              <TableHead className="text-slate-400 w-[250px]">App Name</TableHead>
              <TableHead className="text-slate-400">Module</TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400 text-center">Is Built</TableHead>
              <TableHead className="text-slate-400 text-center">Is Functional</TableHead>
              <TableHead className="text-slate-400 text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
                <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">Loading registry...</TableCell>
                </TableRow>
            ) : filteredApps.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">No apps found.</TableCell>
                </TableRow>
            ) : (
                filteredApps.map((app) => (
                  <TableRow key={app.id} className={`border-slate-800 hover:bg-slate-800/50 ${!app.is_functional ? 'bg-red-950/10' : ''} ${!app.is_built ? 'opacity-70' : ''}`}>
                    <TableCell className="font-medium text-slate-200">
                        <div className="flex flex-col">
                            <span>{app.app_name}</span>
                            {!app.is_built && <span className="text-[10px] text-amber-500">Pending Development</span>}
                        </div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-400 capitalize">
                            {app.module}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <Select 
                            defaultValue={app.status} 
                            onValueChange={(val) => handleStatusChange(app, val)}
                        >
                            <SelectTrigger className="h-7 w-[130px] bg-slate-950 border-slate-800 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-white">
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
                                className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-slate-700"
                            />
                            <span className="text-[10px] text-slate-500">{app.is_built ? 'Yes' : 'No'}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                            <Switch 
                                checked={app.is_functional}
                                onCheckedChange={() => handleToggleFunctional(app)}
                                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-slate-700"
                            />
                            <span className="text-[10px] text-slate-500">{app.is_functional ? 'Yes' : 'No'}</span>
                        </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 text-right">
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