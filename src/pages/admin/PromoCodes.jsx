import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Copy, Loader2, Ticket } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';

// Platform promo codes (suite_promo_codes). Super-admin only: the route is
// wrapped in SuperAdminRoute and the table's single RLS policy is
// is_super_admin(), so non-admins can neither reach nor read this.
// Redemption mechanics live server-side (generate-quote validates,
// redeemPromoForQuote burns after payment); this page only manages the codes.
const PromoCodes = () => {
  const navigate = useNavigate();
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

  const shareLink = (code) => `${window.location.origin}/get-quote?promo=${encodeURIComponent(code)}`;

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
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <Helmet><title>Promo Codes | Admin</title></Helmet>

      <div className="flex justify-between items-center mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/super-admin')}
          className="text-slate-400 hover:text-white hover:bg-slate-800/50 flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Console
        </Button>
        <div className="text-right">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 justify-end">
            <Ticket className="h-7 w-7 text-lime-400" /> Promo Codes
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Self-serve discounts customers redeem at checkout. Works on Stripe, Paystack and bank transfer.
          </p>
        </div>
      </div>

      <div className="mb-6">
        <Button onClick={() => setShowForm(v => !v)} className="bg-lime-500 hover:bg-lime-600 text-slate-900 font-bold">
          <Plus className="h-4 w-4 mr-2" /> New Promo Code
        </Button>
      </div>

      {showForm && (
        <Card className="bg-slate-900 border-slate-800 p-6 mb-8 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-300">Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="FOUNDING50"
                className="bg-slate-950 border-slate-700 font-mono mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Percent off</Label>
              <Input
                type="number" min="1" max="100"
                value={form.percent}
                onChange={(e) => setForm(f => ({ ...f, percent: e.target.value }))}
                className="bg-slate-950 border-slate-700 mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Scope</Label>
              <select
                value={form.scope}
                onChange={(e) => setForm(f => ({ ...f, scope: e.target.value }))}
                className="w-full mt-1 rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              >
                <option value="all">Everything (whole subscription)</option>
                {modules.map(m => <option key={m} value={m}>{m} module only</option>)}
              </select>
            </div>
            <div>
              <Label className="text-slate-300">Max redemptions (blank = unlimited)</Label>
              <Input
                type="number" min="1"
                value={form.max_redemptions}
                onChange={(e) => setForm(f => ({ ...f, max_redemptions: e.target.value }))}
                placeholder="e.g. 10"
                className="bg-slate-950 border-slate-700 mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Expires (blank = never)</Label>
              <Input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="bg-slate-950 border-slate-700 mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Notes (internal)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="first 10 founding organizations"
                className="bg-slate-950 border-slate-700 mt-1"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleCreate} disabled={saving} className="bg-lime-500 hover:bg-lime-600 text-slate-900 font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create code'}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="border-slate-700 text-slate-300">Cancel</Button>
          </div>
        </Card>
      )}

      <Card className="bg-slate-900 border-slate-800 overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : codes.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No promo codes yet. Create your first one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="p-3">Code</th>
                <th className="p-3">Discount</th>
                <th className="p-3">Scope</th>
                <th className="p-3">Redeemed</th>
                <th className="p-3">Expires</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Active</th>
                <th className="p-3">Share</th>
              </tr>
            </thead>
            <tbody>
              {codes.map(row => (
                <tr key={row.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                  <td className="p-3 font-mono text-lime-400">{row.code}</td>
                  <td className="p-3">{Number(row.percent)}%</td>
                  <td className="p-3 text-slate-300">{row.scope === 'all' ? 'Everything' : row.scope}</td>
                  <td className="p-3 tabular-nums">
                    {row.redeemed_count}{row.max_redemptions != null ? ` / ${row.max_redemptions}` : ''}
                  </td>
                  <td className="p-3 text-slate-400">{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'Never'}</td>
                  <td className="p-3 text-slate-500 max-w-[200px] truncate">{row.notes || ''}</td>
                  <td className="p-3"><Switch checked={row.active} onCheckedChange={() => toggleActive(row)} /></td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => copyShareLink(row.code)} className="border-slate-700 text-slate-300 h-8">
                      <Copy className="h-3.5 w-3.5 mr-1" /> Link
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-slate-500 mt-4 max-w-2xl">
        The share link opens the public quote page with the code pre-applied. Deactivating a code stops
        new quotes from using it; quotes already generated with it still honor the discount.
      </p>
    </div>
  );
};

export default PromoCodes;
