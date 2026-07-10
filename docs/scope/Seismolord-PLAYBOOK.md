# SeismoLord — Seismic Interpretation Application

## What this is
Web-based 3D/2D seismic interpretation app in the Geoscience module of Petrolord Suite: SEG-Y
loading, inline/crossline/time-slice viewing, horizon and fault
interpretation, surface gridding, and export to XYZ / CPS-3 / ZMAP+ for
downstream apps (ReservoirCalc Pro and some other apps which you will determine consume our exports).

## Stack (revised 2026-07-10 — see Seismolord-PLAN.md, the plan of record)
- Frontend: React 18 + Vite, WebGL2 renderer (raw WebGL, no three.js for the
  seismic canvas), Zustand for state, Web Workers for decoding.
- ALL runtime numerics (SEG-Y decode/transcode, autotrack, gridding, export)
  run client-side in Web Workers. There is no Node/Express backend, no
  gateway, no Python sidecar, no Docker: production is a static SPA +
  Supabase only, so no host exists for server-side services.
- Backend: Supabase — Postgres with user-scoped RLS (seismic_* tables),
  private `seismic` Storage bucket (64³ float32 brick objects under
  `{user_id}/{volume_id}/…`, read directly by the client under Storage
  RLS), Edge Functions only where the service role or secrets are required.
- Python 3.11 + segyio + numpy survive as a development-time oracle only:
  `tools/validation/seismolord/` generates committed golden files in
  `test-data/seismolord/` that jest tests consume.

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

## Conventions (revised 2026-07-10 to match the repo)
- Engine code: plain JS with JSDoc types (repo idiom; no TS toolchain in
  jest). Python oracle scripts: type hints.
- Tests: jest (the repo's only unit runner) + Playwright for e2e pixel
  tests (approved devDependency). Every parser and every export writer
  has a golden-file test against test-data/seismolord/.
- Commit per completed sub-task; conventional commit messages.
- Errors surface through the suite's toast/result patterns; Edge Function
  errors return { error } JSON like the other Petrolord functions.

## Never
- Never use three.js/canvas-2D for the main seismic panel (perf).
- Never write a "simplified" SEG-Y parser that assumes IEEE + fixed headers.
- Never silently swap row/column order in grid exports — CPS-3 and ZMAP+ are
  column-major, north-to-south (see test-data/README_test_surfaces.md).
- Never bypass RLS: no service-role reads of user data in Edge Functions
  beyond what a policy could express, no public buckets for volume data.

## Verify yourself
- `npm test` (jest) runs all suites. A phase is complete only when its
  acceptance tests are green (see Seismolord-PLAN.md per-phase acceptance).
