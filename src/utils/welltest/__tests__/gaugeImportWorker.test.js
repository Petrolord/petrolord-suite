/**
 * WTA-U2-010: the gauge import runs in a Web Worker. The worker file only
 * wires `self` to createGaugeHandler, so these tests run the code the
 * worker runs, and the page's client (worker, or the same protocol on the
 * page's thread where no Worker exists).
 */
import fs from 'fs';
import path from 'path';
import { importGaugeCsv } from '../gaugeImport';
import { createGaugeHandler } from '../gaugeImportProtocol';
import { createGaugeImporter } from '../gaugeImportClient';

const hostile = fs.readFileSync(path.join(__dirname, '../../../../e2e/fixtures/welltest/hostile/gauge-dayfirst-psig.csv'), 'utf8');
const run = (handler, msg) => {
  const out = [];
  handler(msg, (m) => out.push(m));
  return out;
};

describe('the worker protocol reads exactly what the one-call import reads', () => {
  test('a hostile gauge file (day-first stamps, psig): same mapping, same rows; a mapping change re-reads the kept table', () => {
    const ref = importGaugeCsv(hostile, { defaultPressure: 'psia' });
    const h = createGaugeHandler();
    const msgs = run(h, { type: 'read', id: 1, text: hostile, defaults: { defaultPressure: 'psia' } });
    const done = msgs.find((m) => m.type === 'done');
    expect(done.result.rows).toEqual(ref.rows);
    expect(done.mapping).toEqual(ref.mapping);
    expect(done.table).toEqual({ headers: ref.table.headers, columnCount: ref.table.columnCount, rowCount: ref.table.rows.length, decimal: ref.table.decimal });
    expect(done.table.rows).toBeUndefined(); // the page never receives the raw table
    const psia = run(h, { type: 'convert', id: 2, mapping: { ...done.mapping, pressureUnit: 'psia' } }).find((m) => m.type === 'done');
    expect(psia.result.rows[0].p).toBeCloseTo(done.result.rows[0].p - 14.695948775513449, 9);
  });

  test('388,800 readings: every one arrives, with progress on the way', () => {
    const lines = ['Time (hr),Pressure (psia)'];
    for (let s = 0; s < 388800; s += 1) lines.push(`${(s / 3600).toFixed(6)},${(4500 + Math.log1p(s)).toFixed(3)}`);
    const msgs = run(createGaugeHandler(), { type: 'read', id: 7, text: lines.join('\n') });
    const progress = msgs.filter((m) => m.type === 'progress' && m.stage === 'converting');
    expect(progress.length).toBe(15); // every 25,000 rows
    expect(progress[progress.length - 1]).toMatchObject({ done: 375000, total: 388800 });
    const done = msgs.find((m) => m.type === 'done');
    expect(done.result.rows).toHaveLength(388800);
  }, 120000);

  test('a convert with no file held is an error, not a crash', () => {
    const msgs = run(createGaugeHandler(), { type: 'convert', id: 3, mapping: {} });
    expect(msgs).toEqual([{ type: 'error', id: 3, message: 'No gauge file is held; import it again.' }]);
  });
});

describe('the page client', () => {
  test('without a Worker it runs the same protocol after a yield and resolves the same rows', async () => {
    const imp = createGaugeImporter({ workerFactory: null });
    const seen = [];
    const m = await imp.read(hostile, { defaultPressure: 'psia' }, (p) => seen.push(p.stage));
    expect(imp.usesWorker()).toBe(false);
    expect(m.result.rows).toEqual(importGaugeCsv(hostile, { defaultPressure: 'psia' }).rows);
    expect(seen).toContain('reading');
  });

  test('with a worker: messages go to it, progress comes back, Cancel terminates it and rejects the import', async () => {
    const handler = createGaugeHandler();
    const posted = [];
    let terminated = 0;
    const fake = {
      onmessage: null,
      postMessage(msg) { posted.push(msg.type); setTimeout(() => handler(msg, (m) => this.onmessage?.({ data: m })), 0); },
      terminate() { terminated += 1; },
    };
    const imp = createGaugeImporter({ workerFactory: async () => fake });
    const stages = [];
    const m = await imp.read(hostile, {}, (p) => stages.push(p.stage));
    expect(imp.usesWorker()).toBe(true);
    expect(posted).toEqual(['read']);
    expect(stages[0]).toBe('reading');
    expect(m.result.rows.length).toBeGreaterThan(5);
    // a long import, cancelled: the promise rejects as cancelled and the worker is terminated
    const slow = { onmessage: null, postMessage() {}, terminate() { terminated += 1; } };
    const imp2 = createGaugeImporter({ workerFactory: async () => slow });
    const p = imp2.read('t,p\n1,2', {});
    await new Promise((r) => setTimeout(r, 5));
    imp2.cancel();
    await expect(p).rejects.toMatchObject({ cancelled: true });
    expect(terminated).toBe(1);
  });
});

describe('the rows cross from the worker as transferable arrays', () => {
  test('packed rows unpack to the same rows, temperature kept where read and absent where not', () => {
    const { packRows, unpackRows } = require('../gaugeImportProtocol');
    const rows = [{ t: 0, p: 4500.5, T: 212 }, { t: 0.1, p: 4501 }, { t: 0.2, p: 4502.25, T: 212.5 }];
    expect(unpackRows(packRows(rows))).toEqual(rows);
    const posted = [];
    createGaugeHandler({ packed: true })({ type: 'read', id: 1, text: hostile }, (m, transfer) => posted.push({ m, transfer }));
    const done = posted.find((x) => x.m.type === 'done');
    expect(done.m.result.rows).toBeNull();
    expect(done.transfer).toHaveLength(3);
    expect(unpackRows(done.m.result.packed)).toEqual(importGaugeCsv(hostile).rows);
  });
});
