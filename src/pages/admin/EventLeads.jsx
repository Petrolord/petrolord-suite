import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';
import { createBlob, downloadFile } from '@/utils/exportUtils';
import { INTERESTS, leadsCsv } from '@/lib/eventLeads';

// Event leads from the NAPE booth form (/nape). Super-admin only: the route
// is wrapped in SuperAdminRoute and the table's only read policy is
// is_super_admin(), so nobody else can list the leads.
const label = Object.fromEntries(INTERESTS.map((i) => [i.key, i.label]));

export default function EventLeads() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('event_leads').select('*').order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not load the leads', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const download = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(createBlob(leadsCsv(rows), 'text/csv;charset=utf-8'), `event-leads-${stamp}.csv`);
  };

  return (
    <AccountScope>
      <Helmet><title>Event leads</title></Helmet>
      <AccountPage>
        <AccountHeader
          eyebrow="Admin"
          title="Event leads"
          description="Visitors who left their details at the booth (petrolord.com/nape)."
          backTo="/super-admin"
          backLabel="Back to the console"
          actions={(
            <Button variant="outline" onClick={download} disabled={!rows.length} data-testid="event-leads-csv">
              <Download className="mr-2 h-4 w-4" />Download CSV
            </Button>
          )}
        />
        <Card className="overflow-x-auto p-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-pl-muted"><Loader2 className="h-4 w-4 animate-spin" />Loading</p>
          ) : rows.length ? (
            <table className="w-full text-sm" data-testid="event-leads-table">
              <thead>
                <tr className="text-left text-pl-muted">
                  <th className="pb-2 pr-3 font-medium">When</th><th className="pb-2 pr-3 font-medium">Name</th><th className="pb-2 pr-3 font-medium">Phone</th>
                  <th className="pb-2 pr-3 font-medium">Company and role</th><th className="pb-2 pr-3 font-medium">Interests</th><th className="pb-2 pr-3 font-medium">Note</th><th className="pb-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-pl-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{String(r.created_at).slice(0, 16).replace('T', ' ')}</td>
                    <td className="py-2 pr-3">{r.name}{r.email ? <div className="text-pl-muted">{r.email}</div> : null}</td>
                    <td className="py-2 pr-3 whitespace-nowrap"><a className="underline" href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer">+{r.phone}</a></td>
                    <td className="py-2 pr-3">{[r.company, r.role].filter(Boolean).join(', ')}</td>
                    <td className="py-2 pr-3">{(r.interests || []).map((k) => label[k] || k).join(', ')}</td>
                    <td className="py-2 pr-3">{r.note}</td>
                    <td className="py-2">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-pl-muted">No leads yet. They appear here as visitors send the form at petrolord.com/nape.</p>
          )}
        </Card>
      </AccountPage>
    </AccountScope>
  );
}
