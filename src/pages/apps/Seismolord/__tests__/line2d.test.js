/**
 * W5 Suite-side glue: the engine 2D stack through the shims (scan ->
 * strips -> assembly, intersections, misties) and the Line window's
 * empty state (jsdom render).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  scanLine2d, transcodeLineToStrips, buildLineManifest,
  geomFromLineManifest, assembleLineSection,
} from '@/pages/apps/Seismolord/engine/line2d';
import { lineIntersections, solveMisties } from '@/pages/apps/Seismolord/engine/line2dIntegration';
import Line2dPanel from '@/pages/apps/Seismolord/components/Line2dPanel';

const NS = 40;
const NTR = 30;

function buildSegy2d() {
  const traceBytes = 240 + NS * 4;
  const buf = new ArrayBuffer(3600 + NTR * traceBytes);
  const dv = new DataView(buf);
  dv.setInt16(3216, 4000, false);
  dv.setInt16(3220, NS, false);
  dv.setInt16(3224, 5, false);
  for (let i = 0; i < NTR; i++) {
    const off = 3600 + i * traceBytes;
    dv.setInt32(off + 20, 100 + i, false);
    dv.setInt16(off + 70, 1, false);
    dv.setInt32(off + 180, 1000 + i * 25, false);
    dv.setInt32(off + 184, 5000, false);
    for (let k = 0; k < NS; k++) dv.setFloat32(off + 240 + k * 4, i * 100 + k, false);
  }
  return buf;
}
const bufReader = (buf) => ({ size: buf.byteLength, read: async (o, l) => buf.slice(o, o + l) });

test('scan -> strips -> section round-trips through the shims', async () => {
  const reader = bufReader(buildSegy2d());
  const scan = await scanLine2d(reader);
  const strips = new Map();
  const t = await transcodeLineToStrips(reader, scan, {
    onStrip: ({ i, k, data }) => strips.set(`${i}-${k}`, data),
  });
  const manifest = buildLineManifest({
    lineId: 'x', name: 'x', scan, transcode: t, sourceFileName: 'x', sourceFileSize: 1,
  });
  const section = await assembleLineSection(
    async (i, k) => strips.get(`${i}-${k}`), geomFromLineManifest(manifest),
  );
  expect(section.data[7 * NS + 5]).toBe(Math.fround(705));
});

test('crossing + mistie chain works end to end', () => {
  const a = {
    x: Float64Array.from({ length: 50 }, (_, i) => i * 10),
    y: Float64Array.from({ length: 50 }, () => 100),
  };
  const b = {
    x: Float64Array.from({ length: 50 }, () => 200),
    y: Float64Array.from({ length: 50 }, (_, i) => i * 10),
  };
  const hits = lineIntersections(a, b, { cellM: 50 });
  expect(hits).toHaveLength(1);
  const res = solveMisties(
    [
      { id: 'A', picks: new Float32Array(50).fill(60) },
      { id: 'B', picks: new Float32Array(50).fill(62) },
    ],
    [{ a: 0, b: 1, ia: hits[0].ia, ib: hits[0].ib }],
    4,
  );
  expect(res.tied).toBe(1);
  expect(res.observations[0].dtMs).toBeCloseTo(8, 6);
  expect(res.rmsAfterMs).toBeLessThan(1e-6);
});

test('the Line window renders its empty state without a line', () => {
  render(
    <Line2dPanel
      lines={[]}
      refreshLines={() => {}}
      volumeManifest={null}
      affine={null}
      geom={null}
      overlays={{ horizons: [], surfaces: [], faults: [], draftSticks: [], seedPick: null, wells: [] }}
      storageCfg={{ supabaseUrl: '', getToken: async () => '' }}
    />,
  );
  expect(screen.getByTestId('line2d-empty')).toBeTruthy();
  expect(screen.getByTestId('line2d-misties').disabled).toBe(true);
});
