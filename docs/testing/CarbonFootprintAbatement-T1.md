# Carbon Footprint & Abatement: senior test T1

- App: Carbon Footprint & Abatement Studio (`/dashboard/apps/midstream-downstream/carbon-footprint-abatement`)
- Wave / position: Wave 2, #31 (Senior Testing Programme)
- Build tested: main plus Wave 2 PRs #654 to #658
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: McKinsey-style MAC curves, API Compendium inventories, Sphera / Enablon carbon screens
- Coverage before T1: DS9 build (engine gated), page jest

## How it was tested

A new harness, `/dev/carbon-footprint-abatement`, runs the app on the
in-memory Supabase double. I walked the default inventory and the four
abatement measures across both tabs at 1366 x 768, then checked the
figures by hand.

## Verdict

**Not Demo-ready before T1: one S2 on the first screen; now Demo-ready.**
The numbers are right:

| Figure | Hand calculation | Result |
| --- | --- | --- |
| Combustion | 620,000 kmol x 1.12 x 44.01 | 30,560 tCO2e |
| Heaters, at 10% | (20,000 x CRF(5) - 150,000) / 900 | -160.8 $/t |
| Steam traps | same method | -154.2 $/t |
| Heat integration | same method | -14.8 $/t |
| Flare recovery | same method | 60.3 $/t |
| Net annual cost | | 123,225 (8.1 $/t) |
| Target path | 30 percent off 30,560 | 21,392 by 2032, first short in 2028 |

The first chart on the page, "Where the emissions are", was empty: no
bars and no value axis. Its rows carried `tCo2e` but the Bar read `tCO2e`.
The MAC curve drew four equal-width bars. That is not a MAC curve: the
reader could not see that flare gas recovery is 9,000 of the 15,300
tonnes.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CARBON-T1-001 | S2 | Emissions-by-source chart drew nothing (data key misspelt) | Key fixed, value axis with grouped ticks and title |
| CARBON-T1-002 | S2 | MAC curve drawn with equal-width bars | Variable-width curve: each block spans its cumulative abatement, height is cost per tonne, numbered to the table; round y ticks |
| CARBON-T1-003 | S3 | 48 tooltips in 35 files across the Suite spread `TOOLTIP_STYLE` onto `<Tooltip>` as props (ignored by Recharts, so the default tooltip showed) | `contentStyle={TOOLTIP_STYLE}` everywhere, plus a guard test that fails on any spread |
| CARBON-T1-E1 | Enhancement | No harness | `/dev/carbon-footprint-abatement` |

## Tests

- `e2e/carbon-abatement-t1.spec.js`: one emissions bar drawn, MAC costs,
  and block widths in proportion to the tonnes.
- `src/components/charts/__tests__/tooltipStyleProp.test.js`: it failed
  on the 35 files before the fix.
- Carbon and chart jest: 24/24 pass.
