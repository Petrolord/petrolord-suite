"""Regenerate the committed nodal goldens from the independent oracle.

Usage (from the repo root):
    python3 tools/validation/nodal/genfixtures.py

Writes src/utils/nodal/__tests__/goldens.json. Commit the result; the gate
runner (run-validation.mjs) and jest both consume the committed file so CI
never depends on Python.
"""

from __future__ import annotations

import json
import os

import oracle


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "../../../src/utils/nodal/__tests__/goldens.json"))

MODEL = {"api": 35.0, "gasSg": 0.75, "gor": 600.0, "salinityPpm": 30000.0}


def friction_cases():
    cases = []
    for re in [3.0e3 + 1.0e3, 1.0e4, 1.0e5, 1.0e6, 5.0e6]:
        for rr in [0.0, 1e-5, 1e-4, 6e-4, 2e-3]:
            cases.append({"re": re, "relRough": rr, "f": oracle.moody(re, rr)})
    for re in [500.0, 1500.0]:
        cases.append({"re": re, "relRough": 0.0, "f": oracle.moody(re, 0.0)})
    return cases


def pvt_cases():
    cases = []
    for p in [200.0, 500.0, 1000.0, 1500.0, 2000.0, 2350.0, 3000.0, 4000.0, 5000.0]:
        for t in [100.0, 150.0, 190.0]:
            cases.append({"p": p, "tF": t, "props": oracle.pvt_at(MODEL, p, t)})
    return cases


def ipr_cases():
    pr = 3200.0
    pb = 2400.0
    pwfs = [0.0, 400.0, 800.0, 1200.0, 1600.0, 2000.0, 2400.0, 2800.0, 3200.0]
    return {
        "composite": {
            "pr": pr, "pb": pb, "pi": 1.2,
            "points": [{"pwf": p, "q": oracle.composite_q(1.2, pr, pb, p)} for p in pwfs],
            "jFromTestBelowPb": oracle.composite_j_from_test(
                pr, pb, oracle.composite_q(1.2, pr, pb, 1500.0), 1500.0),
        },
        "fetkovich": {
            "pr": pr, "c": 2e-5, "n": 0.85,
            "points": [{"pwf": p, "q": oracle.fetkovich_q(2e-5, 0.85, pr, p)} for p in pwfs],
        },
        "jones": {
            "pr": pr, "a": 0.5, "b": 2e-4,
            "points": [{"pwf": p, "q": oracle.jones_q(0.5, 2e-4, pr, p)} for p in pwfs],
        },
        "vogel": {
            "pr": 2000.0, "qmax": 1000.0,
            "points": [{"pwf": p, "q": oracle.vogel_q(1000.0, 2000.0, p)}
                       for p in [0.0, 500.0, 1000.0, 1500.0, 2000.0]],
        },
    }


def trajectory_cases():
    # The sample well's deviated variant: KOP 2000 ft, 3 deg/100 ft build to
    # 30 degrees, tangent to shoe.
    survey = [
        {"md": 0.0, "inc": 0.0, "azi": 0.0},
        {"md": 2000.0, "inc": 0.0, "azi": 0.0},
        {"md": 3000.0, "inc": 30.0, "azi": 45.0},
        {"md": 8900.0, "inc": 30.0, "azi": 45.0},
    ]
    return {"survey": survey, "tvds": oracle.min_curvature_tvd(survey)}


def gas_ipr_cases():
    base = {"pr": 3000.0, "tempF": 200.0, "gasSg": 0.65,
            "k": 5.0, "h": 50.0, "re": 1490.0, "rw": 0.354, "skin": 2.0}
    pwfs = [0.0, 500.0, 1000.0, 1500.0, 2000.0, 2500.0]
    points = [{"pwf": p,
               "q": oracle.darcy_gas_q(base["pr"], p, base["tempF"], base["gasSg"],
                                        base["k"], base["h"], base["re"], base["rw"],
                                        base["skin"])} for p in pwfs]
    return {"base": base, "points": points,
            "mAtPr": oracle.pseudo_pressure(base["pr"], base["tempF"], base["gasSg"])}


def main():
    goldens = {
        "_source": "tools/validation/nodal/genfixtures.py (independent Python oracle)",
        "model": MODEL,
        "friction": friction_cases(),
        "pvt": pvt_cases(),
        "ipr": ipr_cases(),
        "trajectory": trajectory_cases(),
        "gasIpr": gas_ipr_cases(),
    }
    with open(OUT, "w") as fh:
        json.dump(goldens, fh, indent=1)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
