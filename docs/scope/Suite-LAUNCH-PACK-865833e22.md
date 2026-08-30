# Suite production upload — main `865833e22`

Owner runbook for the upload that ships **three complete modules**.

Zip: `suite-upload-20260829-865833e22-slim.zip` (10.3 MB, 4,572 files)
Release: https://github.com/Petrolord/petrolord-suite/releases/tag/suite-upload-20260829-865833e22
Local: `/root/suite-upload-20260829-865833e22-slim.zip`
sha256 starts `734f8984f0a56bbd`

## What is in it

| Module | Scope | PRs |
|---|---|---|
| **Facilities** | F0–F12: every pre-existing app fixed or rebuilt, plus 4 new studios | #295–#307 |
| **Economics** | E0–E5, plus the Technical Report Autopilot rebuilt onto edge functions | #309–#317 |
| **Midstream & Downstream** | DS0–DS10: the Suite's 8th module, all ten apps | #318–#330 |

It supersedes `suite-upload-20260829-6abe23777-slim.zip`, which carried
Facilities only. That file has been deleted so it cannot be uploaded by
mistake.

## Verification already done

- **Clean-room**: extracted to an empty directory, `npm install && npm
  run build` green in 1m17s on Node 18.
- **Same-source proof**: the built entry chunk is `index-70ee013b.js`,
  the exact hash the dev worktree produces from the same commit. If
  Hostinger's build emits that name, it built this source.
- **Chunks, not just the entry**: all ten M&D app chunks emitted and
  **15 content markers confirmed inside the built chunks**; all twelve
  Facilities studio chunks present; the retired shells
  (CompressorPumpPack, PipelineDesigner, PipelineSizer) absent.
- **Structure**: zero `node_modules`, `.git`, `.vite` or `dist`
  entries. `.vite/` is still tracked in git and is the thing that broke
  the 2026-07-13 upload, so this matters.
- **Secret sweep**: the only env entry in the archive is
  `worker/sim-worker/.env.example`, a placeholder. The untracked
  `worker/sim-worker/.env` holds a live service-role key and, with its
  two vim swap files, is excluded. Verified by listing every `.env` and
  `.sw[op]` entry in the finished archive.

## Step 1 — upload

Hostinger deployment page, **source zip** (not a built dist). Hostinger
runs `npm install && npm run build` itself; framework Vite, Node 22,
output `dist`.

Environment variables come from the Hostinger dashboard
(`VITE_APP_TITLE`, `VITE_PAYSTACK_PUBLIC_KEY`, `VITE_DEBUG_MODE`). The
Supabase URL and anon key are hardcoded in `customSupabaseClient.js` on
purpose.

## Step 2 — purge the CDN cache

Skipping this is what produces the "unstyled production" symptom: a
stale `index.html` pointing at chunk names that no longer exist.

## Step 3 — confirm it is actually live before touching the database

Worth two minutes, because step 4 is the irreversible-feeling one:

1. The served entry chunk should be `index-70ee013b.js`.
2. Plain and cache-busted `index.html` should agree (no stale CDN).
3. CSS should return `content-type: text/css`, not the SPA fallback.
4. Spot-check a route from each new module, for example
   `/dashboard/apps/facilities/compressor-station-designer` and
   `/dashboard/apps/midstream-downstream/terminal-depot-studio`.

## Step 4 — apply the 23 held tile migrations, in timestamp order

Only after the upload is live and the cache is purged. **This is the
whole reason they were held**: every one of them flips a dashboard tile
to Active, and a tile that goes Active before the build is there links
to a 404.

Facilities (12):

```
20260829530000_f1_rename_pipeline_line_sizing_tile.sql
20260829550000_f2_rename_relief_flare_tile.sql
20260829570000_f3_rename_gas_processing_tile.sql
20260829590000_f4_rename_heat_exchanger_tile.sql
20260829610000_f5_rename_separator_studio_tile.sql
20260829630000_f6_rename_corrosion_studio_tile.sql
20260829650000_f7_activate_pwt_studio_tile.sql
20260829670000_f9_seed_compressor_station_tile.sql
20260829690000_f10_seed_pump_station_tile.sql
20260829710000_f11_seed_control_valve_tile.sql
20260829730000_f12_seed_storage_tank_tile.sql
20260829750000_f12_seed_flow_metering_tile.sql
```

Midstream & Downstream (11). **The DS0 seed must run first** — it
creates the module row and the ten tiles that the other ten migrations
then flip to Active. Each of those ten raises a notice and does nothing
if its tile is absent, so an out-of-order run fails safe rather than
silently:

```
20260829850000_ds0_seed_midstream_downstream.sql
20260829870000_ds1_activate_crude_assay_tile.sql
20260829890000_ds2_activate_blend_optimizer_tile.sql
20260829910000_ds3_activate_refinery_planning_tile.sql
20260829930000_ds4_activate_modular_refinery_tile.sql
20260829950000_ds5_activate_terminal_tile.sql
20260829970000_ds6_activate_fuel_pricing_tile.sql
20260829990000_ds7_activate_lpg_cng_tile.sql
20260830010000_ds8_activate_energy_efficiency_tile.sql
20260830030000_ds9_activate_carbon_tile.sql
20260830050000_ds10_activate_flare_tile.sql
```

Every persistence migration these apps need is **already applied** and
was safe pre-deploy, so nothing in step 4 risks user data.

## Step 5 — flip the MIGRATIONS.md rows

Change the 23 `HELD (not applied)` cells to `APPLIED <date>` once they
are in.

## Still open after this upload

- **Owner staging E2E** across the Facilities and M&D apps.
- **Module pricing.** The M&D module is not priced in any of the three
  price tables, and those three tables already disagree with each other
  on every existing module. That is a pricing decision, not an
  engineering one, so DS0 deliberately left it alone.
- **DS8 literature gate**: the four-stream pinch anchor is the one
  remembered number in the M&D test suite and wants a citation against
  its published source.
