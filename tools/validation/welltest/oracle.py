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
