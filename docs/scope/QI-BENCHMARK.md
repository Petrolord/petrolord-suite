# QI open-dataset benchmark (Volve and F3)

Status: DRAFT, updated 2026-10-15. F3 ran on the live worker (suite-dda896acd,
before the P1 redeploy); Volve is still downloading on the owner's side. Plan of record:
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
| F3 Demo post-stack seismic, as "F3 Dataset sliced" on Kaggle (f3_dataset.sgy, 699,003,060 bytes, SEG-Y rev 1, format 3 (16-bit integer), 462 samples at 4 ms from 4 ms, 600,515 traces, inlines 100 to 750, crosslines 300 to 1250; inlines 701 to 750 are partial) | Downloaded by the owner on 2026-10-15 into `/srv/qi-benchmark/f3/raw/` | Creative Commons BY-SA 3.0 (dGB Earth Sciences and TNO) | "F3 Demo seismic: dGB Earth Sciences and TNO, Creative Commons BY-SA 3.0 (via the Kaggle dataset "F3 Dataset sliced"). We thank dGB Earth Sciences for making the data available via their TerraNubis portal terranubis.com." Derived products stay under CC BY-SA. |
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
- **F3 seismic (2026-10-15, owner download).** The Kaggle copy of the dGB
  F3 Demo stack. Header check: the textual header gives inline at byte 9 and
  crossline at byte 21, both also at the rev 1 bytes 189 and 193 (used);
  X and Y at 73/77 and 181/185 with scalar -10; corners 100/300 =
  (605835.5, 6073556.5), 100/1250 = (629576.25, 6074220), 750/300 =
  (605381.8, 6089799.5), which agree with the NLOG survey grid within about
  25 m, so the CRS is ED50 / UTM 31N (EPSG:23031). 651 inlines x 951
  crosslines is 619,101 positions; the file has 600,515 traces because
  inlines 701 to 750 hold only 571 to 666 traces each (crosslines 451 or 664
  to 1250). The file is inline-sorted. The first sample is at 4 ms (byte 109,
  textual card 37); see finding F-5.
- **F3 seismic from NLOG (blocked, 2026-10-14).** NLOG streams Z3NAM1989E-2 as a zip built on the
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

### 3b. F3 run on the dGB stack (2026-10-15, worker suite-dda896acd+engines-eab475c0d)

1. **Import with crop** (server path, CRS declared EPSG:23031, refit into the
   QA project CRS EPSG:32631): inlines 200 to 750 x crosslines 300 to 1050,
   the whole 0 to 1844 ms. 460.2 MB cropped file uploaded in 88.9 s;
   stack_to_v4 converted 395,379 traces (the irregular inlines 701 to 750
   kept as holes), 1870 bricks, 336.6 MB float and 163.1 MB display copy
   (job 2349b31b, 269 s end to end). Volume "BENCH F3 stack (dGB, wells
   area)" 73aaccdb in the QA account (kept for the post-redeploy rerun).
2. **Seismic QC** (job 742d22bf, 30 s):

   | Window (ms) | Peak (Hz) | -6 dB band (Hz) | Centroid (Hz) | S/N (median) |
   |---|---|---|---|---|
   | 0-616 | 60.3 | 19.0-79.1 | 44.4 | 2.1 (3.2 dB) |
   | 616-1232 | 60.1 | 36.5-68.0 | 47.5 | 19.5 (12.9 dB) |
   | 1232-1848 | 41.8 | 5.0-64.2 | 34.3 | 10.5 (10.2 dB) |

   No acquisition footprint (largest share 0.029). One issue: low
   signal-to-noise 0 to 616 ms. The dGB stack has dGB's dip-steered median
   filter, so it is cleaner than the raw NLOG cube above 1 s (S/N 19.5
   against 5.1 to 8.1).
3. **Wells on the volume.** With the wells in the project CRS (NLOG's own
   WGS 84 / UTM 31N coordinates; finding F-2) the app places F02-01 at
   inline 362 crossline 336, F03-04 at 442 / 1007 and F03-02 at 723 / 848,
   exactly dGB's published well positions. F06-01 is refused: "The impedance
   log covers fewer than 32 samples of the volume" (its density starts at
   1836 m, below the 1848 ms record). Usable impedance samples: F02-01 402,
   F03-04 340, F03-02 65.
4. **Well ties** (Seismolord's automatic tie, engines autoTie: statistical
   wavelet, bulk shift and constant phase; sonic-integrated time-depth):

   | Well | Whole log | MD 900-1900 m | MD 1200-2000 m | MD 500-1900 m |
   |---|---|---|---|---|
   | F02-01 | 0.28 (-28.9 ms) | 0.45 (-29.1 ms) | 0.53 (-28.3 ms, phase -4) | 0.35 |
   | F03-04 | 0.25 (-31.9 ms) | 0.34 | 0.42 (+36.9 ms, phase -3) | 0.24 |
   | F03-02 | 0.36 (+19.2 ms) | 0.54 | 0.41 | 0.54 (-7.4 ms, phase -10) |

   Every tie is poor or fair (the app's bands: good 0.7, fair 0.5). The
   shifts disagree in sign between wells and move with the window, which is
   the sonic drift (18 to 27 ms over 1.5 km at F03-04) that a bulk shift
   cannot take out; the shallow section (300 to 1300 m) ties at 0.16 to
   0.24. Fair ties need stretch and squeeze (finding F-4) or measured
   checkshots.
5. **Post-stack inversion, blind check** (poststack_inversion blind mode,
   Ricker 35 Hz, default settings, three wells; OLD blind protocol, because
   the worker is not redeployed: each well leaves the low-frequency model
   only, the wavelet scale uses every well):

   | Run | Wavelet scale | F03-04 blind corr / AI error | F03-02 | F02-01 |
   |---|---|---|---|---|
   | Model-based, sonic time-depth (job 8f9ea66d) | -348 | 0.30 / 5.7e29 percent | 0.04 / 1.9e47 | 0.04 / 6.1e47 |
   | Blocky (job 4c7a277d) | -348 | 0.30 / 1.6e54 | 0.04 / 1.6e65 | 0.04 / 5.4e59 |
   | Coloured (job abdb7cea; correlation only) | n/a | -0.16 | 0.25 | -0.27 |
   | Model-based after committing the windowed ties (job 3b592169) | -2901 | 0.09 / 29,424 | 0.02 / 2.4e6 | 0.10 / 2.1e6 |
   | Coloured after the ties (job 35d3b77f) | n/a | -0.27 | -0.06 | -0.18 |

   The absolute inversions diverge (finding F-3): the trace amplitudes are
   16-bit integers (RMS about 2545, peak 15692 at F03-04), so a reflectivity
   series needs a scale of order 10^4 to 10^5, but the least-squares scale at
   poorly tied wells shrinks towards zero (-348, then -2901). The inverted
   reflectivity is then tens of times too large and ln(AI) overflows. The
   run "succeeded" and reported these errors without a warning. The volume
   run was cancelled (job d6b549c8, removed by the worker) and porosity was
   not run, because it needs a trustworthy AI volume.
6. **Steps that wait for the worker redeploy** (merged on main, not live):
   the truly blind protocol (P1.2: the held-back well also leaves the wavelet
   scale), NTG and Sw (P1.3), seismic residual volumes and the density gate
   (P1.4), maps from volumes (P1.5). Rerun:
   `/srv/qi-benchmark/kit/run.sh plan-f3-inv.json ...` after the redeploy,
   with better ties first.

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
- **F-2 (CRS, harness and a guard to add).** The seismic import refits a
  volume declared in EPSG:23031 into the project CRS (EPSG:32631 in the QA
  account). Well Data Manager's LAS door also places wells into the project
  CRS, but the harness first saved the wells in EPSG:23031 untransformed, and
  QI Studio's `prepareWell` compares well XY with the volume frame without
  checking the tags: every well landed 8 inlines (about 212 m) north, ties
  fell to 0.2 and the inversion compared the wrong traces. Fixed in the
  harness (NLOG's WGS 84 / UTM 31N coordinates, EPSG:32631). Suggested guard
  (QIStudio `services/inversionWells.js`): refuse or transform a well whose
  CRS tag differs from the volume's.
- **F-3 (inversion, for the QI lead; `services/inversionRun.js`).** No guard
  on the wavelet scale or the result. With poorly tied wells the
  least-squares scale shrinks (regression dilution) and the model-based and
  blocky inversions overflow (blind AI errors of 1e29 to 1e65 percent) while
  the job reports success. Repro: QA volume 73aaccdb, wells F3 F02-01,
  F03-02, F03-04 with their sonic time-depth, method model_based, Ricker
  35 Hz, defaults (job 8f9ea66d). Suggested: report the synthetic-to-seismic
  correlation behind the scale and refuse (or warn) below about 0.3; flag a
  blind error over 100 percent, or any non-finite AI, as a failed check.
- **F-4 (ties).** The automatic tie is a bulk shift and a constant phase.
  With a sonic-only time-depth it cannot follow drift, so F3 ties stay at
  0.42 to 0.54 in the best window. The tie warp (multi-anchor stretch and
  squeeze, engines `tieWarp.js`) exists for manual anchors; an automatic
  windowed warp would make the benchmark repeatable.
- **F-5 (time origin).** The dGB stack's first sample is at 4 ms (trace byte
  109 and textual card 37). Seismolord takes sample 0 as 0 ms, so the volume
  sits 4 ms early; the tie shift absorbs it, but the import does not say so.

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
| A (Package 1) | Full Package 1 on an open dataset | Partly. Inventory inputs, wells, CRS placement and seismic QC pass on F3. Ties FAIL the quality bands (best 0.42 to 0.54, fair at most) with a sonic-only time-depth. Feasibility and the report not run |
| B (post-stack study) | Blind wells and prospect table on an open dataset | FAIL on F3 with the live worker: the absolute inversion diverges (F-3); coloured blind correlation -0.27 to 0.25. Rerun after the redeploy, the F-3 guard and better ties |
| C (prestack study) | Blind-well error in published ranges, AVO class at known wells | Not yet (Volve needed) |

## 7. Limits

- Time-depth is sonic-integrated until a tie is committed (drift 18 to 27 ms
  below 1.5 km at F03-04).
- F03-02 and F06-01 have no density in the shallow section; their
  impedance starts at 1641 m and 1836 m.
- F02-01 is deviated (about 68 m offset at TD); the import treats it with no
  deviation survey (the NLOG deviation file was not loaded).
