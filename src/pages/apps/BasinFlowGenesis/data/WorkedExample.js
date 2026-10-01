// The worked example (AppUpgrade BF-U2-018): a complete Tertiary rift-margin
// column for a first walk through the app, tied to the help guide's
// "Worked example" section. Six layers with an Eocene unconformity (700 m
// eroded between 34 and 30 Ma), a Paleocene source rock on Pepper and Corvi
// organofacies B kinetics, measured Ro, two depths of log BHTs with their
// shut-in times (Horner, 6 h circulation) and one DST.
//
// The measured values were sampled from this same column run at a constant
// 62 mW/m2 (BHTs made cool the way a log run is: T = Tf - 25 ln((6 + ts) / ts)),
// and the example opens at 55 mW/m2. Auto-Fit with Horner on brings the heat
// flow back to about 62 mW/m2: the walk shows the answer is recoverable, and
// that without the BHT correction the fit lands low.

export const WORKED_EXAMPLE_NAME = 'Worked example: rift-margin well';
export const WORKED_EXAMPLE_TRUTH_HEAT_FLOW = 62;

export function workedExampleModel() {
  return {
    name: WORKED_EXAMPLE_NAME,
    status: 'in-progress',
    stratigraphy: [
      { id: 'we-recent', name: 'Pliocene-Recent Shale', ageStart: 5, ageEnd: 0, thickness: 900, lithology: 'shale', color: '#264653', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
      { id: 'we-miocene', name: 'Miocene Sand', ageStart: 23, ageEnd: 5, thickness: 1100, lithology: 'sandstone', color: '#f4a261', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
      { id: 'we-oligo', name: 'Oligocene Shale', ageStart: 30, ageEnd: 23, thickness: 600, lithology: 'shale', color: '#264653', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
      { id: 'we-eocene', name: 'Eocene Sand', ageStart: 56, ageEnd: 34, thickness: 800, lithology: 'sandstone', color: '#f4a261', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
      { id: 'we-source', name: 'Paleocene Source Shale', ageStart: 66, ageEnd: 56, thickness: 400, lithology: 'shale', color: '#7c2d12', sourceRock: { isSource: true, toc: 4, hi: 500, kerogen: 'pc-B' } },
      { id: 'we-cret', name: 'Upper Cretaceous Sand', ageStart: 100, ageEnd: 66, thickness: 1200, lithology: 'sandstone', color: '#f4a261', sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' } },
    ],
    heatFlow: { type: 'constant', value: 55, history: [{ age: 0, value: 55 }, { age: 100, value: 55 }] },
    erosionEvents: [{ age: 30, amount: 700, surface: 'Base Oligocene unconformity' }],
    settings: { surfaceTemp: 20, workedExample: true },
    calibration: {
      ro: [
        { id: 'we-ro-1', depth: 1165, value: 0.51 },
        { id: 'we-ro-2', depth: 2052, value: 0.72 },
        { id: 'we-ro-3', depth: 2855, value: 1.07 },
        { id: 'we-ro-4', depth: 3450, value: 1.35 },
        { id: 'we-ro-5', depth: 4458, value: 2.02 },
      ],
      temp: [
        { id: 'we-t-1', depth: 2052, value: 100.6, shutInH: 6 },
        { id: 'we-t-2', depth: 2052, value: 107.8, shutInH: 12 },
        { id: 'we-t-3', depth: 2052, value: 110.7, shutInH: 18 },
        { id: 'we-t-4', depth: 3450, value: 148.6, shutInH: 6 },
        { id: 'we-t-5', depth: 3450, value: 155.8, shutInH: 12 },
        { id: 'we-t-6', depth: 3450, value: 158.7, shutInH: 18 },
        { id: 'we-t-7', depth: 3851, value: 181.0, kind: 'DST' },
      ],
      bht: { method: 'horner', circulationH: 6 },
    },
  };
}
