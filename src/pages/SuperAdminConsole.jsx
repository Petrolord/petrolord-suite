import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Helmet } from 'react-helmet';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Loader2, AlertTriangle, Building2, Users, ShieldCheck, Eye, LogIn, Trash2, Power, Edit, Search, FileDown, Plus, Lock, ArrowLeft } from 'lucide-react';
import AddAppModal from '@/components/AddAppModal';
import EmergencyAccessModal from '@/components/EmergencyAccessModal';
import { useNavigate } from 'react-router-dom'; // Import useNavigate

// Helper to get messaging
const getEntitlementMessage = (orgType) => {
    const msg = orgType === 'customer' 
      ? "Customer Entitlements: Read-only app list. Modifications restricted to seat/status updates."
      : orgType === 'internal' || orgType === 'sandbox'
        ? "Internal/Sandbox Environment: Full control allowed (Add/Remove/Edit)."
        : "Partner/Consultant Access: Restricted. Emergency access only.";
    console.log(`SuperAdminConsole: Displaying message for orgType ${orgType}: ${msg}`);
    return msg;
};

const SuperAdminConsoleContent = () => {
  const { user } = useAuth();
  const { startOrgImpersonation, startMemberImpersonation } = useImpersonation();
  const { toast } = useToast();
  const navigate = useNavigate(); // Initialize useNavigate
  
  const [activeTab, setActiveTab] = useState('organizations');
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [members, setMembers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [masterApps, setMasterApps] = useState([]);
  
  // Modals & Actions
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [entitlements, setEntitlements] = useState([]);
  const [isEntitlementModalOpen, setIsEntitlementModalOpen] = useState(false);
  const [isDeleteOrgModalOpen, setIsDeleteOrgModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  const [isAddAppModalOpen, setIsAddAppModalOpen] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  
  // Audit Log Filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

  useEffect(() => {
    fetchData();
    fetchMasterApps();
  }, [activeTab]);

  const fetchMasterApps = async () => {
      try {
          const { data, error } = await supabase.from('master_apps').select('*');
          if (error) {
              console.warn("Could not fetch master_apps, might not exist yet. Using fallback.");
              const fallbackApps = [
                  { app_id: 'geoscience', name: 'Geoscience', module_id: 'geoscience' },
                  { app_id: 'reservoir', name: 'Reservoir', module_id: 'reservoir' },
                  { app_id: 'drilling', name: 'Drilling', module_id: 'drilling' },
                  { app_id: 'production', name: 'Production', module_id: 'production' },
                  { app_id: 'economics', name: 'Economics', module_id: 'economics' },
                  { app_id: 'facilities', name: 'Facilities', module_id: 'facilities' },
                  { app_id: 'assurance', name: 'Assurance', module_id: 'assurance' },
                  { app_id: 'hse', name: 'HSE', module_id: 'hse' }
              ];
              setMasterApps(fallbackApps);
          } else {
              setMasterApps(data || []);
              console.log(`SuperAdminConsole: Fetched ${data?.length} master apps.`);
          }
      } catch (e) {
          console.error("Master apps fetch error", e);
      }
  };

  const fetchData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      if (activeTab === 'organizations') {
        const { data } = await supabase.from('organizations').select('*, organization_apps(*)');
        setOrganizations(data || []);
      } else if (activeTab === 'members') {
        const { data } = await supabase.from('organization_users').select('*, organizations(name), users(email)');
        setMembers(data || []);
      } else if (activeTab === 'audit') {
        const { data } = await supabase.from('user_activity_logs')
            .select('*, users:user_id(email), super_admin:super_admin_id(email)')
            .order('timestamp', { ascending: false })
            .limit(200);
        setAuditLogs(data || []);
        console.log(`SuperAdminConsole: Fetched ${data?.length} audit logs.`);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch data' });
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendOrg = async (orgId, action) => {
    try {
      const response = await supabase.functions.invoke('admin-suspend-org', {
        body: { organization_id: orgId, action, super_admin_id: user.id }
      });
      if (response.error) throw new Error(response.error.message);
      toast({ title: 'Success', description: `Organization ${action}ed.` });
      fetchData();
    } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleDeleteOrg = async () => {
    if (deleteConfirmation !== selectedOrg?.name) {
        toast({ variant: 'destructive', title: 'Error', description: 'Name mismatch' });
        return;
    }
    try {
        const response = await supabase.functions.invoke('admin-delete-organization', {
            body: { organization_id: selectedOrg.id, super_admin_id: user.id }
        });
        if (response.error) throw new Error(response.error.message);
        toast({ title: 'Success', description: 'Organization deleted.' });
        setIsDeleteOrgModalOpen(false);
        fetchData();
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const handleUpdateEntitlements = async () => {
      try {
          const response = await supabase.functions.invoke('admin-update-org-entitlements', {
              body: { 
                  organization_id: selectedOrg.id, 
                  entitlements: entitlements, 
                  super_admin_id: user.id,
              }
          });
          if (!response.ok) { // Check HTTP status
             const errorData = await response.json();
             throw new Error(errorData.error || 'Request failed');
          }
          const data = await response.json();
          if (data.error) throw new Error(data.error);

          toast({ title: 'Success', description: 'Entitlements updated.' });
          setIsEntitlementModalOpen(false);
          fetchData();
      } catch (error) {
          toast({ variant: 'destructive', title: 'Error', description: error.message });
      }
  };

  const openEntitlementsModal = (org) => {
      setSelectedOrg(org);
      setEntitlements(org.organization_apps || []);
      setIsEntitlementModalOpen(true);
  };

  const handleBackToDashboard = () => {
    console.log("SuperAdminConsole: Navigating back to dashboard");
    navigate('/dashboard');
  };

  // Render Helpers
  const renderOrganizations = () => (
    <div className="space-y-4">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-white">Type</TableHead> {/* Task 2: Update column header */}
                    <TableHead>Status</TableHead>
                    <TableHead>Apps</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {organizations.map(org => (
                    <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>
                            {/* Task 3: Apply white text color to cell content */}
                            <Badge variant="outline" className="text-white">
                                {org.org_type || 'customer'}
                            </Badge>
                        </TableCell>
                        <TableCell>
                            <span className={`px-2 py-1 rounded text-xs ${org.subscription_status === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                                {org.subscription_status}
                            </span>
                        </TableCell>
                        <TableCell>{org.organization_apps?.length || 0} Apps</TableCell>
                        <TableCell className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => startOrgImpersonation(org.id, user.id)} title="Impersonate">
                                <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openEntitlementsModal(org)} title="Edit Entitlements">
                                <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                                setSelectedOrg(org);
                                setIsEmergencyModalOpen(true);
                            }} title="Grant Emergency Access">
                                <ShieldCheck className="w-4 h-4 text-amber-500" />
                            </Button>
                            {org.subscription_status === 'active' ? (
                                <Button size="sm" variant="outline" className="text-amber-500 border-amber-900" onClick={() => handleSuspendOrg(org.id, 'suspend')} title="Suspend">
                                    <Power className="w-4 h-4" />
                                </Button>
                            ) : (
                                <Button size="sm" variant="outline" className="text-green-500 border-green-900" onClick={() => handleSuspendOrg(org.id, 'reactivate')} title="Reactivate">
                                    <Power className="w-4 h-4" />
                                </Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => {
                                setSelectedOrg(org);
                                setDeleteConfirmation('');
                                setIsDeleteOrgModalOpen(true);
                            }} title="Delete">
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
        {console.log('Organizations table: Type column text color applied - white')} {/* Task 5: Add console log */}

        {/* Entitlements Modal */}
        <Dialog open={isEntitlementModalOpen} onOpenChange={setIsEntitlementModalOpen}>
            <DialogContent className="max-w-3xl bg-slate-900 text-white border-slate-800">
                <DialogHeader>
                    <DialogTitle>Edit Entitlements: {selectedOrg?.name}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {selectedOrg && getEntitlementMessage(selectedOrg.org_type || 'customer')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    {entitlements.length === 0 && <p className="text-sm text-slate-500 italic">No active entitlements.</p>}
                    
                    {entitlements.map((ent, idx) => {
                        const appName = masterApps.find(a => a.app_id === ent.app_id)?.name || ent.app_id;
                        
                        return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-800/50 p-2 rounded">
                            <div className="col-span-4 text-sm font-medium">{appName}</div>
                            <div className="col-span-3">
                                <label className="text-xs text-slate-500">Seats</label>
                                <Input 
                                    type="number" 
                                    value={ent.seats_allocated} 
                                    onChange={(e) => {
                                        const newEnts = [...entitlements];
                                        newEnts[idx].seats_allocated = parseInt(e.target.value);
                                        setEntitlements(newEnts);
                                    }}
                                    className="bg-slate-950 h-8" 
                                    disabled={selectedOrg?.org_type === 'partner' || selectedOrg?.org_type === 'consultant'}
                                />
                            </div>
                            <div className="col-span-3">
                                <label className="text-xs text-slate-500">Status</label>
                                <Select 
                                    value={ent.status} 
                                    onValueChange={(val) => {
                                        const newEnts = [...entitlements];
                                        newEnts[idx].status = val;
                                        setEntitlements(newEnts);
                                    }}
                                    disabled={selectedOrg?.org_type === 'partner' || selectedOrg?.org_type === 'consultant'}
                                >
                                    <SelectTrigger className="bg-slate-950 h-8"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                        <SelectItem value="trial">Trial</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2 flex justify-end">
                            </div>
                        </div>
                    )})}

                    {(selectedOrg?.org_type === 'internal' || selectedOrg?.org_type === 'sandbox') && (
                        <Button 
                            variant="outline" 
                            onClick={() => setIsAddAppModalOpen(true)}
                            className="w-full border-dashed border-slate-700 text-slate-400 hover:text-white"
                        >
                            <Plus className="w-4 h-4 mr-2" /> Add Application (Internal/Sandbox)
                        </Button>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsEntitlementModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateEntitlements} className="bg-emerald-600 hover:bg-emerald-700 text-white">Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Add App Modal */}
        <AddAppModal 
            isOpen={isAddAppModalOpen} 
            onClose={() => setIsAddAppModalOpen(false)}
            organization={selectedOrg}
            existingAppIds={entitlements.map(e => e.app_id)}
            superAdminId={user.id}
            masterApps={masterApps}
            onSuccess={() => {
                fetchData();
                setIsEntitlementModalOpen(false);
            }}
        />

        {/* Emergency Access Modal */}
        <EmergencyAccessModal 
            isOpen={isEmergencyModalOpen}
            onClose={() => setIsEmergencyModalOpen(false)}
            organization={selectedOrg}
            superAdminId={user.id}
            masterApps={masterApps}
            onSuccess={fetchData}
        />

        {/* Delete Modal */}
        <Dialog open={isDeleteOrgModalOpen} onOpenChange={setIsDeleteOrgModalOpen}>
            <DialogContent className="bg-slate-900 text-white border-red-900">
                <DialogHeader>
                    <DialogTitle className="text-red-500 flex items-center gap-2"><AlertTriangle /> Danger Zone</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        This action is irreversible. It will delete the organization, all users, data, and access logs.
                        Please type <strong>{selectedOrg?.name}</strong> to confirm.
                    </DialogDescription>
                </DialogHeader>
                <Input 
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    className="bg-slate-950 border-red-900 text-white"
                    placeholder="Type organization name"
                />
                <DialogFooter>
                    <Button variant="destructive" onClick={handleDeleteOrg} disabled={deleteConfirmation !== selectedOrg?.name}>
                        Permanently Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );

  const renderMembers = () => (
      <Table>
          <TableHeader>
              <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Org</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
              {members.map(m => (
                  <TableRow key={m.id}>
                      <TableCell>{m.users?.email || m.email}</TableCell>
                      <TableCell>{m.organizations?.name}</TableCell>
                      <TableCell>{m.role}</TableCell>
                      <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => startMemberImpersonation(m.organization_id, m.user_id, user.id)}>
                              <LogIn className="w-4 h-4" />
                          </Button>
                      </TableCell>
                  </TableRow>
              ))}
          </TableBody>
      </Table>
  );

  const renderAudit = () => (
      <div className="space-y-4">
          <div className="flex gap-4">
              <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                  <Input 
                    placeholder="Search logs..." 
                    className="pl-8 bg-slate-900 border-slate-800"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                  />
              </div>
              <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                <SelectTrigger className="w-48 bg-slate-900 border-slate-800"><SelectValue placeholder="Action Type" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="impersonation">Impersonation</SelectItem>
                    <SelectItem value="emergency">Emergency Access</SelectItem>
                    <SelectItem value="org_update">Org Updates</SelectItem>
                    <SelectItem value="super_admin_update_entitlements">Update Entitlements</SelectItem>
                    <SelectItem value="super_admin_suspend_org">Suspend Org</SelectItem>
                    <SelectItem value="super_admin_reactivate_org">Reactivate Org</SelectItem>
                    <SelectItem value="super_admin_delete_org">Delete Org</SelectItem>
                    <SelectItem value="start_org_impersonation">Start Org Impersonation</SelectItem>
                    <SelectItem value="start_member_impersonation">Start Member Impersonation</SelectItem>
                    <SelectItem value="exit_impersonation">Exit Impersonation</SelectItem>
                    <SelectItem value="super_admin_grant_access">Grant App Access</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => toast({description: "Export feature coming soon."})}>
                  <FileDown className="w-4 h-4 mr-2" /> Export
              </Button>
          </div>
          <Table>
              <TableHeader>
                  <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Details</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                  {auditLogs
                    .filter(log => {
                        const matchesSearch = JSON.stringify(log).toLowerCase().includes(auditSearch.toLowerCase());
                        const matchesFilter = auditActionFilter === 'all' 
                            ? true 
                            : auditActionFilter === 'impersonation' 
                                ? log.action.includes('impersonation') || log.action.includes('START') || log.action === 'exit_impersonation'
                                : auditActionFilter === 'emergency'
                                    ? log.action === 'super_admin_grant_access' && log.details?.grant_type === 'emergency'
                                    : log.action.includes(auditActionFilter);
                        return matchesSearch && matchesFilter;
                    })
                    .map(log => (
                      <TableRow key={log.id}>
                          <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                              {new Date(log.timestamp || log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>{log.super_admin?.email || 'System'}</TableCell>
                          <TableCell>
                              <Badge variant="outline" className={
                                  (log.action === 'super_admin_grant_access' && log.details?.grant_type === 'emergency') ? 'border-red-500 text-red-500' : 
                                  log.action.includes('impersonation') || log.action.includes('START') ? 'border-amber-500 text-amber-500' : 'border-slate-500'
                              }>{log.action}</Badge>
                          </TableCell>
                          <TableCell className="max-w-md text-xs font-mono text-slate-500">
                             {/* Enhanced Details Rendering */}
                             <div className="truncate" title={JSON.stringify(log.details, null, 2)}>
                                 {log.details?.reason ? (
                                     <span className="text-white">Reason: {log.details.reason} | </span>
                                 ) : null}
                                 {log.details?.app_id ? (
                                     <span>App: {log.details.app_id} | </span>
                                 ) : null}
                                 {log.details?.impersonated_org_id ? (
                                     <span>Org: {log.details.impersonated_org_id} | </span>
                                 ) : null}
                                 {log.details?.impersonated_user_id ? (
                                     <span>User: {log.details.impersonated_user_id} | </span>
                                 ) : null}
                                 {log.details?.new_status ? (
                                     <span>New Status: {log.details.new_status} | </span>
                                 ) : null}
                                 {log.details?.org_name ? (
                                     <span>Org Name: {log.details.org_name} | </span>
                                 ) : null}
                                 {JSON.stringify(log.details)}
                             </div>
                          </TableCell>
                      </TableRow>
                  ))}
              </TableBody>
          </Table>
      </div>
  );

  return (
    <div className="p-6 space-y-8 bg-slate-950 min-h-screen text-white">
      <Helmet><title>Super Admin Console</title></Helmet>
      
      <div className="flex justify-between items-center mb-6">
        {/* Task 1: Add Back to Dashboard button */}
        <Button 
          variant="ghost" 
          onClick={handleBackToDashboard} 
          className="text-slate-400 hover:text-white hover:bg-slate-800/50 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Super Admin Console</h1>
          <p className="text-slate-400 mt-1">Platform management and audit.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="organizations" className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Organizations</TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2"><Users className="h-4 w-4" /> Members</TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Audit Log</TabsTrigger>
        </TabsList>

        <Card className="bg-slate-900 border-slate-800 text-white shadow-lg min-h-[500px]">
            <CardContent className="p-6">
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-emerald-500" /></div>
                ) : (
                    <>
                        {activeTab === 'organizations' && renderOrganizations()}
                        {activeTab === 'members' && renderMembers()}
                        {activeTab === 'audit' && renderAudit()}
                    </>
                )}
            </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

const SuperAdminConsole = () => (
  <ErrorBoundary>
    <SuperAdminConsoleContent />
  </ErrorBoundary>
);

export default SuperAdminConsole;