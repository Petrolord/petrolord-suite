// Seismolord engine — walking skeleton.
// Verifies the caller's JWT, reads the test manifest from the private
// 'seismic' Storage bucket, and returns { status: 'ok', manifest }.
// Storage is read with the service-role client so the skeleton does not
// need storage.objects RLS policies; auth is still enforced on the caller.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

const BUCKET = 'seismic';
const MANIFEST_PATH = 'test/manifest.json';

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

function getUserClient(req: Request) {
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

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { data: file, error: downloadError } = await getServiceClient()
      .storage.from(BUCKET)
      .download(MANIFEST_PATH);
    if (downloadError || !file) {
      return new Response(
        JSON.stringify({
          error: `Could not read ${BUCKET}/${MANIFEST_PATH}: ${downloadError?.message ?? 'no data'}`,
        }),
        { status: 500, headers: jsonHeaders }
      );
    }

    const manifest = JSON.parse(await file.text());

    return new Response(JSON.stringify({ status: 'ok', manifest }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
