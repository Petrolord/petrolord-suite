// Demo core samples for the Lab Data tab (the sampleFractionalFlowData
// precedent: an inline deterministic seed, no file fetching, clearly
// labeled synthetic). Two rocks share one true J curve (so the Capillary
// tab demonstrates the Leverett collapse) and carry Corey kr tables with
// small deterministic noise (so fitting has something honest to do).
import { buildCoreyOilWater, LEVERETT_C } from '@/utils/scalCalculations';

const J_TRUE = { a: 0.28, b: 1.45, Swirr: 0.12 };
const jAt = (Sw) => J_TRUE.a * Math.pow((Sw - J_TRUE.Swirr) / (1 - J_TRUE.Swirr), -J_TRUE.b);

const pcRowsFor = (rock, swPoints) => swPoints.map((Sw) => ({
  Sw: Number(Sw.toFixed(2)),
  Pc_psi: Number(
    (jAt(Sw) * rock.sigmaCos / (LEVERETT_C * Math.sqrt(rock.k_md / rock.phi))).toFixed(4),
  ),
}));

const krRowsFor = (corey, n, jitterPhase) => {
  const { rows } = buildCoreyOilWater(corey, { n });
  return rows.map((r, i) => {
    const jw = 1 + 0.05 * Math.sin(2.9 * i + jitterPhase);
    const jo = 1 + 0.05 * Math.sin(2.1 * i + jitterPhase + 1.3);
    return {
      Sw: Number(r.Sw.toFixed(3)),
      krw: i === 0 ? 0 : Number((r.krw * jw).toFixed(5)),
      kro: i === n ? 0 : Number((r.kro * jo).toFixed(5)),
    };
  });
};

export function buildDemoSamples() {
  const rockA = { k_md: 420, phi: 0.27, sigmaCos: 72 };   // air-brine, theta 0
  const rockB = { k_md: 35, phi: 0.16, sigmaCos: 367.7 }; // air-mercury, 480*cos(40)
  const swPoints = [0.18, 0.24, 0.32, 0.42, 0.55, 0.7, 0.85, 0.95];
  return [
    {
      name: 'Demo core A (synthetic)',
      depth_ft: '8450', k_md: '420', phi: '0.27',
      sigma_dyncm: '72', thetaDeg: '0',
      krRows: krRowsFor({ Swc: 0.18, Sor: 0.22, krwMax: 0.32, kroMax: 0.88, nw: 2.4, no: 2.1 }, 12, 0.4),
      pcRows: pcRowsFor(rockA, swPoints),
    },
    {
      name: 'Demo core B (synthetic)',
      depth_ft: '8492', k_md: '35', phi: '0.16',
      sigma_dyncm: '480', thetaDeg: '40',
      krRows: krRowsFor({ Swc: 0.22, Sor: 0.26, krwMax: 0.24, kroMax: 0.8, nw: 2.9, no: 1.9 }, 12, 1.7),
      pcRows: pcRowsFor(rockB, swPoints),
    },
  ];
}

export const KR_CSV_TEMPLATE = 'Sw,krw,kro\n0.20,0.000,0.900\n0.35,0.015,0.520\n0.50,0.070,0.240\n0.65,0.180,0.070\n0.75,0.320,0.000\n';
export const PC_CSV_TEMPLATE = 'Sw,Pc_psi\n0.20,18.5\n0.30,9.6\n0.45,4.8\n0.65,2.2\n0.90,0.9\n';
