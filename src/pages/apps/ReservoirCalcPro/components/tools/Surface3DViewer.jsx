import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Mountain } from 'lucide-react';

// ---------------------------------------------------------------------------
// Dependency-free 3D reservoir surface viewer.
//
// Renders a gridded surface (structure or a property map) as a lit, hypsometric-
// coloured mesh with a real perspective camera you can orbit and zoom, plus
// translucent fluid-contact planes (OWC / GOC / GWC) that cut the structure — so
// the contact-based volumetrics are actually visible. No WebGL / three.js: a 2D
// canvas + painter's algorithm, which keeps the bundle small and avoids adding a
// heavy dependency, while still giving genuine 3D (perspective, shading, depth).
// ---------------------------------------------------------------------------

// Small anchor-based colour maps → fn(t∈[0,1]) → [r,g,b].
const CMAPS = {
    viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
    turbo: [[48, 18, 59], [50, 130, 240], [40, 225, 130], [250, 220, 60], [200, 40, 30]],
    terrain: [[46, 90, 120], [60, 130, 90], [180, 190, 110], [150, 100, 60], [242, 242, 247]],
    hot: [[20, 0, 0], [180, 0, 0], [255, 140, 0], [255, 240, 120], [255, 255, 255]],
    blues: [[247, 251, 255], [158, 202, 225], [66, 146, 198], [8, 81, 156], [8, 48, 107]],
};
const CMAP_ALIAS = { Earth: 'terrain', Jet: 'turbo', Portland: 'turbo', Hot: 'hot', YlGnBu: 'blues', Blues: 'blues', Viridis: 'viridis' };

function makeColormap(name) {
    const key = CMAP_ALIAS[name] || (CMAPS[String(name).toLowerCase()] ? String(name).toLowerCase() : 'viridis');
    const a = CMAPS[key] || CMAPS.viridis;
    return (t) => {
        t = t <= 0 ? 0 : t >= 1 ? 1 : t;
        const s = t * (a.length - 1);
        const i = Math.min(a.length - 2, Math.floor(s));
        const f = s - i, c0 = a[i], c1 = a[i + 1];
        return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    };
}
const cmapCss = (name, stops = 6) => {
    const cm = makeColormap(name);
    return Array.from({ length: stops }, (_, k) => {
        const [r, g, b] = cm(k / (stops - 1));
        return `rgb(${r | 0},${g | 0},${b | 0}) ${(k / (stops - 1) * 100).toFixed(0)}%`;
    }).join(',');
};

// vector helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const numOrNull = (v) => (v === null || v === undefined || v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v));

const Surface3DViewer = ({
    gridData,
    unitSystem = 'field',
    colorscale = 'Earth',
    valueUnit,
    isSurface = true,
    zConvention = 'elevation',
    contacts = null,
    title,
}) => {
    const canvasRef = useRef(null);
    const cameraRef = useRef({ az: -0.6, el: 0.5, dist: 3.2 });
    const veRef = useRef(1);
    const redrawRef = useRef(() => {});
    const depthUnit = unitSystem === 'field' ? 'ft' : 'm';

    // Precompute normalised model geometry (unit cube-ish, centred at origin).
    const geom = useMemo(() => {
        if (!gridData || !gridData.z || !gridData.x || !gridData.y) return null;
        const X = gridData.x, Y = gridData.y, Z = gridData.z;
        const nx = X.length, ny = Y.length;
        if (nx < 2 || ny < 2) return null;
        const xmin = Math.min(...X), xmax = Math.max(...X), ymin = Math.min(...Y), ymax = Math.max(...Y);
        let zmin = Infinity, zmax = -Infinity;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const v = Z[j] ? Z[j][i] : null;
            if (v != null && !isNaN(v)) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; }
        }
        if (!isFinite(zmin)) return null;
        const xc = (xmin + xmax) / 2, yc = (ymin + ymax) / 2, zc = (zmin + zmax) / 2;
        const H = Math.max(xmax - xmin, ymax - ymin, 1e-9) / 2;
        const sign = zConvention === 'depth' ? -1 : 1; // map shallower → up
        const pts = new Array(ny);
        let minZUp = Infinity;
        for (let j = 0; j < ny; j++) {
            pts[j] = new Array(nx);
            for (let i = 0; i < nx; i++) {
                const v = Z[j] ? Z[j][i] : null;
                if (v == null || isNaN(v)) { pts[j][i] = { valid: false }; continue; }
                const zUp = sign * (v - zc) / H;
                if (zUp < minZUp) minZUp = zUp;
                pts[j][i] = { valid: true, mx: (X[i] - xc) / H, my: (Y[j] - yc) / H, zUp, val: v };
            }
        }
        return { pts, nx, ny, zmin, zmax, zc, H, sign, xmin, xmax, ymin, ymax, xc, yc, minZUp };
    }, [gridData, zConvention]);

    // Auto vertical exaggeration so subtle structural relief is visible.
    const defaultVE = useMemo(() => {
        if (!geom) return 1;
        const rel = (geom.zmax - geom.zmin) / (2 * geom.H);
        if (!(rel > 0)) return 1;
        return Math.max(0.2, Math.min(40, 0.32 / rel));
    }, [geom]);
    const [ve, setVe] = useState(defaultVE);
    useEffect(() => { veRef.current = defaultVE; setVe(defaultVE); }, [defaultVE]);
    useEffect(() => { veRef.current = ve; redrawRef.current(); }, [ve]);

    const contactsKey = contacts ? `${contacts.fluidType}|${contacts.owc}|${contacts.goc}` : '';

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !geom) return;
        const ctx = canvas.getContext('2d');
        const cam = cameraRef.current;
        const cmap = makeColormap(colorscale);
        const light = norm([-0.4, -0.55, 0.9]);
        let W = 0, Hh = 0, raf = 0;

        const resize = () => {
            const r = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, r.width * dpr);
            canvas.height = Math.max(1, r.height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            W = r.width; Hh = r.height;
        };

        const draw = () => {
            const { az, el, dist } = cam;
            const cE = Math.cos(el), sE = Math.sin(el), cA = Math.cos(az), sA = Math.sin(az);
            const camDir = [cE * sA, cE * cA, sE];
            const C = [camDir[0] * dist, camDir[1] * dist, camDir[2] * dist];
            const fwd = [-camDir[0], -camDir[1], -camDir[2]];
            const right = norm(cross(fwd, [0, 0, 1]));
            const up = cross(right, fwd);
            const focal = 2.1, scale = 0.44 * Math.min(W, Hh), cx = W / 2, cy = Hh / 2;
            const v = veRef.current;

            const project = (mx, my, mz) => {
                const rx = mx - C[0], ry = my - C[1], rz = mz - C[2];
                const vz = rx * fwd[0] + ry * fwd[1] + rz * fwd[2];
                if (vz < 0.05) return null;
                const vx = rx * right[0] + ry * right[1] + rz * right[2];
                const vy = rx * up[0] + ry * up[1] + rz * up[2];
                return { x: cx + focal * scale * vx / vz, y: cy - focal * scale * vy / vz, vz };
            };

            // background
            const bg = ctx.createLinearGradient(0, 0, 0, Hh);
            bg.addColorStop(0, '#0b1120'); bg.addColorStop(1, '#020617');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, Hh);

            const { pts, nx, ny } = geom;
            // project all vertices once
            const P = new Array(ny);
            for (let j = 0; j < ny; j++) {
                P[j] = new Array(nx);
                for (let i = 0; i < nx; i++) {
                    const p = pts[j][i];
                    P[j][i] = p.valid ? project(p.mx, p.my, p.zUp * v) : null;
                }
            }

            // faint floor grid for depth perception
            const floorZ = (geom.minZUp * v) - 0.12;
            const mx0 = (geom.xmin - geom.xc) / geom.H, mx1 = (geom.xmax - geom.xc) / geom.H;
            const my0 = (geom.ymin - geom.yc) / geom.H, my1 = (geom.ymax - geom.yc) / geom.H;
            ctx.strokeStyle = 'rgba(71,85,105,0.28)'; ctx.lineWidth = 1;
            const GL = 8;
            for (let k = 0; k <= GL; k++) {
                const gx = mx0 + (mx1 - mx0) * k / GL, gy = my0 + (my1 - my0) * k / GL;
                const a1 = project(gx, my0, floorZ), a2 = project(gx, my1, floorZ);
                const b1 = project(mx0, gy, floorZ), b2 = project(mx1, gy, floorZ);
                if (a1 && a2) { ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke(); }
                if (b1 && b2) { ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); }
            }

            const zr = (geom.zmax - geom.zmin) || 1;
            const quads = [];

            // surface mesh
            for (let j = 0; j < ny - 1; j++) {
                for (let i = 0; i < nx - 1; i++) {
                    const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
                    if (!(a.valid && b.valid && c.valid && d.valid)) continue;
                    const pa = P[j][i], pb = P[j][i + 1], pc = P[j + 1][i + 1], pd = P[j + 1][i];
                    if (!(pa && pb && pc && pd)) continue;
                    const A = [a.mx, a.my, a.zUp * v], B = [b.mx, b.my, b.zUp * v], D = [d.mx, d.my, d.zUp * v];
                    const n = norm(cross(sub(B, A), sub(D, A)));
                    const sh = Math.min(1, 0.35 + 0.65 * Math.max(0, Math.abs(dot(n, light))));
                    const t = (((a.val + b.val + c.val + d.val) / 4) - geom.zmin) / zr;
                    const col = cmap(t);
                    const fill = `rgb(${(col[0] * sh) | 0},${(col[1] * sh) | 0},${(col[2] * sh) | 0})`;
                    quads.push({ pts: [pa, pb, pc, pd], fill, stroke: fill, vz: (pa.vz + pb.vz + pc.vz + pd.vz) / 4 });
                }
            }

            // fluid-contact planes
            if (contacts) {
                const addPlane = (cz, fill, stroke, label) => {
                    if (cz == null) return;
                    const mz = geom.sign * (cz - geom.zc) / geom.H * v;
                    if (Math.abs(mz) > 6) return; // way off scene
                    const cs = [project(mx0, my0, mz), project(mx1, my0, mz), project(mx1, my1, mz), project(mx0, my1, mz)];
                    if (cs.some((p) => !p)) return;
                    quads.push({ pts: cs, fill, stroke, vz: cs.reduce((s, p) => s + p.vz, 0) / 4, label, labelPt: cs[1] });
                };
                const ft = contacts.fluidType;
                if (ft === 'oil_gas') addPlane(numOrNull(contacts.goc), 'rgba(245,158,11,0.20)', 'rgba(251,191,36,0.7)', `GOC ${numOrNull(contacts.goc) ?? ''}`);
                if (ft === 'oil' || ft === 'oil_gas') addPlane(numOrNull(contacts.owc), 'rgba(37,99,235,0.22)', 'rgba(96,165,250,0.7)', `OWC ${numOrNull(contacts.owc) ?? ''}`);
                if (ft === 'gas') addPlane(numOrNull(contacts.goc) ?? numOrNull(contacts.owc), 'rgba(37,99,235,0.22)', 'rgba(96,165,250,0.7)', 'GWC');
            }

            // painter's algorithm: far → near
            quads.sort((q1, q2) => q2.vz - q1.vz);
            const labels = [];
            for (const q of quads) {
                ctx.beginPath();
                ctx.moveTo(q.pts[0].x, q.pts[0].y);
                for (let k = 1; k < q.pts.length; k++) ctx.lineTo(q.pts[k].x, q.pts[k].y);
                ctx.closePath();
                ctx.fillStyle = q.fill; ctx.fill();
                ctx.strokeStyle = q.stroke; ctx.lineWidth = q.label ? 1.25 : 1; ctx.stroke();
                if (q.label) labels.push(q);
            }
            // contact labels on top
            ctx.font = '600 11px ui-sans-serif, system-ui';
            for (const q of labels) {
                ctx.fillStyle = 'rgba(2,6,23,0.75)';
                const tw = ctx.measureText(q.label).width + 8;
                ctx.fillRect(q.labelPt.x + 4, q.labelPt.y - 8, tw, 15);
                ctx.fillStyle = '#e2e8f0';
                ctx.fillText(q.label, q.labelPt.x + 8, q.labelPt.y + 3);
            }
        };

        const requestDraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
        redrawRef.current = requestDraw;

        // interaction
        let dragging = false, lx = 0, ly = 0;
        const onDown = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
        const onMove = (e) => {
            if (!dragging) return;
            cam.az -= (e.clientX - lx) * 0.008;
            cam.el = Math.max(0.08, Math.min(1.48, cam.el + (e.clientY - ly) * 0.008));
            lx = e.clientX; ly = e.clientY;
            requestDraw();
        };
        const onUp = (e) => { dragging = false; canvas.releasePointerCapture?.(e.pointerId); };
        const onWheel = (e) => {
            e.preventDefault();
            cam.dist = Math.max(1.9, Math.min(7, cam.dist * (1 + Math.sign(e.deltaY) * 0.08)));
            requestDraw();
        };
        const onDbl = () => { cam.az = -0.6; cam.el = 0.5; cam.dist = 3.2; requestDraw(); };

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('dblclick', onDbl);

        resize();
        draw();
        const ro = new ResizeObserver(() => { resize(); requestDraw(); });
        ro.observe(canvas);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('dblclick', onDbl);
            redrawRef.current = () => {};
        };
    }, [geom, colorscale, contactsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!geom) {
        return <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">No surface data to render in 3D.</div>;
    }

    const unitLabel = valueUnit || depthUnit;
    return (
        <div className="w-full h-full relative bg-slate-950 overflow-hidden select-none">
            <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing touch-none" />

            {/* Title */}
            {title && (
                <div className="absolute top-3 left-3 z-10 pointer-events-none bg-slate-950/60 backdrop-blur px-2 py-0.5 rounded text-[10px] text-emerald-400 font-semibold border border-slate-800">
                    {title}
                </div>
            )}

            {/* Colour legend */}
            <div className="absolute top-3 right-3 z-10 bg-slate-950/60 backdrop-blur rounded border border-slate-800 p-2 w-28 pointer-events-none">
                <div className="text-[9px] text-slate-400 mb-1 uppercase tracking-wide">{isSurface ? 'Depth' : 'Value'} ({unitLabel})</div>
                <div className="h-2 rounded" style={{ background: `linear-gradient(to right, ${cmapCss(colorscale)})` }} />
                <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 font-mono">
                    <span>{Math.round(geom.zmin)}</span>
                    <span>{Math.round(geom.zmax)}</span>
                </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-slate-950/60 backdrop-blur rounded border border-slate-800 px-2 py-1">
                <Mountain className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[9px] text-slate-400">V.E.</span>
                <input
                    type="range" min="0.2" max="40" step="0.1" value={ve}
                    onChange={(e) => setVe(parseFloat(e.target.value))}
                    className="w-24 accent-emerald-500 cursor-pointer"
                />
                <span className="text-[9px] font-mono text-slate-300 w-8">{ve.toFixed(1)}×</span>
                <button
                    onClick={() => { cameraRef.current = { az: -0.6, el: 0.5, dist: 3.2 }; setVe(defaultVE); redrawRef.current(); }}
                    className="text-slate-400 hover:text-white" title="Reset view"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="absolute bottom-3 right-3 z-10 pointer-events-none text-[9px] text-slate-500 bg-slate-950/50 px-2 py-0.5 rounded">
                drag to rotate • scroll to zoom • double-click to reset
            </div>
        </div>
    );
};

export default React.memo(Surface3DViewer);
