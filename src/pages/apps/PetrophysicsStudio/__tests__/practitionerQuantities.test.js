/**
 * AppUpgrade PETRO-U1, PL1 quantity table: each displayed quantity
 * against its textbook definition, calling the shipped pipeline on a case
 * where the distinction matters. Written from the definitions (Asquith &
 * Krygowski 2004; Crain; Timur 1968; Arps 1953), not from the engine's
 * code; the goldens elsewhere pin the oracle.
 */
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';
import { phiNd } from '../engine/porosity';
import { swArchie } from '../engine/sw';
import { rwAtTemp } from '../engine/temperature';

const one = (v) => Float64Array.from([v]);
const run = (c, p = {}) => computeWell(
  Object.fromEntries(Object.entries({ DEPT: 2000, ...c }).map(([k, v]) => [k, one(v)])),
  { ...DEFAULT_PARAMS, ...p },
).outputs;

test('shaly sand: PHIT is the density porosity as read, PHIE removes the shale point, Archie runs on PHIE', () => {
  // IGR 0.5 on the default 20/120 API lines; RHOB 2.35 on a 2.65 matrix
  const o = run({ GR: 70, RHOB: 2.35, RT: 10 });
  const phit = (2.65 - 2.35) / 1.65;
  const vsh = 0.083 * (2 ** (3.7 * 0.5) - 1); // Larionov tertiary, the default
  expect(o.PHIT[0]).toBeCloseTo(phit, 12);
  expect(o.VSH[0]).toBeCloseTo(vsh, 12);
  expect(o.PHIE[0]).toBeCloseTo(phit - vsh * 0.06, 12);
  expect(o.PHIE[0]).toBeLessThan(o.PHIT[0]);
  expect(o.SW[0]).toBeCloseTo(swArchie(10, phit - vsh * 0.06, 0.05), 12);
  expect(o.SW[0]).toBeGreaterThan(swArchie(10, phit, 0.05)); // Sw on PHIT would read drier
});

test('gas effect: density porosity reads high, neutron low; the RMS form is the gas combination', () => {
  const phiD = 0.30;
  const o = run({ GR: 20, RHOB: 2.65 - 1.65 * phiD, NPHI: 0.12, RT: 50 }, { phiSource: 'nd', ndMethod: 'rms' });
  expect(o.PHIT[0]).toBeCloseTo(Math.sqrt((phiD ** 2 + 0.12 ** 2) / 2), 12);
  expect(phiNd(phiD, 0.12, 'avg')).toBeCloseTo(0.21, 12);
  expect(o.PHIT[0]).toBeGreaterThan(phiNd(phiD, 0.12, 'avg')); // the average understates a gas sand
  expect(o.PHIT[0]).toBeLessThan(phiD);                         // and density alone overstates it
});

test('total-porosity models return Swt on PHIT; dual water with Swb = 0 is Archie on PHIT', () => {
  const c = { GR: 70, RHOB: 2.35, RT: 10 };
  const phit = (2.65 - 2.35) / 1.65;
  const dw0 = run(c, { swMethod: 'dual-water', swb: 0 });
  expect(dw0.SW[0]).toBeCloseTo(swArchie(10, phit, 0.05), 10);
  const dw = run(c, { swMethod: 'dual-water', swb: 0.25, rwb: 0.02 });
  expect(dw.SW[0]).not.toBeCloseTo(dw0.SW[0], 3); // bound water changes the answer
  const ws0 = run(c, { swMethod: 'waxman-smits', qv: 0 });
  expect(ws0.SW[0]).toBeCloseTo(swArchie(10, phit, 0.05), 10);
});

test('Timur in fractions is the published percent form 0.136 phi%^4.4 / Swirr%^2', () => {
  const phi = 0.25;
  const o = run({ GR: 20, RHOB: 2.65 - 1.65 * phi, RT: 20 });
  const swirr = 0.04 / phi; // Buckles constant BVW, the default Swirr source
  // 8581 is 0.136 x 10^4.8 = 8581.03 rounded: 2 parts per million
  expect(o.KPERM[0] / ((0.136 * (phi * 100) ** 4.4) / (swirr * 100) ** 2)).toBeCloseTo(1, 5);
});

test('Rw at formation temperature: Arps with degF inside', () => {
  // 0.05 ohm.m at 25 C (77 F) to 90 C (194 F)
  expect(rwAtTemp(0.05, 25, 90)).toBeCloseTo(0.05 * (77 + 6.77) / (194 + 6.77), 12);
  const o = run({ GR: 20, RHOB: 2.2375, RT: 5 }, { tempMode: 'linear', surfaceTempC: 25, bhtC: 90, bhtDepthM: 2000, rwRefTempC: 25 });
  expect(o.TEMP[0]).toBeCloseTo(90, 12);
  expect(o.SW[0]).toBeCloseTo(swArchie(5, 0.25, rwAtTemp(0.05, 25, 90)), 10);
});

test('BVW is PHIE x Sw and pay needs all three cutoffs', () => {
  const o = run({ GR: 20, RHOB: 2.2375, RT: 5 });
  expect(o.BVW[0]).toBeCloseTo(o.PHIE[0] * o.SW[0], 12);
  expect(o.PAY[0]).toBe(1);
  expect(run({ GR: 20, RHOB: 2.2375, RT: 5 }, { cutSw: 0.3 }).PAY[0]).toBe(0);
});
