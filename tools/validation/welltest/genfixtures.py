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
