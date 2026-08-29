# Product floor (Economics E2) — status

Phase: Economics E2 (Economics-ROADMAP.md §6 E2)
Status: **SHIPPED 2026-08-29** (branch feat/economics-e2)

## What E2 was for

E0 made the module's records honest and E1 made its fiscal math honest.
Neither touched what a user actually meets: three sold apps that lost
your work on reload, one help guide across twelve apps, charts that had
been removed and never put back, and no page-level test anywhere in the
module.

## 1. Persistence for the three apps that had none

NPV Scenario Builder, Value of Information Analyzer and Probabilistic
Breakeven Analyzer are gated, sold apps. Every input typed into them,
and in the Breakeven Analyzer the uploaded production profile too, was
lost on reload.

Migration `20260829810000_e2_economics_persistence.sql` adds
`saved_npv_projects`, `saved_voi_projects` and
`saved_breakeven_projects` on the `saved_<app>_projects` convention:
owner-scoped RLS with WITH CHECK, whole-input payload in `inputs_data`,
results recomputed on load rather than duplicated server-side.

The Breakeven study stores its production profile deliberately. That
app refuses to run without real production data, which is correct, and
a saved study without the profile could never be re-run.

### The duplication this stopped

The studio-kit persistence recipe had been hand-copied into roughly
twenty app contexts, identically each time, down to the ten second
autosave and the "Auto-save failed" string. E2 needed it three more
times, so the state machine now lives in `src/hooks/useSavedProjects.js`
and an app supplies only what is genuinely its own: how to serialize
its inputs and how to restore them. `createSavedProjectsService` keeps
the transport half. Existing contexts are left alone; this is the path
for new ones and for any that get touched later.

A missing table is treated as the one persistence failure that is
neither the user's fault nor transient, and the message names the
migration to run.

## 2. Help guides

Before E2, one app in twelve had an in-app help guide (EPE) and one had
a help modal (NPV Scenario Builder). The roadmap's count of "7 of 12
missing" was understated: the honest count was **ten**.

Six guides ship here, one per app whose surface is stable after E1:
Probabilistic Breakeven Analyzer, VOI Analyzer, Fiscal Regime Designer,
Capital Portfolio Studio, Decision Tree Builder and Decision Studio.

FDP Accelerator is left to E3, which rebuilds it, and Project
Management Pro, AFE Cost Control Manager and Technical Report Autopilot
to E4, which is where the roadmap puts their product work. Writing a
guide for a surface about to be replaced is waste.

Each guide is written against the code as it now is. The three things
this module most needed in writing, all of them gated by tests:

- **Which fiscal tier a number came from.** Economics runs a screening
  tier and a full-fiscal tier, and the difference is the difference
  between a screening deck and a sanction case.
- **The discounting convention gap**, quantified at about 4.9 percent
  at a 10 percent rate, so a user who compares two Suite tools and sees
  exactly that difference knows it is a convention and not an error.
- **The assumption each tool would most like you to forget**:
  independent sampling in the Breakeven Analyzer, independent projects
  in the portfolio optimizer, risk neutrality in both decision tools.

The guard test mirrors the Reservoir one and adds two checks: that
every guide is imported by a routed page, since a guide nobody can open
is not help, and that the money-computing apps state their tier. The
owner copy rule (no em dashes) is enforced across all six.

## 3. Charts, and two fabrications found behind them

Every economics chart now draws through ChartFrame on the white chart
surface, so it carries the watermark and exports as a PNG. Two of the
things found on the way were not styling problems.

### The VOI Analyzer drew nothing

Its decision tree panel was a "Chart removed" placeholder. The app
computed a decision tree and then showed the user an empty box.

It draws the real tree now, through the same component the Decision
Tree Builder uses, built by the canonical builder and rolled back by
the canonical engine, so the picture and the KPI cards cannot disagree.
Getting the legacy input shape into the builder needs a Bayes
inversion, and that inversion round-trips exactly: the diagram shows
the indicator chances the user entered, not a set re-derived from the
priors. Gated by a test.

Where an indicator's outcome chances do not sum to 100 percent, no
tree exists. None is drawn, the panel says why, and the KPIs still
compute.

The node and link "plot data" that panel never rendered is deleted with
it. Its link values were not a quantity: each was the running EMV total
multiplied by an indicator probability.

### The Fiscal Regime Designer asserted three conclusions it never computed

Its Insights tab stated four conclusions. Because the summary is sorted
by contractor NPV, it told the user that the top-NPV regime also had
the fastest payback, that the second-ranked regime maximized government
revenue "significantly higher than other options", and asserted a
capex-resilience and price-response ranking that nothing in the app had
worked out. Only the first claim was true, and only because of the
sort.

Insights are now derived in the engine from the comparison itself:
fastest payback over the regimes that pay back at all, highest total
government take, least NPV given up across the capex sweep, steepest
climb in government share across the price sweep. A claim the numbers
cannot support is omitted rather than guessed, and with one regime the
sweep claims do not appear at all.

### Also

The NPV spider chart described its own data as "mocking plotting data".
It is not mocked: three real computed points per parameter with linear
interpolation between them. The comment is corrected and the chart now
tells the reader to read the slope rather than an intermediate value.

Charts moved: NPV waterfall, cash flow, tornado, spider, histogram and
S curve; portfolio comparison; and the Fiscal Regime Designer's five,
which were the module's last Chart.js panels on a dark surface. The
NPV tornado now draws both sides of each swing.

## 4. Page smoke tests

The module shipped twelve routed, sold apps with zero page-level tests.
All twelve now mount under test, including the E3 and E4 apps, so those
phases start from pages known to render.

## The finding E4 should read first

**Technical Report Autopilot's backend is gone.**

The app does not call Supabase for its generation path. It calls a
hardcoded Heroku host, `petrolord-pvt-backend-2025-…herokuapp.com`, and
that host no longer exists: every request returns Heroku's "No such
app" 404 page, the root included. Report generation, the report-type
list and the DOCX export are all on that path, so the app's entire
purpose is currently unreachable, on a tile the catalog carries as
Active.

That answers E4's "audit then harden" question before E4 starts. What
to do about it is the owner's decision per the E-series dispositions:
archive the tile, or rebuild the generation path onto Supabase edge
functions the way the rest of the Suite works.

The same dead host appeared in three other files:

- `src/lib/epeApi.js` — zero importers, **deleted in E2**. A dead
  client for a dead service sitting in the flagship's namespace is
  exactly the kind of thing someone revives by accident.
- `src/utils/digitizerApi.js` — zero importers, and Geoscience rather
  than Economics, so it is reported here rather than deleted from an
  Economics phase. It should go the same way.
- `src/components/reportautopilot/InputPanel.jsx` — live, and covered
  by the owner decision above.

## Verification

- Jest: economics persistence smoke 12, economics pages smoke 8,
  help-guide guard 27, fiscal designer 18, VOI 10. Full `src` sweep 278
  suites / 3179 tests green.
- `npm run build` clean.
- Migration `20260829810000` **APPLIED 2026-08-29** after a
  rollback-wrapped dry run that created all three tables and rolled
  back. Post-apply probe: three tables, RLS enabled on each, one owner
  policy each. Safe pre-deploy: no tile changes, and the apps degrade
  to a stated "run the migration" message without it, so applying it
  ahead of the upload only means saving works the moment the build
  lands.

## Left for later phases

- **E3**: FDP Accelerator slim rebuild.
- **E4**: PM Pro's fake IntegrationHub, AFE tests and help, and the
  Technical Report Autopilot decision above.
- **E5**: parked close-outs.
- `src/utils/digitizerApi.js` deletion, for whoever next touches
  Geoscience.
