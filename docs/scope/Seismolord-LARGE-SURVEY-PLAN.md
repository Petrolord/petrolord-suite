# Seismolord large surveys: plan of record (2026-09-22)

Owner note after tester feedback, group 1. Target: the browser never holds
the whole volume, and a geologist on an 8 GB laptop views a 4.5 GB survey
in seconds.

## The survey this is built for (headers confirmed 2026-09-22)

The tester's volume, "Claredon seismic", confirmed from its ingested
metadata and the Petrel spatial companion XML. The owner accepted these
numbers over the estimate in the note (25 x 25 m bins).

| | Value |
|---|---|
| File size | 4,502,994,000 bytes (3,600 + 621,960 x 7,240) |
| Traces | 621,960 = 710 inlines (42..751, byte 189) x 876 crosslines (14..889, byte 193), full regular grid |
| Samples | 1,750 at 4 ms (7.0 s) |
| Format | 5, IEEE float (no IBM conversion) |
| Sort | inline |
| Geometry | unrotated 25 x 25 m bins; first trace centre 403426 E 28018 N, last 421151 E 49893 N; EPSG:26391 via EPSG:1754; coordinate scalar -100 |
| Bricks (64^3) | 12 x 14 x 28 = 4,704. An inline touches 14 x 28 = 392 bricks, a crossline 12 x 28 = 336, a time slice 12 x 14 = 168 |

Today it ingested in 27 minutes (row created 10:09, ready 10:36 UTC on
2026-09-21) and a view takes about 5 minutes on 32 GB and never appears
on 8 to 16 GB. Root causes (audit 2026-09-22): nothing is viewable until
a full scan, a full transcode and the upload of every brick finish; and
the viewer pins every brick a slice touches at once (assembleSlice
Promise.all: 392 MiB per inline, over 1 GiB for the 3D view), with no
global memory budget.

## Acceptance targets (8 GB laptop, the tester's file)

1. First inline on screen under 10 s after the file is chosen, from the local file.
2. Next or previous inline or crossline under 1 s from cache, under 3 s uncached.
3. After conversion, a time slice under 5 s.
4. After the display copy is uploaded, first inline under 5 s when the survey opens from the server over 10 Mbps.
5. Tab memory under 1.5 GB throughout, including during conversion.

Before and after numbers, conversion time and both upload times go in the
PRs. The synthetic benchmark lives in /root/seis-bench (same shape as the
tester's file) and becomes a gated jest/Playwright benchmark.

## Architecture

Three sources behind one slice interface, all in workers:

```
SliceSource.getSlice({ orientation: 'inline'|'crossline'|'time', index, level }, signal)
  -> { data: Float32Array | Uint8Array, width, height, traceRms?, level, codec: 'f32'|'u8', clip? }
```

- **LocalSegySource**: reads the chosen File directly. Inline and
  crossline only; time slices report "available after conversion" with the
  conversion progress.
- **BrickSource v1**: today's float32 bricks, streamed (never all pinned).
- **BrickSource v4**: the new display bricks with levels of detail, then
  float32 bricks for computation.

The viewer (2D windows, 3D planes, Map time slice) asks the source for
slices only. The 3D view draws slices as textures; it never renders the
volume.

### 1. Trace index from headers only (engines `seismolord/traceIndex.js`)
- Read the binary header and the first trace header; derive trace length.
  For a regular sorted file, predict every trace's offset and verify by
  reading the first and last trace header of every inline (or crossline
  for crossline-sorted files): about 1,420 reads of 240 bytes.
- Irregular or unsorted files: one streaming header pass into an
  `Int32Array` lattice to trace number (-1 = dead), about 2.5 MB. Dead
  cells become nulls (1.0E+30). This also lifts today's regular-grid
  refusal.
- Byte mappings stay user-mappable (189/193 default).

### 2. Local slices (engines `seismolord/localSlice.js`, run in a worker)
- Inline on an inline-sorted file: one contiguous read (876 x 7,240 bytes
  = 6.3 MB) and a decode. Crossline: strided reads, coalesced into large
  ranges; cache recent traces within the memory budget.
- Decoders are the existing `segyDecode` (IBM and IEEE, bit-identical to
  segyio).

### 3. Conversion (engines `seismolord/brickTranscodeV4.js`, worker)
- One streaming pass over the file in sort order, holding one band of 64
  lines (the band size is chosen from the memory budget; split the band
  along samples if it would exceed it).
- **Clip statistics first**: a sampling pre-pass (a few thousand traces
  spread over the survey) gives |amplitude| percentiles; the full pass
  accumulates an exact histogram stored in the manifest.
- **Display copy (u8)**: symmetric quantisation at a wide clip (P99.9 of
  |amp| by default; the value is stored): `q = round(clamp(a/clip, -1, 1)
  * 127) + 128`, 0 reserved for null. The user's percentile clip applies
  in the shader, within the stored range.
- **Levels of detail** for the display copy: level 1, 2 and 3 are 2x, 4x
  and 8x decimated per axis (mean of the 2x2x2 float block, then
  quantised), each bricked 64^3. At level 2 the tester's inline touches
  4 x 7 = 28 display bricks.
- **Float32 copy**: 64^3 float32, byte-shuffled then compressed.
- Compression: native `CompressionStream('deflate-raw')` in the worker.
  Each brick is its own Storage object, fetchable on its own; packing
  bricks into range-read shards is a later step if object counts hurt.
- Object paths: `{user}/{volume}/v4/d{level}/{i}-{j}-{k}.u8z` and
  `{user}/{volume}/v4/f/{i}-{j}-{k}.f32z`.

### 4. Manifest v4 (engines `manifest.js`)
- `manifest_version: 4`, additive over v1: `display: { codec: 'u8',
  clip, percentiles, histogram, levels: [{ level, dims, bricks }],
  compression }`, `f32: { codec: 'f32-shuffle-deflate', complete }`.
- `MANIFEST_READ_MAX` goes to 4 together with the reader. v1 volumes keep
  working through BrickSource v1.

### 5. Upload in two stages (Suite `services/ingestService.js` successor)
- Stage 1: display levels coarse to fine, then the manifest with
  `display.complete`, and the row status becomes `display_ready` (a
  status value only; the column has no check constraint, no DDL). From
  here the survey opens from the server on any machine.
- Stage 2: float32 bricks, then `f32.complete` and status `ready`.
- Per-brick retry with backoff; resume skips objects already present; a
  dropped connection pauses and resumes. The raw SEG-Y is never read
  again after conversion.
- The import runs as a background job with per-stage progress in the
  status bar; the modal dialog closes; `beforeunload` warns while an
  upload is pending.

### 6. Viewer behaviour (Suite, slice worker)
- Low-resolution slice first (the coarsest level that has the slice),
  then sharpen level by level; cancel requests the user moved away from;
  prefetch neighbours at the current step size.
- One brick cache with a budget from `navigator.deviceMemory` (about 256
  MB on 8 GB; 512 MB on 16 GB; 1 GB cap), shared by every window, with
  streaming assembly: each brick's contribution is copied into the slice
  as it arrives and released.
- Computation (tracking, attributes, amplitude maps) reads float32 when
  it exists and says so when only the display copy is up.

### 7. Failure
- Every job and fetch has a timeout and an error state with a Retry.
  Out of memory (`RangeError`, "Array buffer allocation failed", worker
  `onerror`) shows a plain message naming the budget. Before import on a
  machine reporting 8 GB or less, the dialog says what to expect.

## Work split
- **Stream L (viewer side)**: trace index, local slices, slice worker,
  streaming assembly, budgeted cache, LOD-first display, 3D from slices,
  failure states, the local-open flow (view before conversion finishes).
- **Stream C (conversion side)**: v4 transcode, display quantisation and
  levels, float32 compression, manifest v4, two-stage resumable upload,
  background job UI.
- Both share `SliceSource` and manifest v4 as written here; changes to the
  contract go through this file.
- Engines changes go to Petrolord/petrolord-engines first and are
  vendored file by file.
