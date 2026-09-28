import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Plus, Copy, Loader2, Ticket } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { NativeSelect } from '@/components/ui/native-select';
import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

// Platform promo codes (suite_promo_codes). Super-admin only: the route is
// wrapped in SuperAdminRoute and the table's single RLS policy is
// is_super_admin(), so non-admins can neither reach nor read this.
// Redemption mechanics live server-side (generate-quote validates,
// redeemPromoForQuote burns after payment); this page only manages the codes.
const PromoCodes = () => {
  const { toast } = useToast();
  const [codes, setCodes] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '', percent: 20, scope: 'all', max_redemptions: '', expires_at: '', notes: ''
  });

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('suite_promo_codes')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setCodes(data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not load promo codes', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCodes();
    // Scope dropdown options come from the live catalog's module names.
    supabase.from('master_apps').select('module').then(({ data }) => {
      const names = Array.from(new Set((data || []).map(r => r.module).filter(Boolean))).sort();
      setModules(names);
    });
  }, [fetchCodes]);

  const shareLink = (code) => `${window.location.origin}/dashboard/upgrade?promo=${encodeURIComponent(code)}`;

  const copyShareLink = async (code) => {
    try {
      await navigator.clipboard.writeText(shareLink(code));
      toast({ title: 'Link copied', description: shareLink(code) });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: shareLink(code) });
    }
  };

  const handleCreate = async () => {
    const code = form.code.trim().toUpperCase();
    const percent = Number(form.percent);
    if (!code) return toast({ variant: 'destructive', title: 'Enter a code' });
    if (!(percent > 0 && percent <= 100)) return toast({ variant: 'destructive', title: 'Percent must be between 1 and 100' });
    setSaving(true);
    try {
      const { error } = await supabase.from('suite_promo_codes').insert({
        code,
        percent,
        scope: form.scope || 'all',
        max_redemptions: form.max_redemptions ? parseInt(form.max_redemptions) : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        notes: form.notes || null
      });
      if (error) throw error;
      toast({ title: 'Promo code created', description: `${code} is live. Share link copied below.` });
      setShowForm(false);
      setForm({ code: '', percent: 20, scope: 'all', max_redemptions: '', expires_at: '', notes: '' });
      fetchCodes();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Create failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    const { error } = await supabase.from('suite_promo_codes')
      .update({ active: !row.active }).eq('id', row.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Update failed', description: error.message });
    } else {
      toast({ title: row.active ? `${row.code} deactivated` : `${row.code} reactivated` });
      fetchCodes();
    }
  };

  return (
    <AccountPage>
      <Helmet><title>Promo Codes | Admin</title></Helmet>

      <AccountHeader
        eyebrow="Platform admin"
        icon={Ticket}
        title="Promo Codes"
        description="Self-serve discounts customers redeem at checkout. Works on Stripe, Paystack and bank transfer."
        backTo="/super-admin"
        backLabel="Back to Console"
        actions={(
          <Button onClick={() => setShowForm(v => !v)}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" /> New Promo Code
          </Button>
        )}
      />

      {showForm && (
        <Card className="p-6 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="promo-code">Code</Label>
              <Input
                id="promo-code"
                value={form.code}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="FOUNDING50"
                className="font-pl-mono mt-1"
              />
            </div>
            <div>
              <Label htmlFor="promo-percent">Percent off</Label>
              <Input
                id="promo-percent"
                type="number" min="1" max="100"
                value={form.percent}
                onChange={(e) => setForm(f => ({ ...f, percent: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="promo-scope">Scope</Label>
              <NativeSelect
                id="promo-scope"
                value={form.scope}
                onChange={(e) => setForm(f => ({ ...f, scope: e.target.value }))}
                className="mt-1"
              >
                <option value="all">Everything (whole subscription)</option>
                {modules.map(m => <option key={m} value={m}>{m} module only</option>)}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="promo-max">Max redemptions (blank = unlimited)</Label>
              <Input
                id="promo-max"
                type="number" min="1"
                value={form.max_redemptions}
                onChange={(e) => setForm(f => ({ ...f, max_redemptions: e.target.value }))}
                placeholder="e.g. 10"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="promo-expires">Expires (blank = never)</Label>
              <Input
                id="promo-expires"
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="promo-notes">Notes (internal)</Label>
              <Input
                id="promo-notes"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="first 10 founding organizations"
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : 'Create code'}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-pl-muted"><Loader2 className="h-6 w-6 animate-spin mx-auto" aria-label="Loading" /></div>
        ) : codes.length === 0 ? (
          <div className="p-10 text-center text-pl-muted">No promo codes yet. Create your first one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-pl-sunken">
              <tr className="text-left text-xs uppercase tracking-wide text-pl-muted border-b border-pl-border">
                <th className="p-3 font-semibold">Code</th>
                <th className="p-3 font-semibold">Discount</th>
                <th className="p-3 font-semibold">Scope</th>
                <th className="p-3 font-semibold">Redeemed</th>
                <th className="p-3 font-semibold">Expires</th>
                <th className="p-3 font-semibold">Notes</th>
                <th className="p-3 font-semibold">Active</th>
                <th className="p-3 font-semibold">Share</th>
              </tr>
            </thead>
            <tbody>
              {codes.map(row => (
                <tr key={row.id} className="border-b border-pl-border last:border-0 hover:bg-pl-sunken/60">
                  <td className="p-3 font-pl-mono font-semibold text-pl-text">{row.code}</td>
                  <td className="p-3 font-pl-mono tabular-nums text-pl-text">{Number(row.percent)}%</td>
                  <td className="p-3 text-pl-text">{row.scope === 'all' ? 'Everything' : row.scope}</td>
                  <td className="p-3 font-pl-mono tabular-nums text-pl-text">
                    {row.redeemed_count}{row.max_redemptions != null ? ` / ${row.max_redemptions}` : ''}
                  </td>
                  <td className="p-3 text-pl-muted">{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'Never'}</td>
                  <td className="p-3 text-pl-muted max-w-[200px] truncate">{row.notes || ''}</td>
                  <td className="p-3"><Switch checked={row.active} onCheckedChange={() => toggleActive(row)} aria-label={`${row.code} active`} /></td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => copyShareLink(row.code)} className="h-8">
                      <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Link
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-pl-muted max-w-2xl">
        The share link opens the quote builder on the upgrade page with the code pre-filled and checked for the customer. Deactivating a code stops
        new quotes from using it; quotes already generated with it still honor the discount.
      </p>
    </AccountPage>
  );
};

export default function PromoCodesPage() {
  return (
    <AccountScope testId="promo-codes-theme-scope">
      <PromoCodes />
    </AccountScope>
  );
}
