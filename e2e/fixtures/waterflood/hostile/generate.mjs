// Generates the Surveillance hostile file set (WF-U1, PL2). Run:
//   node e2e/fixtures/waterflood/hostile/generate.mjs
// Every file holds the same 20 days of two injectors and two producers, so a
// correct door reads each to the same engine rows as base-iso.csv.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const days = 20;
const rows = [];
for (let t = 0; t < days; t += 1) {
  const d = new Date(Date.UTC(2025, 0, 1 + t));
  const iso = d.toISOString().slice(0, 10);
  rows.push({ d, iso, well: 'INJ-1', oil: '', water: '', gas: '', inj: 1000 + 10 * t + 0.5, whp: 2000 + 25 * t + 0.25 });
  rows.push({ d, iso, well: 'INJ-2', oil: '', water: '', gas: '', inj: 800.25 + 5 * t, whp: 1500.5 + 4 * t });
  rows.push({ d, iso, well: 'PROD-1', oil: 900.5 - 8 * t, water: 100.25 + 9 * t, gas: 450.75 - 4 * t, inj: '', whp: '' });
  rows.push({ d, iso, well: 'PROD-2', oil: 700.75 - 5 * t, water: 50.5 + 6 * t, gas: 350.25 - 2 * t, inj: '', whp: '' });
}
const M3_PER_BBL = 0.158987294928;
const M3_PER_SCF = 0.028316846592;
const KPA_PER_PSI = 6.894757293168;
const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
const mdy = (d) => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;
const comma = (v) => (v === '' ? '' : String(v).replace('.', ','));
const f = (v, k) => (v === '' ? '' : String(Number((v * k).toFixed(6))));
const write = (name, lines) => fs.writeFileSync(path.join(here, name), `${lines.join('\n')}\n`);

write('base-iso.csv', ['date,well,oil_bbl,water_bbl,gas_mcf,inj_bbl,whp_psi',
  ...rows.map((r) => [r.iso, r.well, r.oil, r.water, r.gas, r.inj, r.whp].join(','))]);
write('dayfirst-semicolon-comma.csv', ['Date;Well;Oil rate (STB/d);Water rate (bbl/d);Gas rate (Mscf/d);Injection rate (bbl/d);Injection pressure (psi)',
  ...rows.map((r) => [dmy(r.d), r.well, comma(r.oil), comma(r.water), comma(r.gas), comma(r.inj), comma(r.whp)].join(';'))]);
write('si-units.csv', ['Date,Well,Oil rate (sm3/d),Water rate (m3/d),Gas rate (sm3/d),Injection rate (m3/d),Injection pressure (kPa)',
  ...rows.map((r) => [r.iso, r.well, f(r.oil, M3_PER_BBL), f(r.water, M3_PER_BBL), f(r.gas, 1000 * M3_PER_SCF), f(r.inj, M3_PER_BBL), f(r.whp, KPA_PER_PSI)].join(','))]);
write('reordered-extra-monthfirst.csv', ['Comment,whp_psi,inj_bbl,Well Name,Choke (64ths),gas_mcf,water_bbl,oil_bbl,Production Date',
  ...rows.map((r) => [r.well === 'PROD-1' ? '"note, with comma"' : '', r.whp, r.inj, r.well, 32, r.gas, r.water, r.oil, mdy(r.d)].join(','))]);
write('ambiguous-dates.csv', ['date,well,oil_bbl,water_bbl,gas_mcf,inj_bbl,whp_psi',
  ...rows.filter((r) => r.d.getUTCDate() <= 12).map((r) => [dmy(r.d), r.well, r.oil, r.water, r.gas, r.inj, r.whp].join(','))]);
write('volumes-only.csv', ['date,well,cum_oil,oil_volume,water_volume', '2025-01-01,PROD-1,1000,900,100']);
write('no-header.csv', rows.slice(0, 8).map((r) => [r.iso, r.well, r.oil, r.water, r.gas, r.inj, r.whp].join(',')));
write('totals-comments-blanks.csv', ['# exported from a surveillance database', 'date,well,oil_bbl,water_bbl,gas_mcf,inj_bbl,whp_psi',
  ...rows.flatMap((r, i) => [[r.iso, r.well, r.oil, r.water, r.gas, r.inj, r.whp].join(','), ...(i === 10 ? [''] : [])]),
  'Total,,,,,,']);
console.log('written');
