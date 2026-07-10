// Ordinary kriging with a moving neighbourhood — the geostatistical standard for
// structure/property gridding, replacing plain IDW's bull's-eyes. Interface mirrors
// SurfaceInterpolator (constructor(points), bounds, getNeighbors, predict, generateGrid)
// so the two are drop-in interchangeable in the gridding path.
//
// For each target the k nearest control points form a small ordinary-kriging system
//   [ Γ 1 ][w]   [γ0]
//   [ 1ᵀ 0 ][μ] = [ 1 ]
// solved for weights w; the estimate is Σ wᵢ·zᵢ. With a zero nugget the estimator is
// exact at data locations. A spherical variogram is fitted from the data by default.

const solveLinear = (A, b) => {
    // Gaussian elimination with partial pivoting. Returns null if singular.
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        if (Math.abs(M[piv][col]) < 1e-12) return null;
        [M[col], M[piv]] = [M[piv], M[col]];
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col] / M[col][col];
            for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }
    return M.map((row, i) => row[n] / row[i]);
};

export class KrigingInterpolator {
    constructor(points, options = {}) {
        this.points = (points || []).filter((p) => p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z));
        this.bounds = this._calcBounds();
        this.k = Math.max(4, Math.min(options.k || 16, this.points.length || 4));

        const zs = this.points.map((p) => p.z);
        const n = zs.length || 1;
        this.mean = zs.reduce((a, b) => a + b, 0) / n;
        const variance = zs.reduce((a, b) => a + (b - this.mean) ** 2, 0) / n;
        const diag = Math.hypot(this.bounds.maxX - this.bounds.minX, this.bounds.maxY - this.bounds.minY) || 1;

        // Auto variogram (spherical, zero nugget → exact interpolator). Overridable.
        this.model = options.model || 'spherical';
        this.sill = options.sill != null ? options.sill : (variance > 0 ? variance : 1);
        this.range = options.range != null ? options.range : 0.33 * diag;
        this.nugget = options.nugget != null ? options.nugget : 0;

        this._buildIndex();
    }

    _calcBounds() {
        if (!this.points || this.points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 0 };
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of this.points) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        }
        return { minX, maxX, minY, maxY, minZ, maxZ };
    }

    _buildIndex() {
        const { minX, maxX, minY, maxY } = this.bounds;
        const count = this.points.length;
        this.dim = Math.max(1, Math.ceil(Math.sqrt(count / 6)));
        this.bw = Math.max((maxX - minX) / this.dim, 1e-9);
        this.bh = Math.max((maxY - minY) / this.dim, 1e-9);
        this.buckets = new Map();
        for (const p of this.points) {
            const c = Math.min(this.dim - 1, Math.max(0, Math.floor((p.x - minX) / this.bw)));
            const r = Math.min(this.dim - 1, Math.max(0, Math.floor((p.y - minY) / this.bh)));
            const key = c + ',' + r;
            if (!this.buckets.has(key)) this.buckets.set(key, []);
            this.buckets.get(key).push(p);
        }
    }

    // k nearest control points, found by expanding bucket rings until enough are gathered.
    _kNearest(x, y, k) {
        if (this.points.length <= k) return this.points;
        const { minX, minY } = this.bounds;
        const c0 = Math.min(this.dim - 1, Math.max(0, Math.floor((x - minX) / this.bw)));
        const r0 = Math.min(this.dim - 1, Math.max(0, Math.floor((y - minY) / this.bh)));
        let gathered = [];
        for (let ring = 0; ring < this.dim; ring++) {
            for (let c = c0 - ring; c <= c0 + ring; c++) {
                for (let r = r0 - ring; r <= r0 + ring; r++) {
                    if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== ring) continue; // ring shell only
                    if (c < 0 || r < 0 || c >= this.dim || r >= this.dim) continue;
                    const b = this.buckets.get(c + ',' + r);
                    if (b) gathered = gathered.concat(b);
                }
            }
            // one extra ring past sufficiency guards against a closer point in a diagonal bucket
            if (gathered.length >= k && ring >= 1) break;
        }
        gathered.sort((a, b) => ((x - a.x) ** 2 + (y - a.y) ** 2) - ((x - b.x) ** 2 + (y - b.y) ** 2));
        return gathered.slice(0, k);
    }

    getNeighbors(x, y) { return this._kNearest(x, y, this.k); }

    _gamma(h) {
        if (h <= 0) return 0;
        const s = this.sill - this.nugget;
        if (this.model === 'exponential') return this.nugget + s * (1 - Math.exp(-3 * h / this.range));
        if (this.model === 'gaussian') return this.nugget + s * (1 - Math.exp(-3 * (h * h) / (this.range * this.range)));
        // spherical (default)
        if (h >= this.range) return this.sill;
        const r = h / this.range;
        return this.nugget + s * (1.5 * r - 0.5 * r * r * r);
    }

    predict(x, y) {
        const pts = this._kNearest(x, y, this.k);
        if (pts.length === 0) return this.mean;
        for (const p of pts) if ((x - p.x) ** 2 + (y - p.y) ** 2 < 1e-12) return p.z; // exact hit
        if (pts.length === 1) return pts[0].z;

        const m = pts.length;
        const A = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
        const b = new Array(m + 1).fill(0);
        for (let i = 0; i < m; i++) {
            for (let j = 0; j < m; j++) {
                A[i][j] = this._gamma(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
            }
            A[i][m] = 1; A[m][i] = 1;
            b[i] = this._gamma(Math.hypot(x - pts[i].x, y - pts[i].y));
        }
        A[m][m] = 0; b[m] = 1;

        const w = solveLinear(A, b);
        if (!w) {
            // Singular system → inverse-distance fallback so a value is always produced.
            let num = 0, den = 0;
            for (const p of pts) { const d = Math.hypot(x - p.x, y - p.y) || 1e-6; const wt = 1 / (d * d); num += wt * p.z; den += wt; }
            return den ? num / den : this.mean;
        }
        let z = 0;
        for (let i = 0; i < m; i++) z += w[i] * pts[i].z;
        return isFinite(z) ? z : this.mean;
    }

    generateGrid(nx = 60, ny) {
        const { minX, maxX, minY, maxY } = this.bounds;
        const width = Math.max(maxX - minX, 1);
        const height = Math.max(maxY - minY, 1);
        if (!ny) { const aspect = width / height; ny = Math.round(nx / aspect) || 50; }
        const dx = width / (nx - 1 || 1);
        const dy = height / (ny - 1 || 1);
        const gridX = [], gridY = [], gridZ = [];
        for (let i = 0; i < nx; i++) gridX.push(minX + i * dx);
        for (let j = 0; j < ny; j++) gridY.push(minY + j * dy);
        for (let j = 0; j < ny; j++) {
            const row = [];
            for (let i = 0; i < nx; i++) row.push(this.predict(gridX[i], gridY[j]));
            gridZ.push(row);
        }
        return { x: gridX, y: gridY, z: gridZ, cellWidth: dx, cellHeight: dy };
    }
}
