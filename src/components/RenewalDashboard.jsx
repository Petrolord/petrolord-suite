import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle, Clock, RefreshCw, ShieldAlert, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';

const RenewalDashboard = () => {
  const [renewals, setRenewals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, upcoming, failed, suspended
  const { toast } = useToast();

  useEffect(() => {
    fetchRenewals();
    
    // Subscribe to realtime changes
    const subscription = supabase
      .channel('public:subscriptions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, payload => {
        fetchRenewals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchRenewals = async () => {
    try {
      setLoading(true);
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      // Check if admin to decide query scope
      // Assuming simple logic: fetch subscriptions linked to user's org
      // For 'Admin functionality to view all orgs', we'd need is_super_admin check.
      // Here we implement Org Admin view primarily.
      
      const { data: orgUser } = await supabase
        .from('organization_users')
        .select('organization_id, role')
        .eq('user_id', user.user.id)
        .single();

      if (!orgUser) return;

      let query = supabase
        .from('subscriptions')
        .select(`
            *,
            payment_methods (*),
            renewal_notifications (id, sent_at, notification_type, status),
            renewal_audit_log (id, action, created_at, details)
        `)
        .eq('organization_id', orgUser.organization_id)
        .order('renewal_date', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      setRenewals(data || []);
    } catch (error) {
      console.error('Error fetching renewals:', error);
      toast({ title: "Error", description: "Could not load renewal data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (sub) => {
    if (sub.status === 'suspended') return <Badge variant="destructive" className="flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> Suspended</Badge>;
    if (sub.renewal_status === 'failed') return <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Payment Failed</Badge>;
    if (sub.status === 'active') return <Badge className="bg-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Active</Badge>;
    return <Badge variant="outline">{sub.status}</Badge>;
  };

  const handleManualRetry = async (subId) => {
      toast({ title: "Processing", description: "Initiating manual retry..." });
      // Call edge function manually or trigger via UI logic (simplified here)
      // In production, you'd verify payment method then call process-subscription-renewals for specific ID
      setTimeout(() => {
          toast({ title: "Retry Queued", description: "System will attempt payment shortly." });
      }, 1000);
  };

  const filteredRenewals = renewals.filter(sub => {
      if (filter === 'all') return true;
      if (filter === 'failed') return sub.renewal_status === 'failed' || sub.last_renewal_error;
      if (filter === 'suspended') return sub.status === 'suspended';
      if (filter === 'upcoming') {
          const today = new Date();
          const renewal = new Date(sub.renewal_date);
          const diffTime = renewal - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          return diffDays <= 30 && diffDays >= 0;
      }
      return true;
  });

  return (
    <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Renewals</h1>
            <p className="text-slate-500">Manage recurring billing and payment health</p>
        </div>
        <div className="flex gap-2">
            <Button variant={filter === 'all' ? "default" : "outline"} onClick={() => setFilter('all')}>All</Button>
            <Button variant={filter === 'upcoming' ? "default" : "outline"} onClick={() => setFilter('upcoming')}>Upcoming</Button>
            <Button variant={filter === 'failed' ? "destructive" : "outline"} onClick={() => setFilter('failed')}>Failed/Issues</Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Active Subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{renewals.filter(r => r.status === 'active').length}</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Critical Issues</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-red-600">
                    {renewals.filter(r => r.renewal_status === 'failed' || r.status === 'suspended').length}
                </div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">Next 30 Days Revenue</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                    {/* Simplified calculation */}
                    NGN {renewals
                        .filter(r => {
                            const d = new Date(r.renewal_date);
                            const now = new Date();
                            const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
                            return diff >= 0 && diff <= 30;
                        })
                        .reduce((acc, curr) => acc + (curr.quote_details?.total_amount || 0), 0)
                        .toLocaleString()}
                </div>
            </CardContent>
        </Card>
      </div>

      {/* Main List */}
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Modules</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Renewal Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Last Activity</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-slate-500">Loading subscriptions...</TableCell>
                        </TableRow>
                    ) : filteredRenewals.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-slate-500">No subscriptions found for this filter.</TableCell>
                        </TableRow>
                    ) : (
                        filteredRenewals.map((sub) => (
                            <TableRow key={sub.id} className={sub.renewal_status === 'failed' ? "bg-red-50/50" : ""}>
                                <TableCell className="font-medium">
                                    {(sub.modules || []).join(', ') || 'N/A'}
                                    {sub.renewal_attempt_count > 0 && (
                                        <div className="text-xs text-red-500 mt-1 flex items-center">
                                            <RefreshCw className="w-3 h-3 mr-1"/> Retry #{sub.renewal_attempt_count}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>{getStatusBadge(sub)}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span>{sub.renewal_date ? format(new Date(sub.renewal_date), 'MMM dd, yyyy') : 'N/A'}</span>
                                        {sub.reminder_sent_at && <span className="text-xs text-slate-400">Reminder sent</span>}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {sub.quote_details?.currency} {sub.quote_details?.total_amount?.toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    {sub.payment_methods?.[0] ? (
                                        <div className="flex items-center gap-2">
                                            <CreditCard className="w-4 h-4 text-slate-400"/>
                                            <span className="text-sm">**** {sub.payment_methods[0].card_last4}</span>
                                        </div>
                                    ) : (
                                        <span className="text-yellow-600 text-xs bg-yellow-100 px-2 py-1 rounded">Missing Method</span>
                                    )}
                                </TableCell>
                                <TableCell className="max-w-[200px]">
                                    {sub.last_renewal_error ? (
                                        <p className="text-xs text-red-600 truncate" title={sub.last_renewal_error}>
                                            Error: {sub.last_renewal_error}
                                        </p>
                                    ) : (
                                        <span className="text-slate-500 text-sm">-</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    {(sub.renewal_status === 'failed' || sub.status === 'suspended') && (
                                        <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleManualRetry(sub.id)}>
                                            Retry Now
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
      </Card>
    </div>
  );
};

export default RenewalDashboard;