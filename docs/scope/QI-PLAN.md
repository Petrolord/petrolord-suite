# QI Build Programme: PLAN

**Status:** APPROVED by the owner 2026-10-05 ("Plan approved, record it and start Q0").
Progress is logged in `docs/scope/QI-STATUS.md`.


## Context

A client QI scope of work (120 km², six wells, prospect and lead maturation) needs the full
industry QI chain, split into an audit/feasibility package and a main study. A code audit
(2026-10-04) showed:
- **Already strong:** well ties, well-data QC, Gassmann/Batzle-Wang fluid substitution,
  Zoeppritz single-well angle gathers, and post-stack attributes.
- **Missing or weak:** prestack data, seismic QC, conditioning, AVO volumes, inversion,
  Bayesian facies, granular rock physics models, multi-well crossplots, prospect tooling
  and SEG-Y export.

The owner's decision is to build everything in-house; the client will wait rather than see
Hampson-Russell or similar. The intended outcome is a Petrolord QI stack that can deliver
every SOW step, validated to published references, with a first server-side compute worker
for the heavy work.

Owner answers (2026-10-04):
- **Worker host:** a dedicated compute server.
- **Big storage:** prestack and full-resolution data live in worker-side storage.
- **Worker language:** the worker is Node and runs the same vendored JS engines as the browser.

## Locked decisions

1. **New container `seismic-worker`** (serves Seismolord and QI; see Q0b). Node 20, deployed with Docker Compose.
   - **Host (owner, 2026-10-05):** Hostinger KVM 8 running Ubuntu 24.04 (8 vCPU, 32 GB RAM,
     400 GB NVMe), with no control panel or app template.
   - That is enough for Q0, Q0b, Milestones A and B, and one 120 km² client study.
   - Disk is the first limit. The object store speaks the S3 API, so big storage can move to an external
     bucket without code changes.
   - A second worker host can join the queue before Milestone C or large NAPE projects. It copies the sim-worker pattern
   (`worker/sim-worker/`):
   - pull-based polling of a queue table, with a claim by conditional PATCH;
   - a heartbeat every 30 s, `cancel_requested`, and a stale sweep with requeue;
   - a service-role key in an untracked `.env`;
   - `deploy.sh` that runs the test suite inside the image before `up -d`;
   - no inbound ports, except the object store (below).
2. **One copy of the maths.** All new maths goes into the engines repo first
   (`/root/petrolord-engines`, new domain `engines/qi/`, plus extensions to `rockphysics/`
   and `seismolord/`), then is vendored into `packages/engines`.
   - The worker imports the vendored engines directly.
   - The browser runs the same functions for single-trace previews, so a preview equals the
     corresponding trace of the server run, bit for bit.
   - `brickCodecV4` gets `node:zlib` injected on the server, as the tests already do.
   - Heavy loops use `worker_threads` across traces. WASM is allowed later only behind the
     same golden tests.
3. **Storage split.**
   - **S3-compatible object store** on the worker host (SeaweedFS; amended 2026-10-05
     because MinIO no longer publishes community images, so neither `minio/minio` nor
     `quay.io/minio/minio` can be pulled; the plan only depends on the S3 API) on the worker host, behind Caddy TLS, holds raw SEG-Y,
     prestack gathers, full-resolution float volumes and scratch.
   - **Supabase** keeps all metadata and every *browsable* product. The worker publishes
     results into the existing `seismic` bucket as v4 bricks, so the current Seismolord viewer
     shows them unchanged.
   - The worker enforces the seismic quota itself, because the service role bypasses the
     storage policy (`seismic_storage_usage_bytes()`).
4. **Upload path for big files.**
   - A new edge function `qi-upload-url` verifies the user's JWT and issues presigned
     multipart object-store URLs scoped to `{uid}/{dataset_id}/`. The browser uploads straight to
     the object store, and uploads are resumable.
   - A job type `ingest_remote` pulls from a client-supplied HTTPS or SFTP location, because
     clients often deliver data on FTP or disk.
5. **Database.**
   - New product-prefixed `qi_*` tables only. No shared-table changes.
   - Queue writes go only through SECURITY DEFINER RPCs that check ownership, caps and
     in-flight limits, like `sim_enqueue_run`. Clients get SELECT-only RLS on the queue.
   - Org sharing follows `20261002130000_reservoir_record_sharing.sql`.
   - Migrations are applied staging-first and logged in MIGRATIONS.md. Prod applies are run
     by the owner.
6. **Validation-first** (the CLAUDE.md rule; `tools/validation/mbal-validation.ts` is the
   exemplar).
   - Every engine is checked against published known-truth tables and a dev-time Python
     oracle (numpy, segyio, pylops; bruges used only to cross-check constants), with goldens
     committed to `test-data/qi/`.
   - Every gate calls the engine and includes a negative control.
   - Inversion is also gated on synthetic-truth models and blind wells: a match at an input
     well is never accepted as validation.
7. **Product labelling.** Every QI output carries a `qi_class` of `elastic_estimate`,
   `calibrated_prediction`, `interpretation` or `fluid_hypothesis` (the distinction from SOW
   §10). It also carries provenance: job id, parameters, engine commit and input ids.
8. **Platform standards.**
   - Charts use the white chartTheme and ChartLogo.
   - User-facing copy has no em dashes and no "X, not Y" constructions.
   - Stacked PRs, merged on green. Work is staged by path.
   - Per-app STATUS docs are updated as work lands.
   - Monte Carlo goes through the canonical module (`src/lib/monteCarlo.js` /
     ReservoirCalc Pro MonteCarloEngine), never a new implementation.

## Architecture: the QI worker (phase Q0)

**Queue tables**
- `qi_jobs`: `id`, `owner`, `org_id`, `kind`, `params` jsonb, `input_refs` jsonb, `status`
  (`queued`, `running`, `succeeded`, `failed`, `cancelled`), `progress` (0–1 plus message),
  `heartbeat_at`, `attempt`, `cancel_requested`, `result_refs` jsonb, `failure_stage`,
  `error_message`, `engine_commit`, `cost_seconds`.
- Partial index on `status='queued'`.
- **Unlike sim**, the worker writes `progress` at most every 5 s. The client polls every 5 s,
  following `SimStudioContext.jsx`. Realtime is optional later.

**RPCs**
- `qi_enqueue_job(kind, params, input_refs)` validates ownership of every input, the
  per-user limit (2 in flight) and the daily cap.
- `qi_cancel_job(id)`.

**Dataset tables**
- `qi_datasets`: raw and prestack data in the object store. Holds kind (`gathers_offset`,
  `gathers_angle`, `stack`, `partial_stack`), header map, geometry, sort order, fold summary
  and the object store prefix.
- `qi_stack_families`: links partial stacks, vintages and processing versions, with declared
  vs measured angle ranges.

**Worker internals**
- **Job registry:** `kind` maps to a handler module.
- **Trace-parallel executor:** `worker_threads`, N = cores − 2.
- **Trace I/O:** a SEG-Y trace reader that streams from the object store, a gather brick store
  (CDP-sorted chunks, so any single gather can be read) and a v4 brick publisher.
  - Engine functions to reuse: `segyScan.js`, `segyDecode.js`, `brickTranscodeV4.js` and
    `manifest.js` (`buildDerivedManifest`).
- **Limits and cleanup:** per-job resource limits and a scratch tmpfs.
- **Logging and monitoring:** structured JSON logs and a `/healthz` on localhost, with
  uptime monitored by the owner.

**Client**
- `src/lib/qiService.js`, modelled on `src/lib/simService.js`.
- A shared `QiJobsPanel` in Seismolord's RightDock: queue, progress, cancel, logs and open
  result.
- **Fix:** `traceIndex.js` (around l.335) currently collapses duplicate inline/crossline
  traces in silence. It must detect gather files and route them to prestack ingest instead.

**Acceptance (Q0)**
- **Large upload:** a 10 GB SEG-Y uploads through presigned multipart, resumes after a
  browser reload and is registered.
- **Hello job end to end:** a `stack_to_v4` job transcodes a stack on the server and the
  current viewer opens the result. Its bricks match a browser-transcoded copy byte for byte.
- **Failure handling:**
  - Killing the container mid-job leads to a requeue and completion.
  - A cancel stops the job within 30 s.
  - A job over quota is refused with a clear reason.
- **CI:** a new workflow runs the worker's tests, which today run only in `deploy.sh`.

## Phases and milestones

Phases are grouped into three milestones that track the SOW's package order, so the client
can start Package 1 before the prestack work is finished. Q1 and Q2 are browser-side and run
in parallel with Q0.

### Q0b Seismolord moves onto the seismic worker (owner, 2026-10-04)

Clients may arrive with very large projects straight from NAPE. So the worker serves the
whole of Seismolord as well as QI: one container, `seismic-worker`, with QI as one family of
job kinds. Today Seismolord does everything in the browser, which caps it at about a 4.5 GB
soak, 1.5 GB of tab memory and a 20 GiB quota.

- **Ingest.** Any SEG-Y over a threshold (default 2 GB) is uploaded to the object store and transcoded
  by the worker into v4 bricks. Smaller files keep the current in-browser path, so offline
  and small cases still work.
  - Reuses `ingestService.js`, `ingest.worker.js`, `brickTranscodeV4.js` and `uploadV4.js`
    on the server, with the same engine functions.
- **Attributes.** `attributeJobService.js` gets a route choice:
  - full-volume per-trace and neighbourhood attributes (`runVolumeJob`,
    `runNeighborhoodJob`) run as worker jobs;
  - the browser keeps the section previews.
- **Other heavy jobs move to the worker:**
  - fault likelihood and detection (`faultDetect.js`);
  - 3D horizon region growing on big surveys (`regionGrow3D`);
  - Tops-to-Horizons with leave-one-well-out (`topsToHorizonsPipeline.js`, which today is
    capped at 24M samples and 250k traces);
  - depth conversion of volumes;
  - stratal-slice and isofrequency batches.
- **Viewer streaming.** The v4 pyramid already streams display bricks, so 50–200 GB surveys
  become viewable without loading the whole volume.
  - Full-resolution float bricks for very large surveys stay in the object store.
  - A small brick proxy (an edge function or a signed object-store URL) serves them on demand.
- **Quota tiers.**
  - Seismic storage moves from the flat 20 GiB per user to org-level tiers, stored in a
    `qi_`/`seismic_` product table. The quota is enforced in the worker and in the existing
    storage policy for browser uploads.
  - Pricing for large-project tiers is an owner decision (`pricing_config` is the single
    source).
- **Org-scale concurrency.**
  - A per-org job budget, so one huge project cannot starve the others.
  - Horizontal scaling: a second worker host joins by sharing the queue, because the claim is
    the conditional PATCH.

**Acceptance (Q0b)**
- A 50 GB synthetic 3D survey can be ingested from a remote URL, viewed, given attributes and
  tracked, on an 8 GB laptop.
- Server attribute volumes match browser-computed ones byte for byte on the existing goldens.
- Existing Seismolord e2e and jest suites stay green.

### Milestone A: Package 1 ready (data audit and feasibility)

**Q1 Well-side completion (SOW §3–4)**
- **Data inventory register** (`qi_data_inventory`): rows are requested, received, usable,
  missing or outstanding, per data group in the SOW §2 table.
- **Usability matrix** per well and per target, plus a check of seismic acquisition dates
  against drilling and production dates (depletion flag).
- **Log editor:**
  - splice and merge runs; manual and rule edits;
  - an edit ledger, using the `_DS` / `_DIG` provenance pattern
    (`PetrophysicsStudio/services/depthShift.js`, `src/lib/curveNames.js`) and closing RP
    U2-015;
  - sonic drift correction against checkshots.
- **Full elastic set:** Vp, Vs, ρ, AI, SI, Vp/Vs, PR, λρ, μρ, K, μ, EEI(χ) logs.
- **Shear prediction:**
  - a locally calibrated Vs regression by interval and lithology, with prediction intervals;
  - predicted curves carry a σ curve, which flows into modelling.
  - It reuses `rockphysics/vsEstimate.js`.
- **Multi-well elastic crossplot workbench:**
  - any two or three logs, every well and interval;
  - colour by lithology, fluid, well, depth or facies;
  - density and histogram views, and user polygons that become facies labels written back as
    curves;
  - WebGL scatter, removing the 1,500-point cap in `RP/services/crossplot.js`;
  - per-interval population statistics, with a pooling warning when populations differ.

**Q2 Rock physics models and feasibility (SOW §6)**
- **Models:** Hertz-Mindlin, soft sand (friable), stiff sand, constant cement, contact
  cement (Dvorkin), Hashin-Shtrikman bounds, Xu-White (clay pores), and Brie patchy
  saturation. Closes RP U2-006.
- **Calibration:** least-squares fit of model parameters to well data, with residuals.
- **Burial, porosity, shale and cementation sweeps** as RPT templates overlaid on the
  crossplot workbench.
- **Fluid cases:**
  - a three-way brine/oil/gas panel, plus a low-Sw (fizz) gas case shown explicitly next to
    the commercial gas case;
  - fluid properties from Fluid Studio through the existing `src/lib/pvtSource.js` contract,
    removing the hand-typed GOR/API.
- **Modelling realism:**
  - wedge and thin-bed modelling with an extracted or angle wavelet, a band-limited
    (Ormsby/Butterworth) wavelet and additive noise at the measured SNR;
  - stochastic thin-bed models.
- **Scenario Monte Carlo** through the canonical MC module. Closes RP U2-010.
- **Feasibility report per target:**
  - separability metrics per attribute pair (Mahalanobis or Bhattacharyya distance, and
    expected misclassification);
  - detectability against tuning and noise;
  - a recommended route, matching the SOW decision table.
- **Validation:** Mavko *Rock Physics Handbook* worked examples, Avseth et al. (2005) figures,
  Batzle-Wang (1992) tables, and published Castagna & Backus (1993) reflection-coefficient
  tables, which close the self-declared gap in the RP gather amplitudes.

**Q4a Post-stack seismic QC (SOW §3)**
- Amplitude spectra and bandwidth per window and area.
- SNR estimate (trace-to-trace coherency) and noise maps.
- Acquisition footprint (f-k / kx-ky analysis).
- Polarity and phase at wells (existing `estimatePhaseRotation`) mapped field-wide.
- Amplitude consistency maps across vintages.
- **QC report generator** with an issue register (severity and remedy).
- Volume-scale jobs run on the worker; window previews run in the browser.

**Q6a Tie extensions (SOW §5)**
- Multi-well wavelet averaging and comparison.
- Sonic-drift-aware ties.
- A tie report pack (correlation, residual shift, wavelet phase and bandwidth, unresolved
  mismatches).
- Reuses `tieWarp.js`, `autoTie.js` and `lib/wellWavelet.js`.
- Also fixes `RP/services/gather.js` `tieWavelet`, which rebuilds a Ricker wavelet; it should
  use the extracted samples.

**Milestone A acceptance:** the full Package 1 deliverable list in the SOW can be produced
on an open dataset (below), end to end in the Suite.

### Milestone B: post-stack main study

**Q8a Post-stack inversion (SOW §9)**
- **Wavelet manager** (`qi_wavelets`).
- **Low-frequency model builder** (`qi_lfm`): well logs low-passed and interpolated along
  horizons (kriging/IDW from `lib/gridding`), velocity-guided trends, and named alternatives
  for comparison away from wells.
- **Inversions:**
  - coloured inversion (Lancaster and Whitcombe operator from the well spectra);
  - model-based (CG with blocky / total-variation constraints);
  - sparse-spike (L1 / IRLS).
- **QC:** reconstructed seismic and residual volumes, plus seismic-scale log comparison.
- **Automated blind-well runs:** leave each well out of the LFM in turn and report the
  error.
- **Sensitivity sweeps** over wavelet, noise and LFM, giving P10/P50/P90 and spread volumes
  as uncertainty products.
- **Validation:** Marmousi2 elastic model (truth known), pylops oracle goldens, and a blind
  well on the open dataset.

**Q9a Property prediction (SOW §10)**
- Porosity-from-impedance transforms with uncertainty.
- **Bayesian facies:**
  - PDFs (Gaussian or KDE) built from wells upscaled to seismic scale, with priors;
  - outputs are a probability volume per facies and the most likely facies.
  - Every product carries a `qi_class`.

**Q10 Prospect integration (SOW §11)**
- **Closure and spill-point analysis** on depth surfaces: closure polygons, spill point,
  column height, and fill-to-spill vs contact scenarios. It reuses the existing GRV in
  `src/lib/gridding/surfaceExport.js`.
- **Anomaly register** (`qi_anomalies`): polygon, interval, attributes, fit to structure
  (amplitude vs contour), and a list of competing explanations.
- **Per-prospect QI assessment:** exactly the SOW §11 table, with recommendations of mature,
  retain, investigate or downgrade.
- **Evidence-independence tracker:** flags attributes derived from the same response.
- **Absent-anomaly rule:** an absent anomaly lowers confidence only when the Q2 feasibility
  says the case is detectable.
- **Hand-off** of QI constraints into the existing prospect engine (`engines/prospect/`) for
  volumetrics and risking. QI never sets GCoS on its own.

**Q11 Reporting and handover (SOW §12)**
- SEG-Y writer for volumes, angle stacks and inversion products (validated by a segyio
  read-back).
- LAS export of conditioned logs, and wavelet export.
- **Per-job reproducibility manifest:** parameters, engine commit and inputs.
- **QI report pack:** maps and sections with ChartLogo, an executive deck outline, and
  assumptions and limitations.
- `.pld` portability families extended to `qi_*`.

**Milestone B acceptance:** a full post-stack main study on the open dataset, passing blind
wells and the prospect assessment table.

### Milestone C: prestack main study

**Q3 Prestack data (SOW §2–3)**
- **Gather ingest on the worker:** offset or angle headers, sorting, the gather brick store,
  and geometry and fold maps.
- **Gather viewer** in Seismolord: at a CDP, along an inline, at wells; mute overlay.
- **Offset-to-angle conversion** from velocities (straight ray, then curved ray), with angle
  volumes.
- **Usable-angle coverage maps** per target horizon.
- **Partial-stack import as a stack family:** declared vs measured angle ranges, alignment
  checks, and amplitude and phase consistency between stacks.
- **Vintage and processing-version linking.**

**Q4b Prestack QC (SOW §3)**
- Residual moveout measurement, multiple identification, NMO stretch maps and illumination
  and fold proxies.
- Representative gather panels at wells, prospects and poor areas, in the QC report.

**Q5 Conditioning (SOW §7)**
- Residual moveout and trim statics (gather flattening).
- Parabolic Radon multiple attenuation.
- Noise reduction: f-x deconvolution and structure-oriented filtering (the existing
  structure tensor in `structureAttributes.js`).
- Spectral balancing and shaping, and phase/time/amplitude matching between partial stacks.
- Angle stack generation.
- **Before/after measurement** against synthetic gathers at wells, so conditioning is judged
  against the geology and never only by how clean it looks.
- **Pilot-area workflow:** acceptance criteria are recorded before the full run.

**Q6b Prestack ties**
- Angle-dependent wavelets per partial stack.
- Synthetic gathers at wells compared with real gathers (correlation by angle).

**Q7 AVO/AVA (SOW §8)**
- Intercept and gradient volumes (two- and three-term) from gathers or partial stacks.
- I-G crossplot with background-trend fitting.
- Fluid factor (Smith-Gidlow), χ/EEI projections, AVO class maps, and the gather-based
  anomaly check.
- Modelled vs observed I-G at wells and anomalies. Closes RP U2-008.
- Multi-attribute crossplot polygons that highlight volume zones.
- Every attribute is a worker job, and results publish as v4 volumes.

**Q8b Prestack simultaneous inversion (SOW §9)**
- Linearised Fatti or Buland-Omre inversion for AI, SI and density, with an elastic
  covariance prior from the wells.
- Shares the LFM and QC machinery from Q8a.
- Density gets its own reliability assessment: blind-well error and sensitivity to far-angle
  noise.

**Q9b Full property prediction**
- Bayesian facies and fluid classification in AI/SI(/ρ) space.
- Fluid-probability volumes labelled `fluid_hypothesis`.
- Optional geostatistical simulation (sequential Gaussian) for property realisations,
  feeding volumetric uncertainty.

**Milestone C acceptance:** a full prestack study on an open prestack dataset, with blind-well
error inside published benchmark ranges and the AVO class at known wells reproduced.

### Q12 Benchmark, tester waves and NAPE readiness

The programme ends with a run of the whole SOW on the open datasets:
- tester persona walks at 1366x768 (the senior-testing method);
- a user manual and help guides;
- `docs/upgrade/QI-UPGRADE.md`, in the standard format.

## Validation datasets (dev-time, never shipped)

- **Marmousi2 elastic model.** Known truth, used to generate prestack gathers for inversion
  and AVO gates.
- **Equinor Volve open data.** Prestack seismic, wells with shear sonic, checkshots: the
  main real-data benchmark. Licence check is an owner item.
- **F3 Netherlands** (post-stack, sparse wells) as the second post-stack case.
- Poseidon as a reserve prestack set.

## Critical files (representative)

- **New:**
  - `worker/seismic-worker/` (Dockerfile, compose, deploy.sh, src/handlers/*)
  - `supabase/migrations/*_qi_*.sql`
  - `supabase/functions/qi-upload-url/`
  - `src/lib/qiService.js`
  - `src/pages/apps/Seismolord/components/qi/*`
  - `docs/scope/QI-PLAN.md` and `docs/scope/QI-STATUS.md`
- **Engines** (canonical repo first):
  - `engines/qi/`: inversion, LFM, AVO, conditioning, Bayesian, QC spectra
  - extensions to `engines/rockphysics/` and `engines/seismolord/` (traceIndex, SEG-Y writer)
  - goldens in `test-data/qi/`; oracles in `tools/validation/qi/`
- **Extended:**
  - `src/pages/apps/RockPhysicsStudio/` (models, crossplot workbench, feasibility)
  - Seismolord `ViewerPanel.jsx` ribbon and RightDock registration
  - `services/attributeJobService.js` (adds the server route)
  - `src/lib/rockPhysicsGather.js` (v2: tied, time-depth aware)

## Rough effort (focused build, my estimates)

| Block | Phases | Estimate |
|---|---|---|
| Foundations | Q0 | 3–4 weeks, including server provisioning |
| Seismolord on worker | Q0b | 4–5 weeks (right after Q0, before NAPE demand) |
| Milestone A | Q1, Q2, Q4a, Q6a | 6–8 weeks (Q1/Q2 overlap Q0) |
| Milestone B | Q8a, Q9a, Q10, Q11 | 7–9 weeks |
| Milestone C | Q3, Q4b, Q5, Q6b, Q7, Q8b, Q9b | 12–16 weeks |
| Close | Q12 | 2–3 weeks |

The total is about 8–10 months. The container is named `seismic-worker` everywhere: it
serves Seismolord and QI. The client's Package 1 can start once Milestone A lands, at
about month 2–3.

## Owner items

- Provision the dedicated server, plus a DNS name and TLS for the object store. Agree the monthly
  budget.
- Hold the worker service-role key and the object store credentials (edge secret for `qi-upload-url`).
- Data handling for client data under NDA (residency, retention, deletion on handover).
- Licence checks for Volve, F3 and Poseidon use in validation.
- Apply prod migrations and redeploy edge functions; upload prod zips at the milestone ends.

## Verification

- **Per engine:**
  - jest goldens against the Python oracle and published tables, each with a negative
    control;
  - the vendored-engines check passes.
- **Per worker handler:**
  - in-image tests run in `deploy.sh` and in the new CI workflow;
  - the parity test (browser preview trace equals the server output trace);
  - kill/requeue and cancel tests.
- **Per milestone:**
  - the end-to-end run on the open dataset, scripted with Playwright against staging;
  - blind-well error tables recorded in QI-STATUS.md;
  - eslint, the app jest suites and full jest pass;
  - prod build checked for `sw.js` and the manifest.
- **The plan doc** is recorded as `docs/scope/QI-PLAN.md` on a branch and PR when the owner
  approves.
