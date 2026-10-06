# QI Build Programme: STATUS

Plan of record: `docs/scope/QI-PLAN.md` (approved 2026-10-05).

## Phase status

| Phase | State |
|---|---|
| Q0 Seismic worker foundations | DONE: merged #891 (main 728a53b7e), 2026-10-06 |
| Q0b Seismolord on the worker | Built on feat/qi-q0b: server attributes (live), housekeeping, import from a link, storage tiers, fair scheduling; two migrations for the owner to apply |
| Milestone A (Q1, Q2, Q4a, Q6a) | Not started |
| Milestone B (Q8a, Q9a, Q10, Q11) | Not started |
| Milestone C (Q3, Q4b, Q5, Q6b, Q7, Q8b, Q9b) | Not started |
| Q12 Benchmark and tester waves | Not started |

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
