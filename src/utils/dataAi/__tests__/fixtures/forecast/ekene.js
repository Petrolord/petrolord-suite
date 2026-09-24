// The Ekene synthetic production (ours): the three wells of 60 months the
// engine's oracle writes into forecast_cases.json (`ekene`), as the CSV a
// user would upload. Months run from 2021-01. Read from the vendored golden
// so the fixture cannot drift from the engine's own record.
import fs from 'fs';
import path from 'path';

export const GOLDEN_PATH = path.resolve(__dirname, '../../../../../../packages/engines/test-data/dataai/goldens/forecast_cases.json');
export const GOLDEN = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
export const EKENE = GOLDEN.ekene;
export const month = (i) => `${2021 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

export const ekeneCsv = () => {
  const lines = ['well,month,oil_stb'];
  EKENE.forEach((w) => w.rate.forEach((v, i) => lines.push(`${w.well},${month(i)},${v}`)));
  return `${lines.join('\n')}\n`;
};
