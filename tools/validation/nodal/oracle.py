"""Independent oracle for the Nodal Analysis Studio engines (NA1).

Python stdlib only (repo convention, see tools/validation/welltest and
tools/validation/fluidstudio). Every quantity is computed by a route as
independent of the JavaScript implementation as the mathematics allows:

- Colebrook friction factor by bisection on x = 1/sqrt(f) (the JS engine
  uses fixed-point iteration from a Swamee-Jain seed).
- Black-oil correlations (Standing Rs/Bo/Pb, Beggs-Robinson viscosity,
  Papay Z with Sutton pseudo-criticals, Lee-Gonzalez-Eakin gas viscosity,
  Vasquez-Beggs co and undersaturated viscosity) re-derived from their
  published forms; identical formulas, independent code.
- Water phase (McCain Bw / viscosity / brine density), Baker-Swerdloff and
  Hough surface tensions.
- Oil IPR family (Vogel, composite Standing, Fetkovich, Jones) from the
  closed-form equations, including calibration algebra.
- Minimum-curvature trajectory from the standard ratio-factor formulation.
- Gas deliverability on real-gas pseudo-pressure with m(p) evaluated by
  composite Simpson quadrature of 2p/(mu z) (the JS engine integrates a
  trapezoid over a 60-point table, so agreement at ~1% validates both the
  transform and the table resolution).

Run genfixtures.py (same directory) to regenerate the committed goldens at
src/utils/nodal/__tests__/goldens.json.
"""

from __future__ import annotations

import math


# ---------------------------------------------------------------------------
# friction

def colebrook(re: float, rel_rough: float) -> float:
    """Darcy friction factor, Colebrook-White, bisection on 1/sqrt(f)."""
    if re <= 0:
        return 0.0

    def residual(x: float) -> float:
        # x = 1/sqrt(f); Colebrook: x = -2 log10(rr/3.7 + 2.51 x / Re)
        return x + 2.0 * math.log10(rel_rough / 3.7 + 2.51 * x / re)

    lo, hi = 1e-6, 40.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if residual(lo) * residual(mid) <= 0:
            hi = mid
        else:
            lo = mid
    x = 0.5 * (lo + hi)
    return 1.0 / (x * x)


def moody(re: float, rel_rough: float) -> float:
    if re <= 0:
        return 0.0
    if re < 2000.0:
        return 64.0 / re
    if re > 4000.0:
        return colebrook(re, rel_rough)
    f_lam = 64.0 / 2000.0
    f_turb = colebrook(4000.0, rel_rough)
    t = (re - 2000.0) / 2000.0
    return f_lam + t * (f_turb - f_lam)


# ---------------------------------------------------------------------------
# black-oil PVT (Standing route + Beggs-Robinson, matching the audited
# Fluid Studio correlation selection the nodal adapter defaults to)

def standing_rs(p: float, api: float, gas_sg: float, temp_f: float) -> float:
    f_val = max(p, 0.0) / 18.2 + 1.4
    return gas_sg * (f_val * 10.0 ** (0.0125 * api - 0.00091 * temp_f)) ** (1.0 / 0.83)


def standing_pb(rs: float, api: float, gas_sg: float, temp_f: float) -> float:
    f_val = (max(rs, 0.0) / max(gas_sg, 0.1)) ** 0.83 * 10.0 ** (0.00091 * temp_f - 0.0125 * api)
    return 18.2 * (f_val - 1.4)


def solve_pb(rsb: float, api: float, gas_sg: float, temp_f: float) -> float:
    """Bisection so Rs(pb) = rsb, mirroring the JS solve contract."""
    if rsb <= 0:
        return 14.7
    lo, hi = 14.7, 15000.0
    if standing_rs(hi, api, gas_sg, temp_f) < rsb or standing_rs(lo, api, gas_sg, temp_f) > rsb:
        return min(max(standing_pb(rsb, api, gas_sg, temp_f), 14.7), 15000.0)
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        rs_mid = standing_rs(mid, api, gas_sg, temp_f)
        if abs(rs_mid - rsb) / rsb < 1e-4:
            return mid
        if rs_mid < rsb:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def standing_bo(rs: float, api: float, gas_sg: float, temp_f: float) -> float:
    yo = 141.5 / (max(api, 0.1) + 131.5)
    f_val = max(rs, 0.0) * math.sqrt(max(gas_sg, 0.1) / yo) + 1.25 * temp_f
    return 0.9759 + 0.000120 * f_val ** 1.2


def beggs_robinson(api: float, temp_f: float, saturated: bool, rs: float) -> float:
    z = 3.0324 - 0.02023 * api
    x = 10.0 ** z * temp_f ** (-1.163)
    dead = 10.0 ** x - 1.0
    if not saturated:
        return dead
    a = 10.715 * (max(rs, 0.0) + 100.0) ** (-0.515)
    b = 5.44 * (max(rs, 0.0) + 150.0) ** (-0.338)
    return a * max(dead, 0.001) ** b


def vasquez_beggs_co(rsb: float, temp_f: float, gas_sg: float, api: float, p: float) -> float:
    co = (-1433.0 + 5.0 * rsb + 17.2 * temp_f - 1180.0 * gas_sg + 12.61 * api) / (1e5 * max(p, 1.0))
    return max(co, 1e-6)


def undersaturated_muo(muob: float, p: float, pb: float) -> float:
    m = 2.6 * p ** 1.187 * math.exp(-11.513 - 8.98e-5 * p)
    return muob * (p / pb) ** m


def sutton_papay_z(p: float, temp_f: float, gas_sg: float) -> float:
    ppc = 756.8 - 131.0 * gas_sg - 3.6 * gas_sg * gas_sg
    tpc = 169.2 + 349.5 * gas_sg - 74.0 * gas_sg * gas_sg
    ppr = p / ppc
    tpr = (temp_f + 460.0) / tpc
    if tpr <= 0:
        return 0.9
    z = 1.0 - 3.52 * ppr / 10.0 ** (0.9813 * tpr) + 0.274 * ppr * ppr / 10.0 ** (0.8157 * tpr)
    return min(max(z, 0.25), 1.15)


def lee_gas_viscosity(p: float, temp_f: float, gas_sg: float, z: float) -> float:
    t_r = temp_f + 460.0
    m = 28.97 * gas_sg
    k = (9.4 + 0.02 * m) * t_r ** 1.5 / (209.0 + 19.0 * m + t_r)
    x = 3.5 + 986.0 / t_r + 0.01 * m
    y = 2.4 - 0.2 * x
    rho_g = 1.4935e-3 * p * m / (z * t_r)
    return 1e-4 * k * math.exp(x * rho_g ** y)


def water_fvf(p: float, temp_f: float) -> float:
    dvwt = -1.0001e-2 + 1.33391e-4 * temp_f + 5.50654e-7 * temp_f ** 2
    dvwp = (-1.95301e-9 * p * temp_f - 1.72834e-13 * p * p * temp_f
            - 3.58922e-7 * p - 2.25341e-10 * p * p)
    return (1.0 + dvwp) * (1.0 + dvwt)


def water_viscosity(p: float, temp_f: float, salinity_ppm: float) -> float:
    s = min(max(salinity_ppm / 10000.0, 0.0), 26.0)
    a = 109.574 - 8.40564 * s + 0.313314 * s * s + 8.72213e-3 * s ** 3
    b = (-1.12166 + 2.63951e-2 * s - 6.79461e-4 * s * s
         - 5.47119e-5 * s ** 3 + 1.55586e-6 * s ** 4)
    mu_atm = a * max(temp_f, 40.0) ** b
    return max(mu_atm * (0.9994 + 4.0295e-5 * p + 3.1062e-9 * p * p), 0.1)


def brine_density_sc(salinity_ppm: float) -> float:
    s = min(max(salinity_ppm / 10000.0, 0.0), 26.0)
    return 62.368 + 0.438603 * s + 1.60074e-3 * s * s


def sigma_go(p: float, temp_f: float, api: float) -> float:
    s68 = 39.0 - 0.2571 * api
    s100 = 37.5 - 0.2571 * api
    if temp_f <= 68.0:
        dead = s68
    elif temp_f >= 100.0:
        dead = s100
    else:
        dead = s68 + (temp_f - 68.0) * (s100 - s68) / 32.0
    return max(dead * (1.0 - 0.024 * max(p, 0.0) ** 0.45), 1.0)


def sigma_gw(p: float, temp_f: float) -> float:
    s74 = 75.0 - 1.108 * max(p, 0.0) ** 0.349
    s280 = 53.0 - 0.1048 * max(p, 0.0) ** 0.637
    if temp_f <= 74.0:
        sig = s74
    elif temp_f >= 280.0:
        sig = s280
    else:
        sig = s74 + (temp_f - 74.0) * (s280 - s74) / 206.0
    return max(sig, 1.0)


def pvt_at(model: dict, p: float, temp_f: float) -> dict:
    """Full property set matching the JS pvtAt contract (Standing route)."""
    api = model["api"]
    gas_sg = model["gasSg"]
    gor = model["gor"]
    salinity = model["salinityPpm"]
    gamma_o = 141.5 / (131.5 + api)

    pb = solve_pb(gor, api, gas_sg, temp_f)
    saturated = p < pb
    rs = min(max(standing_rs(p, api, gas_sg, temp_f), 0.0), gor) if saturated else gor

    bob = standing_bo(rs, api, gas_sg, temp_f)
    if saturated:
        bo = bob
        mu_o = beggs_robinson(api, temp_f, True, rs)
    else:
        co = vasquez_beggs_co(gor, temp_f, gas_sg, api, p)
        bo = bob * math.exp(-co * (p - pb))
        mu_o = undersaturated_muo(beggs_robinson(api, temp_f, True, gor), p, pb)

    z = sutton_papay_z(p, temp_f, gas_sg)
    bg = 0.00504 * z * (temp_f + 460.0) / p if p > 0 else 0.0
    mu_g = lee_gas_viscosity(p, temp_f, gas_sg, z)

    bw = water_fvf(p, temp_f)
    mu_w = water_viscosity(p, temp_f, salinity)
    rho_w = brine_density_sc(salinity) / bw
    rho_o = (350.17 * gamma_o + 0.0764 * gas_sg * rs) / (5.615 * bo)
    t_r = temp_f + 460.0
    rho_g = (28.97 / 10.732) * p * gas_sg / (max(z, 1e-3) * t_r) if p > 0 else 0.0

    return {
        "pb": pb,
        "rs": rs,
        "bo": bo,
        "bw": bw,
        "bg": bg,
        "z": z,
        "muO": max(mu_o, 0.05),
        "muG": max(mu_g, 0.005),
        "muW": mu_w,
        "rhoO": rho_o,
        "rhoG": rho_g,
        "rhoW": rho_w,
        "sigmaOG": sigma_go(p, temp_f, api),
        "sigmaWG": sigma_gw(p, temp_f),
    }


# ---------------------------------------------------------------------------
# oil IPR family

def vogel_q(qmax: float, pr: float, pwf: float) -> float:
    if pwf >= pr:
        return 0.0
    r = pwf / pr
    return qmax * (1.0 - 0.2 * r - 0.8 * r * r)


def composite_q(pi: float, pr: float, pb: float, pwf: float) -> float:
    if pwf >= pr:
        return 0.0
    if pwf >= pb or pb <= 0:
        return pi * (pr - pwf)
    qb = pi * (pr - pb)
    r = pwf / pb
    return qb + pi * pb / 1.8 * (1.0 - 0.2 * r - 0.8 * r * r)


def fetkovich_q(c: float, n: float, pr: float, pwf: float) -> float:
    delta = pr * pr - pwf * pwf
    return c * delta ** n if delta > 0 else 0.0


def jones_q(a: float, b: float, pr: float, pwf: float) -> float:
    dp = pr - pwf
    if dp <= 0:
        return 0.0
    if b <= 0:
        return dp / a if a > 0 else 0.0
    return (-a + math.sqrt(a * a + 4.0 * b * dp)) / (2.0 * b)


def composite_j_from_test(pr: float, pb: float, q: float, pwf: float) -> float:
    """Calibration algebra: J from a test point, above or below pb."""
    if pwf >= pb:
        return q / (pr - pwf)
    r = pwf / pb
    factor = (pr - pb) + pb / 1.8 * (1.0 - 0.2 * r - 0.8 * r * r)
    return q / factor


# ---------------------------------------------------------------------------
# trajectory (minimum curvature)

def min_curvature_tvd(survey: list) -> list:
    """survey: [{md, inc, azi}] MD-ascending, starting at md 0.
    Returns TVD at each station."""
    tvds = [0.0]
    for i in range(1, len(survey)):
        a, b = survey[i - 1], survey[i]
        d_md = b["md"] - a["md"]
        inc1, inc2 = math.radians(a["inc"]), math.radians(b["inc"])
        azi1, azi2 = math.radians(a["azi"]), math.radians(b["azi"])
        cos_dl = (math.cos(inc2 - inc1)
                  - math.sin(inc1) * math.sin(inc2) * (1.0 - math.cos(azi2 - azi1)))
        dogleg = math.acos(min(max(cos_dl, -1.0), 1.0))
        rf = (2.0 / dogleg) * math.tan(dogleg / 2.0) if dogleg > 1e-4 else 1.0
        tvds.append(tvds[-1] + d_md / 2.0 * (math.cos(inc1) + math.cos(inc2)) * rf)
    return tvds


# ---------------------------------------------------------------------------
# gas deliverability on pseudo-pressure (Simpson route)

def pseudo_pressure(p: float, temp_f: float, gas_sg: float, n: int = 2000) -> float:
    """m(p) = int_0^p 2p'/(mu z) dp' by composite Simpson."""
    if p <= 0:
        return 0.0
    if n % 2:
        n += 1
    h = p / n

    def f(pp: float) -> float:
        if pp <= 0:
            return 0.0
        z = sutton_papay_z(pp, temp_f, gas_sg)
        mu = lee_gas_viscosity(max(pp, 1e-6), temp_f, gas_sg, z)
        return 2.0 * pp / (mu * z)

    total = f(0.0) + f(p)
    for i in range(1, n):
        total += f(i * h) * (4 if i % 2 else 2)
    return total * h / 3.0


def darcy_gas_q(pr: float, pwf: float, temp_f: float, gas_sg: float,
                k: float, h: float, re: float, rw: float, skin: float) -> float:
    dm = pseudo_pressure(pr, temp_f, gas_sg) - pseudo_pressure(pwf, temp_f, gas_sg)
    geom = math.log(re / rw) - 0.75 + skin
    if dm <= 0 or geom <= 0:
        return 0.0
    return k * h * dm / (1422.0 * (temp_f + 460.0) * geom)
