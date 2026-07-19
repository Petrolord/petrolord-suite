"""Regenerate the committed PR78 goldens from the independent oracle (FS2).

    python3 tools/validation/fluidstudio/genfixtures.py
    # writes src/utils/fluidstudio/eos/__tests__/goldens.json

The BIP table below is a deliberate second transcription of Monograph 20
Table 4-2: the JS gate asserts buildBipMatrix() reproduces `bipMatrix`
exactly, so a typo on either side fails loudly. Component constants are
NOT re-transcribed - the oracle reads componentReference.json.
"""

from __future__ import annotations

import json
import os

import oracle

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(
    HERE, "..", "..", "..",
    "src", "utils", "fluidstudio", "eos", "__tests__", "goldens.json",
)

ORDER = ["N2", "CO2", "H2S", "C1", "C2", "C3", "iC4", "nC4", "iC5", "nC5", "nC6"]

# Whitson & Brule Monograph 20 Table 4-2 (non-HC pairs), HC-HC zero.
BIP_PAIRS = {
    ("N2", "CO2"): 0.0, ("N2", "H2S"): 0.130, ("N2", "C1"): 0.025,
    ("N2", "C2"): 0.010, ("N2", "C3"): 0.090, ("N2", "iC4"): 0.095,
    ("N2", "nC4"): 0.095, ("N2", "iC5"): 0.100, ("N2", "nC5"): 0.100,
    ("N2", "nC6"): 0.100,
    ("CO2", "H2S"): 0.135, ("CO2", "C1"): 0.105, ("CO2", "C2"): 0.130,
    ("CO2", "C3"): 0.125, ("CO2", "iC4"): 0.120, ("CO2", "nC4"): 0.115,
    ("CO2", "iC5"): 0.115, ("CO2", "nC5"): 0.115, ("CO2", "nC6"): 0.115,
    ("H2S", "C1"): 0.070, ("H2S", "C2"): 0.085, ("H2S", "C3"): 0.080,
    ("H2S", "iC4"): 0.075, ("H2S", "nC4"): 0.075, ("H2S", "iC5"): 0.070,
    ("H2S", "nC5"): 0.070, ("H2S", "nC6"): 0.055,
}


def bip_matrix(keys: list[str]) -> list[list[float]]:
    def kij(a: str, b: str) -> float:
        if a == b:
            return 0.0
        return BIP_PAIRS.get((a, b), BIP_PAIRS.get((b, a), 0.0))
    return [[kij(a, b) for b in keys] for a in keys]


MIXTURES = [
    {
        "name": "lean-gas",
        "keys": ["N2", "CO2", "C1", "C2", "C3"],
        "x": [0.02, 0.02, 0.85, 0.07, 0.04],
    },
    {
        "name": "binary-c1nc4",
        "keys": ["C1", "nC4"],
        "x": [0.35, 0.65],
    },
    {
        "name": "full-11",
        "keys": ORDER,
        "x": [0.003, 0.012, 0.005, 0.62, 0.09, 0.055, 0.016, 0.03, 0.013, 0.017, 0.139],
    },
]

T_F = [60.0, 150.0, 250.0]
P_PSIA = [14.696, 500.0, 2000.0, 5000.0]
# extra points chosen to land in the three-root window (root-selection gate)
EXTRA = {"binary-c1nc4": [(100.0, 60.0), (100.0, 100.0), (100.0, 200.0)]}

PSAT_TR = [0.60, 0.70, 0.85, 0.95]


def main() -> None:
    out = {
        "_generator": "tools/validation/fluidstudio/genfixtures.py (independent Python oracle)",
        "bipKeys": ORDER,
        "bipMatrix": bip_matrix(ORDER),
        "mixtures": [],
        "flash": [],
        "purePsat": [],
    }

    for m in MIXTURES:
        comps = [oracle.COMPONENTS[k] for k in m["keys"]]
        bip = bip_matrix(m["keys"])
        conds = [(t, p) for t in T_F for p in P_PSIA] + EXTRA.get(m["name"], [])
        states = []
        for t_f, p in conds:
            t_r = t_f + 459.67
            st = oracle.phase_state(comps, bip, m["x"], t_r, p)
            states.append({
                "tF": t_f,
                "pPsia": p,
                "roots": st["roots"],
                "z": st["z"],
                "lnPhi": st["lnPhi"],
                "molarVolume": st["molarVolume"],
                "density": st["density"],
            })
            print(f"{m['name']:14s} {t_f:6.1f} F {p:8.1f} psia  "
                  f"roots={len(st['roots'])}  z={st['z']:.6f}")
        out["mixtures"].append({**m, "states": states})

    for m in MIXTURES:
        comps = [oracle.COMPONENTS[k] for k in m["keys"]]
        bip = bip_matrix(m["keys"])
        conds = [(t, p) for t in T_F for p in P_PSIA] + EXTRA.get(m["name"], [])
        flashes = []
        for t_f, p in conds:
            t_r = t_f + 459.67
            res = oracle.flash_plain(comps, bip, m["x"], t_r, p)
            entry = {"tF": t_f, "pPsia": p, **res}
            if res["phases"] == 2:
                seal = oracle.flash_verify(comps, bip, res, t_r, p)
                if seal > 1e-6:
                    raise RuntimeError(
                        f"quadrature fugacity seal failed: {m['name']} {t_f}F/{p}psia -> {seal}")
                entry["fugacitySeal"] = seal
            flashes.append(entry)
            print(f"flash {m['name']:14s} {t_f:6.1f} F {p:8.1f} psia  "
                  f"phases={res['phases']}"
                  + (f"  beta={res['beta']:.6f}" if res["phases"] == 2 else ""))
        out["flash"].append({"name": m["name"], "keys": m["keys"], "x": m["x"], "states": flashes})

    for key in ORDER:
        comp = oracle.COMPONENTS[key]
        for tr in PSAT_TR:
            t_r = tr * comp["tcR"]
            psat = oracle.pure_psat_maxwell(comp, t_r)
            if psat is None:
                raise RuntimeError(f"Maxwell Psat failed for {key} at Tr={tr}")
            out["purePsat"].append({"key": key, "tR": t_r, "psatPsia": psat})
            print(f"psat {key:4s} Tr={tr:.2f}  {psat:.6f} psia")

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(f"\nwrote {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
