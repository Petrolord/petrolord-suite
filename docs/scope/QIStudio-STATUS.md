# QI Studio: status

QI programme Q1, Milestone A4 (2026-10-06). Route `/dashboard/apps/geoscience/qi-studio` (help at `/help`); dev harness `/dev/qi-studio`.

## What it is

QI Studio holds the first package of a quantitative interpretation study: the data audit and the feasibility (SOW sections 2 to 4). It reads the Suite's shared records and never changes another app's data.
- **Setup:** wells (the registry), target intervals (zone names shared by the wells), Seismolord volumes, the seismic acquisition date, and each well's first production date.
- **Data inventory:** 18 groups across wells, seismic, interpretation and reports. Each has a state (requested, received, usable, missing, outstanding), a received date and a note. States are suggested from the registries where the Suite holds the data.
- **Usability matrix:** each well against each target is good, limited or missing.
  - The items are the curve families over the zone (judged on recorded extent; digitized curves count as limited), checkshots, the depth reference and the survey, each with the reason.
  - A depletion flag appears when seismic was acquired after first production.
- **Issue register:** the matrix suggests one issue per well and gap kind, with a remedy. The user keeps, resolves or dismisses them, and adds their own.
- **Feasibility per target:** a verdict, separability, detectability and the recommended route.
- **Seismic QC** (A5): a `seismic_qc` job per chosen volume on the seismic worker. It measures:
  - spectra, peak and the -6 dB band per time window;
  - signal-to-noise from neighbouring-trace coherency;
  - the acquisition footprint on RMS maps.

  The result is kept with the project, and its issues can be added to the register.
- **Well ties** (A6): each well's committed Seismolord tie, the tie wavelets compared and averaged (the field wavelet), and tie issues to the register.
- **Report:** the QI Data Audit and Feasibility Report on the shared Report Kit, including the QC and tie tables.

## Decisions

- **Access:** opens on a Seismolord or Rock Physics Studio licence (`appId={['seismolord','rock-physics-studio']}`), the way Contour Map Digitizer opens on Mapping & Surface Studio. There is no `master_apps` row, hub tile or price. Listing and pricing it is an owner item.
- **Reach:** a "QI Studio" link in the Rock Physics Studio ribbon, and the help guide.
- **Saving:** `saved_qi_studio_projects` (migration `20261006140000`, NOT APPLIED; owner applies), under the record-sharing rules. Until it is applied the page says saving is not switched on.
- **Computed, never saved:** the usability matrix and the suggestions are recomputed from the registries on every open.

## Tests

- `__tests__/services.test.js` (11): rules, with negative controls.
- `__tests__/qiStudio.test.jsx` (5): an end-to-end walk on the in-memory backend, a saved project round trip, the note before the migration, and the report read back from the PDF.
- `__tests__/helpGuide.test.jsx` (2).

## Owner items

1. Apply `20261006140000_saved_qi_studio_projects.sql`.
2. Decide whether QI Studio gets its own Geoscience tile and price.
