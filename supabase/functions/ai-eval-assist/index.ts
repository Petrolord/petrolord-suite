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
// serialised per organization), which refuses once, since 00:00 UTC and
// among calls that did not fail, the organization's calls reach DAILY_CAP
// (200) or this user's calls in the organization reach USER_DAILY_CAP (40)
// (owner decision 2026-09-26). A call the provider fails is marked 'error'
// and does not count.
//
// Model (owner decision 2026-09-26): DEFAULT_MODEL gpt-6-luna, a reasoning
// model. For a reasoning model (isReasoningModel in logic.ts) the request
// sends reasoning_effort (low unless OPENAI_REASONING_EFFORT names another)
// and no temperature; for gpt-4o and gpt-4.1 models it sends temperature 0.
// The reply is asked for as structured output (REPLY_SCHEMA). The model and
// the effort are recorded on the call's row.
//
// Status codes: 200 answer; 400 bad request; 401 not signed in; 403 not a
// member; 429 a cap reached (the message names the organization or personal
// cap, with calls_today, daily_cap, user_calls_today, user_daily_cap and
// cap_hit); 502 the model failed; 503 not configured (no OPENAI_API_KEY, no
// service role key, or the metering migrations 20260925200000 and
// 20260926120000 not applied). The studio shows 503 as a "not configured"
// state and works fully without this function.
//
// Secrets: OPENAI_API_KEY (required), OPENAI_MODEL (optional, default
// gpt-6-luna), OPENAI_REASONING_EFFORT (optional: none, low, medium, high,
// xhigh or max; default low; reasoning models only), SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Deploy is HELD for the owner, AFTER migration 20260926120000 is applied:
// supabase functions deploy ai-eval-assist

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import {
  DAILY_CAP, DEFAULT_MODEL, FUNCTION_NAME, USER_DAILY_CAP,
  buildChatRequest, capMessage, describeProviderError, isReasoningModel, parseModelReply, resolveReasoningEffort, validateRequest,
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

  const model = Deno.env.get('OPENAI_MODEL')?.trim() || DEFAULT_MODEL;
  const reasoning = isReasoningModel(model);
  const { effort, warning } = resolveReasoningEffort(Deno.env.get('OPENAI_REASONING_EFFORT'));
  if (warning && reasoning) console.warn(warning);
  const reasoningEffort = reasoning ? effort : null;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Reserve the call (and log it) before the model runs, so the cap holds under concurrency.
  const { data: reserved, error: reserveError } = await admin.rpc('dai_llm_reserve_call', {
    p_org: organizationId, p_user: user.id, p_function: FUNCTION_NAME, p_model: model, p_cap: DAILY_CAP, p_user_cap: USER_DAILY_CAP,
  });
  if (reserveError) {
    console.error('dai_llm_reserve_call failed', reserveError.message);
    return json({ error: 'The language-model helper is not configured on this server (the metering is missing: migrations 20260925200000 and 20260926120000).' }, 503);
  }
  const row = Array.isArray(reserved) ? reserved[0] : reserved;
  const callsToday = Number(row?.calls_today ?? 0);
  const userCallsToday = Number(row?.user_calls_today ?? 0);
  const counts = { calls_today: callsToday, daily_cap: DAILY_CAP, user_calls_today: userCallsToday, user_daily_cap: USER_DAILY_CAP };
  if (!row?.call_id) {
    const hit = row?.cap_hit === 'user' ? 'user' : 'organization';
    return json({ error: capMessage(hit, { callsToday, userCallsToday }), cap_hit: hit, ...counts }, 429);
  }
  const callId = row.call_id as string;

  const finish = (patch: Record<string, unknown>) => admin.from('dai_llm_calls')
    .update({ ...patch, reasoning_effort: reasoningEffort, completed_at: new Date().toISOString() })
    .eq('id', callId);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildChatRequest(model, query, passages, effort)),
    });
    if (!res.ok) {
      const provider = describeProviderError(res.status, await res.text(), model);
      console.error(provider.log);
      await finish({ status: 'error', error: provider.error });
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
      reasoning_effort: reasoningEffort,
      usage: usage ? { prompt_tokens: usage.prompt_tokens ?? null, completion_tokens: usage.completion_tokens ?? null } : null,
      ...counts,
      graded: false,
    });
  } catch (e) {
    await finish({ status: 'error', error: String((e as Error)?.message ?? e).slice(0, 300) });
    return json({ error: 'The language model could not be reached. This call does not count against the cap.' }, 502);
  }
});
