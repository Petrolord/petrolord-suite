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

| wave | slug | course | engine modules |
|---|---|---|---|
| MD1 | `crude` | Crude Assay & Blending | crudeAssay, productBlending |
| MD2 | `refinery` | Refinery Feasibility & Planning | modularRefinery, refineryPlanning, simplex |
| MD3 | `supply` | Terminals, Depots & Fuel Supply | terminalDepot, fuelPricing |
| MD4 | `gasvalue` | Flare Gas to Value & LPG/CNG | flareToValue, lpgCng |
| MD5 | `carbon` | Carbon & Energy Efficiency | carbonAbatement, energyEfficiency |

## 8. Economics (EC1-EC6), path_order 53 to 58

Gated on extracting the cash flow engine out of the edge function.

| wave | slug | course | Suite apps |
|---|---|---|---|
| EC1 | `cashflow` | Cash Flow & NPV | Petroleum Economics Studio |
| EC2 | `fiscal` | Fiscal Regime Design | Fiscal Regime Designer |
| EC3 | `uncertainty` | Probabilistic Economics | Probabilistic Breakeven, NPV Scenario Builder |
| EC4 | `decision` | Decision Analysis & Value of Information | Decision Studio, Decision Tree Builder, VOI Analyzer |
| EC5 | `portfolio` | Capital Portfolio & Cost Control | Capital Portfolio Studio, AFE Cost Control |
| EC6 | `fdp` | Field Development Planning | FDP Accelerator, Project Management Pro, Report Autopilot |

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

## 13. Non-goals

- No course before its engine is extracted with a golden and an oracle.
- No new Monte Carlo or NPV implementation. The canonical modules are
  named in CLAUDE.md and in ReservoirEngineering-Module.md section 5.
- No shallow tiers. Every course is deep at all three.
- No engine change without a golden and an oracle. A defect a course
  finds goes to petrolord-engines or the Suite as its own PR with its
  own guard.
- The go-lives stay HELD until the deployed site carries the route.
