import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  Users, UserPlus, Mail, Shield, Trash2, Edit, MoreHorizontal, CheckCircle, Clock, Search 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import InviteEmployee from '@/components/InviteEmployee';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

function EmployeeManagementPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [orgId, setOrgId] = useState(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [seatStats, setSeatStats] = useState({ used: 0, limit: 5 });

  useEffect(() => {
    if (user) fetchOrgAndMembers();
  }, [user]);

  const fetchOrgAndMembers = async () => {
    try {
      const orgUser = await getUserOrgRow(user.id);
      
      if (orgUser) {
        setOrgId(orgUser.organization_id);
        
        // Fetch Members
        const { data: membersData, error } = await supabase
          .from('organization_members')
          .select('*')
          .eq('organization_id', orgUser.organization_id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setMembers(membersData);

        // Fetch Seat Limit (Mock logic or real if subscription table ready)
        // Ideally we fetch from purchased_modules or subscriptions
        // maybeSingle: an org with no active subscription must not throw (PGRST116)
        // and take the whole page down with it.
        const { data: sub } = await supabase.from('subscriptions').select('user_limit').eq('organization_id', orgUser.organization_id).eq('status', 'active').limit(1).maybeSingle();
        const limit = sub?.user_limit || 5; // Default free tier
        
        const activeCount = membersData.filter(m => m.status !== 'inactive').length;
        setSeatStats({ used: activeCount, limit });
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({ title: 'Error', description: 'Could not load employee list.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (memberId) => {
      if(!confirm("Are you sure you want to deactivate this member? They will lose access.")) return;
      try {
          const { error } = await supabase.from('organization_members').update({ status: 'inactive' }).eq('id', memberId);
          if (error) throw error;
          toast({ title: "Member Deactivated" });
          fetchOrgAndMembers();
      } catch (e) {
          toast({ variant: "destructive", title: "Error", description: e.message });
      }
  };

  const filteredMembers = members.filter(m => 
    m.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AccountPage>

        <AccountHeader
            eyebrow="Organization"
            title="Team Management"
            description="Manage your organization's members and their access."
            icon={Users}
            actions={
                <div className="flex items-center gap-4 rounded-lg border border-pl-border bg-pl-surface px-3 py-1.5">
                    <div>
                        <div className="text-xs text-pl-muted">Members</div>
                        <div className="text-xl font-bold font-pl-mono tabular-nums text-pl-text">{seatStats.used}</div>
                    </div>
                    <a href="/dashboard/seats" className="text-xs font-medium text-pl-primary-text hover:text-pl-primary-text-hover hover:underline">Manage app seats</a>
                </div>
            }
        />

        <Card>
            <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
                    <Input 
                        placeholder="Search employees..." 
                        aria-label="Search employees"
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <UserPlus className="w-4 h-4 mr-2"/> Invite Member
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader><DialogTitle>Invite New Member</DialogTitle></DialogHeader>
                        <InviteEmployee 
                            orgId={orgId} 
                            onSuccess={() => { setIsInviteOpen(false); fetchOrgAndMembers(); }} 
                        />
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name / Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMembers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-pl-muted">
                                    No members found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredMembers.map(member => (
                                <TableRow key={member.id}>
                                    <TableCell>
                                        <div className="font-medium text-pl-text">{member.full_name}</div>
                                        <div className="text-xs text-pl-muted">{member.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="neutral" className="capitalize">
                                            {member.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {member.status === 'active' ? (
                                            <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" aria-hidden="true"/> Active</Badge>
                                        ) : member.status === 'invited' ? (
                                            <Badge variant="info"><Clock className="w-3 h-3 mr-1" aria-hidden="true"/> Invited</Badge>
                                        ) : (
                                            <Badge variant="neutral">Inactive</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap font-pl-mono tabular-nums text-sm text-pl-muted">
                                        {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Manage ${member.full_name}`}>
                                                    <MoreHorizontal className="w-4 h-4"/>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Manage Access</DropdownMenuLabel>
                                                <DropdownMenuItem className="cursor-pointer">
                                                    <Shield className="w-4 h-4 mr-2"/> Edit Role
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/dashboard/seats')}>
                                                    <Users className="w-4 h-4 mr-2"/> Assign Apps
                                                </DropdownMenuItem>
                                                {member.status === 'invited' && (
                                                    <DropdownMenuItem className="cursor-pointer">
                                                        <Mail className="w-4 h-4 mr-2"/> Resend Invite
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="cursor-pointer text-pl-danger-text focus:bg-pl-danger-bg focus:text-pl-danger-text" onClick={() => handleDeactivate(member.id)}>
                                                    <Trash2 className="w-4 h-4 mr-2"/> Deactivate
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

    </AccountPage>
  );
}

// Design system rollout batch 1E: the page opens its theme scope through AccountScope inside the dashboard scope.
export default function EmployeeManagement() {
  return (
    <AccountScope testId="employees-theme-scope">
      <EmployeeManagementPage />
    </AccountScope>
  );
}
