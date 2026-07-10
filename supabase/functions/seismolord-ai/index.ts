// Seismolord AI copilot gateway (Phase 5, cuttable).
//
// Holds the LLM key server-side and the versioned system prompt; the
// browser sends the running conversation (including tool results it
// executed locally over the user's own data) and receives the next
// assistant message, which may contain tool calls for the client to run.
// The function never touches seismic data itself — tools execute
// client-side where the bricks, horizons and engines live (plan of
// record: no server-side numerics).
//
// Secrets: OPENAI_API_KEY (required), OPENAI_MODEL (optional override).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import { SYSTEM_PROMPT, PROMPT_VERSION, TOOLS } from './systemPrompt.ts';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const MAX_MESSAGES = 40;

function getUserClient(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let supabase;
    try {
      supabase = getUserClient(req);
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: jsonHeaders });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'AI is not configured: set the OPENAI_API_KEY function secret.',
      }), { status: 503, headers: jsonHeaders });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array is required' }),
        { status: 400, headers: jsonHeaders });
    }

    const trimmed = messages.slice(-MAX_MESSAGES);
    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
        tools: TOOLS,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('OpenAI error', res.status, detail.slice(0, 500));
      return new Response(JSON.stringify({ error: `LLM request failed (${res.status})` }),
        { status: 502, headers: jsonHeaders });
    }
    const completion = await res.json();
    const message = completion.choices?.[0]?.message;
    if (!message) {
      return new Response(JSON.stringify({ error: 'Empty LLM response' }),
        { status: 502, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({
      message,
      prompt_version: PROMPT_VERSION,
      model,
    }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: jsonHeaders });
  }
});
