// Thin proxy for the NextGen Academy's anonymous bridge-code
// verification (academy_verify_bridge_code), so the SPA gets live
// code feedback at checkout without holding any NextGen credentials.
// Read-only and mining-resistant by construction: the upstream RPC is
// keyed on the unguessable code and returns no user id.
import { corsHeaders } from './cors.ts';
import { bridgeVerifyConfigured, verifyBridgeCode } from '../_shared/nextgen-bridge.ts';

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
    if (!bridgeVerifyConfigured()) {
      return json({ error: 'Code verification is unavailable right now. Please try again shortly.' }, 503);
    }
    const bridge = await verifyBridgeCode(String(code));
    if (!bridge) return json({ found: false });
    return json({ found: true, ...bridge });
  } catch (e) {
    console.error(`[verify-bridge-code] ${e?.message ?? e}`);
    return json({ error: 'Could not verify the code. Please try again.' }, 500);
  }
});
