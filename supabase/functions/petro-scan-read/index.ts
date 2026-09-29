// Petrophysics Studio scan reader (PT7). The browser sends ONE scanned
// log image (data URL) plus hints; a vision model reports what is
// printed on it (curve name, unit, depth labels, scale ends, colour) as
// a PROPOSAL the user confirms in the digitizer. The function never
// traces, never writes, never touches the registry.
//
// Same skeleton as seismolord-ai: user JWT required, key server-side,
// versioned prompt, 413 on oversize payloads so this cannot become a
// bulk vision proxy.
//
// Secrets: OPENAI_API_KEY (required), OPENAI_MODEL (optional override,
// default gpt-4o-mini), SUPABASE_SERVICE_ROLE_KEY (the daily cap, cap.ts).
// Deploy: supabase functions deploy petro-scan-read

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import { SYSTEM_PROMPT, PROMPT_VERSION, PROPOSAL_KEYS, userText } from './systemPrompt.ts';
import { SCAN_USER_DAILY_CAP, SCAN_FUNCTION_NAME, utcDayStart, capAllows, capMessage } from './cap.ts';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const MAX_B64_CHARS = 2_100_000; // ~1.5 MB decoded
const MAX_SIDE = 1600;
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

function getUserClient(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
}

function pickProposal(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of PROPOSAL_KEYS) out[k] = k in obj ? obj[k] : null;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let supabase;
    try {
      supabase = getUserClient(req);
    } catch (_e) {
      return reply(401, { error: 'Missing Authorization header' });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return reply(401, { error: 'Unauthorized' });

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return reply(503, { error: 'The scan reader is not configured: set the OPENAI_API_KEY function secret.' });
    }

    let body: { image?: unknown; hints?: unknown };
    try {
      body = await req.json();
    } catch (_e) {
      return reply(400, { error: 'Body must be JSON with an image data URL.' });
    }
    const image = typeof body.image === 'string' ? body.image : '';
    const m = IMAGE_RE.exec(image);
    if (!m) return reply(400, { error: 'image must be a data URL of type png, jpeg or webp.' });
    if (m[2].length > MAX_B64_CHARS) {
      return reply(413, { error: 'The image is too large. Downscale it to 1600 px on the long side.' });
    }
    const hints = (body.hints && typeof body.hints === 'object') ? body.hints as Record<string, unknown> : {};
    const w = Number(hints.imageWidth);
    const h = Number(hints.imageHeight);
    if ((Number.isFinite(w) && w > MAX_SIDE) || (Number.isFinite(h) && h > MAX_SIDE)) {
      return reply(413, { error: 'The image is too large. Downscale it to 1600 px on the long side.' });
    }

    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

    // PETRO-U2-018: the per-person daily cap, logged in dai_llm_calls
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    let callId: string | null = null;
    let metering: 'active' | 'unavailable' = 'unavailable';
    let admin = null;
    if (serviceKey) {
      admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, { auth: { persistSession: false } });
      const { count, error: countError } = await admin.from('dai_llm_calls')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('function_name', SCAN_FUNCTION_NAME)
        .gte('created_at', utcDayStart()).in('status', ['reserved', 'ok']);
      if (!countError) {
        const used = count ?? 0;
        if (!capAllows(used)) return reply(429, { error: capMessage(used), used, cap: SCAN_USER_DAILY_CAP });
        const { data: member } = await admin.from('organization_members')
          .select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
        if (member?.organization_id) {
          const { data: row, error: insError } = await admin.from('dai_llm_calls')
            .insert({ organization_id: member.organization_id, user_id: user.id, function_name: SCAN_FUNCTION_NAME, model, status: 'reserved' })
            .select('id').single();
          if (!insError && row?.id) { callId = row.id; metering = 'active'; }
        }
      } else {
        console.warn('scan read metering unavailable', countError.message);
      }
    }
    const finish = async (status: 'ok' | 'error', usage?: { prompt_tokens?: number; completion_tokens?: number } | null) => {
      if (!admin || !callId) return;
      await admin.from('dai_llm_calls').update({ status, tokens_in: usage?.prompt_tokens ?? null, tokens_out: usage?.completion_tokens ?? null }).eq('id', callId);
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText(hints) },
              { type: 'image_url', image_url: { url: image, detail: 'high' } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 700,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('OpenAI error', res.status, detail.slice(0, 500));
      await finish('error');
      return reply(502, { error: `The scan reader request failed (${res.status}).` });
    }
    const completion = await res.json();
    await finish('ok', completion.usage ?? null);
    const content = completion.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return reply(502, { error: 'The scan reader returned nothing.' });
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (_e) {
      return reply(502, { error: 'The scan reader returned no JSON.' });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return reply(502, { error: 'The scan reader returned no proposal.' });
    }

    return reply(200, {
      proposal: pickProposal(parsed as Record<string, unknown>),
      model,
      prompt_version: PROMPT_VERSION,
      usage: completion.usage ?? null,
      metering,
      daily_cap: SCAN_USER_DAILY_CAP,
    });
  } catch (e) {
    return reply(500, { error: (e as Error).message });
  }
});
