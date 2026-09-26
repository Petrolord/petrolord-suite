# Artificial Lift Advisor: senior test T1

- App: Artificial Lift Advisor (`/dashboard/apps/production/artificial-lift-designer`)
- Wave / position: Wave 4, #44 (Senior Testing Programme; production)
- Build tested: main ec45ddcff (Wave 3 merged)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: PIPESIM / Prosper artificial lift screening, SPE lift selection matrices (Clegg, Brown)
- Coverage before T1: engine goldens for the four design chains; no human walk

## How it was tested

Wave 4 adds a shared harness at `/dev/production/:app`. It runs any
Production studio on the in-memory Supabase double, over a seeded po_*
spine (`src/dev/productionSpineSeed.js`) with one field and three wells:

- HP-1: oil, 1,200 exp(-0.002 t) stb/d, water 20% rising 0.1% a day,
  GOR 800.
- HP-2G: gas, 5,000 exp(-0.0015 t) Mscf/d.
- HP-3I: water injector, 2,000 stb/d.

The seed has 180 days of history, monthly tests, a three-day deferment,
allocation factors and saved well models. Every figure can be checked by
hand. I walked the advisor's own default well (400 bbl/d liquid at 60% water,
GOR 400, composite IPR with Pr 2,400, Pb 1,800 and PI 0.8) at 1366 x 768.

## Verdict

**Demo-ready after T1. It was S1 before, because the rod pump was declared
workable at 43% of the target.**

- AOF: q_b = 0.8 x 600 = 480, so q_max = 480 + 0.8 x 1,800 / 1.8 =
  1,280 stb/d.
- Rod pump, after the fix: 0.1166 x 2.25^2 x 73.9 in x 11 spm x 0.9 =
  432 bbl/d of liquid, which is at least 90% of 400.
- Gas lift: 616 stb/d lifted with 500 Mscf/d at 7,000 ft. ESP: works.
  Jet pump: screening only, as the card says.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| AL-T1-001 | S1 | The rod ladder compared pump displacement (liquid) with the oil design rate. A 1.75 in rung lifting 173 bbl/d of liquid, 69 stb/d of oil at 60% water, was reported as "Works" against a 400 bbl/d target. | Fixed in the engine (petrolord-engines #269) and vendored (a37d31d). Rungs are judged liquid against liquid, and the chain still gets the oil rate for intake and gas. The oracle and goldens were regenerated, and item 19's oil-basis selection is kept as `resultAtOilTarget`. Negative control: the old comparison turns 5 tests red. The advisor now picks 2.25 in x 86 in at 11 spm (432 bbl/d liquid). The figure reads "bbl/d liquid". |
| AL-T1-002 | S2 | Method cards used two figure columns. At 1366, "the packer or the traverse..." ran off the card, and "74.3 % of Goodman" printed over the next label. | One column below 2xl, with values wrapping right-aligned. |
| AL-T1-003 | S2 | "Apply latest test" wrote the test's OIL rate into the target field, which holds LIQUID. At HP-1's test (about 1,180 stb/d oil at 21% water) the target read about 1,180 instead of about 1,500 bbl/d. | Writes oil plus water. The notice says "target rate (liquid)". |
| AL-T1-004 | S3 | The summary showed the liquid target as "400 stb/d". | "400 bbl/d, liquid at 60 percent water, 160 stb/d of oil". |
| AL-T1-005 | S3 | Hero copy used "--" as dashes. Long IPR model names wrapped inside the select, in the shared production well-model panel. | Reworded; select labels truncate on one line. |
| AL-T1-006 | S4 | Engine text "the packer or the traverse, not the pressure" uses the "X, not Y" form. | Recorded for the engines repo (gas lift `limitedBy` text). |

## Tests

- `e2e/artificial-lift-t1.spec.js` checks:
  - the liquid label and the AOF;
  - the rod rung and 432 bbl/d liquid after "Design them all";
  - that no figure grid overflows.
- Engines: `production.liftadvisor.test.js` 65/65, and the full engines
  suite 230/230.
- Vendoring guard: clean against a37d31d (1,049 paths).
