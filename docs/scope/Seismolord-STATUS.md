# Seismolord — STATUS

Last updated: 2026-07-10 (Phase 0 complete)

## Phase 0 — Oracles, golden files, foundations: DONE

Plan of record: `docs/scope/Seismolord-PLAN.md` (playbook stack section
revised to match — client-side worker numerics, no server runtime).

- **Oracle**: `tools/validation/seismolord/` — deterministic analytic-dome
  SEG-Y generator (own IBM float encoder, EBCDIC headers) cross-read by
  segyio. Fixtures: `dome_ibm` (format 1), `dome_ieee` (format 5),
  `dome_oddbytes` (il/xl at bytes 9/21, bytes 189/193 poisoned with 9999,
  lying textual header). Goldens + spec-correct XYZ/CPS-3/ZMAP+ surface
  exports + analytic/numeric GRV committed under `test-data/seismolord/`.
- **Decode core**: `src/pages/apps/Seismolord/engine/segyDecode.js` —
  IBM/IEEE decode bit-identical to segyio (24 jest tests: traces, slices,
  stats, coord scalar, odd-byte mapping). Semantics pinned: IBM values
  below float32 normal range flush to +0, matching segyio.
- **Storage RLS**: owner-path policies on the `seismic` bucket
  (`{user_id}/…`), verified by two-user RLS simulation; four legacy
  project-scheme policies (`seismic_read/write/update/delete`, PR #21
  remnants whose unguarded `::uuid` cast errored whole-bucket queries)
  dropped. Clients will fetch bricks directly with their JWT.
- **zustand** added.

### Phase 0 audit findings (inputs to later phases)
- `src/workers/segy.worker.js` is self-describedly a "simplified" parser:
  loads whole file into memory, hardcodes bytes 189/193, ignores the
  byte-71 scalar, geometry from first 100 traces only, treats il=0 as
  missing. Its IBM formula is sound (now golden-validated in segyDecode).
  Left untouched (has existing subsurface-studio consumers); Phase 1
  builds the streaming indexer on `engine/segyDecode.js` instead.
- ReservoirCalc Pro `SurfaceParser`: ZMAP+/CPS-3 detection falls through
  to a delimited X-Y-Z parser (cannot read real grid bodies), and the
  null filter `z > -9000` silently drops surfaces deeper than 9,000 ft.
  Phase 5 must fix RCP import (grid-aware parsing + null handling) or
  hand off via XYZ. Phase 0 reference surfaces stay shallower than
  9,000 ft so the round-trip test is honest.

## Walking skeleton (PR #22)

The end-to-end path exists and nothing more: page → `seismolord-engine`
edge function → test manifest in the private `seismic` Storage bucket →
`{status:"ok"}` rendered on the page. No interpretation functionality yet.
See `docs/scope/Seismolord-PLAYBOOK.md` for the target product; the
playbook's Node/Express + Python architecture is future scope — the
skeleton uses the Suite's standard Supabase Edge Function path.

## What exists

- **Route**: `/dashboard/apps/geoscience/seismolord` (`src/App.jsx`),
  gated by `ProtectedAppRoute appId="seismolord"`.
- **Page shell**: `src/pages/apps/Seismolord/Seismolord.jsx` — header +
  a backend-connectivity card that invokes `seismolord-engine` on mount
  and renders the JSON result. Folder-based app archetype (like
  ReservoirCalcPro) so canvas/store/services can grow inside it.
- **Catalog**: `master_apps` row seeded by
  `supabase/migrations/20260710120500_seed_seismolord_app.sql`
  (slug `seismolord`, module Geoscience, status Active, icon `Waves`).
- **DB**: `public.seismic_volumes` (volume registry; metadata only) via
  `supabase/migrations/20260710120000_create_seismic_volumes.sql`.
  User-scoped RLS (`auth.uid() = user_id`), the Suite's house pattern.
- **Edge function**: `supabase/functions/seismolord-engine/` — verifies
  the caller's JWT (anon client + forwarded Authorization header), reads
  `seismic/test/manifest.json` with the service-role client, returns
  `{status:"ok", manifest}`. Deployed separately via
  `supabase functions deploy seismolord-engine`.
- **Storage**: private `seismic` bucket created 2026-07-10 with
  `test/manifest.json` uploaded. NOTE: a legacy public `seismic-files`
  bucket (SEG-Y mime types, 2025-10-07) also exists from the deleted
  seismic apps — Seismolord does not use it; candidate for cleanup.

## Decisions

- RLS: user-scoped now; org scoping deferred until the suite standardizes
  on one membership table (three inconsistent ones exist today).
- Bucket: new private `seismic` (deployment-checklist name). The legacy
  `seismic-files` bucket was rejected: public + mime-restricted to SEG-Y.
- Tile status: `Active` immediately (owner's call). Caveat: staging and
  production share the Supabase project, so the tile is visible on
  petrolord.com before the SPA route ships there — until the next manual
  production build upload, clicking it hits the catch-all redirect home.

## Not built yet (per playbook)

SEG-Y ingest/indexing, WebGL2 section/slice viewer, Zustand store, Web
Worker decoding, horizon/fault picking, gridding, XYZ/CPS-3/ZMAP+ export,
storage RLS policies on the `seismic` bucket (skeleton reads it with the
service role inside the function only), brick file format, master_apps
pricing/entitlement review for the `seismolord` appId.
