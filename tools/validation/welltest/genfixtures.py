"""Generate committed golden fixtures for the Well Test Analysis engines.

Writes src/utils/welltest/__tests__/goldens.json (consumed by jest and by
tools/validation/welltest/run-validation.mjs). Regenerate with:

    python3 tools/validation/welltest/genfixtures.py

Everything is deterministic; the synthetic test fixtures embed their
generating truth so round-trip cases can assert recovery.
"""

from __future__ import annotations

import json
import math
import os

import oracle

OUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "src", "utils", "welltest",
    "__tests__", "goldens.json",
)


def logspace(a, b, n):
    return [10 ** (a + (b - a) * i / (n - 1)) for i in range(n)]


def build():
    goldens = {
        "_generator": "tools/validation/welltest/genfixtures.py (stdlib oracle)",
        "bessel": [
            {
                "x": x,
                "i0": oracle.besseli0(x),
                "i1": oracle.besseli1(x),
                "k0e": oracle.besselk0e(x),
                "k1e": oracle.besselk1e(x),
            }
            for x in [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 3.75, 5.0, 10.0, 20.0, 50.0]
        ],
        "e1": [
            {"x": x, "e1": oracle.exp_e1(x)}
            for x in [1e-4, 1e-2, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
        ],
        "stehfest": {
            str(n): oracle.stehfest_coefficients(n) for n in (8, 12, 16)
        },
        "lineSource": [
            {"tD": t, "pD": oracle.line_source_pd(t)}
            for t in [1e2, 1e3, 1e5, 1e7]
        ],
        "pwd": [],
        "fixtures": {},
    }

    # dimensionless pwD across the response: storage hump through radial flow
    cases = [
        {"skin": 0.0, "cd": 0.0},
        {"skin": 0.0, "cd": 100.0},
        {"skin": 5.0, "cd": 1000.0},
        {"skin": 10.0, "cd": 10000.0},
        {"skin": -2.0, "cd": 50.0},
    ]
    for case in cases:
        for t_d in logspace(2, 8, 7):
            goldens["pwd"].append(
                {
                    "skin": case["skin"],
                    "cd": case["cd"],
                    "tD": t_d,
                    "pwd": oracle.pwd(t_d, case["skin"], case["cd"]),
                }
            )

    # --- synthetic drawdown fixture (dimensional, oilfield units) ----------
    reservoir = {
        "phi": 0.18, "mu": 0.9, "ct": 1.2e-5, "rw": 0.354,
        "h": 45.0, "B": 1.25, "q": 450.0, "pi": 4800.0,
    }
    truth = {"k": 85.0, "skin": 6.5, "C": 0.015}
    groups = oracle.dimensionless_groups(
        truth["k"], reservoir["phi"], reservoir["mu"], reservoir["ct"],
        reservoir["rw"], reservoir["h"], reservoir["B"], reservoir["q"],
    )
    cd = truth["C"] * groups["cdPerBblPsi"]

    times = logspace(-2, 2, 45)
    drawdown_points = []
    for t in times:
        p_wd = oracle.pwd(groups["tdPerHour"] * t, truth["skin"], cd)
        dp = groups["dpPerPd"] * p_wd
        drawdown_points.append({"t": t, "dp": dp, "pwf": reservoir["pi"] - dp})
    goldens["fixtures"]["drawdown"] = {
        "reservoir": reservoir,
        "truth": truth,
        "points": drawdown_points,
    }

    # --- synthetic buildup fixture (exact superposition) -------------------
    tp = 36.0
    pwd_tp = oracle.pwd(groups["tdPerHour"] * tp, truth["skin"], cd)
    pwf_shut_in = reservoir["pi"] - groups["dpPerPd"] * pwd_tp
    buildup_points = []
    for dt in logspace(-2, 1.9, 40):
        pwd_sum = (
            pwd_tp
            - oracle.pwd(groups["tdPerHour"] * (tp + dt), truth["skin"], cd)
            + oracle.pwd(groups["tdPerHour"] * dt, truth["skin"], cd)
        )
        dp = groups["dpPerPd"] * pwd_sum
        buildup_points.append({"dt": dt, "dp": dp, "pws": pwf_shut_in + dp})
    goldens["fixtures"]["buildup"] = {
        "reservoir": reservoir,
        "truth": truth,
        "tp": tp,
        "pwfShutIn": pwf_shut_in,
        "points": buildup_points,
    }

    # ---------------------------------------------------------------------
    # WT3: numerics extras (independent-route K0 integral, scaled I0e/I1e)
    goldens["besselExtra"] = [
        {
            "x": x,
            "k0Integral": oracle.besselk0_integral(x),
            "i0e": oracle.besseli0e(x),
            "i1e": oracle.besseli1e(x),
        }
        for x in [0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 8.0, 9.0, 10.0, 20.0, 50.0]
    ]

    # WT3: dimensionless pwD tables for the new radial models (storage and
    # skin exercised through the shared composition)
    radial_cases = [
        {"id": "homogeneous-sealing-fault", "skin": 2.0, "cd": 100.0,
         "boundary": {"type": "fault", "ld": 500.0}, "tDs": logspace(4, 9, 6)},
        {"id": "homogeneous-constant-pressure", "skin": 2.0, "cd": 100.0,
         "boundary": {"type": "constant-pressure", "ld": 500.0}, "tDs": logspace(4, 9, 6)},
        {"id": "homogeneous-channel", "skin": 0.0, "cd": 0.0,
         "boundary": {"type": "channel", "wd": 2000.0}, "tDs": logspace(5, 9, 5)},
        {"id": "homogeneous-closed-circle", "skin": 3.0, "cd": 100.0,
         "boundary": {"type": "closed-circle", "reD": 2000.0}, "tDs": logspace(4, 7.7, 6)},
        {"id": "dual-porosity-pss", "skin": 1.0, "cd": 50.0,
         "fissure": {"omega": 0.05, "lambda": 1e-7, "mode": "pss"}, "tDs": logspace(4, 10, 7)},
        {"id": "dual-porosity-slab", "skin": 1.0, "cd": 50.0,
         "fissure": {"omega": 0.05, "lambda": 1e-7, "mode": "transient-slab"}, "tDs": logspace(4, 10, 7)},
    ]
    goldens["radialModels"] = []
    for case in radial_cases:
        for t_d in case["tDs"]:
            goldens["radialModels"].append({
                "id": case["id"],
                "skin": case["skin"],
                "cd": case["cd"],
                "fissure": case.get("fissure"),
                "boundary": case.get("boundary"),
                "tD": t_d,
                "pwd": oracle.pwd_radial(
                    t_d, case["skin"], case["cd"],
                    fissure=case.get("fissure"), boundary=case.get("boundary"),
                ),
            })

    # WT3: uniform-flux / infinite-conductivity fracture, REAL-TIME closed
    # form (erf + E1) - a route fully independent of the JS Laplace/Stehfest
    # K0-integral implementation
    goldens["ufFractureTime"] = [
        {"xD": x_d, "tDxf": t, "pwd": oracle.uf_fracture_pwd_time(t, x_d)}
        for x_d in (0.0, 0.732)
        for t in logspace(-4, 4, 9)
    ]

    # WT3: finite-conductivity fracture (same discretization, integral-based F)
    goldens["fcFracture"] = [
        {"fcd": fcd, "tDxf": t, "pwd": oracle.fc_fracture_pwd(t, fcd)}
        for fcd in (1.0, 10.0, 100.0)
        for t in logspace(-5, 3, 5)
    ]

    # WT3: synthetic round-trip fixtures for the new model families
    fault_truth = {"k": 85.0, "skin": 3.0, "C": 0.01, "L": 800.0}
    fault_groups = oracle.dimensionless_groups(
        fault_truth["k"], reservoir["phi"], reservoir["mu"], reservoir["ct"],
        reservoir["rw"], reservoir["h"], reservoir["B"], reservoir["q"],
    )
    fault_points = []
    for t in logspace(-2, 3, 45):
        p_wd = oracle.pwd_radial(
            fault_groups["tdPerHour"] * t, fault_truth["skin"],
            fault_truth["C"] * fault_groups["cdPerBblPsi"],
            boundary={"type": "fault", "ld": fault_truth["L"] / reservoir["rw"]},
        )
        dp = fault_groups["dpPerPd"] * p_wd
        fault_points.append({"t": t, "dp": dp, "pwf": reservoir["pi"] - dp})
    goldens["fixtures"]["faultDrawdown"] = {
        "reservoir": reservoir, "truth": fault_truth, "points": fault_points,
    }

    frac_truth = {"k": 5.0, "xf": 250.0, "C": 0.002, "skin": 0.0}
    frac_groups = oracle.dimensionless_groups(
        frac_truth["k"], reservoir["phi"], reservoir["mu"], reservoir["ct"],
        reservoir["rw"], reservoir["h"], reservoir["B"], reservoir["q"],
    )
    frac_points = []
    for t in logspace(-3, 2.5, 45):
        p_wd = oracle.pwd_fracture_rw(
            frac_groups["tdPerHour"] * t, frac_truth["xf"] / reservoir["rw"],
            frac_truth["skin"], frac_truth["C"] * frac_groups["cdPerBblPsi"],
        )
        dp = frac_groups["dpPerPd"] * p_wd
        frac_points.append({"t": t, "dp": dp, "pwf": reservoir["pi"] - dp})
    goldens["fixtures"]["icFractureDrawdown"] = {
        "reservoir": reservoir, "truth": frac_truth, "points": frac_points,
    }

    dp_truth = {"k": 85.0, "skin": 2.0, "C": 0.01, "omega": 0.08, "lambda": 5e-7}
    dp_groups = oracle.dimensionless_groups(
        dp_truth["k"], reservoir["phi"], reservoir["mu"], reservoir["ct"],
        reservoir["rw"], reservoir["h"], reservoir["B"], reservoir["q"],
    )
    dp_points = []
    for t in logspace(-3, 3, 50):
        p_wd = oracle.pwd_radial(
            dp_groups["tdPerHour"] * t, dp_truth["skin"],
            dp_truth["C"] * dp_groups["cdPerBblPsi"],
            fissure={"omega": dp_truth["omega"], "lambda": dp_truth["lambda"], "mode": "pss"},
        )
        dp = dp_groups["dpPerPd"] * p_wd
        dp_points.append({"t": t, "dp": dp, "pwf": reservoir["pi"] - dp})
    goldens["fixtures"]["dualPorosityDrawdown"] = {
        "reservoir": reservoir, "truth": dp_truth, "points": dp_points,
    }

    # ---------------------------------------------------------------------
    # WT4: correlation-based pseudo-pressure by fine Simpson (independent of
    # the JS trapezoid-on-a-grid route) and deliverability least squares
    gas_gravity, temp_f = 0.65, 180.0
    goldens["gasPseudoPressure"] = {
        "gasGravity": gas_gravity,
        "tempF": temp_f,
        "values": [
            {"p": p, "m": oracle.pseudo_pressure(p, temp_f, gas_gravity)}
            for p in [500.0, 1000.0, 2000.0, 3000.0, 4000.0, 5000.0, 6000.0]
        ],
    }

    # Ahmed REH 4th ed. Example 8-2 test points (pressure-squared deltas)
    delivery_points = [
        (2624.6, 1952.0 ** 2 - 1700.0 ** 2),
        (4154.7, 1952.0 ** 2 - 1500.0 ** 2),
        (5425.1, 1952.0 ** 2 - 1300.0 ** 2),
    ]
    goldens["deliverabilityFits"] = {
        "points": [{"q": q, "delta": d} for q, d in delivery_points],
        "backPressure": oracle.back_pressure_fit(delivery_points),
        "lit": oracle.lit_fit(delivery_points),
    }

    return goldens


def main():
    goldens = build()
    path = os.path.normpath(OUT_PATH)
    with open(path, "w") as fh:
        json.dump(goldens, fh, indent=1)
        fh.write("\n")
    n_values = (
        len(goldens["bessel"]) + len(goldens["e1"]) + len(goldens["pwd"])
        + len(goldens["lineSource"])
        + sum(len(f["points"]) for f in goldens["fixtures"].values())
    )
    print(f"wrote {path} ({n_values} golden values)")


if __name__ == "__main__":
    main()
