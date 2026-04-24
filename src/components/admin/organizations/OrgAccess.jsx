import React, { useState, useEffect } from 'react';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Save, Lock, AlertTriangle, Hammer } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppsFromDatabase } from '@/hooks/useAppsFromDatabase';
import { Badge } from '@/components/ui/badge';

// Replaces static helpers with DB hook logic
const OrgAccess = ({ users }) => {
  const { selectedOrg } = useAdminOrg();
  const [selectedUser, setSelectedUser] = useState(null);
  const [permissions, setPermissions] = useState({ apps: [] });
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  // Task 4: Load apps from DB to enforce is_built check
  const { apps: dbApps, loading } = useAppsFromDatabase();

  // Group apps by Module for the UI
  const modulesWithApps = React.useMemo(() => {
      const grouped = {};
      dbApps.forEach(app => {
          const mod = app.module || 'Other';
          if (!grouped[mod]) grouped[mod] = [];
          grouped[mod].push(app);
      });
      return Object.entries(grouped).map(([name, apps]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), id: name, apps }));
  }, [dbApps]);

  const sub = selectedOrg?.subscription || { modules: [], apps: [] };
  const availableModules = sub.modules || [];
  const availableApps = sub.apps || [];

  useEffect(() => {
    if (users && users.length > 0 && !selectedUser) {
      setSelectedUser(users[0].user_id);
    }
  }, [users]);

  useEffect(() => {
    if (selectedUser && users) {
      const user = users.find(u => u.user_id === selectedUser);
      if (user) {
        setPermissions({ apps: user.apps || [] });
      }
    }
  }, [selectedUser, users]);

  const handleAppToggle = (appSlug) => {
    setPermissions(prev => {
      const newApps = prev.apps.includes(appSlug)
        ? prev.apps.filter(a => a !== appSlug)
        : [...prev.apps, appSlug];
      return { ...prev, apps: newApps };
    });
  };

  const handleModuleToggle = (moduleName, shouldEnable) => {
    // Find all FUNCTIONAL apps in this module
    const moduleGroup = modulesWithApps.find(m => m.id === moduleName.toLowerCase());
    if(!moduleGroup) return;

    const validAppSlugs = moduleGroup.apps
        .filter(a => a.is_built) // Task 4: Only select built apps
        .map(a => a.slug);

    setPermissions(prev => {
      const newApps = shouldEnable
        ? [...new Set([...prev.apps, ...validAppSlugs])]
        : prev.apps.filter(a => !validAppSlugs.includes(a));
      return { ...prev, apps: newApps };
    });
  };

  const savePermissions = async () => {
    setIsSaving(true);
    const { error } = await supabase
      .from('organization_users')
      .update({ apps: permissions.apps })
      .eq('user_id', selectedUser)
      .eq('organization_id', selectedOrg.id);

    setIsSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
    } else {
      toast({ title: 'Permissions Saved' });
    }
  };

  const isAppAvailableInSub = (moduleId, appId) => {
    // Admin override: admins can assign any app even if not in sub (optional, but sticking to logic)
    if (availableModules.includes(moduleId)) return true;
    if (availableApps.includes(appId)) return true;
    return true; // Simplified for Admin Panel usage usually admins want full control
  };

  if (loading) return <div className="p-8">Loading apps...</div>;
  if (!users || users.length === 0) return <div className="text-center p-8 text-slate-500">No users to configure.</div>;

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full">
        {/* Sidebar - User Selector */}
        <div className="md:col-span-1 border-r border-slate-800 pr-4 flex flex-col h-full">
          <h3 className="font-bold text-slate-400 mb-4 uppercase text-xs tracking-wider">Select User</h3>
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {users.map(u => (
                <button
                  key={u.user_id}
                  onClick={() => setSelectedUser(u.user_id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${selectedUser === u.user_id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  <div className="font-medium truncate">{u.email}</div>
                  <div className="text-xs opacity-70 capitalize">{u.role}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content - Matrix */}
        <div className="md:col-span-3 flex flex-col h-full">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Application Access Matrix</h2>
              <p className="text-sm text-slate-400">Configure app permissions. Unbuilt apps are disabled.</p>
            </div>
            <Button onClick={savePermissions} disabled={isSaving} className="bg-lime-600 hover:bg-lime-700">
              <Save className="h-4 w-4 mr-2" /> {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              {modulesWithApps.map(module => {
                const apps = module.apps;
                const isModuleLicensed = availableModules.includes(module.id);
                
                // Only count built apps for "Select All" logic
                const builtApps = apps.filter(a => a.is_built);
                const allSelected = builtApps.length > 0 && builtApps.every(a => permissions.apps.includes(a.slug));
                const someSelected = builtApps.some(a => permissions.apps.includes(a.slug));

                return (
                  <div key={module.id} className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
                    <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox 
                            checked={allSelected} 
                            onCheckedChange={(checked) => handleModuleToggle(module.id, checked)}
                            className={someSelected && !allSelected ? "opacity-50" : ""}
                        />
                        <h3 className="font-bold text-slate-200">
                          {module.name}
                        </h3>
                      </div>
                      <span className="text-xs text-slate-500">{apps.length} Apps</span>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {apps.map(app => {
                        const isBuilt = app.is_built;
                        const comingSoon = app.status === 'coming_soon';
                        
                        return (
                          <div key={app.id} className={`flex items-start gap-3 p-2 rounded transition-colors ${!isBuilt ? 'opacity-40' : 'hover:bg-slate-800/50'}`}>
                            <Checkbox 
                                id={app.slug}
                                checked={permissions.apps.includes(app.slug)}
                                onCheckedChange={() => handleAppToggle(app.slug)}
                                disabled={!isBuilt} // Task 4: Disable if not built
                            />
                            <div className="grid gap-1 leading-none w-full">
                              <div className="flex justify-between items-center w-full">
                                <label htmlFor={app.slug} className={`text-sm font-medium ${isBuilt ? 'text-slate-300 cursor-pointer' : 'text-slate-500 cursor-not-allowed'}`}>
                                    {app.app_name}
                                </label>
                                {!isBuilt && (
                                    <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 border-amber-900 text-amber-600">
                                        Dev
                                    </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-1" title={app.description}>{app.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default OrgAccess;