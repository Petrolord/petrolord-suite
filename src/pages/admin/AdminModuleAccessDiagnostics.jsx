import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';

// Task 8: Internal Diagnostics Dashboard for verifying seats/access
export default function AdminModuleAccessDiagnostics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    org: null,
    subscription: null,
    purchasedModules: [],
    orgUsers: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
        if (!user) return;
        
        // 1. Get Org
        const orgUser = await getUserOrgRow(user.id);
        if (!orgUser) throw new Error("No org found");

        const orgId = orgUser.organization_id;

        // 2. Get Org Details
        const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).single();

        // 3. Get Subscription
        const { data: sub } = await supabase.from('subscriptions').select('*').eq('organization_id', orgId).eq('status', 'active').maybeSingle();

        // 4. Get Purchased Modules
        const { data: modules } = await supabase.from('purchased_modules').select('*').eq('organization_id', orgId);

        // 5. Get Org Users Count (for seat usage)
        const { count: userCount } = await supabase.from('organization_members').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);

        setData({
            org,
            subscription: sub,
            purchasedModules: modules || [],
            userCount
        });

    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      fetchData();
  }, [user]);

  if (!user) return <div className="p-8 text-pl-text">Please log in.</div>;

  return (
    <div className="text-pl-text">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldAlert className="text-pl-primary-text" aria-hidden="true"/> Module Access Diagnostics
            </h1>
            <Button onClick={fetchData} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}/> Refresh
            </Button>
        </div>

        <div className="grid gap-6">
            
            {/* Organization Overview */}
            <Card>
                <CardHeader><CardTitle>Organization Overview</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <div className="text-pl-muted text-sm">Org Name</div>
                        <div className="text-xl font-bold">{data.org?.name}</div>
                    </div>
                    <div>
                        <div className="text-pl-muted text-sm">Org ID</div>
                        <div className="font-pl-mono text-sm text-pl-text break-all">{data.org?.id}</div>
                    </div>
                    <div>
                        <div className="text-pl-muted text-sm">Total Members</div>
                        <div className="text-xl font-bold">{data.userCount}</div>
                    </div>
                </CardContent>
            </Card>

            {/* Subscription Table */}
            <Card>
                <CardHeader><CardTitle>Main Subscription Record (Source of Truth)</CardTitle></CardHeader>
                <CardContent>
                    {data.subscription ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-pl-sunken rounded border border-pl-border">
                            <div>
                                <div className="text-pl-muted text-xs">Status</div>
                                <Badge variant="success">{data.subscription.status}</Badge>
                            </div>
                            <div>
                                <div className="text-pl-muted text-xs">User Limit (Seats)</div>
                                <div className="text-2xl font-pl-mono tabular-nums text-pl-text font-bold">{data.subscription.user_limit}</div>
                            </div>
                            <div>
                                <div className="text-pl-muted text-xs">Term</div>
                                <div className="capitalize">{data.subscription.term}</div>
                            </div>
                            <div>
                                <div className="text-pl-muted text-xs">Modules Array</div>
                                <div className="text-xs font-pl-mono break-all">{JSON.stringify(data.subscription.modules)}</div>
                            </div>
                        </div>
                    ) : (
                        <div role="alert" className="text-pl-danger-text p-4 border border-pl-danger/40 bg-pl-danger-bg rounded">
                            No Active Subscription Record Found!
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Purchased Modules Table */}
            <Card>
                <CardHeader><CardTitle>Purchased Modules (Granular Access)</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Module ID</TableHead>
                                <TableHead>Seats Allocated</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Consistency Check</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.purchasedModules.map(pm => {
                                const isConsistent = data.subscription && pm.seats_allocated === data.subscription.user_limit;
                                return (
                                    <TableRow key={pm.id}>
                                        <TableCell className="font-pl-mono">{pm.module_id}</TableCell>
                                        <TableCell className="font-bold text-lg font-pl-mono tabular-nums">{pm.seats_allocated}</TableCell>
                                        <TableCell><Badge variant="outline">{pm.status}</Badge></TableCell>
                                        <TableCell>
                                            {isConsistent ? 
                                                <span className="text-pl-success-text flex items-center text-xs"><CheckCircle className="w-3 h-3 mr-1"/> Matches Sub</span> :
                                                <span className="text-pl-danger-text flex items-center text-xs"><XCircle className="w-3 h-3 mr-1"/> Mismatch</span>
                                            }
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {data.purchasedModules.length === 0 && (
                                <TableRow><TableCell colSpan={4} className="text-center text-pl-muted">No purchased modules found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

        </div>
    </div>
  );
}