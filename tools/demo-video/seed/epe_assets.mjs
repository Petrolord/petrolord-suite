// The Petroleum Economics Studio videos' extra files, derived from the kit's
// 12-economics files so the two agree to the barrel:
//   ekene-production-2p-without-ekene-11.csv  the four producers only
//   ekene-production-field-without-ekene-11.csv  the same four producers summed
//                                             to field columns (oil_bbl, gas_mscf,
//                                             water_bbl), the layout a received
//                                             forecast uses
//   ekene-opex-without-ekene-11.csv           USD 600,000 fixed plus USD 4 per
//                                             barrel of oil and water, while
//                                             the four producers flow
// Ekene-11's own fixed opex (USD 100,000 a year) and its USD 4 a barrel come
// out; the kit's README states both. With no capex file and abandonment
// USD 6.0 MM the Run Console returns the kit's "without Ekene-11" value.
// The script checks the kit's own opex file is the same rule with Ekene-11
// in, so a kit change that breaks the rule stops it.
//   node tools/demo-video/seed/epe_assets.mjs [outDir] [kitDir]
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || '/root/demo-video-work/epe-assets';
const kit = process.argv[3] || '/root/wt-kit4/dist-demo/ekene-demo-v4';
const read = (f) => fs.readFileSync(path.join(kit, '12-economics', f), 'utf8').trim().split(/\r?\n/).map((l) => l.split(','));
const prod = read('ekene-production-2p.csv');
const opex = read('ekene-opex.csv');
const head = prod[0];
const keep = head.map((h, i) => (h.startsWith('ekene_11_') ? -1 : i)).filter((i) => i >= 0);
const liquids = (row, wells) => head.reduce((s, h, i) => (i > 0 && /_(oil|water)_bbl$/.test(h) && wells(h) ? s + Number(row[i]) : s), 0);
const all = () => true;
const no11 = (h) => !h.startsWith('ekene_11_');
const has11 = (row) => head.some((h, i) => h.startsWith('ekene_11_oil') && Number(row[i]) > 0);

// the kit's opex file follows the rule (with Ekene-11)
for (const row of prod.slice(1)) {
  const o = opex.find((r) => r[0] === row[0]);
  const fixed = 600000 + (has11(row) ? 100000 : 0);
  const want = fixed + 4 * liquids(row, all);
  if (Math.abs(Number(o[3]) - want) > 0.02) throw new Error(`kit opex ${row[0]}: ${o[3]} vs rule ${want.toFixed(2)}`);
}

const rows = prod.slice(1).filter((row) => liquids(row, no11) > 0);
const prodOut = [keep.map((i) => head[i]).join(','), ...rows.map((r) => keep.map((i) => r[i]).join(','))];
const opexOut = ['year,fixed_opex_usd,variable_opex_usd,total_opex_usd', ...rows.map((r) => {
  const v = 4 * liquids(r, no11);
  return [r[0], '600000.00', v.toFixed(2), (600000 + v).toFixed(2)].join(',');
})];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ekene-production-2p-without-ekene-11.csv'), `${prodOut.join('\n')}\n`);
const stream = (r, re) => head.reduce((t, h, i) => (re.test(h) && no11(h) ? t + Number(r[i]) : t), 0);
const fieldOut = ['year,oil_bbl,gas_mscf,water_bbl', ...rows.map((r) => [r[0], stream(r, /_oil_bbl$/).toFixed(3), stream(r, /_gas_mscf$/).toFixed(3), stream(r, /_water_bbl$/).toFixed(3)].join(','))];
fs.writeFileSync(path.join(out, 'ekene-production-field-without-ekene-11.csv'), `${fieldOut.join('\n')}\n`);
fs.writeFileSync(path.join(out, 'ekene-opex-without-ekene-11.csv'), `${opexOut.join('\n')}\n`);
console.log(`wrote ${rows.length} years (${rows[0][0]} to ${rows[rows.length - 1][0]}) to ${out}`);
