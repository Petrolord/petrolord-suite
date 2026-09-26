# Geomechanics & Wellbore Stability Studio: senior test T1

- App: Geomechanics & Wellbore Stability Studio (`/dashboard/apps/drilling/geomechanics`)
- Wave / position: Wave 3, #38 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #663 to #665
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Techlog Wellbore Stability, JewelSuite Geomechanics, Drillworks
- Coverage before T1: D5 build (1D MEM plus Kirsch stability against oracle goldens)

## How it was tested

The existing `/dev/geomechanics` harness loads the golden MEM on the
registry well GW-1 with published pore-pressure curves. I walked load
curves, build MEM and compute mud window at 1366 x 768.

## Verdict

**Demo-ready after T1 (no S1 or S2).** The numbers are consistent:

- **Tightest window:** fracture initiation 2.22 minus pore pressure 1.18
  gives 1.04 g/cc at TD, and the app reports 1.041.
- **Overburden:** Sv of 58 MPa at 2,600 m TVD is a 2.27 g/cc average
  gradient.
- **Pore pressure:** 30 MPa at TD is 1.18 g/cc.
- **Warnings:** the model's own checks are stated. Four frictional clamps,
  and 23 samples out of normal-fault ordering against the selected NF
  regime.

The mud window chart was hard to read. Near surface, low stresses against
a fixed 1 MPa tensile strength put fracture initiation near 11 g/cc. That
stretched the axis to 12 and squashed the 1 to 2.5 g/cc drilling range
into a fifth of the plot.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| GM-T1-001 | S3 | Mud window axis stretched to 12 g/cc by shallow fracture initiation values, squashing the drilling range | Axis sized on the deeper 80 percent of the well (0 to 4 g/cc here). Shallower values beyond it are clipped, and a note says so (the CSV carries every value). |
| GM-T1-002 | S3 | Depth axes on all three charts started at the first sample (50 or 60 m) with odd ticks; legends over axis titles | From surface; shared legend band |

## Tests

- `e2e/geomechanics-t1.spec.js`: tightest window 1.041, axis at most 5
  g/cc from 0, and the clipping note.
- The existing `geomechanics-studio.spec.js` still passes.
- Geomechanics jest: 7/7 pass.
