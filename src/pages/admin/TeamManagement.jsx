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
          <div className="p-12 flex flex-col items-center justify-center h-[80vh] text-center space-y-6">
              <Shield className="h-24 w-24 text-amber-500 mb-4" />
              <h1 className="text-4xl font-bold text-white">Super Admin Access</h1>
              <p className="text-xl text-slate-400 max-w-2xl">
                  You are signed in as a Super Administrator. Team management for individual organizations 
                  is handled via the Super Admin Console.
              </p>
              <Button 
                onClick={() => navigate('/super-admin')}
                className="bg-amber-600 hover:bg-amber-700 text-white text-lg px-8 py-6 rounded-lg flex items-center gap-3"
              >
                  Go to Super Admin Console <ArrowRight className="h-6 w-6" />
              </Button>
          </div>
      );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Team Management</h1>
            <p className="text-slate-400">Manage your organization members and access.</p>
        </div>
        
        <Card className="bg-slate-900 border-slate-800 p-4 flex items-center gap-6">
            <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase font-semibold">Members</span>
                <span className="text-2xl font-bold text-white">{members.length}</span>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase font-semibold">App Seats</span>
                <a href="/dashboard/seats" className="text-sm font-semibold text-lime-400 hover:underline">Manage per app →</a>
            </div>
        </Card>
      </div>

      {isImpersonating && (
          <div className="bg-amber-900/20 border border-amber-700/50 p-4 rounded-lg flex items-center justify-between">
              <div className="text-amber-500 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <span>You are in Impersonation Mode. Management actions are disabled.</span>
              </div>
              <Button variant="outline" className="border-amber-700 text-amber-500" onClick={() => exitImpersonation(actualUser?.id)}>
                  <LogOut className="h-4 w-4 mr-2" /> Exit View
              </Button>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900 border-slate-800 lg:col-span-1 h-fit">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-emerald-500" />
                    Invite Member
                </CardTitle>
                <CardDescription>
                    New members are invited from the Employees page, where each
                    invitation includes the person's full name.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Link to="/dashboard/employees">Go to Employees</Link>
                </Button>
            </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Team Members
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-800">
                            <TableHead className="text-slate-400">Member</TableHead>
                            <TableHead className="text-slate-400">Role</TableHead>
                            <TableHead className="text-slate-400">Status</TableHead>
                            <TableHead className="text-right text-slate-400">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={4} className="text-center text-slate-500">Loading...</TableCell></TableRow>
                        ) : members.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center text-slate-500">No members found.</TableCell></TableRow>
                        ) : (
                            members.map((member) => (
                                <TableRow key={member.id} className="border-slate-800 hover:bg-slate-800/50">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center"><Mail className="h-4 w-4" /></div>
                                            <div>
                                                <div className="font-medium text-white">{member.email}</div>
                                                <div className="text-xs text-slate-500">Joined: {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : 'Pending'}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize border-slate-600 text-slate-400">{member.role}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-emerald-400 text-xs">{member.status || 'Active'}</span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveMember(member.id)} disabled={isImpersonating} className="hover:text-red-400">
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
    </div>
  );
};

export default TeamManagement;