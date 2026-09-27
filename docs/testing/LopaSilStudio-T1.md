# LOPA & SIL Studio: senior test T1

- App: LOPA & SIL Studio (`/dashboard/apps/process-safety/lopa-sil-studio`)
- Wave / position: Wave 5, #69 (Senior Testing Programme; process safety)
- Build tested: main e4a9fbca2 plus #695 to #697
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: CCPS LOPA (2001), IEC 61511 low-demand SIL bands, IEC 61508-6 Annex B PFDavg
- Coverage before T1: 202 LOPA and process-safety tests; no human walk

## How it was tested

I used `/dev/facilities/lopa` at 1366 x 768 with the example scenario, a
separator overpressure:

- initiating event 0.1/yr, TMEL 1e-5/yr, occupancy 0.5;
- a PSV credited at PFD 0.01, and an operator response not credited;
- a SIF of 1oo2 transmitters, a 1oo1 PLC and a 1oo1 valve.

I walked the worksheet, SIF verification and proof test interval.

## Verdict

**Demo-ready after T1 (no S1 or S2).** I checked these numbers by hand:

- LOPA: 0.1 x 0.5 x 0.01 = 5.0e-4/yr. RRF 5e-4 / 1e-5 = 50, so the
  required PFDavg is 0.02 (SIL 1).
- SIF:
  - valve 1oo1: 2e-6 x 8,760/2 + 2e-6 x 24 MRT = 8.81e-3;
  - PLC: 5e-9 x 4,380 + 5e-7 x 8 = 2.59e-5;
  - total: 6.82e-5 + 2.59e-5 + 8.81e-3 = 8.90e-3, which is SIL 2 and
    meets 0.02;
  - mitigated: 5e-4 x 8.9e-3 = 4.45e-6/yr, which meets the TMEL.
- Proof test: the longest valve interval to the valve's share
  (0.02 - 9.42e-5 = 0.0199) is 19,858 h (2.27 yr). Linear in T1, so
  0.0199 / 8.81e-3 x 8,760 h is consistent.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| LOPA-T1-001 | S3 | The proof test chart's time axis printed "0.08333333333333333" and "2.0833333333333335". The PFD axis mixed "1.0e-3" with "4.0e-4". | Whole-year ticks from 0; decade PFD ticks (0.1, 0.01, 0.001, 0.0001). |
| LOPA-T1-002 | S3 | An uncredited layer read "not flagged independent (independent must be true to take credit)", flag language. The low-demand notice appeared twice on the SIF tab. | "Not credited: tick Independent once the layer is shown to be independent of the initiating event and of the other credited layers" (and the same for Auditable). The notice shows once, at the top. |

## Tests

- `e2e/lopa-sil-t1.spec.js` checks:
  - the LOPA chain and the mitigated frequency;
  - the plain credit reason and the valve PFD;
  - one notice, and clean proof-test axes.
- LOPA and process-safety jest: 202 pass, with the smoke test updated to
  the new reason wording.
