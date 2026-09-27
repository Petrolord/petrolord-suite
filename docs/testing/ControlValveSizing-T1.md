# Control Valve & Choke Sizing: senior test T1

- App: Control Valve & Choke Sizing (`/dashboard/apps/facilities/control-valve-sizing`)
- Wave / position: Wave 5, #56 (Senior Testing Programme; facilities and process safety)
- Build tested: main 1b9f43ce2 plus #684
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: IEC 60534-2-1 / ISA-75.01 sizing, Fisher Control Valve Handbook, API RP 14E velocity limit
- Coverage before T1: engine goldens (controlValve.js); no human walk

## How it was tested

I used `/dev/facilities/control-valve` at 1366 x 768. The default case is
liquid, SG 0.85, 200 to 150 psia, with 150/500/750 gpm (Pv 5, Pc 3,200)
through a cage-guided globe (F_L 0.9, x_T 0.75) with equal-percentage
trim. I also checked gas service (0.65 gravity, 150,000/500,000/750,000
scfh). I walked sizing, and control and noise.

## Verdict

**Demo-ready after T1. It was S2 before, because the default valve could
not do its own duty.**

- Liquid:
  - Cv = 500 x sqrt(0.85/50) = 65.19, and 97.79 at 750 gpm;
  - F_F = 0.96 - 0.28 sqrt(5/3,200) = 0.949, so the allowable dP is
    0.81 x (200 - 4.74) = 158.2 psi;
  - sigma = 195 / 50 = 3.90;
  - authority = 50 / 120 = 0.417.
- Travel, equal percentage with R = 50: x = 1 + ln(Cv/Cv_rated) / ln 50.
- Gas: F_k = 1.28/1.4, x_T 0.75 and Y = 1 - 0.25/(3 x 0.686) = 0.878,
  so Cv = 500,000 / (1,360 x 200 x 0.878 x sqrt(0.25/(0.65 x 560 x 0.95)))
  = 77.9 (77.80 shown). Not choked, as shown.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CV-T1-001 | S2 | The default valve (rated Cv 100 on a 4 in outlet) failed its own duty on first open: 89.1% travel at normal, 99.4% at maximum, and outlet velocity at 138% of the RP 14E limit. The studio flagged all of it correctly, but the case every visitor sees was a wrongly sized valve. | The default is now rated Cv 150 on a 6 in outlet: travel 47.9 / 78.7 / 89.1%, verdict "workable", and 8.3 ft/s (61% of the limit). |
| CV-T1-002 | S3 | In gas service the sizing note said the boundary moves with "the vapour pressure ... or a lighter crude". | For gas it names the terminal pressure-drop ratio (x_T). |
| CV-T1-003 | S3 | Engine notes started lowercase ("authority between..."). Gas flow inputs clipped "150000" to "15000(". | Notes capitalise their first letter; compact flow inputs. |

## Tests

- `e2e/control-valve-t1.spec.js` checks:
  - Cv, the allowable dP, 78.7% travel and "workable";
  - the capitalised note;
  - gas Cv 77.80 and the gas-specific note, with no crude text.
