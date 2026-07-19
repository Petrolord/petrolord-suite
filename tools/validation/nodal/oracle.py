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
        gas_stream = "qgMscfd" in rates
        if gas_stream:
            flows = in_situ_flows_gas(rates["qgMscfd"], rates.get("wgr", 0.0),
                                      rates.get("cgr", 0.0), pvt, area)
            glr = rates["qgMscfd"] * 1000.0 / max(
                (rates.get("wgr", 0.0) + rates.get("cgr", 0.0)) * rates["qgMscfd"] / 1000.0, 1e-9)
        else:
            flows = in_situ_flows(rates["qo"], rates.get("wct", 0.0), rates["gor"], pvt, area)
            glr = rates.get("gor", 0.0) * (1.0 - rates.get("wct", 0.0))
        theta = 90.0 - angle_at(md)
        if correlation == "noSlip":
            return no_slip_gradient(p, theta, id_in, rough, flows)["dpdz"]
        if correlation == "hagedornBrown":
            return hb_gradient(p, theta, id_in, rough, flows, pvt["rhoG"], pvt["muG"])["dpdz"]
        if correlation == "gray":
            return gray_gradient(theta, id_in, rough, flows, pvt["rhoG"], pvt["muG"])["dpdz"]
        if correlation == "fancherBrown":
            return fb_gradient(theta, id_in, flows, glr)["dpdz"]
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


# ---------------------------------------------------------------------------
# NA2: Cullender-Smith gas column, gated by route independence.
#
# The C-S integral relation int I(p) dp = 18.75 gammaG MD is the exact
# hydrostatic+friction ODE recast; the JS engine evaluates it with the
# classic two-step trapezoid + Simpson refinement. This oracle integrates
# the equivalent ODE dp/dMD = 18.75 gammaG / I(p) by RK4 at fine steps,
# so agreement validates the quadrature, not a re-transcription.

def cs_ode_bhp(ptf: float, gas_sg: float, md_ft: float, tvd_ft: float,
               wht_f: float, bht_f: float, q_mmscfd: float, id_in: float,
               roughness_in: float, mu_cp: float = 0.012, n: int = 4000) -> float:
    elev = tvd_ft / md_ft
    f2 = 0.0
    if q_mmscfd > 0:
        re = 20011.0 * gas_sg * q_mmscfd / (mu_cp * id_in)
        f = moody(re, roughness_in / id_in)
        f2 = 0.667 * f * q_mmscfd * q_mmscfd / id_in ** 5

    def dpdl(md, p):
        t_r = wht_f + 460.0 + (bht_f - wht_f) * (md / md_ft)
        z = sutton_papay_z(p, t_r - 460.0, gas_sg)
        ptz = p / (t_r * z)
        if ptz <= 0:
            return 0.0
        return 18.75 * gas_sg * (elev * ptz * ptz / 1000.0 + f2) / ptz

    h = md_ft / n
    p = ptf
    md = 0.0
    for _ in range(n):
        k1 = dpdl(md, p)
        k2 = dpdl(md + h / 2.0, p + h * k1 / 2.0)
        k3 = dpdl(md + h / 2.0, p + h * k2 / 2.0)
        k4 = dpdl(md + h, p + h * k3)
        p += h * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0
        md += h
    return p


# ---------------------------------------------------------------------------
# NA2: modified Hagedorn-Brown, Gray, Fancher-Brown (transcription gates)

def _hb_cnl(nl: float) -> float:
    if nl <= 0.002:
        return 0.0019
    if nl >= 0.4:
        return 0.0115
    return 0.061 * nl ** 3 - 0.0929 * nl * nl + 0.0505 * nl + 0.0019


def _hb_hl_over_psi(x1: float) -> float:
    num = 0.0047 + 1123.32 * x1 + 729489.64 * x1 * x1
    den = 1.0 + 1097.1566 * x1 + 722153.97 * x1 * x1
    return math.sqrt(num / den)


def _hb_psi(x2: float) -> float:
    if x2 <= 0.01:
        return 1.0
    x = min(x2, 0.09)
    num = 1.0886 - 69.9473 * x + 2334.3497 * x * x - 12896.683 * x ** 3
    den = 1.0 - 53.4401 * x + 1517.9369 * x * x - 8419.8115 * x ** 3
    return min(max(num / den, 1.0), 1.8)


def _griffith_holdup(vsl: float, vsg: float) -> float:
    vm = vsl + vsg
    r = 1.0 + vm / 0.8
    hg = 0.5 * (r - math.sqrt(max(r * r - 4.0 * vsg / 0.8, 0.0)))
    return min(max(1.0 - hg, 1e-4), 1.0)


def hb_gradient(p: float, theta_deg: float, d_in: float, rough: float,
                flows: dict, rho_g: float, mu_g: float) -> dict:
    vsl, vsg, vm = flows["vsl"], flows["vsg"], flows["vm"]
    lam = flows["lambdaL"]
    rho_l, mu_l, sigma_l = flows["rhoL"], flows["muL"], flows["sigmaL"]
    rho_ns = flows["rhoNs"]
    d_ft = d_in / 12.0
    sin_th = math.sin(math.radians(theta_deg))

    if vm <= 0:
        grad_grav = rho_ns * sin_th / 144.0
        return {"dpdz": grad_grav, "holdup": lam, "pattern": "static",
                "gradGrav": grad_grav, "gradFric": 0.0, "ek": 0.0}
    if vsg <= 1e-9 or lam >= 0.9999:
        out = _single_phase(p, sin_th, d_ft, rough, rho_l, mu_l, vm, 1.0, 0.0)
        out["ek"] = 0.0
        out["dpdz"] = out["gradGrav"] + out["gradFric"]
        return out
    if vsl <= 1e-9 or lam <= 1e-4:
        out = _single_phase(p, sin_th, d_ft, rough, rho_g, mu_g, vm, 0.0, 0.0)
        out["ek"] = 0.0
        out["dpdz"] = out["gradGrav"] + out["gradFric"]
        return out

    lb = max(1.071 - 0.2218 * vm * vm / d_ft, 0.13)
    if vsg / vm < lb:
        holdup = _griffith_holdup(vsl, vsg)
        v_l = vsl / holdup
        rho_s = rho_l * holdup + rho_g * (1.0 - holdup)
        grad_grav = rho_s * sin_th / 144.0
        f = moody(reynolds(rho_l, v_l, d_ft, mu_l), rough)
        grad_fric = f * rho_l * v_l * v_l / (2.0 * G_FT_S2 * d_ft) / 144.0
        return {"dpdz": grad_grav + grad_fric, "holdup": holdup,
                "pattern": "bubble (Griffith)", "gradGrav": grad_grav,
                "gradFric": grad_fric, "ek": 0.0}

    sigma = max(sigma_l, 1e-6)
    qr = (rho_l / sigma) ** 0.25
    nlv = 1.938 * vsl * qr
    ngv = 1.938 * vsg * qr
    nd = 120.872 * d_ft * math.sqrt(rho_l / sigma)
    nl = 0.15726 * mu_l * (1.0 / (rho_l * sigma ** 3)) ** 0.25

    cnl = _hb_cnl(nl)
    x1 = (nlv / ngv ** 0.575) * (p / 14.7) ** 0.1 * (cnl / nd)
    x2 = ngv * nl ** 0.38 / nd ** 2.14
    holdup = min(max(_hb_hl_over_psi(x1) * _hb_psi(x2), lam), 1.0)

    rho_s = rho_l * holdup + rho_g * (1.0 - holdup)
    grad_grav = rho_s * sin_th / 144.0

    mu_s = mu_l ** holdup * mu_g ** (1.0 - holdup)
    f = moody(reynolds(rho_ns, vm, d_ft, mu_s), rough)
    grad_fric = f * rho_ns * rho_ns * vm * vm / (2.0 * G_FT_S2 * d_ft * rho_s) / 144.0

    return {"dpdz": grad_grav + grad_fric, "holdup": holdup,
            "pattern": "hagedorn-brown", "gradGrav": grad_grav,
            "gradFric": grad_fric, "ek": 0.0}


_SIGMA_CONV = 453.592


def gray_gradient(theta_deg: float, d_in: float, rough: float,
                  flows: dict, rho_g: float, mu_g: float) -> dict:
    vsl, vsg, vm = flows["vsl"], flows["vsg"], flows["vm"]
    lam = flows["lambdaL"]
    rho_l, mu_l, sigma_l = flows["rhoL"], flows["muL"], flows["sigmaL"]
    rho_ns = flows["rhoNs"]
    d_ft = d_in / 12.0
    sin_th = math.sin(math.radians(theta_deg))

    if vm <= 0:
        grad_grav = rho_ns * sin_th / 144.0
        return {"dpdz": grad_grav, "holdup": lam, "pattern": "static",
                "gradGrav": grad_grav, "gradFric": 0.0, "ek": 0.0}
    if vsg <= 1e-9 or lam >= 0.9999:
        out = _single_phase(0.0, sin_th, d_ft, rough, rho_l, mu_l, vm, 1.0, 0.0)
        out["ek"] = 0.0
        out["dpdz"] = out["gradGrav"] + out["gradFric"]
        return out
    if vsl <= 1e-9:
        out = _single_phase(0.0, sin_th, d_ft, rough, rho_g, mu_g, vm, 0.0, 0.0)
        out["ek"] = 0.0
        out["dpdz"] = out["gradGrav"] + out["gradFric"]
        return out

    d_rho = max(rho_l - rho_g, 1e-6)
    sigma = max(sigma_l, 1e-6)
    rv = vsl / vsg if vsg > 0 else float("inf")
    n1 = _SIGMA_CONV * rho_ns * rho_ns * vm ** 4 / (G_FT_S2 * sigma * d_rho)
    n2 = _SIGMA_CONV * G_FT_S2 * d_ft * d_ft * d_rho / sigma
    b = 0.0814 * (1.0 - 0.0554 * math.log(1.0 + 730.0 * rv / (rv + 1.0)))
    a = -2.314 * (n1 * (1.0 + 205.0 / n2)) ** b
    holdup = min(max(1.0 - (1.0 - lam) * (1.0 - math.exp(a)), lam), 1.0)

    rho_s = rho_l * holdup + rho_g * (1.0 - holdup)
    grad_grav = rho_s * sin_th / 144.0

    k0 = (28.5 / _SIGMA_CONV) * sigma / (rho_ns * vm * vm)
    rough_ft = rough * d_ft
    ke = k0 if rv >= 0.007 else rough_ft + rv * (k0 - rough_ft) / 0.007
    ke = max(ke, 2.77e-5)
    f = colebrook(1e7, min(ke / d_ft, 0.05))
    grad_fric = f * rho_ns * vm * vm / (2.0 * G_FT_S2 * d_ft) / 144.0

    return {"dpdz": grad_grav + grad_fric, "holdup": holdup, "pattern": "gray",
            "gradGrav": grad_grav, "gradFric": grad_fric, "ek": 0.0}


_FB_BANDS = {
    "low": [(3.42747, 0.242031), (3.8883, 0.169446), (4.85782, 0.102253),
            (6.1143, 0.07001), (8.41248, 0.044503), (13.2285, 0.026069),
            (24.3094, 0.012589), (34.9694, 0.008684), (45.3402, 0.006597),
            (72.9019, 0.004194)],
    "mid": [(3.61021, 0.075408), (4.93046, 0.05163), (5.76188, 0.043522),
            (7.86899, 0.029359), (10.8267, 0.020862), (14.6767, 0.014606),
            (19.4577, 0.010932), (24.6729, 0.008244), (28.6203, 0.007053),
            (36.2912, 0.005319)],
    "high": [(2.80517, 0.050119), (3.40213, 0.038359), (3.91726, 0.031858),
             (4.93046, 0.02367), (6.8851, 0.015158), (8.47513, 0.011951),
             (9.7584, 0.009853), (14.8962, 0.00599), (18.3363, 0.004653),
             (24.1297, 0.003306)],
}


def fb_friction(drhov: float, glr: float) -> float:
    band = _FB_BANDS["low"] if glr < 1500 else _FB_BANDS["mid"] if glr <= 3000 else _FB_BANDS["high"]
    x = math.log10(min(max(drhov, band[0][0]), band[-1][0]))
    for i in range(1, len(band)):
        x1, x2 = math.log10(band[i - 1][0]), math.log10(band[i][0])
        if x <= x2:
            y1, y2 = math.log10(band[i - 1][1]), math.log10(band[i][1])
            t = 0.0 if x2 == x1 else (x - x1) / (x2 - x1)
            return 10.0 ** (y1 + t * (y2 - y1))
    return band[-1][1]


def fb_gradient(theta_deg: float, d_in: float, flows: dict, glr: float) -> dict:
    vm, lam, rho_ns = flows["vm"], flows["lambdaL"], flows["rhoNs"]
    d_ft = d_in / 12.0
    sin_th = math.sin(math.radians(theta_deg))
    grad_grav = rho_ns * sin_th / 144.0
    if vm <= 0:
        return {"dpdz": grad_grav, "holdup": lam, "pattern": "static",
                "gradGrav": grad_grav, "gradFric": 0.0, "ek": 0.0}
    area = math.pi / 4.0 * d_ft * d_ft
    w = rho_ns * vm * area * SEC_PER_DAY
    drhov = 1.4737e-5 * w / d_ft
    f = fb_friction(drhov, glr)
    grad_fric = f * w * w / (7.413e10 * rho_ns * d_ft ** 5) / 144.0
    return {"dpdz": grad_grav + grad_fric, "holdup": lam, "pattern": "fancher-brown",
            "gradGrav": grad_grav, "gradFric": grad_fric, "ek": 0.0}


def in_situ_flows_gas(qg_mscfd: float, wgr: float, cgr: float, pvt: dict, area_ft2: float) -> dict:
    qg_scfd = qg_mscfd * 1000.0
    qc = cgr * qg_mscfd / 1000.0
    qw = wgr * qg_mscfd / 1000.0

    qg_is = qg_scfd * pvt["bg"] * FT3_PER_BBL / SEC_PER_DAY
    qc_is = qc * pvt["bo"] * FT3_PER_BBL / SEC_PER_DAY
    qw_is = qw * pvt["bw"] * FT3_PER_BBL / SEC_PER_DAY
    ql_is = qc_is + qw_is

    vsl = ql_is / area_ft2
    vsg = qg_is / area_ft2
    vm = vsl + vsg
    lam = vsl / vm if vm > 0 else 1.0

    fo = qc_is / ql_is if ql_is > 0 else 0.0
    fw = 1.0 - fo
    rho_l = fo * pvt["rhoO"] + fw * pvt["rhoW"] if ql_is > 0 else pvt["rhoW"]
    mu_l = fo * pvt["muO"] + fw * pvt["muW"] if ql_is > 0 else pvt["muW"]
    sigma_l = fo * pvt["sigmaOG"] + fw * pvt["sigmaWG"] if ql_is > 0 else pvt["sigmaWG"]

    return {
        "vsl": vsl, "vsg": vsg, "vm": vm, "lambdaL": lam,
        "rhoL": rho_l, "muL": mu_l, "sigmaL": sigma_l,
        "rhoNs": rho_l * lam + pvt["rhoG"] * (1.0 - lam),
        "muNs": mu_l * lam + pvt["muG"] * (1.0 - lam),
    }


# ---------------------------------------------------------------------------
# NA3: operating point and gas-lift response, gated by route independence.
#
# The JS engine solves the node with a grid scan + Brent refinement over
# its Heun traverse; this oracle solves the same systems by coarse-scan +
# bisection over the RK4 traverse and closed-form IPR inversions.

def composite_pwf_at(pr: float, pb: float, j: float, q: float) -> float:
    """Inverse of the composite Standing IPR (exact algebra)."""
    if q <= 0:
        return pr
    qb = j * (pr - pb)
    if q <= qb or pb <= 0:
        return pr - q / j
    rem = 1.0 - 1.8 * (q - qb) / (j * pb)
    if rem <= 0:
        return 0.0
    r = (-0.2 + math.sqrt(0.04 + 3.2 * rem)) / 1.6
    return r * pb


def _bisect_rightmost(g, q_lo: float, q_hi: float, n_scan: int = 60) -> float:
    """Rightmost sign change of g on [q_lo, q_hi], refined by bisection."""
    qs = [q_lo + (q_hi - q_lo) * i / (n_scan - 1) for i in range(n_scan)]
    vals = [g(q) for q in qs]
    bracket = None
    for i in range(1, n_scan):
        if vals[i - 1] * vals[i] < 0:
            bracket = (qs[i - 1], qs[i])
    if bracket is None:
        return float("nan")
    lo, hi = bracket
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if g(lo) * g(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def solve_op_oil(model: dict, ipr: dict, vlp: dict) -> dict:
    """Operating point: composite IPR x RK4 traverse (Beggs & Brill)."""
    pr, pb, j = ipr["pr"], ipr["pb"], ipr["pi"]
    qb = j * (pr - pb)
    qmax = qb + j * pb / 1.8

    def vlp_bhp(q):
        rates = dict(vlp["rates"])
        rates["qo"] = q
        return traverse_rk4(model, rates, vlp["whp"], vlp["nodeMd"], vlp["whtF"],
                            vlp["bhtF"], vlp["tvdMax"], vlp["idIn"],
                            vlp["roughnessIn"], vlp["correlation"],
                            survey=vlp.get("survey"), step_ft=10.0)

    q = _bisect_rightmost(lambda x: vlp_bhp(x) - composite_pwf_at(pr, pb, j, x),
                          qmax * 1e-3, qmax * 0.999)
    return {"q": q, "pwf": composite_pwf_at(pr, pb, j, q)}


def solve_op_gas(ipr: dict, cs: dict) -> dict:
    """Operating point: back-pressure IPR x RK4 gas-column ODE."""
    pr, c, n = ipr["pr"], ipr["c"], ipr["n"]
    aof = c * (pr * pr) ** n

    def ipr_pwf(q):
        if q <= 0:
            return pr
        delta = (q / c) ** (1.0 / n)
        return math.sqrt(max(pr * pr - delta, 0.0))

    def vlp_bhp(q):
        return cs_ode_bhp(cs["ptf"], cs["gasSg"], cs["mdFt"],
                          cs.get("tvdFt", cs["mdFt"]), cs["whtF"], cs["bhtF"],
                          q / 1000.0, cs["idIn"], cs.get("roughnessIn", 0.0006),
                          n=1500)

    q = _bisect_rightmost(lambda x: vlp_bhp(x) - ipr_pwf(x), aof * 1e-3, aof * 0.999)
    return {"q": q, "pwf": ipr_pwf(q)}


def gas_lift_response(model: dict, ipr: dict, vlp: dict, qgis: list) -> list:
    """Gas-lift screening response by the oracle route (mirrors the JS
    gorEff cap and rate floor exactly; traverse by RK4)."""
    pr, pb, j = ipr["pr"], ipr["pb"], ipr["pi"]
    qb = j * (pr - pb)
    qmax = qb + j * pb / 1.8
    out = []
    for qgi in qgis:
        def vlp_bhp(q, qgi=qgi):
            rates = dict(vlp["rates"])
            gor_eff = min(rates.get("gor", 0.0) + qgi * 1000.0 / max(q, qmax * 1e-4), 50000.0)
            rates["qo"] = q
            rates["gor"] = gor_eff
            return traverse_rk4(model, rates, vlp["whp"], vlp["nodeMd"], vlp["whtF"],
                                vlp["bhtF"], vlp["tvdMax"], vlp["idIn"],
                                vlp["roughnessIn"], vlp["correlation"], step_ft=10.0)

        q = _bisect_rightmost(lambda x: vlp_bhp(x) - composite_pwf_at(pr, pb, j, x),
                              qmax * 1e-3, qmax * 0.999)
        out.append({"qgi": qgi, "q": 0.0 if math.isnan(q) else q})
    return out


# ---------------------------------------------------------------------------
# NA3: choke performance (closed forms transcribed twice)

CHOKE_COEFFS = {
    "gilbert": (10.0, 0.546, 1.89),
    "ros": (17.4, 0.5, 2.0),
    "baxendell": (9.56, 0.546, 1.93),
    "achong": (3.82, 0.65, 1.88),
    "pilehvari": (46.67, 0.313, 2.11),
}


def choke_whp(q: float, glr: float, s64: float, corr: str) -> float:
    c, m, n = CHOKE_COEFFS[corr]
    return c * glr ** m * q / s64 ** n


def choke_rate(pwh: float, glr: float, s64: float, corr: str) -> float:
    c, m, n = CHOKE_COEFFS[corr]
    return pwh * s64 ** n / (c * glr ** m)


def choke_size(pwh: float, q: float, glr: float, corr: str) -> float:
    c, m, n = CHOKE_COEFFS[corr]
    return (c * glr ** m * q / pwh) ** (1.0 / n)


def critical_ratio(k: float) -> float:
    return (2.0 / (k + 1.0)) ** (k / (k - 1.0))


def gas_choke_rate(p_up: float, p_dn: float, d_in: float, gas_sg: float,
                   t_up_f: float, k: float, cd: float) -> dict:
    yc = critical_ratio(k)
    t_r = t_up_f + 460.0
    a = math.pi / 4.0 * d_in * d_in
    y = p_dn / p_up
    if y <= yc:
        q = 879.0 * cd * a * p_up * math.sqrt(
            k / (gas_sg * t_r) * (2.0 / (k + 1.0)) ** ((k + 1.0) / (k - 1.0)))
        regime = "sonic"
        p_out = yc * p_up
    else:
        q = 1248.0 * cd * a * p_up * math.sqrt(
            k / ((k - 1.0) * gas_sg * t_r) * (y ** (2.0 / k) - y ** ((k + 1.0) / k)))
        regime = "subsonic"
        p_out = p_dn
    t_dn = t_r * (p_out / p_up) ** ((k - 1.0) / k) - 460.0
    return {"qMscfd": q, "regime": regime, "yc": yc, "tDnF": t_dn}


def gas_choke_upstream(q_mscfd: float, p_dn: float, d_in: float, gas_sg: float,
                       t_up_f: float, k: float, cd: float) -> dict:
    yc = critical_ratio(k)
    t_r = t_up_f + 460.0
    a = math.pi / 4.0 * d_in * d_in
    sonic_factor = 879.0 * cd * a * math.sqrt(
        k / (gas_sg * t_r) * (2.0 / (k + 1.0)) ** ((k + 1.0) / (k - 1.0)))
    p_up_min = p_dn / yc
    q_at_min = sonic_factor * p_up_min
    if q_mscfd >= q_at_min:
        return {"pUp": q_mscfd / sonic_factor, "regime": "sonic"}

    def q_sub(p_up):
        y = p_dn / p_up
        return 1248.0 * cd * a * p_up * math.sqrt(
            k / ((k - 1.0) * gas_sg * t_r) * (y ** (2.0 / k) - y ** ((k + 1.0) / k)))

    lo, hi = p_dn * 1.000001, p_up_min
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if q_sub(mid) < q_mscfd:
            lo = mid
        else:
            hi = mid
    return {"pUp": 0.5 * (lo + hi), "regime": "subsonic"}
