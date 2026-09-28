import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { History } from 'lucide-react';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

function SubscriptionHistoryPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);

  useEffect(() => {
      if(user) fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
      const orgUser = await getUserOrgRow(user.id);
      if(orgUser) {
          const { data } = await supabase.from('subscription_events')
            .select('*')
            .eq('organization_id', orgUser.organization_id)
            .order('event_date', { ascending: false });
          setEvents(data || []);
      }
  };

  return (
    <AccountPage>
        <AccountHeader
            eyebrow="Subscriptions"
            title="Subscription History"
            icon={History}
            backTo="/dashboard/subscriptions"
            backLabel="Back to Subscriptions"
        />

        <Card>
            <CardHeader><CardTitle>Event Log</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Module</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.map(e => (
                            <TableRow key={e.id}>
                                <TableCell className="whitespace-nowrap font-pl-mono tabular-nums text-pl-muted">{new Date(e.event_date).toLocaleString()}</TableCell>
                                <TableCell className="font-medium text-pl-text">{e.module_id}</TableCell>
                                <TableCell>
                                    <Badge variant="neutral" className="uppercase">{e.event_type}</Badge>
                                </TableCell>
                                <TableCell className="text-pl-muted text-sm">{JSON.stringify(e.details)}</TableCell>
                            </TableRow>
                        ))}
                        {events.length === 0 && (
                            <TableRow><TableCell colSpan={4} className="text-center h-24 text-pl-muted">No history found.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </AccountPage>
  );
}

// Design system rollout batch 1E: the page opens its theme scope through AccountScope inside the dashboard scope.
export default function SubscriptionHistory() {
  return (
    <AccountScope testId="subscription-history-theme-scope">
      <SubscriptionHistoryPage />
    </AccountScope>
  );
}
