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
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';
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
                  { app_id: 'midstream-downstream', name: 'Midstream & Downstream', module_id: 'midstream-downstream' },
                  { app_id: 'process-safety', name: 'Process Safety', module_id: 'process-safety' },
                  { app_id: 'data-ai', name: 'Data & AI', module_id: 'data-ai' },
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
        const { data } = await supabase.from('organization_members').select('*, organizations(name)');
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

  // Render Helpers
  const renderOrganizations = () => (
    <div className="space-y-4">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
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
                            <Badge variant="outline">
                                {org.org_type || 'customer'}
                            </Badge>
                        </TableCell>
                        <TableCell>
                            <Badge variant={org.subscription_status === 'active' ? 'success' : 'danger'}>
                                {org.subscription_status}
                            </Badge>
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
                                <ShieldCheck className="w-4 h-4 text-pl-warning-text" />
                            </Button>
                            {org.subscription_status === 'active' ? (
                                <Button size="sm" variant="outline" className="text-pl-warning-text border-pl-warning/40" onClick={() => handleSuspendOrg(org.id, 'suspend')} title="Suspend">
                                    <Power className="w-4 h-4" />
                                </Button>
                            ) : (
                                <Button size="sm" variant="outline" className="text-pl-success-text border-pl-success/40" onClick={() => handleSuspendOrg(org.id, 'reactivate')} title="Reactivate">
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

        {/* Entitlements Modal */}
        <Dialog open={isEntitlementModalOpen} onOpenChange={setIsEntitlementModalOpen}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Edit Entitlements: {selectedOrg?.name}</DialogTitle>
                    <DialogDescription>
                        {selectedOrg && getEntitlementMessage(selectedOrg.org_type || 'customer')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    {entitlements.length === 0 && <p className="text-sm text-pl-muted italic">No active entitlements.</p>}
                    
                    {entitlements.map((ent, idx) => {
                        const appName = masterApps.find(a => a.app_id === ent.app_id)?.name || ent.app_id;
                        
                        return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-md border border-pl-border bg-pl-sunken p-2">
                            <div className="col-span-12 sm:col-span-4 text-sm font-medium text-pl-text">{appName}</div>
                            <div className="col-span-6 sm:col-span-3">
                                <label className="text-xs text-pl-muted">Seats</label>
                                <Input 
                                    type="number" 
                                    value={ent.seats_allocated} 
                                    onChange={(e) => {
                                        const newEnts = [...entitlements];
                                        newEnts[idx].seats_allocated = parseInt(e.target.value);
                                        setEntitlements(newEnts);
                                    }}
                                    className="h-8" 
                                    disabled={selectedOrg?.org_type === 'partner' || selectedOrg?.org_type === 'consultant'}
                                />
                            </div>
                            <div className="col-span-6 sm:col-span-3">
                                <label className="text-xs text-pl-muted">Status</label>
                                <Select 
                                    value={ent.status} 
                                    onValueChange={(val) => {
                                        const newEnts = [...entitlements];
                                        newEnts[idx].status = val;
                                        setEntitlements(newEnts);
                                    }}
                                    disabled={selectedOrg?.org_type === 'partner' || selectedOrg?.org_type === 'consultant'}
                                >
                                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                        <SelectItem value="trial">Trial</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="hidden sm:flex sm:col-span-2 justify-end">
                            </div>
                        </div>
                    )})}

                    {(selectedOrg?.org_type === 'internal' || selectedOrg?.org_type === 'sandbox') && (
                        <Button 
                            variant="outline" 
                            onClick={() => setIsAddAppModalOpen(true)}
                            className="w-full border-dashed"
                        >
                            <Plus className="w-4 h-4 mr-2" /> Add Application (Internal/Sandbox)
                        </Button>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsEntitlementModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateEntitlements}>Save Changes</Button>
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
            <DialogContent className="border-pl-danger/40">
                <DialogHeader>
                    <DialogTitle className="text-pl-danger-text flex items-center gap-2"><AlertTriangle aria-hidden="true" /> Danger Zone</DialogTitle>
                    <DialogDescription>
                        This action is irreversible. It will delete the organization, all users, data, and access logs.
                        Please type <strong>{selectedOrg?.name}</strong> to confirm.
                    </DialogDescription>
                </DialogHeader>
                <Input 
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    className="border-pl-danger/60"
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
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
                  <Input 
                    placeholder="Search logs..." 
                    className="pl-8"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                  />
              </div>
              <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Action Type" /></SelectTrigger>
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
                          <TableCell className="text-xs text-pl-muted whitespace-nowrap">
                              {new Date(log.timestamp || log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>{log.super_admin?.email || 'System'}</TableCell>
                          <TableCell>
                              <Badge variant={
                                  (log.action === 'super_admin_grant_access' && log.details?.grant_type === 'emergency') ? 'danger' :
                                  log.action.includes('impersonation') || log.action.includes('START') ? 'warning' : 'outline'
                              }>{log.action}</Badge>
                          </TableCell>
                          <TableCell className="max-w-md text-xs font-pl-mono text-pl-muted">
                             {/* Enhanced Details Rendering */}
                             <div className="truncate" title={JSON.stringify(log.details, null, 2)}>
                                 {log.details?.reason ? (
                                     <span className="text-pl-text">Reason: {log.details.reason} | </span>
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
    <AccountPage width="max-w-7xl">
      <Helmet><title>Super Admin Console</title></Helmet>

      <AccountHeader
        eyebrow="Admin"
        title="Super Admin Console"
        description="Platform management and audit."
        backTo="/dashboard"
        backLabel="Back to Dashboard"
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/event-leads')}>
              Event leads
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/promo-codes')}>
              Promo Codes
            </Button>
          </div>
        )}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="organizations" className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Organizations</TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2"><Users className="h-4 w-4" /> Members</TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Audit Log</TabsTrigger>
        </TabsList>

        <Card className="min-h-[500px]">
            <CardContent className="p-4 sm:p-6">
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-pl-primary" aria-label="Loading" /></div>
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
    </AccountPage>
  );
};

const SuperAdminConsole = () => (
  <AccountScope testId="super-admin-theme-scope">
    <ErrorBoundary>
      <SuperAdminConsoleContent />
    </ErrorBoundary>
  </AccountScope>
);

export default SuperAdminConsole;