import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SubscriptionHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);

  useEffect(() => {
      if(user) fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
      const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user.id).single();
      if(orgUser) {
          const { data } = await supabase.from('subscription_events')
            .select('*')
            .eq('organization_id', orgUser.organization_id)
            .order('event_date', { ascending: false });
          setEvents(data || []);
      }
  };

  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-white">
        <div className="flex items-center gap-2 mb-6 text-slate-400 cursor-pointer hover:text-white" onClick={() => navigate('/dashboard/subscriptions')}>
            <ArrowLeft className="w-4 h-4"/> Back to Subscriptions
        </div>
        
        <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
            <History className="w-8 h-8 text-purple-400"/> Subscription History
        </h1>

        <Card className="bg-slate-900 border-slate-800">
            <CardHeader><CardTitle>Event Log</CardTitle></CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-slate-800 hover:bg-slate-900">
                            <TableHead className="text-slate-400">Date</TableHead>
                            <TableHead className="text-slate-400">Module</TableHead>
                            <TableHead className="text-slate-400">Event</TableHead>
                            <TableHead className="text-slate-400">Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.map(e => (
                            <TableRow key={e.id} className="border-slate-800 hover:bg-slate-800/50">
                                <TableCell className="text-slate-300">{new Date(e.event_date).toLocaleString()}</TableCell>
                                <TableCell className="text-white font-medium">{e.module_id}</TableCell>
                                <TableCell>
                                    <span className="uppercase text-xs font-bold px-2 py-1 rounded bg-slate-800 text-slate-300">{e.event_type}</span>
                                </TableCell>
                                <TableCell className="text-slate-400 text-sm">{JSON.stringify(e.details)}</TableCell>
                            </TableRow>
                        ))}
                        {events.length === 0 && (
                            <TableRow><TableCell colSpan={4} className="text-center h-24 text-slate-500">No history found.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}