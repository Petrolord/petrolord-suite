// Local Database for Pipes, Materials, Fittings, Valves
export const PipeSchedules = [
  { nominalSize: 2, schedule: '40', od: 2.375, id: 2.067, wallThickness: 0.154, weight: 3.65 },
  { nominalSize: 4, schedule: '40', od: 4.500, id: 4.026, wallThickness: 0.237, weight: 10.79 },
  { nominalSize: 6, schedule: '40', od: 6.625, id: 6.065, wallThickness: 0.280, weight: 18.97 },
  { nominalSize: 8, schedule: '40', od: 8.625, id: 7.981, wallThickness: 0.322, weight: 28.55 },
  { nominalSize: 10, schedule: '40', od: 10.750, id: 10.020, wallThickness: 0.365, weight: 40.48 },
  { nominalSize: 12, schedule: '40', od: 12.750, id: 11.938, wallThickness: 0.406, weight: 53.52 },
];

export const Materials = [
  { id: 'cs_api_5l_b', name: 'Carbon Steel API 5L Grade B', yieldStrength: 35000, tensileStrength: 60000, roughness: 0.0018 },
  { id: 'cs_api_5l_x52', name: 'Carbon Steel API 5L X52', yieldStrength: 52000, tensileStrength: 66000, roughness: 0.0018 },
  { id: 'ss_316l', name: 'Stainless Steel 316L', yieldStrength: 25000, tensileStrength: 70000, roughness: 0.0006 },
  { id: 'hdpe', name: 'HDPE', yieldStrength: 3000, tensileStrength: 4500, roughness: 0.000005 },
];

export const Fittings = [
  { id: 'elbow_90_lr', name: '90° Elbow (Long Radius)', kValue: 0.3 },
  { id: 'elbow_90_sr', name: '90° Elbow (Standard)', kValue: 0.75 },
  { id: 'tee_branch', name: 'Tee (Branch Flow)', kValue: 1.0 },
  { id: 'tee_line', name: 'Tee (Line Flow)', kValue: 0.2 },
];

export const Valves = [
  { id: 'gate_full', name: 'Gate Valve (Fully Open)', kValue: 0.15 },
  { id: 'ball_full', name: 'Ball Valve (Fully Open)', kValue: 0.05 },
  { id: 'globe_full', name: 'Globe Valve (Fully Open)', kValue: 10.0 },
  { id: 'check_swing', name: 'Swing Check Valve', kValue: 2.0 },
];