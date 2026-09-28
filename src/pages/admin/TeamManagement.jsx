import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Users, UserPlus, Trash2, Shield, Mail, LogOut, ArrowRight } from 'lucide-react';
import { calculateSeatsUsed, getSeatsAvailable, canAddMember } from '@/utils/seatUtils';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

const TeamManagement = () => {
  const { user, actualUser, isSuperAdmin } = useAuth();
  const { isImpersonating, exitImpersonation } = useImpersonation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seatsAllocated, setSeatsAllocated] = useState(0);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const seatsUsed = calculateSeatsUsed(members);
  const seatsAvailable = getSeatsAvailable(seatsAllocated, seatsUsed);

  useEffect(() => {
    // Task 9: Check privileges
    const checkPrivileges = async () => {
        console.log('TeamManagement: Checking privileges for', user?.email);

        // Super admins are NOT short-circuited: they manage their own org here
        // (e.g. Lordsway Energy staff). The console screen below only shows if
        // they genuinely have no org membership of their own.

        // Get user role in org
        if (user?.id) {
            const { data, error } = await supabase
                .from('organization_members')
                .select('role, organization_id')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .order('joined_at', { ascending: true, nullsFirst: false })
                .limit(1)
                .single();
            
            if (error || !data) {
                console.error("TeamManagement: Could not fetch user role");
                if (!isSuperAdmin) navigate('/dashboard');
                return; // super admin with no own org falls through to the console screen
            }

            console.log('TeamManagement: User Role is', data.role);
            setUserRole(data.role);
            setCurrentOrgId(data.organization_id);

            // If not admin/owner, redirect (super admins pass regardless)
            if (!isSuperAdmin && !['owner', 'admin', 'org_admin'].includes(data.role)) {
                toast({
                    variant: "destructive",
                    title: "Access Denied",
                    description: "Only organization administrators can manage teams."
                });
                navigate('/dashboard');
            } else {
                fetchTeamData(data.organization_id);
            }
        }
    };

    checkPrivileges();
  }, [user, isSuperAdmin, navigate, toast]);

  const fetchTeamData = async (orgId) => {
    setLoading(true);
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', orgId);
      
      if (membersError) throw membersError;
      setMembers(membersData || []);

      const { data: appData, error: appError } = await supabase
        .from('organization_apps')
        .select('seats_allocated')
        .eq('organization_id', orgId)
        .limit(1); // Assuming generic seat pool or primary app

      if (appError && appError.code !== 'PGRST116') throw appError;
      
      if (appData && appData.length > 0) {
        setSeatsAllocated(appData[0].seats_allocated || 0);
      } else {
          setSeatsAllocated(0);
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
      if (isImpersonating) return;
      if (!confirm("Are you sure you want to remove this member?")) return;

      try {
          const { error } = await supabase
            .from('organization_members')
            .delete()
            .eq('id', memberId);

          if (error) throw error;
          
          toast({ title: "Member Removed" });
          fetchTeamData(currentOrgId);
      } catch (error) {
          toast({ variant: "destructive", title: "Error", description: error.message });
      }
  };

  // Super Admin View
  if (isSuperAdmin && !isImpersonating && !currentOrgId) {
      return (
          <AccountPage width="max-w-7xl">
              <div className="flex justify-end"><ThemeToggle /></div>
              <div className="py-12 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                  <Shield className="h-24 w-24 text-pl-accent-text mb-4" aria-hidden="true" />
                  <h1 className="text-3xl sm:text-4xl font-bold text-pl-text">Super Admin Access</h1>
                  <p className="text-lg sm:text-xl text-pl-muted max-w-2xl">
                      You are signed in as a Super Administrator. Team management for individual organizations 
                      is handled via the Super Admin Console.
                  </p>
                  <Button 
                    onClick={() => navigate('/super-admin')}
                    className="text-lg px-8 py-6 rounded-lg flex items-center gap-3"
                  >
                      Go to Super Admin Console <ArrowRight className="h-6 w-6" />
                  </Button>
              </div>
          </AccountPage>
      );
  }

  return (
    <AccountPage width="max-w-7xl">
      <AccountHeader
        eyebrow="Organization"
        icon={Users}
        title="Team Management"
        description="Manage your organization members and access."
        actions={
          <Card className="p-3 flex items-center gap-6">
              <div className="flex flex-col">
                  <span className="text-xs text-pl-muted uppercase font-semibold">Members</span>
                  <span className="text-2xl font-bold font-pl-mono tabular-nums text-pl-text">{members.length}</span>
              </div>
              <div className="h-8 w-px bg-pl-border" aria-hidden="true" />
              <div className="flex flex-col">
                  <span className="text-xs text-pl-muted uppercase font-semibold">App Seats</span>
                  <a href="/dashboard/seats" className="text-sm font-semibold text-pl-primary-text hover:text-pl-primary-text-hover hover:underline inline-flex items-center gap-1">Manage per app <ArrowRight className="h-3 w-3" aria-hidden="true" /></a>
              </div>
          </Card>
        }
      />

      {isImpersonating && (
          <div className="bg-pl-warning-bg border border-pl-warning/40 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-pl-warning-text flex items-center gap-2">
                  <Shield className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>You are in Impersonation Mode. Management actions are disabled.</span>
              </div>
              <Button variant="outline" onClick={() => exitImpersonation(actualUser?.id)}>
                  <LogOut className="h-4 w-4 mr-2" /> Exit View
              </Button>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 h-fit">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-pl-muted" aria-hidden="true" />
                    Invite Member
                </CardTitle>
                <CardDescription>
                    New members are invited from the Employees page, where each
                    invitation includes the person's full name.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild className="w-full">
                    <Link to="/dashboard/employees">Go to Employees</Link>
                </Button>
            </CardContent>
        </Card>

        <Card className="lg:col-span-2 min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-pl-muted" aria-hidden="true" />
                    Team Members
                </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Member</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={4} className="text-center text-pl-muted">Loading...</TableCell></TableRow>
                        ) : members.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center text-pl-muted">No members found.</TableCell></TableRow>
                        ) : (
                            members.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 shrink-0 rounded-full bg-pl-sunken text-pl-muted flex items-center justify-center"><Mail className="h-4 w-4" aria-hidden="true" /></div>
                                            <div className="min-w-0">
                                                <div className="font-medium text-pl-text break-all">{member.email}</div>
                                                <div className="text-xs text-pl-muted">Joined: {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'Pending'}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="neutral" className="capitalize">{member.role}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={!member.status || member.status === 'active' ? 'success' : 'neutral'} className="text-xs">{member.status || 'Active'}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(member.id)} disabled={isImpersonating} className="text-pl-muted hover:text-pl-danger-text" aria-label="Remove member">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </AccountPage>
  );
};

export default function TeamManagementPage() {
  return (
    <AccountScope testId="team-management-theme-scope">
      <TeamManagement />
    </AccountScope>
  );
}
