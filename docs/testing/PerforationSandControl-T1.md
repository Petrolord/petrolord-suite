# Perforation & Sand Control Designer: senior test T1

- App: Perforation & Sand Control Designer (`/dashboard/apps/drilling/perforation-sand-control`)
- Wave / position: Wave 3, #41 (Senior Testing Programme; drilling)
- Build tested: main plus Wave 3 PRs #665 to #668
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Schlumberger SPAN, Baker Hughes SandCADE, Halliburton perforating software
- Coverage before T1: D8 build (Karakas-Tariq skin, Saucier gravel and critical drawdown against oracle goldens)

## How it was tested

The `/dev/perforation-sand-control` harness loads the golden 2,450 to
2,550 m interval on Harness-8P with a nine-point sieve, a 2-1/8 in
through-tubing gun, and the golden 3-1/2 in completion. I walked the
interval, perforating, sand control and sanding tabs at 1366 x 768.

## Verdict

**Demo-ready after T1 (no S1).** I checked these numbers by hand:

- Karakas-Tariq total skin: 0.125 + 0.383 + 0.289 + 1.173 = 1.970.
- Productivity ratio: ln(re/rw) = ln(300 / 0.10795) = 7.93, and
  7.93 / (7.93 + 1.970) = 0.801.
- Run-in clearance: (2.635 - 2.125) in x 25.4 = 13.0 mm diametral, at the
  XN nipple.
- Saucier band: 5 to 6 x D50 of 113 um = 564 to 676 um. That selects 20/40
  mesh (420 to 841 um, pack D50 631 um). A 16 thou (406 um) gauge is below
  the smallest grain.
- Slot window: D10 to 2 x D10 = 296 to 592 um.
- C_u: D40 / D90 = 138 / 45 = 3.07.
- Sanding margin: 23.20 - 17.20 = 6.00 MPa (870 psi) at 2,450 m.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| PS-T1-001 | S2 | The underbalance guideline showed 500 to 1000 psi, but the sanding drawdown margin is 870 psi. Surging at the top of the band would start sand production, and the card did not give a number. | The card compares the band with the margin and states the cap: "keep the underbalance below about 870 psi". Two other wordings cover a margin above the band and rock already past onset. |
| PS-T1-002 | S2 | The Saucier gravel band never drew on the PSD chart because it is coarser than the largest sieve size. | The chart extends to include the band, labelled "Saucier gravel band 564 to 676 um". |
| PS-T1-003 | S3 | On the sanding model, the cavity geometry select ran over the "Strength boost" label. | The geometry row spans both columns. |
| PS-T1-004 | S3 | The PSD and critical drawdown charts: the axis labels overlapped the legend. The MPa axis did not start at 0, so the drawdown margin read short. | Legend band and label height as in the chart standard. The MPa axis starts at 0. |
| PS-T1-005 | S3 | "Clearance" did not say it was diametral. | "Diametral clearance", matching Completion Design. |

## Tests

- `e2e/perforation-sand-control-t1.spec.js` checks the gravel band label,
  13.0 mm clearance, PR 0.801, the 870 psi cap, and that the geometry select
  sits clear of the boost input.
- The existing `perforation-sand-control.spec.js` passes (4/4).
- P&SC jest: 13/13 pass.
