# Homepage counts: petrolord.com and nextgen.petrolord.com

Reconciled 2026-10-05. Both homepages now count from the same definitions,
and both repos pin their figures to a read-only snapshot of the live
databases taken that day, so a figure cannot change on one site without a
test failing.

## Definitions

- **Live Suite app**: a `master_apps` row (Suite project
  `ssyckywijlrkgcwvkwlr`) with `status = 'Active'`, `is_built` and
  `is_functional`, whose route is on main (`appId="<slug>"` or
  `path="apps/<module>/<slug>"` in `src/App.jsx`). This is "an app a
  customer can open today". Catalogue rows that are listed but not built
  (271 rows in all) are not counted.
- **Suite module**: a `modules` slug with at least one live app; equal to
  the keys of `MODULE_PRICING`.
- **Live NextGen course**: an `academy_apps` row (NextGen project
  `txcsbtvcdaqmkjjbhbeg`) with `status = 'available'`.
- **App course**: a live NextGen course with `course_type = 'app'` (built
  on a Suite app). The others are `engine` courses (a validated engine
  through course panels, no Suite app) and `practice` courses.
- **Academy discipline**: an `academy_apps.module` with a live course. The
  academy groups courses into 12 disciplines; the Suite sells 10 modules.
  These are different groupings, so each site names its own.

## The figures

| Site | Figure | Source | Old | New |
|---|---|---|---|---|
| petrolord.com | engineering applications live today | `suiteStats()` over `src/data/suiteCatalog.js` | 104 | 104 (verified: 104 live rows, all routed) |
| petrolord.com | modules | `suiteStats()` | 10, "modules across the energy value chain" | 10, labelled "Suite modules across the energy value chain" |
| petrolord.com | NextGen Academy courses | `NEXTGEN_LIVE_COURSES` | 79, "taught on these apps" | 79, "72 of them built on these apps" |
| petrolord.com | NextGen app courses | `NEXTGEN_APP_COURSES` (new) | none | 72 |
| petrolord.com /solutions | live applications, modules | `suiteStats()` | 104, Ten | 104, Ten |
| nextgen.petrolord.com | courses | `catalogStats()` over `homeCatalog.js` merged with live `academy_apps` | 79 once the live read returned; 68 on first paint and if the read failed | 79 always |
| nextgen.petrolord.com | courses built on a Suite app | `catalogStats().appCourses` (new) | none ("each built around a real engineering app", untrue for 7) | 72 |
| nextgen.petrolord.com | disciplines | `catalogStats()` | 12, "disciplines across the energy value chain" | 12, "academy disciplines, from geoscience to data and AI" |
| nextgen.petrolord.com | certifications | 3 per live course | 237 live; 204 on first paint | 237 always |

Live apps per Suite module on 2026-10-05: Geoscience 12, Reservoir 13,
Drilling 12, Production 12, Facilities 13, Process Safety 3, Midstream &
Downstream 12, Economics 12, Assurance 10, Data & AI 5. The comment in
`suiteCatalog.js` still described SC3 and SC4 as held; both are live.

NextGen on 2026-10-05: 79 rows, all `available`; 72 app, 6 engine
(procurement, pia, gsa, joa, farmout, prms), 1 practice (contracts).

Not counts: the NextGen employer panel (24 seats, 71 percent, 2 inactive)
is an illustrated sample; "100 percent of capstones auto-graded" and the
Suite's "1 sign-in" and "0 software to install" are statements.

## Guards

- Suite: `src/data/__tests__/suiteCatalog.test.js` compares every module's
  app list with `src/data/__fixtures__/live-catalogue.json` name by name,
  checks every live app has a route in `src/App.jsx`, and pins
  `NEXTGEN_LIVE_COURSES` and `NEXTGEN_APP_COURSES` to the academy rows in
  the same snapshot.
- NextGen: `src/lib/homeCatalog.test.js` compares `HOME_COURSES` with
  `src/lib/__fixtures__/academy-apps-live.json` course by course (slug,
  module, status, type) and requires the static stats to equal the live
  stats.

## Refreshing (read-only)

When an app or a course goes live, re-run these and update the lists, the
constants and both snapshots in the same PRs:

```sql
-- Suite (linked project ssyckywijlrkgcwvkwlr)
select m.app_name, m.slug, mo.slug as module_slug
  from public.master_apps m left join public.modules mo on mo.id = m.module_id
 where m.status = 'Active' and m.is_built and m.is_functional;
-- NextGen (linked project txcsbtvcdaqmkjjbhbeg)
select slug, module, status, course_type from public.academy_apps;
```

Open point: Risk Heatmap is a live tile whose route redirects to the Risk
Register's heatmap tab. It opens a working screen, so it is counted.
