# Rock Physics Studio: senior test T1

- App: Rock Physics Studio (`/dashboard/apps/geoscience/rock-physics-studio`)
- Wave / position: Wave 1, #7 (Senior Testing Programme)
- Build tested: main after Risked Reserves T1 (#635)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Hampson-Russell AVO modelling, RokDoc fluid replacement, Petrel quantitative interpretation
- Coverage before T1: G6 oracle-locked engines (Batzle-Wang, Gassmann, Zoeppritz, Shuey, Aki-Richards, wedge), RP0 to RP2

## Verdict

**Demo-ready after T1.** The physics checks out against the goldens and an
independent check (the 25 Hz wedge's maximum constructive interference at
15.6 ms continuous, 16 ms at 1 ms sampling, matches the app). The defects
were in reading: the velocity log plot drew depth increasing upward, the
gas velocity showed a dash, and the legends sat on the axis titles. The
parity gap was the workflow the app exists for: fluid replacement AVO. The
app substituted fluids and computed AVO, but never showed the two together.

## Scorecard (before, after)

| Dimension | Before | After | Why |
| --- | --- | --- | --- |
| Technical correctness | 5 | 5 | Oracle-locked; tuning checked independently |
| Industry parity | 3 | 4 | Fluid replacement AVO added; no angle-gather synthetic yet |
| Workflow and UX | 3 | 4 | Log plot reads the right way; unphysical scenarios explained |
| Data interoperability | 4 | 4 | Registry wells in, substituted logs published |
| Outputs and reporting | 3 | 4 | Legends clear of axis titles; charts export without animation frames |
| Robustness | 4 | 4 | Engine throws on unphysical input; the AVO panel now says why |
| Performance | 5 | 5 | Instant |
| Learnability | 4 | 4 | Guide covers fluid replacement and depth tuning |

## Findings

### S2 majors

**RP-T1-001 Velocity log plot drew depth increasing upward.** A vertical
recharts layout already runs a numeric Y axis top-down; the extra
`reversed` flipped it.

**RP-T1-003 No fluid replacement AVO.** The Fluids panel substitutes and the
AVO panel models an interface, but nothing showed the interface with the
substituted rock: the "what would this gas sand look like wet" question.

### S3 minors

**RP-T1-002** Gas Vp showed a dash; sqrt(K/rho) is known (about 570 m/s at the defaults).
**RP-T1-004** Legends overlapped the x-axis titles on the log and AVO plots.
**RP-T1-005** Tuning thickness in time only; the tuning-curve y label clipped.

### Enhancements beyond parity

| ID | Idea | Outcome |
| --- | --- | --- |
| E1 | Fluid replacement AVO (curve, A/B, class, crossplot point) | Built |
| E2 | Tuning thickness in depth from a wedge Vp | Built |
| E3 | Angle-gather synthetic for the interface | After NAPE |
| E4 | Background (wet) trend on the intercept-gradient crossplot | After NAPE |

## Outcomes (all batches built, 2026-09-26)

| Finding | Outcome |
| --- | --- |
| 001, 002, 004 | Axis direction fixed; gas Vp from K and rho; legends on top |
| 003 / E1 | `substitutedHalfspace` (same Gassmann as the Fluids panel, oracle log-domain golden reproduced) and the amber replaced interface in the AVO panel; an unphysical fluid A is reported with the reason |
| 005 / E2 | `vpWedge` and `tuningDepthM`; label fixed |

Found while testing E1: the AVO result memo omitted its new dependency, so
the replaced curve never appeared after Apply. The e2e now drives the
scenario change, so the gap cannot return unnoticed.
