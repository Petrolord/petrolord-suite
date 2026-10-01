# E2E in CI: STATUS

Owner-approved 2026-10-01 (the "e2e in CI" item of the Geoscience upgrade
programme). Until then the Playwright specs ran only by hand on the shared
studio box, and three apps' specs went red unnoticed after shared changes
(the Suite unit profile #830, route protection #828, the design migration).

## What runs

- Workflow: `.github/workflows/e2e.yml`, on every pull request, on every push
  to `main`, and on demand (`workflow_dispatch`).
- Six shards (`playwright (shard N/6)`). Each shard installs with `npm ci`,
  installs Chromium and `poppler-utils` (the specs read exported PDFs back with
  `pdftotext` and `pdfimages`), generates the Ekene demo kit, starts
  `npx vite --host 127.0.0.1 --port 5199` on the runner, then runs
  `npx playwright test --shard=N/6 --workers=2 --retries=1` with
  `E2E_BASE_URL=http://127.0.0.1:5199`.
- Every spec in `e2e/*.spec.js` runs: about 570 tests in 150 files, 2 to 4
  minutes of test time per shard, 7 to 10 minutes per shard wall clock.
- The specs drive the `/dev/*` harness routes (in-memory backends, no sign-in),
  which exist only under the Vite dev server. Nothing touches Supabase or
  staging data. The auth gate tests open a real `/dashboard/...` route signed
  out and expect the redirect to `/login`.
- On a failed shard the `test-results/` folder is kept for 7 days as the
  artifact `e2e-shard-N-test-results`. Each failed test has an
  `error-context.md` there with the page as it stood (`gh run download <id>`).

The jest shards, the production build and the vendored-engines guard stay in
`.github/workflows/ci.yml`.

## Run one spec locally

```
# your own dev server (never staging's cache when node_modules is a symlink)
npx vite --host 127.0.0.1 --port 8460 --strictPort
# in another shell
E2E_BASE_URL=http://127.0.0.1:8460 npx playwright test e2e/<name>.spec.js --workers=1
# one test
E2E_BASE_URL=http://127.0.0.1:8460 npx playwright test e2e/<name>.spec.js -g "PL9" --workers=1
```

Without `E2E_BASE_URL` the config points at staging
(`https://suite.studio.petrolord.com`). On the shared studio box under load a
cold harness can take more than a minute to open, longer than several specs
allow; CI is the reference result.

## Writing specs that hold on a clean runner

- Units: every harness opens on the Suite unit profile (signed out: feet and
  degF). A spec anchored on an SI oracle seeds a metric view first with
  `seedUnitView(page, '<units app key>')` from `e2e/helpers/unitView.js`, the
  same sessionStorage record the in-app toggle writes. A test that asserts the
  profile default itself must not seed (Well Data Manager U2-001 is tagged
  `@profile-units` for that).
- Waits: web-first assertions only (`await expect(locator)...`,
  `expect.poll`). Reading a value once right after a click
  (`boundingBox()`, `allTextContents()`, `page.url()`) passes on a slow box
  and fails on a fast runner.
- Redirects: `await expect(page).toHaveURL(/\/login/)`.
- Evidence files go under `test-results/` (or a directory named by an env
  switch), never a fixed path on the studio box.
- Colours: assert the theme role class (`text-pl-danger-text`) and, when the
  colour is the point, the computed colour. Raw Tailwind colours are gone.

## Skip list

| Spec | Tests | Condition | Reason |
|---|---|---|---|
| `seismolord-large-survey.spec.js` | 6 | `SEIS_BENCH=1` not set (plus `SEIS_BENCH_SLOW`, `SEIS_BENCH_V4`) | Benchmark against a multi-gigabyte synthetic survey generated on the studio box, with performance targets that mean something only on a real GPU. Opt-in by design. |

No test is skipped because of CI, and none is marked `test.fixme`.

## Flaky list (passed only on retry)

None. Across the green runs on the branch (2026-10-01) no test needed its
retry.

`--retries=1` stays. Playwright prints a `flaky` count and the test names at
the end of a shard log when a test passes only on its retry; treat any name
there as a defect in the spec's waits (or in the app) and fix it, then note it
here.

## History

- 2026-10-01, first survey run: 523 passed, 40 failed, 6 skipped. Causes:
  - Unit profile (#830), 27 tests: Petrophysics (18), Well Data Manager (6),
    Well Correlation (2), Stratigraphy ST2 (1). Specs seeded with a metric
    view; Well Data Manager U2-001 rewritten to assert the feet default.
  - Design migration and copy pass, 6 tests: EPE T1 (tabs are `role=tab`, the
    sunk history note was reworded), Capital Portfolio T1 (shared ChartPanel
    card), Project Management T1 and Terminal & Depot T1 (theme roles).
  - Seismolord U2-006 shipped, 1 test: Mapping MAP-U2-008 expected the old
    "not built yet" refusal.
  - Runner differences, 5 tests: Seismolord U2-001 x4 copied its PDF to a path
    that exists only on the studio box; Petrophysics PS1 read a canvas width
    before layout.
  - App defect, 1 test: ReservoirCalc Pro PL9. The full results dialog closed
    and reopened on its first view whenever a recalculation ran while it was
    open. Fixed in `ExpertResultsPanel.jsx` with a jest test
    (`resultsModalRecalc.test.jsx`).
  - Hardened without having failed: six auth gate checks that read the URL once.
