// Structure import (S4): a Mapping Studio surface (geo_surfaces node grid)
// -> per-cell TOPS for the sim deck builder. Pure resampling + unit seams;
// the registry I/O (listSurfaces/downloadSurfaceGrid) stays in the caller.
//
// Conventions: geo_surfaces grids are node-registered row-major nx*ny
// (x fastest), origin at (origin_x, origin_y), y increasing with row —
// the same +x/+y frame the sim grid uses, so I tracks x and J tracks y.
// Structure maps carry z in metres (z_unit 'm' unless the row says 'ft'),
// positive-down depth; the deck wants feet.

const FT_PER_M = 3.280839895013123;

const toFt = (v, unit) => ((unit || 'm') === 'ft' ? v : v * FT_PER_M);

/** Bilinear sample of a node-registered grid at fractional node coords
 *  (fx, fy in node units). NaN nodes poison their cell; the caller
 *  patches afterwards. */
function bilinear(values, nx, ny, fx, fy) {
  const x0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const v00 = values[y0 * nx + x0];
  const v10 = values[y0 * nx + x0 + 1];
  const v01 = values[(y0 + 1) * nx + x0];
  const v11 = values[(y0 + 1) * nx + x0 + 1];
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

/**
 * Resample a surface onto an nx*ny sim grid laid over the surface's own
 * extent. Returns per-cell tops (ft, natural order, I fastest), the cell
 * sizes that cover the extent, and honest stats/warnings.
 *
 * @param {{nx, ny, dx, dy, z_unit?, xy_unit?, z_domain?, name?}} surface
 *   geo_surfaces row (node counts and node spacings, surface units)
 * @param {Float32Array|number[]} values surface z at the nodes
 * @param {{nx, ny}} simGrid target sim-grid areal dimensions
 */
export function sampleSurfaceToTops(surface, values, simGrid) {
  const warnings = [];
  const sNx = Number(surface?.nx);
  const sNy = Number(surface?.ny);
  const nx = Math.round(Number(simGrid?.nx));
  const ny = Math.round(Number(simGrid?.ny));
  if (!(sNx >= 2 && sNy >= 2) || !values || values.length !== sNx * sNy) {
    throw new Error('Surface grid is missing or does not match its nx*ny.');
  }
  if (!(nx >= 1 && ny >= 1)) throw new Error('Sim grid needs positive NX and NY.');
  if ((surface.z_domain || 'depth') !== 'depth') {
    throw new Error(`Surface '${surface.name || surface.id}' is in the ${surface.z_domain} domain — a depth-converted structure surface is required.`);
  }

  // Mask the registry's null sentinel (default 1e30) as holes.
  const nullValue = Number(surface.null_value ?? 1e30);
  const masked = new Float64Array(values.length);
  for (let idx = 0; idx < values.length; idx += 1) {
    const v = Number(values[idx]);
    masked[idx] = (!Number.isFinite(v) || Math.abs(v) >= 1e29
      || Math.abs(v - nullValue) <= Math.abs(nullValue) * 1e-6) ? NaN : v;
  }

  const widthFt = toFt((sNx - 1) * Number(surface.dx), surface.xy_unit);
  const heightFt = toFt((sNy - 1) * Number(surface.dy), surface.xy_unit);
  const dxFt = widthFt / nx;
  const dyFt = heightFt / ny;

  const tops = new Array(nx * ny);
  let nanCells = 0;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      // Cell center in node coordinates.
      const fx = ((i + 0.5) / nx) * (sNx - 1);
      const fy = ((j + 0.5) / ny) * (sNy - 1);
      const z = bilinear(masked, sNx, sNy, fx, fy);
      tops[j * nx + i] = Number.isFinite(z) ? toFt(z, surface.z_unit) : NaN;
    }
  }
  // Patch NaN cells (holes in the mapped surface) with the mean of the
  // valid cells — honestly reported, and refused when holes dominate.
  const valid = tops.filter((v) => Number.isFinite(v));
  if (!valid.length) throw new Error('The surface has no valid values over the grid.');
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  for (let idx = 0; idx < tops.length; idx += 1) {
    if (!Number.isFinite(tops[idx])) {
      tops[idx] = mean;
      nanCells += 1;
    }
    const v = tops[idx];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  if (nanCells > tops.length / 4) {
    throw new Error(`The surface has holes over ${nanCells} of ${tops.length} cells — map a fuller surface first.`);
  }
  if (nanCells > 0) {
    warnings.push(`${nanCells} of ${tops.length} cells fell in surface holes and were filled with the mean depth.`);
  }
  if (min <= 0) {
    throw new Error('Sampled tops include non-positive depths — the surface looks like elevation, not depth.');
  }

  return {
    tops: tops.map((v) => Math.round(v * 100) / 100),
    dxFt: Math.round(dxFt * 100) / 100,
    dyFt: Math.round(dyFt * 100) / 100,
    stats: {
      minFt: Math.round(min * 10) / 10,
      maxFt: Math.round(max * 10) / 10,
      meanFt: Math.round((sum / tops.length) * 10) / 10,
      reliefFt: Math.round((max - min) * 10) / 10,
    },
    warnings,
  };
}

/** Downsampled preview rows for the structure heatmap (<= maxDim per
 *  axis): [{i, j, depth}] with i/j in preview coordinates. */
export function topsPreviewCells(tops, nx, ny, maxDim = 40) {
  const px = Math.min(nx, maxDim);
  const py = Math.min(ny, maxDim);
  const cells = [];
  for (let j = 0; j < py; j += 1) {
    for (let i = 0; i < px; i += 1) {
      const si = Math.min(nx - 1, Math.floor(((i + 0.5) / px) * nx));
      const sj = Math.min(ny - 1, Math.floor(((j + 0.5) / py) * ny));
      cells.push({ i, j, depth: tops[sj * nx + si] });
    }
  }
  return { cells, px, py };
}
