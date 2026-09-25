// ai-eval-assist: the optional, metered language-model helper of the AI
// Evaluation Studio (Data & AI D5).
//
// Owner decision: engine first, an optional metered language model, never
// graded. The studio calls this with one query and the passages its current
// retrieval settings returned (at most MAX_PASSAGES). A hosted model is told
// to answer ONLY from those passages and cite passage ids (SYSTEM_PROMPT in
// logic.ts); the answer goes back to the studio, which scores it with the
// engine's deterministic groundedness check and labels it as model output
// that is not graded. Nothing here grades anything.
//
// Metering (new with D5; the Suite had none): the caller must be an active
// member of the organization named (is_org_member through their own JWT).
// Every call is logged in dai_llm_calls with the organization, user, model
// and tokens, reserved first through dai_llm_reserve_call (service role,
// serialised per organization), which refuses once the organization's calls
// since 00:00 UTC that did not fail reach DAILY_CAP. A call the provider
// fails is marked 'error' and does not count.
//
// Status codes: 200 answer; 400 bad request; 401 not signed in; 403 not a
// member; 429 cap reached (with calls_today and daily_cap); 502 the model
// failed; 503 not configured (no OPENAI_API_KEY, no service role key, or the
// metering migration 20260925200000 not applied). The studio shows 503 as a
// "not configured" state and works fully without this function.
//
// Secrets: OPENAI_API_KEY (required), OPENAI_MODEL (optional, default
// gpt-4o-mini), SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Deploy is HELD for the owner: supabase functions deploy ai-eval-assist

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import {
  DAILY_CAP, DEFAULT_MODEL, FUNCTION_NAME, SYSTEM_PROMPT, buildUserPrompt, capMessage, parseModelReply, validateRequest,
} from './logic.ts';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Sign in to use the helper.' }, 401);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Sign in to use the helper.' }, 401);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey || !serviceKey) {
    return json({ error: 'The language-model helper is not configured on this server (missing OPENAI_API_KEY or the service role key).' }, 503);
  }

  const body = await req.json().catch(() => null);
  const v = validateRequest(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const { organizationId, query, passages } = v.value;

  const { data: member, error: memberError } = await userClient.rpc('is_org_member', { org_id: organizationId });
  if (memberError) return json({ error: 'Membership could not be checked.' }, 500);
  if (member !== true) return json({ error: 'The helper is metered per organization, and you are not an active member of that organization.' }, 403);

  const model = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Reserve the call (and log it) before the model runs, so the cap holds under concurrency.
  const { data: reserved, error: reserveError } = await admin.rpc('dai_llm_reserve_call', {
    p_org: organizationId, p_user: user.id, p_function: FUNCTION_NAME, p_model: model, p_cap: DAILY_CAP,
  });
  if (reserveError) {
    console.error('dai_llm_reserve_call failed', reserveError.message);
    return json({ error: 'The language-model helper is not configured on this server (the metering table is missing: migration 20260925200000).' }, 503);
  }
  const row = Array.isArray(reserved) ? reserved[0] : reserved;
  const callsToday = Number(row?.calls_today ?? 0);
  if (!row?.call_id) return json({ error: capMessage(DAILY_CAP), calls_today: callsToday, daily_cap: DAILY_CAP }, 429);
  const callId = row.call_id as string;

  const finish = (patch: Record<string, unknown>) => admin.from('dai_llm_calls')
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq('id', callId);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(query, passages) },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('OpenAI error', res.status, detail.slice(0, 500));
      await finish({ status: 'error', error: `provider ${res.status}` });
      return json({ error: `The language model did not answer (provider status ${res.status}). This call does not count against the cap.` }, 502);
    }
    const completion = await res.json();
    const usage = completion?.usage ?? null;
    const parsed = parseModelReply(completion?.choices?.[0]?.message?.content);
    if (!parsed.ok) {
      await finish({ status: 'error', error: parsed.error, tokens_in: usage?.prompt_tokens ?? null, tokens_out: usage?.completion_tokens ?? null });
      return json({ error: `${parsed.error} This call does not count against the cap.` }, 502);
    }
    await finish({ status: 'ok', tokens_in: usage?.prompt_tokens ?? null, tokens_out: usage?.completion_tokens ?? null });
    return json({
      answer: parsed.answer,
      citations: parsed.citations,
      model,
      usage: usage ? { prompt_tokens: usage.prompt_tokens ?? null, completion_tokens: usage.completion_tokens ?? null } : null,
      calls_today: callsToday,
      daily_cap: DAILY_CAP,
      graded: false,
    });
  } catch (e) {
    await finish({ status: 'error', error: String((e as Error)?.message ?? e).slice(0, 300) });
    return json({ error: 'The language model could not be reached. This call does not count against the cap.' }, 502);
  }
});
