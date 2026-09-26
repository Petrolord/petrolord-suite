# Completion Design Studio: senior test T1

- App: Completion Design Studio (`/dashboard/apps/drilling/completion-design`)
- Wave / position: Wave 3, #40 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #664 to #667
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: WellView schematics, Landmark completion design, API 5CT drift tables
- Coverage before T1: D7 build (drift and clearances against oracle goldens; tubing sizing on the production nodal engine)

## How it was tested

The existing `/dev/completion-design` harness loads the golden 3-1/2 in
completion. The string runs from the tubing hanger through the TRSV, side
pocket mandrel, sliding sleeve, 7 in packer, XN nipple, perforated joint
and wireline entry guide, inside 9-5/8 in casing and a 7 in liner. I walked
the builder, schematic, checks and tubing sizing tabs at 1366 x 768.

## Verdict

**Demo-ready after T1 (no S1 or S2).** The numbers are right:

- String capacity: 0.004536 m2 x 2,606 m = 11.82 m3.
- Clearance in the 7 in liner, side pocket mandrel: (6.059 - 5.750) x 25.4
  = 7.8 mm.
- Clearance in the 7 in liner, packer: (6.059 - 5.875) x 25.4 = 4.7 mm.
- Minimum through-bore: 2.635 in at the XN nipple.
- Tubing sizing: the ordering is right (a smaller ID needs a higher flowing
  BHP), and it comes from the production nodal engine.

The defects were in presentation.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| CD-T1-001 | S3 | String and bill-of-materials tables printed stored inches with float noise ("2.9920000000000004", "5.750000000000001", "3.5000000000000004") | Up to 3 decimals ("2.992") |
| CD-T1-002 | S3 | Clearance column did not say it is diametral (drift minus OD) | "Diametral clearance (mm)", with the definition on hover |
| CD-T1-003 | S3 | Tubing sizing correlation picker showed code keys ("beggsBrill") | Correlation names |

## Tests

- `e2e/completion-design-t1.spec.js`: no float noise, the diametral label,
  string capacity, and the correlation name.
- The existing `completion-design-studio.spec.js` still passes.
- Completion jest: 14/14 pass.
