import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [seatsAllocated, setSeatsAllocated] = useState(0);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const seatsUsed = calculateSeatsUsed(members);
  const seatsAvailable = getSeatsAvailable(seatsAllocated, seatsUsed);

  useEffect(() => {
    // Task 9: Check privileges
    const checkPrivileges = async () => {
        console.log('TeamManagement: Checking privileges for', user?.email);
        
        if (isSuperAdmin) {
            console.log('TeamManagement: User is Super Admin');
            return; // Allow render to show special message
        }

        // Get user role in org
        if (user?.id) {
            const { data, error } = await supabase
                .from('organization_users')
                .select('role, organization_id')
                .eq('user_id', user.id)
                .single();
            
            if (error || !data) {
                console.error("TeamManagement: Could not fetch user role");
                navigate('/dashboard');
                return;
            }

            console.log('TeamManagement: User Role is', data.role);
            setUserRole(data.role);
            setCurrentOrgId(data.organization_id);

            // If not admin/owner, redirect
            if (!['owner', 'admin', 'org_admin'].includes(data.role)) {
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

  const handleInvite = async (e) => {
    e.preventDefault();
    if (isImpersonating) return;
    if (!inviteEmail) return;

    const isInviteeSuperAdmin = inviteRole === 'super_admin';
    const allowed = canAddMember(seatsAvailable, isInviteeSuperAdmin);
    
    if (!allowed) {
        toast({ variant: "destructive", title: "No seats available", description: "Please upgrade subscription." });
        return;
    }

    try {
      const { error } = await supabase
        .from('organization_members')
        .insert([{
            organization_id: currentOrgId,
            email: inviteEmail,
            role: inviteRole,
            status: 'invited',
            joined_at: new Date().toISOString()
        }]);

      if (error) throw error;

      toast({ title: "Invitation Sent", description: `Invited ${inviteEmail} to the team.` });
      setInviteEmail('');
      fetchTeamData(currentOrgId);

    } catch (error) {
      toast({ variant: "destructive", title: "Invitation Failed", description: error.message });
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
  if (isSuperAdmin && !isImpersonating) {
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
                <span className="text-xs text-slate-500 uppercase font-semibold">Seats Used</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">{seatsUsed}</span>
                    <span className="text-slate-500">/ {seatsAllocated}</span>
                </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase font-semibold">Available</span>
                <span className={`text-2xl font-bold ${seatsAvailable > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {seatsAvailable}
                </span>
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
        <Card className="bg-slate-900 border-slate-800 lg:col-span-1 h-fit opacity-100 relative overflow-hidden">
            {isImpersonating && <div className="absolute inset-0 bg-slate-950/50 z-10 cursor-not-allowed" />}
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-emerald-500" />
                    Invite Member
                </CardTitle>
                <CardDescription>
                    Send an email invitation.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleInvite} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Email Address</label>
                        <Input 
                            type="email" 
                            placeholder="email@company.com" 
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="bg-slate-950 border-slate-700 text-white"
                            required
                            disabled={isImpersonating}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Role</label>
                        <select 
                            className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            disabled={isImpersonating}
                        >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer</option>
                        </select>
                    </div>
                    
                    <Button 
                        type="submit" 
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={loading || isImpersonating}
                    >
                        {loading ? 'Sending...' : 'Send Invitation'}
                    </Button>
                </form>
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