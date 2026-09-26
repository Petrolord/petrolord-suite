# Fluid Systems Studio: senior test T1

- App: Fluid Systems & Flow Behavior Studio (`/dashboard/apps/reservoir/fluid-systems-studio`)
- Wave / position: Wave 2, #18 (Senior Testing Programme)
- Build tested: main a01f01cd6 (after Wave 1)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: PVTsim, PVTi, Multiflash, PROSPER PVT
- Coverage before T1: FS1 to FS8 (207 harness gates, 288 EOS tests), ET3 lab tuning

## Verdict

**Demo-ready after T1.** The defaults are right: Standing Pb 2,998 psia and
Bo 1.372 rb/STB for 32 API, 650 scf/STB, gas gravity 0.75 and 200 F match a
hand calculation (2,996 psia, 1.3716). One correlation was broken: Glaso Rs
used a non-standard form that returned about 6 scf/STB at 3,379 psia where
Glaso's own Pb correlation gives 650. The app flagged it ("non-standard,
verify") rather than fixing it. Nothing warned when an input left a
correlation's data range. At 1366 px an empty right rail squeezed the
results so KPI values ran out of their cards.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| FS-T1-001 | S1 (for Glaso users) | Glaso Rs about 100 times low; Pb solved on it meaningless | Glaso Rs now from the canonical engine (`engines/fluid/blackOil.glasoRs`), which inverts Glaso's Pb exactly; "verify" label and warning removed; Glaso joins the Rs(Pb) consistency gate |
| FS-T1-002 | S2 | No warning outside a correlation's published data range | `correlationRangeWarnings` for Standing, Vasquez-Beggs, Glaso (GOR, T, API, gas gravity) in the results banner |
| FS-T1-003 | S2 | Empty 24 rem right rail and its toggle (shared `StudioLayout`; also SCAL and Material Balance) | The layout renders no right rail or toggle when none is passed |
| FS-T1-004 | S3 | KPI values overflowed six narrow cards | Three across below 2xl; values do not wrap |
| FS-T1-005 | S3 | Pressure axis ticks 15, 1,515, 3,015, 4,998; Pb label clipped | Round ticks from zero; Pb label inside the plot |
| FS-T1-E1 | Enhancement | EOS tuning to lab data beyond ET3 (regression on CCE/DL) | After NAPE |

Duplicate implementation noted: `src/utils/pvtCalculations.js` still carries
Standing and Vasquez-Beggs beside the engine's `blackOil`; both agree with
hand values, and consolidation is recorded for after NAPE.

## Tests

`fluidStudioCalculations.test.js` (Glaso hand-derived case: Rs(3379 psia) =
650.4; Glaso in the Rs(Pb) gate; range warning on and off), Fluid jest 432,
`e2e/fluid-systems-t1.spec.js`.
