// send-email: INTERNAL mail sender for other edge functions.
//
// Deployed from the Horizons era and never committed; rewritten by the
// 2026-10 security sweep. Before: verify_jwt off and no caller check, so it
// was an open mail relay: anyone could send any HTML to any address from
// the Petrolord sender.
// Now: only callers holding this project's service-role key (other edge
// functions: generate-quote, verify-paystack-payment, verify-bank-transfer,
// _shared/provision-quote) are served, and mail goes through
// _shared/email.ts (Resend, then Brevo). Browsers get 403.

import { corsHeaders } from './cors.ts';
import { isServiceRoleRequest } from '../_shared/platform-admin.ts';
import { buildInternalMail } from '../_shared/internal-mail.ts';
import { sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (!isServiceRoleRequest(req)) return json({ error: 'Forbidden' }, 403);

  try {
    const mail = buildInternalMail(await req.json().catch(() => null));
    if (typeof mail === 'string') return json({ error: mail }, 400);
    const sent = await sendEmail({ ...mail, logPrefix: '[send-email]' });
    return json({ success: sent }, sent ? 200 : 502);
  } catch (e) {
    console.error('[send-email]', (e as Error).message);
    return json({ error: 'Could not send.' }, 500);
  }
});
