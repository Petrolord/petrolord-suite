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


# ---------------------------------------------------------------------------
# NA2: in-situ flows, gradient correlations, pressure traverse
#
# The Beggs & Brill (+ Payne) and no-slip gradient algebra is published
# closed form: transcribed twice (JS and here) and gated for equality,
# with friction the only sub-percent difference (Colebrook route). The
# traverse is gated by ROUTE independence: this oracle integrates dp/dMD
# with classic RK4 at 5 ft steps; the JS engine marches Heun at 50-100 ft.

SEC_PER_DAY = 86400.0
FT3_PER_BBL = 5.614583
G_FT_S2 = 32.174


def pipe_area(id_in: float) -> float:
    d_ft = id_in / 12.0
    return math.pi / 4.0 * d_ft * d_ft


def in_situ_flows(qo: float, wct: float, gor: float, pvt: dict, area_ft2: float) -> dict:
    wc = min(max(wct, 0.0), 0.999)
    qw = qo * wc / (1.0 - wc) if wc > 0 else 0.0

    qo_is = qo * pvt["bo"] * FT3_PER_BBL / SEC_PER_DAY
    qw_is = qw * pvt["bw"] * FT3_PER_BBL / SEC_PER_DAY
    ql_is = qo_is + qw_is

    free_gas_scfd = max(0.0, qo * (gor - pvt["rs"]))
    qg_is = free_gas_scfd * pvt["bg"] * FT3_PER_BBL / SEC_PER_DAY

    vsl = ql_is / area_ft2
    vsg = qg_is / area_ft2
    vm = vsl + vsg
    lambda_l = vsl / vm if vm > 0 else 1.0

    fo = qo_is / ql_is if ql_is > 0 else 1.0
    fw = 1.0 - fo
    rho_l = fo * pvt["rhoO"] + fw * pvt["rhoW"]
    mu_l = fo * pvt["muO"] + fw * pvt["muW"]
    sigma_l = fo * pvt["sigmaOG"] + fw * pvt["sigmaWG"]

    rho_ns = rho_l * lambda_l + pvt["rhoG"] * (1.0 - lambda_l)
    mu_ns = mu_l * lambda_l + pvt["muG"] * (1.0 - lambda_l)

    return {
        "vsl": vsl, "vsg": vsg, "vm": vm, "lambdaL": lambda_l,
        "rhoL": rho_l, "muL": mu_l, "sigmaL": sigma_l,
        "rhoNs": rho_ns, "muNs": mu_ns,
    }


def reynolds(rho: float, v: float, d_ft: float, mu_cp: float) -> float:
    if mu_cp <= 0 or d_ft <= 0:
        return 0.0
    return 1488.0 * rho * abs(v) * d_ft / mu_cp


def no_slip_gradient(p: float, theta_deg: float, d_in: float, rough: float, flows: dict) -> dict:
    vm = flows["vm"]
    vsg = flows["vsg"]
    rho_ns = flows["rhoNs"]
    mu_ns = flows["muNs"]
    d_ft = d_in / 12.0
    sin_th = math.sin(math.radians(theta_deg))

    grad_grav = rho_ns * sin_th / 144.0
    if vm <= 0:
        return {"dpdz": grad_grav, "holdup": flows["lambdaL"], "pattern": "static",
                "gradGrav": grad_grav, "gradFric": 0.0, "ek": 0.0}

    f = moody(reynolds(rho_ns, vm, d_ft, mu_ns), rough)
    grad_fric = f * rho_ns * vm * vm / (2.0 * G_FT_S2 * d_ft) / 144.0
    ek = rho_ns * vm * vsg / (G_FT_S2 * 144.0 * p) if p > 0 else 0.0
    dpdz = (grad_grav + grad_fric) / (1.0 - min(ek, 0.95))
    return {"dpdz": dpdz, "holdup": flows["lambdaL"], "pattern": "no-slip",
            "gradGrav": grad_grav, "gradFric": grad_fric, "ek": ek}


_BB_HOLDUP = {
    "segregated": (0.98, 0.4846, 0.0868),
    "intermittent": (0.845, 0.5351, 0.0173),
    "distributed": (1.065, 0.5824, 0.0609),
}

_BB_C_UPHILL = {
    "segregated": (0.011, -3.768, 3.539, -1.614),
    "intermittent": (2.96, 0.305, -0.4473, 0.0978),
}

_BB_C_DOWNHILL = (4.7, -0.3692, 0.1244, -0.5056)


def bb_boundaries(lam: float) -> tuple:
    return (316.0 * lam ** 0.302,
            0.0009252 * lam ** -2.4684,
            0.1 * lam ** -1.4516,
            0.5 * lam ** -6.738)


def bb_pattern(lam: float, nfr: float) -> str:
    l1, l2, l3, l4 = bb_boundaries(lam)
    if (lam < 0.01 and nfr < l1) or (lam >= 0.01 and nfr < l2):
        return "segregated"
    if lam >= 0.01 and l2 <= nfr <= l3:
        return "transition"
    if (0.01 <= lam < 0.4 and l3 < nfr <= l1) or (lam >= 0.4 and l3 < nfr <= l4):
        return "intermittent"
    if (lam < 0.4 and nfr >= l1) or (lam >= 0.4 and nfr > l4):
        return "distributed"
    return "intermittent"


def _bb_hl0(pattern: str, lam: float, nfr: float) -> float:
    a, b, c = _BB_HOLDUP[pattern]
    return max(a * lam ** b / nfr ** c, lam)


def _bb_psi(pattern: str, lam: float, nlv: float, nfr: float, theta_deg: float) -> float:
    if theta_deg == 0:
        return 1.0
    if theta_deg > 0:
        if pattern == "distributed":
            return 1.0
        d, e, f, g = _BB_C_UPHILL[pattern]
    else:
        d, e, f, g = _BB_C_DOWNHILL
    arg = d * lam ** e * nlv ** f * nfr ** g
    c = max(0.0, (1.0 - lam) * math.log(max(arg, 1e-300)))
    th = math.radians(1.8 * theta_deg)
    s = math.sin(th)
    return 1.0 + c * (s - s ** 3 / 3.0)


def _bb_holdup(pattern: str, lam: float, nlv: float, nfr: float, theta_deg: float) -> float:
    payne = 0.924 if theta_deg > 0 else 0.685 if theta_deg < 0 else 1.0
    hl = _bb_hl0(pattern, lam, nfr) * _bb_psi(pattern, lam, nlv, nfr, theta_deg) * payne
    return min(max(hl, 1e-4), 1.0)


def bb_friction_exponent(y: float) -> float:
    if y <= 0:
        return 0.0
    if 1.0 < y < 1.2:
        return math.log(2.2 * y - 1.2)
    ln = math.log(y)
    denom = -0.0523 + 3.182 * ln - 0.8725 * ln * ln + 0.01853 * ln ** 4
    if denom == 0:
        return 0.0
    return ln / denom


def _single_phase(p, sin_th, d_ft, rough, rho, mu, v, holdup, ek):
    f = moody(reynolds(rho, v, d_ft, mu), rough)
    grad_grav = rho * sin_th / 144.0
    grad_fric = f * rho * v * v / (2.0 * G_FT_S2 * d_ft) / 144.0
    dpdz = (grad_grav + grad_fric) / (1.0 - min(ek, 0.95))
    return {"dpdz": dpdz, "holdup": holdup, "pattern": "single-phase",
            "gradGrav": grad_grav, "gradFric": grad_fric, "ek": ek}


def bb_gradient(p: float, theta_deg: float, d_in: float, rough: float,
                flows: dict, rho_g: float, mu_g: float) -> dict:
    vsl, vsg, vm = flows["vsl"], flows["vsg"], flows["vm"]
    lam = flows["lambdaL"]
    rho_l, sigma_l = flows["rhoL"], flows["sigmaL"]
    rho_ns, mu_ns = flows["rhoNs"], flows["muNs"]
    d_ft = d_in / 12.0
    sin_th = math.sin(math.radians(theta_deg))

    if vm <= 0:
        grad_grav = rho_ns * sin_th / 144.0
        return {"dpdz": grad_grav, "holdup": lam, "pattern": "static",
                "gradGrav": grad_grav, "gradFric": 0.0, "ek": 0.0}

    if vsg <= 1e-9 or lam >= 0.9999:
        return _single_phase(p, sin_th, d_ft, rough, rho_l, flows["muL"], vm, 1.0, 0.0)
    if vsl <= 1e-9 or lam <= 1e-4:
        ek = rho_g * vm * vm / (G_FT_S2 * 144.0 * max(p, 1.0))
        return _single_phase(p, sin_th, d_ft, rough, rho_g, mu_g, vm, 0.0, ek)

    nfr = vm * vm / (G_FT_S2 * d_ft)
    nlv = 1.938 * vsl * (rho_l / max(sigma_l, 1e-6)) ** 0.25
    pattern = bb_pattern(lam, nfr)

    if pattern == "transition":
        _, l2, l3, _ = bb_boundaries(lam)
        a = (l3 - nfr) / (l3 - l2)
        holdup = (a * _bb_holdup("segregated", lam, nlv, nfr, theta_deg)
                  + (1.0 - a) * _bb_holdup("intermittent", lam, nlv, nfr, theta_deg))
    else:
        holdup = _bb_holdup(pattern, lam, nlv, nfr, theta_deg)

    rho_s = rho_l * holdup + rho_g * (1.0 - holdup)
    grad_grav = rho_s * sin_th / 144.0

    fn = moody(reynolds(rho_ns, vm, d_ft, mu_ns), rough)
    y = lam / (holdup * holdup)
    ftp = fn * math.exp(bb_friction_exponent(y))
    grad_fric = ftp * rho_ns * vm * vm / (2.0 * G_FT_S2 * d_ft) / 144.0

    ek = rho_s * vm * vsg / (G_FT_S2 * 144.0 * p) if p > 0 else 0.0
    dpdz = (grad_grav + grad_fric) / (1.0 - min(ek, 0.95))
    return {"dpdz": dpdz, "holdup": holdup, "pattern": pattern,
            "gradGrav": grad_grav, "gradFric": grad_fric, "ek": ek}


# ---------------------------------------------------------------------------
# traverse by RK4 (route-independent of the JS Heun marcher)

def _trajectory_fns(survey):
    """Piecewise-linear tvd(md) and segment-end angle(md), matching the JS
    buildTrajectory convention (angle = station-end inclination)."""
    if survey is None:
        return (lambda md: md), (lambda md: 0.0)
    tvds = min_curvature_tvd(survey)
    mds = [s["md"] for s in survey]
    incs = [s["inc"] for s in survey]

    def tvd_at(md):
        if md <= mds[0]:
            return tvds[0]
        for i in range(1, len(mds)):
            if md <= mds[i]:
                t = (md - mds[i - 1]) / (mds[i] - mds[i - 1])
                return tvds[i - 1] + t * (tvds[i] - tvds[i - 1])
        return tvds[-1]

    def angle_at(md):
        for i in range(1, len(mds)):
            if md <= mds[i]:
                return incs[i]
        return incs[-1]

    return tvd_at, angle_at


def traverse_rk4(model: dict, rates: dict, whp: float, node_md: float,
                 wht_f: float, bht_f: float, tvd_max: float,
                 id_in: float, roughness_in: float, correlation: str,
                 survey=None, step_ft: float = 5.0) -> float:
    """Flowing BHP at node_md from wellhead pressure by RK4 marching."""
    tvd_at, angle_at = _trajectory_fns(survey)
    area = pipe_area(id_in)
    rough = roughness_in / id_in

    def temp_at(tvd):
        span = tvd_max if tvd_max > 0 else 1.0
        frac = min(max(tvd / span, 0.0), 1.0)
        return wht_f + (bht_f - wht_f) * frac

    def grad(md, p):
        t_f = temp_at(tvd_at(md))
        pvt = pvt_at(model, p, t_f)
        flows = in_situ_flows(rates["qo"], rates.get("wct", 0.0), rates["gor"], pvt, area)
        theta = 90.0 - angle_at(md)
        if correlation == "noSlip":
            return no_slip_gradient(p, theta, id_in, rough, flows)["dpdz"]
        return bb_gradient(p, theta, id_in, rough, flows, pvt["rhoG"], pvt["muG"])["dpdz"]

    n = max(2, int(math.ceil(node_md / step_ft)))
    h = node_md / n
    p = whp
    md = 0.0
    for _ in range(n):
        k1 = grad(md, p)
        k2 = grad(md + h / 2.0, p + h * k1 / 2.0)
        k3 = grad(md + h / 2.0, p + h * k2 / 2.0)
        k4 = grad(md + h, p + h * k3)
        p += h * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0
        md += h
    return p
