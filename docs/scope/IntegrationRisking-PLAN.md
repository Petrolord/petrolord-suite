# Integration Pass + Prospect Risking — Phase G5 Plan

Status: **DRAFT — awaiting owner sign-off** (open questions in §7,
including two scope calls only you should make).
Roadmap slot: Geoscience-ROADMAP.md **Phase G5 — Integration pass +
prospect risking** *(small-medium)*. This phase closes the core loop:
after G1–G4 the shared registries exist and are populated; G5 makes
ReservoirCalc Pro consume them directly and adds geologic-risk to its
volumetrics, so a prospect goes **logs → tops → correlation → surface →
risked volumes with zero file exports**.

## What this is

Two firmly-scoped deliverables plus two roadmap items that are real but
separable (and one of them genuinely dangerous), which §7 asks you to
schedule:

1. **Prospect risking in ReservoirCalc Pro** — geologic chance of
   success (Pg) from independent risk factors, risked volumes, a simple
   prospect inventory, and a portfolio roll-up. RCP already has the
   rigorous unrisked volumetrics (contact-based deterministic +
   Gaussian-copula Monte Carlo, overhauled 2026-07-09); risking sits on
   top of it.
2. **RCP reads the registries directly** — surfaces from `geo_surfaces`
   (already added in G4.4), wells + net pay from `geo_wells` /
   `geo_wells_zones.properties`. File import stays as a fallback.

## Audit (2026-07-13)

- RCP has **no** prospect-risking / Pg / chance-of-success code today —
  greenfield, but on a solid base (`MonteCarloEngine` gives P90/P50/P10;
  `ContactVolumetricsEngine` the deterministic GRV). Projects persist as
  jsonb in `saved_quickvol_projects` (real table, correct RLS).
- RCP does **not** yet read `geo_wells*` for inputs (only its own
  `MapGenerationEngine` computes net pay internally). G4.4 added the
  `geo_surfaces` reader to `SurfaceImportDialog`; the wells/net-pay
  reader is new here.
- The membership-consolidation and Seismolord-synthetics items the
  roadmap files under G5 are large and separable — see §7 Q3/Q4.

## Design decisions (proposed — owner sign-off locks these)

1. **Pg model = product of independent risk factors** (the industry
   standard): `Pg = p_trap · p_reservoir · p_charge · p_seal`, each in
   [0, 1]. Risked volume = `Pg · unrisked`. This is exact arithmetic —
   validated by analytic jest cases, not an oracle (the correlation/
   wellPath precedent). Extensible to more factors later; v1 fixes the
   canonical four with an optional "other" multiplier.
2. **Risked outputs, honestly defined**: for a prospect with an unrisked
   volume distribution (from the existing MC) and success probability
   Pg, report **risked mean = Pg · mean(unrisked)** and the
   **success-case** P90/P50/P10 (the volumes *given* discovery), never a
   single blended number that hides the bimodality (0 on failure, the
   distribution on success). The UI states both explicitly.
3. **Portfolio roll-up**: over N prospects, **EMV-style** aggregates —
   expected risked volume = `Σ Pg·mean`, expected number of discoveries
   = `Σ Pg`, and the success-case totals. v1 treats prospects as
   independent (no shared-risk correlation — that is later scope, called
   out in the UI).
4. **Prospect inventory persistence** = a new app-private table
   `rcp_prospects` (product-prefixed, owner-only RLS — the
   `petro_projects` pattern): name, Pg factors jsonb, a reference to the
   volumetric inputs / MC result snapshot, risked outputs jsonb. Small,
   owner-only. *(§7 Q1 — vs. embedding prospects in the existing project
   blob.)*
5. **Registry input path in RCP**: a "From the shared registry" source
   for well/zone net-pay-derived inputs — read `geo_wells_zones`
   published averages (φ, Sw, net, NTG from Petrophysics Studio G2.5)
   and surface areas from `geo_surfaces`, feeding the existing
   volumetrics inputs. File/manual entry stays. Uses `wellsRegistry`
   (no new service).
6. **UI: a Prospect Risking panel in RCP** (its existing tab/hub
   idiom — RCP is card/tab based, NOT the workstation shell): Pg factor
   inputs, risked-volume readout (risked mean + success-case
   P90/P50/P10), the prospect inventory table, and the portfolio
   roll-up. Analytic charts on the white chartTheme (RCP already uses
   it in ProbabilisticResultsDisplay).
7. **Acceptance (the loop demo)**: the same shared dataset flows
   logs → tops (G1/G3) → surface (G4) → RCP risked volumes with zero
   file exports; validated by a jest integration test threading the
   registries → risking engine, plus the RCP registry-read path e2e.

## Schema sketch (G5.2 migration, staging-first)

```
rcp_prospects: id, user_id FK cascade, name,
  pg_factors jsonb ({trap,reservoir,charge,seal,other}),
  inputs jsonb (volumetric input snapshot / geo refs),
  risked jsonb (pg, risked_mean, success p90/p50/p10),
  created_at, updated_at
  RLS: owner-only all ops (petro_projects pattern). Index (user_id).
```

## Phases

- **G5.0 — Risking engine + goldens** *(small)*: `services/
  ProspectRiskEngine.js` in RCP — Pg product, risked mean, success-case
  percentiles from an MC result, portfolio roll-up. Analytic jest
  (Pg = ∏ factors; EV = Σ Pg·mean; Σ Pg discoveries; clamping/guards).
- **G5.1 — Registry input reader** *(small)*: read `geo_wells_zones`
  published averages + `geo_surfaces` areas into RCP's volumetric
  inputs; jest on the mapping; the file path untouched.
- **G5.2 — `rcp_prospects` + pentest** *(small)*: migration + live RLS
  pentest (owner-only), MIGRATIONS.md.
- **G5.3 — Prospect Risking panel** *(medium)*: Pg inputs, risked
  readout, inventory table, portfolio roll-up; persistence; e2e on the
  RCP surface (or a `/dev` harness if the RCP shell isn't e2e-driveable
  without auth — decide during build).
- **G5.4 — Loop acceptance + close-out** *(small)*: the zero-file-export
  loop integration test; STATUS + roadmap; PR.

## Risks

- **RCP is a shipped, heavily-tested app** (67+ tests). Risking + the
  registry reader are ADDITIVE — no change to the volumetrics engine or
  MC core; its suites are the regression fence and must stay green.
- **Bimodal risked volumes are easy to misreport** — the engine and UI
  keep success-case and risked-mean separate by construction (decision
  2); no single misleading "risked P50".

## Open questions for sign-off

1. **Prospect inventory storage** = new app-private `rcp_prospects`
   table (recommended) vs. embed in the existing project blob. Confirm.
2. **Risked-volume convention** = report risked-mean + success-case
   P90/P50/P10 separately (recommended, decision 2) vs. a single
   expected-value number. Confirm.
3. **Membership consolidation** (roadmap lists it under G5): this is a
   **suite-wide, high-risk shared-table migration** touching ~55
   EPE/econ RLS policies (pick canonical membership table, backfill,
   re-grant, drop stragglers, shrink `is_org_member()`). It is
   orthogonal to geoscience and can break billing/econ access if
   mishandled. **Recommendation: split it into its OWN dedicated effort
   with a second-engineer review and a full EPE/econ pentest — NOT
   bundled into this build.** Confirm defer, or direct otherwise.
4. **Seismolord LAS-driven synthetics** (roadmap lists it under G5:
   synthetic seismogram from G1 sonic/density + wavelet extraction):
   real, but a separable Seismolord feature build. **Recommendation:
   schedule as a G5 follow-on (or its own phase) after the risking loop
   closes.** Confirm defer, or include now.
