# QI Build Programme: STATUS

Plan of record: `docs/scope/QI-PLAN.md` (approved 2026-10-05).

## Phase status

| Phase | State |
|---|---|
| Q0 Seismic worker foundations | In progress: server, object store, worker core, queue, uploads built and tested; owner setup pending; stack_to_v4 job and jobs panel next |
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

### Owner setup (pending)
`bash /root/qi-q0-owner-setup.sh`:
1. applies both migrations;
2. sets the function secrets;
3. deploys `qi-upload-url`;
4. writes the worker's `.env` on the host.

No secret value is printed.
