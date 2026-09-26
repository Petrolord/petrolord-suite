# Choke & Wellhead Performance Studio: senior test T1

- App: Choke & Wellhead Performance Studio (`/dashboard/apps/production/choke-performance-studio`)
- Wave / position: Wave 4, #45 (Senior Testing Programme; production)
- Build tested: main ec45ddcff plus #672
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Prosper / PIPESIM choke models, Gilbert (1954), API RP 14E
- Coverage before T1: Suite choke gates and engine wellhead limits; no human walk

## How it was tested

I used `/dev/production/choke` on the seeded spine at 1366 x 768. The
defaults: 32/64 bean, 150 psia line, GLR 600, 20% water, and an oil well
with Pr 3,200, Pb 2,200 and PI 1.5. HP-1's seeded tests now carry bean
sizes and tubing head pressures that sit exactly on Gilbert, so a
coefficient fit has a known answer.

## Verdict

**Demo-ready after T1. It was S2 before, because the bean saw a fifth too
little liquid and the tubing a fifth too little gas.**

- Gilbert: Pwh = 10 x 600^0.546 x q_liquid / 32^1.89 = 0.4698 q_liquid.
  The 1,112 stb/d of oil at 20% water is 1,390 bbl/d of liquid, and
  0.4698 x 1,390 = 653 psia, which matches the screen.
- Fit to the six seeded tests: c 9.992, m 0.5461, n 1.8900, miss 0.0%.
  The residual on c comes from rounding the seed pressures to 0.01 psi.
- Critical limit: the 64/64 bean sits at a ratio of 0.543 (critical) and
  68/64 is subcritical, so "critical up to 61/64" is consistent.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CH-T1-001 | S2 | The operating-point solve used one q three ways. Gilbert read it as gross liquid, while the tubing and the oil IPR read it as oil. The GLR was also handed to the tubing as a GOR, and the erosion check used oil x GLR for the free gas. At 20% water that is a fifth too little liquid through the bean and a fifth too little gas in the tubing. The rate moved from 1,141 to 1,112 stb/d of oil. | q is oil throughout. The bean sees q / (1 - wct), the tubing gets GOR = GLR / (1 - wct), and the free gas is liquid x GLR minus oil x Rs. The result carries `qLiquid`, and the screens show "Oil rate" with the liquid through the bean. |
| CH-T1-002 | S2 | A large bean (96/64 and above) produced an "operating point" with the wellhead below the 150 psia line (139 psia), which is impossible. | Refused with a reason: the bean no longer restricts, the line sets the rate. |
| CH-T1-003 | S2 | Coefficient fit chart ticks printed float noise ("1911.679972059474", "344.223"). The legend sat on the axis title. | Span rounded outward to 100 psi with integer ticks, plus the legend band. |
| CH-T1-004 | S3 | GLR labelled "scf/stb" (it is per barrel of liquid). The fit table said "Liquid (stb/d)", printed "-0.0 %", and wrapped dates. The target rate did not say it is oil. | "scf/bbl liquid", "Liquid (bbl/d)", 0.0 %, dates on one line, "Target oil rate". |
| CH-T1-005 | S3 | At 1366 the long studio title pushed the header off screen, clipping the back button and icon. "Run envelope" and "Size the bean" wrapped inside their buttons. "critical limit" was clipped. | The shared StudioHeader truncates the title (full title on hover) and keeps the controls fixed. Buttons stay on one line, and the label sits inside the plot. |

## Harness

`src/dev/InMemorySupabase.jsx` now supports PostgREST many-to-one embeds
with `!inner` and dotted filters (`.eq('po_wells.field_id', …)`), and
`range()` offsets. The 18 Wave 2 T1 specs pass on it.

## Tests

- `e2e/choke-performance-t1.spec.js` checks the oil and liquid rates, the
  fit recovering Gilbert, clean ticks, no "-0.0 %", and the critical limit.
- `choke.test.js`: Gilbert is checked on `qLiquid`, plus a new
  dry-versus-wet basis test and a below-line refusal. The critical-limit
  test extends to 80/64. The production and contexts jest run is 1,575
  pass.
