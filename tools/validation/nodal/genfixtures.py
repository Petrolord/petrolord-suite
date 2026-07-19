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


def gradient_cases():
    """NA2: correlation gradients over synthetic in-situ bundles.

    Synthetic flows keep the gate on the correlation algebra itself
    (transcribed twice); PVT coupling is gated separately by the traverse
    cases. Matrix spans all four B&B patterns plus downhill and the
    single-phase guards.
    """
    bundles = []
    for vsl, vsg in [(0.05, 0.6), (0.5, 4.5), (3.0, 5.0), (2.0, 30.0),
                     (6.0, 1.0), (0.2, 15.0), (4.0, 0.0), (0.0, 25.0)]:
        vm = vsl + vsg
        lam = vsl / vm if vm > 0 else 1.0
        rho_l, rho_g, mu_l, mu_g, sigma = 47.0, 5.0, 1.2, 0.015, 25.0
        bundles.append({
            "vsl": vsl, "vsg": vsg, "vm": vm, "lambdaL": lam,
            "rhoL": rho_l, "muL": mu_l, "sigmaL": sigma,
            "rhoNs": rho_l * lam + rho_g * (1.0 - lam),
            "muNs": mu_l * lam + mu_g * (1.0 - lam),
        })

    cases = []
    glrs = [800.0, 2000.0, 4000.0]
    for bi, flows in enumerate(bundles):
        glr = glrs[bi % 3]
        for theta in [90.0, 60.0, 0.0, -45.0]:
            for corr in ["noSlip", "beggsBrill", "hagedornBrown", "gray", "fancherBrown"]:
                if corr == "noSlip":
                    g = oracle.no_slip_gradient(2000.0, theta, 2.441, 0.00024, flows)
                elif corr == "beggsBrill":
                    g = oracle.bb_gradient(2000.0, theta, 2.441, 0.00024, flows, 5.0, 0.015)
                elif corr == "hagedornBrown":
                    g = oracle.hb_gradient(2000.0, theta, 2.441, 0.00024, flows, 5.0, 0.015)
                elif corr == "gray":
                    g = oracle.gray_gradient(theta, 2.441, 0.00024, flows, 5.0, 0.015)
                else:
                    g = oracle.fb_gradient(theta, 2.441, flows, glr)
                cases.append({
                    "flows": flows, "thetaDeg": theta, "p": 2000.0,
                    "dIn": 2.441, "rough": 0.00024, "correlation": corr,
                    "glr": glr, "out": g,
                })
    return cases


def traverse_cases():
    """NA2: full-stack BHP-from-WHP by the oracle's RK4 route (5 ft steps)."""
    deviated = [
        {"md": 0.0, "inc": 0.0, "azi": 0.0},
        {"md": 2000.0, "inc": 0.0, "azi": 0.0},
        {"md": 3000.0, "inc": 30.0, "azi": 45.0},
        {"md": 8900.0, "inc": 30.0, "azi": 45.0},
    ]
    dev_tvd_max = oracle.min_curvature_tvd(deviated)[-1]
    cases = [
        {"label": "vertical BB producer",
         "rates": {"qo": 800.0, "wct": 0.2, "gor": 600.0},
         "whp": 250.0, "nodeMd": 8000.0, "whtF": 100.0, "bhtF": 180.0,
         "tvdMax": 8000.0, "idIn": 2.441, "roughnessIn": 0.0006,
         "correlation": "beggsBrill", "survey": None},
        {"label": "vertical BB high-GLR",
         "rates": {"qo": 300.0, "wct": 0.5, "gor": 1200.0},
         "whp": 120.0, "nodeMd": 8000.0, "whtF": 100.0, "bhtF": 180.0,
         "tvdMax": 8000.0, "idIn": 1.995, "roughnessIn": 0.0006,
         "correlation": "beggsBrill", "survey": None},
        {"label": "vertical no-slip producer",
         "rates": {"qo": 800.0, "wct": 0.2, "gor": 600.0},
         "whp": 250.0, "nodeMd": 8000.0, "whtF": 100.0, "bhtF": 180.0,
         "tvdMax": 8000.0, "idIn": 2.441, "roughnessIn": 0.0006,
         "correlation": "noSlip", "survey": None},
        {"label": "vertical static column",
         "rates": {"qo": 0.0, "wct": 0.0, "gor": 600.0},
         "whp": 500.0, "nodeMd": 8000.0, "whtF": 100.0, "bhtF": 180.0,
         "tvdMax": 8000.0, "idIn": 2.441, "roughnessIn": 0.0006,
         "correlation": "noSlip", "survey": None},
        {"label": "deviated BB producer",
         "rates": {"qo": 1200.0, "wct": 0.35, "gor": 800.0},
         "whp": 300.0, "nodeMd": 8900.0, "whtF": 95.0, "bhtF": 175.0,
         "tvdMax": dev_tvd_max, "idIn": 2.992, "roughnessIn": 0.0006,
         "correlation": "beggsBrill", "survey": deviated},
        {"label": "vertical mHB producer",
         "rates": {"qo": 800.0, "wct": 0.2, "gor": 600.0},
         "whp": 250.0, "nodeMd": 8000.0, "whtF": 100.0, "bhtF": 180.0,
         "tvdMax": 8000.0, "idIn": 2.441, "roughnessIn": 0.0006,
         "correlation": "hagedornBrown", "survey": None},
        {"label": "vertical mHB low-rate large-tubing",
         "rates": {"qo": 250.0, "wct": 0.1, "gor": 400.0},
         "whp": 150.0, "nodeMd": 7000.0, "whtF": 95.0, "bhtF": 170.0,
         "tvdMax": 7000.0, "idIn": 3.958, "roughnessIn": 0.0006,
         "correlation": "hagedornBrown", "survey": None},
        {"label": "vertical Gray wet-gas well",
         "rates": {"qgMscfd": 5000.0, "wgr": 4.0, "cgr": 20.0},
         "whp": 900.0, "nodeMd": 9000.0, "whtF": 90.0, "bhtF": 200.0,
         "tvdMax": 9000.0, "idIn": 2.441, "roughnessIn": 0.0006,
         "correlation": "gray", "survey": None},
        {"label": "vertical Fancher-Brown screening",
         "rates": {"qo": 350.0, "wct": 0.1, "gor": 900.0},
         "whp": 200.0, "nodeMd": 6500.0, "whtF": 95.0, "bhtF": 165.0,
         "tvdMax": 6500.0, "idIn": 2.441, "roughnessIn": 0.0006,
         "correlation": "fancherBrown", "survey": None},
    ]
    for c in cases:
        c["bhp"] = oracle.traverse_rk4(
            MODEL, c["rates"], c["whp"], c["nodeMd"], c["whtF"], c["bhtF"],
            c["tvdMax"], c["idIn"], c["roughnessIn"], c["correlation"],
            survey=c["survey"], step_ft=5.0)
    return cases


def cullender_smith_cases():
    """NA2: C-S two-step+Simpson vs the oracle's RK4 ODE route."""
    cases = [
        {"label": "static 10k ft", "ptf": 2000.0, "gasSg": 0.75, "mdFt": 10000.0,
         "tvdFt": 10000.0, "whtF": 80.0, "bhtF": 220.0, "qMmscfd": 0.0,
         "idIn": 2.441, "roughnessIn": 0.0006},
        {"label": "flowing 10k ft", "ptf": 2000.0, "gasSg": 0.75, "mdFt": 10000.0,
         "tvdFt": 10000.0, "whtF": 80.0, "bhtF": 220.0, "qMmscfd": 4.915,
         "idIn": 2.441, "roughnessIn": 0.0006},
        {"label": "flowing lean shallow", "ptf": 800.0, "gasSg": 0.6, "mdFt": 6000.0,
         "tvdFt": 6000.0, "whtF": 70.0, "bhtF": 160.0, "qMmscfd": 2.0,
         "idIn": 1.995, "roughnessIn": 0.0006},
        {"label": "flowing deviated", "ptf": 1500.0, "gasSg": 0.7, "mdFt": 12000.0,
         "tvdFt": 9500.0, "whtF": 85.0, "bhtF": 210.0, "qMmscfd": 8.0,
         "idIn": 2.992, "roughnessIn": 0.0006},
        {"label": "high rate friction-heavy", "ptf": 3000.0, "gasSg": 0.65,
         "mdFt": 11000.0, "tvdFt": 11000.0, "whtF": 90.0, "bhtF": 230.0,
         "qMmscfd": 20.0, "idIn": 2.441, "roughnessIn": 0.0006},
    ]
    for c in cases:
        c["pwf"] = oracle.cs_ode_bhp(
            c["ptf"], c["gasSg"], c["mdFt"], c["tvdFt"], c["whtF"], c["bhtF"],
            c["qMmscfd"], c["idIn"], c["roughnessIn"])
    return cases


def operating_point_cases():
    """NA3: full-stack node solves by the oracle bisection + RK4 route."""
    ipr = {"pr": 3200.0, "pb": 2400.0, "pi": 1.2}
    base_vlp = {
        "rates": {"wct": 0.2, "gor": 600.0}, "whp": 250.0, "nodeMd": 8000.0,
        "whtF": 100.0, "bhtF": 180.0, "tvdMax": 8000.0, "idIn": 2.441,
        "roughnessIn": 0.0006, "correlation": "beggsBrill", "survey": None,
    }
    oil_cases = []
    for whp in [150.0, 250.0, 400.0]:
        vlp = dict(base_vlp)
        vlp["whp"] = whp
        op = oracle.solve_op_oil(MODEL, ipr, vlp)
        oil_cases.append({"label": f"oil whp {int(whp)}", "ipr": ipr, "vlp": vlp, "op": op})
    vlp_id = dict(base_vlp)
    vlp_id["idIn"] = 2.992
    op = oracle.solve_op_oil(MODEL, ipr, vlp_id)
    oil_cases.append({"label": "oil 3.5in tubing", "ipr": ipr, "vlp": vlp_id, "op": op})

    gas_ipr = {"pr": 3000.0, "c": 0.01, "n": 0.9}
    cs = {"ptf": 800.0, "gasSg": 0.75, "mdFt": 8000.0, "whtF": 90.0,
          "bhtF": 190.0, "idIn": 2.441, "roughnessIn": 0.0006}
    gas_case = {"label": "gas CS node", "ipr": gas_ipr, "cs": cs,
                "op": oracle.solve_op_gas(gas_ipr, cs)}

    return {"oil": oil_cases, "gas": gas_case}


def gas_lift_cases():
    """NA3: screening response by the oracle route (dead natural well)."""
    ipr = {"pr": 2600.0, "pb": 1800.0, "pi": 2.5}
    vlp = {
        "rates": {"wct": 0.7, "gor": 150.0}, "whp": 150.0, "nodeMd": 7000.0,
        "whtF": 100.0, "bhtF": 170.0, "tvdMax": 7000.0, "idIn": 2.441,
        "roughnessIn": 0.0006, "correlation": "beggsBrill",
    }
    lift_model = {"api": 32.0, "gasSg": 0.75, "gor": 150.0, "salinityPpm": 30000.0}
    qgis = [0.0, 200.0, 600.0, 1200.0, 1600.0]
    return {"model": lift_model, "ipr": ipr, "vlp": vlp,
            "response": oracle.gas_lift_response(lift_model, ipr, vlp, qgis)}


def choke_cases():
    """NA3: choke closed forms transcribed twice (equality gates)."""
    whp = []
    for corr in oracle.CHOKE_COEFFS:
        for q, glr, s64 in [(400.0, 800.0, 12.0), (1200.0, 300.0, 24.0), (150.0, 2500.0, 8.0)]:
            whp.append({"correlation": corr, "q": q, "glr": glr, "s64": s64,
                        "pwh": oracle.choke_whp(q, glr, s64, corr),
                        "size": oracle.choke_size(oracle.choke_whp(q, glr, s64, corr), q, glr, corr)})
    gas = []
    for case in [
        {"pUp": 800.0, "pDn": 200.0, "dIn": 1.0, "gasSg": 0.6, "tUpF": 75.0, "k": 1.3, "cd": 0.62},
        {"pUp": 100.0, "pDn": 80.0, "dIn": 1.5, "gasSg": 0.65, "tUpF": 70.0, "k": 1.25, "cd": 1.2},
        {"pUp": 2500.0, "pDn": 2300.0, "dIn": 0.5, "gasSg": 0.7, "tUpF": 120.0, "k": 1.28, "cd": 0.85},
        {"pUp": 1500.0, "pDn": 400.0, "dIn": 0.75, "gasSg": 0.8, "tUpF": 95.0, "k": 1.32, "cd": 0.9},
    ]:
        gas.append({**case, "out": oracle.gas_choke_rate(
            case["pUp"], case["pDn"], case["dIn"], case["gasSg"], case["tUpF"],
            case["k"], case["cd"])})
    upstream = []
    for case in [
        {"qMscfd": 5000.0, "pDn": 300.0, "dIn": 0.5, "gasSg": 0.75, "tUpF": 110.0, "k": 1.3, "cd": 0.99},
        {"qMscfd": 2500.0, "pDn": 300.0, "dIn": 0.5, "gasSg": 0.75, "tUpF": 110.0, "k": 1.3, "cd": 0.99},
    ]:
        upstream.append({**case, "out": oracle.gas_choke_upstream(
            case["qMscfd"], case["pDn"], case["dIn"], case["gasSg"], case["tUpF"],
            case["k"], case["cd"])})
    return {"whp": whp, "gas": gas, "upstream": upstream}


def main():
    goldens = {
        "_source": "tools/validation/nodal/genfixtures.py (independent Python oracle)",
        "model": MODEL,
        "friction": friction_cases(),
        "pvt": pvt_cases(),
        "ipr": ipr_cases(),
        "trajectory": trajectory_cases(),
        "gasIpr": gas_ipr_cases(),
        "gradients": gradient_cases(),
        "traverse": traverse_cases(),
        "cullenderSmith": cullender_smith_cases(),
        "operatingPoint": operating_point_cases(),
        "gasLift": gas_lift_cases(),
        "chokes": choke_cases(),
    }
    with open(OUT, "w") as fh:
        json.dump(goldens, fh, indent=1)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
