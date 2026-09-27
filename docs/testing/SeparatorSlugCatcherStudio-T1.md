# Separator & Slug Catcher Studio: senior test T1

- App: Separator & Slug Catcher Studio (`/dashboard/apps/facilities/separator-slug-catcher-designer`)
- Wave / position: Wave 5, #66 (Senior Testing Programme; facilities and process safety)
- Build tested: main 3ad8894b4 plus #690 to #694
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: GPSA ch. 7 / API 12J Souders-Brown sizing with pressure-derated K, retention-time liquid sizing, vessel slug catcher volume
- Coverage before T1: separator engine goldens, including the September oil-density and L/D band fix (#604); no human walk

## How it was tested

I used `/dev/facilities/separator` at 1366 x 768. The default is a
horizontal two-phase vessel with a wire mesh pad at half liquid level,
candidate diameters 4 to 12 ft, and a 200 bbl slug with 10,000 bpd and
5 min hold at 0.6 fill and L/D 4. I walked the separator (with the L/D
family) and the slug catcher.

## Verdict

**Demo-ready, with no findings.** I checked these numbers by hand:

- Settling velocity: 0.362 x sqrt((57.42 - 3.597) / 3.597) = 1.400 ft/s
  (1.398 shown). K 0.362 is the 0.45 pad value derated for pressure.
- L/D family: liquid retention controls every row, so the length scales
  as 1/D^2 (18.6 x 16 / 20.25 = 14.7 ft). Only the 4.5 ft row
  (L/D 3.27) sits in the 3 to 4 band for a two-phase horizontal vessel,
  and it is marked PREFERRED.
- Slug catcher:
  - inventory is 10,000 / 1,440 x 5 = 34.7 bbl;
  - working volume is 235 bbl, and at 0.6 fill that is 391 bbl =
    2,196 ft3;
  - at L = 4D, pi D^3 = 2,196, so D = 8.87 ft and L = 35.5 ft.

## Tests

- `e2e/separator-slug-catcher-t1.spec.js` checks the settling velocity,
  the preferred row and L/D, and the slug catcher length and working
  volume.
