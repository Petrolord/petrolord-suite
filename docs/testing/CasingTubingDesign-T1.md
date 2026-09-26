# Casing & Tubing Design Studio: senior test T1

- App: Casing & Tubing Design Studio (`/dashboard/apps/drilling/casing-tubing-design-pro`)
- Wave / position: Wave 3, #39 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #664 to #666
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Landmark StressCheck, WellCat, API TR 5C3
- Coverage before T1: D6 build (API TR 5C3 against oracle goldens), human tester feedback (moderate)

## How it was tested

The existing `/dev/casing-tubing` harness loads the golden two-section
9-5/8 in design on the slant trajectory, with a 3.5 in tubing string. I
walked all five tabs at 1366 x 768.

## Verdict

**Demo-ready after T1 (no S1).** The ratings are right. API Barlow burst
for 47# P-110 is 0.875 x 2 x 110,000 x 0.472 / 9.625 = 9,440 psi, and for
53.5# L-80 it is 7,927 psi.

The screen around the verdict failed the user:

- **An unexplained FAIL.** The header read "Design Status FAIL" next to
  "Governing burst SF 1.21", and every casing KPI cleared its factor. The
  failure was a tubing packer seal stroke. The only warning messages
  printed "FAIL under Injection (buckling none, packer SF 2.91)", which
  names two quantities that pass and omits the one that fails.
- **Clipped tables at 1366.** Section tables clipped columns and shrank
  depth inputs to three characters.
- **A crushed Tubing tab.** Its own two 300 px columns inside the page's
  two side panels left the results about 160 px wide.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CT-T1-001 | S2 | Tubing FAIL warnings did not state the failing check (a seal-stroke exceedance read "buckling none, packer SF 2.91") | Each FAIL states its reason: tubing movement against the packer seal stroke, or packer load above rating |
| CT-T1-002 | S2 | The header FAIL gave no reason while the governing burst SF beside it passed | The header names where the failure is and how many checks fail, with the messages on hover |
| CT-T1-003 | S2 | Casing section and results tables clipped at 1366 (collapse column cut; depth inputs "165", "300") | Tables scroll horizontally; inputs keep a readable width |
| CT-T1-004 | S2 | Tubing tab results column about 160 px at 1366 (charts cut) | Below 2xl the packer panel moves into the centre flow; the tubing sections table scrolls |

## Tests

- `e2e/casing-tubing-t1.spec.js`: fail reason in the header and the
  warnings, burst 9,440, input width, and the inline packer panel.
- The existing `casing-tubing-studio.spec.js` (6 tests) still passes.
- C&T jest: 25/25 pass.
