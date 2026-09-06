// Surface arithmetic (Mapping MS3, 2026-09-05) on grids the workstation
// holds in METRES (elevation for depth, thickness positive, attributes
// raw): two-surface ops resample B onto A's frame first; scalar ops
// touch live nodes only; a clip nulls nodes outside a boundary. Pure.

import { resampleTo, combine, thickness, scalarAdd, maskOutsidePolygon } from '../engine/surface';
import { specOfSurface, isLengthSurface } from './surfaceExport';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

export const ARITH_OPS = [
  { key: 'thickness', label: 'Isochore: top minus base', needsB: true },
  { key: 'add', label: 'A + B', needsB: true },
  { key: 'subtract', label: 'A minus B', needsB: true },
  { key: 'multiply', label: 'A × B (net thickness = isochore × NTG)', needsB: true },
  { key: 'min', label: 'Shallower of A and B (min)', needsB: true },
  { key: 'max', label: 'Deeper of A and B (max)', needsB: true },
  { key: 'scalarAdd', label: 'A + k', needsK: true },
  { key: 'scalarMultiply', label: 'A × k', needsK: true },
  { key: 'clip', label: 'Clip A to a boundary', needsBoundary: true },
];

const elementwise = (zA, zB, fn) => {
  if (zA.length !== zB.length) throw new Error('Surfaces must share a grid frame; resample first.');
  const out = new Float32Array(zA.length);
  for (let i = 0; i < zA.length; i++) out[i] = (isNull(zA[i]) || isNull(zB[i])) ? 1e30 : fn(zA[i], zB[i]);
  return out;
};

/** Result domain: lengths stay lengths for additive ops; products are attributes. */
function resultKind(op, a) {
  if (op === 'thickness') return { kind: 'isochore', zDomain: 'depth' };
  if (op === 'multiply' || op === 'scalarMultiply') return { kind: 'attribute', zDomain: 'attribute' };
  if (!isLengthSurface(a)) return { kind: 'attribute', zDomain: 'attribute' };
  return { kind: a.kind === 'isochore' ? 'isochore' : 'structure', zDomain: 'depth' };
}

/**
 * @param {{op:string, a:{surface, grid}, b?:{surface, grid}, k?:number,
 *   boundary?:{name, ring}}} p grids in metres, on their own frames
 * @returns {{grid:Float32Array, spec, kind, zDomain, name, provenance}}
 */
export function runArithmetic({ op, a, b = null, k = null, boundary = null }) {
  const def = ARITH_OPS.find((o) => o.key === op);
  if (!def) throw new Error(`Unknown surface operation "${op}".`);
  if (!a?.surface || !a?.grid) throw new Error('Pick surface A.');
  const spec = specOfSurface(a.surface);
  let zB = null;
  if (def.needsB) {
    if (!b?.surface || !b?.grid) throw new Error('Pick surface B.');
    if (b.surface.id === a.surface.id) throw new Error('Pick two different surfaces.');
    zB = resampleTo(b.grid, specOfSurface(b.surface), spec);
  }
  if (def.needsK && !Number.isFinite(Number(k))) throw new Error('Type a number for k.');
  if (def.needsBoundary && !(boundary?.ring?.length >= 3)) throw new Error('Pick a boundary polygon.');
  const kk = Number(k);
  let grid;
  let name;
  switch (op) {
    case 'thickness': grid = thickness(a.grid, zB); name = `${a.surface.name} to ${b.surface.name} isochore`; break;
    case 'add': grid = combine(a.grid, zB, 'add'); name = `${a.surface.name} + ${b.surface.name}`; break;
    case 'subtract': grid = combine(a.grid, zB, 'subtract'); name = `${a.surface.name} minus ${b.surface.name}`; break;
    case 'multiply': grid = combine(a.grid, zB, 'multiply'); name = `${a.surface.name} × ${b.surface.name}`; break;
    case 'min': grid = elementwise(a.grid, zB, Math.max); name = `shallower of ${a.surface.name} and ${b.surface.name}`; break; // elevation: shallower = larger
    case 'max': grid = elementwise(a.grid, zB, Math.min); name = `deeper of ${a.surface.name} and ${b.surface.name}`; break;
    case 'scalarAdd': grid = scalarAdd(a.grid, kk); name = `${a.surface.name} ${kk >= 0 ? '+' : '-'} ${Math.abs(kk)}`; break;
    case 'scalarMultiply': grid = elementwise(a.grid, a.grid, (v) => v * kk); name = `${a.surface.name} × ${kk}`; break;
    case 'clip': grid = maskOutsidePolygon(a.grid, spec, boundary.ring); name = `${a.surface.name} clipped to ${boundary.name}`; break;
    default: throw new Error(`Unknown surface operation "${op}".`);
  }
  const { kind, zDomain } = resultKind(op, a.surface);
  return {
    grid, spec, kind, zDomain, name,
    provenance: {
      engine: 'mapping-surface-studio',
      arithmetic: { op, a: a.surface.id, b: b?.surface?.id ?? null, k: def.needsK ? kk : null, boundary: boundary?.id ?? null },
      ...(op === 'thickness' ? { thickness: { top: a.surface.id, base: b.surface.id } } : {}),
      z_convention: zDomain === 'depth' ? (kind === 'isochore' ? 'thickness' : 'elevation') : 'raw',
    },
  };
}
