import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
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

// Mock component for InviteEmployee - replace with actual component
const InviteEmployee = ({ orgId, onSuccess }) => {
  return (
    <div className="p-4">
      <p className="text-slate-400 mb-4">Employee invitation form would be here.</p>
      <Button onClick={() => onSuccess()}>Mock Invite</Button>
    </div>
  );
};

export default function EmployeeManagement() {
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
      // Mock data for now
      setOrgId('mock-org-id');
      setMembers([
        {
          id: '1',
          full_name: 'John Doe',
          email: 'john@example.com',
          role: 'admin',
          status: 'active',
          joined_at: '2024-01-15T00:00:00.000Z'
        },
        {
          id: '2',
          full_name: 'Jane Smith',
          email: 'jane@example.com',
          role: 'user',
          status: 'invited',
          joined_at: null
        }
      ]);
      setSeatStats({ used: 2, limit: 5 });
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
          // Mock deactivation
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
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="w-8 h-8 text-lime-400"/> Team Management</h1>
                <p className="text-slate-400">Manage your organization's members and their access.</p>
            </div>
            <div className="text-right">
                <div className="text-sm text-slate-400">Seat Usage</div>
                <div className="text-xl font-bold text-white">
                    {seatStats.used} <span className="text-slate-500 text-sm font-normal">/ {seatStats.limit}</span>
                </div>
                {seatStats.used >= seatStats.limit && <div className="text-xs text-amber-500">Limit Reached</div>}
            </div>
        </div>

        <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Search employees..." 
                        className="pl-8 bg-slate-950 border-slate-700"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-lime-600 hover:bg-lime-700 text-white" disabled={seatStats.used >= seatStats.limit}>
                            <UserPlus className="w-4 h-4 mr-2"/> Invite Member
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
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
                        <TableRow className="border-slate-800 hover:bg-slate-900">
                            <TableHead className="text-slate-400">Name / Email</TableHead>
                            <TableHead className="text-slate-400">Role</TableHead>
                            <TableHead className="text-slate-400">Status</TableHead>
                            <TableHead className="text-slate-400">Joined</TableHead>
                            <TableHead className="text-right text-slate-400">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMembers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-slate-500">
                                    No members found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredMembers.map(member => (
                                <TableRow key={member.id} className="border-slate-800 hover:bg-slate-800/50">
                                    <TableCell>
                                        <div className="font-medium text-white">{member.full_name}</div>
                                        <div className="text-xs text-slate-500">{member.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize border-slate-600 text-slate-300">
                                            {member.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {member.status === 'active' ? (
                                            <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/30">Active</Badge>
                                        ) : member.status === 'invited' ? (
                                            <Badge className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">Invited</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-slate-500">Inactive</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-400">
                                        {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                                                    <MoreHorizontal className="w-4 h-4"/>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-white">
                                                <DropdownMenuLabel>Manage Access</DropdownMenuLabel>
                                                <DropdownMenuItem className="focus:bg-slate-800 cursor-pointer">
                                                    <Shield className="w-4 h-4 mr-2"/> Edit Role
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="focus:bg-slate-800 cursor-pointer text-red-400" onClick={() => handleDeactivate(member.id)}>
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
      </div>
    </div>
  );
}