// Task 5: Sample data modified to start from day 5 to verify dynamic initial day detection
export const sampleProductionData = [
  { date: '2020-01-06', days: 5, oil: 5000, gas: 5000, water: 50 },
  { date: '2020-02-06', days: 36, oil: 4950, gas: 4980, water: 55 },
  { date: '2020-03-06', days: 65, oil: 4890, gas: 4950, water: 60 },
  { date: '2020-04-06', days: 96, oil: 4820, gas: 4910, water: 65 },
  { date: '2020-05-06', days: 126, oil: 4750, gas: 4860, water: 70 },
  { date: '2020-06-06', days: 157, oil: 4680, gas: 4800, water: 75 },
  { date: '2020-07-06', days: 187, oil: 4600, gas: 4730, water: 80 },
  { date: '2020-08-06', days: 218, oil: 4520, gas: 4650, water: 85 },
  { date: '2020-09-06', days: 249, oil: 4430, gas: 4560, water: 90 },
  { date: '2020-10-06', days: 279, oil: 4340, gas: 4460, water: 95 },
  { date: '2020-11-06', days: 310, oil: 4250, gas: 4350, water: 100 },
  { date: '2020-12-06', days: 340, oil: 4150, gas: 4230, water: 110 },
  { date: '2021-01-06', days: 371, oil: 4050, gas: 4100, water: 120 },
  { date: '2021-02-06', days: 402, oil: 3960, gas: 3980, water: 130 },
  { date: '2021-03-06', days: 430, oil: 3870, gas: 3860, water: 140 },
  { date: '2021-04-06', days: 461, oil: 3780, gas: 3740, water: 150 },
  { date: '2021-05-06', days: 491, oil: 3690, gas: 3620, water: 165 },
  { date: '2021-06-06', days: 522, oil: 3600, gas: 3500, water: 180 },
];

export const samplePressureData = [
  { date: '2020-01-06', days: 5, pressure: 4500 },
  { date: '2020-07-06', days: 187, pressure: 4250 },
  { date: '2021-01-06', days: 371, pressure: 4010 },
  { date: '2021-06-06', days: 522, pressure: 3850 },
];

const pvtTable = [
  { Pressure: 5000, Bo: 1.48, Rs: 1000, Bg: 0.0006, muo: 0.30 },
  { Pressure: 4500, Bo: 1.49, Rs: 1000, Bg: 0.0007, muo: 0.32 },
  { Pressure: 4000, Bo: 1.50, Rs: 1000, Bg: 0.0008, muo: 0.35 },
  { Pressure: 3500, Bo: 1.51, Rs: 1000, Bg: 0.0009, muo: 0.40 },
  { Pressure: 3000, Bo: 1.52, Rs: 1000, Bg: 0.0010, muo: 0.45 }, // Bubble Point
  { Pressure: 2500, Bo: 1.45, Rs: 800, Bg: 0.0012, muo: 0.55 },
  { Pressure: 2000, Bo: 1.38, Rs: 600, Bg: 0.0015, muo: 0.70 },
  { Pressure: 1500, Bo: 1.30, Rs: 400, Bg: 0.0020, muo: 1.00 },
  { Pressure: 1000, Bo: 1.22, Rs: 200, Bg: 0.0030, muo: 1.50 },
  { Pressure: 500, Bo: 1.15, Rs: 50, Bg: 0.0060, muo: 2.50 },
];

export const samplePvtData = {
  inputs: {
    fluidType: 'black_oil',
    api: 35,
    gasGravity: 0.7,
    pb: 3000,
    temp: 200,
    salinity: 20000,
    h2s: 0,
    co2: 0,
    n2: 0,
    correlations: {
      pb_rs_bo: 'standing',
      viscosity: 'beal_cook_spillman',
    },
    rock: {
      cf: 4e-6
    },
    water: {
        cw: 3e-6,
    },
    swi: 0.2,
  },
  pvtTable: pvtTable,
};