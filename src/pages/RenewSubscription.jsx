import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { getUserOrgRow } from '@/lib/orgContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AccountScope } from '@/components/account/accountChrome';
import { loadRenewalSelection } from '@/lib/renewalSelection';

// Renewals go through the normal quote-and-pay flow (owner decision
// 2026-09-28). This page reads what the organisation holds today and hands it
// to the upgrade page (QuoteBuilder) as a pre-selection. The quote builder and
// generate-quote price it like any new order, and payment is the usual
// Paystack checkout from the quote. This page shows no price and takes no
// payment itself.
function RenewSubscriptionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selection, setSelection] = useState(null);
  const [expiry, setExpiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const orgUser = await getUserOrgRow(user.id);
        if (!orgUser?.organization_id) {
          if (!cancelled) setSelection({ modules: [], apps: [], billingTerm: null });
          return;
        }
        const sel = await loadRenewalSelection(supabase, orgUser.organization_id);
        const { data: rows } = await supabase.from('purchased_modules')
          .select('expiry_date')
          .eq('organization_id', orgUser.organization_id)
          .eq('status', 'active');
        const dates = (rows || []).map(r => r.expiry_date).filter(Boolean).sort();
        if (!cancelled) {
          setSelection(sel);
          setExpiry(dates[0] || null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not load your current subscription.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const goToQuote = () => {
    navigate('/dashboard/upgrade', { state: { renewal: selection || { modules: [], apps: [], billingTerm: null } } });
  };

  const moduleCount = selection?.modules.length || 0;
  const appCount = selection?.apps.length || 0;
  const seatCount = (selection?.apps || []).reduce((n, a) => n + (a.seats || 1), 0);
  const holdsSomething = moduleCount + appCount > 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
            <CardHeader>
                <div className="flex items-center justify-between gap-2 mb-2">
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md text-sm text-pl-muted hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
                        onClick={() => navigate('/dashboard/subscriptions')}
                    >
                        <ArrowLeft className="w-4 h-4" aria-hidden="true"/> Back
                    </button>
                    <ThemeToggle />
                </div>
                <CardTitle>Renew Subscription</CardTitle>
                <CardDescription>
                    Renewals are priced and paid through the quote builder, using the same prices as a new order.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <p className="text-sm text-pl-muted">Loading your current subscription...</p>
                ) : loadError ? (
                    <p className="text-sm text-pl-muted">
                        {loadError} You can still continue and select your modules in the quote builder.
                    </p>
                ) : holdsSomething ? (
                    <>
                        <div className="bg-pl-sunken p-4 rounded-md border border-pl-border text-pl-text">
                            <p className="text-sm text-pl-muted">What your organisation holds today</p>
                            <p className="mt-1 font-pl-mono tabular-nums" data-testid="renewal-holdings">
                                {moduleCount} module licence{moduleCount === 1 ? '' : 's'}, {appCount} app{appCount === 1 ? '' : 's'}, {seatCount} seat{seatCount === 1 ? '' : 's'}
                            </p>
                            {expiry && (
                                <p className="mt-1 text-sm text-pl-muted">
                                    Earliest expiry: <span className="font-pl-mono tabular-nums">{new Date(expiry).toLocaleDateString()}</span>
                                </p>
                            )}
                        </div>
                        <p className="text-sm text-pl-muted">
                            These are selected for you in the quote builder. You can change them and choose a billing period before you generate the quote and pay.
                        </p>
                    </>
                ) : (
                    <p className="text-sm text-pl-muted">
                        We could not find an active subscription for your organisation. Continue to the quote builder and select the modules you want.
                    </p>
                )}
            </CardContent>
            <CardFooter>
                <Button className="w-full" onClick={goToQuote} disabled={loading}>
                    Continue to quote and payment <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true"/>
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}

// Design system rollout batch 1E: the page opens its theme scope through AccountScope inside the dashboard scope.
export default function RenewSubscription() {
  return (
    <AccountScope testId="renew-subscription-theme-scope">
      <RenewSubscriptionPage />
    </AccountScope>
  );
}
