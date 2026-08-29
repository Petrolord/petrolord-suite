// Technical Report Autopilot generation gateway (rebuild, 2026-08-29).
//
// Why this exists. The app used to call a report service on a Heroku host for
// its templates, its generation and its DOCX export. That host no longer
// exists: every path, root included, returns a 404, so the app's entire
// purpose had been unreachable on a tile the catalog carried as Active
// (recorded in docs/scope/ProductFloor-STATUS.md). The owner's decision was
// to rebuild the generation path onto Supabase edge functions like the rest
// of the Suite.
//
// What moved where. Templates are static configuration and never needed a
// server, so they are client-side now
// (src/data/reportAutopilotTemplates.js). The DOCX is built in the browser
// from the returned sections. This function does the one thing that genuinely
// needs a server: hold the model key and turn a brief into report prose.
//
// Secrets: OPENAI_API_KEY (required), OPENAI_MODEL (optional override).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

// Bounds. A report is a document, not a bulk-completion proxy.
const MAX_SECTIONS = 12;
const MAX_CONTEXT_CHARS = 60000;
const MAX_WORDS_PER_SECTION = 900;

// The instruction that governs every section. The standing hazard in a report
// generator is invention: a model asked for a drilling report will happily
// supply an ROP nobody measured. Everything here exists to stop that.
const SYSTEM_PROMPT = [
  'You are a petroleum engineer writing one section of a technical report for an operating company.',
  '',
  'Rules, in order of priority:',
  '1. Use ONLY the facts given to you. Never invent a rate, depth, cost, date, volume, pressure or name.',
  '2. Where the brief asks for something the inputs do not support, say so in one plain sentence and move on. "No non-productive time was reported for this period" is a good sentence. Inventing a figure to fill the space is the worst thing you can do here.',
  '3. Do not restate a number with more precision than you were given.',
  '4. Write in plain professional English, in the third person, past tense for events. No marketing language, no filler, no restating the brief back.',
  '5. Do not use em dashes.',
  '6. Return prose in short paragraphs. Do not add a heading; the section already has one. Do not use markdown syntax.',
  '7. If the inputs contradict each other, say which two facts conflict rather than choosing one silently.',
].join('\n');

/** One compact block of everything the author knows, shared by every section. */
function buildContext(input: Record<string, unknown>): string {
  const lines: string[] = [];
  const add = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    lines.push(`${label}: ${String(v)}`);
  };
  add('Project', input.project_name);
  add('Field', input.field_name);
  add('Well', input.well_name);
  add('Author', input.author);
  add('Period start', input.date_start);
  add('Period end', input.date_end);
  add('Stated objectives', input.objectives);
  add('Author notes', input.notes);

  const kpis = Array.isArray(input.kpis) ? input.kpis : [];
  const realKpis = kpis.filter((k: any) => k && k.key && k.value !== '');
  if (realKpis.length > 0) {
    lines.push('Reported figures:');
    realKpis.forEach((k: any) => lines.push(`  - ${k.key}: ${k.value}`));
  }

  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  attachments.forEach((a: any) => {
    if (!a?.name || !a?.text) return;
    lines.push(`Attached data (${a.name}):`);
    lines.push(String(a.text));
  });

  return lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
}

const wordBudget = (detail: string, maxPages: number) => {
  const perSection = detail === 'brief' ? 180 : detail === 'detailed' ? 600 : 320;
  // A page is roughly 450 words of report prose; never exceed what the user
  // asked the whole document to be.
  const capped = Math.min(perSection, Math.round(((Number(maxPages) || 8) * 450) / 3));
  return Math.max(120, Math.min(MAX_WORDS_PER_SECTION, capped));
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: jsonHeaders });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: jsonHeaders });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'Report generation is not configured: set the OPENAI_API_KEY function secret.',
      }), { status: 503, headers: jsonHeaders });
    }

    const body = await req.json();
    const sections = Array.isArray(body?.sections) ? body.sections : [];
    if (sections.length === 0) {
      return new Response(JSON.stringify({ error: 'Select at least one section to write.' }),
        { status: 400, headers: jsonHeaders });
    }
    if (sections.length > MAX_SECTIONS) {
      return new Response(JSON.stringify({ error: `A report can carry at most ${MAX_SECTIONS} sections.` }),
        { status: 400, headers: jsonHeaders });
    }

    const context = buildContext(body?.input ?? {});
    const detail = String(body?.input?.detail_level ?? 'standard');
    const maxPages = Number(body?.input?.max_pages ?? 8);
    const budget = wordBudget(detail, maxPages);
    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

    // Sections are written independently and in parallel. Each one gets the
    // whole context, so a section is never asked to remember what an earlier
    // one said, which is where a chained generator starts inventing
    // continuity that is not in the data.
    const written = await Promise.all(sections.map(async (section: any) => {
      const title = String(section?.name ?? 'Section');
      const brief = String(section?.brief ?? `Write the ${title} section.`);
      const prompt = [
        `Report type: ${String(body?.input?.report_type_name ?? 'Technical report')}`,
        `Section: ${title}`,
        `What this section must cover: ${brief}`,
        `Length: about ${budget} words. Shorter is fine when the facts run out.`,
        '',
        'The facts you have:',
        context || '(no facts were supplied)',
      ].join('\n');

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          // Low, because a report is not a place for invention.
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        const detailText = await res.text();
        console.error('OpenAI error', res.status, detailText.slice(0, 500));
        throw new Error(`LLM request failed (${res.status})`);
      }
      const completion = await res.json();
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Empty response for section "${title}"`);
      return { id: section?.id ?? null, title, content: String(content).trim() };
    }));

    return new Response(JSON.stringify({
      sections: written,
      model,
      generated_at: new Date().toISOString(),
    }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: jsonHeaders });
  }
});
