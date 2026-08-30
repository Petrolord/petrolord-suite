// Apps available for a set of modules, for the public quote page.
//
// WHAT THIS USED TO DO, AND WHY IT MATTERED
//
// It queried a table called `apps`: four legacy demo rows, keyed by module
// slug, priced 299-499, covering three modules. The Suite's real catalogue
// is `master_apps` - 96 active applications across eight modules, priced on
// master_apps.price, which is what generate-quote actually bills.
//
// The consequences were not cosmetic. The quote page offered two apps for
// Geoscience and NOTHING for Facilities, Production, Economics, Midstream &
// Downstream or Assurance, so five modules looked empty to a buyer. The app
// ids it did return did not exist in master_apps, so generate-quote
// discarded them ("No active apps found from requested list") and fell
// through to its module branch, which charged a flat 500 for any module.
// That is how a customer could reach a 92-96 percent discount from the
// public site without doing anything unusual.
//
// This now reads master_apps, the same table that bills.
//
// SHAPE. `module_id` is returned as the module SLUG, because that is what
// the quote page sends in and groups by. The real uuid is returned
// separately as module_uuid for anything that needs to join properly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from './cors.ts';

Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { module_ids } = await req.json();

    // Callers pass slugs ('geoscience'). master_apps joins on module_id, a
    // uuid, and master_apps.module is a display name that differs from
    // modules.name again - so resolve through the modules table rather than
    // matching any text.
    const { data: mods, error: modErr } = await supabase.from('modules').select('id, slug, name');
    if (modErr) throw modErr;

    const wanted = Array.isArray(module_ids) && module_ids.length > 0
      ? module_ids.map((m)=> String(m).toLowerCase())
      : null;
    const slugById = {};
    const idsWanted = [];
    (mods || []).forEach((m)=>{
      slugById[m.id] = m.slug;
      if (!wanted || wanted.includes(String(m.slug).toLowerCase())) idsWanted.push(m.id);
    });

    // status is 'Active' in master_apps; ilike keeps this insensitive to the
    // casing rather than depending on it.
    let query = supabase
      .from('master_apps')
      .select('id, slug, app_name, description, price, module_id, module')
      .ilike('status', 'active');
    if (wanted) {
      if (idsWanted.length === 0) {
        return new Response(JSON.stringify({ success: true, apps: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      query = query.in('module_id', idsWanted);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const apps = (rows || []).map((a)=>({
      id: a.id,
      slug: a.slug,
      name: a.app_name,
      description: a.description,
      // A null price would render as "+$null/mo" and would bill as 0. It is
      // a catalogue error, so it is surfaced as such rather than defaulted.
      price: a.price === null || a.price === undefined ? null : Number(a.price),
      module_id: slugById[a.module_id] || null, // slug, for the quote page
      module_uuid: a.module_id,
      module: a.module
    })).sort((x, y)=> String(x.name).localeCompare(String(y.name)));

    const unpriced = apps.filter((a)=> a.price === null).map((a)=> a.slug);

    return new Response(JSON.stringify({
      success: true,
      apps,
      count: apps.length,
      unpriced_apps: unpriced
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
