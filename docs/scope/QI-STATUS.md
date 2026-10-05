# QI Build Programme: STATUS

Plan of record: `docs/scope/QI-PLAN.md` (approved 2026-10-05).

## Phase status

| Phase | State |
|---|---|
| Q0 Seismic worker foundations | Acceptance met 2026-10-05 (10 GB upload, cross-browser resume, server conversion verified); full jest then merge of #891 |
| Q0b Seismolord on the worker | Not started |
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
