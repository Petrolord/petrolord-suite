import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  ShieldCheck, CheckCircle, XCircle, Clock, Search, Filter 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import RespondToRequestModal from '@/components/RespondToRequestModal';
import { useToast } from '@/components/ui/use-toast';

export default function AccessRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user) fetchRequests();
  }, [user]);

  const fetchRequests = async () => {
    try {
        setLoading(true);
        // Get user's org id
        const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();
        
        if (orgUser) {
            const { data, error } = await supabase
                .from('access_requests')
                .select(`
                    *,
                    member:organization_members!member_id(full_name, email)
                `)
                .eq('organization_id', orgUser.organization_id)
                .order('requested_at', { ascending: false });

            if (error) throw error;
            setRequests(data);
        }
    } catch (e) {
        console.error(e);
        toast({ title: "Error", description: "Failed to load requests.", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  const filteredRequests = requests.filter(r => {
      const matchesFilter = filter === 'all' ? true : r.status === filter;
      const matchesSearch = r.member?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            r.app_id?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="w-8 h-8 text-blue-400"/> Access Requests</h1>
                <p className="text-slate-400">Manage employee permissions and app access requests.</p>
            </div>
        </div>

        <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
                <div className="flex gap-2">
                    <Button variant={filter === 'pending' ? 'default' : 'outline'} onClick={() => setFilter('pending')} size="sm" className="border-slate-700">Pending</Button>
                    <Button variant={filter === 'approved' ? 'default' : 'outline'} onClick={() => setFilter('approved')} size="sm" className="border-slate-700">Approved</Button>
                    <Button variant={filter === 'rejected' ? 'default' : 'outline'} onClick={() => setFilter('rejected')} size="sm" className="border-slate-700">Rejected</Button>
                    <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')} size="sm" className="border-slate-700">All</Button>
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                    <Input 
                        placeholder="Search user or app..." 
                        className="pl-8 bg-slate-950 border-slate-700"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-800 hover:bg-slate-900">
                            <TableHead className="text-slate-400">Employee</TableHead>
                            <TableHead className="text-slate-400">Application</TableHead>
                            <TableHead className="text-slate-400">Date</TableHead>
                            <TableHead className="text-slate-400">Status</TableHead>
                            <TableHead className="text-right text-slate-400">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24">Loading...</TableCell></TableRow>
                        ) : filteredRequests.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24 text-slate-500">No requests found.</TableCell></TableRow>
                        ) : (
                            filteredRequests.map(req => (
                                <TableRow key={req.id} className="border-slate-800 hover:bg-slate-800/50">
                                    <TableCell>
                                        <div className="font-medium text-white">{req.member?.full_name}</div>
                                        <div className="text-xs text-slate-500">{req.member?.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="border-slate-700 text-slate-300">
                                            {req.app_id}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-400">
                                        {new Date(req.requested_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        {req.status === 'approved' ? (
                                            <Badge className="bg-green-500/20 text-green-400"><CheckCircle className="w-3 h-3 mr-1"/> Approved</Badge>
                                        ) : req.status === 'rejected' ? (
                                            <Badge className="bg-red-500/20 text-red-400"><XCircle className="w-3 h-3 mr-1"/> Rejected</Badge>
                                        ) : (
                                            <Badge className="bg-amber-500/20 text-amber-400"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {req.status === 'pending' && (
                                            <RespondToRequestModal 
                                                request={req} 
                                                onSuccess={fetchRequests}
                                                trigger={<Button size="sm" variant="outline" className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">Review</Button>}
                                            />
                                        )}
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