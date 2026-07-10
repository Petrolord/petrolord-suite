import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

const RES_TABLE = 'reservoirs';
const ANALYSIS_TABLE = 'reservoir_analyses';
const ACTIVITY_TABLE = 'reservoir_activities';

// --- Helper Functions ---
function getSupabaseClient(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
}

// --- Mock Simulation Logic ---
// In a real scenario, this would use a proper statistical library
function generateRandom(dist, p1, p2, p3) {
    switch (dist) {
        case 'UNIFORM':
            return p1 + Math.random() * (p2 - p1);
        case 'TRI': {
            const F_c = (p3 - p1) / (p2 - p1);
            const U = Math.random();
            if (U < F_c) {
                return p1 + Math.sqrt(U * (p2 - p1) * (p3 - p1));
            }
            return p2 - Math.sqrt((1 - U) * (p2 - p1) * (p2 - p3));
        }
        case 'NORMAL': { // Box-Muller transform
            const u1 = Math.random();
            const u2 = Math.random();
            const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            return z0 * p2 + p1; // p1=mean, p2=stddev
        }
        case 'LOGNORMAL': {
            const u1 = Math.random();
            const u2 = Math.random();
            const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            return Math.exp(p1 + p2 * z0); // p1=mean of log, p2=stddev of log
        }
        case 'FIXED':
        default:
            return p1;
    }
}

function calculateOutputs(paramsSample) {
    const area = paramsSample.area_acres || 0;
    const h = paramsSample.netpay_ft || 0;
    const phi = paramsSample.porosity_frac || 0;
    const sw = paramsSample.sw_frac || 0;
    const bo = paramsSample.bo_rb_stb || 1;
    const rf = paramsSample.rf_frac || 0;

    const stoiip = (7758 * area * h * phi * (1 - sw)) / bo;
    const reserves = stoiip * rf;

    return { STOIIP_MMSTB: stoiip / 1e6, Reserves_MMSTB: reserves / 1e6 };
}

function getPercentile(data, percentile) {
    const sorted = [...data].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = lower + 1;
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function getMean(data) {
    return data.reduce((a, b) => a + b, 0) / data.length;
}

// --- Main Handler Logic ---
async function handlePost(req) {
  const supabase = await getSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { action, payload, reservoirId } = await req.json();

  switch (action) {
    case 'create': {
      const { data, error } = await supabase
        .from(RES_TABLE)
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    case 'list': {
      const { data, error } = await supabase
        .from(RES_TABLE)
        .select('id, name, basin, field')
        .eq('user_id', user.id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    case 'dashboard': {
        if (!reservoirId) throw new Error("Reservoir ID is required for dashboard data.");
        
        const { data: stats, error: statsError } = await supabase
            .from(RES_TABLE)
            .select('stoiip_mmstb, giip_bcf, rf_pct')
            .eq('id', reservoirId)
            .single();
        if (statsError) console.error('Stats Error:', statsError.message);

        const { data: models, error: modelsError } = await supabase
            .from(ANALYSIS_TABLE)
            .select('id, name, type, created_at')
            .eq('reservoir_id', reservoirId);
        if (modelsError) console.error('Models Error:', modelsError.message);

        const { data: activity, error: activityError } = await supabase
            .from(ACTIVITY_TABLE)
            .select('id, description, timestamp')
            .eq('reservoir_id', reservoirId)
            .order('timestamp', { ascending: false })
            .limit(5);
        if (activityError) console.error('Activity Error:', activityError.message);

        return new Response(JSON.stringify({ stats: stats || {}, models: models || [], activity: activity || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    case 'run_uncertainty': {
        const { samples, params } = payload;
        const outputs = { STOIIP_MMSTB: [], Reserves_MMSTB: [] };
        const inputs = {};
        params.forEach(p => { inputs[p.name] = []; });

        for (let i = 0; i < samples; i++) {
            const currentSample = {};
            params.forEach(p => {
                const val = generateRandom(p.dist, parseFloat(p.p1), parseFloat(p.p2), parseFloat(p.p3));
                currentSample[p.name] = val;
                inputs[p.name].push(val);
            });
            const outputValues = calculateOutputs(currentSample);
            outputs.STOIIP_MMSTB.push(outputValues.STOIIP_MMSTB);
            outputs.Reserves_MMSTB.push(outputValues.Reserves_MMSTB);
        }

        const summary = {
            metrics: Object.keys(outputs).map(key => ({
                name: key,
                p10: getPercentile(outputs[key], 10),
                p50: getPercentile(outputs[key], 50),
                p90: getPercentile(outputs[key], 90),
                mean: getMean(outputs[key]),
            }))
        };
        
        // Mock sensitivity
        const baseCase = {};
        params.forEach(p => { baseCase[p.name] = p.dist === 'FIXED' ? p.p1 : (p.p1 + (p.p2 || p.p1)) / 2; });
        const baseReserves = calculateOutputs(baseCase).Reserves_MMSTB;

        const tornado = params.filter(p => p.dist !== 'FIXED').map(p => {
            const lowCase = {...baseCase, [p.name]: p.p1};
            const highCase = {...baseCase, [p.name]: p.p2};
            const lowReserves = calculateOutputs(lowCase).Reserves_MMSTB;
            const highReserves = calculateOutputs(highCase).Reserves_MMSTB;
            return { param: p.name, delta: highReserves - lowReserves };
        });

        const prcc = params.filter(p => p.dist !== 'FIXED').map(p => ({
            param: p.name,
            value: (Math.random() - 0.5) * 1.8 // Mock PRCC value
        })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

        const results = {
            summary,
            series: { inputs, outputs },
            sensitivity: { tornado, prcc }
        };

        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

async function handleGet(req) {
    const supabase = await getSupabaseClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const url = new URL(req.url);
    const reservoirId = url.pathname.split('/').pop();

    if (!reservoirId || reservoirId === 'reservoir-engine') {
        return new Response(JSON.stringify({ error: 'Reservoir ID is missing' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data, error } = await supabase
        .from(RES_TABLE)
        .select('id, name')
        .eq('id', reservoirId)
        .eq('user_id', user.id)
        .single();

    if (error) throw new Error(error.message);
    if (!data) return new Response(JSON.stringify({ error: 'Reservoir not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method === 'POST') {
        return await handlePost(req);
    }
    if (req.method === 'GET') {
        return await handleGet(req);
    }
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});