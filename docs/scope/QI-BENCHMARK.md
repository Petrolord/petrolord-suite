# QI open-dataset benchmark (Volve and F3)

Status: DRAFT, 2026-10-14. Data acquisition is partly blocked (see section 2);
the full workflow runs wait for the owner's downloads. Plan of record:
`docs/scope/QI-PLAN.md` (Milestone A, B and C acceptance and Q12). Progress
log: `docs/scope/QI-STATUS.md`.

Owner clearance (2026-10-07 and 2026-10-14): Volve and F3 may be used for
INTERNAL benchmarking, with each licence's attribution. Neither dataset is
redistributed, shipped in the product, uploaded to the demo account or put in
any public place. All processing happens on the seismic worker host
(`/srv/qi-benchmark/`) with the QA account `qa-seismic@petrolord.com`.

## 1. Datasets, licences and attribution

| Dataset | Source used | Licence | Attribution to print |
|---|---|---|---|
| F3 Netherlands wells F02-01, F03-02, F03-04, F06-01 (LAS: GR, DT, RHOB, DRHO, NPHI; header, coordinates, lithostratigraphy) | NLOG (www.nlog.nl), the Dutch government's public oil and gas portal, which is the original source of the F3 data that dGB packaged | NLOG terms: information may be copied, downloaded, edited and disclosed provided NLOG.NL is quoted as the source | "Well data: NLOG.NL (Netherlands Oil and Gas Portal), TNO." |
| F3 Netherlands 3D post-stack time migration (NLOG survey Z3NAM1989E, collection Z3NAM1989E-2, NAM 1987 acquisition, 6.4 GB) | NLOG; only a partial download was possible (section 2) | NLOG terms, as above | "Seismic data: NLOG.NL; original acquisition NAM." |
| F3 Demo (dGB Earth Sciences, value-added OpendTect project: horizons, AI cube, edited logs) | Not yet obtained (TerraNubis download is captcha-protected) | Creative Commons BY-SA 3.0 | "We thank dGB Earth Sciences for making the data available as an OpendTect project via their TerraNubis portal terranubis.com." Derived products stay under CC BY-SA. |
| Equinor Volve (2008-2016) | Not yet obtained (Equinor's download asks for a human check; the Databricks Marketplace needs a login) | Equinor Open Data Licence | "Contains data from the Volve field, made available by Equinor ASA and the Volve licence partners under the Equinor Open Data Licence." |

## 2. Acquisition log

- **F3 wells (done).** The NLOG borehole REST endpoints serve each well's
  composite LAS, coordinates (ED50 / UTM 31N, EPSG:23031), rotary table
  height and the preferred lithostratigraphy (KARTERING DIEP 2017). Density
  covers 263 m down in F02-01 and 473 m down in F03-04, but only from 1641 m
  in F03-02 and 1836 m in F06-01, as dGB also notes. Coverage:

  | Well | GR | DT | RHOB | NPHI | RT height (m) | Water depth (m) |
  |---|---|---|---|---|---|---|
  | F02-01 | 50-3124 | 263-3120 | 263-3124 | 1650-3124 | 35.9 | 44.5 |
  | F03-02 | 15-2150 | 305-2146 | 1641-2148 | 1641-2147 | 30.0 | 40.4 |
  | F03-04 | 42-3152 | 472-3152 | 473-3155 | 2661-3155 | 34.1 | 41.4 |
  | F06-01 | 49-3526 | 569-3522 | 1836-3534 | 1836-3527 | 28.6 | 43.8 |

  Well positions on the F3 grid (from the survey corners in the NLOG
  metadata): F06-01 inline 244 crossline 386; F02-01 362 / 335; F03-04
  441 / 1006; F03-02 723 / 847.
- **Checkshots: not digital.** The NLOG velocity-survey reports are scanned
  TIFFs. The time-depth used is the sonic integrated from a water column at
  1480 m/s and a ramp from 1600 m/s at the seabed to the first sonic sample,
  stored on each well as its checkshot table with the provenance
  "sonic-integrated". Check against the legible values of the F03-04 survey
  tabulation (observed one-way times doubled, slant uncorrected):

  | MD (m) | Sonic TWT (ms) | Survey 2 x Tobs (ms) |
  |---|---|---|
  | 1300 | 1237 | 1238 |
  | 1500 | 1445 | 1427 |
  | 2700 | 2303 | 2276 |
  | 2900 | 2431 | 2411 |
  | 3030 | 2512 | 2489 |

  The sonic runs 18 to 27 ms slow below 1.5 km (the usual sonic drift). A
  committed well tie in Seismolord (bulk shift and stretch) is needed before
  inversion; the drift-corrected sonic tool (Well Data Manager, Edit logs)
  can take these survey levels once they are typed in.
- **F3 seismic (blocked).** NLOG streams Z3NAM1989E-2 as a zip built on the
  fly, and its gateway closes every download after 30 s (about 365 MB, inlines
  99 to 137 of 99 to 824). It has no byte ranges, so it cannot resume. No
  well lies in those inlines. TerraNubis (dGB) hands off to a captcha-gated
  ShareFile page; Kaggle needs a login; Zenodo (the Alaudah facies benchmark)
  returns 403 to both Petrolord servers. No login or captcha was bypassed.
  Owner asked (2026-10-14) to fetch Kaggle "F3 Dataset sliced"
  (f3_dataset.sgy, CC BY-SA 3.0) or the TerraNubis F3 Demo 2023 zip into
  `/srv/qi-benchmark/f3/raw/`.
- **Volve (blocked).** Owner asked (2026-10-14) for this subset into
  `/srv/qi-benchmark/volve/raw/`: the ST10010 time-migrated full, near, mid
  and far stacks; the RMS or interval velocity in time; LAS with DT, DTS,
  RHOB, GR, NPHI for 15/9-F-1, F-1 A/B/C, F-4, F-5, F-11 A/B, F-12, F-14,
  F-15 A-D; checkshots or VSP; Hugin and BCU horizons.

## 3. What ran (2026-10-14, live Suite with worker suite-dda896acd)

Harness: `tools/qi-benchmark/` (Chromium in the Playwright image on the
worker host, the Suite's own services, the QA account). Results JSON:
`/srv/qi-benchmark/kit/results/`.

1. **Wells into the registry** through the Well Data Manager path:
   F3 F02-01, F3 F03-02, F3 F03-04, F3 F06-01, each with GR, DT, RHOB, DRHO,
   NPHI and PHID (density porosity by dGB's convention,
   (2.65 - RHOB) / (2.65 - 1.05)), group-level zones (Upper, Middle and Lower
   North Sea, Chalk and deeper), and the sonic time-depth. 6.6 s for all four.
2. **Seismic import with a crop** (Seismolord server path) of the partial NLOG
   cube, inlines 99 to 136 x crosslines 1 to 1419, cropped to 0 to 3000 ms:
   174.9 MB uploaded in 17.6 s, converted by stack_to_v4 (53,922 traces,
   648 bricks), job 4f8d646f. Removed after the QC.
3. **Seismic QC** (seismic_qc, job 6d9a1b51, 10 s):

   | Window (ms) | Peak (Hz) | -6 dB band (Hz) | Centroid (Hz) | S/N (median) |
   |---|---|---|---|---|
   | 0-1000 | 58.6 | 22.1-77.5 | 47.5 | 5.1 (7.1 dB) |
   | 1000-2000 | 41.0 | 19.1-63.0 | 36.9 | 8.1 (9.1 dB) |
   | 2000-3004 | 6.5 | 5.2-10.6 | 29.0 | 10.4 (10.2 dB) |

   No acquisition footprint (largest stripe share 0.29 at period 12 along
   inlines, under the 0.3 rule, 3 cycles). Issues raised: narrow band at 2000
   to 3004 ms (medium), dominant frequency falling with depth (low).
   Independent numpy check on 845 sampled traces: peaks 59.8, 7.2 and 6.5 Hz,
   centroids 47.6, 37.2 and 32.3 Hz, so the numbers are right. The deep
   window carries a narrow low-frequency peak (about 7 Hz) above a broad 10
   to 50 Hz band (amplitude ratio 6.5 Hz to 30 Hz is 2.2). See finding F-1.
4. **Wells against the partial volume:** all four refused with "The well is
   outside the survey" (correct: they lie at inlines 244 to 723).

Not yet run (waiting for seismic over the wells): ties, rock physics and
feasibility, inversion with blind wells, properties, and for Volve the
prestack, AVO and simultaneous steps. `plan-f3-full.template.json` holds the
F3 run (crop inlines 200 to 750, crosslines 300 to 1050, 0 to 2400 ms;
model-based and coloured blind checks; volume; porosity 1200 to 2100 ms).

## 4. Findings

- **F-1 (QC, for the QI lead).** The -6 dB band is read around the single
  highest peak. A narrow low-frequency peak above a broad signal band makes
  the band 5.2 to 10.6 Hz and raises "narrow band" while the centroid is
  29 Hz. Suggest reporting the band of the smoothed spectrum, or flagging a
  low-frequency peak separately (engines `qi/seismicQc.js`; issue text in
  `QIStudio/services/qcRun.js`). Not fixed here.
- **F-2 (data).** The import tags a volume with the project CRS
  (EPSG:32631 in the QA account) when the plan does not state one, while the
  F3 coordinates are ED50 / UTM 31N (EPSG:23031). The harness now passes the
  file's CRS; a user importing F3 must choose EPSG:23031 at the CRS step.

## 5. Published results to compare (when the runs exist)

- dGB Earth Sciences, F3 Demo documentation (TerraNubis): porosity of the
  Cenozoic deltaic package 20 to 33 percent; density at F03-04 and F06-01 in
  the demo is neural-network predicted from sonic and gamma ray, so the demo's
  logs differ from the NLOG measured curves used here.
- Alaudah, Michalowicz, Alfarraj and AlRegib (2019), "A machine learning
  benchmark for facies classification", Interpretation 7(3): facies labels on
  F3 inlines 100 to 700 (no well-based inversion figures).
- QI-PLAN acceptance figures apply in the meantime: blind-well correlation
  0.6 or more (high issue below), blind AI error 10 percent or less (medium
  issue above), porosity Q10 to Q90 coverage 60 to 95 percent.

## 6. Acceptance against QI-PLAN

| Milestone | Criterion | Result |
|---|---|---|
| A (Package 1) | Full Package 1 on an open dataset | Not yet: wells and QC done; ties, feasibility and the report need seismic over the wells |
| B (post-stack study) | Blind wells and prospect table on an open dataset | Not yet |
| C (prestack study) | Blind-well error in published ranges, AVO class at known wells | Not yet (Volve needed) |

## 7. Limits

- Time-depth is sonic-integrated until a tie is committed (drift 18 to 27 ms
  below 1.5 km at F03-04).
- F03-02 and F06-01 have no density in the shallow section; their
  impedance starts at 1641 m and 1836 m.
- F02-01 is deviated (about 68 m offset at TD); the import treats it with no
  deviation survey (the NLOG deviation file was not loaded).
