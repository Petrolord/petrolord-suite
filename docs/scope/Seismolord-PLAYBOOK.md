# SeismoLord — Seismic Interpretation Application

## What this is
Web-based 3D/2D seismic interpretation app in the Geoscience module of Petrolord Suite: SEG-Y
loading, inline/crossline/time-slice viewing, horizon and fault
interpretation, surface gridding, and export to XYZ / CPS-3 / ZMAP+ for
downstream apps (ReservoirCalc Pro and some other apps which you will determine consume our exports).

## Stack
- Frontend: React 18 + Vite, WebGL2 renderer (raw WebGL, no three.js for the
  seismic canvas), Zustand for state, Web Workers for decoding.
- Backend: Node.js 20 / Express, registered behind the Petrolord gateway
  (auth middleware pattern: same as other suite apps — every new route MUST
  be added to the gateway permission map or it 403s).
- Numerics sidecar: Python 3.11 FastAPI container using segyio + numpy for
  SEG-Y indexing/transcoding and gridding. Node orchestrates; Python crunches.
- Storage: volumes as pre-computed brick files (see Data Model) on disk /
  object storage; project metadata in PostgreSQL. [ADJUST IF DIFFERENT]
- Docker Compose for local dev; each service has its own container.

## Domain rules (violating these = bug, even if code "works")
- Z convention: depth/time increases downward; exported surfaces use
  NEGATIVE Z in feet for depth (matches ReservoirCalc Pro test data).
- Null value everywhere: 1.0E+30. Nulls must propagate through gridding and
  never enter volume/statistics sums.
- SEG-Y reality: trace samples may be IBM float (format code 1) or IEEE
  (code 5); big-endian headers; coordinate scalar at trace-header byte 71
  (negative = divide); inline/xline commonly at bytes 189/193 but MUST be
  user-mappable; the textual header lies — trust measured geometry.
- Never load a full SEG-Y volume into memory. All access is windowed/brick.
- Amplitudes preserved end-to-end as float32; display gain/AGC applied in
  the shader only, never baked into stored data.
- Seismic display defaults: SEG normal polarity, symmetric colorbar around
  zero, red-white-blue and seismic-rainbow colormaps.

## Conventions
- TypeScript strict everywhere in JS code; Python type hints + mypy.
- Tests: vitest (frontend/node), pytest (python). Every parser and every
  export writer has a golden-file test in test-data/.
- Commit per completed sub-task; conventional commit messages.
- API errors: RFC 7807 problem+json, same shape as other Petrolord apps.

## Never
- Never use three.js/canvas-2D for the main seismic panel (perf).
- Never write a "simplified" SEG-Y parser that assumes IEEE + fixed headers.
- Never silently swap row/column order in grid exports — CPS-3 and ZMAP+ are
  column-major, north-to-south (see test-data/README_test_surfaces.md).
- Never bypass the gateway auth pattern with ad-hoc middleware.

## Verify yourself
- `make test` runs all suites. A phase is complete only when green.
