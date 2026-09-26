# NextGen Academy: the remaining course programme

Plan of record for everything left after the Drilling & Completions
series. Covers the Drilling close-out (DR9-DR12) and the five Suite
modules with no academy presence at all: Production, Facilities,
Economics, Midstream & Downstream, and Assurance.

Written 2026-09-03, after DR8 landed and while DR9 is in build.

Authority: this document, for scope and ordering. Each module still gets
its own detailed plan before its first wave, the way
NextGen-Reservoir-Courses-PLAN.md and NextGen-Drilling-Courses-PLAN.md
did. The recall hooks are the `nextgen-drilling-courses-program` and
`nextgen-reservoir-courses-program` memories.

## 1. Starting position (verified 2026-09-03)

**25 courses are built.** The academy catalog holds 25 rows: 10
geoscience at path_order 1 to 10, 7 reservoir at 11 to 17, 8 drilling at
18 to 25. Live totals are 75 active tier structures, 9,898 questions and
75 capstones.

**Only the 10 geoscience courses are visible to learners.** All 15
reservoir and drilling courses sit at `coming_soon`. Their 15 go-live
migrations are written, self-asserting and HELD, because a go-live
refuses to run until the deployed site carries the course route. The
NextGen production upload that would release them has not happened. This
is the single largest piece of finished-but-invisible work in the
programme, and it grows by one migration per course.

**DR9 Perforation & Sand Control is in build.** 78 lessons written, 3
panels and the teaching lab done with 48 passing tests, engine fix
synced and identical to the interval-bottom correction already merged
and live in the Suite. 90 of its 396 questions are written. It is not
committed.

**Every Suite module is finished.** The N5+ doctrine in
NextGen-ROADMAP.md says a teaching module follows its Suite module's
close-out. That condition is now satisfied for all of them, so nothing
in this plan is waiting on Suite delivery.

| Suite module | live apps | courses today |
|---|---|---|
| Geoscience | 10 | 10 |
| Reservoir | 13 | 7 |
| Drilling | 12 | 8 |
| Production | 12 | 0 |
| Facilities | 13 | 0 |
| Economics | 12 | 0 |
| Midstream & Downstream | 10 | 0 |
| Assurance | 14 | 0 |

## 2. The extraction gate is what sets the order

Course authoring is extraction-gated: the engine lands in
`Petrolord/petrolord-engines` with goldens and an independent oracle
BEFORE a lesson is written. That rule is what makes the auto-graded
capstone trustworthy, and it is the thing that made RC6 and RC7 slow.

Checked against the central repo at `254c470`:

| module | engine in central repo | goldens | oracles | gate |
|---|---|---|---|---|
| Drilling | 25 modules | 23 | yes | OPEN |
| Production | 19 modules | 9 | 9 | OPEN for 9 of 12 apps |
| Facilities | 13 modules | 12 | 12 | OPEN |
| Midstream & Downstream | none | 0 | none | CLOSED |
| Economics | none | 0 | none | CLOSED |
| Assurance | none | 0 | none | CLOSED |

Three findings behind that table, each of which is work nobody has
scheduled:

**The downstream engines were never pushed up.** Eleven engine modules
exist at `packages/engines/engines/downstream` in the Suite's vendored
copy, and the Suite's own app files are re-export shims pointing at
them, exactly as the convention requires. But the central repo has no
`downstream` directory. The vendored copy is ahead of the source of
truth, which inverts the subtree contract. The shared linear programming
solver at `packages/engines/lib/lp/simplex.js`, which MD2 depends on, is
missing from the central repo the same way. There are no goldens and no
oracle for any of it. Fixing this is the whole extraction gate for
Midstream & Downstream, and it should be corrected on hygiene grounds
whether or not the courses get built.

**Three Production apps are not extracted.** Production Allocation
Studio, Production Surveillance Studio and Artificial Lift Advisor keep
their math in `src/utils/production`, with no golden coverage. The other
nine Production apps are fully extracted with a golden and an oracle
each.

CORRECTED 2026-09-04. This paragraph originally said FOUR, and named
Nodal Analysis Studio among them. Nodal was extracted on 2026-09-03 in
petrolord-engines PR #106, which landed `engines/production/nodal.js`,
`test-data/production/goldens/nodal_cases.json` and a standard-library
oracle at `tools/validation/production/oracle_nodal.py`. That closes the
gate for PD1, which is why PD1 could start immediately after DR12 rather
than waiting on an extraction wave. The Production row in the gate table
is corrected with it: nine goldens against nine oracles, open for nine of
twelve apps.

A note on how the error was nearly repeated. On 2026-09-04 a local check
of the engines repo reported the nodal extraction branch as unmerged,
because the local `main` ref was stale, and a duplicate PR (#108) was
opened and merged as a result. It was a no-op and did no damage, but the
check that would have caught it is fetching before comparing, not reading
`origin/main..HEAD` against a ref that has not been updated.

**Economics has no engine directory anywhere.** The cash flow engine and
its Monte Carlo companion live in the Suite's edge function shared
directory as TypeScript, with unit tests but no goldens. The canonical
Monte Carlo implementation sits inside ReservoirCalc Pro. Extracting
economics means moving code that is currently deployed as an edge
function, which is a different and more careful job than the others.

## 3. Build order

1. **DR9-DR12**, closing Drilling. No gate, no decisions outstanding.
2. **Production**, because its gate is open for two thirds of the module
   and it sits next to Reservoir in the learner's path.
3. **Facilities**, whose gate is fully open.
4. **An extraction wave** covering downstream, economics and the four
   Production stragglers.
5. **Midstream & Downstream**, then **Economics**, then **Assurance**.

Steps 2 and 3 can begin immediately. Step 4 is the long pole and can run
in parallel with them, since extraction touches the engines repo and
course authoring touches the academy repo.

## 4. Drilling close-out (DR9-DR12)

Roster already fixed in NextGen-Drilling-Courses-PLAN.md section 2.

| wave | slug | course | path_order | golden |
|---|---|---|---|---|
| DR9 | `perfsand` | Perforation & Sand Control | 26 | perfsand_cases |
| DR10 | `stimulation` | Stimulation Design | 27 | stim_cases |
| DR11 | `integrity` | Well Integrity & P&A | 28 | wellintegrity_cases |
| DR12 | `wellcost` | Well Cost & Time | 29 | wellcost_cases |

DR12 imports the canonical `MonteCarloEngine.js` per the CLAUDE.md rule.
No new implementation.

## 5. Production (PD1-PD9), path_order 30 to 38

Proposed roster. Eight of the nine map one-to-one onto an existing
golden, which is why the module is ready.

| wave | slug | course | Suite app | golden |
|---|---|---|---|---|
| PD1 | `nodal` | Nodal Analysis & Well Performance | Nodal Analysis Studio, Choke & Wellhead | choke_cases, needs nodal extraction |
| PD2 | `gaslift` | Gas Lift Design | Gas Lift Design Studio | gaslift_cases |
| PD3 | `esp` | ESP Design | ESP Design Studio | esp_cases |
| PD4 | `rodpump` | Rod Pump Design | Rod Pump Design Studio | rodpump_cases |
| PD5 | `gaswell` | Gas Well Performance | Gas Well Performance Studio | gaswell_cases |
| PD6 | `flowassurance` | Flow Assurance | Flow Assurance Studio | flowassurance_cases |
| PD7 | `network` | Production Networks | Production Network Studio | network_cases |
| PD8 | `intervention` | Well Intervention | Well Intervention Planner | intervention_cases |
| PD9 | `surveillance` | Surveillance & Allocation | Production Surveillance, Production Allocation | needs extraction |

`nodal` is the path root: every lift course needs an inflow and outflow
curve before it can choose anything. Artificial Lift Advisor is absorbed
as the selection lesson across PD2 to PD4 rather than becoming its own
course, on the RC precedent for screening-scale apps.

PD1 and PD9 are gated on the extraction wave. PD2 through PD8 are not.

PROGRESS, 2026-09-16. That gate is closed and the module shipped.
`engines/production/` carries `nodal.js`, `allocation.js` and
`surveillance.js` alongside the lift modules, so nothing in this roster is
waiting on an extraction any more, and all nine courses are live.

## 6. Facilities (FC1-FC9), path_order 39 to 47

Every wave has its golden today.

| wave | slug | course | golden |
|---|---|---|---|
| FC1 | `separation` | Separation & Slug Catching | separator_cases |
| FC2 | `linesizing` | Pipeline & Line Sizing | linehydraulics_cases |
| FC3 | `rotating` | Pumps & Compression | pumps_cases, compression_cases |
| FC4 | `gasprocessing` | Gas Processing | gasprocessing_cases |
| FC5 | `relief` | Relief & Flare Systems | relief_cases |
| FC6 | `heattransfer` | Heat Exchange & Cooling | heattransfer_cases |
| FC7 | `producedwater` | Produced Water Treatment | producedwater_cases |
| FC8 | `metering` | Metering, Control Valves & Storage | tanksmetering_cases, controlvalve_cases |
| FC9 | `corrosion` | Corrosion & Integrity | corrosion_cases |

Facility Layout Mapper is absorbed into FC1 as the spacing lesson, since
`spacing_cases` is its only golden and the app is screening-scale.

## 7. Midstream & Downstream (MD1-MD5), path_order 48 to 52

Gated on pushing the eleven downstream engine modules to the central
repo with goldens and oracles.

PROGRESS, 2026-09-16. **The gate is half open.** The code is up: all
eleven modules are in petrolord-engines at `engines/downstream/`
(`carbonAbatement`, `crudeAssay`, `energyEfficiency`, `flareToValue`,
`fuelPricing`, `lpgCng`, `modularRefinery`, `productBlending`,
`refineryPlanning`, `streamModel`, `terminalDepot`) with the LP kernel at
`lib/lp/simplex.js`, and eleven jest suites totalling about 4,600 lines
gate them. The statement elsewhere in this plan that they were never
pushed is stale.

What is still missing is the half that decides whether a course can be
built on them. Those suites are self-consistency gates: they assert that
the plan's material balance closes, that the schedule sums to the plan it
came from, that the variance decomposes exactly. Identities of that kind
catch an engine that contradicts itself. They cannot catch an engine that
is wrong and consistent, which is the failure mode a capstone would ship
to a learner as a graded answer. There is no `test-data/downstream`
golden set and no `tools/validation/downstream` oracle, so MD1 to MD5
stay gated until that validation wave runs.

PROGRESS, 2026-09-19. **MD-0 runs one course at a time, and MD1's gate is
open once engines #215 and its Suite PR merge.** MD1-0 put `crudeAssay`,
`productBlending` and the shared `simplex` behind stdlib oracles (the LP by
exact rational vertex enumeration), goldens in `test-data/downstream/` and
a planted-defect battery (24 of 24 caught). It found 23 things, three of
them wrong on screen at the apps' defaults: the Blend Optimizer's shadow
prices were row duals (sulfur relief shown as $0.072 against a re-solved
$55.01 per ppm), the Crude Assay studio's Watson K sat on a grid point
(12.00 against 11.75) and its stability screen gave a green tick on no
evidence. The LP kernel could return points that broke their own rows as
optimal. Findings: engines `tools/validation/downstream/FINDINGS-crude.md`.
MD2-0 (`modularRefinery`, `refineryPlanning`, and the kernel's reach into a
maximising plan) is next; MD3 to MD5 stay gated on their own waves.

PROGRESS, 2026-09-19 (later). **MD1-0 is merged (engines #215, Suite #532)
and MD2-0 is merged in the engines (#219).** MD2-0 built `exact_simplex.py`,
a rational simplex that returns only certificate-proved optima, and found
the refinery planner's crude unit carrying nothing at the default plan
($3.49M of opex uncharged), typed zero capacities read as unlimited, a
variance that added revenue gaps to cost gaps, and a modular refinery NPV
that threw away construction-year tax losses (a profitable plant read
-$12.2M; it is +$5.3M). Decisions taken under the owner's delegation: an
opt-in loss carry-forward in the screening engine, no royalty on a refinery,
a feedless unit is the crude unit. MD3-0 (`terminalDepot`, `fuelPricing`)
is next, then the three Commercial & Trading courses MD1 to MD3.

PROGRESS, 2026-09-19 (evening). **MD3-0 is merged (engines #221) and all three
Commercial & Trading engines are gated.** Its worst finding was on the Suite
page: the Terminal & Depot reconciliation derived its opening stock from
today's dip, so it balanced for every input. The three courses are in build
in NextGen on a shared vendor commit (downstream family at engines 60ee266):
`crude` (48), `refinery` (49), `supply` (50), module `downstream`.

| wave | slug | course | engine modules |
|---|---|---|---|
| MD1 | `crude` | Crude Assay & Blending | crudeAssay, productBlending |
| MD2 | `refinery` | Refinery Feasibility & Planning | modularRefinery, refineryPlanning, simplex |
| MD3 | `supply` | Terminals, Depots & Fuel Supply | terminalDepot, fuelPricing |
| MD4 | `gasvalue` | Flare Gas to Value & LPG/CNG | flareToValue, lpgCng |
| MD5 | `carbon` | Carbon & Energy Efficiency | carbonAbatement, energyEfficiency |

PROGRESS, 2026-09-19 (night). **MD1 to MD3 are built and merged in NextGen,
go-lives HELD.** `crude` #167, `refinery` #166 (+ #168, the Suite upload gate)
and `supply` #165, nextgen main `5fda0d5c`. Each course has 78 lessons, 396
questions and 18 graded fields, on engines 13f0936 (MD-1 #224 and MD3-2 #225
re-vendored). The module ruling superseded `downstream`: crude and refinery sit
in `commercial_trading` and supply in `supply_chain`. Migrations are
`20261010_cr_crude_*`, `20261011_rf_refinery_*` and `20261012_tds_supply_*`, each
with a content-addressed apply script under `tools/course-waves/<slug>/`. Each
ladder passed a rolled-back production dry run (catalogue 55 to 56 available),
and every negative control fired. For LP fields, the go-live's second route is
the oracle's exact rational value, and closed-form fields are recomputed in SQL.

All nine tier banks went through a key-truth audit. Every tier had 12 to 22 keys
resting on lesson sentences the digest never prints; each was replaced, and the
lessons were fixed to match. Two lead rulings were overturned by measurement.
First, the refinery plan does maximise margin: `solveLP(..., maximize: true)`
is read from the engine source and printed. Second, the crude sulfur re-solve
spread is not a vertex change: the limit scales every volume in its row. Both
now print in the digests.

**Every go-live is gated on TWO uploads:** the NextGen zip carrying
`apps/<slug>`, and the Suite production upload carrying Suite main `1a71d9c90`
(#532, #534 and #540, the page repairs these courses teach; production was
e36846604). Owner order: merge is done, then `apply_<p>_<slug>.sh verify` and
`seed` for each course, then both uploads, then `go-live` for each course. Log
every applied migration in the NextGen MIGRATIONS.md.

## 8. Economics (EC1-EC6), path_order 53 to 58

Gated on extracting the cash flow engine out of the edge function.

PROGRESS, 2026-09-08. **The gate is open.** EC0 extracted the whole
Economics module into petrolord-engines (engines PR #157, main `b694d4c`):
twelve modules verbatim, `cashflow.ts` and `montecarlo.ts` as TypeScript on
the mbal precedent so the three epe edge functions bundle through one-line
Suite shims, plus `lib/stats` (the canonical Monte Carlo primitives with
simple-statistics vendored bit-identically) and `lib/dates`. Nine stdlib
python oracles emit 774 golden cases and compute every reported summary;
1382 gates. The oracles found defects that are recorded, not fixed
(`packages/engines/tools/validation/economics/FINDINGS-*.md`): the screening
IRR reports its 1000 percent Newton clamp as the answer where the only root
is negative or beyond the clamp; the portfolio knapsack's capex grid can
choose a set over the limit or 23 percent short in EMV; FDP `calculateCPM`
is a passthrough that marks every activity critical; the cash flow engine's
NPV profile evaluates its applied-rate point at a rate rounded to two
decimals, reports one root of a multi-root IRR unflagged, and scales the
sinking-fund abandonment by working interest while the lump sum is not.
Every one is an owner decision. EC1 authoring began the same day, on the
Production recipe (wave dir `/root/ec-wip-cashflow`), with `prereq_slug`
NULL for all six courses per the carried-over answer above.

| wave | slug | course | Suite apps |
|---|---|---|---|
| EC1 | `cashflow` | Cash Flow & NPV | Petroleum Economics Studio |
| EC2 | `fiscal` | Fiscal Regime Design | Fiscal Regime Designer |
| EC3 | `uncertainty` | Probabilistic Economics | Probabilistic Breakeven, NPV Scenario Builder |
| EC4 | `decision` | Decision Analysis & Value of Information | Decision Studio, Decision Tree Builder, VOI Analyzer |
| EC5 | `portfolio` | Capital Portfolio & Cost Control | Capital Portfolio Studio, AFE Cost Control |
| EC6 | `fdp` | Field Development Planning | FDP Accelerator, Project Management Pro, Report Autopilot |

PROGRESS, 2026-09-09. **EC1 IS LIVE.** `cashflow` shipped as nextgen PR #114
(78 lessons, 21 banks and 396 questions, three panels over one `cashflowLab`,
and five migrations). The course and its three deep seeds were applied in
ladder order, each behind its own rollback-wrapped dry run, and the go-live
was applied once the cd383578 production upload was verified to carry the
route `/dashboard/apps/cashflow`. The Academy catalogue reads 39 available
and 0 coming_soon. Migration log: nextgen PRs #115 and #118.

EC1's own finding is a process one and it is now a standing step in the wave
kit. Seventeen bank questions across three banks were MIS-KEYED, eleven of
them in one file where the writer listed the options in display order and
passed the first as the correct one, so the true answer was a distractor in
every question and the explanation underneath supported it. Every structural
gate was green throughout, because none of them reads the answer. A
second-reader KEY-TRUTH audit per tier, one agent reading prompt, options,
explanation, digest and lesson for every question, now runs before
`gen_migration.py` on every wave.

PROGRESS, 2026-09-13. **EC2 is in build**, wave dir `/root/ec-wip-fiscal`, on
nextgen branch `feat/ec2-fiscal-course`. `fiscal` takes `path_order` 54 and
`prereq_slug` NULL. The teaching field is ODIDI and the capstone field is
URUAN; the digest reproduces byte for byte from its one generator, and the
leak, collision, brief and prompt gates all report zero.

EC2 found a defect the EC0 oracle did not. **The regime comparison's price
sweep reports a government share of exactly 0 percent whenever its
denominator is not positive**, which is every price at which the contractor
loses more over the life than the government collects. On the published
`cmp_never_recovers` comparison all six templates plot a flat zero across all
nine swept prices while collecting between 700.1194 and 1662.7835 million USD
for the government. The same series has no ceiling in the other direction:
on the Angola template at three times the default capex one curve reads
0.0000, then 2223.0766, then 144.0692, then 85.6015 across four consecutive
price points. One chart line, three meanings, no flag on any of them. The
oracle agreed with the engine throughout because it implements the same guard
from the same method statement, which is the shape this programme keeps
finding: a function that survives its input and says nothing. Written up with
the owner's three options in the wave's `FINDINGS.md` as EC2-1, and taught in
the Expert tier rather than fixed.

## 9. Assurance, path_order 59 onward

**This module needs a scope decision before it gets a roster.** Its
fourteen apps do not form one subject. They split three ways:

- **Exploration risk** (Charge/Seal/Trap Risk, Exploration Risk
  Analyzer, Prospect Ranking Tool) is geoscience material and would
  teach better as an eleventh geoscience course than as part of an
  assurance module.
- **Decision and uncertainty** (Monte Carlo Analyzer, Decision Tree
  Analyzer) duplicates EC3 and EC4 above. Teaching it twice would create
  exactly the cross-course answer leakage the standing rules exist to
  prevent.
- **Risk and compliance** (Risk Register, Risk Heatmap, ISO Compliance,
  Regulatory Compliance, Environmental Compliance, Safety Audit Manager,
  Audit Trail Manager) is a real subject and a real course or two.
- **Data Privacy Manager and Security Analytics** are platform
  administration rather than petroleum engineering, and may belong in
  operator documentation rather than the academy at all.

The recommendation is two assurance courses covering risk management and
compliance, exploration risk folded into geoscience, and the decision
apps left to Economics. That is a smaller module than the app count
suggests, and it is deliberate.

### DECISION, 2026-09-16: the split stands, and the courses wait on an app programme

The split above is adopted. Exploration risk becomes an eleventh
geoscience course, the decision and Monte Carlo material stays with EC3
and EC4 which are built, Data Privacy Manager and Security Analytics
leave the academy scope and belong in operator documentation, and risk
and compliance is worth two courses.

**Those two courses are deferred behind an Assurance app remediation
programme.** The module was audited against the code on 2026-09-16 and it
is the only module in the Suite still in its Horizons-generated state.
Every other module was rebuilt: Geoscience G0-G8, Reservoir R0-R5,
Drilling, Production, Facilities F0-F12, Economics E0-E5 and Midstream &
Downstream DS0-DS10. Assurance never got a programme. What the audit
found:

- There are eight app trees, not the fourteen the catalogue claims: five
  under `src/pages/apps/assurance/` (`iso-compliance`, `lessons-learned`,
  `moc`, `qa-plan`, `regulatory-compliance`) and three beside it
  (`risk-register`, `document-control`, `peer-review`).
- Three of the eight persist anything. `regulatory-compliance`,
  `risk-register` and `peer-review` have real Supabase services. The
  other five have no `supabase` import anywhere in their trees.
- `assurance/moc/Register.jsx` renders five hardcoded records from a
  local `mockData` array and filters them as though they were a register.
- ISO Compliance reads `@/data/isoComplianceData` into `useState`.
  Nothing a user does there survives a reload.
- There are no tests under any assurance path. The two files that match
  the word are `flowAssuranceContext` and `flowAssurance`, which are
  Production.
- There is no `engines/assurance` in petrolord-engines, so there is
  nothing for a capstone to be graded against even if a course were
  written today.

Teaching a course whose lab is a screen that invents its own data would
put the academy's name behind it. So the order is: an AS0 to ASn
remediation programme first, on the same shape as the other modules, each
app either made real or removed honestly; then the engine extraction with
goldens and an oracle; then the two courses. No date is set here, because
the programme is not yet scheduled against the Suite roadmap.

One documentation defect found in passing:
`docs/scope/AssuranceApps-STATUS.md` does not describe Assurance at all.
Its contents are the Economics E4 status for PM Pro, AFE and Report
Autopilot. The Assurance module has no status document.

## 10. Programme size

PROGRESS, updated 2026-09-04. The Drilling close-out block is DONE: DR9
Perforation & Sand Control, DR10 Stimulation Design, DR11 Well Integrity
& P&A and DR12 Well Cost & Time all merged (nextgen PRs #92, #93, #94,
#95), which completes the Drilling & Completions module at twelve
courses and takes the academy to twenty-nine. Production is under way,
PD1 first. Every course built in this programme ships with its go-live
HELD, so the count of courses BUILT and the count RELEASED are different
numbers until a NextGen production upload happens.

The table below is the plan as first written and is left as it was.


| block | courses | gate |
|---|---|---|
| Drilling close-out | 4 | open |
| Production | 9 | open for 8 |
| Facilities | 9 | open |
| Midstream & Downstream | 5 | closed |
| Economics | 6 | closed |
| Assurance | 2 | closed |
| **total** | **35** | |

Thirty-five courses on top of the twenty-five built takes the academy to
sixty. At the per-course shape below that is roughly 2,730 lessons and
13,860 questions still to write.

A strict one-app-one-course reading of the doctrine would give 65
remaining courses, one for each uncovered live app. The absorption above follows the Reservoir
precedent, where thirteen apps became seven courses because a
screening-scale app teaches better as a lesson than as a course. Each
absorption is called out where it happens.

## 11. Per-wave shape and standing rules

Unchanged from NextGen-Drilling-Courses-PLAN.md sections 4 to 6, which
carry forward the Reservoir series rules. In summary, per course:

- 6 modules, 26 lessons a tier, 78 lessons a wave.
- 132 questions a tier: 15 per module bank plus a 42-question exam.
- 3 capstones, 6 engine-derived graded fields each.
- 3 panels over one teaching lab, every exported value pinned by vitest.
- A learning page and route at `/dashboard/apps/<slug>`.
- 5 migrations: course and capstones, three deep seeds, a HELD go-live.

Two rules the Drilling series added are worth restating because they
will bite every module below:

- **An independent oracle has to compute every output the engine
  reports, including the summaries.** DR8 found a defect where a "worst
  case" reduction degenerated to the first row on every string that
  passed, invisible precisely on the reports read as reassurance,
  because the oracle never computed a worst row. Any worst case,
  binding constraint or recommended value carries this risk.
- **Write go-live assertions from the engine's output, never from the
  intuition the prompt was written with.** DR7's first clean go-live run
  refused because the assertion encoded an expectation the course itself
  disproved.

## 12. Open questions for the owner

Each module needs the five-question approval that Reservoir and Drilling
got. Carried over unchanged unless answered otherwise: no hard
prerequisite inside a module, fees at the published school level, and a
bridge mapping from the academy module to the Suite module. The
questions specific to this plan:

1. **Assurance scope.** Two courses as recommended in section 9, with
   exploration risk moved to geoscience and the decision apps left to
   Economics? Or a full module?
2. **Extraction wave priority.** Should the downstream push and the
   economics extraction run in parallel with Production and Facilities
   authoring, or strictly after?
3. **Production roster.** Nine courses as proposed, or eight with
   surveillance and allocation absorbed into PD7?
4. **Facilities roster.** Nine as proposed, or fewer with corrosion
   folded into FC1?
5. **The held go-lives.** Fifteen today, nineteen after the Drilling
   close-out. Is one production upload per module acceptable, or should
   the upload cadence be per course once the module is live?

### ANSWERS, 2026-09-16

All five are closed. One and two are decisions taken under the owner's
standing directive to pick the best option and keep moving. Three, four
and five were settled by what actually shipped, and are recorded here so
the questions stop being asked.

1. **Assurance scope: the two-course split, deferred.** The
   recommendation in section 9 is adopted in full, and the two courses are
   held behind an AS0 to ASn app remediation programme. The reasoning and
   the code audit behind it are in section 9. The academy does not teach
   from screens that invent their own data.
2. **Extraction wave priority: in parallel, by repository.** The
   economics half of this question is moot, since EC0 extracted the whole
   module on 2026-09-08 and EC1 to EC6 are built. The downstream half runs
   in parallel with Facilities authoring rather than after it, because the
   two touch different repositories and neither blocks the other: the
   validation wave is goldens and an oracle in petrolord-engines, and
   Facilities authoring is lessons and seeds in the academy repo. The wave
   is owed on its own merits, not only for the courses. Section 7 says
   what it consists of.
3. **Production roster: nine, as built.** PD9 Surveillance & Allocation
   shipped as its own course rather than being absorbed into PD7, and all
   nine Production courses are live.
4. **Facilities roster: nine, as proposed.** FC9 Corrosion & Integrity
   stays a course of its own. FC1 Separation is content-complete and FC2
   to FC9 follow in order.
5. **The held go-lives: batched, and applied only after the route
   serves.** The practice that settled is neither per course nor strictly
   per module. Go-lives accumulate as HELD, an upload goes out when the
   owner runs it, each route is served and checked on the deployed site,
   and only then are the go-lives applied. The 2026-09-04 Production
   upload applied twenty-eight held go-lives in one pass that way. The
   ordering rule is what matters and it is already a non-goal in section
   13: a go-live is never applied before the deployed site carries the
   route.

One naming decision that belongs with these, since it came up with the
same question. The Suite has no Commercial & Trading, Supply Chain &
Logistics or Energy Transition module, and it does not need one. Those
three subjects are already covered by apps inside Midstream & Downstream:
crude assay and blending, product blending and refinery planning for the
first; terminals, depots and fuel supply for the second; carbon
abatement, energy efficiency and flare gas to value for the third. The
academy keeps one Midstream & Downstream module and lets the three themes
appear as course titles inside it, rather than splitting the catalogue
into thin modules that each hold one or two courses.

**Data & AI is the one genuinely empty domain**, with no app, no engine
and nothing behind it but the HSE forecast pipeline. It is not scheduled
here. It enters through the Suite roadmap first as an app programme with
its engine, and the course follows afterwards under the N5+ doctrine. The
rule that decides this, and the one worth protecting above the course
count, is in section 13: no course ships whose capstone cannot be graded
from an extracted engine.

## 13. Non-goals

- No course before its engine is extracted with a golden and an oracle.
- No new Monte Carlo or NPV implementation. The canonical modules are
  named in CLAUDE.md and in ReservoirEngineering-Module.md section 5.
- No shallow tiers. Every course is deep at all three.
- No engine change without a golden and an oracle. A defect a course
  finds goes to petrolord-engines or the Suite as its own PR with its
  own guard.
- The go-lives stay HELD until the deployed site carries the route.

## 14. HSE, path_order 61 onward

Added 2026-09-19, when the owner asked for the HSE courses to be built
from start to finish. HSE was not in this plan when it was written. The
academy has carried an `hse` module label since the taxonomy was drawn,
and no course has ever used it.

### Starting position (H0 audit, 2026-09-19)

Checked read-only against petrolord-hse `f922a3c`, Suite `1275ee922`,
petrolord-engines `5cbdca5` and NextGen `87c265143`.

- **There is no HSE engine anywhere.** petrolord-engines has no
  `engines/hse`. The nearest code is `assurance/riskScoring.js`, a 5x5
  matrix already graded by `riskchange`, and EC6's `hseCalculations.js`,
  which counts risks by band. Dispersion, blast, probits, LOPA, SIL,
  individual risk, noise dose, exposure TWAs, WBGT and incident rates are
  all absent.
- **There is no app a learner could be sent to.** The Suite has no HSE
  module and links out to hse.petrolord.com. The HSE product persists
  real records, but it has no exposure hours, so it cannot compute any
  frequency rate, and no measurement fields, so it cannot compute any
  exposure. Its arithmetic is ad hoc (a health "risk score" of
  `10 + 5*conditions + 10*exposures + 2*absenceDays`, an environmental
  compliance percentage less five points per spill). It has no tests.
- **Parts of the HSE product invent their numbers.** The incident trend
  in `IncidentsAnalytics.jsx` is drawn from `Math.random()`.
  `benchmarkingService.js` falls back to hardcoded benchmarks (TRIR 1.2
  against 2.8) when its table is empty. `benefitsData.js` advertises a
  Carbon Calculator and Scope 1/2/3 calculators that do not exist. These
  are fixed in the app programme below, before any course points a
  learner at the product.
- **Some HSE ground is already taught and graded.** API 521 point-source
  flare and pool-fire radiation and the setbacks built on it (FC1, FC5).
  The 5x5 risk matrix (`riskchange` on the 15/10/5 bands; EC6 teaches a
  second scale at 20/12/6). BTEX, oil in water and tank breathing (FC4,
  FC7, FC8). Emissions and GHG inventory belong to MD5 `carbon`.

### Roster

Five courses. Each one is a professional subject with published worked
examples that an independent oracle can reproduce, and none of them
re-grades a live course's fields.

| wave | slug | course | engine (new) | app home |
|---|---|---|---|---|
| H1 | `safetystats` | Safety Performance Statistics & KPIs | `engines/hse/safetyStats` | HSE product |
| H2 | `hygiene` | Occupational Hygiene: Noise, Chemical & Heat Exposure | `engines/hse/exposure` | HSE product |
| H3 | `lopa` | Process Safety: LOPA & SIL Determination | `engines/hse/lopa` | Suite HSE module |
| H4 | `consequence` | Consequence Modelling: Releases, Dispersion, Fires & Explosions | `engines/hse/consequence` | Suite HSE module |
| H5 | `qra` | Quantitative Risk Assessment | `engines/hse/qra` | Suite HSE module |

- **H1** covers incidence and frequency rates on the OSHA/BLS 200,000
  hour and IOGP million-hour bases, FAR, severity, the rolling
  twelve-month rate (sum then divide, never the mean of monthly rates),
  exact Poisson intervals, comparing two rates, and u-charts for rates
  over varying exposure. The API RP 754 process safety event rate is
  covered as a rate only, with tier taken as an input.
- **H2** covers OSHA 1910.95 noise dose and TWA and the NIOSH criterion,
  LEX,8h, hearing protector derating, chemical 8-hour TWA, STEL and the
  1910.1000(d)(2) mixture index, Brief and Scala shift adjustment, and
  WBGT with the NIOSH heat criteria.
- **H3** covers LOPA mitigated frequency against a tolerable target,
  required risk reduction to SIL band, and PFDavg for 1oo1, 1oo2 and
  2oo3 with common cause and proof-test interval.
- **H4** covers source terms, Gaussian plume dispersion, solid-flame pool
  and jet fires, TNT equivalence and multi-energy blast, and probits. It
  grades none of the point-source radiation outputs FC1 and FC5 already
  grade.
- **H5** covers event trees, individual risk, PLL, FAR, F-N curves
  against criterion lines, ALARP and ICAF. It is built after H4 because
  it consumes H4's probits. Any discounting imports the canonical NPV
  module.

Not courses, and why: risk matrices and qualitative bow-ties duplicate
`riskchange` and EC6. Management systems, audits, permit to work,
investigation and behavioural safety have no deterministic engine and
duplicate `compliance` and `riskchange`. Emissions belong to MD5. The
HSE product's AI forecast is a language model and cannot be graded.

### DECISION, 2026-09-19: apps split by fit

The section 12 doctrine holds here as it did for Assurance: a course
follows an app with its engine, and the academy does not teach from a
screen that invents its data. The owner chose where the apps live:

- **H1 and H2 go into the HSE product**, which already holds the
  incident and health records. It gains exposure hours and exposure
  measurements, calls the vendored engines, and loses the invented
  numbers listed above.
- **H3, H4 and H5 form a new Suite HSE module** beside Facilities, built
  on the same pattern as the other Suite modules. Tiles and pricing rows
  are migrations and follow the database rules in CLAUDE.md.

### Order, per course

1. Engine in petrolord-engines with goldens from published worked
   examples, an independent Python oracle, a negative control and a
   FINDINGS record.
2. The app, calling the vendored engine.
3. The course wave on the section 11 shape, go-live HELD until the
   route serves.

H1 and H2 run first because their mathematics is closed form and
publicly tabulated. H3 follows, then H4, then H5.

**Licensed material is cited, not copied.** ACGIH TLVs, API RP 754
threshold quantities and IEC 61508/61511 tables are not embedded in any
engine, golden or lesson. Examples use OSHA and NIOSH public values, and
a licensed table enters only as a user input.

### Status, 2026-09-21: all five courses built and merged, go-lives HELD

| wave | engine | app | course (NextGen) | migrations |
|---|---|---|---|---|
| H1 `safetystats` | engines #216, #222 | HSE product #13 (Safety Statistics) | #173 | `20261003_h1_safetystats_*` |
| H2 `hygiene` | engines #217, #220 | HSE product #15 (Occupational Hygiene), #17 re-vendor | #174 | `20261004_h2_hygiene_*` |
| H3 `lopa` | engines #218 | Suite #536 PS1 LOPA & SIL Studio | #175 | `20261005_h3_lopa_*` |
| H4 `consequence` | engines #223 | Suite #539 PS2 Consequence Studio | #177 | `20261006_h4_consequence_*` |
| H5 `qra` | engines #230 | Suite #548 PS3 QRA Studio | #178 | `20261007_h5_qra_*` |

Each course has 78 lessons and 396 questions across the three tiers,
18 graded fields, three key-truth audits against the engine (no mis-keyed
question in any tier), and a five-migration ladder whose go-live is HELD
until a NextGen production upload serves its route. Every apply script
verifies against NextGen main `d54538463`.

Scope as built differs from the roster above in two places. H4 dropped
jet fire and multi-energy blast (engines #223 does not compute them, and
the PS2 tile text was corrected), and it grades no inverse of the normal
distribution, because the engine's approximate inverse misses by about a
thousand tolerances at one percent. H5 takes every probability of death
and frequency as a stated input, so it re-grades nothing H4 grades.

engines #231 (own-property preset lookups) closed a defect class found
while building H5: a preset name such as `constructor` resolved to an
inherited member and fell through to the safe side of a threshold. The
Suite (#548), the HSE product (#17) and NextGen (#176) carry the repair,
except two NextGen files held until a copy pass (`facilities/corrosion.js`,
quoted by the live FC9 exam, and `hse/exposure.js`, whose line count the
H2 digest prints).

Owner steps, all owner run: the Process Safety migrations (PS0 seed and
PS1 to PS3 tables and tiles, per MIGRATIONS.md), the Suite and HSE
product uploads, then per course `apply_hN_<slug>.sh dryrun` and seed,
and each go-live only after the NextGen upload serves its route.

## 15. Data & AI, path_order 66 onward

Section 12 left Data & AI unscheduled because nothing stood behind it.
The owner asked for a scope on 2026-09-23 and accepted every
recommendation below the same day. The academy label already exists
(`data_ai: 'Data & AI'` in NextGen `src/lib/academyModules.js`, unused),
and the NextGen landing page already advertises an "Oilfield Data & AI
Studio" and a "Production Forecasting ML Workbench" as coming soon.

### Starting position (D0 audit, 2026-09-23)

Heads read: Suite main `359d56694`, engines main, NextGen main (#252),
HSE main (#20).

- **The Suite has no real machine learning.** Every ML or AI
  classification feature is a mock, an orphan or both:
  `src/services/ml/mlService.js` (predict returns `Math.random()`, no
  importers); the `'ml'` method in `src/utils/anomalyDetectionCalculations.js`
  (a simulated Isolation Forest on `Math.random()`, no importers);
  `src/utils/wellCorrelationAI.js` (a moving average, no importers);
  `src/config/llm-config.json` and `src/config/earthmodel-phase4-config.js`
  (menus for things that do not exist); `@tensorflow/tfjs` in the stale
  nested `src/package.json`, imported nowhere.
- **One piece is worth salvaging.** `src/utils/logFaciesCalculations.js`
  holds real k-means, hierarchical and SOM code, untested and orphaned
  (its route redirects to Petrophysics Studio). It is the starting point
  for the D3 engine, rebuilt behind an oracle, not vendored as is.
- **False AI copy on live screens.** Analog Finder ("AI-powered", results
  from templated fields and `Math.random()`, route still served without a
  guard although the tile was archived in G0), Contour Map Digitizer
  ("AI-powered digitization", there is no AI in it), the Geoscience Hub
  facies line, the Core Annotator empty state, Resources, the Machine
  Learning help article and Risk Analysis ("predictive analytics").
- **Real language-model features:** the Seismolord copilot (no tests),
  Report Autopilot and the petrophysics scan reader. The HSE forecast is
  a language model's answer and, like the others, cannot be graded.
- **What the academy already teaches** and this module must not repeat:
  regression and fit quality (dca, welltest, scal, fluid, intervention,
  esp), history matching (mbal, sim), Monte Carlo and P-labels
  (uncertainty, dca, portfolio), kriging and map cross-validation
  (earthmodel, sim, mapping), Poisson statistics and control charts
  (safetystats), Bayes and value of information (decision), linear
  programming (crude), lags and moving averages (surveillance,
  waterflood).
- **What nobody teaches and no engine computes:** clustering, PCA,
  classification, model validation (train and test splits, k-fold), and
  data-driven forecasting. Each needs a new engine with a golden and an
  oracle before a lesson is written (section 13).

### Roster

| wave | course | teaches | engine | Suite app |
|---|---|---|---|---|
| D1 `dataqc` (66) | Oilfield Data Quality | completeness, validity and consistency scores; outliers by MAD, IQR and Mahalanobis distance; sensor and rate anomaly detection; unit and datum checks; duplicates | `engines/dataai/quality.js`, reusing petrophysics conditioning | Data Quality Studio |
| D2 `mlcore` (67) | Machine Learning on Well Data | features and scaling; train and test split and k-fold that hold out whole wells; ordinary, ridge and logistic regression; RMSE, confusion matrix, F1, ROC AUC; overfitting and leakage; missing-log prediction | `engines/dataai/ml.js` | ML Workbench |
| D3 `facies` (68) | Electrofacies | PCA; seeded k-means++ and hierarchical clustering; elbow and silhouette; kNN and decision-tree classification against core facies | `engines/dataai/cluster.js` | Electrofacies Studio (reads the wells registry) |
| D4 `forecastml` (69) | Data-Driven Production Forecasting | exponential smoothing (simple, Holt, damped) with parameters fitted by SSE; rolling-origin backtests; MAPE, sMAPE and MASE; Arps as the baseline, taken from dca and not re-taught; bootstrap intervals on the canonical seeded generator | `engines/dataai/forecast.js` | Production Forecasting ML Workbench |
| D5 `appliedai` (70) | Applied AI and Language Models | copilots, retrieval, prompts, hallucination, governance; graded only on the deterministic half: TF-IDF and BM25 retrieval, precision@k, MRR, nDCG on a fixed judged set, extraction accuracy on labels, calibration (Brier score, reliability) | `engines/dataai/evaluate.js` | AI Evaluation Studio |

Roster amended 2026-09-25 to match what shipped: D4 as planned listed
"feature regression". It was not built into `engines/dataai/forecast.js`
or the Production Forecasting ML Workbench; regression on features
(ordinary and ridge least squares, with whole-well splits) is covered by
D2 and the ML Workbench, so D4 teaches the smoothing methods, the
backtests, the metrics, the Arps baseline and the bootstrap intervals.

Course shape as HSE: three tiers, about 78 lessons and 396 questions,
one capstone per tier. No capstone field is ever graded from language
model output.

Order: D1 and D2 first (D3 and D4 reuse D2's validation and metrics),
then D3, D4, D5.

### DECISIONS, 2026-09-23 (owner accepted every recommendation)

1. **Roster: the five courses above**, path_order 66 to 70.
2. **App home: a new Suite Data & AI module** holding Data Quality
   Studio, ML Workbench, Electrofacies Studio, Production Forecasting ML
   Workbench and AI Evaluation Studio. The module needs a catalogue
   migration and a `pricing_config.module_pricing` row; the price is the
   owner's to set when the first app ships.
3. **D5 is engine-first.** The AI Evaluation Studio engine is
   deterministic; a language model is an optional, metered helper on the
   existing OpenAI key and is never graded.
4. **Datasets: the Ekene synthetic field by default.** Public sets (Volve,
   the Kansas facies contest data) only after their licences are checked
   and recorded.
5. **Analog Finder is not coming back.** It has no analog database to
   stand on, real analog matching needs a licensed field database we do
   not hold, and similarity ranking is taught in D3 as kNN on data we
   own. D0 deletes its route (the old URL redirects to the Geoscience
   hub) and its files.

### Order, per course

D0 first: remove the false AI copy, delete the mock and orphaned ML code,
retire Analog Finder, and align the NextGen landing tile with this
roster. Then per course, as HSE: engine (stdlib-only Python oracle,
golden, negative control; for the learning engines also a pinned
scikit-learn reference as a second witness, the way `lib/stats` is
pinned to simple-statistics) -> app -> course, go-live HELD until the
deployed site serves the route. Determinism is designed in, not patched:
seeded initialisation on the canonical generator, a fixed PCA sign
convention and a stated tie-break for tree splits, so each capstone has
exactly one right answer.

## 16. Catalogue regroup, 2026-09-26 (pointer)

The owner's decisions of 2026-09-26 are recorded in
NextGen-Catalog-Regroup-PLAN.md, which is the plan of record for them:

- the `commercial_trading` module is relabelled Midstream & Downstream and
  `economics` is relabelled Economics & Commercial (labels only, slugs
  unchanged, no migration);
- three course types (App, Engine and Practice), amending "one app = one
  course" in NextGen-Academy-PLAN.md section 1;
- an upstream commercial track of five engine courses under Economics &
  Commercial;
- a five-course Supply Chain & Logistics roster.

The naming decision in section 12 (one Midstream & Downstream module with
Supply Chain as a course title inside it) is superseded for Supply Chain:
Supply Chain & Logistics stands as its own module. The new courses come
after D5 in section 15, with path orders continuing after 70.
