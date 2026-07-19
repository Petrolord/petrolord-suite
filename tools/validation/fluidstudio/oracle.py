"""Independent oracle for the Fluid Systems Studio PR78 engine (FS2).

Python stdlib only (repo convention, see tools/validation/welltest).
Every quantity is computed by a route independent of the JavaScript
implementation wherever the mathematics allows:

- Compressibility roots by bracketed bisection between the analytic
  extrema of the cubic (the JS engine uses Cardano + Newton polish).
- ln(phi_i) by numerical quadrature of the residual-Helmholtz integral
      ln phi_i = (1/RT) int_V^inf [dP/dn_i - RT/V'] dV'  -  ln Z
  with dP/dn_i differentiated from the pressure-explicit mole-number
  form of PR (the JS engine uses the packaged closed-form expression,
  so agreement cross-validates the algebra end to end).
- Pure-component saturation pressure by the Maxwell equal-area
  construction, bisected inside the spinodal window (the JS engine uses
  fugacity-equality successive substitution).

Component constants are loaded from the committed, source-cited table
src/utils/fluidstudio/eos/__tests__/componentReference.json - a single
transcription shared by both sides. Run genfixtures.py (same directory)
to regenerate the committed goldens.

Units: psia, degR, lb-mol, ft3 (matches src/utils/fluidstudio/eos/units.js).
"""

from __future__ import annotations

import json
import math
import os

R = 10.7316  # psia ft3 / (lb-mol degR)
OMEGA_A = 0.457235529
OMEGA_B = 0.077796074
SQRT2 = math.sqrt(2.0)
D1 = 1.0 + SQRT2
D2 = 1.0 - SQRT2

_HERE = os.path.dirname(os.path.abspath(__file__))
_REF_PATH = os.path.join(
    _HERE, "..", "..", "..",
    "src", "utils", "fluidstudio", "eos", "__tests__", "componentReference.json",
)

with open(_REF_PATH, encoding="utf-8") as fh:
    COMPONENTS = json.load(fh)["components"]


# ---------------------------------------------------------------------------
# pure-component and mixture parameters

def kappa(omega: float) -> float:
    if omega > 0.491:
        return 0.379642 + omega * (1.48503 + omega * (-0.164423 + omega * 0.016666))
    return 0.37464 + omega * (1.54226 - omega * 0.26992)


def pure_ab(comp: dict, t_r: float) -> tuple[float, float]:
    tr = t_r / comp["tcR"]
    alpha_sqrt = 1.0 + kappa(comp["omega"]) * (1.0 - math.sqrt(tr))
    rtc = R * comp["tcR"]
    a = OMEGA_A * rtc * rtc * alpha_sqrt * alpha_sqrt / comp["pcPsia"]
    b = OMEGA_B * rtc / comp["pcPsia"]
    return a, b


def mix_params(comps: list[dict], bip: list[list[float]], x: list[float], t_r: float):
    """Return (aij matrix, bi list, a_mix, b_mix)."""
    n = len(comps)
    ab = [pure_ab(c, t_r) for c in comps]
    aij = [
        [math.sqrt(ab[i][0] * ab[j][0]) * (1.0 - bip[i][j]) for j in range(n)]
        for i in range(n)
    ]
    a_mix = sum(x[i] * x[j] * aij[i][j] for i in range(n) for j in range(n))
    b_mix = sum(x[i] * ab[i][1] for i in range(n))
    return aij, [ab[i][1] for i in range(n)], a_mix, b_mix


def pressure(a: float, b: float, t_r: float, v: float) -> float:
    """PR pressure, per-mole form (v = molar volume)."""
    return R * t_r / (v - b) - a / (v * v + 2.0 * b * v - b * b)


# ---------------------------------------------------------------------------
# cubic in Z by bracketed bisection (independent of Cardano)

def _cubic(z: float, big_a: float, big_b: float) -> float:
    c2 = -(1.0 - big_b)
    c1 = big_a - 3.0 * big_b * big_b - 2.0 * big_b
    c0 = -(big_a * big_b - big_b * big_b - big_b ** 3)
    return ((z + c2) * z + c1) * z + c0


def _bisect(f, lo: float, hi: float, iters: int = 200) -> float:
    flo = f(lo)
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        if fm == 0.0:
            return mid
        if (flo < 0.0) == (fm < 0.0):
            lo, flo = mid, fm
        else:
            hi = mid
    return 0.5 * (lo + hi)


def z_roots(big_a: float, big_b: float) -> list[float]:
    """All real roots of the PR cubic, ascending."""
    c2 = -(1.0 - big_b)
    c1 = big_a - 3.0 * big_b * big_b - 2.0 * big_b
    f = lambda z: _cubic(z, big_a, big_b)  # noqa: E731

    # stationary points of the cubic: 3z^2 + 2 c2 z + c1 = 0
    disc = c2 * c2 - 3.0 * c1
    lo_bound, hi_bound = -2.0, max(10.0, 2.0 + big_b + big_a)
    if disc <= 0.0:  # monotonic: exactly one real root
        return [_bisect(f, lo_bound, hi_bound)]
    s = math.sqrt(disc)
    e1, e2 = (-c2 - s) / 3.0, (-c2 + s) / 3.0
    roots: list[float] = []
    for lo, hi in ((lo_bound, e1), (e1, e2), (e2, hi_bound)):
        if f(lo) == 0.0:
            roots.append(lo)
        elif (f(lo) < 0.0) != (f(hi) < 0.0):
            roots.append(_bisect(f, lo, hi))
    return sorted(set(roots))


# ---------------------------------------------------------------------------
# ln(phi) by residual-Helmholtz quadrature

def ln_phi_numeric(
    comps: list[dict], bip: list[list[float]], x: list[float],
    t_r: float, p_psia: float, z_factor: float, n_panels: int = 4000,
) -> list[float]:
    """ln phi_i = (1/RT) int_V^inf [dP/dn_i - RT/V'] dV' - ln Z, at n = 1 mol.

    dP/dn_i comes from the mole-number form
        P = n R T/(V - Nb) - Na/(V^2 + 2 Nb V - Nb^2),
    Na = sum n_i n_j a_ij, Nb = sum n_i b_i, evaluated at n = 1 so V is the
    molar volume. Substituting u = 1/V' turns the tail integral into a
    smooth finite-interval integrand handled with composite Simpson and
    one Richardson halving step.
    """
    n = len(comps)
    aij, bi, a_mix, b_mix = mix_params(comps, bip, x, t_r)
    s_i = [sum(x[j] * aij[i][j] for j in range(n)) for i in range(n)]
    rt = R * t_r
    v_phase = z_factor * rt / p_psia

    def integrand(u: float) -> list[float]:
        # returns [dP/dn_i - RT/V] / RT * V^2  (the du integrand), V = 1/u
        if u <= 0.0:
            # V -> inf: dP/dn_i - RT/V -> (RT b_mix + RT b_i - 2 S_i)/V^2,
            # so the du-integrand limit is b_mix + b_i - 2 S_i/RT
            return [b_mix + bi[i] - 2.0 * s_i[i] / rt for i in range(n)]
        v = 1.0 / u
        vmb = v - b_mix
        den = v * v + 2.0 * b_mix * v - b_mix * b_mix
        common1 = rt / vmb
        common2 = rt / (vmb * vmb)
        dden_db = 2.0 * v - 2.0 * b_mix
        out = []
        for i in range(n):
            dp_dni = (
                common1
                + common2 * bi[i]
                - (2.0 * s_i[i] * den - a_mix * dden_db * bi[i]) / (den * den)
            )
            out.append((dp_dni - rt / v) * v * v / rt)
        return out

    def simpson(n_iv: int) -> list[float]:
        if n_iv % 2:
            n_iv += 1
        h = (1.0 / v_phase) / n_iv
        total = [0.0] * n
        f0 = integrand(0.0)
        fn = integrand(1.0 / v_phase)
        for i in range(n):
            total[i] = f0[i] + fn[i]
        for k in range(1, n_iv):
            w = 4.0 if k % 2 else 2.0
            fk = integrand(k * h)
            for i in range(n):
                total[i] += w * fk[i]
        return [t * h / 3.0 for t in total]

    coarse = simpson(n_panels)
    fine = simpson(2 * n_panels)
    integral = [(16.0 * fine[i] - coarse[i]) / 15.0 for i in range(n)]
    ln_z = math.log(z_factor)
    return [integral[i] - ln_z for i in range(n)]


def phase_state(
    comps: list[dict], bip: list[list[float]], x: list[float],
    t_r: float, p_psia: float,
) -> dict:
    """Chosen-root phase state with oracle root selection (lowest Gibbs)."""
    n = len(comps)
    _, bi, a_mix, b_mix = mix_params(comps, bip, x, t_r)
    rt = R * t_r
    big_a = a_mix * p_psia / (rt * rt)
    big_b = b_mix * p_psia / rt
    roots = z_roots(big_a, big_b)
    physical = [z for z in roots if z > big_b]
    if not physical:
        physical = [roots[-1]]
    if len(physical) == 1:
        z = physical[0]
        ln_phi = ln_phi_numeric(comps, bip, x, t_r, p_psia, z)
    else:
        cands = [physical[0], physical[-1]]
        phis = [ln_phi_numeric(comps, bip, x, t_r, p_psia, z) for z in cands]
        gibbs = [sum(x[i] * lp[i] for i in range(n)) for lp in phis]
        pick = 0 if gibbs[0] <= gibbs[1] else 1
        z, ln_phi = cands[pick], phis[pick]

    c_shift = sum(x[i] * comps[i].get("shift", 0.0) * bi[i] for i in range(n))
    mw = sum(x[i] * comps[i]["mw"] for i in range(n))
    v_eos = z * rt / p_psia
    v_corr = v_eos - c_shift
    return {
        "roots": roots,
        "z": z,
        "lnPhi": ln_phi,
        "molarVolume": v_corr,
        "density": mw / v_corr,
    }


# ---------------------------------------------------------------------------
# pure-component Psat by Maxwell equal-area construction

def _pressure_extrema(a: float, b: float, t_r: float):
    """(P_at_local_min, P_at_local_max) of the subcritical isotherm P(V)."""
    dp = lambda v: (  # noqa: E731
        -R * t_r / (v - b) ** 2
        + a * (2.0 * v + 2.0 * b) / (v * v + 2.0 * b * v - b * b) ** 2
    )
    vs = [b * (1.0 + 1e-9) * math.exp(k * math.log(1e9) / 20000.0) for k in range(20001)]
    crossings = []
    for v0, v1 in zip(vs, vs[1:]):
        if (dp(v0) < 0.0) != (dp(v1) < 0.0):
            crossings.append(_bisect(dp, v0, v1))
    if len(crossings) < 2:
        return None
    p_vals = [pressure(a, b, t_r, v) for v in crossings]
    return min(p_vals), max(p_vals)


def pure_psat_maxwell(comp: dict, t_r: float) -> float | None:
    """Saturation pressure from equal areas: int_VL^VV P dV = Psat (VV - VL).

    The indefinite integral of PR pressure is analytic (partial fractions on
    V^2 + 2bV - b^2 = (V + D2 b)(V + D1 b)):
        int P dV = RT ln(V - b) - a/(2 sqrt2 b) ln[(V + D2 b)/(V + D1 b)].
    Bisection on the area residual inside the spinodal window.
    """
    if t_r >= comp["tcR"]:
        return None
    a, b = pure_ab(comp, t_r)
    ext = _pressure_extrema(a, b, t_r)
    if ext is None:
        return None
    p_lo = max(ext[0], 1e-10) * (1.0 + 1e-9)
    p_hi = ext[1] * (1.0 - 1e-9)
    if p_hi <= p_lo:
        return None

    def antideriv(v: float) -> float:
        return R * t_r * math.log(v - b) - a / (2.0 * SQRT2 * b) * math.log(
            (v + D2 * b) / (v + D1 * b)
        )

    def area_residual(p: float) -> float:
        rt = R * t_r
        big_a = a * p / (rt * rt)
        big_b = b * p / rt
        zs = [z for z in z_roots(big_a, big_b) if z > big_b]
        v_l = zs[0] * rt / p
        v_v = zs[-1] * rt / p
        return antideriv(v_v) - antideriv(v_l) - p * (v_v - v_l)

    f_lo = area_residual(p_lo)
    f_hi = area_residual(p_hi)
    if (f_lo < 0.0) == (f_hi < 0.0):
        return None
    return _bisect(area_residual, p_lo, p_hi)
