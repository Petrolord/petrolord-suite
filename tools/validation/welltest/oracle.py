"""Independent oracle for the Well Test Analysis Studio engines (WT1).

Python stdlib only (repo convention, see tools/validation/basinflow).
Every quantity is computed by a route independent of the JavaScript
implementation wherever the mathematics allows:

- Modified Bessel functions from their integral representations
  (K_n via  integral_0^inf e^{-x cosh t} cosh(n t) dt, I_n via
  (1/pi) integral_0^pi e^{x cos u} cos(n u) du), Simpson quadrature.
  The JS engine uses the Abramowitz-Stegun polynomial fits, so agreement
  cross-validates both.
- Exponential integral E1 from the ascending series (x <= 1) and the
  Lentz continued fraction (x > 1) evaluated to machine precision.
- Gaver-Stehfest weights in exact rational arithmetic (fractions.Fraction),
  so the JS floating-point weights are checked against exact values.
- pwD(tD) for the homogeneous wellbore-storage-and-skin model through the
  same Laplace formulation but built on the integral Bessels.

Run genfixtures.py (same directory) to regenerate the committed goldens.
"""

from __future__ import annotations

import math
from fractions import Fraction

# ---------------------------------------------------------------------------
# quadrature

def _simpson(f, a, b, n):
    """Composite Simpson rule with n (even) intervals."""
    if n % 2:
        n += 1
    h = (b - a) / n
    total = f(a) + f(b)
    for i in range(1, n):
        total += f(a + i * h) * (4 if i % 2 else 2)
    return total * h / 3.0


# ---------------------------------------------------------------------------
# modified Bessel functions (integral representations)

_MAX_EXP = 700.0


def besselk0e(x: float) -> float:
    """e^x K0(x) via K0(x) = int_0^inf e^{-x cosh t} dt (scaled integrand)."""
    if x <= 0:
        raise ValueError("x must be positive")
    # integrand e^{-x (cosh t - 1)} decays double-exponentially
    tc = math.acosh(max(_MAX_EXP / x + 1.0, 1.0 + 1e-12))
    return _simpson(lambda t: math.exp(-x * (math.cosh(t) - 1.0)), 0.0, tc, 6000)


def besselk1e(x: float) -> float:
    """e^x K1(x) via K1(x) = int_0^inf e^{-x cosh t} cosh t dt."""
    if x <= 0:
        raise ValueError("x must be positive")
    tc = math.acosh(max(_MAX_EXP / x + 1.0, 1.0 + 1e-12))
    return _simpson(
        lambda t: math.exp(-x * (math.cosh(t) - 1.0)) * math.cosh(t), 0.0, tc, 6000
    )


def besselk0(x: float) -> float:
    return besselk0e(x) * math.exp(-x)


def besselk1(x: float) -> float:
    return besselk1e(x) * math.exp(-x)


def besseli0(x: float) -> float:
    """I0(x) = (1/pi) int_0^pi e^{x cos u} du."""
    return _simpson(lambda u: math.exp(x * math.cos(u)), 0.0, math.pi, 4000) / math.pi


def besseli1(x: float) -> float:
    """I1(x) = (1/pi) int_0^pi e^{x cos u} cos u du."""
    return (
        _simpson(lambda u: math.exp(x * math.cos(u)) * math.cos(u), 0.0, math.pi, 4000)
        / math.pi
    )


import functools


@functools.lru_cache(maxsize=1 << 20)
def besselk0_integral(x: float) -> float:
    """F(x) = int_0^x K0(t) dt via the swapped-order integral representation
    F(x) = int_0^inf (1 - e^{-x cosh s}) / cosh s ds (no singularity), a route
    independent of the JS series + asymptotic-tail implementation."""
    if x <= 0:
        return 0.0
    # integrand ~ e^{-s} for large s; 1/cosh(38) ~ 6e-17
    return _simpson(
        lambda s: (1.0 - math.exp(-min(x * math.cosh(s), _MAX_EXP))) / math.cosh(s),
        0.0,
        38.0,
        2400,
    )


def besseli0e(x: float) -> float:
    return besseli0(x) * math.exp(-abs(x))


def besseli1e(x: float) -> float:
    return besseli1(x) * math.exp(-abs(x))


# ---------------------------------------------------------------------------
# exponential integral

_EULER_GAMMA = 0.57721566490153286


def exp_e1(x: float) -> float:
    if x <= 0:
        raise ValueError("x must be positive")
    if x <= 1.0:
        total = 0.0
        term = 1.0
        for n in range(1, 60):
            term *= -x / n
            total -= term / n
        return -_EULER_GAMMA - math.log(x) + total
    tiny = 1e-300
    b = x + 1.0
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, 300):
        a = -float(i * i)
        b += 2.0
        d = 1.0 / (a * d + b)
        c = b + a / c
        delta = c * d
        h *= delta
        if abs(delta - 1.0) < 1e-16:
            break
    return h * math.exp(-x)


# ---------------------------------------------------------------------------
# Gaver-Stehfest

def stehfest_coefficients(n: int = 12) -> list[float]:
    """Exact rational Stehfest weights, returned as floats."""
    if n < 2 or n % 2:
        raise ValueError("N must be a positive even integer")
    half = n // 2
    out = []
    for i in range(1, n + 1):
        total = Fraction(0)
        for k in range((i + 1) // 2, min(i, half) + 1):
            total += (
                Fraction(k) ** half
                * Fraction(math.factorial(2 * k))
                / (
                    Fraction(math.factorial(half - k))
                    * Fraction(math.factorial(k))
                    * Fraction(math.factorial(k - 1))
                    * Fraction(math.factorial(i - k))
                    * Fraction(math.factorial(2 * k - i))
                )
            )
        sign = 1 if (half + i) % 2 == 0 else -1
        out.append(float(sign * total))
    return out


def stehfest_invert(laplace_fn, t: float, n: int = 12) -> float:
    if t <= 0:
        raise ValueError("t must be positive")
    weights = stehfest_coefficients(n)
    ln2t = math.log(2.0) / t
    return ln2t * sum(w * laplace_fn((i + 1) * ln2t) for i, w in enumerate(weights))


# ---------------------------------------------------------------------------
# homogeneous model (WBS + skin), same formulation as the JS engine but on
# the integral Bessels

def pwd_laplace(u: float, skin: float = 0.0, cd: float = 0.0) -> float:
    if u <= 0:
        raise ValueError("u must be positive")
    if skin < 0:
        # effective-wellbore-radius mapping, same convention as the JS engine
        a = math.exp(2.0 * skin)
        return pwd_laplace(u / a, 0.0, cd * a) / a
    ru = math.sqrt(u)
    k0 = besselk0e(ru)
    k1 = besselk1e(ru)
    numerator = k0 + skin * ru * k1
    denominator = u * (ru * k1 + cd * u * numerator)
    return numerator / denominator


def pwd(t_d: float, skin: float = 0.0, cd: float = 0.0, n: int = 12) -> float:
    return stehfest_invert(lambda u: pwd_laplace(u, skin, cd), t_d, n)


def line_source_pd(t_d: float, r_d: float = 1.0) -> float:
    return 0.5 * exp_e1(r_d * r_d / (4.0 * t_d))


# ---------------------------------------------------------------------------
# WT3: dual porosity, boundary family, fracture models
# Same Laplace formulations as the JS engine but built on the integral-based
# Bessel functions above (WT1 convention). The uniform-flux fracture also has
# a fully independent real-time route (erf + E1 closed form, no Laplace).

def interporosity_f(u: float, omega: float, lam: float, mode: str = "pss") -> float:
    w = min(max(omega, 1e-6), 1.0)
    if w >= 1.0:
        return 1.0
    if mode == "transient-slab":
        arg = math.sqrt(3.0 * (1.0 - w) * u / lam)
        return w + math.sqrt(lam * (1.0 - w) / (3.0 * u)) * math.tanh(arg)
    return (w * (1.0 - w) * u + lam) / ((1.0 - w) * u + lam)


def radial_sandface_laplace(u, fissure=None, boundary=None):
    f = interporosity_f(u, fissure["omega"], fissure["lambda"], fissure.get("mode", "pss")) if fissure else 1.0
    b = math.sqrt(u * f)
    if boundary and boundary["type"] == "closed-circle":
        re_d = boundary["reD"]
        a, c = re_d * b, b
        E = math.exp(2.0 * (c - a)) if 2.0 * (a - c) < _MAX_EXP else 0.0
        num_ = besselk1e(a) * besseli0e(c) * E + besseli1e(a) * besselk0e(c)
        den = besseli1e(a) * besselk1e(c) - besselk1e(a) * besseli1e(c) * E
        return num_ / (u * b * den)
    p0 = besselk0e(b) / (u * b * besselk1e(b))
    if boundary:
        btype = boundary["type"]
        if btype == "fault":
            p0 += besselk0(2.0 * boundary["ld"] * b) / u
        elif btype == "constant-pressure":
            p0 -= besselk0(2.0 * boundary["ld"] * b) / u
        elif btype == "channel":
            wd = boundary["wd"]
            total, n = 0.0, 1
            while n * wd * b <= 38.0 and n <= 200000:
                total += besselk0(n * wd * b)
                n += 1
            p0 += 2.0 * total / u
    return p0


def compose_wellbore(u: float, p0: float, skin: float = 0.0, cd: float = 0.0) -> float:
    psf = p0 + max(skin, 0.0) / u
    return psf / (1.0 + cd * u * u * psf)


def pwd_radial(t_d, skin=0.0, cd=0.0, fissure=None, boundary=None, n=12):
    return stehfest_invert(
        lambda u: compose_wellbore(u, radial_sandface_laplace(u, fissure, boundary), skin, cd),
        t_d,
        n,
    )


def uf_fracture_pwd_time(t_dxf: float, x_d: float = 0.0) -> float:
    """Uniform-flux fracture pwD(tDxf) via the Gringarten-Ramey-Raghavan
    real-time closed form (erf + E1); fully independent of the JS
    Laplace/Stehfest/K0-integral route."""
    rt = math.sqrt(t_dxf)
    a1 = (1.0 + x_d) / (2.0 * rt)
    a2 = (1.0 - x_d) / (2.0 * rt)
    total = (math.sqrt(math.pi) * rt / 2.0) * (math.erf(a1) + math.erf(a2))
    if a1 > 0:
        total += ((1.0 + x_d) / 4.0) * exp_e1(a1 * a1)
    if a2 > 0:
        total += ((1.0 - x_d) / 4.0) * exp_e1(a2 * a2)
    return total


def _solve_linear(A, b):
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[piv] = M[piv], M[col]
        if abs(M[col][col]) < 1e-300:
            raise ValueError("singular system")
        for r in range(col + 1, n):
            factor = M[r][col] / M[col][col]
            for c in range(col, n + 1):
                M[r][c] -= factor * M[col][c]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (M[r][n] - sum(M[r][c] * x[c] for c in range(r + 1, n))) / M[r][r]
    return x


_GRADING_EXPONENT = 2


def _seg_k0_integral(rv, xi, a, b):
    F = besselk0_integral
    if xi <= a:
        return (F(rv * (b - xi)) - F(rv * (a - xi))) / rv
    if xi >= b:
        return (F(rv * (xi - a)) - F(rv * (xi - b))) / rv
    return (F(rv * (xi - a)) + F(rv * (b - xi))) / rv


def _g_kernel(xi, a, b):
    length = b - a
    if xi <= a:
        return length * xi
    if xi >= b:
        return length * a + length * length / 2.0
    return length * a + (length * length - (b - xi) * (b - xi)) / 2.0


def fc_fracture_pwd_laplace(v: float, fcd: float, nseg: int = 12) -> float:
    """Cinco-Ley finite-conductivity fracture, same discretization as the JS
    engine on the integral-based F(x)."""
    n = max(4, int(nseg))
    rv = math.sqrt(v)
    edges = [(j / n) ** _GRADING_EXPONENT for j in range(n + 1)]
    A = []
    rhs = []
    for i in range(n):
        xi = (edges[i] + edges[i + 1]) / 2.0
        row = [0.0] * (n + 1)
        for j in range(n):
            a, b = edges[j], edges[j + 1]
            reservoir = _seg_k0_integral(rv, xi, a, b) + _seg_k0_integral(rv, xi, -b, -a)
            row[j] = reservoir + (2.0 * math.pi / fcd) * _g_kernel(xi, a, b)
        row[n] = -1.0
        A.append(row)
        rhs.append(0.0)
    rate_row = [edges[j + 1] - edges[j] for j in range(n)] + [0.0]
    A.append(rate_row)
    rhs.append(1.0 / (2.0 * v))
    return _solve_linear(A, rhs)[n]


def fc_fracture_pwd(t_dxf: float, fcd: float, nseg: int = 12, n: int = 12) -> float:
    return stehfest_invert(lambda v: fc_fracture_pwd_laplace(v, fcd, nseg), t_dxf, n)


def uf_fracture_pwd_laplace(v: float, x_d: float = 0.0) -> float:
    rv = math.sqrt(v)
    return (besselk0_integral(rv * (1.0 + x_d)) + besselk0_integral(rv * (1.0 - x_d))) / (2.0 * v * rv)


def pwd_fracture_rw(t_d, xf_over_rw, skin=0.0, cd=0.0, fcd=None, x_d=0.732, n=12):
    """Fracture pwD in the rw-based time domain with storage + choked skin."""
    A = xf_over_rw * xf_over_rw

    def laplace(u):
        v = A * u
        if fcd is not None:
            p0 = A * fc_fracture_pwd_laplace(v, fcd)
        else:
            p0 = A * uf_fracture_pwd_laplace(v, x_d)
        return compose_wellbore(u, p0, skin, cd)

    return stehfest_invert(laplace, t_d, n)


# ---------------------------------------------------------------------------
# WT4: real-gas pseudo-pressure and deliverability
# Same correlations as the JS engine (Papay z, Lee-Gonzalez-Eakin viscosity,
# Sutton pseudo-criticals) but the m(p) integral is evaluated by fine
# composite Simpson on the continuous correlation, cross-validating the JS
# trapezoid-on-a-grid route.

def sutton_pseudo_criticals(gg: float):
    return (
        756.8 - 131.0 * gg - 3.6 * gg * gg,
        169.2 + 349.5 * gg - 74.0 * gg * gg,
    )


def papay_z(p: float, temp_f: float, gg: float) -> float:
    ppc, tpc = sutton_pseudo_criticals(gg)
    ppr = p / ppc
    tpr = (temp_f + 460.0) / tpc
    if tpr <= 0:
        return 0.9
    z = 1.0 - 3.52 * ppr / (10.0 ** (0.9813 * tpr)) + 0.274 * ppr * ppr / (10.0 ** (0.8157 * tpr))
    return min(max(z, 0.25), 1.15)


def lge_viscosity(p: float, temp_f: float, gg: float, z: float) -> float:
    t_r = temp_f + 460.0
    M = 28.97 * gg
    K = (9.4 + 0.02 * M) * t_r ** 1.5 / (209.0 + 19.0 * M + t_r)
    X = 3.5 + 986.0 / t_r + 0.01 * M
    Y = 2.4 - 0.2 * X
    rho = 1.4935e-3 * p * M / (z * t_r)
    return 1e-4 * K * math.exp(X * rho ** Y)


def pseudo_pressure(p: float, temp_f: float, gg: float, n: int = 4000) -> float:
    """m(p) = 2 int_0^p p'/(mu z) dp' by composite Simpson on the correlations."""
    def integrand(pp):
        if pp <= 0:
            return 0.0
        z = papay_z(pp, temp_f, gg)
        mu = lge_viscosity(pp, temp_f, gg, z)
        return 2.0 * pp / (mu * z)
    return _simpson(integrand, 0.0, p, n)


def _lsq_line(xs, ys):
    n = len(xs)
    sx, sy = sum(xs), sum(ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * y for x, y in zip(xs, ys))
    denom = n * sxx - sx * sx
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    return slope, intercept


def back_pressure_fit(points):
    """q = C delta^n by least squares on log-log; points [(q, delta)]."""
    slope, intercept = _lsq_line(
        [math.log10(d) for _, d in points], [math.log10(q) for q, _ in points]
    )
    return {"n": slope, "C": 10.0 ** intercept}


def lit_fit(points):
    """delta = a q + b q^2 by least squares on delta/q vs q; points [(q, delta)]."""
    slope, intercept = _lsq_line([q for q, _ in points], [d / q for q, d in points])
    return {"a": intercept, "b": slope}


# ---------------------------------------------------------------------------
# oilfield dimensionless groups (standard SPE factors)

TD_FACTOR = 0.0002637
PD_FACTOR = 141.2
CD_FACTOR = 0.8936


def dimensionless_groups(k, phi, mu, ct, rw, h, B, q):
    return {
        "tdPerHour": TD_FACTOR * k / (phi * mu * ct * rw * rw),
        "dpPerPd": PD_FACTOR * q * B * mu / (k * h),
        "cdPerBblPsi": CD_FACTOR / (phi * ct * h * rw * rw),
    }


# ---------------------------------------------------------------------------
# WT6: closed rectangle, REAL-TIME route (product of 1D no-flow slab Green's
# functions with theta duality, integrated over time) - fully independent of
# the JS Laplace/Stehfest image-lattice implementation.


def slab_green_1d(x_obs: float, xw: float, xe: float, tau: float) -> float:
    """1D diffusion Green's function on [0, xe] with no-flow ends.

    Image form for small tau (converges as exp(-(2 m xe)^2 / 4 tau)),
    eigenfunction form for large tau (converges as exp(-n^2 pi^2 tau/xe^2)).
    Both are exact; the switch at tau = xe^2/4 keeps either series short.
    """
    if tau <= xe * xe / 4.0:
        s = 0.0
        m = 0
        while True:
            hit = False
            for base in (2 * m * xe, -2 * m * xe) if m else (0.0,):
                for xi in (base + xw, base - xw):
                    e = -((x_obs - xi) ** 2) / (4.0 * tau)
                    if e > -700.0:
                        term = math.exp(e)
                        if term > 1e-18:
                            hit = True
                        s += term
            if m > 0 and not hit:
                break
            m += 1
            if m > 10000:
                break
        return s / math.sqrt(4.0 * math.pi * tau)
    s = 1.0
    n = 1
    while True:
        decay = math.exp(-(n * n) * math.pi * math.pi * tau / (xe * xe))
        if decay < 1e-18:
            break
        s += 2.0 * decay * math.cos(n * math.pi * x_obs / xe) * math.cos(n * math.pi * xw / xe)
        n += 1
        if n > 100000:
            break
    return s / xe


def rect_pd_time(t_d: float, xe: float, ye: float, xw: float, yw: float,
                 r_offset: float = 1.0, n: int = 4000) -> float:
    """Line-source pD at (xw + r_offset, yw) in a closed no-flow rectangle.

    pD(tD) = 2 pi * integral_0^tD Gx(tau) Gy(tau) dtau, evaluated by
    composite Simpson on ln(tau). The integrand vanishes like
    exp(-r_offset^2/(4 tau)) as tau -> 0, so the grid starts at a tau where
    that factor is < 1e-40.
    """
    x_obs = xw + r_offset
    tau_min = min(r_offset * r_offset / 400.0, t_d * 1e-8)
    a = math.log(tau_min)
    b = math.log(t_d)
    if n % 2:
        n += 1
    h = (b - a) / n
    total = 0.0
    for i in range(n + 1):
        tau = math.exp(a + i * h)
        f = slab_green_1d(x_obs, xw, xe, tau) * slab_green_1d(yw, yw, ye, tau) * tau
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        total += w * f
    return 2.0 * math.pi * total * h / 3.0


# ---------------------------------------------------------------------------
# WT7: horizontal well, REAL-TIME route (erf finite-line kernel x no-flow
# slab Green's function in z, integrated over time) - fully independent of
# the JS Laplace/Stehfest mode-plus-image implementation.


def hw_pd_time(t_dl: float, h_d: float, zw_d: float, zobs_d: float,
               n: int = 6000) -> float:
    """Uniform-flux horizontal well pD at the well midpoint (xD = 0),
    observation at (yD = 0, zobs_d), in Lh-based dimensionless time.

    pD(tDL) = 2 pi hD * integral_0^tDL Gxy(tau) Gz(tau) dtau
    Gxy(tau) = erf(1/(2 sqrt(tau))) / (4 sqrt(pi tau))
    Gz = 1D no-flow slab Green's function (theta duality, slab_green_1d).
    """
    rw_eff = abs(zobs_d - zw_d)
    tau_min = min(rw_eff * rw_eff / 400.0, t_dl * 1e-8)
    a = math.log(tau_min)
    b = math.log(t_dl)
    if n % 2:
        n += 1
    h = (b - a) / n
    total = 0.0
    for i in range(n + 1):
        tau = math.exp(a + i * h)
        gxy = math.erf(1.0 / (2.0 * math.sqrt(tau))) / (4.0 * math.sqrt(math.pi * tau))
        gz = slab_green_1d(zobs_d, zw_d, h_d, tau)
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        total += w * gxy * gz * tau
    return 2.0 * math.pi * h_d * total * h / 3.0


# ---------------------------------------------------------------------------
# WT9: RTA fixtures - forward models generated with the oracle's own PVT
# routes (papay_z / lge_viscosity / integral pseudo_pressure), independent of
# the JS trapezoid-table implementation the engine inverts with.


def _gas_cg(p: float, temp_f: float, gg: float) -> float:
    dp = max(p * 0.01, 1.0)
    z0 = papay_z(p, temp_f, gg)
    dzdp = (papay_z(p + dp, temp_f, gg) - papay_z(max(p - dp, 1.0), temp_f, gg)) / (
        dp + min(dp, p - 1.0)
    )
    return 1.0 / p - dzdp / z0


def gas_decline_fixture(g_truth: float, j_m: float, pi: float, pwf: float,
                        temp_f: float, gg: float, days: int, step: float):
    """Constant-pwf boundary-dominated gas decline from exact p/z material
    balance + PSS deliverability in m(p) space. Returns production rows."""
    p_over_zi = pi / papay_z(pi, temp_f, gg)
    m_pwf = pseudo_pressure(pwf, temp_f, gg)
    rows = []
    gp = 0.0
    q_prev = None
    t = step
    while t <= days:
        target = p_over_zi * max(1.0 - gp / g_truth, 1e-6)
        lo, hi = 1.0, pi
        for _ in range(60):
            mid = (lo + hi) / 2.0
            if mid / papay_z(mid, temp_f, gg) < target:
                lo = mid
            else:
                hi = mid
        pbar = (lo + hi) / 2.0
        q = j_m * (pseudo_pressure(pbar, temp_f, gg) - m_pwf)
        if q <= 0:
            break
        rows.append({"t": t, "q": q, "pwf": pwf})
        # trapezoid accumulation, matching the analysis-side convention
        gp += ((q_prev if q_prev is not None else q) + q) / 2.0 * step
        q_prev = q
        t += step
    return rows
