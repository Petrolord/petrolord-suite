# Seismolord — Phase 6 hardening results

## RLS penetration test (executed 2026-07-10, live DB, rollback-wrapped)

Script: `tools/validation/seismolord/rls-pentest.sql`. Roles simulated
via `request.jwt.claims` + `set local role authenticated`. User A =
a real `auth.users` id; user B = a different uuid.

| Check | Expected | Result |
|---|---|---|
| B reads A's `seismic_volumes` | 0 | **0** ✓ |
| B reads A's `seismic_horizons` | 0 | **0** ✓ |
| B reads A's `seismic_faults` | 0 | **0** ✓ |
| B reads A's `seismic_exported_surfaces` | 0 | **0** ✓ |
| A reads own rows (control) | 1 each | **1 each** ✓ |
| B updates A's volume / deletes A's horizon | 0 rows | **0 / 0** ✓ |
| B inserts row claiming `user_id = A` | 42501 | **42501** ✓ |
| B reads A's `seismic` storage objects | 0 | **0** ✓ |
| B inserts object under A's storage path | 42501 | **42501** ✓ |

All four product tables and the Storage bucket enforce user isolation.
Re-run after any RLS/policy change.

## Memory-discipline soak (jest `soak.test.js`)

- **Always-on**: 139 MB virtual volume transcoded under a **32 MiB**
  engine budget — multi-band, multi-pass, `peakBytes ≤ budget`. Runs
  every CI.
- **Full (SEISMOLORD_SOAK=1)**: 1000³-sample virtual volume (~4.24 GiB,
  4096 bricks) under a **256 MiB** budget; asserts the ceiling holds and
  all 1,000,000 traces stream through. The virtual reader synthesizes
  bytes on demand, so no 4 GB file or 4 GB of RAM is needed.

## Storage object-count / egress analysis (decision: keep per-brick for now)

Per-brick objects are 64³ float32 = **1.0 MiB** each. Object counts:

| Volume | Samples | Bricks (objects) |
|---|---|---|
| 200³ | 8.0 M | 64 |
| 500² × 500 | 125 M | 512 |
| 1000³ | 1.0 B | 4,096 |
| 2000² × 2000 | 8.0 B | 32,768 |

A scrub touches one brick-plane per slice: a 1000³ inline is
`nj × nk = 16 × 16 = 256` bricks = 256 MiB cold, then cached. This is
acceptable through ~1000³. **Recommendation**: keep individual brick
objects (plan decision #4) until a real volume exceeds ~2000³ or Storage
egress cost becomes material; the escalation is packed brick files with
HTTP Range reads (manifest already versioned, so a v2 layout is a clean
additive change). Signed-URL batching is NOT needed — the owner-path RLS
lets the client GET bricks directly with its JWT.

## Per-user storage quota (server-enforced since 2026-07-12)

`STORAGE_QUOTA_BYTES = 20 GiB` in `ingestService.js` remains the friendly
client layer: a new ingest sums recorded `survey_meta.storage_bytes` and
refuses up-front with a clear message; resumed ingests skip the check.

The AUTHORITATIVE layer is migration
`20260712120000_seismic_storage_quota.sql` (the recorded escalation, now
done): the `seismic` bucket's INSERT policy gates on
`seismic_storage_usage_bytes() < seismic_storage_quota_bytes()` — usage
summed live from `storage.objects` metadata under the caller's own
folder, no counter table to drift. UPDATE/DELETE stay quota-free so an
over-quota user can still save manifests/horizons and delete volumes.
Verified live (rollback-wrapped): under-quota insert allowed and counted;
after a fake 20 GiB object the next insert fails 42501; nothing persisted.
If the per-insert sum ever profiles hot, the next escalation is a
usage-counter table maintained by storage triggers.

## WebGL context-loss recovery

`SliceRenderer` marks the context restorable on `webglcontextlost`,
rebuilds every GL object on `webglcontextrestored`, and re-renders the
last slice. Verified in the self-test via `WEBGL_lose_context`:
lose → restore reproduces the pre-loss framebuffer bit-for-bit.

## Malformed-SEG-Y handling

`malformedSegy.test.js` — 11 mutation cases (empty/tiny, zero traces,
bad/unsupported format code, ns lies, mid-trace truncation, garbage,
irregular grid, mid-stream header/grid mismatch) all fail with plain
`Error` messages, never a raw `RangeError`, never a hang.

## Oriented display fixture

The self-test now renders a pure depth gradient and asserts red-top /
blue-bottom (time increases downward) — the screen-convention class of
check the GPU==CPU comparison structurally cannot catch (it is what let
the Phase 2 time-upward bug through).

## Hostile-senior review (Phase 6)

A full adversarial pass read every Seismolord file plus the two RCP
handoff touch-points. It confirmed the numerics core (decode / transcode
/ slice / track / grid / export) as solid and correctly handling the
tricky cases it probed (coord scalar 0/1/positive, il/xl step > 1
end-to-end, partial trailing bricks, descending corner coordinates,
worker request-id guards, RLS + FK cascades, storage-path traversal from
UUIDs only, XSS via React JSX + sanitized download names).

**Fixed this phase** (2 HIGH, 5 MEDIUM):
- H1 RCP handoff unit mismatch (feet imported as metres); H2 ingest
  ack backpressure released all pending acks on one completion; M1
  selectVolume stale-request guard; M2 RCP buildSurface spread crash +
  southern-strip truncation; M3 long-job token refresh on 401; M4 AI
  NaN/blank-arg validation; M5 AI edge-fn role filtering + size cap.

**Deferred follow-ups — ALL FIXED 2026-07-12** (hardening-backlog pass):
- ML1 aborted brick fetches now leave `inflight` synchronously; a racing
  get() starts a fresh fetch instead of reusing the doomed promise
  (jest-covered in viewerData).
- ML2 ImportPanel scans carry a last-wins sequence guard.
- ML3 AiPanel terminates its autotrack/grid workers on unmount
  (panel-level AbortController; gridHorizonSurface takes a signal).
- ML4 slices are tagged with their index; SliceView draws overlays at
  the DISPLAYED slice's position and none at all without a slice.
- ML5 exportGridSpec clamps bad cells to the bin and refuses > 4M nodes
  with the minimum usable cell named; Export panel gained Cancel.
- L1 horizon/export deletes check the storage-remove result (row kept on
  failure — retryable, no stranded blobs). L2 writeCPS3 refuses all-null
  grids (no Infinity FSLIMI). L3 sampled previews inspect adjacent trace
  pairs so step gcds cannot overestimate. L4 AiPanel chat/history and
  the viewer grid cache are bounded. L5 RCP isNullZ matches sentinels
  exactly (no 1e-6 window). L6 dome_step golden fixture (il/xl steps
  2/3, azimuth-180 descending coordinates) covered end-to-end. L7
  viewers already resize via ResizeObserver (post-P6 viewer rework);
  deleting a volume now clears the viewer selection instead of 404-ing.

## Recorded follow-ups (predate Phase 6)

DONE since: rotated-survey geometry (measured affine), fault-aware
gridding (blocked TPS), server-side quota enforcement
(20260712120000_seismic_storage_quota.sql).

Still open: RCP's ZMAP+/CPS-3 grid-body import; packed-brick storage
layout when volumes outgrow per-brick objects; ingest resume UI (with a
file-identity check before reusing a volume id).
