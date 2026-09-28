import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
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
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

function AccessRequestsPage() {
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
        const orgUser = await getUserOrgRow(user.id);
        
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
    <AccountPage>

        <AccountHeader
            eyebrow="Organization"
            title="Access Requests"
            description="Manage employee permissions and app access requests."
            icon={ShieldCheck}
        />

        <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 space-y-0">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter requests by status">
                    <Button variant={filter === 'pending' ? 'default' : 'outline'} aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')} size="sm">Pending</Button>
                    <Button variant={filter === 'approved' ? 'default' : 'outline'} aria-pressed={filter === 'approved'} onClick={() => setFilter('approved')} size="sm">Approved</Button>
                    <Button variant={filter === 'rejected' ? 'default' : 'outline'} aria-pressed={filter === 'rejected'} onClick={() => setFilter('rejected')} size="sm">Rejected</Button>
                    <Button variant={filter === 'all' ? 'default' : 'outline'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')} size="sm">All</Button>
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-pl-muted" aria-hidden="true" />
                    <Input 
                        placeholder="Search user or app..." 
                        aria-label="Search user or app"
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Application</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24 text-pl-muted">Loading...</TableCell></TableRow>
                        ) : filteredRequests.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24 text-pl-muted">No requests found.</TableCell></TableRow>
                        ) : (
                            filteredRequests.map(req => (
                                <TableRow key={req.id}>
                                    <TableCell>
                                        <div className="font-medium text-pl-text">{req.member?.full_name}</div>
                                        <div className="text-xs text-pl-muted">{req.member?.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="neutral">
                                            {req.app_id}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap font-pl-mono tabular-nums text-sm text-pl-muted">
                                        {new Date(req.requested_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        {req.status === 'approved' ? (
                                            <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1"/> Approved</Badge>
                                        ) : req.status === 'rejected' ? (
                                            <Badge variant="danger"><XCircle className="w-3 h-3 mr-1"/> Rejected</Badge>
                                        ) : (
                                            <Badge variant="warning"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {req.status === 'pending' && (
                                            <RespondToRequestModal 
                                                request={req} 
                                                onSuccess={fetchRequests}
                                                trigger={<Button size="sm" variant="outline">Review</Button>}
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
    </AccountPage>
  );
}

// Design system rollout batch 1E: the page opens its theme scope through AccountScope inside the dashboard scope.
export default function AccessRequests() {
  return (
    <AccountScope testId="access-requests-theme-scope">
      <AccessRequestsPage />
    </AccountScope>
  );
}
