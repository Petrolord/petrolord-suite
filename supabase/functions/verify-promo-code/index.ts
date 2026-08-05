// Live promo-code feedback for the checkout UI's Apply button (mirror of
// verify-bridge-code). Read-only; the suite_promo_codes table is service-role
// only, so this function is the SPA's only window into it. Mining-resistant
// by construction: keyed on the code, returns only the discount terms.
// generate-quote re-validates server-side, so this is UX, not enforcement.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';
import { validatePromoCode } from '../_shared/promo-codes.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  try {
    const { code } = await req.json();
    if (!code || !String(code).trim()) {
      return json({ error: 'Enter a code to check.' }, 400);
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const promo = await validatePromoCode(supabase, String(code));
    if (!promo) return json({ found: false });
    return json({ found: true, code: promo.code, percent: promo.percent, scope: promo.scope, status: promo.status });
  } catch (e) {
    console.error(`[verify-promo-code] ${(e as Error)?.message ?? e}`);
    return json({ error: 'Could not verify the code. Please try again.' }, 500);
  }
});
