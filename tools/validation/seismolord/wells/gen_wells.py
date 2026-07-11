"""Generate the wells goldens (Phase W0 of Seismolord-WELLS-PLAN.md).

Three synthetic wells through the dome_ieee survey area — vertical,
S-shape (planar build/hold/drop), and a horizontal landing whose build
includes a genuine 3D build-and-turn segment — plus per-well checkshot
tables and the "Dome" top where each path crosses the analytic dome
surface under the declared truth velocity V(z) = V0 + k z.

The truth chain: mincurve.self_check() (published worked example +
analytic planar arcs) validates the reference; the goldens are then
reference output, and the JS engine/wellPath.js is held to them.

Depth conventions (match engine/velocityModel.js and the wells plan):
- TVD positive down below KB; TVDss = TVD - KB (positive down below
  the datum, which is also the seismic datum).
- depth(twt_ms) = (v0/k) expm1(k twt_ms / 2000); the inverse used for
  checkshots is twt_ms = 2000 ln(1 + k z / v0) / k.

Run: .venv/bin/python wells/gen_wells.py  (from tools/validation/seismolord)
Outputs: test-data/seismolord/wells/wells.json (committed).
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mincurve  # noqa: E402  (wells/)
from model import DOME_IEEE, T_CREST_MS, T_RELIEF_MS  # noqa: E402

OUT = Path(__file__).resolve().parents[4] / 'test-data' / 'seismolord' / 'wells'

# Truth velocity for checkshots / dome depth (a plausible shallow model
# for the deliberately shallow dome fixture: crest 100 ms TWT ~ 91 m).
V0 = 1800.0     # m/s at datum
K = 0.5         # 1/s

SPEC = DOME_IEEE
DOME_XC = SPEC.x0 + (SPEC.n_xl - 1) * SPEC.bin_m / 2.0
DOME_YC = SPEC.y0 + (SPEC.n_il - 1) * SPEC.bin_m / 2.0
DOME_RMAX2 = (SPEC.x0 - DOME_XC) ** 2 + (SPEC.y0 - DOME_YC) ** 2


def dome_twt_ms(x: float, y: float) -> float:
    r2 = (x - DOME_XC) ** 2 + (y - DOME_YC) ** 2
    return T_CREST_MS + T_RELIEF_MS * (r2 / DOME_RMAX2)


def depth_m(twt_ms: float) -> float:
    return (V0 / K) * math.expm1(K * twt_ms / 2000.0)


def twt_ms_of_depth(z_m: float) -> float:
    return 2000.0 * math.log1p(K * z_m / V0) / K


# ---------------------------------------------------------------------------
# Well definitions (stations: md m, inc deg, azi deg)
# ---------------------------------------------------------------------------

def s_shape_stations():
    """Vertical to 50, build 3 deg/30m to 30 deg at 350 (azi 90), hold
    to 600, drop 3 deg/30m back to vertical at 900, vertical to 1200."""
    sts = [(0.0, 0.0, 90.0), (50.0, 0.0, 90.0)]
    md = 50.0
    while md < 350.0:
        md += 30.0
        sts.append((md, (md - 50.0) / 10.0, 90.0))          # 3 deg / 30 m
    for md in (380.0, 500.0, 600.0):
        sts.append((md, 30.0, 90.0))
    md = 600.0
    while md < 900.0:
        md += 30.0
        sts.append((md, 30.0 - (md - 600.0) / 10.0, 90.0))
    for md in (1000.0, 1100.0, 1200.0):
        sts.append((md, 0.0, 90.0))
    return sts


def s_shape_analytic(md: float):
    """Closed-form (east, tvd) truth for the S-shape at any md (the well
    is planar at azimuth 90, so north = 0). Build/drop radius
    R = 300 / 30 deg."""
    r = 300.0 / math.radians(30.0)
    th30 = math.radians(30.0)
    if md <= 50.0:
        return 0.0, md
    e, v = 0.0, 50.0
    if md <= 350.0:
        th = math.radians((md - 50.0) / 10.0)
        return e + r * (1.0 - math.cos(th)), v + r * math.sin(th)
    e += r * (1.0 - math.cos(th30))
    v += r * math.sin(th30)
    if md <= 600.0:
        return e + (md - 350.0) * math.sin(th30), v + (md - 350.0) * math.cos(th30)
    e += 250.0 * math.sin(th30)
    v += 250.0 * math.cos(th30)
    if md <= 900.0:
        th = math.radians(30.0 - (md - 600.0) / 10.0)
        # drop arc: mirror of the build — displacement from segment start
        return (e + r * (math.cos(th) - math.cos(th30)),
                v + r * (math.sin(th30) - math.sin(th)))
    e += r * (1.0 - math.cos(th30))
    v += r * math.sin(th30)
    return e, v + (md - 900.0)


def horizontal_stations():
    """Build 2.5 deg/30m from KOP 60 to horizontal at 1140; azimuth 30
    until inc 40 (md 540), then a genuine 3D build-and-turn to azi 52.5
    at inc 70 (md 900), then constant azi to landing; 3860 m lateral to
    TD 5000 (a > 5 km path for the accuracy acceptance)."""
    sts = [(0.0, 0.0, 30.0), (60.0, 0.0, 30.0)]
    md = 60.0
    while md < 1140.0:
        md += 30.0
        inc = (md - 60.0) / 12.0                             # 2.5 deg / 30 m
        if md <= 540.0:
            azi = 30.0
        elif md <= 900.0:
            azi = 30.0 + (md - 540.0) / 16.0                 # 1.875 deg / 30 m
        else:
            azi = 52.5
        sts.append((md, inc, azi))
    md = 1140.0
    while md < 5000.0:
        md = min(md + 100.0, 5000.0)
        sts.append((md, 90.0, 52.5))
    return sts


WELLS = [
    {
        'name': 'KETA-V1', 'kind': 'vertical', 'kb_m': 25.0,
        'surface': {'x': DOME_XC, 'y': DOME_YC},             # dome crest
        'stations': [(0.0, 0.0, 0.0), (100.0, 0.0, 0.0),
                     (200.0, 0.0, 0.0), (400.0, 0.0, 0.0)],
    },
    {
        'name': 'KETA-S1', 'kind': 's_shape', 'kb_m': 30.0,
        'surface': {'x': 500200.0, 'y': 6700300.0},
        'stations': s_shape_stations(),
    },
    {
        'name': 'KETA-H1', 'kind': 'horizontal', 'kb_m': 28.0,
        'surface': {'x': 500100.0, 'y': 6700150.0},
        'stations': horizontal_stations(),
    },
]


# ---------------------------------------------------------------------------
# Path building + derived truths
# ---------------------------------------------------------------------------

def fine_path(stations, pos, kb, step=10.0):
    """Positions every `step` m of MD via exact arc interpolation."""
    out = []
    for idx in range(len(stations) - 1):
        md1, i1, a1 = stations[idx]
        md2, i2, a2 = stations[idx + 1]
        t1 = mincurve.tangent(i1, a1)
        t2 = mincurve.tangent(i2, a2)
        beta = mincurve.dogleg_rad(i1, a1, i2, a2)
        p1 = (pos[idx][1], pos[idx][2], pos[idx][3])
        md = md1
        while md < md2 - 1e-9:
            f = (md - md1) / (md2 - md1)
            e, n, v = mincurve.arc_point(p1, t1, t2, md2 - md1, beta, f)
            out.append((md, e, n, v))
            md += step
    last = pos[-1]
    out.append((last[0], last[1], last[2], last[3]))
    return out


def find_dome_top(stations, pos, surface, kb):
    """MD where the path's tvdss crosses the dome surface depth —
    bisection on the exact arc within the bracketing 1 m sampling."""
    def miss(md_e_n_v):
        md, e, n, v = md_e_n_v
        z_dome = depth_m(dome_twt_ms(surface['x'] + e, surface['y'] + n))
        return (v - kb) - z_dome

    dense = fine_path(stations, pos, kb, step=1.0)
    prev = dense[0]
    for cur in dense[1:]:
        if miss(prev) < 0.0 <= miss(cur):
            lo, hi = prev[0], cur[0]
            break
        prev = cur
    else:
        raise RuntimeError('well never crosses the dome surface')

    # bisection via exact interpolation over the bracketed interval
    def point_at(md):
        for idx in range(len(stations) - 1):
            md1, i1, a1 = stations[idx]
            md2, i2, a2 = stations[idx + 1]
            if md1 <= md <= md2:
                t1 = mincurve.tangent(i1, a1)
                t2 = mincurve.tangent(i2, a2)
                beta = mincurve.dogleg_rad(i1, a1, i2, a2)
                p1 = (pos[idx][1], pos[idx][2], pos[idx][3])
                f = (md - md1) / (md2 - md1)
                e, n, v = mincurve.arc_point(p1, t1, t2, md2 - md1, beta, f)
                return (md, e, n, v)
        raise ValueError(md)

    for _ in range(60):
        mid = (lo + hi) / 2.0
        if miss(point_at(mid)) < 0.0:
            lo = mid
        else:
            hi = mid
    md, e, n, v = point_at((lo + hi) / 2.0)
    return {
        'name': 'Dome',
        'md_m': md,
        'tvdss_m': v - kb,
        'x': surface['x'] + e,
        'y': surface['y'] + n,
    }


def checkshots(max_tvdss, step=25.0):
    out = []
    z = 0.0
    while z <= max_tvdss + step:
        out.append({'tvdss_m': z, 'twt_ms': twt_ms_of_depth(z)})
        z += step
    return out


def build_well(w):
    pos = mincurve.positions(w['stations'])
    kb = w['kb_m']
    sx, sy = w['surface']['x'], w['surface']['y']
    path = [{'md': md, 'x': sx + e, 'y': sy + n, 'tvd': v, 'tvdss': v - kb}
            for md, e, n, v in pos]
    fine = [{'md': md, 'x': sx + e, 'y': sy + n, 'tvdss': v - kb}
            for md, e, n, v in fine_path(w['stations'], pos, kb)]
    max_tvdss = max(p['tvdss'] for p in path)
    return {
        'name': w['name'],
        'kind': w['kind'],
        'kb_m': kb,
        'surface': w['surface'],
        'td_md_m': w['stations'][-1][0],
        'stations': [{'md': md, 'inc': inc, 'azi': azi}
                     for md, inc, azi in w['stations']],
        'path': path,
        'fine_path': fine,
        'checkshots': checkshots(max_tvdss),
        'tops': [find_dome_top(w['stations'], pos, w['surface'], kb)],
    }


def cross_checks():
    mincurve.self_check()

    # S-shape stations must sit on the closed-form arc/tangent path
    w = next(x for x in WELLS if x['kind'] == 's_shape')
    for md, e, n, v in mincurve.positions(w['stations']):
        ea, va = s_shape_analytic(md)
        assert abs(e - ea) < 1e-9, (md, e, ea)
        assert abs(v - va) < 1e-9, (md, v, va)
        assert abs(n) < 1e-9, (md, n)

    # vertical well: exactly straight down
    wv = next(x for x in WELLS if x['kind'] == 'vertical')
    for md, e, n, v in mincurve.positions(wv['stations']):
        assert e == 0.0 and n == 0.0 and v == md

    # checkshot round trip through the declared V(z)
    for z in (0.0, 91.0, 400.0, 1300.0):
        assert abs(depth_m(twt_ms_of_depth(z)) - z) < 1e-9


def main():
    cross_checks()
    golden = {
        'description': 'Seismolord wells goldens (Phase W0) — see '
                       'tools/validation/seismolord/wells/',
        'datum': 'TVDss positive down below datum (= seismic datum); '
                 'TVD positive down below KB; tvdss = tvd - kb_m',
        'velocity': {'v0': V0, 'k': K,
                     'convention': 'depth_m = (v0/k)*expm1(k*twt_ms/2000)'},
        'dome': {'spec': SPEC.name, 't_crest_ms': T_CREST_MS,
                 't_relief_ms': T_RELIEF_MS, 'xc': DOME_XC, 'yc': DOME_YC,
                 'rmax2': DOME_RMAX2},
        'published_example': mincurve.PUBLISHED_EXAMPLE,
        'wells': [build_well(w) for w in WELLS],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    out_file = OUT / 'wells.json'
    out_file.write_text(json.dumps(golden, indent=1) + '\n')
    for w in golden['wells']:
        top = w['tops'][0]
        print(f"{w['name']}: {len(w['stations'])} stations, "
              f"TD {w['td_md_m']:.0f} m, Dome top at MD {top['md_m']:.2f} m "
              f"/ TVDss {top['tvdss_m']:.2f} m")
    print(f'wrote {out_file}')


if __name__ == '__main__':
    main()
