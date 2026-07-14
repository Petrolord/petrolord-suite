# Rock Physics Studio — STATUS

Plan of record: docs/scope/RockPhysicsStudio-PLAN.md (**approved with
owner sign-off 2026-07-13**, all four open questions answered at
drafting). Roadmap slot: Geoscience-ROADMAP.md Phase G6 — the first
advanced-tier app after the core loop closed at G5. Slug
`rock-physics-studio` — **SHIPPED 2026-07-14, tile Active**.
Phase G6 complete (G6.0–G6.5). Live at
`/dashboard/apps/geoscience/rock-physics-studio`.

Prod build upload to petrolord.com still pending (accumulated across
G1–G6; staging is HMR-live).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G6.0 oracle + goldens | **DONE** | f9167ee28 — tools/validation/rockphysics/ (stdlib-only Python, written from primary published definitions, never from JS); self-asserted anchors (Gassmann round-trips, BW brine→pure-water at S=0, Zoeppritz θ=0 identity, Shuey(0)=A, Rutherford-Williams class cases); goldens committed to test-data/rockphysics/ |
| G6.1 engine | **DONE** | 1013dedbe — engine/{fluids,minerals,gassmann,vsEstimate,avo}.js validated vs goldens (exact where closed-form, documented tolerance elsewhere); NaN-not-silent-defaults (unphysical inputs THROW); malformed-input fuzz |
| G6.2 rp_projects migration | **DONE** | 8b897598e — migration 20260714100000 **applied live** (owner-only RLS, petro_projects pattern); pentest block 14 live green; MIGRATIONS.md row |
| G6.3 waveform extraction | **DONE** | 463793603 — isGap/rickerWavelet/convolveSame → src/lib/waveform.js at the second consumer (G4 gridding precedent); Seismolord re-exports, synthetics jest goldens stayed green untouched; engine/wedge.js (wedgeTrace/wedgePanel/tuningCurve) vs oracle wedge goldens |
| G6.4 workstation UI | **DONE** | this branch — RockWorkstation on shared WorkspaceShell + injected backends (registryBackend / inMemoryBackend seeded FROM the oracle anchor cases); Fluids & Gassmann, AVO (exact-Zoeppritz vs Shuey/Aki-Richards + I-G crossplot with class bands), Wedge (variable-area canvas + tuning curve) — white chartTheme + ChartLogo; estimated-Vs provenance badge; /dev/rock-physics-studio harness; services jest reproduces the log_domain golden THROUGH the glue; 5 e2e asserting oracle numbers off the UI |
| G6.5 close-out | **DONE** | this branch — rp_projects persistence (save/restore scenario+rock+avo+wedge), page + route apps/geoscience/rock-physics-studio, tile seed 20260714110000 **applied live** (%ROWTYPE copy, Active), dead src/services/petro/rockPhysicsService.js deleted (zero importers), e2e route smoke |

## Key facts

- Engine is client-side and SI-internal (m/s, kg/m³, Pa); unit
  conversions live at the UI edge in `services/prep.js` (lasImport
  precedent). US/F sonic, g/cc density and percent fraction logs are
  converted on load.
- Vs provenance discipline (plan decision 2): measured DTS wins;
  otherwise Greenberg-Castagna on the VSH sand/shale split, and the
  whole model is badged `Vs estimated` — sources never silently mixed.
- Fluids are full Batzle-Wang 1992 (decision 1); mixed saturations via
  Wood/Reuss; manual K_fl/ρ_fl override remains available in the
  scenario panel (type over the pre-fill).
- Outputs are display + `rp_projects` save only (decision 3): no
  Seismolord export, no geo_* writes in v1 — revisit when a concrete
  consumer exists.
- The harness wells ARE the goldens' anchor cases: the brine sand
  substitutes to the gassmann `log_domain` numbers, the shale/gas-sand
  interface is the `class3_gas_sand` AVO case, and the default wedge
  parameters are the wedge golden (tuning 16 ms). The e2e derives every
  expected value from `test-data/rockphysics/goldens.json`, never
  hardcoded literals (G2 fixture-v2 lesson).
- Shared waveform primitives live at `src/lib/waveform.js`; Seismolord
  synthetics re-export them, and its jest goldens are the extraction
  tripwire.
- `rp_projects` is app-private (owner-only RLS) — no shared-table
  review bar was triggered; v1 keeps one implicit project per user
  (first save creates it).
