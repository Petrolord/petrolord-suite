// The Material Balance Studio videos' extra file: the Ekene tank history
// carried on through the waterflood (2023 to 2025), from the same engine
// fixture the kit's tank history comes from
// (packages/engines/test-data/ekene-dynamic). The first seven rows are the
// kit's ekene-mbal-tank-history.csv to the character; the six flood-era rows
// are the fixture's pressure surveys (each reads the end of the previous
// month) with the cumulatives of that month and the water injected by
// Ekene-2 and Ekene-4. Per-row Bo follows the fixture's line above the
// bubble point, Bo = Boi (1 + co (pi - p)). Material balance with the
// injection in F returns the same 12,139,208 stb; leave the injection out
// and the tank looks larger.
//   node tools/demo-video/seed/mbal_assets.mjs [outDir] [kitDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const out = process.argv[2] || '/root/demo-video-work/mbal-assets';
const kit = process.argv[3] || path.join(ROOT, 'dist-demo/ekene-demo-v4');
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/engines/test-data/ekene-dynamic', f), 'utf8'));
const mbal = fx('mbal.json');
const wf = fx('waterflood.json');
const { pi_psia: pi, co_per_psi: co, rsi_scf_stb: rs, bw_rb_stb: bw } = mbal.design;
const boi = mbal.inputs.production_data[0].bo_rb_stb ?? 1.2;

const kitCsv = fs.readFileSync(path.join(kit, '09-reservoir/ekene-mbal-tank-history.csv'), 'utf8').trim().split(/\r?\n/);
if (kitCsv[0] !== 'date,pressure_psia,cum_oil_stb,cum_gas_scf,cum_water_stb,bo_rb_stb,rs_scf_stb,bw_rb_stb') throw new Error(`unexpected kit header ${kitCsv[0]}`);
const header = `${kitCsv[0]},cum_water_inj_stb`;
const lines = [header, ...kitCsv.slice(1).map((l) => `${l},0.0000`)];
const track = Object.fromEntries(wf.pressure.track.map((r) => [r.label, r]));
for (const s of wf.pressure.surveys) {
  const r = track[s.reads_month];
  if (!r || Math.abs(r.p_end_psia - s.p_psia) > 1e-9) throw new Error(`survey ${s.date} does not read ${s.reads_month}`);
  const bo = boi * (1 + co * (pi - s.p_psia));
  lines.push([s.date, s.p_psia.toFixed(4), r.cum_np_stb.toFixed(4), (r.cum_np_stb * rs).toFixed(2), r.cum_wp_stb.toFixed(4),
    bo.toFixed(9), rs.toFixed(2), bw.toFixed(4), r.cum_wi_bbl.toFixed(4)].join(','));
}
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'ekene-mbal-tank-history-2025.csv');
fs.writeFileSync(file, `${lines.join('\n')}\n`);
console.log(`${file}: ${lines.length - 1} rows`);
