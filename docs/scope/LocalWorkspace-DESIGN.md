# Local workspace mode for Seismolord and QI Studio: design note

**Status:** L0 DONE and L1 BUILT (2026-10-15). The owner decided section 11 on 2026-10-15
(section 13). L2 (Petrolord Local) and L3 wait until after NAPE. Results: section 14 (L0) and
section 15 (L1).

**Scope:** Seismolord (seismic interpretation) and QI Studio. Other Geoscience apps only
read what these two publish.

**Related documents:** `docs/scope/QI-PLAN.md` (worker, storage split, validation rules),
`docs/scope/QI-STATUS.md`, `docs/scope/Seismolord-STATUS.md`,
`docs/scope/Seismolord-LARGE-SURVEY-PLAN.md` (v4 bricks, local slice source, spool),
`docs/scope/SuiteProject-DESIGN.md` and `docs/scope/SuiteProjects-GUIDE.md` (Client >
Project scoping), `docs/scope/ProjectPortability-PLAN.md` (.pld).

---

## 1. Why

The owner, 2026-10-15:

> "A platform like Petrel makes it look so easy to import seismic and generate as many
> additional seismic volumes as possible. I think it is because the seismic volumes are
> stored in the users' hard drive and not on a server."

That is right. Petrel, Kingdom and OpendTect keep bulk seismic on local or network disk
(ZGY, SEG-Y, CBVS) and run attribute and inversion jobs on the workstation. The project
database holds the interpretation. Petrolord today sends every byte to our servers first.

The arithmetic for a real study on the owner's link (0.8 to 1 MB/s upload):

| Data | Size | Upload at 1 MB/s |
|---|---|---|
| One angle stack | about 80 GB | about 22 hours |
| Five angle stacks | about 400 GB | about 4.6 days, nonstop |
| Velocity volumes | about 100 GB | about 28 hours |
| Generated volumes (say 10 attributes and inversions of one stack) | about 800 GB float | never practical |

Crop before upload (built 2026-10-14, `seismic-crop-build`) cuts this by the cropped
fraction, and the server path is right for teams on fast links. A consultant on a typical
Nigerian or field link still cannot move a full study. Reading the same 80 GB stack from
a local SSD takes about 20 minutes at the 68 MB/s the crop reader measured on 2026-10-14,
and a modern NVMe drive is faster still. Many consultants are in the same position, and
for many clients the data may not leave the consultant's machine at all.

**The idea:** heavy bytes live where they were delivered, on the user's disk, and heavy
jobs run next to them. The cloud keeps what is small and shared: volume metadata and
manifests, provenance, interpretations (horizons, faults, picks), wells, result summaries,
Suite Projects scoping, sharing and the audit trail.

## 2. Goals, non-goals, user stories

### Goals
1. Import a SEG-Y of any size from local disk with zero upload, and view it in seconds.
2. Generate attribute, post-stack inversion and (with the helper) prestack products locally,
   as many as disk allows, with the same engines and the same bit-for-bit results as the
   server worker.
3. Keep every interpretation, every provenance record and every audit entry in the cloud,
   governed by the existing RLS and Suite Projects rules.
4. Let a team share one project where some volumes live on one member's machine, with a
   clear and honest view of where each volume is.
5. Work offline for days (rig, field office) and reconcile on reconnect without losing or
   silently overwriting anyone's work.
6. Keep the server path as it is. A project can mix local and cloud volumes.

### Non-goals
- A desktop app that replaces the browser. The Suite UI stays a web app; the helper has no
  interpreter UI of its own beyond a tray menu and a status page.
- Peer-to-peer file sharing between users' machines in the first three phases.
- Reading Petrel ZGY or other vendor formats (a separate programme, as in the .pld plan).
- New maths. Every job is an existing engine function from `/root/petrolord-engines`
  (seismolord, qi, rockphysics), vendored as today.
- Any change to shared tables (organizations, users, invitations, onboarding).

### User stories
- **Consultant on a slow link (Ayo).** Receives five angle stacks and velocities on a USB
  drive from a client. Chooses a project folder on his D: drive, imports all six files in an
  afternoon with no upload, crops nothing, generates relative impedance, envelope and
  coherence on each stack overnight, and interprets horizons that save to the cloud as
  usual. His cloud quota shows 0 bytes used by these volumes.
- **A team sharing one project (Ayo and Ekene).** Ekene opens the same Suite Project. He
  sees every volume in the list, with "Lives on Ayo's PC, last seen 2 hours ago" on the
  local ones. He sees Ayo's horizons on the map and in 3D at once, because those are cloud
  rows. To see the seismic he can (a) attach his own copy of the same client file (the
  content hash matches and the volume becomes local for him too), (b) ask Ayo for a cloud
  copy of the display version, or (c) open it from the cloud if Ayo already promoted it.
- **Offline laptop on a rig.** A geologist imports a cropped stack before flying out, works
  for a week with no link, picks horizons and runs attributes. Edits and job records queue
  locally. On reconnect they replay; any clash with a colleague's edit becomes a new
  horizon version, never an overwrite.

## 3. Storage options

All four keep the same on-disk layout (section 5.3), so a volume written by the browser can
later be used by the helper and the reverse.

### 3.1 Comparison

| | File System Access API (user-chosen folder) | Origin Private File System (OPFS) | IndexedDB | Local helper, plain disk |
|---|---|---|---|---|
| **Where the bytes are** | A real folder the user picks (any drive, external SSD, network share) | A hidden per-origin store inside the browser profile | Per-origin database inside the profile | Any folder the helper is allowed to use |
| **Capacity** | The disk | Per-origin quota (below) | Same per-origin quota as OPFS | The disk |
| **Persistence** | Survives clearing site data and browser reinstall; the user can see, back up and move it | Lost with "clear site data", a profile reset or eviction (unless persisted) | Same as OPFS | Survives everything short of the user deleting it |
| **Eviction risk** | None (the browser never evicts user files) | Yes, under storage pressure, unless `navigator.storage.persist()` is granted; Safari also deletes script-written data of sites not used for 7 days of browser use | Same as OPFS | None |
| **Write speed** | Good for write-once files; each `createWritable()` writes a swap file then moves it, so small random rewrites are slow | Fastest in the browser: `createSyncAccessHandle()` in a worker writes in place | Slow for large binary payloads; structured-clone cost on the main thread | Native |
| **Permission UX** | Folder picker once; a re-prompt each visit unless the user chooses "Allow on every visit" (Chrome 122+) | None | None | Install once; pairing once |
| **Browsers** | Chrome 86+, Edge 86+ (Chromium). Not Firefox. Not Safari. | Chrome 86+, Edge, Firefox 111+, Safari 15.2+ | All | Any browser that can reach localhost (section 6.4) |
| **Visible to other tools** | Yes (the helper, backup software, a file manager) | No | No | Yes |

**Per-origin quotas** (MDN, "Storage quotas and eviction criteria"):
- **Chrome and Edge:** up to 60% of total disk per origin, best-effort and persistent
  alike; the browser as a whole up to 80%. On a 1 TB laptop that is about 600 GB.
- **Firefox:** best-effort is the smaller of 10% of disk or 10 GiB per site group;
  persistent (after a permission prompt) is up to 50% of disk, capped at 8 TiB.
- **Safari 17+ (macOS 14+, iOS 17+):** about 60% of total disk per origin in the browser
  app, 80% across all origins; about 15% in an embedded WebView. Earlier Safari versions
  start at 1 GiB and ask for more.
- When an origin is evicted, all of its storage goes at once (OPFS, IndexedDB, Cache).
- Quotas are computed from total disk size, so on a full disk an origin may never reach its
  quota. `QuotaExceededError` is thrown when it does.

### 3.2 What Seismolord already has
- `services/brickSpool.js`: an OPFS spool (one directory per volume, one file per brick,
  JSON records) used by the two-stage upload, so the raw SEG-Y is read once.
- `services/brickStore.js`: an IndexedDB brick cache (512 MB budget, LRU, v2 split stores).
- `engine/brickCache.js`: the `BrickFetcher` interface; every viewer and compute path reads
  bricks through it. A local fetcher plugs in here.
- `LocalSegySource`: inline and crossline straight from the picked file, before conversion.

So the browser can already read a local SEG-Y and hold bricks locally. What it lacks is a
durable, user-visible home for volumes and a cloud record that says "this volume is local".

### 3.3 Recommendation
- **Primary (Chrome and Edge):** a **workspace folder** through the File System Access API.
  The user picks one folder per machine (for example `D:\Petrolord`); each project gets a
  subfolder. Handles are kept in IndexedDB and re-granted with "Allow on every visit".
- **Fallback (Firefox and Safari):** OPFS with `persist()` requested, a clear banner ("This
  browser keeps local volumes inside its own storage; clearing site data deletes them; for
  large studies use Chrome or Edge, or Petrolord Local"), and a soft size guide (warn above
  50 GB on Firefox without persistence).
- **IndexedDB:** small state only (handles, the offline edit queue, job checkpoints) and the
  existing brick cache. Never volumes.
- **Petrolord Local (L2):** plain disk, for prestack data, multi-hundred-GB studies, and
  every browser.

## 4. Compute options

### 4.1 In the browser
- **Web Workers (today).** `workers/volumeJob.worker.js` already runs `runVolumeJob` and
  `runNeighborhoodJob` one brick column at a time with bounded memory, and
  `slice.worker.js` assembles slices. L1 fans brick columns across
  `navigator.hardwareConcurrency - 1` workers (about 7 on an 8-core laptop) and writes the
  output bricks to the local store in place of the upload.
- **Fits the browser well:** every per-trace attribute (envelope, phase, frequency, RMS,
  AGC, sweetness), neighbourhood attributes (coherence, dip, curvature) at a slower rate,
  post-stack model-based and coloured inversion (`engines/qi/inversion.js` is per trace
  with an LFM), property prediction, zone maps and seismic QC on stacks.
- **WASM.** The QI plan already allows WASM "only behind the same golden tests". A WASM
  SIMD build of the FFT and convolution kernels typically gives 2 to 4 times on these
  loops. It is an optimisation inside L1, with byte-for-byte goldens against the JS path.
- **WebGPU.** Feasible for coherence, semblance, spectral decomposition and dense
  inversion, and shipped in Chrome and Edge desktop, with Firefox and Safari following on
  some platforms (MDN marks it Limited availability, secure contexts only). Two problems:
  GPU float maths does not reproduce the CPU result bit for bit (fused multiply-add and
  reduction order differ), which breaks the locked rule that a preview equals the server
  run; and buffer limits (default `maxStorageBufferBindingSize` 128 MiB) force tiling.
  **Recommendation:** no WebGPU in L1 to L3. Revisit only for display-time previews with
  tolerance goldens and a separate `qi_class` note.
- **Limits that push work to the helper:** a tab must stay open; laptops sleep; Chrome
  discards tabs under memory pressure; one tab's memory is a few GB. Prestack work reads
  gathers that are 10 to 50 times the stack size, and simultaneous inversion and angle
  stacking are long, I/O-bound passes. These are possible in the browser in principle and
  fragile in practice.
- **Checkpointing:** every browser job writes a checkpoint per completed brick column, so a
  reload, crash or discarded tab resumes where it stopped (the ingest resume pattern).

### 4.2 Petrolord Local (a helper process)
The existing `worker/seismic-worker` packaged as a desktop process. It already runs every
heavy kind (`stack_to_v4`, `attribute_volume`, `poststack_inversion`, `ingest_gathers`,
`angle_stacks`, `avo_volumes`, `prestack_inversion`, `prestack_qc`, `trim_gathers`,
`match_stacks`, `export_segy`, `zone_maps`, `gather_panel` and the rest) through one handler
registry, `createHandlers(deps)`. Local mode swaps the dependencies:

| Dependency | Server worker today | Petrolord Local |
|---|---|---|
| Queue | Polls `qi_jobs` with the service role, claim by conditional PATCH | An in-process queue fed by the browser over localhost; each job mirrored to `qi_jobs` with `executor = 'local'` for audit |
| Input bytes | `s3RangeReader` over SeaweedFS | A file `ByteReader` over local SEG-Y and gather stores |
| Output bricks | Upload to the Supabase `seismic` bucket | Write to the workspace folder |
| Database writes | Service role, with ownership and quota checks in the handler | The user's own JWT, so RLS checks everything; no service role ever ships |
| Quota | `seismicQuota` on the cloud pool | Free disk space check only |
| Threads | `worker_threads`, cores minus 2 | Same, with a user setting ("leave N cores free") |

The handler code and engines stay identical, so a local run and a server run of the same
job on the same input produce the same bricks, and provenance records the engine commit.

**Packaging.**
- `build.mjs` already bundles the worker with esbuild into one ESM file. Node's Single
  Executable Applications support ESM entry points (`"mainFormat": "module"`) and bundled
  assets, and Node 25.5+ builds the blob with `node --build-sea`. SEA is Stability 1.1
  (active development), so the build is pinned and tested per release.
- Alternatives: `pkg` (archived by Vercel; avoid), `@yao-pkg/pkg` (community fork; a
  fallback), Electron or Tauri (bring a UI runtime we do not need; Electron adds about
  100 MB). **Recommendation:** Node SEA, no Electron.
- Targets: Windows x64 and arm64, macOS arm64 and x64, Linux x64 (a tarball and an
  AppImage). One binary of about 90 to 110 MB each.
- **Per-user install, no admin rights:** Windows `%LOCALAPPDATA%\Petrolord\Local`, macOS
  `~/Applications`, Linux `~/.local`. A tray icon (start, stop, open status page, quit),
  start at login optional.

**Updates.**
- The helper checks a release manifest on our download host daily and at start. The
  manifest is signed with an Ed25519 key whose public half is built into the binary; the
  download's SHA-256 must match. The new binary is swapped in on the next restart, never
  mid-job.
- The browser calls `GET /v1/hello` and reads the helper's API version and engine commit.
  It refuses a helper older than the minimum API version with an "Update Petrolord Local"
  button, and warns when the helper's engine commit differs from the browser's (results
  would still be valid, but a preview might differ from the run in the last bits).

**Code signing, Defender and SmartScreen (the reality).**
- **macOS:** Apple Developer ID (99 USD a year), hardened runtime, notarisation. Without
  it Gatekeeper blocks the app for most users. Straightforward.
- **Windows:** an unsigned or newly signed binary shows SmartScreen's "Windows protected
  your PC" until it earns reputation. Microsoft's SmartScreen guidance now says EV
  certificates no longer give instant reputation, reputation is tracked per file hash (so
  every new build starts again), and it recommends Artifact Signing (formerly Trusted
  Signing) for apps outside the Store. Expect warnings for the first weeks of each release
  line; publish few, well-tested releases.
- **Defender false positives:** packed Node binaries are sometimes flagged. Submit every
  release to the Microsoft Defender submission portal before announcing it, and keep a
  short "if Windows warns you" help page.
- **Eligibility to check:** Artifact Signing requires identity validation of the publishing
  company, and its availability by country has been limited. Lordsway (UK contacts) may be
  the right publisher of record. Owner question (section 11).

**Corporate laptops.**
- Client-issued laptops often block unknown executables (AppLocker, WDAC, Jamf), forbid
  local listeners, or run EDR that flags a process opening a port. Petrolord Local will not
  run on many of them without IT approval. We provide: a signed MSI and PKG for IT
  deployment, a fixed publisher name, a one-page security sheet (localhost only, no inbound
  network, what it reads and writes), and the browser-only L1 path for everyone else.
- Enterprise Chrome policies can block the folder picker (File System Access guards) and
  Local Network Access (section 6.4). The UI detects both and explains which policy to ask
  IT about.

### 4.3 Job routing
Each job has an `executor`: `browser`, `local` (the helper) or `server` (the cloud
worker). Rules, in order:
1. Inputs that exist only locally force `browser` or `local`.
2. Prestack kinds go to `local` when a helper is paired, else to `server` if the inputs are
   in the cloud, else the UI explains that Petrolord Local is needed.
3. Post-stack kinds default to `local` if paired, else `browser`.
4. The user can override per job ("Run on: this computer / Petrolord servers").
5. Inputs in the cloud and a local executor: the job reads through the cloud fetchers and
   writes locally, so a user can pull a cloud volume's products to disk.

## 5. Data model and sync

### 5.1 What stays in the cloud
Everything except bulk samples:
- `seismic_volumes` row for every volume, local or cloud: name, `survey_meta`, the v4
  manifest (geometry, brick lattice, clip statistics, histogram), `kind`,
  `parent_volume_id`, `attribute_params`, crop provenance, `organization_id`,
  `suite_project_id`, sharing.
- `qi_datasets` rows for gathers and partial stacks, with header maps, geometry and fold
  summaries.
- Provenance: job id, parameters, engine commit, input ids, executor and device.
- Interpretations: `seismic_horizons`, `seismic_faults`, `seismic_line_picks`, exported
  surfaces, well ties, wells (`geo_wells*`), tops, surfaces (`geo_surfaces`).
- Result summaries: QC reports, inversion QC, zone maps, Data matrix rows, Report inputs.
- Suite Projects scoping and every RLS rule as built in P0 to P4.

The fold maps, clip histograms and small thumbnails (a decimated time slice and two lines,
under 2 MB) also go to the cloud, so a collaborator without the volume still sees what it
looks like.

### 5.2 Additive schema (product tables only; drafted in L1, applied staging-first)
- `seismic_volumes` gains `storage_location text check in ('cloud','local','both')`
  default `'cloud'`, `content_id text` (section 5.3), and `brick_root text` (the root hash
  of the per-brick hashes).
- New `seismic_devices`: `id`, `user_id`, `label` ("Ayo's PC"), `kind`
  (`browser_folder`, `browser_opfs`, `helper`), `last_seen_at`, `revoked_at`. A device is
  a user's install, so it is owner-scoped like every other user row.
- New `seismic_volume_replicas`: `volume_id`, `device_id`, `user_id`, `state`
  (`writing`, `ready`, `missing`, `deleted`), `verified_at`, `bytes`. One row per copy on a
  machine. RLS: read when you can read the volume; write your own rows only.
- New `seismic_copy_requests`: requester, volume, owner, `what` (`display`, `full`),
  `status`, timestamps.
- `qi_jobs` gains `executor text` default `'server'` and `device_id`. The server worker's
  claim filter adds `executor = 'server'`, so it never claims a local job.
- No shared-table change. All tables carry `organization_id` and `suite_project_id` and the
  P0 restrictive policies, so the Suite Projects rules apply unchanged. MIGRATIONS.md logs
  each file.

### 5.3 Local volume identity
Two levels, both already partly present:
- **Source identity.** Today `ingestResume.js` uses `sha256-sampled-64k-v1` (size plus
  first, middle and last 64 KiB). Fast, and good for resume, but it is a sample. L1 adds a
  full streaming SHA-256 computed during the scan pass, which already reads every byte, so
  it costs little (an incremental hasher in a worker; SubtleCrypto cannot hash
  incrementally). Stored as `source.sha256` in the manifest.
- **Volume identity (`content_id`).** A hash of: the source SHA-256, the header mapping, the
  crop definition, the codec version and, for derived volumes, the parent's `content_id`,
  the attribute or job parameters and the engine commit. Because the engines are
  deterministic and bit-for-bit, two machines that hold the same source and run the same
  recipe produce the same bricks. A team can share recipes and regenerate locally, with no
  bytes moved.
- **Verification.** The manifest gains a per-brick SHA-256 list and its root
  (`brick_root`). A replica is `ready` only when its bricks hash to the root. A
  collaborator's attached copy is checked the same way.

On-disk layout (identical for the browser folder, OPFS and the helper):

```
<workspace>/
  petrolord-workspace.json          workspace id, device id, format version
  projects/<suite_project_id>/
    volumes/<volume_id>/
      manifest.json                 the cloud manifest, cached
      packs/000001.pack ...         write-once pack files of encoded bricks (about 256 MiB each)
      packs/index.json              brick key to (pack, offset, length, sha256)
      state.json                    replica state, job checkpoints
    datasets/<dataset_id>/          prestack gather stores (engines/qi/gatherStore.js layout)
    sources/                        optional: links or copies of the original SEG-Y
```

Pack files exist because File System Access writes go through a swap file per
`createWritable()`: one file per brick would mean about 80,000 swap and move cycles for an
80 GB stack. Packs are written once, closed when full, and never rewritten; reads use
`getFile().slice()`.

**Disk planning rule** (to show in the import dialog): an imported float SEG-Y needs about
1.0 times its size for the computation copy (shuffle plus deflate saves little on seismic)
and about 0.3 times more for the u8 display copy with levels of detail. Each derived float
volume needs about 1.0 times the stack. Ayo's study (500 GB of SEG-Y plus ten derived
volumes of one stack) needs about 1.5 TB. The source SEG-Y can stay on the USB drive.

### 5.4 Volumes that live on someone else's machine
A collaborator opening the project sees the row (RLS permits it) and the replicas. Choices:
1. **"Lives on Ayo's PC, last seen 2 h ago."** Horizons, faults, thumbnails, fold maps and
   QC summaries all show; the seismic panel shows the thumbnail and the actions below.
2. **Attach my copy.** The collaborator picks the same SEG-Y (for example from the same
   client delivery); if the source SHA-256 and recipe match, the import creates a replica of
   the same volume and no duplicate row. Derived volumes can then be regenerated from
   their recipe in one click.
3. **Request a cloud copy.** Creates a `seismic_copy_requests` row and a notification to
   the owner. The owner's browser or helper uploads the display copy (u8 with levels of
   detail, about a quarter of the float size) or, if asked, the full float copy, through
   the existing resumable upload. A crop can be applied to the copy.
4. **Proxy (deferred).** Streaming bricks from Ayo's helper to Ekene through a relay is
   technically possible (only the viewed bricks move) but needs Ayo's machine online, Ayo's
   upload link, and a relay we operate. On a 1 MB/s uplink a full-resolution inline is tens
   of seconds. Not in L1 to L3; revisit if teams ask.

### 5.5 Promotion to the cloud, and conflict rules
- **Promote:** upload the display copy, the float copy or both. The row becomes `both`.
  The copy counts against the cloud quota from then on, and the existing over-quota rules
  apply (refused before upload, never deleted).
- **Demote:** remove the cloud copy and keep the local one, back to `local`.
- **Volumes are immutable once ready.** Bricks are never rewritten, so there is no content
  conflict. Reprocessing creates a new volume with a new `content_id`.
- **Metadata** (name, description, sharing): last writer wins, every change logged.
- **Interpretations:** the cloud is the source of truth. Offline edits queue with the
  `interp_rev` they were based on. On replay, if the row moved on, the edit is saved as a
  new version (`seismic_horizons.version`, `parent_version_id`, which exist today) and both
  interpreters are told. Nothing is overwritten.
- **Deletes:** deleting a local replica never deletes the row. Deleting the row (owner or
  admin) leaves local packs in a `trash/` folder for 30 days. When the last replica is gone
  the row shows "No copy available" and its interpretations stay.

## 6. Security and privacy

### 6.1 Petrolord Local authentication
- **Bind** to `127.0.0.1` and `::1` only, on a fixed default port with a fallback range.
  No other interface, no inbound ports, no UPnP. The helper makes outbound HTTPS calls to
  Supabase and our download host only.
- **DNS rebinding:** reject any request whose `Host` header is not `127.0.0.1:<port>`,
  `[::1]:<port>` or `localhost:<port>`.
- **Origin allowlist:** `https://petrolord.com`, `https://www.petrolord.com` and
  `https://suite.studio.petrolord.com` (staging). Requests without an `Origin`, or with
  another one, are refused. CORS echoes only the allowlisted origin.
- **CSRF:** no cookies at all. Every call carries `Authorization: Bearer <session token>`
  and a JSON content type, so a cross-site form or image cannot trigger a call and every
  real call needs a CORS preflight, which the allowlist answers.
- **Pairing (once per browser profile):** the helper shows a 6-digit code in its tray
  window; the user types it into the Suite; the browser posts it and receives a 256-bit
  device secret, kept in IndexedDB. Five wrong codes and the code is replaced. A device can
  be revoked from the Suite (`seismic_devices.revoked_at`) or the tray.
- **Per-session token:** at each Suite load the browser answers a helper challenge with an
  HMAC of the device secret and gets a session token valid for 12 hours, held in memory.
- **Same user check:** the browser also passes its Supabase JWT; the helper validates it
  with Supabase and refuses if the user differs from the paired user. The helper stores
  its own refresh token in the OS keychain (Windows Credential Manager, macOS Keychain,
  libsecret) and never holds a service role key.
- **File sandbox:** the helper reads and writes only inside folders the user added in its
  settings or picked in its own native dialog. The browser refers to files by id, never by
  path, so a compromised page cannot read arbitrary files.
- **Rate limits and size limits** on every endpoint; structured local logs without data.

### 6.2 Client confidentiality, a benefit
Bulk seismic never leaves the consultant's machine unless the user promotes it. That suits
clients whose data agreements forbid third-party cloud storage. The cloud holds geometry,
statistics, thumbnails and interpretations; the thumbnail upload is a project setting
("Upload previews of local volumes", on by default, off for strict clients). Petrolord
cannot recover local data: the UI and the terms say so, and recommend disk encryption
(BitLocker, FileVault) and the user's own backups.

### 6.3 RLS and Suite Projects still govern the metadata
Every cloud write from the browser or the helper uses the user's JWT, so the same
policies decide: owner and org sharing on `seismic_*`, `qi_*` RPC checks, the P0 to P4
restrictive project policies, members-only projects, admin access logging. A non-member
does not see that a local volume exists. A revoked member's helper stops at the next token
refresh. Local files are outside RLS by nature; what RLS protects is everything shared.

### 6.4 Browser rules on reaching localhost
- **Chrome 142+ Local Network Access:** a public HTTPS site calling `127.0.0.1` triggers a
  permission prompt ("Look for and connect to any device on your local network"). The
  Suite asks for it at pairing time with an explanation first, and sends
  `fetch(url, { targetAddressSpace: 'local' })`. Enterprises can pre-allow origins by
  policy.
- **Mixed content:** Chrome and Firefox treat `http://127.0.0.1` as potentially
  trustworthy. Safari's handling of HTTP loopback from an HTTPS page must be tested in the
  L0 spike; if Safari blocks it, Safari users get the browser-only path, and we do not
  install a local root certificate to work around it.

### 6.5 Audit trail continuity
- Every local job writes its `qi_jobs` row (`executor = 'local'` or `'browser'`,
  `device_id`, engine commit, inputs, parameters, timings) when it starts and ends.
- Offline, the rows queue with local timestamps and replay on reconnect with
  `recorded_offline = true` in `params`, so the audit shows both when it happened and when
  the cloud learned of it.
- Replica events (created, verified, missing, deleted, promoted) go to the replica table
  with timestamps. Reports cite the executor and device for every product.

## 7. UX

- **Per project:** Project settings gain "Seismic storage: Cloud / This computer / Both"
  (default Cloud, so nothing changes for existing users). Per import and per job the user
  can override.
- **Workspace folder:** a one-time "Choose a folder for local seismic" step with free
  space shown, and a per-machine label ("Ayo's PC") that colleagues will see.
- **Import from disk with no upload:** the import dialog shows two buttons, "Keep on this
  computer" and "Upload to Petrolord", with the time each will take at the measured link
  speed and disk needed ("Keep: about 25 min, 105 GB on D:. Upload: about 22 h"). The crop
  step works the same for both.
- **Volumes list (Seismic Explorer, QI Data):** a location badge on every row: "This
  computer", "Cloud", "Both", or "Ayo's PC". A filter by location. Replica details in the
  row's info panel.
- **Jobs:** the existing `QiJobsPanel` shows "Runs on: this browser / Petrolord Local /
  Petrolord servers" with a selector, and a warning on browser jobs that the tab must stay
  open (with a "Keep awake" option using the Screen Wake Lock API).
- **Storage meter:** splits "Cloud: 12 GB of 250 GB" and "This computer: 640 GB, 1.2 TB
  free".
- **Petrolord Local status:** a small indicator in the ribbon (connected, version, cores in
  use, jobs running), and a help page for install, pairing and Windows warnings.
- Copy follows the house style: plain sentences, no em dashes, no contrastive slogans.

## 8. Integration with existing features

| Feature | Local workspace behaviour |
|---|---|
| **Crop** (`segyCrop.js`, `seismic_crop_definitions`) | Unchanged and still useful: a crop saves disk and time. Named crops are cloud rows, so a team crops five stacks identically on different machines. |
| **Pilot runs** (`manifest.pilot.bricks`) | Run locally in seconds, then the full run locally or on the server. A pilot on a local parent is a local derived volume. |
| **QI jobs** | All kinds through the router (section 4.3). Prestack kinds need the helper or cloud inputs. |
| **Data matrix** (QI Data tab, Petro Inventory) | Gains a Location column and a "Not on this computer" state; counts stay correct because rows are cloud rows. |
| **Report** | Provenance lines name executor, device label and engine commit; thumbnails come from the cloud previews, so a report renders on any machine. |
| **.pld export** | Two options: "Reference volumes" (default for local volumes: metadata, recipes, `content_id`, thumbnails; the receiver attaches the source SEG-Y and regenerates) or "Include volumes" (bricks streamed into the package on local disk through the File System Access streaming writer, so a 200 GB package never touches our servers). Import of a referenced package creates placeholder rows. |
| **SEG-Y export** (`export_segy`) | Runs locally and writes next to the workspace. |
| **Storage tiers and pricing** | Local bytes never touch Supabase storage or SeaweedFS, so `seismic_storage_usage_bytes()` does not count them and the pooled quota is unaffected. Promotion counts from the moment of upload. |
| **Tops to Horizons, horizon tracking, faults** | Read local bricks through the local fetcher, write interpretation to the cloud as today. |
| **Suite Projects** | Workspace subfolders per project; switching project switches the local folder. Copy and move between projects move rows; local packs move on the machines that hold them, on next open. |

**Is a local workspace a paid feature?** Options for the owner (section 11):
- (a) Included in Seismolord and QI Studio. Local work costs us almost nothing: viewing
  egress is our largest seismic cost (55 to 210 USD per TiB-month on Supabase), and local
  volumes have none. It is also the strongest answer to "Petrel makes this easy".
- (b) Browser local mode included; Petrolord Local as a paid per-seat add-on.
- (c) Local mode only on paid storage tiers.
Recommendation: (a) for L1 and L2, revisit after the pilot with real usage.

**Offline entitlement:** the browser and the helper cache a signed entitlement (Ed25519,
issued by an edge function, valid 14 days) so a rig laptop keeps working offline.

## 9. Phased plan

Sizes: S up to 1 week, M 2 to 3 weeks, L 4 to 6 weeks, XL 7 to 10 weeks, for one agent
stream with owner reviews. Each phase follows the house rules: engines first, goldens,
negative controls, migrations staging-first and owner-applied, merge on green.

### L0: spike (S, about 4 days)
Measure before building: File System Access pack write and read speed on Windows NTFS and
macOS APFS (target over 300 MB/s on NVMe), OPFS sync-handle speed on Firefox and Safari,
the Chrome Local Network Access prompt from the staging origin, Safari loopback from
HTTPS, a Node SEA build of the worker on three OSes, and a first SmartScreen and Defender
reading of an unsigned build. Output: a short results section appended to this note.

### L1: browser-local storage and browser compute (L, about 5 to 6 weeks)
- `LocalVolumeStore` with three backends (workspace folder, OPFS, memory for tests), pack
  writer and index, `localBrickFetcher` behind `BrickCache`.
- Import from disk with no upload: the existing scan and v4 transcode write to the store;
  full SHA-256 during the scan; manifest and row to the cloud.
- Attributes, post-stack inversion, property prediction and zone maps on local parents,
  across several workers, writing locally, with checkpoints.
- Migration: `storage_location`, `content_id`, `brick_root`, `seismic_devices`,
  `seismic_volume_replicas`, `qi_jobs.executor` and `device_id`, server claim filter.
- UI: project setting, workspace folder step, import choice with time and disk estimates,
  location badges, split storage meter, job "runs on".
- "Lives on Ayo's PC" placeholder with thumbnails and interpretations.

**Acceptance (L1):**
1. Import an 80 GB float SEG-Y from local disk in Chrome on Windows with zero bytes of
   seismic uploaded (proved by the network log and an unchanged cloud quota), first inline
   on screen under 10 s, conversion done in under 60 minutes on the reference laptop.
2. Generate N = 10 attribute volumes from that stack overnight; each matches a server run
   of the same job on a cropped copy brick for brick (`brick_root` equal); a deliberately
   altered brick fails verification (negative control).
3. Close the browser, reboot, reopen: every local volume opens with no re-import and no
   permission dialog beyond one "Allow on every visit".
4. Kill the tab mid-job: the job resumes from its last brick column.
5. A colleague in the same Suite Project sees the volume as "Lives on <label>", its
   horizons and thumbnail; a non-member of a members-only project sees nothing (pentest).
6. Firefox and Safari: OPFS path works for a 5 GB volume with the warning banner; a
   cleared site data case is shown honestly as "missing", never as silent corruption.

### L2: Petrolord Local helper (XL, about 8 to 10 weeks)
- Local dependency set for `createHandlers` (file reader, workspace writer, user-JWT
  Supabase client, in-process queue, `qi_jobs` mirroring).
- Localhost API (`/v1/hello`, pairing, session, jobs, file roots, status), with every
  protection in section 6.1 and a security test suite (wrong Host, wrong Origin, no token,
  replayed token, revoked device, path escape).
- SEA packaging for five targets, signing and notarisation, signed update manifest, MSI
  and PKG, tray app, help pages.
- Prestack locally: `ingest_gathers`, `trim_gathers`, `prestack_qc`, `angle_stacks`,
  `avo_volumes`, `prestack_inversion`, `match_stacks`, `export_segy`.
- Router: helper preferred when paired.

**Acceptance (L2):**
1. Install on a clean Windows 11 laptop without admin rights, pair in under 2 minutes,
   survive a reboot.
2. Ingest a 200 GB gather file from local disk, build five angle stacks and run prestack
   inversion locally; results equal the server worker on a cropped copy, brick for brick.
3. Security suite passes; a request from another origin, a rebinding hostname or a page
   without the token is refused; the helper never listens on a non-loopback address
   (checked with `netstat`).
4. An update is downloaded, verified and applied on restart; a tampered manifest is
   refused.
5. Signed builds pass Gatekeeper; the SmartScreen and Defender state of each release is
   recorded.

### L3: sync and collaboration polish (L, about 4 to 5 weeks)
- Attach my copy (hash match), regenerate derived volumes from recipes.
- Copy requests and promotion (display or full, cropped or not), demotion.
- Offline edit queue for horizons, faults and picks with version-on-conflict, offline job
  records, entitlement cache.
- `.pld` reference and include modes for local volumes.
- Data matrix and Report integration, trash folder and missing-replica handling.

**Acceptance (L3):**
1. Two users on two machines with the same client SEG-Y end with one volume row and two
   verified replicas; a derived volume regenerated on the second machine has the same
   `brick_root`.
2. A laptop offline for 7 days with 50 horizon edits reconnects: every edit lands; two
   edits that clash with a colleague's become new versions, and both users are told.
3. A copy request is fulfilled with a cropped display copy, and the requester opens it
   from the cloud.
4. A referenced `.pld` of a 300 GB project exports in under a minute and opens elsewhere
   with placeholders; attaching the source regenerates the products.

**Total:** about 4 to 5 months of focused work for L0 to L3, with L1 alone delivering the
owner's main ask (import and generate locally, no upload) in about 6 weeks after L0.

## 10. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Folder access only on Chromium | Firefox and Safari users get the weaker OPFS path | Clear banner, size guidance, helper for all browsers |
| OPFS eviction or "clear site data" | Local volumes vanish on Firefox and Safari | `persist()`, replica state shows "missing", recipes allow regeneration, banner |
| Local Network Access prompt confuses users | Pairing fails | Explain before the prompt; enterprise policy note |
| Safari blocks HTTP loopback | No helper from Safari | Tested in L0; Safari users use Chrome or Edge for the helper |
| SmartScreen and Defender warnings | Install drop-off, support load | Signing, few releases, submission before release, help page |
| Corporate laptop lockdown | Helper unusable on client machines | MSI and PKG for IT, security sheet, browser-only path |
| Supporting a desktop binary on three OSes | Ongoing cost | One codebase with the server worker, CI builds per target, minimum version gate |
| Engine drift between browser, helper and server | Previews differ in the last bits | Engine commit in provenance and in `/v1/hello`; warning on mismatch |
| Data loss on laptops | Lost local volumes | Honest UI, backup advice, recipes regenerate derived volumes, sources stay with the user |
| Disk full mid-job | Failed job | Disk estimate before start, free-space checks per pack, resumable jobs |
| Lost or stolen laptop | Client data exposed | Disk encryption advice; optional at-rest encryption as an owner decision |
| Team confusion about where data is | Wrong expectations | Location badges everywhere, last-seen times, copy requests |

## 11. Open questions for the owner

1. **Pricing:** local workspace included in Seismolord and QI Studio (recommended), the
   helper as a paid add-on, or tier-gated?
2. **Timing:** NAPE is 9 to 11 November and the rule is no new apps until after it. L0 and
   L1 extend existing apps and could start now; Petrolord Local is arguably a new product.
   Start L0 and L1 now and L2 after NAPE?
3. **Publisher and signing:** which company signs the binaries (Petrolord or Lordsway),
   Apple Developer account, and the Windows route (Artifact Signing if eligible, otherwise
   an OV certificate)?
4. **Previews of local volumes:** upload thumbnails and fold maps by default (recommended)
   or only on request, given client confidentiality?
5. **At-rest encryption** of local packs (protects lost laptops, costs speed and blocks
   offline work without a cached key): build it, or rely on disk encryption?
6. **Proxy streaming** from a colleague's machine: confirm it stays out of L1 to L3.
7. **Default for new projects:** Cloud (no change for anyone, recommended) or This computer
   for users on slow links?
8. **Pilot:** the owner's own QI study as the first real L1 test, when the QI project
   comes off hold?

## 12. Recommendation

Build it, in order, starting with the L0 spike. L1 alone answers the owner's point: a
consultant imports an 80 GB stack from disk with nothing uploaded and generates as many
attribute and inversion volumes as the disk holds, using the browser workers and engines
we already have, with every interpretation still in the cloud under the same RLS and
Suite Projects rules. Use the File System Access workspace folder on Chrome and Edge as
the main path and OPFS as a labelled fallback. Add Petrolord Local in L2 for prestack and
very large studies, packaged with Node SEA from the existing seismic worker, localhost
only, paired and token-protected. Keep the server path for teams on good links and for
sharing. Keep volumes immutable, identify them by content hash and recipe, and share
recipes where possible, so a team regenerates volumes locally and moves few bytes.
Include local mode in the existing subscriptions for now, since it lowers our egress cost.

## Sources
- MDN, Storage quotas and eviction criteria:
  https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN, `Window.showDirectoryPicker()` (experimental, Limited availability, secure context, user
  activation): https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- MDN, Origin private file system:
  https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- Chrome for Developers, Persistent permissions for the File System Access API (Chrome
  122): https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
- Chrome for Developers, Local Network Access (prompt from Chrome 142,
  `targetAddressSpace`): https://developer.chrome.com/blog/local-network-access
- MDN, WebGPU API (Limited availability, secure contexts):
  https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- Node.js, Single executable applications (Stability 1.1, ESM `mainFormat`, assets,
  `--build-sea` from v25.5.0, signing): https://nodejs.org/api/single-executable-applications.html
- Microsoft Learn, SmartScreen reputation for Windows app developers (EV no longer gives
  instant reputation; per-hash reputation; Artifact Signing):
  https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Browser version numbers for OPFS and the folder picker are from the MDN and Chrome pages
  above and caniuse; L0 re-checks them on the target machines.

## 13. Owner decisions (2026-10-15, binding)

1. Local workspaces are included in existing subscriptions; no new paywall.
2. L0 and L1 now. L2 (Petrolord Local) after NAPE; the job router keeps an executor slot for it.
3. The helper's publisher is Lordsway Energy (L2 only).
4. Previews of local volumes upload to the cloud by default, off for members-only Suite projects,
   with a per-volume override.
5. No app-level encryption of local files in L1; the help tells users to rely on BitLocker or
   FileVault.
6. No streaming of volumes from a colleague's machine.
7. At project creation, and on the first seismic import in a project without a choice, ask where
   seismic lives, defaulting to Local. Existing projects and volumes stay as they are (cloud).
8. The owner's QI client study is the L1 pilot.

## 14. L0 results (2026-10-15)

Measured on the worker host (8 cores, 31 GB RAM; disk O_DIRECT write 133 MB/s, cold read 1.3 to
1.5 GB/s) in the Playwright v1.61.1 image: HeadlessChrome 149.0.7827.55, Firefox 151.0 and
Playwright's Linux WebKit 26.5. Pages were served from http://127.0.0.1, which is a secure context.

**Chromium OPFS, 256 MiB pack files** (OPFS on Linux is disk-backed in the profile, so
createWritable is the proxy for a user folder; the native folder picker cannot be automated headless,
so the real NTFS or APFS folder number comes from the owner's laptop in the pilot):

| Write path | MB/s | Renderer RSS |
|---|---|---|
| Worker createWritable, 4 MiB chunks, 8 GB | 369 | about 105 MB |
| Worker createWritable, 4 MiB chunks, 20 GB | 290 (74 s) | 110 MB |
| Worker createWritable, 1 MiB chunks, 4 GB | 395 | 103 MB |
| Main thread createWritable, 4 MiB chunks | 530 | 117 MB |
| Worker createSyncAccessHandle, 4 MiB / 1 MiB | 748 / 783 | about 105 MB |

1 MiB reads over 20 GB of packs (`getFile().slice()`): sequential with 1 in flight 117 to 379 MB/s
cold and 454 to 506 MB/s warm; random 466 to 531 MB/s; 8 in flight 599 MB/s sequential and 1138 MB/s
random. RSS rises to 1.1 to 1.4 GB in tight read loops (buffers are collected late), so reads in
flight are bounded.

**Capabilities and persistence.** createWritable works in a dedicated worker; createSyncAccessHandle
exists in workers only. A directory handle stored in IndexedDB reads back inside a worker. With a
persistent profile, OPFS files and IndexedDB records (handle included) survive a full browser close
and relaunch in Chromium and Firefox. `persist()` returns false in headless Chromium; Firefox never
settles it (it waits on a prompt), so L1 races it against a timeout. Chromium's `estimate()` quota is
elastic (5.4 GB incognito, 10.7 GB rising to 36.5 GB as data grew), so it is a guide only; no web API
reports a user folder's free space. Clearing all site data removes OPFS and IndexedDB together;
clearing only file systems leaves a stale handle that throws NotFoundError. L1 therefore shows a
volume as missing from the cloud replica record.

**Firefox 151:** no folder picker; OPFS, createWritable (page and worker), sync handles and
deflate-raw all present. 2 GB: 536 to 727 MB/s write, 1.3 to 1.7 GB/s read. Best-effort quota about
10 GiB: createWritable throws QuotaExceededError at 9984 MiB, but a sync handle write returns a short
count without throwing. L1 checks every write count.

**WebKit (Playwright Linux build):** navigator.storage is absent entirely, so local mode is refused
cleanly. Real Safari 17+ has OPFS and still needs a test on a Mac.

**Hashing:** SubtleCrypto SHA-256 of 1 MiB at 1175 to 1598 MB/s (per-brick hashes); the pure-JS
incremental SHA-256 (full source hash) at 208 MB/s in Chromium, 59 MB/s in Firefox and 165 MB/s in
WebKit, digest equal to SubtleCrypto. An 80 GB source hashes in about 6.5 minutes in Chromium, beside
the conversion.

**Packaged worker (feasibility only, nothing shipped):** `worker/seismic-worker/build.mjs` bundles
196 modules into three ESM files (1.77, 0.89 and 1.75 MB) with Node built-ins only. Node 25.9
`--build-sea` with `"mainFormat": "module"` builds one 130 MB Linux executable that starts and runs
in-process jobs. Blocker for L2: worker threads load `jobThread.js` from disk, so that file must be an
SEA asset written out at start (or the helper runs with JOB_THREADS=0). Signing is untested.

## 15. L1 as built (2026-10-15)

- **Store:** `src/lib/localWorkspace/` with three backends on one handle surface: a user-picked
  folder (File System Access), OPFS with a warning, and memory for tests. Write-once 256 MiB packs,
  a per-pack index written at close, a pack without an index dropped by the next writer, per-brick
  SHA-256 and a brick root, verification with a negative control. The store implements the upload
  spool interface, so the existing v4 conversion writes into it and the existing two-stage upload
  promotes from it.
- **Import with no upload:** the import dialog asks where the seismic lives (Keep on this computer,
  or Upload to Petrolord, with times and disk). The existing scan, crop and v4 transcode write into the
  workspace; a second worker hashes the whole source. Only the row, the manifest and (decision 4)
  three small previews reach the cloud.
- **Identity:** `content_id` = hash of source SHA-256, mapping, crop and codec (plus parent, recipe
  and engine for products); `brick_root` over the stored bricks.
- **Cloud records** (migration 20261016100000, applied 2026-10-15): `seismic_volumes.storage_location`,
  `content_id`, `brick_root`, `device_id`, `previews`; `seismic_devices`; `seismic_volume_replicas`;
  `seismic_copy_requests`; `qi_jobs.executor` and `device_id` with the claim, sweep and enqueue
  filters and `qi_start_local_job` / `qi_update_local_job`; `qi_datasets.storage_location`.
- **Reading:** every brick path (viewer slice worker, horizon and framework trackers, attribute
  worker, browser jobs) goes through `withLocalBricks`, which serves a local volume from the
  workspace and never calls the cloud for it.
- **Jobs:** `qiService.enqueueJob` routes by where the inputs live (`router.js`). Browser jobs run the
  seismic worker's own handler files in Web Workers with browser dependencies (user client, local
  writer, local fetchers), recorded in `qi_jobs` with `executor = 'browser'` and the device. Kinds:
  attribute volumes, seismic QC, post-stack inversion, property prediction, stack sampling, AVO,
  stack matching, simultaneous inversion of angle stacks and zone maps. Prestack gather kinds wait for
  the helper (L2 registers a `local` executor in the same router).
- **Collaboration:** location badges in the Seismic Explorer and QI Studio; a volume on another
  computer opens a notice with its previews and "Ask for a cloud copy"; the owner answers from Local
  workspace, Copy requests, or chooses Copy to the cloud (promotion through the existing resumable
  upload; the row becomes `both`).
- **Survival:** the workspace record, folder handle and volume records live in IndexedDB; the folder
  asks for permission again unless "Allow on every visit" was chosen; a tab closed mid-job is marked
  closed on the next visit and its partial outputs removed.
- **Space:** imports and jobs check the disk need first (a hard refusal where the browser enforces a
  quota, Firefox and Safari; guidance on Chromium and folders), and a full disk fails the write with
  a plain message.

