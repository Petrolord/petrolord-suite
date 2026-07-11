"""Minimum-curvature reference implementation (development-time oracle).

This module is validated two independent ways before anything consumes
it (both asserted by gen_wells.py at generation time):

- the published worked example from drillingformulas.com
  ("Minimum Curvature Method"): survey (3500 ft, 15 deg, 20 deg) ->
  (3600 ft, 25 deg, 45 deg) gives dN 27.22 ft, dE 19.45 ft,
  dTVD 94.01 ft;
- analytic circular-arc truth: for a planar arc (constant-azimuth
  build/drop, or a horizontal turn at 90 deg inclination) the
  minimum-curvature method reproduces the arc EXACTLY by construction,
  so station positions must match the closed form to ~machine
  precision, at any station spacing.

Segments where inclination and azimuth change together have no simple
closed form; there the minimum-curvature path IS the industry-standard
definition of the trajectory between stations, and the JS engine is
held to this reference (independent implementation) to < 1 cm.

Conventions: inc/azi in degrees, azimuth clockwise from grid north
(north = +Y, east = +X), TVD positive down. Unit-agnostic in MD.
"""
import math


def tangent(inc_deg: float, azi_deg: float) -> tuple:
    """Unit tangent (east, north, down) of a station attitude."""
    i = math.radians(inc_deg)
    a = math.radians(azi_deg)
    return (math.sin(i) * math.sin(a),
            math.sin(i) * math.cos(a),
            math.cos(i))


def dogleg_rad(inc1: float, azi1: float, inc2: float, azi2: float) -> float:
    """Total angle change (radians) between two station attitudes."""
    i1 = math.radians(inc1)
    i2 = math.radians(inc2)
    da = math.radians(azi2 - azi1)
    c = (math.cos(i2 - i1)
         - math.sin(i1) * math.sin(i2) * (1.0 - math.cos(da)))
    return math.acos(max(-1.0, min(1.0, c)))


def ratio_factor(beta: float) -> float:
    """RF = (2/beta) tan(beta/2); the beta -> 0 limit is exactly 1."""
    if beta < 1e-9:
        return 1.0
    return (2.0 / beta) * math.tan(beta / 2.0)


def positions(stations):
    """Cumulative (md, east, north, tvd) from (0, 0, 0) at the first
    station. stations: iterable of (md, inc_deg, azi_deg), md ascending.
    """
    sts = list(stations)
    out = [(sts[0][0], 0.0, 0.0, 0.0)]
    e = n = v = 0.0
    for (md1, i1, a1), (md2, i2, a2) in zip(sts, sts[1:]):
        if not md2 > md1:
            raise ValueError(f'measured depth must increase: {md1} -> {md2}')
        dmd = md2 - md1
        b = dogleg_rad(i1, a1, i2, a2)
        rf = ratio_factor(b)
        t1 = tangent(i1, a1)
        t2 = tangent(i2, a2)
        e += dmd / 2.0 * (t1[0] + t2[0]) * rf
        n += dmd / 2.0 * (t1[1] + t2[1]) * rf
        v += dmd / 2.0 * (t1[2] + t2[2]) * rf
        out.append((md2, e, n, v))
    return out


def arc_point(p1, t1, t2, dmd, beta, f):
    """Point at fraction f in [0, 1] of the minimum-curvature circular
    arc from p1 (tangent t1) to the station dmd ahead (tangent t2,
    dogleg beta). Zero dogleg degenerates to the straight segment.
    f = 1 reproduces the ratio-factor displacement identically.
    """
    if beta < 1e-9:
        return tuple(p + f * dmd * t for p, t in zip(p1, t1))
    r = dmd / beta
    sb = math.sin(beta)
    cb = math.cos(beta)
    nvec = tuple((b - a * cb) / sb for a, b in zip(t1, t2))
    fb = f * beta
    return tuple(p + r * (math.sin(fb) * a + (1.0 - math.cos(fb)) * nn)
                 for p, a, nn in zip(p1, t1, nvec))


# ---------------------------------------------------------------------------
# Self-checks (called by gen_wells.py before goldens are written)
# ---------------------------------------------------------------------------

PUBLISHED_EXAMPLE = {
    'source': 'drillingformulas.com "Minimum Curvature Method" worked example',
    'stations': [
        {'md': 3500.0, 'inc': 15.0, 'azi': 20.0},
        {'md': 3600.0, 'inc': 25.0, 'azi': 45.0},
    ],
    'units': 'ft',
    'expected': {'d_north': 27.22, 'd_east': 19.45, 'd_tvd': 94.01},
    'tolerance': 0.005,
}


def check_published_example():
    ex = PUBLISHED_EXAMPLE
    sts = [(s['md'], s['inc'], s['azi']) for s in ex['stations']]
    _, e, n, v = positions(sts)[-1]
    tol = ex['tolerance']
    exp = ex['expected']
    assert abs(n - exp['d_north']) < tol, (n, exp['d_north'])
    assert abs(e - exp['d_east']) < tol, (e, exp['d_east'])
    assert abs(v - exp['d_tvd']) < tol, (v, exp['d_tvd'])


def check_planar_arc():
    """Constant-azimuth build 0 -> 30 deg over 300 m at azi 90:
    the analytic arc gives dv = R sin(th), dh = R (1 - cos(th)),
    R = 300 / (30 deg). Assert every intermediate station too, on an
    UNEVEN spacing, to ~1e-9 m.
    """
    theta = math.radians(30.0)
    r = 300.0 / theta
    mds = [0.0, 40.0, 90.0, 175.0, 300.0]     # deliberately uneven
    sts = [(md, math.degrees(md / 300.0 * theta), 90.0) for md in mds]
    for (md, e, _n, v) in positions(sts):
        th = md / 300.0 * theta
        assert abs(v - r * math.sin(th)) < 1e-9, (md, v)
        assert abs(e - r * (1.0 - math.cos(th))) < 1e-9, (md, e)


def check_horizontal_turn():
    """At 90 deg inclination a pure azimuth turn is a horizontal-plane
    arc: turning 90 deg over 900 m from azi 0, dE = R sin(phi),
    dN = R (1 - cos(phi))... with azi from north: start heading north
    (t = (0,1,0)), end heading east. dN = R sin(phi), dE = R (1-cos(phi)).
    """
    phi = math.radians(90.0)
    r = 900.0 / phi
    mds = [0.0, 150.0, 400.0, 900.0]
    sts = [(md, 90.0, math.degrees(md / 900.0 * phi)) for md in mds]
    for (md, e, n, v) in positions(sts):
        ph = md / 900.0 * phi
        assert abs(n - r * math.sin(ph)) < 1e-9, (md, n)
        assert abs(e - r * (1.0 - math.cos(ph))) < 1e-9, (md, e)
        assert abs(v) < 1e-9, (md, v)


def check_arc_point_consistency():
    """arc_point at f = 1 must reproduce the ratio-factor displacement."""
    t1 = tangent(12.0, 40.0)
    t2 = tangent(31.0, 78.0)
    b = dogleg_rad(12.0, 40.0, 31.0, 78.0)
    rf = ratio_factor(b)
    end = arc_point((0.0, 0.0, 0.0), t1, t2, 120.0, b, 1.0)
    exp = tuple(120.0 / 2.0 * (a + c) * rf for a, c in zip(t1, t2))
    for got, want in zip(end, exp):
        assert abs(got - want) < 1e-9, (end, exp)


def self_check():
    check_published_example()
    check_planar_arc()
    check_horizontal_turn()
    check_arc_point_consistency()


if __name__ == '__main__':
    self_check()
    print('mincurve self-checks passed')
