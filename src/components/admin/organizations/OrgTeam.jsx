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
    const { error } = await supabase.from('organization_users').delete().eq('user_id', userId).eq('organization_id', selectedOrg.id);
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
      <div className="flex justify-between items-center">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search team members..." 
            className="pl-9 bg-slate-900 border-slate-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsInviteOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <UserPlus className="h-4 w-4 mr-2" /> Add Member
        </Button>
      </div>

      <div className="border border-slate-800 rounded-md bg-slate-900/50">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-slate-900">
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
                <TableCell colSpan={5} className="text-center h-24 text-slate-500">
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
                  <TableRow key={user.user_id || Math.random()} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell>
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold mr-3">
                          {avatarChar}
                        </div>
                        <div>
                          <div className="font-medium text-slate-200">{userEmail}</div>
                          <div className="text-xs text-slate-500">ID: {userIdDisplay}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize bg-slate-800 text-slate-300 border-slate-600">
                        {userRole}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-slate-400 max-w-[200px] truncate">
                        {Array.isArray(user.modules) ? `${user.modules.length} modules` : 'No access'}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {joinedDate}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-200">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleEditClick(user)}><Shield className="h-4 w-4 mr-2" /> Edit Role & Access</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(userEmail)}><Copy className="h-4 w-4 mr-2" /> Copy Email</DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-slate-800" />
                          <DropdownMenuItem className="text-red-400" onClick={() => handleDeleteUser(user.user_id)}>
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
      <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>Send an email invitation to join {organization?.name || 'the organization'}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input 
              placeholder="colleague@company.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="bg-slate-950 border-slate-700"
            />
          </div>
          <div className="space-y-2">
            <Label>Initial Role</Label>
            <select 
              className="flex h-10 w-full items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm ring-offset-slate-950 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-white"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="engineer">Engineer</option>
              <option value="viewer">Viewer</option>
            </select>
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
        const { error } = await supabase
        .from('organization_users')
        .update({ role, modules })
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
      <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Permissions: {user?.email || 'User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>User Role</Label>
            <select 
              className="w-full p-2 rounded bg-slate-950 border border-slate-700 text-white"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="admin">Admin - Full Access</option>
              <option value="manager">Manager - Manage Projects & Team</option>
              <option value="engineer">Engineer - Technical Access</option>
              <option value="viewer">Viewer - Read Only</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <Label>Module Access</Label>
            <div className="grid grid-cols-2 gap-3">
              {allModules.map(mod => (
                <div key={mod.id} className="flex items-center space-x-2 border border-slate-800 p-3 rounded bg-slate-950/50">
                  <Checkbox 
                    id={`mod-${mod.id}`} 
                    checked={Array.isArray(modules) && modules.includes(mod.id)}
                    onCheckedChange={() => toggleModule(mod.id)}
                  />
                  <label htmlFor={`mod-${mod.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-slate-200">
                    {mod.name}
                  </label>
                </div>
              ))}
            </div>
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