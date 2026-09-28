import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { UserPlus, Search, MoreHorizontal, Shield, Trash2, Copy } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { getModuleList } from '@/utils/adminHelpers';
import { NativeSelect } from '@/components/ui/native-select';

const OrgTeam = ({ users, onUpdate }) => {
  const { selectedOrg } = useAdminOrg();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // SAFE FILTERING: Ensure users is an array and handle potential null/undefined properties
  // Added safeguards: checks if 'users' exists, defaults to empty array.
  // Checks if 'u.email' exists before calling toLowerCase(), defaulting to empty string.
  const filteredUsers = Array.isArray(users) 
    ? users.filter(u => {
        if (!u) return false; // Skip null user objects
        const email = u.email || ''; // Fallback for missing email
        const search = searchTerm || ''; // Fallback for missing search term
        return email.toLowerCase().includes(search.toLowerCase());
      }) 
    : [];

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure? This will remove the user's access.")) return;
    const { error } = await supabase.from('organization_members').delete().eq('user_id', userId).eq('organization_id', selectedOrg.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'User removed' });
      onUpdate();
    }
  };

  const handleEditClick = (user) => {
    if (!user) return;
    setCurrentUser(user);
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pl-muted" aria-hidden="true" />
          <Input 
            placeholder="Search team members..." 
            className="pl-9"
            aria-label="Search team members"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Add Member
        </Button>
      </div>

      <div className="border border-pl-border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Handle empty state explicitly */}
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-pl-muted">
                  {users && users.length > 0 ? 'No members match your search.' : 'No team members found.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                // SAFETY: Use optional chaining and default values for ALL properties used in render
                if (!user) return null; // Skip invalid user objects

                const userEmail = user.email || 'Unknown User';
                // Safe access for avatar character
                const avatarChar = (userEmail && typeof userEmail === 'string') 
                  ? userEmail.charAt(0).toUpperCase() 
                  : '?';
                
                const userIdDisplay = user.user_id 
                  ? `${user.user_id.substring(0, 8)}...` 
                  : 'N/A';
                
                const userRole = user.role || 'Viewer';
                
                // Safe date parsing
                let joinedDate = 'N/A';
                try {
                  if (user.user_created_at) {
                    joinedDate = new Date(user.user_created_at).toLocaleDateString();
                  }
                } catch (e) {
                  console.warn('Invalid date format for user:', user);
                }

                return (
                  <TableRow key={user.user_id || Math.random()} >
                    <TableCell>
                      <div className="flex items-center">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-pl-sunken border border-pl-border flex items-center justify-center text-pl-text font-bold mr-3">
                          {avatarChar}
                        </div>
                        <div>
                          <div className="font-medium text-pl-text">{userEmail}</div>
                          <div className="text-xs text-pl-muted">ID: {userIdDisplay}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="capitalize">
                        {userRole}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-pl-muted max-w-[200px] truncate">
                        {Array.isArray(user.modules) ? `${user.modules.length} modules` : 'No access'}
                      </div>
                    </TableCell>
                    <TableCell className="text-pl-muted text-sm whitespace-nowrap">
                      {joinedDate}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${userEmail}`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleEditClick(user)}><Shield className="h-4 w-4 mr-2" /> Edit Role & Access</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(userEmail)}><Copy className="h-4 w-4 mr-2" /> Copy Email</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-pl-danger-text" onClick={() => handleDeleteUser(user.user_id)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Remove User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invitation Dialog */}
      <InviteUserDialog 
        isOpen={isInviteOpen} 
        setIsOpen={setIsInviteOpen} 
        organization={selectedOrg}
        onSuccess={onUpdate}
      />

      {/* Edit Dialog */}
      {currentUser && (
        <EditPermissionsDialog
          isOpen={isEditOpen}
          setIsOpen={setIsEditOpen}
          user={currentUser}
          organization={selectedOrg}
          onSuccess={onUpdate}
        />
      )}
    </div>
  );
};

// --- Helper Components ---

const InviteUserDialog = ({ isOpen, setIsOpen, organization, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleInvite = async () => {
    if(!email) return;
    setIsSubmitting(true);
    // In real app, trigger Supabase Edge Function to send email
    try {
        const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email, organization_id: organization?.id, role, modules: [], apps: [] }
        });

        if (error || data?.error) {
        toast({ variant: 'destructive', title: 'Invite Failed', description: error?.message || data?.error });
        } else {
        toast({ title: 'Invitation Sent' });
        onSuccess();
        setIsOpen(false);
        setEmail('');
        }
    } catch (e) {
        toast({ variant: 'destructive', title: 'Invite Error', description: e.message });
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>Send an email invitation to join {organization?.name || 'the organization'}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="org-invite-email">Email Address</Label>
            <Input 
              id="org-invite-email"
              placeholder="colleague@company.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-invite-role">Initial Role</Label>
            <NativeSelect 
              id="org-invite-role"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="engineer">Engineer</option>
              <option value="viewer">Viewer</option>
            </NativeSelect>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleInvite} disabled={isSubmitting}>{isSubmitting ? 'Sending...' : 'Send Invitation'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EditPermissionsDialog = ({ isOpen, setIsOpen, user, organization, onSuccess }) => {
  const [role, setRole] = useState(user?.role || 'viewer');
  const [modules, setModules] = useState(user?.modules || []);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const allModules = getModuleList();

  const toggleModule = (modId) => {
    // Safety check: ensure modules is an array before spreading
    const currentModules = Array.isArray(modules) ? modules : [];
    
    if (currentModules.includes(modId)) {
      setModules(currentModules.filter(m => m !== modId));
    } else {
      setModules([...currentModules, modId]);
    }
  };

  const handleSave = async () => {
    if (!user?.user_id || !organization?.id) return;
    
    setIsSaving(true);
    try {
        // Per-user module arrays were retired with organization_users
        // (membership consolidation 20260713300000): role lives on
        // organization_members; app access is managed via seat assignment.
        const { error } = await supabase
        .from('organization_members')
        .update({ role })
        .eq('user_id', user.user_id)
        .eq('organization_id', organization.id);

        if (error) {
        toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        } else {
        toast({ title: 'Permissions Updated' });
        onSuccess();
        setIsOpen(false);
        }
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Permissions: {user?.email || 'User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="org-edit-role">User Role</Label>
            <NativeSelect 
              id="org-edit-role"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="admin">Admin - Full Access</option>
              <option value="manager">Manager - Manage Projects & Team</option>
              <option value="engineer">Engineer - Technical Access</option>
              <option value="viewer">Viewer - Read Only</option>
            </NativeSelect>
          </div>
          
          <div className="space-y-2">
            <Label>Module Access</Label>
            <p className="text-sm text-pl-muted border border-pl-border p-3 rounded bg-pl-sunken">
              Per-user module grants have been retired. App and module access is
              organization-level (subscriptions) with per-user seats. Manage it
              from Seat Management.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrgTeam;