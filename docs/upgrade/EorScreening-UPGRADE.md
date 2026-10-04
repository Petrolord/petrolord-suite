# EOR Screening: upgrade (Reservoir round, app 11)

Branch `feat/eor-u1`, worktree `/root/wt-res-eor`, started 2026-10-04 at
origin/main 534a12b5a. Plan: `docs/scope/AppUpgrade-Reservoir-PLAN.md` row 11.
Lens: PL1 to PL12 (`docs/scope/AppUpgrade-BestPractices.md`) and RL1 to RL12
(`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`). Finding IDs
`EOR-U1-nnn`, severities S1 (wrong answer a user would trust) to S4 (cosmetic).

Route `/dashboard/apps/reservoir/eor-screening` (+ `/help`), page
`src/pages/apps/EorScreeningTool.jsx`, engine
`src/utils/eorScreeningCalculations.js` (not in the canonical engines repo,
so no engines PR), harness `/dev/studio/eor`.

## 1. Validation sources (PL1)

The criteria were read against the papers as printed, from the PRRC copies
(New Mexico Petroleum Recovery Research Center, the authors' institute):

| Ref | Edition | Pages | What the engine takes from it |
|---|---|---|---|
| Part 1 | Taber, Martin and Seright, "EOR Screening Criteria Revisited, Part 1: Introduction to Screening Criteria and Enhanced Recovery Field Projects", SPE Reservoir Engineering 12 (3), August 1997 (SPE-35385-PA) | 189-198; Table 3 on p. 191 | Every limit of eight methods (Table 3, "Summary of screening criteria for EOR methods"); notes b, c, d; the underlined project averages (context only); the 13 API Turkish immiscible project (p. 192) |
| Part 2 | Taber, Martin and Seright, "EOR Screening Criteria Revisited, Part 2: Applications and Impact of Oil Prices", SPE Reservoir Engineering 12 (3), August 1997 (SPE-39234-PA) | 199-205; Tables 3 to 5 on pp. 200-201 | CO2 miscible minimum depth by oil gravity (Table 3); "sandstones preferred", "< about 9,000 ft", "< 200 F" for the chemical floods (Table 4); polymer "can be used in carbonates", "< 200 F" (Table 5); four successful polymer projects (Table 5) |

What the code said before this round: "Tables 1-3" of a single paper. The
summary is Table 3 of Part 1; Table 1 there is the list of methods. The
depth-by-gravity table the summary points to ("see Table 3 of Ref. 16") is
in Part 2 and was not applied.

Printed oddities, read and recorded rather than silently corrected:

| Where | As printed | Read as | Why |
|---|---|---|---|
| Part 1, Table 3, micellar/polymer depth | "> 9,000 \ 3,250" | < 9,000 ft | Part 2, Table 4: "< about 9,000 ft"; the arrow points down |
| Part 1, Table 3, micellar/polymer temperature | "> 200 \ 80" | < 200 F | Part 2, Table 4: "< 200" |
| Part 1, Table 3, polymer temperature | "> 200 \ 140" | < 200 F | Part 2, Table 5: "< 200 to minimize degradation" |
| Part 2, Table 3, CO2 bands | "> 40" then "32 to 39.9" | 40.0 API in the 2,500 ft band | 40.0 sits in neither printed band; the lighter band is the paper's direction |

Not encoded: surface mining (a mining method, outside an in-situ screen),
and composition (the app has no composition input; the guide is printed
and the criterion says it is not screened).

## 2. Step 1 checks

(filled below as the work goes)

## 3. Findings

| ID | Sev | Check | Finding | Fix | Test |
|---|---|---|---|---|---|
