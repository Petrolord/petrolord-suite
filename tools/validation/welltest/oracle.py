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
