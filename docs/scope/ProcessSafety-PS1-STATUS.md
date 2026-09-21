# LOPA & SIL Studio (PS1) status

Phase: PS1 (ProcessSafety-ROADMAP.md)
Status: **BUILT 2026-09-19** (branch feat/ps1-lopa-sil-studio). Code only:
every migration is written and NOT APPLIED (owner-run), the tile is still
Coming Soon, and production gets the route with the next upload.

The Process Safety module's first application and the live counterpart of
NextGen course H3 `lopa` (NextGen-Remaining-Courses-PLAN.md section 14).

## What it answers

Three questions about a hazardous scenario:

1. How often does it get through the protection layers it has?
2. How much risk reduction is still missing against the tolerable target,
   and what SIL does that demand of a safety instrumented function?
3. Does the SIF proposed, with its architecture, failure rates and proof
   testing, actually supply it, and how long may its proof test interval be?

## The engine

`packages/engines/engines/hse/lopa.js`, from petrolord-engines PR #218
(vendored at canonical a1d8c9f on main). 91 engine tests against an independent stdlib Python
oracle (exact rationals), a time dependent second route, and the published
61508 Association worked SIF (Dolan 2024, every printed digit, RRF 777).
Record: `packages/engines/tools/validation/hse/FINDINGS-lopa.md`. The app
imports it through the one-line shim `src/utils/processSafety/engine/lopa.js`.

What the app takes from it, unchanged:

| Engine | Used for |
|---|---|
| `lopaScenario` | mitigated frequency, credited and not-credited IPLs with the reason, required RRF and PFDavg, outcome state, and with the SIF's PFDavg supplied, `meetsTmel` |
| `pfdAvgSubsystem` | PFDavg per subsystem (IEC 61508-6:2010 Annex B.3.2.2), band, dominant term, warnings (lambda x T > 0.1), basis and formula |
| `pfdAvgSif` | the SIF as the Annex B.3.2.1 series sum |
| `maxProofTestInterval` | the longest T1 for a target, with FOUND / UNACHIEVABLE / INTERVAL_INDEPENDENT / CAPPED_AT_LIFETIME |

The app restates no formula. Its one piece of arithmetic is a subsystem's
share of the required SIF PFDavg (the required value less the other
subsystems' PFDavg), used as a target for the interval search and labelled
on screen as the studio's own.

## Vendoring

This branch first vendored canonical 6703c00 (the engines/hse domain with
its tests, goldens and tools/validation/hse). Suite main has since moved to
canonical a1d8c9f (#532 and #534, MD1-0 and MD2-0), which contains 6703c00,
and engines/hse is unchanged between the two. The merge of main therefore
takes main's VENDOR.json, VENDOR.manifest and README.md whole: the manifest
regenerated from the canonical clone at a1d8c9f is identical to main's, and
the guard compares 847 paths byte for byte with 0 deviations. This PR adds
no vendored change of its own.

## The app

Route `/dashboard/apps/process-safety/lopa-sil-studio` (ProtectedAppRoute
`lopa-sil-studio`), help at `.../help`. Crude Assay studio shell: header
with saved-study selector and autosave, scenario rail, three tabs.

- **LOPA worksheet.** IEF and TMEL per year, enabling conditions and
  conditional modifiers, IPLs with PFD and Independent / Auditable flags. A
  layer that takes no credit shows the engine's reason. Results: unmitigated
  frequency, product of credited PFDs, mitigated frequency with and without
  the SIF, required RRF, required SIF PFDavg, and the outcome state printed
  exactly as the engine names it (`NO_SIF_REQUIRED`,
  `RISK_REDUCTION_BELOW_SIL1`, `SIL1` to `SIL3`, `BEYOND_SIL3_REDESIGN`
  with the engine's note).
- **SIF verification.** Sensors, logic solver and final elements, each with
  architecture (1oo1, 1oo2, 2oo2, 2oo3, 1oo3), lambda DU and DD per hour per
  channel, MTTR, MRT, beta, beta D, T1 (hours, with years beside it),
  proof test coverage and lifetime. PFDavg, RRF, band and dominant term per
  subsystem; SIF PFDavg, achieved RRF and band; and the verdict against the
  scenario on three lines: required SIL, required PFDavg, TMEL. The verdict
  is the PFDavg one, because a SIF in the right band can still miss.
- **Proof test interval.** One subsystem's T1 varied over a list of months,
  plotting that subsystem's and the SIF's PFDavg on a log axis (white
  chartTheme, ChartLogo, required PFDavg and decade band edges drawn in)
  with a table beside it; and the longest interval for the subsystem's share
  or a typed target, with the engine's state.
- **Stated on screen:** low demand only; no architectural constraint
  (minimum HFT) check; no high demand or continuous (PFH) mode; every
  failure rate is user input; no IEC table is reproduced.
- **Blank is absent.** Text goes to the engine as typed; a blank is
  undefined, so the engine applies its documented default (lambda DD 0,
  MRT 0, coverage 1) or refuses and names the field. Nothing is read as 0.
- **The example scenario** (separator overpressure) is illustrative and
  says so; none of its numbers is published or vendor data.

## Persistence

`ps_lopa_studies` (migration 20260919210000), one row per study, scoped to
the ORGANIZATION: payload jsonb holds the inputs only, results are
recomputed on open. RLS through the live membership helpers on
organization_members: members read, insert (as themselves) and update;
delete is the author or an org owner or admin; a trigger refuses a move
between organizations and keeps the author. Rows are stamped and opened
through `src/lib/stateVersion.js` (kind `ps-lopa-study`).

Rollback-wrapped dry run against the linked project, 2026-09-19: PS0 seed,
this table, the tile activation and the pricing in one transaction under
real JWT subjects, 17/17 checks, nothing persisted (details in the
MIGRATIONS.md row).

Not done here: the table is not registered with the .pld portability
families (`src/lib/portability`), nor checked against the org data export.
Both are follow-ups for whoever next touches portability.

## Pricing

Process Safety joins `pricing_config.module_pricing` at **1,999**
(migration 20260919230000), with `MODULE_PRICING` / `MODULE_META` and the
generate-quote fallback. Derivation: the tiles inherit the Facilities
per-app price 699 (the PS0 seed copies a Facilities row). The 3.3x rule
gives 2,307, or 2,299 at the house ending, which would cost more than the
module's three planned apps bought one by one (2,097) and so invert the
rule's purpose. 1,999 is 2.86x, inside the band the pricing test holds every
module to (2.8x to 4.0x), and below a la carte. The owner can change it in
pricing_config without a deploy, then match the two code copies.

## Marketing

Nine modules on Home and Solutions, and a Process Safety showcase card
counting one app (the one that works), as DS1 did.

## Tests

- `src/utils/processSafety/__tests__/lopaStudy.test.js` (26): the shim is
  the vendored engine, the published Dolan valve row through the shim, the
  exact decade band, blank is absent, flags as the engine reads them, the
  example worked through, the verdict on the PFDavg, every interval state.
- `src/utils/processSafety/__tests__/lopaStudiesService.test.js` (5):
  organization filter, author never sent, refused delete reported.
- `src/pages/apps/__tests__/lopaSilStudio.smoke.test.jsx` (15): the page,
  every outcome state from the UI, the engine's not-credited reason, beta
  refusal, the lambda x T warning, the sensitivity table, UNACHIEVABLE, the
  help guide.
- `src/components/processsafety/__tests__/lopaCopy.test.js`: owner copy rule.
- Registration: `processSafetyRegistration.test.js` (route, table, tile,
  pricing, nine-module marketing, MIGRATIONS rows),
  `midstreamDownstreamRegistration.test.js` and `modulePricing.test.js`.

## Owner steps, in order

1. Apply the PS0 seed `20260919200000` with the upload that ships the PS0
   hub (deploy-gated, see its MIGRATIONS.md row).
2. Apply `20260919210000_ps1_lopa_studies.sql` (not deploy-gated).
3. Upload the build carrying `/dashboard/apps/process-safety/lopa-sil-studio`,
   and serve that route on the deployed site.
4. Apply `20260919220000_ps1_activate_lopa_sil_tile.sql`.
5. Apply `20260919230000_ps1_process_safety_module_pricing.sql`.
6. `supabase functions deploy generate-quote` (fallback now carries
   process-safety).
7. Then the NextGen H3 go-live, held until the route serves.
