import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
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
        const { data: orgUser } = await supabase.from('organization_users').select('*').eq('user_id', user.id).single();
        if (!orgUser) throw new Error("No org found");

        const orgId = orgUser.organization_id;

        // 2. Get Org Details
        const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).single();

        // 3. Get Subscription
        const { data: sub } = await supabase.from('subscriptions').select('*').eq('organization_id', orgId).eq('status', 'active').maybeSingle();

        // 4. Get Purchased Modules
        const { data: modules } = await supabase.from('purchased_modules').select('*').eq('organization_id', orgId);

        // 5. Get Org Users Count (for seat usage)
        const { count: userCount } = await supabase.from('organization_users').select('*', { count: 'exact', head: true }).eq('organization_id', orgId);

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

  if (!user) return <div className="p-8 text-white">Please log in.</div>;

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-white">
        <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldAlert className="text-red-500"/> Module Access Diagnostics
            </h1>
            <Button onClick={fetchData} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}/> Refresh
            </Button>
        </div>

        <div className="grid gap-6">
            
            {/* Organization Overview */}
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle>Organization Overview</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-slate-400 text-sm">Org Name</div>
                        <div className="text-xl font-bold">{data.org?.name}</div>
                    </div>
                    <div>
                        <div className="text-slate-400 text-sm">Org ID</div>
                        <div className="font-mono text-sm text-slate-300">{data.org?.id}</div>
                    </div>
                    <div>
                        <div className="text-slate-400 text-sm">Total Members</div>
                        <div className="text-xl font-bold">{data.userCount}</div>
                    </div>
                </CardContent>
            </Card>

            {/* Subscription Table */}
            <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle>Main Subscription Record (Source of Truth)</CardTitle></CardHeader>
                <CardContent>
                    {data.subscription ? (
                        <div className="grid grid-cols-4 gap-4 p-4 bg-slate-950 rounded border border-slate-800">
                            <div>
                                <div className="text-slate-500 text-xs">Status</div>
                                <Badge className="bg-green-600">{data.subscription.status}</Badge>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs">User Limit (Seats)</div>
                                <div className="text-2xl text-lime-400 font-bold">{data.subscription.user_limit}</div>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs">Term</div>
                                <div className="capitalize">{data.subscription.term}</div>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs">Modules Array</div>
                                <div className="text-xs">{JSON.stringify(data.subscription.modules)}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-red-400 p-4 border border-red-900 bg-red-900/10 rounded">
                            No Active Subscription Record Found!
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Purchased Modules Table */}
            <Card className="bg-slate-900 border-slate-800">
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
                                        <TableCell className="font-mono">{pm.module_id}</TableCell>
                                        <TableCell className="font-bold text-lg">{pm.seats_allocated}</TableCell>
                                        <TableCell><Badge variant="outline">{pm.status}</Badge></TableCell>
                                        <TableCell>
                                            {isConsistent ? 
                                                <span className="text-green-500 flex items-center text-xs"><CheckCircle className="w-3 h-3 mr-1"/> Matches Sub</span> :
                                                <span className="text-red-500 flex items-center text-xs"><XCircle className="w-3 h-3 mr-1"/> Mismatch</span>
                                            }
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {data.purchasedModules.length === 0 && (
                                <TableRow><TableCell colSpan={4} className="text-center text-slate-500">No purchased modules found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

        </div>
    </div>
  );
}