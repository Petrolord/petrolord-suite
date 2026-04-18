import { healMaterialBalanceData } from './healMaterialBalanceData';

// Task 1.2, Task 4: PVT Interpolation
/**
 * Linearly interpolates PVT data for a given pressure.
 * Assumes pvtData has arrays: pressure, Bo, Bg, Rs
 */
export const interpolatePVT = (pressure, pvtData) => {
  console.log(`[PVT Engine] Requesting interpolation for Pressure: ${pressure} psia`);

  if (!pvtData || !pvtData.pressure || pvtData.pressure.length === 0) {
    console.warn(`[PVT Engine] PVT data missing or empty. Returning default mocks.`);
    return { Bo: 1.2, Bg: 0.001, Rs: 500, ViscO: 1.5, ViscG: 0.02 };
  }

  // Combine and sort PVT table by pressure ascending
  const table = pvtData.pressure.map((p, i) => ({
    p: Number(p),
    Bo: Number(pvtData.Bo?.[i] || 1.2),
    Bg: Number(pvtData.Bg?.[i] || 0.001),
    Rs: Number(pvtData.Rs?.[i] || 500)
  })).sort((a, b) => a.p - b.p);

  const minP = table[0].p;
  const maxP = table[table.length - 1].p;

  // Clamp out-of-bounds pressures
  if (pressure <= minP) {
    console.log(`[PVT Engine] Pressure ${pressure} <= min PVT ${minP}. Clamping to minimum.`);
    return { Bo: table[0].Bo, Bg: table[0].Bg, Rs: table[0].Rs };
  }
  if (pressure >= maxP) {
    console.log(`[PVT Engine] Pressure ${pressure} >= max PVT ${maxP}. Clamping to maximum.`);
    const last = table[table.length - 1];
    return { Bo: last.Bo, Bg: last.Bg, Rs: last.Rs };
  }

  // Find bounding indices
  let i = 0;
  while (i < table.length - 1 && table[i + 1].p < pressure) {
    i++;
  }

  const p1 = table[i];
  const p2 = table[i + 1];

  // Linear Interpolation
  const fraction = (pressure - p1.p) / (p2.p - p1.p);
  
  const interpolated = {
    Bo: p1.Bo + fraction * (p2.Bo - p1.Bo),
    Bg: p1.Bg + fraction * (p2.Bg - p1.Bg),
    Rs: p1.Rs + fraction * (p2.Rs - p1.Rs)
  };

  console.log(`[PVT Engine] Interpolated PVT at ${pressure} psia: Bo=${interpolated.Bo.toFixed(4)}, Bg=${interpolated.Bg.toFixed(4)}, Rs=${interpolated.Rs.toFixed(2)}`);
  return interpolated;
};

// Task 1.3, Task 5: Intermediate Calculations
export const calculateF_Oil = (Np, Gp, Wp, Bo, Bg, Bw, Rs) => {
  const F = (Number(Np)*Number(Bo)) + (Number(Gp) - Number(Np)*Number(Rs))*Number(Bg) + (Number(Wp)*Number(Bw));
  return isFinite(F) ? F : 0;
};

export const calculateF_Gas = (Gp, Bg, Wp, Bw) => {
  const F = (Number(Gp) * Number(Bg)) + (Number(Wp) * Number(Bw));
  return isFinite(F) ? F : 0;
};

export const calculateEfw = (Boi, cw, cf, Swi, deltaP) => {
  const denom = (1 - Number(Swi));
  if (denom === 0) return 0;
  const Efw = Number(Boi) * ((Number(cw) * Number(Swi) + Number(cf)) / denom) * Number(deltaP);
  return isFinite(Efw) ? Efw : 0;
};

export const calculateEo = (Bo, Boi, Rs, Rsi, Bg) => {
  const Eo = (Number(Bo) - Number(Boi)) + (Number(Rsi) - Number(Rs)) * Number(Bg);
  return isFinite(Eo) ? Eo : 0;
};

export const calculateEg = (Boi, Bg, Bgi) => {
  if (Number(Bgi) === 0) return 0;
  const Eg = Number(Boi) * ((Number(Bg) / Number(Bgi)) - 1);
  return isFinite(Eg) ? Eg : 0;
};

/**
 * Main Material Balance Calculation Engine
 */
export const runMaterialBalanceEngine = (productionData = [], pressureData = [], pvtData = [], params = {}) => {
  console.log("[MB Engine] Starting calculation run...");
  
  // Task 2: Data Healing explicitly handles and removes Day 0 requirement
  const { alignedTimeSeries, healingReport } = healMaterialBalanceData(productionData, pressureData);
  console.log("[MB Engine] Healed Data Series length:", alignedTimeSeries.length);

  if (alignedTimeSeries.length === 0) {
    return { message: 'No valid data available after healing.', timeSeries: [], healingReport };
  }

  const initialRow = alignedTimeSeries[0];
  const initialReferenceDay = initialRow.day;
  const initialPressure = Number(initialRow.pressure) || 4000;
  
  console.log(`[MB Engine] Baseline established at Day ${initialReferenceDay} with Pressure ${initialPressure} psia.`);

  const initialNp = Number(initialRow.Np || 0);
  const initialGp = Number(initialRow.Gp || 0);
  const initialWp = Number(initialRow.Wp || 0);

  // Derive initial fluid properties
  const initialPvt = interpolatePVT(initialPressure, pvtData);
  const Boi = initialPvt.Bo;
  const Bgi = initialPvt.Bg;
  const Rsi = initialPvt.Rs;

  const cw = Number(params.cw || 0.000003);
  const cf = Number(params.cf || 0.000004);
  const Swi = Number(params.Swi || 0.2);
  const Bw = Number(params.Bw || 1.0);

  console.log(`[MB Engine] Using Constants: cw=${cw}, cf=${cf}, Swi=${Swi}, Bw=${Bw}`);

  // Task 5: Calculate intermediate terms and ensure finite values
  const timeSeries = alignedTimeSeries.map(row => {
    const currentDay = row.day;
    const currentPressure = Number(row.pressure);
    const currentPvt = interpolatePVT(currentPressure, pvtData);
    
    const deltaNp = Math.max(0, Number(row.Np || 0) - initialNp);
    const deltaGp = Math.max(0, Number(row.Gp || 0) - initialGp);
    const deltaWp = Math.max(0, Number(row.Wp || 0) - initialWp);
    const deltaP = initialPressure - currentPressure;

    const F = calculateF_Oil(deltaNp, deltaGp, deltaWp, currentPvt.Bo, currentPvt.Bg, Bw, currentPvt.Rs);
    const Eo = calculateEo(currentPvt.Bo, Boi, currentPvt.Rs, Rsi, currentPvt.Bg);
    const Eg = calculateEg(Boi, currentPvt.Bg, Bgi);
    const Efw = calculateEfw(Boi, cw, cf, Swi, deltaP);
    const Et = Eo + Eg + Efw;

    return {
      day: currentDay,
      date: row.date,
      pressure: currentPressure,
      P_init: initialPressure,
      relativeNp: deltaNp,
      relativeGp: deltaGp,
      relativeWp: deltaWp,
      F,
      Eo,
      Eg,
      Efw,
      Et
    };
  });

  console.log("[MB Engine] Intermediate Calculations Complete. Sample row 1:", timeSeries[1] || timeSeries[0]);

  return {
    initialReferenceDay,
    initialPressure,
    message: `Calculations completed successfully.`,
    timeSeries,
    healingReport 
  };
};