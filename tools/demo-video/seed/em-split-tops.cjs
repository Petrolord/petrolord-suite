// Earth Modeling 3D grid build (2026-10-17): adds the "Ekene Sand Middle" and "Ekene Sand Lower"
// tops (the GR peaks of the two shale breaks) to the demo wells, additively (existing tops untouched).
// node tools/demo-video/seed/em-split-tops.cjs [go]   (NODE_PATH=<suite>/node_modules)
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('/root/.demo-video.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const key = fs.readFileSync(process.env.SUPABASE_ANON_KEY_FILE || '/tmp/claude-0/emv/anon.key','utf8').trim();
const PICKS = { 'Ekene-1': [1556.5, 1570.6], 'Ekene-2': [1574.3, 1590.5], 'Ekene-3': [1546.9, 1561.7], 'Ekene-4': [1595.3, 1607.4], 'Ekene-8': [1662.1, 1681.3], 'Ekene-9': [1685.1, 1701.4] };
(async()=>{
 const sb = createClient('https://ssyckywijlrkgcwvkwlr.supabase.co', key, { auth: { persistSession:false }});
 await sb.auth.signInWithPassword({ email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD });
 const { data: w } = await sb.from('geo_wells').select('id,name');
 const { data: tops } = await sb.from('geo_wells_tops').select('well_id,name');
 const rows = [];
 for (const [name, [mid, low]] of Object.entries(PICKS)) {
   const well = w.find((x) => x.name === name);
   for (const [tn, md] of [['Ekene Sand Middle', mid], ['Ekene Sand Lower', low]]) {
     if (tops.some((t) => t.well_id === well.id && t.name === tn)) { console.log('exists', name, tn); continue; }
     rows.push({ well_id: well.id, name: tn, md_m: md, surface_type: 'formation_top', interpreter: 'Earth Modeling demo', notes: 'Shale break picked at the GR peak (added 2026-10-17 for the 3D grid zones; additive)' });
   }
 }
 if (process.argv[2] !== 'go') { console.log(JSON.stringify(rows, null, 1)); return; }
 const { data, error } = await sb.from('geo_wells_tops').insert(rows).select('id,name,md_m');
 if (error) throw error; console.log('inserted', data.length);
})().catch(e=>{console.error(e);process.exit(1);});
