# QI Build Programme: STATUS

Plan of record: `docs/scope/QI-PLAN.md` (approved 2026-10-05).

## Phase status

| Phase | State |
|---|---|
| Q0 Seismic worker foundations | DONE: merged #891 (main 728a53b7e), 2026-10-06 |
| Q0b Seismolord on the worker | DONE: merged #893; both migrations applied and verified 2026-10-06 |
| Milestone A (Q1, Q2, Q4a, Q6a) | DONE: A1 to A6 merged 2026-10-06 (#894, #896 to #901, #903). Acceptance on an open dataset waits for the owner's Volve/F3 licence check |
| Milestone B (Q8a, Q9a, Q10, Q11) | DONE (#904 to #908); worker live. Acceptance on an open dataset waits for the owner's Volve/F3 licence check |
| Milestone C (Q3, Q4b, Q5, Q6b, Q7, Q8b, Q9b) | Q3a DONE (#909), Q3b DONE (#910); worker live. Q7 AVO DONE (#911); worker live. Q7b DONE (#912); worker live. Q8b DONE (#913); worker live. Q9b DONE (#915); worker live. Q6b DONE (#916); worker live. Q4b DONE (#917); worker live. Q5 DONE (#918); worker live (suite-1c4681ed8+engines-d60083a5e, 2026-10-07). Acceptance on an open prestack dataset waits for the owner's Volve licence check |
| QI Studio tile | Own tile `qi-studio`, Geoscience, 1690 a month (migration `20261007130000`, APPLIED 2026-10-07 and verified; the route gate moves to `qi-studio` with the next zip) |
| Q12 Benchmark and tester waves | Tester walk, fixes and close done (feat/qi-q12-close; `docs/upgrade/QI-UPGRADE.md`; `e2e/qi-studio.spec.js`). User manual delivered outside git. Open-dataset benchmark waits for the licence check |

## Key facts

- **Worker host:** Hostinger KVM 8, `seismic-worker.petrolord.com`, 191.215.43.115.
  - Ubuntu 24.04.5, 8 vCPU, 31 GB RAM, 387 GB NVMe, plus 8 GB swap.
  - Root access by SSH key only, from the studio VPS.
- **Object store:** SeaweedFS (S3 API) behind Caddy at `https://storage.petrolord.com`.
  - Buckets: `seismic-raw` (uploads) and `seismic-work` (worker scratch and full-resolution
    data).
  - Two identities:
    - `worker`: full access.
    - `uploader`: read and write on `seismic-raw` only; its keys are the ones the
      `qi-upload-url` edge function will sign with.
- **Credentials:** stored only on the host, in `/opt/seismic-worker/storage/.env` and
  `s3.json`, both mode 0600/0400. They are never in git.
- **Host layout:** `/opt/seismic-worker/storage/` holds `docker-compose.yml` (project
  `seismic-storage`), `Caddyfile`, `.env` and `s3.json`. Data lives in `/srv/seaweed`.

## 2026-10-05: Q0 started

### Server hardening
- **SSH:** password and keyboard-interactive login are off
  (`/etc/ssh/sshd_config.d/00-petrolord-hardening.conf`, sorted ahead of cloud-init's 50-).
  Root login is key only.
- **Firewall:** ufw denies by default and allows only 22, 80 and 443.
- **Services:** fail2ban on sshd (5 tries, 1 h ban), unattended security upgrades, Docker
  json-file log rotation (10 MB x 3), an 8 GB swapfile, timezone UTC.
- Docker 29.8.2 and Compose v5.6.0 came preinstalled from the official docker-ce repository.
- **Verified:**
  - key login works;
  - a password-only login attempt is refused (`Permission denied (publickey)`).

### Object store
- **Decision: SeaweedFS replaces MinIO.**
  - `minio/minio` and `quay.io/minio/minio` can no longer be pulled, because MinIO stopped
    publishing community images.
  - The plan depends only on the S3 API.
  - SeaweedFS 4.48 (530be3e37) is pinned by digest, alongside `caddy:2`, also pinned by digest.
- **Two start-up defects found and fixed:**
  - The image drops to user `seaweed` (uid 1000), which could not read the 0600 `s3.json`, so
    the container crash-looped. Fixed by giving uid 1000 ownership with mode 0400.
  - The raft leader address changed on each restart. Fixed by pinning `-ip=seaweedfs`.
- Caddy obtained a valid TLS certificate for `storage.petrolord.com`.
- **Verified end to end** (all from the host, plus TLS from the studio VPS):

  | Check | Result |
  |---|---|
  | Create `seismic-raw` and `seismic-work` | OK |
  | `uploader` writes a 20 MiB object to `seismic-raw` | OK |
  | `uploader` writes to or lists `seismic-work` | AccessDenied (negative control) |
  | Presigned GET over TLS | Byte-identical, matched by sha256 |
  | Anonymous GET | 403 |
  | Tampered signature | 403 |

### Worker core and queue (PR #891)
- `worker/seismic-worker/` runs on Node 24 LTS. Node 20 reached end of life in April 2026, so
  this is a deviation from the plan's "Node 20".
- The claim is atomic (`qi_claim_job`, FOR UPDATE SKIP LOCKED). Heartbeats carry progress and
  the cancel flag. The stale sweep requeues a lost job, then fails it after 2 attempts.
- Worker terminal writes are guarded on (claimed_by, attempt).
- **Gates:**
  - 21 jest tests. The throttle test was checked against the buggy ordering: 5001 heartbeats
    against 2.
  - 34 database behaviour checks on Postgres 16, with Supabase default privileges mirrored.
  - An in-image selfcheck, which passed on the host.
- **Live dry run:** the qi_jobs migration ran inside a rolled-back transaction: OK, and nothing
  was left behind.

### Uploads
- The `qi-upload-url` edge function presigns with SigV4 on Web Crypto. It reproduces the AWS
  published example signature exactly, with a negative control.
- **Live against SeaweedFS:** a 129 MiB multipart upload, with resume, complete and a
  byte-identical sha256.
- **CORS:** the Suite origins are allowed and `ETag` is exposed; a foreign origin gets 403.
- **Defect found and fixed:** SeaweedFS writes the quotes round an ETag as `&#34;`.
- **Note:** the store's `uploader` identity can also DELETE. This is acceptable: browsers only
  receive URLs signed for one method and key, and the function needs DELETE to abort an
  upload.
- `src/lib/qiUpload.js` resumes after a reload from the server's part list (9 tests).

### Owner setup (DONE 2026-10-05; verified)
`bash /root/qi-q0-owner-setup.sh`:
1. applies both migrations;
2. sets the function secrets;
3. deploys `qi-upload-url`;
4. writes the worker's `.env` on the host.

No secret value is printed.

### Worker live (2026-10-05)
- **Owner setup verified:**
  - both migrations are applied (RLS on, anon 0 grants, clients may enqueue but not claim);
  - `qi-upload-url` is deployed and answers 401 without a JWT;
  - the worker `.env` holds all 8 keys (mode 0600).
- **Deploy gates:** the worker is deployed only through `deploy.sh` (jest, db-tests, then the in-image selfcheck, then health).
- **Defect found on the first deploy:** `docker compose run` swallowed the rest of the remote script, and the script still reported success. Fixed: the selfcheck now runs with `-T </dev/null`, and the deploy fails closed unless the container is healthy.
- **Live queue tests**, enqueued as the owner's account through `qi_enqueue_job`:

  | Test | Result |
  |---|---|
  | 20 s job | succeeded, attempt 1 |
  | Cancel while running | `cancel_requested`, then cancelled at 47% |
  | Requested failure | failed / `requested_failure` |
  | Worker SIGKILLed mid-job, then redeployed | stale sweep requeued it; attempt 2 succeeded |

- **Defect found live:** the last progress message lingered after success. Fixed and confirmed live.

### stack_to_v4: server conversion (2026-10-05)
- **What it runs:** the browser import's own code, in the order of `importJobs.start()`.
- **What the browser keeps:** the steps that need the local file or the user's settings: the scan preview, the fingerprint, the CRS plan, and registering the `converting` row.
- **Service-role guards:**
  - the upload and the volume must belong to the job's user;
  - the volume must still be `converting`;
  - the quota is checked by the new `seismic_storage_usage_bytes_for`. That migration was applied by the owner 2026-10-05 after a live rolled-back dry run.
- **Parity gate (jest):** the browser import manager and the server handler, run on one SEG-Y fixture, store the same objects byte for byte, the same manifest and the same row transitions. One changed input sample breaks the gate (negative control). There are 6 guard tests.
- **Live run:** `dome_ieee.sgy` (511,504 bytes) took 3.9 s. The row went `ready`, with the browser fingerprint and v4 `survey_meta`.
  - It holds 5 stored objects: display copy 7,722 bytes and float32 copy 35,850 bytes.
  - All 5 are byte-identical to a reference conversion using the browser code and native deflate-raw, and identical when decoded.
  - The manifest is v4, display and f32 complete, 32 x 32 x 64.
  - The volume is in the owner's Seismolord as "QI Q0 server conversion test".
- **Codec parity:** Chrome 149 `CompressionStream('deflate-raw')` and the worker's Node 24 give identical compressed bytes on four payloads: a shuffled float32 brick, a u8 display brick, random data and zeros.
  - Server and browser therefore produce byte-identical v4 volumes. This meets the Q0 acceptance item "bricks match a browser-transcoded copy byte for byte".
- **Packaging:** the worker is one esbuild bundle (`build.mjs`) of the deployed commit, 98 modules with no React.
  - `v4SurveyMeta` moved to its own module, re-exported by `importJobs`.

### Seismolord server import, Jobs dock and the 10 GB acceptance (2026-10-05)
- **Import dialog and Jobs dock:**
  - The import dialog offers "Where to convert" and recommends the Petrolord server from 2 GB, or when the browser cannot run the background import.
  - The file uploads first, then the row is registered (`prepareV4Row`), then `stack_to_v4` is enqueued.
  - The Jobs dock tab shows progress, Cancel, and Open once the display copy is up.
- **Live walks** with the QA account `qa-seismic@petrolord.com` (created for automated browser tests; owns no client data), on the dev-only page `/dev/seismolord-server-import`, real project.
- **Small file walk:** fine end to end. Two fixes from it:
  - Start import stayed enabled after an import had started, so a duplicate volume was possible.
  - Sizes under 1 MB read 0.0 MB.
- **Engine finding, fixed** (engines #312, vendored 51f2e9d):
  - The sampled preview scan read each trace header on its own: 30,004 reads for 1,000,000 traces. A Chromium Blob read costs about 45 ms here, so a 10 GB preview took over 20 minutes.
  - It now reads runs: 228 reads, 30 s in Node on this VPS.
  - The browser preview on this VPS still takes 1.5 to 9 minutes, because it reads about 290 MB at about 7 MB/s through Blob under load.
  - Q0b will shrink the 10,000-trace head after measuring on a desktop.
- **Finding, fixed (resume across browsers):**
  - The unfinished upload was remembered only in localStorage, so a fresh browser restarted it at 0 and left orphan parts.
  - `qi-upload-url` `start` now matches this user's unfinished upload by size and sampled content fingerprint and resumes it. The owner redeployed the function 2026-10-05.
  - The two orphan uploads were aborted.
- **10 GB acceptance** (synthetic, 1,000 x 1,000 traces x 2,500 samples, 10,240,003,600 bytes):

  | Step | Result |
  |---|---|
  | Browser A preview | 181 s; server preselected with the 2 GB note |
  | Browser A uploads, then quits | 1.00 GB in 5.7 min |
  | Fresh browser B (new profile) | first progress **1.00 GB of 9.54 GB**: resumed, not restarted; one upload row in the database, with fingerprint |
  | B finishes the upload | 8.5 GB in 45 min (the studio VPS to worker link is about 3.6 MB/s) |
  | Worker conversion | about 12 min. Open was offered from the display copy (84%); ready at 23:01 |
  | Stored volume | v4 manifest, display and f32 complete, 1000 x 1000 x 2500. Display copy 27.2 MB, f32 copy 85.2 MB (the synthetic repeats one shifted template, so it compresses heavily) |
  | Sample check | 30 of 30 samples (corners, centre, 25 random positions, 30 bricks) are exact float matches with the source SEG-Y. Negative control: comparing against the neighbouring trace disagrees in 14 of 25 |

## Q0b: Seismolord on the worker (2026-10-06)

The owner directed on 2026-10-06 that the Q series run non-stop with decisions made along the way. Each decision is recorded here with its reason.

### Q0b-1 Attribute volumes on the worker
- The `attribute_volume` job runs the browser attribute worker's own computation:
  - v4BrickFetcher, then runVolumeJob or runNeighborhoodJob;
  - buildDerivedManifest;
  - the same row metadata, via the shared pure module `attributeSurveyMeta.js`.
- `registerAttributeVolume` was split out, so both routes register rows the same way.
- **Decisions:**
  - The worker reads the parent's stored `manifest.json`, because the composed viewer manifest can exceed the 64 KB settings cap.
  - It runs on the user's own volumes only: the dialog does not offer the server for shared volumes, and the worker refuses them.
  - The server is the default from 1 GiB of output.
  - A failure removes the registered row and anything uploaded.
- **Gates:**
  - Parity with the browser computation, byte for byte, for envelope (per-trace) and variance (neighbourhood), with a one-sample negative control.
  - Guards for ownership, state, quota and cancel with cleanup.
- **Live run:** envelope of the QA dome volume. All 1,024 traces are exact against a local engine recomputation from the stored parent bricks (worst difference 0).

### Q0b-2 Housekeeping
- An upload unfinished 7 days after it starts is aborted.
- A raw SEG-Y is removed 30 days after its upload completed. Converted volumes are never touched.
- **Decision:** 30 days is long enough to reconvert, and the worker disk is the scarce resource.
- It runs between jobs, at most once an hour. It is idempotent and guarded on the status it read.

### Q0b-3 Import from a link
- **Worker:** `ingest_url` streams an https link into a multipart upload, then fingerprints the stored file as the browser does. `scan_dataset` runs the dialog's preview scan on the server.
- **Dialog:** "From this computer | From a link". The remote file is converted on the server.
- **Fetch guard** (SSRF):
  - https on 443 only, with no credentials in the URL;
  - every DNS answer must be public (private, loopback, link-local, CGNAT, metadata, multicast, reserved, IPv4-mapped and NAT64 forms are refused);
  - the connection is pinned to the vetted address;
  - redirects are vetted per hop, 3 at most.
- **Tests:** 38 guard cases; the ingest is byte-exact across 3 parts with the browser fingerprint; every refusal path; scan parity.
- **Live run:**
  - A public link imported as the QA user (14,600 B), then scanned on the server: 5 x 5 traces, 50 samples at 4 ms, 40 text lines, with the zero-coordinate warning.
  - The metadata address and a nip.io name for 10.0.0.1 were both refused (`fetch_refused`).

### Q0b-4 Storage tiers (migration `20261006100000`, APPLIED 2026-10-06)
- A new table, `seismic_storage_tiers`. A user's quota is the largest tier among their active memberships, never below 20 GiB.
- `seismic_storage_quota_bytes()` now returns the caller's quota, so the bucket insert policy follows the tier without a policy change.
- The table ships empty: tier sizes and prices are an owner decision.
- **Gates:** 42 database checks. A live dry run in a rolled-back transaction passed.

### Q0b-5 Preview head (decision: unchanged)
- The 10,000-trace contiguous head keeps a full inline in the preview for surveys up to 10,000 crosslines.
- The converter validates every trace against the predicted grid, so a shorter head could stop a wide survey mid-conversion.
- On an SSD the preview reads its roughly 300 MB in seconds.

### Q0b-6 Fair scheduling (migration `20261006110000`, APPLIED 2026-10-06)
- The claim takes the oldest job of the user with the fewest jobs running.
- **Gate:** db-tests (44 checks). The old oldest-first claim fails the new check.

Both Q0b migrations were applied by the owner on 2026-10-06 and verified live:
- the tier table is present and empty;
- the QA quota is 20 GiB from both functions;
- the claim orders by running jobs, and its index is present;
- clients have no execute grant on the worker-only functions.

The owner approved the tier prices the same day:
- Project: 250 GiB, $99 a month.
- Survey: 1 TiB, $299 a month.
- Basin: 5 TiB, $999 a month, offered once full-resolution volumes move to external object storage.
- Above 5 TiB: $150 per TiB.

The quota is pooled per organisation. Building that is the next item.

## Milestone A

### A1 Rock physics models (2026-10-06)
- **Engines first** (Petrolord/petrolord-engines):
  - #313 granular models with calibration;
  - #314 inclusion models (Berryman P and Q, Kuster-Toksoz, DEM, Xu-White);
  - #315 rock-model template lines.
- **Validation:**
  - Each model has a stdlib oracle with physics anchors, and goldens that regenerate byte-identical.
  - Cross-check with rockphypy: worst difference 2.4e-15 for the granular models and 6e-15 for P and Q. The DEM was checked against scipy odeint to 2e-12.
  - Two rockphypy defects were found and kept as negative controls: its prolate theta, and swapped K and G in EM.DEM.
- **Suite:** the Rock Physics Studio crossplot gets the rock model choice, the parameters and the coordination-number fit (closes RP U2-006).
- **Decisions:**
  - Xu-White uses DEM, never the dilute Kuster-Toksoz, which is 19% off at a porosity of 0.25 with aspect ratio 0.12. KT is kept and throws outside its range.
  - The Xu-White mineral is the Hashin-Shtrikman average, and clay pores take the clay share of the solid.
  - Constant cement defaults to cement of the mineral.
  - Fitting is offered for soft and stiff sand only, the two models with a single free parameter.

### Seismic storage tiers: pricing and pooling (2026-10-06, migration `20261006130000`, owner apply)
- **Pooling:** a tiered organisation shares one pool, the tier plus 20 GiB per active member. Until now each member got the whole tier.
- **Expiry:** an expired tier stops counting. Uploads are refused once usage is over the floor, the data stays readable, and nothing is deleted automatically. Deletion after the 30-day read-only window is a staff step.
- **Catalogue:** a `pricing_config` row, `seismic_storage_tiers`, mirrored in `src/data/pricingModels.js` and `_shared/suite-pricing.ts`. A parity test keeps all three equal.
- **Quote builder:** a "Seismic storage" choice. Basin shows as on request.
- **generate-quote** prices the tier like other storage (full price, then the term, manual and "all" promo discounts) and stores it in `pricing_breakdown.seismic_storage`.
- **Payment:** every rail grants the tier through `upsertSuiteSubscription` until the end of the paid term (`_shared/seismic-storage.ts`), and the subscription's `quote_details` remembers it. `process-subscription-renewals` extends it on each renewal.
- **Seismolord meter:** shows the shared pool ("Storage (shared, Survey)"), and the over-quota message names the organisation's pool.
- **Staff path** for the first customers or a custom size, as the service role: `select public.seismic_storage_set_tier('<org uuid>', 'survey', '<end>'::timestamptz);` For a custom size, pass the tier `'custom'` with a byte size above 5 TiB as the fifth argument.
- **Owner steps:**
  1. Apply the migration.
  2. Redeploy generate-quote, verify-paystack-payment, paystack-webhook, stripe-webhook (if used) and process-subscription-renewals from a clean checkout of main.
  3. Upload the Suite build at the next milestone.

### A2 Elastic set and local shear trend (2026-10-06)
- **Engines #316** (`rockphysics/elasticSet.js`):
  - the elastic set with LMR, EI and EEI;
  - Vs-on-Vp OLS with Student t prediction intervals;
  - a `brineVs` option on `iterativeVs` and `shearForWell`.
- **Validation:**
  - The oracle's anchors include the exact EEI reflectivity identity and the published t table.
  - numpy and scipy agree to 1.5e-12.
  - Negative controls: AI^2 - SI^2, tan^2 in EEI, and a normal quantile in place of Student t.
- **Suite:** the Rock Physics Studio "Elastic logs" view and the local shear trend, as described in RockPhysicsStudio-STATUS.
- **Decisions:**
  - The trend is calibrated on water-bearing samples only, the brine-filled trend Greenberg-Castagna also describes.
  - It is applied only where there is no shear log, so measured and estimated shear are never mixed.
  - EEI references are the zone means.
- **Next in A2:** the multi-well crossplot workbench (WebGL scatter, no 1,500-point cap, polygons to facies curves).
- **A2 multi-well workbench (2026-10-06):**
  - Rock Physics Studio "Multi-well" view, built on Petrophysics Studio's canvas Crossplot. Above 20,000 points it draws batched squares, one path per colour; a test records the canvas calls, with a small cloud as the negative control.
  - Every sample drawn.
  - Per-well and pooled statistics, and a pooling warning (negative control: the same well twice never warns).
  - EEI on one K across the wells; facies polygon counts.
  - **Decision:** canvas batching in place of a WebGL renderer, as recorded in RockPhysicsStudio-STATUS.
  - **Facies write-back:** RP_FACIES on own wells, with provenance (rp-1.3.0).
  - **Provenance fix:** published Vs names the local trend.
  - **Still open:** density and histogram views.

### A3 Log editing (2026-10-06)
- **Engines #317** (`petrophysics/logEdit.js`): splice, interval edits with a ledger, and sonic drift correction.
  - **Oracle:** a synthetic well whose drift is known in closed form (D1-D5).
  - **Closure:** reported, and bounded by half the correction spread times the step.
- **Suite:** the Well Data Manager "Edit logs" panel (details in WellDataManager-STATUS).
- **Decisions:**
  - Results are always new curves (the digitized-curve rule).
  - Drift is integrated on TVDSS with no dMD/dTVD factor, because the checkshot times are vertical. An along-hole integral would misread every deviated well.
  - Block shift between levels, with the minimum-delta-t variant not offered.
  - Ends beyond the levels are left uncorrected and flagged.
- **Also live 2026-10-06:** the owner applied the seismic storage pool migration and redeployed 8 functions; verified.

### A4 QI Studio (2026-10-06)
- **What shipped:** a new app at `/dashboard/apps/geoscience/qi-studio`: setup, data inventory, usability matrix, issue register, feasibility per target, and the Package 1 report. Details in QIStudio-STATUS.md.
- **Decisions:**
  - It opens on a Seismolord or Rock Physics Studio licence, with no new tile or price. Those are owner items.
  - Saving uses the new product table `saved_qi_studio_projects` (migration 20261006140000; a live dry run was clean; owner applies).
  - The matrix is judged on recorded curve extent; sample-level QC stays in WDM and RP.

### A5 Seismic QC (2026-10-06)
- **Engines:**
  - #318 `qi/seismicQc.js`: spectra and bandwidth, signal-to-noise from coherency, and footprint. Gated on the analytic Ricker spectrum, designed S/N (with dip) and a designed stripe, each with negative controls.
  - #319: the footprint reports the fundamental period, its harmonics' share and a prominence. A period-4 pulse train had been read at its period-2 harmonic, and short random profiles had looked periodic.
- **Suite:**
  - `QIStudio/services/qcRun.js` is one runner for the worker and the browser. It samples inlines for the spectra and signal-to-noise in time windows, and RMS maps (+/- 8 samples) for the footprint.
  - **Worker:** a new job kind, `seismic_qc` (own volumes, read only). Its result equals the runner's on the same bricks (gate).
  - **QI Studio:** a Seismic QC tab with a spectrum chart, tables, issues to the register, and a report section.
- **Decisions:**
  - The footprint is measured on RMS amplitude maps, because a gain stripe averages away on signed seismic.
  - A stripe needs a share over 0.3, a prominence of at least 10 and at least 5 cycles across the slice.
  - No migration is needed: the queue accepts any well-formed job kind.
- **Worker deploy:** needed after merge, for the new kind.
- **A5 live (2026-10-06):**
  - Worker redeployed as suite-d9003f25b+engines-290895d5f with the `seismic_qc` kind. This followed the fix in #902: A4's saved-project migration had been caught by the db-tests glob.
  - Live QC of the QA 1,000,000-trace volume (qi-10g.sgy): succeeded in 140 s. It found peaks of 24.9, 26.5 and 18.1 Hz in three windows, flagged a narrow band in each (the file is a synthetic sinusoid), and found no footprint.
  - S/N saturates on that noise-free synthetic, so values of 10,000 or more now display as "over 10,000 (over 40 dB)".

### A6 Tie extensions (2026-10-06)
- **Engines #320 `qi/wavelets.js`:** resample, normalise, align, and compare and average wavelets across wells. Gated on a known shift, scale and resampling, with a 90 degree rotated well as the negative control.
- **Seismolord:**
  - A committed tie now stores its wavelet's samples with the QC record: at most 121, centred, 5 significant digits, with dt (`storedSamples`).
  - Synthetics offer a WDM-edited sonic (_DC, _ED, _SPL) as a sonic, labelled. When a drift-corrected sonic exists it is suggested with "Use it", never picked silently.
- **Rock Physics Studio:** the gather's tie wavelet is now the stored wavelet itself, resampled to the gather interval. This fixes the plan's tieWavelet defect. An older record is still rebuilt as a phase-rotated Ricker and says to re-commit the tie.
- **QI Studio, Well ties tab:** each well's tie (correlation, shift, wavelet), the aligned tie wavelets with their average (the field wavelet), and each well's fit to it. Issues cover no tie, poor (under 0.5) and fair (under 0.7) ties, wavelet not stored, phase spread over 30 degrees, frequency spread over 25 percent, and a well unlike the average (under 0.8). The report has a ties table.

### B1 Q8a Post-stack inversion (2026-10-06)
- **Engines #321 `qi/inversion.js`:**
  - the pylops post-stack operator (centred derivative, centred convolution) and its adjoints;
  - model-based inversion (CGLS with a pull to the low-frequency model) and a blocky variant (IRLS total variation);
  - FISTA sparse-spike, integrated and merged with the model below a crossover;
  - coloured inversion (Lancaster and Whitcombe 2000): one operator from the well impedance spectrum (a power law fitted to the logs) over the seismic spectrum, rotated by -90 degrees.
- **Engines #322 `qi/lfm.js`:** the horizon-guided low-frequency model (inverse distance between wells, proportional position between horizons, constant offset outside them, constant time with none), a well left out for blind tests, and the blind-well score. `runVolumeJob` now passes each trace's grid position to the compute.
- **Validation:**
  - pylops oracle goldens: the forward operator, the model-based result and FISTA (pylops `eps` is twice the engine's lambda);
  - coloured inversion against the band-limited true impedance, with the unrotated output as the negative control;
  - the LFM is exact for a dipping layer with horizons; at constant time the same layer is smeared (negative control).
- **Suite:**
  - a shared run module (`QIStudio/services/inversionRun.js`) gated on a synthetic survey with dipping horizons. Every well passes blind (correlation over 0.95, AI error under 3 percent). Without horizons the blind error more than doubles (negative control).
  - worker job `poststack_inversion`: blind mode (well traces only) and volume mode (every trace, published as a derived v4 volume Seismolord opens). Its blind table equals the run module's on the same traces.
  - QI Studio Inversion tab: wells read into impedance in time, wavelet, horizons, method, the blind check, the volume run, issues and a report table.
- **Decisions:**
  - **Wavelet scaling:** the wavelet is scaled to the seismic at the wells by least squares over every well sample. The sign of the scale also fixes polarity, so a reversed-polarity volume needs no setting.
  - **Wells in time:** each well's sonic and density go through its own time-depth relationship (the committed tie first, then imported checkshots). This is the Seismolord synthetics path. The trace is the well's position at the middle of its impedance log.
  - **Blind check before the volume:** the tab offers the blind check first. Every volume run also records the blind table in the product's manifest, so the QC travels with the volume.
  - **Score:** blind error is the RMS relative AI error against the log after a 50 Hz high cut. Relative impedance has no level, so coloured inversion reports correlation only, against the log band-passed between 8 and 50 Hz.
  - **Issue thresholds:** blind correlation under 0.6 is high; blind error over 10 percent is medium; a blind error more than 5 points above the with-well error is low (the result leans on the model away from wells).
  - **Labelling:** products carry `qi_class: elastic_estimate`, the method, the wells, the horizons and the settings (no logs or wavelet samples) in the derived manifest.
  - **Horizons:** the user's own picks on the inverted volume only (the worker checks this, as RLS would). A trace where any chosen horizon has no pick falls back to constant time.
- **Worker deploy:** needed after merge, for the new kind.
- **Merged:** #904 (main a59211821). The worker was redeployed as suite-a59211821+engines-d13d787f7 and is healthy with `poststack_inversion`.

### B2 Q8a benchmark and uncertainty (2026-10-06)
- **Engines #323, blind-well benchmark with known truth:**
  - Data: the 2D impedance model of pylops' post-stack tutorial (testdata `avo/poststack_model.npz`), 50 traces x 400 samples, a 20 Hz Ricker, five wells.
  - The engine reproduces pylops' blind inversions to a ln(AI) difference under 1e-4.
  - Blind AI error at the five wells: 7.0, 5.8, 7.4, 12.6 and 15.5 percent. The model alone gives 12.2 to 19.2 percent. Every well improves, and the edge wells, where the model extrapolates, are worst.
  - Negative control: a reversed-polarity wavelet is worse than the model alone at every well.
  - This model stands in for the plan's Marmousi2 gate: the Marmousi2 download hosts were unavailable (403 and a retry page). The pylops model gives known truth with real structure. Marmousi2 itself can be added when a source is reachable.
- **Engines #324:**
  - `qi/inversionSpread.js`: per-sample quantiles (type 7, numpy's default, gated on numpy goldens), the relative spread, and seeded noise at a stated signal-to-noise ratio.
  - `runVolumeJob`: an `outputs` option writes several volumes in one pass. The single-output path is unchanged, bit for bit.
- **Suite:**
  - The run module's scenarios: wavelet x model cut x noise seed, at most 12. Each wavelet is scaled at the wells on its own.
  - The worker reports, at the wells, each well's blind error at Q10, Q50 and Q90 and each scenario's mean error.
  - A volume run writes AI at Q10, Q50 and Q90 and the relative spread as four volumes.
  - QI Studio adds a Sensitivity and uncertainty block, report tables and a help paragraph.
- **Decisions:**
  - **Labels:** Q10, Q50 and Q90 (the 10th, 50th and 90th percentiles), following the PT10 owner decision that parameters never carry P labels. The plan's "P10/P50/P90 volumes" are these Q volumes.
  - **Ranking test:** with the true and a wrong wavelet, the wrong wavelet's scenarios carry the higher mean blind error (gated). With identical realisations the spread is zero (negative control).
  - **Reproducible noise:** each trace's noise seed comes from the scenario seed and the trace position. A rerun gives the same volumes in any trace order.
- **Merged:** #905 (main 11f4e4b2c). The worker was redeployed as suite-11f4e4b2c+engines-613a2a596 and is healthy.

### B3 Q9a Property prediction (2026-10-07)
- **Engines #325 `qi/propertyPrediction.js`:**
  - a linear transform by least squares, with the prediction interval of a new observation (Student t, n - 2). The 80 percent interval gives Q10 and Q90.
  - Bayesian facies in one to three attributes: Gaussian, or a KDE with Scott's bandwidth (scipy's `gaussian_kde`); priors; posterior; confusion matrix.
  - Gated on a scipy oracle in 1D and 2D. Negative controls: a z interval; Vp/Vs dropped.
- **Suite:**
  - run module `QIStudio/services/propertyRun.js`;
  - worker kind `property_prediction` (calibrate and volume modes);
  - QI Studio Properties tab, with report tables, issues and help.
  - Well prep now also reads a porosity curve (percent becomes a fraction; vendor nulls dropped) and the RP_FACIES curve with its code names.
- **Decisions:**
  - **Calibrate on logs, check on the inversion:** the model is fitted to the wells' logs taken to seismic scale (a 50 Hz moving average in time; a majority filter for facies codes). Each well is then left out and predicted from the inverted impedance at its trace, so the check includes the inversion's own error.
  - **The interval is checked:** the check reports how much of each left-out well falls inside Q10 to Q90; about 80 percent is right. Under 60 or over 95 percent is a medium issue. A left-out correlation under 0.5, or a facies accuracy under 0.6, is high.
  - **Input:** an absolute impedance volume from an inversion (not relative AI or a spread), checked on the worker from the manifest. The Q50 of an uncertainty run is offered too.
  - **Labels:** porosity and facies probabilities are `calibrated_prediction`. A facies whose name speaks of a fluid (gas, oil, hydrocarbon, brine, water) is a `fluid_hypothesis` (SOW section 10).
  - **Facies limit:** at most 5 facies. A facies named but absent at the wells gets no model class, and its registered output row is removed.
  - **Speed:**
    - With one attribute the facies posterior is tabulated once per model (4001 points, plus or minus 6 SD beyond the outer classes; within 0.002 of the direct posterior, gated), so a volume costs one lookup per sample.
    - The porosity interval computes t x s once per model, gated equal to the engine call.
- **Merged:** #906 (main cd3cc8c3a). The worker was redeployed as suite-cd3cc8c3a+engines-73419b71d and is healthy with `property_prediction`.
- **Next (then):** Q10 prospect integration (closure and spill point on depth surfaces, the anomaly register, the per-prospect QI assessment, and the hand-off to the prospect engine).

### B4 Q10 Prospect integration (2026-10-07)
- **Engines #326 `qi/prospectAssessment.js`**, on Mapping & Surface Studio's closure engine (`lib/gridding/closure.js`):
  - **Conformance:** the DHI check that the anomaly's downdip edge follows one contour. The edge is read at the midpoints to its lower outside neighbours. Score = 1 - edge scatter / closure relief. Also reports the share inside the closure, the implied contact (never below spill) and the GRV at it and at spill.
  - **Evidence independence:** evidence grouped by the response it comes from.
  - **Assessment:** a decision table.
- **Engines #327:** fixes the copy lint (item 17, no whole-number rounding inside a message). #326 had been merged with red CI by mistake; #327 restored green within minutes. Every merge since is gated on the checks' exit code.
- **Validation:** an analytic paraboloid dome.
  - A contact-bounded anomaly conforms (over 0.95), implies its contact within a cell, and its GRV matches pi a R^4 / 2 within 5 percent.
  - Negative control: a patch across the flank does not conform.
  - All eleven table cases are gated.
- **Suite:**
  - `QIStudio/services/prospects.js`:
    - crest by steepest ascent from a point;
    - the anomaly mask from an attribute map read on the depth grid through `readDepthSurface`;
    - only the patches that reach into the closure kept;
    - the analysis.
  - The QI Studio Prospects tab: the per-prospect table, editor, issues, report table and help.
  - **Contract `qi-prospect-1`** (`src/lib/qiProspectSource.js`): QI Studio saves a record per analysed prospect. Risked Reserves Valuation reads it by `?qiProject&qiProspect` and shows a read-only QI evidence card beside the prospects.
- **Decisions:**
  - **Decision table:**
    - Mature needs conformance of at least 0.7, two independent supporting responses, no competing explanation open or likely, and a target whose feasibility verdict says the case is visible.
    - Conformance under 0.3 means the anomaly cuts across the structure: investigate. A likely competing explanation plus a cutting anomaly is a downgrade.
    - With no anomaly: downgrade only when the verdict is feasible, otherwise retain. This is the plan's absent-anomaly rule.
  - **QI never sets Pg:** the record carries no chance of any kind (gated). The RRV card moves no number and says so. Volumetrics and risking stay in ReservoirCalc Pro and RRV.
  - **No new table:** prospects and anomalies live in the QI Studio project (`saved_qi_studio_projects`, already pending owner apply). The plan's `qi_anomalies` table is not needed, so there is no extra migration.
  - **Edge spill:** a spill on the map edge is flagged in the reasons and the record (`limited_by_edge`). GRV at spill is then a lower bound.
- **Merged:** #907 (main 6eb8632db). Q10 runs in the browser, so no worker deploy was needed.

### B5 Q11 Reporting and handover (2026-10-07)
- **Engines #328 `seismolord/segyWrite.js`:**
  - SEG-Y rev 1, fixed trace length, IEEE float, big-endian, an EBCDIC textual header;
  - inline 189, crossline 193, CDP X and Y 181 and 185 with the byte-71 scalar.
  - **Validated by segyio:** the oracle writes the sample with the engine and reads it with segyio: geometry, format, revision, header words, and the samples bit for bit. The jest gate pins the file's SHA-256 and reads it back with our own reader.
  - **Negative control:** little-endian samples change the bytes and read back wrong.
- **Worker kind `export_segy`:**
  - streams a volume as SEG-Y into a multipart upload in the work bucket, one brick row of inlines at a time;
  - leaves out traces outside the survey and writes nulls as 0;
  - returns a download link valid 24 hours (named file).
  - The janitor deletes exports 3 days after the job. Each job row notes it (`result_refs.removed_at`), so no table is needed.
  - Gated: the assembled file reads back with the engine reader; a file cut into many parts is byte-identical.
- **QI Studio:**
  - SEG-Y and Run record buttons on every finished inversion and property run;
  - wavelet text downloads on the Well ties tab (each tie wavelet and the field wavelet);
  - in the report: an executive summary, a handover table with each product's label, and the QI class definitions and limits under the assumptions.
- **Run record (`qi-run-record-1`):** the job (id, kind, times, engine commit), its settings (numeric arrays over 64 values as a count and an FNV-1a fingerprint), inputs, outputs and checks.
- **Portability:** `saved_qi_studio_projects` joins the generic saved-project family (55 tables). Ids of wells, volumes and surfaces inside a study resolve only when the package carries those records too.
- **LAS:** already delivered. Edited, spliced and drift-corrected logs are ordinary registry curves, and Well Data Manager exports them as LAS (engines `welldata/lasWrite.js`).
- **Decisions:**
  - **Exports are temporary:** a 24-hour link and a 3-day file. A re-export is cheap. Long-term storage stays the client's.
  - **The fingerprint is not a security hash:** it tells inputs apart in an audit. The worker keeps the full params in the job row.
  - **Maps and sections:** the report pack stays tables and text. Maps and sections are exported from Seismolord and Mapping, which already draw them with the chart standard.
- **Merged:** #908 (main d2864c4a2). The worker was redeployed as suite-d2864c4a2+engines-6a6b19877 and is healthy with `export_segy`.
- **Next:** the Milestone B acceptance run (a full post-stack study on an open dataset) waits for the owner's Volve/F3 licence check. Milestone C (prestack) is next in build order: Q3 prestack data first.

### C1 Q3a Prestack gathers: ingest and store (2026-10-07)
- **Engines:**
  - **#329 `qi/prestack.js`:**
    - Dix interval velocities;
    - the exact incidence angle by ray tracing flat layers;
    - Walden's (1991) straight-ray angle;
    - offset bins, angle gathers, angle partial stacks and the usable angle.
    - Gates: Dix recovers a layered earth exactly; Walden is within 1.5 degrees of the exact ray up to an offset equal to the depth; a two-term AVO trend survives the angle gather. Negative controls: without the Vint / Vrms factor the angle misses by more than 3 times Walden's error; offset bins in place of angle bins scramble the trend.
  - **#330 `qi/gatherStore.js`:** the worker-side store. CDP blocks of cb x cb, each with every bin's trace, plus a separate Uint16 fold. Single-gather reads and the dataset manifest.
  - **#331:** the SEG-Y writer writes a prestack offset at byte 37.
  - **#332:** the block builder sums in float32, and `builderBytes` states its memory.
- **Worker kind `ingest_gathers`:**
  - an uploaded prestack SEG-Y, read twice straight through: the headers (geometry, offset bins, survey affine from about 5,000 traces), then the samples into CDP blocks, one brick row of inlines at a time;
  - blocks and fold in the work bucket under `gathers/{uid}/{id}/`, with a manifest;
  - registered as a `qi_datasets` row (kind `gathers_offset`), counted in the worker storage allowance.
  - Gated: a CDP's gather read back from its block is its traces in their bins; two traces in one bin are their mean, and the fold says so.
- **Decisions:**
  - **Inline-sorted only:** a file not sorted by inline is refused with what to do (sort by inline then crossline). Deliveries are usually sorted, and the sort lets both passes stream.
  - **Gathers are taken as NMO-corrected** (the usual QI delivery), recorded in the manifest (`nmo_corrected: true`). Residual moveout comes with Q4b/Q5.
  - **Memory:** one brick row of blocks is held while it fills (cb x crosslines x bins x samples, float32). A row over the worker's memory budget is refused with the block size or bin width that would fit. The default block is 4 CDPs.
  - **Janitor:** the 30-day raw retention now touches only raw uploads (`kind segy_upload`). A gather store is kept (gated by a negative control).
- **Merged:** #909 (main 13b960a45). The worker was redeployed as suite-13b960a45+engines-ce75f43a1 with `ingest_gathers` (deployed from the new /root/wt-deploy worktree).

### C2 Q3b Angle stacks (2026-10-07)
- **Engines:**
  - **#333 `velocityOnGrid`:** an RMS velocity table on the trace samples. Vrms is linear in time; Vint is the Dix velocity of the segment.
  - **#334:** the trace index flags a gather file (two or more traces per cell on average) at import and points to QI Studio's Prestack tab, so a stack import never silently keeps only the first trace of each gather (the plan's traceIndex fix). A single repeated trace stays a plain duplicate (negative control).
- **Worker:**
  - **`angle_stacks`:**
    - Each offset bin's Walden angle at each time is computed once. It depends only on the bin and the time, since there is one velocity function.
    - A range's partial stack is, per CDP and sample, the fold-weighted mean of the bins in the range.
    - Each range is written as SEG-Y into the work bucket and registered as a `segy_upload` server file with `meta.partial_stack`. Seismolord's own server import (`scan_dataset`, then `stack_to_v4`) converts it into a volume.
    - A usable-angle map per CDP is written beside the stacks, with its Q10, Q50 and Q90.
    - Gated: a known AVO event (A + B sin^2) gives near and far stacks within the trend's bounds for their ranges, with near brighter than far. The files read back with the engines' reader, and both are registered for conversion. Negative control: a velocity 60 percent too fast takes the far range from true angles of about 37 to 53 degrees, and the far stack falls outside its true bounds.
  - **`multipartWriter`** (`worker/src/s3.js`): the streaming multipart upload shared by `export_segy` and `angle_stacks`. The export's own tests still pass, including many parts byte-identical and abort on cancel.
- **QI Studio, Prestack tab:**
  - build gathers from an uploaded SEG-Y (offset byte, bin width);
  - make angle stacks (an RMS velocity table, up to four named ranges, a least fold for the usable angle);
  - convert each stack into a Seismolord volume (the server import's scan and conversion, rev 1 byte mapping);
  - an angle-stacks table in the report, with the usable angle.
- **Decisions:**
  - **Conversion reuses the server import:** partial stacks become Seismolord volumes through the same `stack_to_v4` path as any big SEG-Y, with no second converter. Being `segy_upload` files, they fall under the 30-day raw retention, and the converted volumes are kept.
  - **The velocity is one RMS function for the survey** (a time table). A velocity volume per CDP and curved-ray angles come later in Q3 or Q4b if the study needs them; the straight ray is gated within 1.5 degrees of the exact ray up to an offset equal to the depth.
  - **The usable angle is a parameter**, so it carries Q labels (Q10, Q50, Q90), never P labels.
- **Merged:** #910 (main f68396bfe), after a production-build fix: the `Rows3` icon is not in the installed lucide-react, so `Rows` is used. Check icon names against `node_modules/lucide-react`. The worker deploy followed.
- **Next (then):** the stack family (declared against measured angle ranges, alignment, amplitude and phase consistency between stacks), then Q4b prestack QC.

### C3 Q7 AVO (2026-10-07)
- **Engines #335 `qi/avo.js`:**
  - Aki-Richards reflectivity and Shuey's terms, with a least-squares Shuey fit (two or three terms);
  - contrasts from A and B with Gardner's density, and the Smith-Gidlow fluid factor;
  - the intercept-gradient background trend (orthogonal regression through the origin) and the distance off it;
  - the chi projection, and the AVO classes I to IV with a stated class II band (0.02).
  - Gates (known truth): the three-term fit recovers Shuey's terms exactly from Aki-Richards data, and the contrasts come back. The fluid factor is zero on the mudrock line and below -0.1 for gas. Negative control: two terms to 40 degrees bias the gradient by about 40 percent, against 13 percent to 25 degrees.
- **Worker kind `avo_volumes`:**
  - two to four angle stacks on one lattice, each with its mean angle;
  - per sample, the two-term fit for A and B, the fluid factor and the chi projection;
  - published as derived volumes on the first stack in one multi-output pass, with the other stacks' bricks loaded column by column beside the first.
  - Gated: an exact two-term response gives back A and B to 1e-5 and the engine's fluid factor. Negative control: stacks given the wrong angles return a wrong gradient. Refuses stacks not on one lattice, angles less than 5 degrees apart, and output rows not registered on the first stack.
- **QI Studio AVO tab:** stacks and angles, products, Vs/Vp and chi; runs with SEG-Y and run-record handover; a report table and help.
- **Decisions:**
  - **Two terms from stacks:** the volume fit is the two-term Shuey. Partial stacks rarely reach the angles a three-term fit needs, and the engine gate shows the bias past 30 degrees; the help says to keep the stacks within about 30 degrees.
  - **Amplitude scale:** the stacks are taken as balanced against each other. A, B and the fluid factor carry their scale. Calibrating it to reflectivity at the wells comes with Q6b (angle-dependent wavelets and synthetic gathers).
  - **Labels:** A, B, the fluid factor and the chi projection are elastic estimates. Class maps and fluid probabilities (Q9b) carry the interpretation and fluid-hypothesis labels.
- **Merged:** #911 (main 867a71eba). The worker deploy followed.
- **Next (then):** I-G at the wells (modelled against observed, closing RP U2-008) and class maps at a horizon; then Q6b, Q4b, Q5, Q8b and Q9b.

### C4 Q7b AVO at the wells (2026-10-07; closes Rock Physics U2-008)
- **Worker kind `sample_volumes`:** values of up to eight volumes on one lattice at up to 200 points. The first volume's event (largest absolute value within the window) sets the sample, and every volume is read there, so the values belong to one reflection. Gated: the event 8 ms away is found, and without a window it is missed (negative control); outside the survey and no live sample are said.
- **QI Studio, AVO tab, At the wells:**
  - for each study well, Rock Physics Studio's published gather (`rock-physics-gather` contract: the zone, in situ and fluid-substituted intercept and gradient);
  - the zone top in time through the well's own tie (`prepareWell` now returns `topsTwt`);
  - the intercept and gradient volumes sampled at the well's trace.
  - One least-squares scale ties the volumes to reflectivity (A and B together). Each well's model beside its scaled seismic, the AVO class of each and the misfit, in a table and an I-G crossplot (white chart theme, ChartLogo).
  - Issues: a class that differs (medium); a negative scale (high, a polarity problem).
  - A report table.
- **Decisions:**
  - **One scale for all wells:** the stacks are balanced against each other (Q7), so one factor maps the volumes to reflectivity. A scale per well would hide a tie problem at one well. Its misfit and class show it instead.
  - **The comparison lists every well:** a well with no published gather or no usable trace shows its reason.
  - **The in-situ case is the comparison;** the substituted case is drawn beside it to show where the fluid moves the response.
- **Merged:** #912 (main 03b61b3cf). The worker deploy followed.

### C5 Q8b Simultaneous inversion (2026-10-07)
- **Engines #336 `qi/prestackInversion.js`:**
  - Fatti et al.'s (1994) three-term linearisation for ln(AI), ln(SI) and ln(rho);
  - the forward model and its adjoint, on the post-stack engine's centred derivative and convolution;
  - CGLS model-based inversion, each parameter pulled to its own low-frequency model, null samples left out.
  - Gated on pylops: the forward equals PrestackLinearModelling (explicit, fatti, centred) to 1e-10, and the adjoint passes the dot test. The inversion of a 5 percent noise gather matches pylops' regularised solution to 2e-4, and density detail correlates 0.76 with the truth. Negative control: with the near angles only (0 to 16 degrees) it drops to 0.49 (pylops agrees).
- **Suite:**
  - **`QIStudio/services/prestackRun.js`:**
    - three horizon-guided low-frequency models;
    - the background Vs/Vp from the wells;
    - the wavelet scaled to the stacks at the wells through the Fatti model;
    - the per-CDP inverter, the blind-well table for AI, SI and density, and the four products.
    - Gated on a synthetic survey with dipping horizons and a gas-like layer: blind AI and SI errors under 4 percent and density under 5 at every well. Negative control: without horizons the blind AI error grows by more than 1.5 times.
  - **Worker kind `prestack_inversion`:** blind and volume modes, three to six stacks on one lattice, four multi-output volumes on the first stack. Gated: its blind table equals the run module's on the same traces, and a volume run matches the truth at a well (AI within 4 percent, density within 6), with Vp/Vs equal to AI/SI.
  - **Well prep:** an `elastic` extra gives ln(SI) (from the shear sonic) and ln(rho) in time through the same tie.
  - **QI Studio Simultaneous tab:** stacks and angles, wavelet, horizons, the wells with their shear curve named, the blind table, the four-volume run with handover, a report table and help.
  - **Property prediction** now also takes the AI product of a simultaneous inversion.
- **Decisions:**
  - **At least three stacks, one past 25 degrees:** three parameters need three or more angles, and density needs the far ones (Buland and Omre 2003). The engine's negative control shows the loss without them.
  - **Equal pulls** (0.05 each; the job accepts others, but the Simultaneous tab does not offer them yet, see U2-007): density is regularised like the others. Its blind correlation is reported so a weak density shows.
  - **Vs/Vp of the linearisation** is the wells' mean SI/AI (worked out from the wells; not offered on the tab), never a fixed 0.5.
- **Merged:** #913 (main 94cf13f16), after a rerun of a ReservoirCalc Pro theme-test flake (its waits are raised in #914). The worker deploy followed.
- **Next (then):** Q9b (facies and fluid probability in AI and Vp/Vs space: two attributes for the Bayesian classifier), then Q6b, Q4b, Q5, and Q12.

### C6 Q9b Facies and fluids in AI and Vp/Vs (2026-10-07)
- **What:** property prediction classifies facies in two attributes: AI and Vp/Vs from a simultaneous inversion. This is the prestack route that tells a gas sand from a shale of the same impedance.
  - The engine's classifier already took one to three attributes (#325, gated on scipy in 2D).
  - The Suite adds the second attribute end to end:
    - the wells' Vp/Vs in time (SI from the shear sonic);
    - upscaling and the facies samples in two attributes;
    - a 201 x 201 posterior table for volumes (within 0.02 of the direct posterior, gated);
    - the left-out check with both traces.
  - The worker's `property_prediction` takes `second_volume_id`, which must be the Vp/Vs product of a simultaneous inversion on the same lattice.
- **Validation:** in a synthetic study where gas sand and shale share one AI, AI and Vp/Vs classify every left-out well above 85 percent. Negative control: AI alone stays under 75 percent. The worker classifies a volume above 80 percent from the two volumes and refuses a second volume that is not Vp/Vs.
- **QI Studio:** a simultaneous run's AI is offered as an impedance, with an Attributes choice (AI, or AI and Vp/Vs) for facies. The class table shows the Vp/Vs means. Help is updated.
- **Decisions:**
  - **Labels unchanged:** facies probabilities are calibrated predictions, and a facies named for a fluid is a fluid hypothesis (SOW section 10).
  - **Porosity stays one-attribute (AI):** the transform is fitted in AI, the usual porosity driver. A second attribute would need a regression the wells rarely support.
- **Merged:** #915 (main 6ab2eeb31). The worker deploy followed.
- **Remaining in the plan:**
  - Q6b angle-dependent wavelets and synthetic against real gathers;
  - Q4b prestack QC (residual moveout, NMO stretch, fold maps);
  - Q5 conditioning (trim statics, Radon, f-x, spectral balancing, stack matching);
  - the stack family;
  - Q12 (benchmark, tester walks, the manual, the QI upgrade doc).

### C7 Q6b Angle-dependent wavelets (2026-10-07)
- **What:** one wavelet per angle stack, from the wells.
  - At each well, it is extracted by least squares (Seismolord's well-wavelet extraction) against the reflectivity of the logs at the stack's angle, then aligned and averaged across wells (engines `qi/wavelets.js`).
  - The reflectivity is the simultaneous inversion's own Fatti operator with a unit spike, so each wavelet carries the stack's amplitude scale for that operator.
  - Beside each wavelet: its peak frequency and phase, and every well's synthetic against the stack (the synthetic-against-real check by angle).
- **Worker:**
  - `sample_volumes` has a traces mode: the whole trace of every volume at up to 20 points.
  - `prestack_inversion` takes one wavelet per stack (`inversion.wavelets`) in place of the single tie wavelet, scaled together at the wells.
- **QI Studio:** in the Simultaneous tab, the "Angle wavelets from the wells" table and a "Use one wavelet per stack" option (on when the wavelets match the stacks' angles), with a report table and help.
- **Validation:** stacks made with a different Ricker per angle (30, 25 and 18 Hz) give each stack its own wavelet back (correlation over 0.98), and every synthetic matches its stack (over 0.97). Negative control: the near wavelet against the far one stays under 0.95. The worker's blind check holds with per-stack wavelets, and a count that does not match the stacks is refused.
- **Decisions:**
  - **Fatti reflectivity, not Zoeppritz,** for the extraction: it is the operator the inversion uses, so the wavelet and the inversion agree by construction. Rock Physics Studio's Zoeppritz gathers stay its modelling view.
  - **Synthetic gathers against real gathers:** the check runs on angle stacks, which is where the inversion works. Gather-level comparison comes with Q4b prestack QC.
- **Merged:** #916 (main e012d2211). The worker deploy followed.

### C8 Q4b Prestack QC (2026-10-07)
- **Engines #337 `qi/prestackQc.js`:**
  - the NMO stretch (t / t0 - 1) and the stretch-mute offset that inverts it;
  - residual moveout of an NMO-corrected gather: each offset's shift against the near-trace reference, by windowed cross-correlation with a parabolic peak, fitted as dt = a x^2 to give the residual at the far offset;
  - a fold summary.
  - Gates: the analytic stretch and its exact inverse. A known 8 ms parabolic residual is recovered (curvature within 3 percent). Negative control: a flat gather measures under 0.3 ms.
- **Worker kind `prestack_qc`:**
  - about 1,500 CDPs sampled on a regular stride;
  - at one to four event times, the far-offset residual's median, 90th percentile and share over 4 ms;
  - the stretch-mute offset from a velocity table, and the median fold, low-fold share and far covered offset;
  - sampled maps and issues: residual over 4 ms (over 8 is high), stretch inside the covered offsets (low), low fold over a tenth of the survey (medium).
  - Gated on stores built by `ingest_gathers`: a known 8 ms residual is measured, and flat gathers raise no moveout issue (negative control).
- **QI Studio, Prestack tab:** a "QC the gathers" action per store, with the per-time table, fold, issues to the register, a report table and help.
- **Decisions:**
  - **Measured on NMO-corrected gathers:** the store's gathers are taken as NMO-corrected, so a flat event is the expected state. The residual is what a trim or velocity update must remove, and the QC states it per event time.
  - **The 4 ms threshold:** a quarter period of a 60 Hz event. Above it the far angles stack out of phase, and AVO gradients bias.
  - **Multiples, illumination and gather panels at wells:** left for Q5 (Radon) and the tester walks. Panels draw in Seismolord's gather viewer once that exists.
- **Merged:** #917 (main c5f166039). The worker deploy followed.
- **Remaining in the plan:** Q5 conditioning (trim statics, Radon, f-x, spectral balancing, stack matching), the stack family, and Q12.

### C9 Q5 Conditioning (2026-10-07)
- **Engines:**
  - **#338 `qi/conditioning.js`:**
    - trim statics (each trace onto its gather's stack, iterated, capped);
    - stack matching (time shift and constant phase together, since the envelope of the cross-correlation does not move under a phase rotation; then least-squares amplitude);
    - the quadrature and phase rotation from the analytic signal;
    - spectral balancing to a target spectrum.
    - Gates: random statics flattened (correlation over 0.98); a 6 ms, 35 degree, 0.5 scale mismatch recovered; a 20 Hz trace shaped to 35 Hz. Negative controls: the shift cap leaves an event change alone; the unbalanced trace fits worse.
  - **#339:** the hot paths as plain typed-array loops, about 6 to 7 times faster, with the same results.
- **Worker kinds:**
  - **`trim_gathers`:** trim statics on every CDP of a store, in a window around an event, written as a new store with its before-and-after flatness. Gated: random statics come out flatter (over 0.97), and the source store is untouched.
  - **`match_stacks`:** one survey operator per stack against a reference (the median shift and scale, the circular mean phase of about 300 per-trace matches), applied to all traces as a derived "matched stack" volume. Gated: a far stack 6 ms late, rotated 30 degrees and at half amplitude is measured as such. The matched traces follow the reference, and a trace twice as bright stays twice as bright (the AVO amplitudes kept).
- **QI Studio:**
  - Prestack tab: Trim statics (event, window, largest shift), with the trim shown on the store.
  - AVO tab: Match the stacks (reference, then a table of each stack's operator), with matched stacks offered as study volumes.
  - A report table and help.
- **Decisions:**
  - **One operator per stack, never per trace:** a per-trace match removes the amplitude differences between stacks that AVO measures.
  - **Spectral balancing stays out of the AVO path:** the engine's balancing shapes each trace to an absolute target, which would equalise amplitudes. A survey-wide shaping filter per stack, which keeps relative amplitudes, is a follow-up if a study needs bandwidth matching.
  - **Radon multiple attenuation, f-x deconvolution and structure-oriented filtering are not in this round.** Contractors deliver gathers with the multiple removal done, and the trim and matching above are what QI amplitude work needs from conditioning. They are recorded as follow-ups for Q12's review.
- **Merged:** #918 (main 1c4681ed8). Worker deployed 2026-10-07 with all 17 kinds (health checked).
- **Remaining in the plan:** the stack family (declared against measured angles across vintages), and Q12 (benchmark on the open datasets once licensed, tester walks, the user manual, the QI upgrade doc).

## Q12 Close (2026-10-07)
- **Browser walk** (`e2e/qi-studio.spec.js`, 6 tests, green on the isolated dev server):
  - the Package 1 audit through to the PDF, read back with pdftotext;
  - seismic QC, with the footprint issue added to the register;
  - the prestack chain (gathers, angle stacks, trim, gather QC);
  - every tab at 1366x768 in light and dark, with no page errors and no sideways scroll;
  - the help link, and the guide route gated like the app.
- **Fixes:**
  - QI-U1-001 (S2): a cleared number reached the job as 0. This hit the AVO and Simultaneous mean angles and the Inversion model cut and weight. The run is now held, with a message.
  - QI-U1-002: the report and header named only the Package 1 audit. Both are retitled "Quantitative Interpretation Report".
  - QI-U1-003: the e2e dark check now switches the theme with the toggle.
- **Upgrade doc:** `docs/upgrade/QI-UPGRADE.md` (the twelve checks, persona walks, parity, ranked backlog).
- **Decision:** QI Studio rides the Seismolord or Rock Physics Studio licence until the owner sets its own tile and price.
- **Owner items:**
  - ~~apply `20261006140000_saved_qi_studio_projects.sql`~~ APPLIED 2026-10-07 and verified (RLS, 4 policies, triggers, registration; anon no SELECT);
  - set the tile and price;
  - run the Volve and F3 licence check;
  - ~~cut the Suite zip~~ LIVE 2026-10-07: Suite dc206c539 uploaded and purged; /version.json, all 868 chunks and the QI markers verified.

### Q12b Findings from the user manual (2026-10-07)
The manual was written against the source, and it found the following.
- **Fixed:**
  - **The implied contact can sit below the spill.** It was shown at the raw edge depth while the GRV used the clamped contact. It is now held at the spill, and the assessment says by how much the anomaly runs past it.
  - **A trap spilling at the map edge, with the anomaly filling it to that spill, could read Mature.** It now reads Investigate until the map covers the spill. An anomaly whose contact sits above the edge spill still matures, because its GRV is closed on the map.
  - **The trim "window" is a half-width.** It is now labelled as one.
  - **The handover table left out the AVO and Simultaneous products.** It now lists them.
  - **Facies in AI and Vp/Vs dropped wells without shear and gave no reason.** The reason is now shown.
  - **The inventory took any chosen volume as the full stack.** Derived volumes no longer count.
  - **The fluid-name match was loose: "Soil" counted as a fluid.** It now matches whole words, with underscores and hyphens as separators.
  - **The low signal-to-noise remedy named structure-oriented filtering, which is not built.** It now names what can be done.
  - **Help and panel text** now match the code on QC sampling (12 inlines; footprint from every trace), the three angle ranges, the AVO and Simultaneous row counts, the usable angle (averaged down the trace) and save timing (10 s after the last change).
- **Backlog:**
  - U2-007: offer the Simultaneous pulls, Vs/Vp and model cut on the tab.
  - U2-008: add the Simultaneous tab's blind-well results to the issue register.

### QI Studio tile (2026-10-07, owner request)
- **What:** QI Studio gets its own app tile. Slug `qi-studio`, in the Geoscience module, Active. The route `/dashboard/apps/geoscience/qi-studio` (and `/help`) is now gated on `qi-studio`; before this, a Seismolord or Rock Physics Studio licence opened it.
- **Price: 1690 a month,** owner-delegated. Reasons:
  - It is the top of the Suite's per-app band (199 to 1690, the 2026-09-27 review), above Seismolord (1490) and Rock Physics Studio (1190).
  - QI Studio carries the prestack chain, both inversions and the server compute behind them.
  - A desktop QI package (for example the inversion and AVO modules of the leading vendors) sells for a multiple of this per seat each year.
  - The Geoscience module (3990) includes it, so a module buyer pays nothing extra.
- **Decision: QI Studio has its own licence and no longer opens on a Seismolord or Rock Physics licence.** Otherwise the tile would sell what those licences already give. Module buyers keep it.
- **Order:** the owner applies `20261007130000_seed_qi_studio_tile.sql`, then uploads the zip. **Done:** applied 2026-10-07 by the owner, row verified read-only.

## Angle stacks skip muted samples (2026-10-09)
- `angle_stacks` averaged the zeros of a mute zone into a range, which dims a far stack wherever the mute reaches into it (a false AVO effect), and counted the mute zone in the usable angle (Ekene v3 gathers, muted beyond 40 degrees, reported 58.5). A sample of exactly zero is now treated as muted. Found dry-running the QI videos on the Ekene kit v3 gathers. Needs a worker redeploy to take effect.
- **Tests:** `worker/seismic-worker/__tests__/angleStacks.test.js` (a mute test that fails on the old handler, with a live-small-value negative control).

## Edits are saved when you leave (2026-10-09)
- The project autosave fired 10 s after the last edit. Leaving QI Studio sooner (to Rock Physics Studio, say) cancelled it, so the setup was lost while the header still said Saved, and reopening a project wrote it again for nothing (seen as "Save Failed"). It was the same defect SCAL Studio had (#949). Found recording the QI videos.
- Pending edits are now written on unmount, on page hide, and before another project opens or is created. Closing the tab asks the browser to confirm. Opening a project is not an edit, and the header says "Unsaved changes" until the edits are stored.
- **Tests:** `__tests__/qiUnsavedEdits.test.jsx` (3; all fail on the old provider).

## QI studies could not save (fixed 2026-10-09; needs a Suite zip)
- `saved_qi_studio_projects` was never added to the record-sharing rules (`src/lib/recordSharing/rules.js`). In production the sharing store threw "is not a shared record table" before sending any request. Since 2026-10-07, a QI project could be created, but none of its edits was ever stored, and the header said "Save Failed". Found while recording the QI videos.
- The fix registers the table, matching its migration (visibility sharing, `project_name`).
- New guards:
  - `src/lib/recordSharing/__tests__/registryGuard.test.js` reads the source and fails if any table given to `useSharedSavedProjects` is unregistered;
  - `__tests__/qiSharedSave.test.jsx` saves a QI study through the real sharing store on the in-memory database.
  - Both fail without the entry.
## Remove a worker file (2026-10-09)
- Until now, only the janitor removed files from the worker store (a raw SEG-Y 30 days after upload; gather stores never). A wrong upload or an old gather store held the user's 150 GiB allowance with no way out.
- New worker kind `remove_dataset`, and a **Remove** button (with a confirmation) on every row of the Prestack tab's uploads, gather stores and angle stacks:
  - it removes a gather store's manifest and every block the manifest lists, or the single object of a raw file or stack;
  - it marks the row deleted, which frees the allowance;
  - it refuses a file that a queued or running job reads, another user's file, and an unfinished upload;
  - Seismolord volumes converted from the file are kept.
- No migration: `qi_jobs.kind` only checks the name's form.
- Needs a worker redeploy.
- **Tests:** `worker/seismic-worker/__tests__/removeDataset.test.js` (4, with negative controls) and a Prestack UI test (declined confirmation is a no-op).

## 2026-10-09: angle ranges typed in Prestack are compared as numbers

- Typing a range in Prestack (for example 5 to 15 degrees) disabled Make angle stacks with "Each range needs a name and from below to". The typed values are text, and as text "15" is not greater than "5".
- `angleRangeProblem` in `PrestackPanel.jsx` now compares them as numbers and refuses empty, non-numeric, reversed or out-of-range entries.
- **Tests:** a `qiStudio.test.jsx` case (typed 5 to 15 enables the button; reversed, empty, unnamed and 0 to 75 are refused). It fails on the old code.

## 2026-10-10: removing a gather store drops its stack and QC lines

- The project kept each store's angle-stack and QC records after the store was removed. A rebuilt store then showed two result lines in Prestack, and the report listed both runs.
- `dropPrestackStore` (QIStudioContext) runs when a `gathers_offset` file is removed. Removing a raw upload leaves the records alone.
- **Tests:** a `qiStudio.test.jsx` case with a raw-upload removal as the negative control. It fails on the old code.

## 2026-10-10: well logs packed in worker job settings (64 KB limit)

- Simultaneous inversion on the Ekene demo (four wells, near/mid/far) failed with "Job settings are too large (64 KB limit)". Each well's AI, SI and density went into the job as JSON numbers, one per sample of the trace. Post-stack inversion and property prediction send logs the same way.
- `services/logPacking.js`: `packLog` keeps the logged interval only, as 16-bit steps between the least and greatest value (base64). For ln(impedance) a step is about 3e-5, which is 0.003 percent; whole-number logs (facies codes) stay exact. Four wells of three logs now take under a third of the limit.
- The Simultaneous, Inversion and Properties panels pack their logs. The worker unpacks them before validation (`withUnpackedLogs`) and still accepts plain arrays from older clients. The run record keeps a packed log as its length and fingerprint, as it does for arrays.
- **Deploy order:** worker first (deploy.sh), then the Suite zip.
- **Tests:** `logPacking.test.js` (round trip within half a step, gaps, exact codes, damaged input refused, and the four-well block over 64 KB as plain numbers as the negative control) and a worker test (the packed blind table matches the plain one).
## 2026-10-10: prestack QC residual moveout no longer reads AVO as moveout

- On the Ekene demo gathers, which are flat by construction, prestack QC reported a median residual moveout of 17.3 ms at 570 ms and 4.7 ms at 1045 ms, and suggested "flatten the gathers" issues.
- **Cause:** each offset was cross-correlated against a near-offset pilot on the signed correlation peak. Where AVO dims, flips or changes the waveform across offset, the peak jumped cycles. Flat synthetic gathers read -5.3 ms (polarity flip), +33.3 ms (two events, opposite AVO) and -25.6 ms (tuned thin bed).
- **Fix** (engines PR #344, vendored at 82b5366, `qi/prestackQc.js` `residualMoveout`):
  - the |correlation| peak, with only offsets that still resemble the pilot (|corr| 0.7 or more) in a fit weighted by corr²;
  - when the lags scatter about the parabola by more than a sample, AB semblance (Sarkar, Castagna and Lamb 2002) with a linear amplitude trend.
  - Flat cases now read 0.00 ms; true residuals of +8 and -12 ms are recovered within 0.35 ms; with noise at a fifth of the peak, flat gathers read under 3 ms.
- The worker handler is unchanged (same return shape, plus `fitted` and `method`). **The worker needs a redeploy for the fix to reach prestack QC.**
- **Tests:** engines `qi.prestackQc.test.js`, with the old estimator as the negative control.


## 2026-10-10: prestack QC measures residual moveout only where there is an event

- After #980, the Ekene demo gathers read 2.3 ms at 1045 ms and 0.8 ms at 1520 ms (flat, as built). The 570 ms window still read a 21.9 ms median: it sits in the Benin sands, with no reflector, so the estimator measured noise and raised "flatten the gathers" issues.
- `coherentEvent` (worker handler): a CDP's reading counts only when the event stays similar across the nearer half of the spread past the reference offsets (|r| of 0.5 or more on 60 percent of them). An AVO change at far offsets still passes; noise does not.
- Each time window reports the share of coherent CDPs. Below 20 percent it shows "no coherent event to measure" and raises no moveout issue. The Prestack panel and the report have a "Coherent CDPs (percent)" column.
- Needs a worker redeploy.
- **Tests:** worker `prestackQc.test.js` (a noise-only window reads no event and raises no issue, while the event window is coherent and flat; `coherentEvent` ignores the reference offsets); the QI walk shows the no-event row.

## 2026-10-10: prestack QC moveout issues follow the median

- With #980 and #981 on the flat Ekene gathers, the medians read 2.3 ms (1045 ms) and 0.8 ms (1520 ms). The 90th percentiles of 6.6 and 8.5 ms still raised medium and high "flatten the gathers" issues. Those percentiles are the noisiest CDPs, so on real data they would fire almost everywhere.
- A moveout issue now needs a median far-offset residual above 3 ms: medium, or high above 6 ms. A flat median with a 90th percentile over 8 ms raises a low "Residual moveout scatter" note that points to the residual map.
- A systematic 8 ms residual (the worker test fixture) is now high severity, where it was medium.
- Needs a worker redeploy.
- **Tests:** `prestackQc.test.js` (the flat Ekene numbers give a low scatter note only; systematic moveout is medium or high; a no-event window raises nothing).

## 2026-10-10: well logs are timed only where the checkshots have control

- On the Ekene demo, post-stack inversion's blind-well check read Ekene-1 0.65 / 11.5 percent and Ekene-2 to 4 about 0.48 / 20 percent. Horizons and including the well made no difference.
- Running the same engine offline on the kit gave 0.74 to 0.84 / 7 percent at every well. The app's logs matched the kit's (aligned, residual sd under 0.015 in ln AI), but each started about 100 ms earlier, at 52 ms where the kit's started at 152 ms. `makeTvdssToTwt` extrapolates linearly above the first checkshot (162 m MD on the Ekene wells), so the mudline-to-first-checkshot interval was timed by a guess: the mudline at about 51 ms against the true 47 ms. Scored against the seismic, that window doubled the error. Cutting it gave 7.0, 7.0, 6.8 and 7.5 percent. A committed tie's derived rows span that extrapolated interval too.
- `prepareWell` (`services/inversionWells.js`) now times the impedance, elastic and property logs only within `controlRange`: the imported checkshots' TVDSS range, or the rows in use when none were imported. It reports `timeControl`. This applies to Inversion, Simultaneous, Properties and AVO at the wells.
- **Tests:** `inversionWells.test.js` (the log starts at the first checkshot; derived rows do not widen the range; property curves clipped). All three fail on the old code.

## 2026-10-10: horizons guide the low-frequency model in any tick order

- `horizonsAtFrom` took the horizon grids in the order they were ticked in the picker, and refused every CDP where the times did not increase in that order. A user who ticked a deeper horizon first got a low-frequency model at constant time with no message. The picker's list is not sorted by depth: on the Ekene full stack, Oboro Sand Base comes first.
- `orderTopDown` sorts the grids by median time once, so the order of ticking no longer matters. Crossing horizons are still refused at the CDPs where they cross. This affects post-stack and prestack inversion, which share the function.
- **Tests:** `inversionRun.test.js` (grids given deepest first give the same times as top-down; a crossing CDP is still refused). The old test that expected reversed grids to be refused is updated, because that expectation was the defect.

## 2026-10-10: the porosity Q10 to Q90 band includes the inversion's error

- The band came from the scatter of the log-against-log fit only, so it left out the error of the inverted impedance. On the Ekene demo the 80 percent band held the log 13 to 47 percent of the time.
- `calibrateProperty` now pools the residuals of the wells left out, which are predicted from the inverted impedance, and adds the part of their RMS above the fit's scatter (`sExtra`) to the band: t x sqrt(s^2 (1 + 1/n + leverage) + sExtra^2). The model the volume run uses carries `sExtra`.
- Each well's coverage check uses the other wells' residuals only, so the coverage figure stays out of sample.
- Each well also reports its mean error (`bias`). A shift larger than 70 percent of the RMS error raises a medium issue that points to the low-frequency model and the wavelet scale.
- The Properties panel and the report state how much the band was widened.
- Needs a worker redeploy (calibration and the volume run happen on the worker).
- **Tests:** `propertyRun.test.js`.
  - A noisy inversion now covers 60 to 97 percent.
  - The band from the fit's scatter alone covers under 50 percent (negative control).
  - The widened model is used by the volume run.
  - A 10 percent biased impedance is reported as a shift at every well.
  - Both new tests fail on the old code.

## 2026-10-11: QI Studio maths in the engines (QI course gate E2, Suite side)

- **What moved:** the maths of `services/avoWells.js` (`compareAtWells`, `wellPoints`), `services/inversionRun.js` (`waveletScale`, `blindWellTable`, `halfWindowFor`, `lowPassFinite`), `services/angleWavelets.js`, `services/propertyRun.js` (upscale, fit, predict, posterior tables, `calibrateProperty` with the widened band) and `services/prospects.js` (`nearestNode`, `climbToCrest`, `anomalyMaskOn`, `keepTouching`, `analyseProspect`), and Seismolord's `extractWellWavelet`. They now live in `engines/qi/{avoWells,inversionQc,angleWavelets,propertyCalibration,prospectTrap}.js` and `engines/seismolord/wellWavelet.js` (engines #355), vendored at `0f4ac4a`, each with goldens and an independent oracle.
- **The services are thin re-exports** under the same names, through new engine shims in `QIStudio/engine/` and `Seismolord/engine/wellWavelet.js`. The job checks, issue-register copy, fluid labels and competing-explanation lists stay in the Suite. `blindWellTable` keeps `INVERSION_DEFAULTS.band[0]` as its low cut.
- **Parity:** `__tests__/qiEngineParity.test.js` replays the services on Ekene kit cases recorded before the move (`tools/qi-parity/captureEkeneParity.js` on Suite `5df9d9410`, engines `cc4c62d`: Ekene-1 to -4 and -8 logs in time, synthetic full and angle traces at the wells, the Ekene top-sand structure and an amplitude map bright above the contact). Every output comes back byte for byte. No number QI Studio displays changes, so the QI videos stay valid.
- **Worker:** `inversionRun`, `prestackRun` and `propertyRun` still import the same service paths; esbuild follows the shims into `packages/engines` (checked with `build.mjs` locally). **Needs a worker redeploy** so the image carries the vendored engines (no behaviour change): `cd /root/wt-deploy && git fetch origin && git checkout --detach origin/main && worker/seismic-worker/deploy.sh` (owner-run; check its exit code and the `/healthz` engine commit `suite-<sha>+engines-0f4ac4a31`).
- **Findings held for the owner (behaviour kept for parity):** a well with a live observed A and a null B pulls the AVO scale toward zero (only A is checked; the A and B volumes share their null mask in practice); a well flagged with an error still enters the pooled scale if it carries values.

## 2026-10-11: the NextGen QI course extraction gate (E1a, E1b, E1c, E2)

Plan: `docs/scope/NextGen-QI-Course-PLAN.md` section 3. One line per merge, saying what a capstone can now grade.

- **E1b merged** (engines #352, `2931248`): `qi/avo` and `qi/wavelets` behind independent oracles (exact Zoeppritz, Householder QR, DFT correlation). Gradable now: the Shuey intercept and gradient fitted at a sample (two and three terms), the contrasts and fluid factor from A and B, the background trend and the off-trend distance, the chi projection, wavelet alignment lag, similarity and misfit to the field wavelet. Not gradable: an AVO class on a class boundary (QI and Rock Physics put the boundary in different classes).
- **E1a merged** (engines #354, `ee0e35d`): `qi/prestack` and `qi/prestackQc` behind an independent oracle (exact rationals, Newton ray tracing, Walden 1991). Gradable now at the 5e-7 floor: the Dix interval velocity of a stated layer, the Walden angle at a stated offset and time, the exact ray angle, the NMO stretch at an offset and the stretch-mute offset, offset and angle-bin fold, a partial-stack sample, the usable angle at a stated minimum fold. Not at the floor: residual moveout (an estimator, within 0.2 ms of the design).
- **E1c merged** (engines #353, `8fe5a46`): `qi/lfm`, the rest of `qi/seismicQc` and `qi/prospectAssessment` behind independent oracles (knot-table horizon map, direct DFT with Harris's Tukey window, union-find spill). Gradable now: the -6 dB low edge and the spectral centroid of the average spectrum of a supplied trace patch, coherency S/N and the footprint, the LFM ln(AI) at a sample and the blind-well score, conformance, the implied contact (held at the spill) and its GRV, the evidence count and the recommendation. Not at the floor: a band edge of a single notched trace (grade the patch average).
- **E2 merged** (engines #355, `0f4ac4a`): the QI Studio maths moved into `engines/qi` (`avoWells`, `inversionQc`, `angleWavelets`, `propertyCalibration`, `prospectTrap`) and `engines/seismolord/wellWavelet`, each with goldens and an independent oracle (exact misfit parabola, Cholesky Wiener wavelet, exact-rational transform with the closed-form Student t, union-find spill). Gradable now: the one scale over the wells that ties AVO volumes to the model (with residuals and class agreement), the wavelet scale at the wells and the blind-well table for a stated inverter, the upper bound of the 80 percent porosity interval at a stated AI with a well left out (the widened band of #987), the crest from a picked point and the closure column height, area and GRV at spill. Grade a facies posterior on `faciesPosterior` (exact), not the volume run's tabulated read (2D table error up to 1.9e-3). The Suite re-vendor and parity PR follows; the seismic worker needs a redeploy after it.

## 2026-10-11: the NextGen Quantitative Interpretation course

Built to the approved plan (`docs/scope/NextGen-QI-Course-PLAN.md`, #1010):

- NextGen #315 MERGED (e0a2e7828): the `{{video:<id>}}` lesson segment and the code video registry (18 QI videos; A1 to A3 public, coming-soon card until their YouTube ids are set; B4 to F18 members-only, coming-soon card until a private host exists; `academy-video-url` edge function is a stub, Bunny route documented in `docs/video/VIDEO-HOSTING.md`). Videos never gate completion.
- NextGen #316 MERGED (b7167164b): course `qi`, Geoscience, path_order 80, prerequisite `welldata`. 78 lessons, 396 questions, four explorer panels, three capstones on held-out synthetic cases (TAMBERLO, QUARVIN, DELSHOLM), 18 graded fields, all through engines that passed the E1a, E1b, E1c and E2 gate (vendored at engines 0f4ac4a). Three key-truth audits, 0 wrong keys; final-stage wave gates 70 of 70.
- Migrations written, NOT applied: `20261011212305_qi_course`, `..._beginner_deep`, `..._intermediate_deep`, `..._advanced_deep`, `20261011212309_qi_go_live` (held until the NextGen upload serves `/dashboard/apps/qi`). Owner applies with `tools/course-waves/qi/apply_qi.sh` in NextGen; copies in `/root/pending-migrations-nextgen/`.

## 2026-10-12: the two held AVO findings, decided and built

The owner asked for the two findings held at the course gate to be implemented (engines #356, vendored here at `d54092f`).

- **One AVO classifier.** QI Studio and Rock Physics Studio put a value lying exactly on a class border in different classes. `avoClass` now lives once, in `engines/rockphysics/avo.js`, and `engines/qi/avo.js` re-exports it, so both apps call the same function.
  - Classes: Rutherford and Williams (1989) I to III, with class IV of Castagna and Swan (1997). Neither paper places a value on a border, so the convention is stated in the code: class II is the closed band |A| <= 0.02, class IV needs B above zero, and B = 0 below the band is class III.
  - This was already the Rock Physics rule, and it is the rule the NextGen Rock Physics and QI lessons state. QI Studio's earlier rule put A = +0.02 in class I, A = -0.02 outside class II, and B = 0 in class IV.
  - A or B that is not a finite number now gives no class in Rock Physics too (its inputs are checked finite before the call, so nothing shown changes).
- **The AVO scale at the wells.** `compareAtWells` pools only wells with no error and finite A and B, modelled and observed. Before, only A was checked, so a null seismic B counted as zero and pulled the scale down, and a well flagged with an error still entered the scale when it carried values. The result now carries `excluded: [{ name, reason }]`, and each excluded well's row in the panel shows its reason as before.
- **Videos and course unchanged.** In QI Studio the A and B volumes share their null mask, and a well with an error gets no sample point, so real runs give the same scale.
  - Ekene parity: every recorded output is unchanged except `compareAtWells`, whose fixture plants an error well carrying values (Ekene-9, a row QI Studio never builds). It was re-recorded, and `qiEngineParity.avoCleanRows.pre-move.json` pins that the clean wells give the numbers the engine gave before the decision, byte for byte. A negative control shows the planted row did move the scale under the earlier rule.
  - The NextGen QI course grades no class and its pack rows are all clean (scale 1882.216944 unchanged); its text already states the shared border rule. NextGen still vendors engines 0f4ac4a, which differs only on a border value; it follows at the next NextGen engines pass.
- **Worker:** no redeploy needed. `avoVolumes` uses `fitShuey`, `contrastsFromAB` and `chiProjection`, which did not change.
- **Engines gate:** oracles carry the same rules, goldens regenerated (15 border cases, and a case where four unusable wells stay out and the scale is exactly 3); new `__tests__/avoClass.shared.test.js`; negative controls e1b and e2a 31 of 31 caught each.

## 2026-10-14: crop before upload and pilot sub-volume runs

Owner-approved 2026-10-14 for the client QI study (about 120 km2, six wells; five angle stacks of about 80 GB, two full-area volumes, about 100 GB of velocity volumes, gathers to follow; upload 0.8 to 1 MB/s, so one uncropped stack is about a day). Built and tested only; the owner's data is not imported.

- **Engines #364** (canonical eab475c, vendored): `seismolord/segyCrop.js` crops a SEG-Y while it is read (rectangle, polygon, decimation, sample window; kept traces planned by arithmetic for a regular grid with every kept header verified on read, or from the headers for irregular, crossline-sorted and gather files); the cropped file is a valid SEG-Y whose kept sample bytes are the source's (only trace bytes 109 and 115, the binary sample count and the rev 2 counts change; cards 34 to 39 of the textual header carry the crop, card 35 machine-read). `padTopReader` puts nulls above the window for conversion, so every volume keeps the 0 ms origin Seismolord reads (it does not read byte 109). `runVolumeJob({ window })` and `pilotBrickFetcher` give the pilot sub-volume.
- **Seismolord import:** the crop step after the scan (typed or drawn rectangle or polygon on the outline, time window, decimation off, kept traces, cropped size against the original, upload time at the typed or measured speed). Named crops in `seismic_crop_definitions` (migration `20261014220000`, APPLIED 2026-10-14 by the owner, PR #1127), private or shared with the organisation, with a velocity preset (same area from 0 ms). Server import uploads only the cropped file through the resumable upload (crop-aware resume key; picking the same file again restores its crop); browser import converts only the crop; import from a link is cropped by the worker while converting (`stack_to_v4` params.crop). Gathers are detected and uploaded for the Prestack tab with the same crop; `ingest_gathers` pads them from the file's crop card.
- **Provenance:** manifest `source.crop` and `survey_meta.ingest.crop` (source file, original geometry, crop, definition id, mode); Seismic Explorer crop mark and tooltip; QI report "Seismic data: source and crop".
- **Pilot sub-volume (closes the audit gap "no pilot sub-volume run"):** Inversion, Simultaneous and AVO tabs take a pilot area (typed or a saved crop); `poststack_inversion`, `prestack_inversion`, `avo_volumes` and `property_prediction` process and write only that sub-volume (a derived volume on the parent lattice, `manifest.pilot`, named "(pilot)"); a property run on a pilot impedance follows its pilot; the report lists pilot runs. Inside the area a pilot equals the full run (gated on all three).
- **Worker redeploy needed** (stack_to_v4, ingest_gathers and the four volume handlers). It also carries 54b70aa59 (QI AVO classifier), which landed after the live build suite-6bbc4420d+engines-0f4ac4a31.
- **Zip needed** before the owner can use the crop step: the crop UI and the upload path are in the browser bundle.

### Crop before upload: live tests (2026-10-14, worker suite-f1c4b5669+engines-eab475c0d)

- **20 GB synthetic, cropped in Chromium on the worker host** (1,700 x 1,900 traces, 1,501 samples at 4 ms, IEEE; 20.17 GB; crop inlines 1500 to 2099, crosslines 3500 to 4299, 1000 to 5000 ms):
  - kept 480,000 traces; the cropped SEG-Y is 2.04 GB (10.1 percent);
  - header scan 0.8 to 1.9 s; crop plan and spot check 0.3 s;
  - cropped read with a cold page cache: 2.04 GB in 29.9 s, 68 MB/s of cropped output (100 MB/s of source read; only the kept inlines' kept crosslines are read, 3.0 GB of the 20 GB). At the client's 1 MB/s the crop is 70 times faster than the link;
  - memory: JS heap peak 372 MB and renderer RSS peak 360 MB while reading; 546 MB heap and 1.27 GB renderer RSS during the upload (two 64 MiB parts in flight plus garbage awaiting collection).
- **Real server path:** the QA account uploaded the cropped file through qi-upload-url to the worker store (2.04 GB in 171 s on the same host), registered the row and enqueued stack_to_v4 with the pad; the worker converted it in 5.5 min (480,000 traces, 358 MB stored). Read back: 40 of 40 sampled values exact against the source, 36 of 36 samples above the window null, negative control (wrong trace) 35 of 35 disagree. Volume "Crop test: synthetic 20 GB, 1/10" is in the QA account until cleaned up.
- **Gathers:** a 467 MB gather file (120 x 100 locations, fold 12, 751 samples) was recognised (fold 12), cropped to 60 x 50 locations and 400 to 2000 ms (66 MB, 36,000 traces, every trace of each kept location), uploaded, and built by ingest_gathers in 4 s with ns 501 (the 100 samples above the window put back as nulls), crop recorded.
- **Pilot inversion on the Ekene demo volume** (EKENE3D-full.sgy, 128 x 128 x 601, five wells, model-based): pilot inlines 1040 to 1079, crosslines 2030 to 2089, 800 to 1600 ms ran in 25 s against 116 s for the full run, wrote 16 bricks (16 MiB) against 40, and matched the full run exactly at 100 of 100 points inside the area; 300 of 300 points outside were empty. Both test volumes were removed afterwards.
- **Found and fixed:** run beside a full inversion, the pilot job failed twice on a brick upload ("fetch failed"): the worker runs two jobs in one Node process, and while one computes the other's uploads can stall until the connection drops; the derived-volume handlers did not retry. `worker/seismic-worker/src/retryingStorage.js` now retries a dropped connection, 408, 429 and 5xx with backoff (fix PR, worker redeploy).

## QI Studio upgrade P1-P2 (owner GO 2026-10-14)

Owner, 2026-10-14: "Go with the light version and start priority 1. I also want the Volve/F3 benchmark included and that you proceed non-stop into Priority 2." Every change is additive: the tabs, default views and test ids the QI videos and the NextGen QI course show are unchanged.

### P1.1 Light governance (2026-10-15)
- **Objectives and acceptance criteria** on Setup, below the three setup cards: the study's text and an optional line per target (payload `objectives`).
- **Decisions** in the issue register: gate (Data QC, Feasibility, Pilot, or a named gate), outcome, decision, by whom, date, and the run or version it refers to (chosen from the study's runs and checks, or typed). Stored in `issues` with `type: 'decision'`; shown in a Decisions table under the register; excluded from the issue table, its sort and its counts.
- **Report:** the objectives after the summary, the decisions after the issue register; the summary adds the count and the latest decision only when there is one, so earlier studies read as before.
- **Decision:** no workflow engine, no locking and no enforced sign-off (the owner's light version). No migration (project payload).
- **Tests:** `__tests__/qiGovernance.test.jsx` (7), including the decision kept out of the register as a negative control.

### P1.2 Truly blind wells (2026-10-15; closes U2-008)
- **Before:** a well left out of the blind check was out of the low-frequency model only. The wavelet scale (and the coloured operator) used every well, the field wavelet averaged its tie, and the property check predicted each left-out well from an impedance volume whose inversion had used it.
- **Now (protocol `held-back-v2`):**
  - post-stack: a held-back well is out of the model, the wavelet scale (coloured: the operator's impedance and seismic spectra) and, with the field wavelet, the average itself (the browser sends the other ties' average per well, `blind_wavelets`). Sensitivity scenarios hold the well back from their model and scale.
  - simultaneous: out of the three models, the wavelet scale, the background Vs/Vp (unless typed) and the angle or field wavelet averages.
  - property: each well is out of the property model (as before) and predicted from the inversion's held-back estimate at it, which every inversion volume now records (`attribute.params.blind_traces`, packed ln AI; Vp/Vs for the simultaneous Vp/Vs volume). A well the inversion never used is blind by construction. A volume from before the change gives "not blind" rows and a medium issue.
  - Every result carries `blind_protocol` (what was excluded, the per-well scales, notes); the panels and the report state it. Older results say they held the well out of the model only.
  - A wavelet that is one well's own tie wavelet is named in the protocol: that well's blind result is not independent of the wavelet.
- **U2-008:** the Simultaneous tab offers its blind results to the issue register (AI or SI error over 10 percent medium, over 20 high; density correlation under 0.5 medium; density error over 10 percent low).
- **Gates (call the shipped code):** each worker's blind table equals a hand-built held-back reference exactly; the earlier protocol (one scale on every well) is the negative control and differs when one well's log disagrees; re-breaking the exclusion in the run modules fails 3 post-stack and 2 prestack tests. The property check equals the engine calibration on the held-back traces, and from the volume traces it reads more than twice better at a biased well (negative control).
- **Worker redeploy needed** (poststack_inversion, prestack_inversion, property_prediction).

### P1.4 Inversion trust outputs (2026-10-15; closes U2-007)
- **Seismic residual:** post-stack (absolute methods, single runs) writes an optional second volume, the input minus `forwardPoststack` of the inverted ln(AI) through the job's own scaled wavelet; simultaneous writes one residual per stack (the stack minus `forwardFatti` of the inverted logs). Blind and volume results carry `residual_at_wells` (RMS of the residual as a percentage of the seismic RMS at each well); a post-stack residual run also reports it over the volume. Coloured inversion has no forward model, so no residual.
- **Density gate:** `densityDecision` replaces the 25-degree refusal. Density is written when the farthest stack reaches `min_far_deg` (25) and the median blind density correlation over two or more wells reaches `min_blind_corr` (0.5, set on the tab); otherwise its registered row is removed, nothing is uploaded, and the result says why. AI, SI and Vp/Vs are written either way; near-only stacks now run.
- **U2-007:** the Simultaneous tab's Settings: pull of AI, SI and density, model cut, Vs/Vp (blank takes the wells' mean, shown), the density gate, the residual option. Cleared boxes hold the run (PL11).
- **Gates:** the residual plus the synthetic of the stored products returns the input (post-stack and per stack); the unscaled wavelet as the negative control leaves over half the seismic; density written, withheld for near stacks (row removed, no upload) and withheld under a strict gate; the pulls, Vs/Vp and cut change the result and are recorded.

### P1.3 Net-to-gross and water saturation (2026-10-15)
- **Kinds `ntg` and `sw`** in property prediction, on the porosity path of the engines' calibration (the linear transform with the widened band), each Q10, Q50 and Q90, held within 0 and 1 in the volumes. Sw is labelled `fluid_hypothesis` (SOW section 10); NTG `calibrated_prediction`.
- **Well side:** NTG from an NTG or net-flag curve (aliases in `inversionWells.js`), or a net flag where Vsh is at most and porosity at least the cutoffs (0.4 and 0.08, set on the tab), named in the wells table; Sw from the SW family. The usability families are unchanged.
- **Gate (`propertyGate`):** fully blind (P1.2), two wells or more, every left-out well correlating at 0.5 or more with 60 to 95 percent inside Q10 to Q90 (editable). The panel holds Predict the volume with the reasons until the latest check passes the gate as set; the worker recomputes the gate and refuses a failing volume run (`gate_failed`, registered rows removed). Porosity stays ungated.
- **Gates:** a passing NTG volume is within 0 and 1 while the unclamped transform is not (negative control); a strict gate and a non-blind volume are refused with their reasons; porosity is unaffected.

### P1.5 Maps from volumes (2026-10-15)
- **Engines #366 `qi/zoneMaps.js`:** `zoneRange` (Seismolord's A-to-B interval window: round(min) to round(max) of the picks), `zoneStats` (mean, RMS, min, max, share beyond a cutoff), `zoneSpread` (zone mean of Q90 - Q10, and relative to Q50), `zoneThicknessMs`, `zoneProducts`. Gated on a numpy oracle with its own window arithmetic (JavaScript's half-up rounding), closed forms on a linear trace, and equality with `intervalStat`; a floor window, a window one sample short and nulls counted all fail the goldens.
- **Worker kind `zone_maps`:** one to eight volumes on one lattice, the user's own horizons picked on a volume of that lattice, up to 16 products; reads only each brick column's zone range; writes each product as a float32 lattice grid in the user's seismic folder (`qi-zone-maps/{job}/{key}.f32`, counted against the quota). Gated: every cell equals `zoneProducts` on the whole trace exactly (float32), the linear volume gives its closed-form mean, the spread is the designed one, the wrong base horizon gives a different map (negative control), and the ownership, lattice, quota and cancel guards.
- **QI Studio Maps tab** (appended after Data matrix): pick a stack, an impedance, an uncertainty triple (property map, confidence map, relative spread) or a facies probability (mean probability, highest, share over a cutoff); the zone; run; then save: each map is gridded on the survey's own cell (`latticeToWorldGrid`) and saved as an attribute surface of the stack (`saveZoneMapAsSurface`: kind and z domain `attribute`, the unit, the zone in the name, provenance with the job, statistic and QI class), which carries the current Suite project. The lattice files are removed after the save.
- **Decision:** the maps live in the shared surface registry (no new table, no migration), so Seismolord's Surfaces list (provenance app `seismolord`, made by `qi-studio`) and Mapping & Surface Studio show them and export XYZ, CPS-3, ZMAP+ and Irap.
- **Worker redeploy needed.**

### Worker jobs and files in Suite Projects (2026-10-15; coordinator scope addition)
- **Migration `20261015160000_suite_projects_qi_worker_tables.sql` (APPLIED 2026-10-15 by the owner after second-engineer approval; verify 2/8/2/0 and no anon or client writes; live probes 12 of 12):** qi_jobs and qi_datasets get `suite_project_id`, the insert stamp, RESTRICTIVE policies and the backfill, on the P4 pattern. Access is unchanged (own rows only; client writes still revoked). saved_qi_studio_projects was adopted by P4 (checked: it is in the P4 table list and its list reads are scoped by the shared saved-projects service).
- **Client:** `qiService.listJobs` and `listDatasets` follow the current project (Seismolord's Jobs dock, QI Studio's Prestack files and stores, the data matrix), and read unscoped while the column is missing (before the apply). `allProjects: true` reads every project.
- **Worker:** a file made from another file (gathers from an upload, trimmed gathers, angle stacks) takes that file's project; a link import takes the job's (`src/project.js`). Before the apply the rows carry no project and nothing is added. The db-tests leave the Suite Projects migration out (the worker test database has no P0 objects); the rolled-back pentest on the linked database is its test.
- **Rolled-back pentest** (`tools/security/suite-projects/probes/run_qi_dryrun.sh`, 2026-10-15): 12 of 12 probes (a job lands in the default, then in the members-only project after a switch; a service-role file lands in the user's current project; colleagues, another organisation and anon see nothing new; clients still cannot write directly; cancel still works), 88 persona and table comparisons identical after apply and after rollback (demo account included), applied twice, 222 jobs and 73 files stamped.
- **Deferred:** `suite_move_to_project` does not yet move worker files (the move RPC's table list belongs to the P4 function; adding qi_datasets is a follow-up with the Projects team).

## 2026-10-15: gather viewer (QI upgrade P1.7)

### P1.7 Gather viewer (2026-10-15)

Closes QI-UPGRADE U2-004 (the persona walk found the app measured gathers it could not show).

- **Engines PR #365** (`qi/gatherDisplay.js`): `nmoCorrect` (hyperbolic NMO with Vrms per sample, linear interpolation, optional stretch mute), `angleField` (Walden angle of every sample), `angleContour` (the time each offset reaches an angle: overlay and angle mute) and `stretchMuteTimes` (earliest time inside the stretch limit, varying velocity honoured).
  - Gates on known truth: a constant-velocity hyperbola flattened within a quarter sample; the exact ray traveltime through Dix layers flattened within 2 ms up to an offset equal to the depth; the analytic contour t0 = x cot(theta) / v; the stretch-mute time inverts `stretchMuteOffset`, and the mute in `nmoCorrect` matches it exactly.
  - Negative controls: a velocity 15 percent fast leaves the far offset over 10 ms late; a half-velocity field misses the contour by over 50 ms; a replaced moveout formula fails 3 of the 9 gates.
- **Worker kind `gather_panel`** (read only, own stores only): one CDP (centre by default), a stretch of an inline or crossline (at most 24 gathers; a step), or world positions placed on the store's affine (wells; positions outside are listed as skipped), from one store or a store beside another on the same lattice (the trimmed copy). The gathers go out as one float32 panel (at most 6 million samples) in the work bucket under `panels/{uid}/{job}/` with a two-hour link; the janitor removes panels six hours after the job (`PANEL_RETENTION_HOURS`), as it removes SEG-Y exports after three days.
  - Gate: on a store built by `ingest_gathers` from a SEG-Y whose every sample encodes its inline, crossline, bin and time, the panel returns every sample exactly (worst difference 0), for a CDP, a windowed inline stretch, world positions and the store beside its trimmed copy. Negative control: the neighbouring CDP differs. Refusals: another user's store, a non-store, a CDP outside, too many gathers, a reversed window.
- **QI Studio, Gathers tab** (appended after Data matrix; no existing tab, view or test id changed): store and the trimmed copy beside it, CDP, line or wells, time window, the velocity table (from the store's angle stacks when there is one), variable density or wiggle (white panel, ChartLogo), angle contours at 10 to 40 degrees, the stretch mute, an angle mute, residual moveout picks and the fitted parabola at the event times (prestack QC's `coherentEvent` rule; grey picks where no coherent event), the stored QC reading where the QC sampled the CDP, fold per gather, and NMO for display when a store records `nmo_corrected: false`.
- **Decisions:**
  - **A panel object with a link, not results inline:** a line of gathers is megabytes, too big for a job row; the browser cannot read the work bucket, so the worker writes a short-lived object as `export_segy` does.
  - **Panels are temporary** (two-hour link, removed after six hours). Showing the gathers again is one cheap job.
  - **Wells sit at the middle of their first study target** (deviated wells move away from the surface location), else at the surface location; the caption says which.
- **Tests:** engines `qi.gatherDisplay.test.js` (9); worker `gatherPanel.test.js` (6) and a janitor panel test (with an export of the same age kept as the negative control); `__tests__/qiGathers.test.jsx` (7: decoding, overlays against the engine angle, a 3 ms residual read and a flat event not read, stored QC lookup, well placement, request checks, the tab on the in-memory worker).
- **Worker redeploy needed** for `gather_panel` and the janitor. **Zip needed** for the tab.

## 2026-10-15: depth-domain import (QI upgrade P1.6)

- Seismolord now imports depth-domain SEG-Y (depth-migrated stacks and depth velocity volumes) on the background, server and link paths, with the crop step and a depth window. The import records the declared unit, interval and, when the user says so, that the volume holds interval, RMS or average velocities (`manifest.geometry.vertical`, `survey_meta.vertical`, `survey_meta.ingest.vertical`; `geometry.dt_us` = interval x 1000). Details in Seismolord-STATUS.
- **For P2 item 8 (LFM from a velocity volume):** a depth velocity volume carries `geometry.vertical = {domain: 'depth', unit, dz, values: {kind: 'velocity', type: 'interval'|'rms'|'average', unit: 'm/s'|'ft/s'}}`; read it with `verticalOf` (`src/pages/apps/Seismolord/lib/verticalDomain.js`). `sample_volumes` refuses depth volumes today; the LFM work relaxes that for velocity volumes.
- **QI Studio refuses depth volumes:** Setup lists them as unavailable ("depth: QI Studio works in two-way time"), `chosenVolumes` never includes one, and the worker kinds seismic_qc, poststack_inversion, prestack_inversion, avo_volumes, property_prediction, match_stacks and sample_volumes refuse a depth manifest with the reason. Depth gathers are not uploaded for the Prestack tab.
- Needs the worker redeploy and the end-of-round Suite zip.

## 2026-10-15: Priority 1 closed, worker live, benchmark (QI upgrade)

- **P1 on main** 863ee986b (#1139, #1142, #1145, #1146, #1147, #1148, #1141, #1154, #1140); seismic worker deployed suite-863ee986b+engines-1b0a7a806, then again after #1156.
- **Guards from the F3 benchmark (#1154):** an absolute post-stack run is refused when the tie behind the wavelet scale is under 0.3 (`settings.wavelet_scale_tie`); post-stack, simultaneous and property jobs fail on a blind error over 100 percent or not a number, a left-out property RMS over 0.5, or more than 0.1 percent of live samples not a number (`worker/seismic-worker/src/outputSanity.js`); fewer lost samples are a `warnings` entry.
- **Benchmark fixes (#1156):** coloured inversion takes its polarity from the wells (F-6); zone maps leave lattice holes empty (F-7); guard copy (F-8).
- **Benchmark (internal, docs/scope/QI-BENCHMARK.md):**
  - Milestone A (data, placement, QC, ties): in part. CRS, placement on dGB's published positions, QC (S/N 2.1, 19.5, 10.5 by window) and zone maps pass; ties 0.42 to 0.54 with sonic drift, under the 0.7 good band.
  - Milestone B (blind absolute inversion on F3): fails, now refused cleanly by the guards (the old build reported blind errors of 1e29 percent as success). Needs the wells tied with stretch and squeeze in Seismolord Synthetics (QI reads the committed tie) or measured checkshots, then a rerun.
  - Milestone C (Volve prestack): waits for the owner's download.

## 2026-10-15: Priority 2 merged (QI upgrade)

P2 PRs: #1150 (P2.8), #1155 (P2.9), #1152 (P2.10), #1151 (P2.11), #1153 (P2.12). Seismic worker redeployed after them (suite-f2ac8c235+engines-cd6364b53). The UI reaches production with the next zip after d76677ff6.

### P2.8 Low-frequency model options (2026-10-15)
- **Engines #368 `qi/lfmModels.js`** (qi/lfm.js unchanged, so the NextGen QI course grades stay valid): ordinary-kriging weights (numpy oracle), fault polylines as barriers, Dix interval from RMS, `fitVelocityTrend` (ln AI = a + b ln V at the wells) and the trend-plus-residual model; default options equal `lfmTrace` bit for bit. Negative controls: inverse distance is not kriging, no fault mixes the blocks, a shuffled velocity loses the trend's advantage.
- **Suite:** `inversion.lfm` (kriging variogram, fault barriers from Seismolord faults: the middle point of each stick on the world grid), `inversion.velocity` (a velocity volume on the same lattice in time, interval or RMS), `inversion.lfm_scenarios` (up to 6, compared at the blind wells). The worker reads the velocity bricks beside each column; the held-back well is left out of the velocity calibration (protocol line). Refused: a velocity volume on another lattice or in depth, the trend with an uncertainty run, the trend with coloured inversion.
- **QI Studio Inversion tab:** a Low-frequency model options section under the wells (method, variogram, faults, velocity volume and kind, Compare model scenarios at the wells, the scenario table); the report prints the table.
- **Gates:** kriging and a fault give the hand-built engine model exactly (no fault as the negative control); a velocity trend beats inverse distance at the middle well and over the volume between wells by more than half (known truth); scenarios returned in order.
- **Worker:** redeployed with P2.

### P2.9 Automatic feasibility sweeps (2026-10-15)
- **Engines #369 `qi/feasibilitySweep.js`:** Backus averaging, the saturated sand from porosity, shale volume and effective stress (soft or stiff sand, Gassmann), the bed response under a Ricker at 0 and 30 degrees, d' and Phi(-d'/2), sweeps of porosity, Vsh, effective stress and thickness, separable ranges. Gated on a stdlib oracle from the Rock Physics Handbook, the wedge tuning, and physical truths (thin beds separate nothing, porosity raises separation; the same fluid twice gives exactly zero).
- **QI Studio Feasibility tab:** an Automatic feasibility sweeps section under the target cards (one collapsible block per target): Batzle-Wang fluids at the reservoir temperature and pressure, the noise as a thick bed's brine amplitude over the stated S/N, the sweep table, the suggested verdict (feasible, feasible with conditions with the ranges, not feasible). The user takes the verdict or the text with a click; nothing is set by itself. Sweeps join the decision register's run list and the report. Runs in the browser; no worker change.

### P2.10 AVO calibration, three terms and classes (2026-10-15)
- **Engines #370 `qi/avoCalibration.js`:** `wellScale` (observed = s x modelled at one well, the avoWells convention), `scaleFieldAt` (inverse distance or kriging through qi/lfmModels, exact at the wells), `avoClassCode` (1 to 4, the one classifier), `shueyTermsFor` (three terms with three angles reaching 35 degrees); `qi/zoneMaps.js` gains an `avo_class` product for class maps. Negative controls: one pooled scale misses a drifting survey the field follows; two terms bias the gradient a three-term fit recovers.
- **Worker `avo_volumes`:** `terms` (2, 3 or auto), `scale` or `scale_field` (per-trace calibration to reflectivity), products `C` (curvature) and `class` (interpretation); recorded in each manifest. Gated: with terms auto and a scale field, A, B and C come back in reflectivity at the wells and the class volume equals the classifier's code; two terms bias B and a pooled scale misses the far side (negative controls); refusals.
- **AVO tab:** a Terms, calibration to reflectivity and class volumes block (needs Compare at the wells for the scales). AVO class maps from volumes are on the Maps tab (nearest-trace gridding, saved as interpretations).
- **Worker:** redeployed with P2.

### P2.11 Seismic QC additions (2026-10-15)
- **Engines #371 `qi/qcAdditions.js`:** `autocorrelation` (numpy oracle), `multipleDiagnosis` (|acf| peaks past the wavelet, periodic when a peak at L repeats near 2L), `amplitudePreservation` (per-well ln(observed/modelled) = c + k sin^2 theta, shared slope over 0.5 flagged), `depthAlignment` (well misties against the median, 8 ms). Designed truths with negative controls (peg-leg train at 120 ms; primaries alone not periodic; designed angle gain recovered, true amplitudes not flagged; designed mistie flagged, shared shift not).
- **Seismic QC (runner shared by the worker and the browser):** each window gets `multiples` and a periodic-energy issue; the narrow-band rule now needs the spectral centroid near the band, otherwise a low "narrow spectral peak" note (benchmark finding F-1 on F3's deep window: band 5.2 to 10.6 Hz, centroid 29 Hz).
- **AVO tab:** Check amplitude preservation at the wells (the stacks sampled at the stored well points against the model at each stack angle), with an issue and a report section.
- **Well ties tab:** Depth alignment between wells (horizon pick at the well against the top through the tie), with issues.
- **Worker:** redeployed with P2 (seismic_qc carries the multiples).

### P2.12 Depth uncertainty and a suggested Pg (2026-10-15)
- **Engines #372 `qi/depthUncertainty.js`:** time to depth per velocity case (constant or v0 + k z), the closure engine per case, GRV to spill per case with low, high and weighted Q10/Q50/Q90; `suggestPg` (stated factor rule on the user's own Pg). Gated against analytic paraboloid volumes with a negative control.
- **Prospects tab:** a Depth uncertainty for prospects section under the existing table (per analysed prospect: time structure, cases, GRV range, suggested Pg kept with the study only on request). QI never sets Pg. No worker change.

### Tie options for F3 (owner decision 2026-10-15)
- **Option 3, measured checkshots:** NLOG T/Z tables for F03-02, F03-04, F06-01 imported through Well Data Manager (QA account); ties 0.41 to 0.71 (F06-01 has no density in the record).
- **Option 2, Suggest anchors** in Seismolord Synthetics (engines #373 to #375, Suite #1159): dynamic warping; validated on known warps within one sample, noise suggests nothing. On F3 it aligned the events but did not raise the correlation.
- **Milestone B on F3 stays FAIL, refused cleanly** under every tie state; shift, phase and polarity disagree from well to well even on measured checkshots, which places the mismatch in the dGB stack and the 1970s sonic logs. Volve is the better test. Detail: docs/scope/QI-BENCHMARK.md.

## QI Studio round 3 (owner OK 2026-10-15, without Volve or client data)

Owner, 2026-10-15: "Can we proceed with the remaining feature developments of QI Studio without the Volve data? ... before then I want to see some more progress." The same day the owner dropped the rule that tabs, default views and test ids stay unchanged ("Further development and improvements will be a constant in this platform"); demo-account data stays untouched.

### R3.1 Prestack conditioning (the Q5 remainder; closes U2-001 in part and U2-005)
- **Engines #377 `qi/prestackConditioning.js`:**
  - `radonDemultiple`: parabolic Radon (Hampson 1986) with AVO terms, so each moveout carries an intercept and a gradient (Ng and Perz 2004). High resolution by sparse reweighting along q (Sacchi and Ulrych 1995), solved by warm-started conjugate gradients on the block Toeplitz normal equations (Levinson for the plain least-squares case). Overlapping 300 ms windows at 75 percent overlap, normalised to sum to one. The multiples (q at or above the cut, in ms at the far offset) are rebuilt and subtracted, so the primaries never pass through the transform.
  - `fxDecon`: f-x prediction (Canales 1984), forward and backward, in 200 ms windows.
  - `shapingOperator` / `applyShaping` / `meanAmplitudeSpectrum`: one zero-phase operator per stack, from its mean spectrum to a target (another stack's, or flat in a band), with the boost capped and the stack's band energy kept.
- **Gates (16; synthetic gather with 31 offsets, three AVO primaries and three parabolic multiples, one starting on a primary):**
  - over 20 dB of multiple energy removed;
  - isolated primaries: A within 2 percent, B within 5;
  - the primary under a multiple: A within 6 percent, B within 14 (over 40 percent before);
  - negative controls: plain least-squares Radon biases B by over 25 percent; a cut below q = 0 removes the primaries; re-breaking the gradient term fails 2 gates;
  - f-x: noise-free A within 1 percent; S/N gain of 4.5 dB or more with intercept bias within 4 percent over 10 realisations; an over-damped filter loses over 20 percent (negative control);
  - shaping: a 20 Hz far stack given the 35 Hz near bandwidth raises its correlation with the truth from under 0.75 to over 0.94; a trace twice as bright stays exactly twice as bright; per-trace balancing equalises it (negative control).
- **Worker kinds (#1169):**
  - `radon_demultiple` and `fx_denoise` (`conditionGathers.js`): each NMO-corrected gather of a store is conditioned across its offset bins into a new store beside the input. Options: the removed part as a third store, and an inline and crossline area (CDPs outside are left out). The result gives the energy removed per quarter of the trace and the seconds per gather.
  - `spectral_balance` (`balanceStacks.js`): derived volumes `qi_balanced_stack`, offered as study stacks.
  - Gated through the real `ingest_gathers` on a synthetic prestack SEG-Y:
    - over 15 dB of multiples removed;
    - isolated primaries: A within 2 percent, B within 5;
    - the primary under a multiple: A within 6, B within 14;
    - input = output + removed, sample by sample;
    - negative control: a cut above the multiples removes under 3 dB;
    - f-x at S/N about 6 dB: over 4 dB of gain, intercepts within 7 percent;
    - balancing: correlation with the truth from under 0.8 to over 0.93, the centroid closes over 80 percent of the gap, the bright trace stays twice as bright; negative control: a narrow flat band misses the truth.
- **QI Studio:**
  - Prestack tab: Conditioning: multiples and noise (Radon or f-x, the settings, an area, keep what was removed, a table of the runs per quarter of the trace).
  - AVO tab: Balance the spectra, before Match the stacks (a table of band centroid and half-power band, and a chart of the operators).
  - Gathers tab: a store's conditioned copies, or its source, can sit beside it.
  - The report gets both tables, the decision register lists the runs, and the help covers both.
- **Live check (QA account, synthetic 24 x 24 CDP survey with 24 offsets uploaded through Seismolord's upload path; tools/qi-benchmark gen-prestack.mjs, analyse-prestack.mjs, plan-r3-*.json):**
  - `radon_demultiple` took 0.79 s per gather (576 CDPs in 7.7 minutes). It removed 49 and 53 percent of the energy in the two windows holding the multiples, and under 1 percent in the windows with primaries only.
  - Read back through the Gathers panel (worker suite-3f9ab286b, after R3.6) and compared with the truth:
    - 24.8 dB of the multiples removed;
    - isolated primaries: A within 0.8 percent, B within 1.4;
    - the primary under a multiple: A from 27 to 6.0 percent error, B from 63 to 14.6;
    - negative control, a cut at 250 ms above the multiples: 0.0 dB removed and the AVO unchanged.
  - `fx_denoise` (0.03 s per gather): 5.6 dB of noise removed, intercepts within 2.5 to 4.6 percent.
  - The real-browser walk of the Gathers tab (Chromium, the Suite's own login, the real services) listed the conditioned copies and the multiple model beside the store and drew the panel. The QA account has no QI Studio licence, so the walk used a local route without the gate, uncommitted.
  - The test data was removed afterwards (eight worker files, the SEG-Y files and the panels).
- **Decisions:**
  - Conditioning writes new stores and never changes the input.
  - f-x works across offsets within a gather. Common-offset f-x across CDPs, and structure-oriented filtering, are deferred.
  - Radon is about a second per gather, so the area option is the pilot.
  - Balancing keeps each stack's band energy; Match the stacks then sets time, phase and scale.

### R3.4 Tie quality: Phase along the tie (engines #378, Suite #1170)
- `seismolord/tiePhase.js`: the constant phase in 300 ms windows (every 100 ms; exact window correlations from the whole-trace Hilbert transform, in the tieWarp convention), a correlation-weighted straight-line drift, the time-variant rotation, and the check: offered when the drift reaches 30 degrees and the correlation rises by 0.03 or more.
- Seismolord Synthetics has a Phase along the tie button, with an option to apply the time-variant phase to the display. The committed tie's QC keeps `phase_trend`. In QI Studio, Ties gets a Phase drift column, and a drift of 45 degrees or more is a medium issue.
- Gates: a known 10 to 70 degree drift is measured within 6 degrees per window. The time-variant phase gains over 0.03 of correlation for 60 degrees of drift and over 0.12 for 120. Negative controls: a constant phase is not offered; noise offers nothing; flipping the Hilbert sign fails the gates.
- **Decision:** a display and QC aid. Inversion keeps one wavelet per well or stack; a drifting tie is flagged so the target window is tied on its own.

### R3.6 Worker links for the browser (#1172; found by the live check)
- The worker signed the links it hands to the browser (the gather panel, the SEG-Y export) for its internal endpoint, http://seaweedfs:8333. The browser cannot resolve that host, so the Gathers tab and the SEG-Y export download never opened in production.
- Live recheck after the redeploy: the panels downloaded through storage.petrolord.com, and the SEG-Y export link returned 200 with all 511,504 bytes (EBCDIC header "C 1 Petrolord Suite export of dome_ieee.sgy").
- `makeLinkSigner` signs those two links for `S3_PUBLIC_ENDPOINT` (storage.petrolord.com); the worker's own reads and writes stay internal. They are the only signed URLs the worker returns: report PDFs and wavelet text are made in the browser, zone maps and pilot volumes are read through Supabase storage, and uploads are presigned by the edge function for the public host.

### R3.2 Deferred QI items (#1163)
- **Simultaneous inversion tie guard:** refused under a 0.3 correlation between the synthetic and the stacks at the wells, as post-stack is (#1154). The tie is recorded in `settings.wavelet_scale_tie` and shown on the tab. Gated: over 0.99 on the synthetic study, under 0.3 with foreign logs (refused).
- **F-10:** coloured blind runs record the polarity each held-out run took from its kept wells. It is shown in a Polarity used column of the blind table and in the blind-check description, which warns when the wells disagree.
- **F-2:** prepareWell compares the well's CRS tag with the volume's.
  - The same CRS places the well as before.
  - Another known CRS is converted: an EPSG:32631 well lands on the right trace of an EPSG:32630 volume; without the conversion (the negative control) it misses.
  - An untagged well or volume is placed with a note.
  - A local grid against another CRS is refused, with the reason.
- **Job warnings** (a few samples lost as nulls) show under each run on the Inversion, Simultaneous and Properties tabs.
- **AVO calibration:** the calibrated run is held until the wells comparison matches the stacks being computed. An older comparison without well positions must be rerun; before this, two of those cases sent an uncalibrated job silently.

### R3.3 Worker throughput (#1162, #1165, #1166, #1168)
- **Worker threads (#1162):** each job's handler runs in its own worker thread, so a CPU-heavy job no longer stalls another job's uploads. In tests the main-loop lag went from 1501 ms to 6 ms. `JOB_THREADS=0` runs jobs in the main thread as before, and the in-image selfcheck runs jobs through the bundled thread entry.
- **Link import by byte ranges (#1165):** the link is registered without a copy when its server serves ranges; linking a 26 MB file read 0.84 MB. A cropped conversion reads only the kept traces, once, into scratch, with bricks identical to the copy path. A link without range support is copied as before. A changed, expired or no-longer-ranged link fails with its reason.
- **#1166:** linked files do not count against the raw allowance. Migration 20261015200000, applied 2026-10-15 by the owner after second-engineer approval.
- **Cropped browser uploads (#1168):** each part is read in 8 MiB pieces into Blobs. In Chromium the renderer peak fell from about 1.49 GB to 238 to 292 MB, and the 1.18 GB test upload went from about 100 s to 25 s.

### R3.5 SEG-Y trace delay, F-5 (engines #376, Suite #1167)
- Seismolord honours the trace delay (byte 109, time scalar at byte 215) on every import path: browser, server, link and gathers.
  - A positive delay is put back as null samples above the trace; a negative one drops the samples before 0 ms.
  - Volumes keep the 0 ms axis, because every consumer assumes it, and crop windows are typed in true times.
  - Not applied, with a note: delays that differ between traces, depth files, and shifts under half a sample.
- Gates: 10 in the engines, where ignoring the delay (the negative control) puts events 40 ms out; 12 in the worker, where every path stores identical bricks.
- Volumes imported before this keep their old placement until reimported (the F3 stack in the QA account sits 4 ms early).

### Round 3: deploys, zip and recorded videos
- **Worker:** live suite-3f9ab286b+engines-d8f13dae5 (2026-10-15), with every round 3 kind and fix.
- **Next Suite zip** (after a3c457056) for the UI: #1163, #1165 (link-import copy), #1167, #1168, #1169, #1170.
- **Recorded QI videos and NextGen QI course steps** stay valid, since nothing was renamed or removed. These additions appear in new recordings:
  - the Prestack tab's Conditioning section;
  - the AVO tab's Balance the spectra above Match the stacks;
  - the wider Beside it list on the Gathers tab;
  - the Phase drift column on Well ties;
  - Polarity used in the blind table;
  - job warnings under runs;
  - the Phase along the tie button in Seismolord Synthetics;
  - the trace-delay note in the import dialog.

### Local workspace L1 (2026-10-15)
- QI jobs route by where their volumes live (`src/lib/localWorkspace/router.js`, through `qiService.enqueueJob`): a local volume's QC, post-stack inversion, AVO, stack matching, simultaneous inversion of angle stacks, property prediction, stack sampling and zone maps run in this browser with the seismic worker's own handler files, recorded in qi_jobs with executor 'browser' and the device; prestack gather kinds wait for Petrolord Local (after NAPE). The server queue never claims a browser row, and the enqueue RPC refuses a server job on a local volume (migration 20261016100000, applied).
- Setup tab: location badges on the volumes and a Local workspace card. Products of a local volume are registered local (no cloud quota, disk check).
- **Measured on Ekene (live, QA):** coloured inversion from a local copy (browser) and a cloud copy (server) have equal brick roots and identical blind-well tables; model-based was refused identically on both sides by the wavelet-scale tie guard (the bench wells were synthetic). Ten attribute volumes equal brick for brick (Seismolord status).
- Pilot readiness (decision 8): five 80 GB angle stacks plus velocity import locally with zero upload (about 20 min each at the measured 69 MB/s on the worker host; the owner's laptop drive sets the real figure); QC, attributes, post-stack and simultaneous inversion, AVO and properties then run locally.
