# Integration Pass + Prospect Risking — STATUS

Plan of record: docs/scope/IntegrationRisking-PLAN.md (**approved as
drafted 2026-07-13**). Roadmap slot: Geoscience-ROADMAP.md Phase G5.
**Core complete (G5.0–G5.4)**; two roadmap items deliberately deferred
(see below). No new tile — this extends ReservoirCalc Pro.

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G5.0 risking engine | **DONE** | this branch — services/ProspectRiskEngine.js (Pg = ∏ factors; risked-mean + success-case kept separate; portfolio roll-up); 9 analytic tests |
| G5.1 registry input reader | **DONE** | this branch — services/registryInputs.js (geo_wells_zones averages + geo_surfaces area → RCP inputs); 6 tests |
| G5.2 rcp_prospects + pentest | **DONE** | migration 20260713290000 **applied live**; owner-only RLS; pentest block 13 green |
| G5.3 Prospect Risking panel | **DONE** | ProspectRiskingPanel + prospectsService pair; mounted in RCP WorkspaceToolsHub; /dev/prospect-risking harness; e2e |
| G5.4 loop acceptance + close-out | **DONE** | zero-file-export loop integration test (registry surface+zones → RCP volumetrics → risked volume); full jest 768 / 34 e2e green |

## Key facts

- **Risked volumes are bimodal** — the engine + UI keep the *risked
  mean* (Pg·mean, the EMV basis) and the *success-case* P90/P50/P10
  (volumes given discovery, unscaled) SEPARATE. No single misleading
  "risked P50".
- **The loop closes with zero file exports**: `geo_surfaces` area +
  `geo_wells_zones` published averages feed RCP volumetrics directly
  (file import stays as a fallback); RCP also reads `geo_surfaces` in
  its SurfaceImportDialog (G4.4).
- Prospect inventory persists in `rcp_prospects` (owner-only). Portfolio
  roll-up treats prospects as independent (shared-risk correlation is
  later scope; the UI says so).
- RCP's existing 67+-test volumetrics/MC suites are untouched-green —
  risking + the reader are strictly additive.

## Deferred (owner-approved, §7 Q3/Q4)

- **Suite-wide membership consolidation** — **DONE 2026-07-13** as its
  own effort (migration `20260713300000`, see MIGRATIONS.md): canonical
  table `organization_members`; the live blast radius turned out to be
  162 policies (public/hse/storage) + ~15 functions, all rewritten onto
  SECURITY DEFINER helpers; legacy tables dropped behind read-only
  compat views; 5-probe live pentest green.
- **Seismolord LAS-driven synthetics** (synthetic seismogram + wavelet
  extraction from G1 sonic/density): a separable Seismolord feature — a
  G5 follow-on.
