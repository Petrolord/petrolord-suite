// Multiquadric RBF with a linear drift: a smooth interpolant that passes
// exactly through every control point and keeps going outside their hull.
// The gridding engine masks to the control hull (rightly — a map should not
// invent structure where nobody drilled), but the seismic cube has to carry
// a reflector across the whole survey, so it uses this instead. Both honour
// every well pick exactly, which is what lets the synthetic tie.

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) throw new Error('RBF system is singular');
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function makeRbf(points, { c = 400 } = {}) {
  const n = points.length;
  const phi = (dx, dy) => Math.sqrt(dx * dx + dy * dy + c * c);
  const size = n + 3;
  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      A[i][j] = phi(points[i].x - points[j].x, points[i].y - points[j].y);
    }
    A[i][n] = 1; A[i][n + 1] = points[i].x; A[i][n + 2] = points[i].y;
    A[n][i] = 1; A[n + 1][i] = points[i].x; A[n + 2][i] = points[i].y;
    b[i] = points[i].z;
  }
  const sol = solve(A, b);
  const w = sol.slice(0, n);
  const [a0, a1, a2] = sol.slice(n);
  return (x, y) => {
    let s = a0 + a1 * x + a2 * y;
    for (let i = 0; i < n; i += 1) s += w[i] * phi(x - points[i].x, y - points[i].y);
    return s;
  };
}
