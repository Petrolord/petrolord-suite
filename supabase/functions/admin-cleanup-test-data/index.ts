// =============================================================================
// admin-cleanup-test-data
// -----------------------------------------------------------------------------
// Guarded entry point for purging inactive *test* organizations and their users
// from the Suite/HSE shared database.
//
//   1. Authenticates the CALLER from their JWT and confirms they are a
//      super-admin (by email allow-list, public.users.is_super_admin, or auth
//      metadata). Non-super-admins get 403.
//   2. Calls the SECURITY DEFINER RPC public.admin_purge_test_orgs(dry_run, days),
//      which is dry-run by default and transactional.
//   3. Only when BOTH dryRun === false AND confirm === "DELETE" does it execute
//      the purge and then remove the now-orphaned auth users via the Admin API.
//
// Request body (all optional):
//   { dryRun?: boolean = true, inactivityDays?: number = 60, confirm?: string }
//
// Examples:
//   { }                                  -> dry run (default), nothing deleted
//   { "dryRun": true }                   -> dry run
//   { "dryRun": false, "confirm": "DELETE" } -> EXECUTES the purge
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

// Mirror of the DB-side protected list (defence in depth; the RPC enforces it too).
const SUPER_ADMIN_EMAILS = [
  "info@petrolord.com",
  "ayoasaolu@gmail.com",
  "ayodejiasaolu1@gmail.com",
  "support@petrolord.com",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // -- 1. Identify and authorize the caller -------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token." }, 401);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Could not authenticate caller." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Super-admin check: email allow-list OR public.users.is_super_admin OR auth metadata.
    const email = (user.email ?? "").toLowerCase();
    let isSuperAdmin =
      SUPER_ADMIN_EMAILS.includes(email) ||
      user.user_metadata?.is_super_admin === true ||
      user.app_metadata?.is_super_admin === true;

    if (!isSuperAdmin) {
      const { data: pu } = await admin
        .from("users")
        .select("is_super_admin")
        .eq("id", user.id)
        .maybeSingle();
      isSuperAdmin = pu?.is_super_admin === true;
    }

    if (!isSuperAdmin) {
      return json({ error: "Forbidden: super-admin privileges required." }, 403);
    }

    // -- 2. Parse request ---------------------------------------------------
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun = body.dryRun !== false;            // default: true (safe)
    const inactivityDays = Number.isFinite(body.inactivityDays) ? body.inactivityDays : 60;
    const confirmed = body.confirm === "DELETE";

    // Hard stop: real deletion requires explicit dryRun:false AND confirm:"DELETE".
    const willDelete = !dryRun && confirmed;
    if (!dryRun && !confirmed) {
      return json({
        error:
          'Refusing to delete: pass {"dryRun": false, "confirm": "DELETE"} to execute. ' +
          "Re-run with dryRun:true to preview first.",
      }, 400);
    }

    // -- 3. Run the purge RPCs (dry-run unless willDelete) ------------------
    // Two complementary passes: inactive test ORGS (+ their members), and inactive
    // ORG-LESS users the org pass can't reach. Both are dry-run by default.
    const { data: orgReport, error: orgErr } = await admin.rpc("admin_purge_test_orgs", {
      p_dry_run: !willDelete,
      p_inactivity_days: inactivityDays,
    });
    if (orgErr) {
      return json({ error: "Org purge RPC failed (rolled back).", detail: orgErr.message }, 500);
    }

    const { data: orphanReport, error: orphanErr } = await admin.rpc("admin_purge_orphan_users", {
      p_dry_run: !willDelete,
      p_inactivity_days: inactivityDays,
    });
    if (orphanErr) {
      return json({ error: "Orphan-user purge RPC failed (rolled back).", detail: orphanErr.message }, 500);
    }

    const report = { orgs: orgReport, orphan_users: orphanReport };

    // -- 4. On execution, delete the freed auth users via the Admin API -----
    const authResults: Array<{ id: string; email: string | null; deleted: boolean; error?: string }> = [];
    if (willDelete) {
      // Merge both passes' delete lists, de-duped by id (a user can't be in both,
      // but stay defensive).
      const merged = [
        ...((orgReport?.auth_users_to_delete ?? []) as Array<{ id: string; email: string | null }>),
        ...((orphanReport?.auth_users_to_delete ?? []) as Array<{ id: string; email: string | null }>),
      ];
      const toDelete = Array.from(new Map(merged.map((u) => [u.id, u])).values());
      for (const u of toDelete) {
        // Never delete a protected email, even if it somehow surfaced here.
        if (u.email && SUPER_ADMIN_EMAILS.includes(u.email.toLowerCase())) {
          authResults.push({ id: u.id, email: u.email, deleted: false, error: "protected — skipped" });
          continue;
        }
        const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
        authResults.push({
          id: u.id,
          email: u.email,
          deleted: !delErr,
          ...(delErr ? { error: delErr.message } : {}),
        });
      }
    }

    return json({
      mode: willDelete ? "EXECUTED" : "DRY_RUN",
      requested_by: user.email,
      report,
      ...(willDelete ? { auth_user_deletions: authResults } : {}),
    });
  } catch (e) {
    return json({ error: "Unhandled error.", detail: String(e?.message ?? e) }, 500);
  }
});
