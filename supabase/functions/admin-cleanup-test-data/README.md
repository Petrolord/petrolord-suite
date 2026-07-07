# admin-cleanup-test-data — runbook

Guarded cleanup of **inactive test organizations and their users** on the
Suite/HSE shared database. Dry-run by default; deletion requires an explicit
double confirmation. See the SQL function for the full safety model:
`supabase/migrations/20260613120000_admin_purge_test_orgs.sql`.

## What it deletes

A **candidate org** is one that is **all** of:
- `organization_type <> 'internal'`, and
- has **no** protected member, and
- inactive: the most-recent member `last_sign_in_at` is older than the cutoff
  (default **60 days**) **or** no member has ever signed in.

**Always preserved:** super-admins (`info@`, `ayoasaolu@`, `ayodejiasaolu1@`,
`support@petrolord.com`, `public.users.is_super_admin`, auth `is_super_admin`
metadata, or `super_admin` role rows), `talent@techtainmentcamp.com` and his
org, and every `internal` org. Any org containing a protected member is kept
whole (no partial deletes).

For each candidate org: all org-scoped rows are deleted (catalog-driven, so no
table is missed), then the org row; orphaned auth users are deleted via the
Admin API. Everything runs in one transaction — any error rolls it all back.

## Deploy (once)

```bash
# 1. Install the SQL function (pick one)
supabase db push                       # if you apply migrations via CLI
#   …or paste supabase/migrations/20260613120000_admin_purge_test_orgs.sql
#      into the Supabase SQL editor and run it.

# 2. Deploy the edge function
supabase functions deploy admin-cleanup-test-data
```

The function relies on the standard env vars already present for edge functions:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

## Use

Caller must be a signed-in **super-admin**; pass their access token as the
bearer. (Replace `<PROJECT_REF>` and `<SUPER_ADMIN_JWT>`.)

```bash
BASE=https://<PROJECT_REF>.functions.supabase.co/admin-cleanup-test-data
AUTH="Authorization: Bearer <SUPER_ADMIN_JWT>"

# 1) DRY RUN (default) — review the candidate list, counts, and auth users.
curl -sS -X POST "$BASE" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{ "dryRun": true, "inactivityDays": 60 }' | jq

# 2) EXECUTE — only after you've eyeballed the dry run.
curl -sS -X POST "$BASE" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{ "dryRun": false, "confirm": "DELETE", "inactivityDays": 60 }' | jq
```

Deletion happens **only** when `dryRun:false` **and** `confirm:"DELETE"` are
both present. Anything else is treated as a dry run / rejected.

> Take a backup first (`pg_dump` of `auth` + `public`, and/or confirm PITR is
> on). The transaction protects against partial failure, but not against
> "deleted the wrong org" — the dry run is your check for that.
