// supabase/functions/generate-pvt-preview/index.ts
//
// Reservoir Balance — generate-pvt-preview Edge Function
// =======================================================
//
// Phase 3 deliverable (revised 2026-05-14 after diagnostic).
//
// STATELESS PVT preview generation. Wraps the engine's generatePvtTable()
// public export to give the UI a single source of truth for PVT correlations.
// Replaces in-memory pvtCalculations.js preview to eliminate silent divergence
// between preview numbers and engine run numbers.
//
// Request:
//   POST /functions/v1/generate-pvt-preview
//   Body: PvtPreviewInputs (see mbal-engine.ts)
//   Auth: Bearer <user-jwt>  (any authenticated user)
//
// Response:
//   200 OK: PvtPreviewResult (rows[], metadata, warnings[])
//   400 Bad Request: missing/invalid required field
//   401 Unauthorized: no/invalid auth header or invalid JWT
//   422 Unprocessable: engine threw on inputs
//   500 Internal: env vars missing or unexpected error
//
// IMPORTANT NOTE ON AUTH (lesson from 2026-05-14 diagnostic):
//   supabase.auth.getUser() with NO arguments looks at the client's internal
//   session, which doesn't exist in Edge Function context (no cookies, no
//   setSession). It throws "Auth session missing!". The correct pattern is
//   to extract the JWT from the Authorization header and pass it EXPLICITLY:
//     auth.getUser(jwt)  <- right
//     auth.getUser()     <- wrong (throws in Edge Function context)
//   See also: carry-forward note about calculate-mbal Edge Function which
//   uses the same buggy pattern but happens to work for unknown reasons -
//   should be fixed alongside this in a follow-up.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  generatePvtTable,
  type PvtPreviewInputs,
  type FluidSystem,
} from "../_shared/mbal-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_FLUID_SYSTEMS: FluidSystem[] = ['oil', 'gas', 'oil_with_gas_cap'];

function validateBody(body: unknown): { ok: true; inputs: PvtPreviewInputs } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  if (!b.fluid_system || typeof b.fluid_system !== 'string') {
    return { ok: false, error: 'Missing required field: fluid_system' };
  }
  if (!VALID_FLUID_SYSTEMS.includes(b.fluid_system as FluidSystem)) {
    return {
      ok: false,
      error: `Invalid fluid_system "${b.fluid_system}". Must be one of: ${VALID_FLUID_SYSTEMS.join(', ')}`,
    };
  }

  if (typeof b.reservoir_temperature_f !== 'number' || !Number.isFinite(b.reservoir_temperature_f)) {
    return { ok: false, error: 'Missing or invalid required field: reservoir_temperature_f (must be a finite number)' };
  }
  if (b.reservoir_temperature_f <= 0 || b.reservoir_temperature_f > 500) {
    return { ok: false, error: `reservoir_temperature_f out of range: ${b.reservoir_temperature_f}. Expected (0, 500] °F.` };
  }

  const optionalNumbers: Array<[string, number?, number?]> = [
    ['oil_gravity_api', 5, 60],
    ['gas_specific_gravity', 0.55, 1.5],
    ['bubble_point_psia', 14.7, 15000],
    ['initial_pressure_psia', 14.7, 20000],
    ['pressure_min_psia', 14.7, 20000],
    ['pressure_max_psia', 14.7, 20000],
    ['n_steps', 2, 200],
  ];

  for (const [field, lo, hi] of optionalNumbers) {
    if (b[field] !== undefined && b[field] !== null) {
      if (typeof b[field] !== 'number' || !Number.isFinite(b[field] as number)) {
        return { ok: false, error: `Invalid ${field}: must be a finite number` };
      }
      const v = b[field] as number;
      if ((lo !== undefined && v < lo) || (hi !== undefined && v > hi)) {
        return { ok: false, error: `${field} out of range: ${v}. Expected [${lo}, ${hi}].` };
      }
    }
  }

  if (b.pvt_correlations !== undefined && b.pvt_correlations !== null) {
    if (typeof b.pvt_correlations !== 'object' || Array.isArray(b.pvt_correlations)) {
      return { ok: false, error: 'pvt_correlations must be an object' };
    }
  }

  return { ok: true, inputs: b as unknown as PvtPreviewInputs };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Auth: extract bearer token and validate via Supabase Auth
  //
  // CRITICAL: must pass the token explicitly to getUser(). Calling
  // getUser() with no args looks at the client's internal session, which
  // doesn't exist in Edge Function context. See header comment.
  // ──────────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token || token === authHeader) {
    return jsonResponse(
      { error: 'Authorization header must be in form "Bearer <jwt>"' },
      401,
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(
      { error: 'Server misconfiguration: SUPABASE_URL or SUPABASE_ANON_KEY not set' },
      500,
    );
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userErr } =
    await supabaseClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonResponse(
      {
        error: 'Unauthorized',
        detail: userErr?.message ?? 'JWT validation returned no user',
      },
      401,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const validation = validateBody(body);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  try {
    const result = generatePvtTable(validation.inputs);
    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: 'Engine error generating PVT preview', detail: message },
      422,
    );
  }
});
