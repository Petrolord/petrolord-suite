"""Reservoir Simulation Studio U2 gates: the decks the Model Builder writes
for the Step 2 items pass the worker's validation and run in OPM Flow, and
the simulator reads them as the app says it does. The fixtures are the
deterministic output of the builder (regenerate with
GEN_SIM_FIXTURE=1 npx jest src/components/simstudio/__tests__/simU2Decks.test.js
at the repo root; a drift between fixture and builder fails jest)."""
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from simworker import deck, prt, results, runner  # noqa: E402

GEN = os.path.join(os.path.dirname(__file__), "fixtures", "generated")
flow_missing = shutil.which("flow") is None
pytestmark = pytest.mark.skipif(
    flow_missing, reason="flow binary not on PATH (run inside the worker image)")


def run_fixture(tmp_path, name):
    work = str(tmp_path)
    shutil.copy(os.path.join(GEN, name), os.path.join(work, name))
    deck.validate_bundle(work, name)  # must not raise
    outcome = runner.run_flow(work, name, lambda: False)
    assert outcome["exit_code"] == 0, f"flow rejected {name}: {outcome['stderr_tail']}"
    case = results.find_summary_case(os.path.join(work, "out"))
    doc, _blob = results.build_summary(case, "u2-gate", "sha")
    return doc, work


# ---- SIM-U2-001: observed bottomhole pressure (WBHPH) ----------------------

# the observed BHP of each monthly period in the fixture (psia), by well; None
# where the period carried none (the CSV left it blank)
OBSERVED = {
    "PROD1": [3600, 3450, 3330, 3260, None, 3180],
    "INJ1": [4700, 4750, None, 4800, None, 4820],
}
PERIOD_ENDS = [31, 59, 90, 120, 151, 181]  # days from 2025-01-01


def period_of(day):
    for i, end in enumerate(PERIOD_ENDS):
        if day <= end + 1e-6:
            return i
    return None


def test_bhp_deck_reports_the_observed_pressure_as_wbhph(tmp_path):
    doc, _ = run_fixture(tmp_path, "BUILT_BHP.DATA")
    for well, obs in OBSERVED.items():
        entry = doc["wells"][well]
        assert "WBHPH" in entry, f"WBHPH missing for {well} (worker whitelist)"
        assert "WBHP" in entry
        matched = 0
        carried = 0
        for day, h in zip(doc["days"], entry["WBHPH"]):
            k = period_of(day)
            if k is None:
                continue  # prediction phase
            want = obs[k]
            if want is None:
                # a period with no observation: OPM Flow carries the last one
                # forward (so WBHPH alone cannot tell a repeat from an
                # observation; the app takes the observed periods from the
                # builder form and checks WBHPH against it)
                last = next(o for o in reversed(obs[:k]) if o is not None)
                assert abs(h - last) < 1e-6, f"{well} day {day}: WBHPH {h}, expected the carried {last}"
                carried += 1
            else:
                assert abs(h - want) < 1e-6, f"{well} day {day}: WBHPH {h} != {want}"
                matched += 1
        assert matched >= 4 and carried >= 1
    # the producers ran on their observed rates: WCONHIST is the control,
    # the pressure only an observation (the simulated BHP is not pinned to it)
    prod = doc["wells"]["PROD1"]
    assert abs(doc["field"]["FOPR"][0] - 2000) < 1
    assert any(abs(s - h) > 1 for s, h in zip(prod["WBHP"], prod["WBHPH"]) if h > 0)


def test_rate_only_history_has_no_wbhph(tmp_path):
    # negative control: the S4 history deck carries no pressure, so no WBHPH
    doc, _ = run_fixture(tmp_path, "BUILT_S4.DATA")
    assert all("WBHPH" not in e for e in doc["wells"].values())


# ---- SIM-U2-003: three-phase oil relative permeability --------------------

def _rel_diff(a, b):
    return max(abs(x - y) / max(abs(y), 1e-9) for x, y in zip(a, b))


def test_three_phase_models_run_and_change_the_physics(tmp_path):
    runs = {}
    for model, name in (("default", "BUILT_3PH_DEFAULT.DATA"),
                        ("stone1", "BUILT_3PH_STONE1.DATA"),
                        ("stone2", "BUILT_3PH_STONE2.DATA")):
        sub = tmp_path / model
        sub.mkdir()
        doc, work = run_fixture(sub, name)
        diag = prt.parse_prt_file(results.find_prt(work))
        assert diag["messages"]["errors"] == 0, f"{model}: the simulator printed errors"
        runs[model] = doc
    base = runs["default"]["field"]
    # all three phases flow at the producer: free gas (GOR above the
    # solution GOR) and water (water cut above zero)
    assert max(base["FGOR"]) > 1.2 * base["FGOR"][0]
    assert max(base["FWCT"]) > 0.01
    # the keyword reached the simulator: each Stone model changes the run
    for model in ("stone1", "stone2"):
        f = runs[model]["field"]
        n = min(len(f["FOPR"]), len(base["FOPR"]))
        d = max(_rel_diff(f["FOPR"][:n], base["FOPR"][:n]),
                _rel_diff(f["FGOR"][:n], base["FGOR"][:n]))
        print(model, "largest relative difference from the default", d)
        assert d > 1e-3, f"{model}: the run is the default run (largest relative difference {d})"
    # and the two Stone models differ from each other
    a, b = runs["stone1"]["field"], runs["stone2"]["field"]
    n = min(len(a["FOPR"]), len(b["FOPR"]))
    assert _rel_diff(a["FOPR"][:n], b["FOPR"][:n]) > 1e-4


# ---- SIM-U2-004: analytical aquifer ----------------------------------------
# The Dake (1978) Exercise 9.2 wedge aquifer (Ahmed REH Example 10-10) on a
# 10 x 10 x 1 tank. The comparison with the Material Balance engine's own
# influx on the run's pressure history is a jest gate on the summaries this
# image wrote (simAquiferValidation.test.js); here the simulator must accept
# the keywords, report the influx, and keep the Fetkovich aquifer's own
# balance in the deck's units.

DAKE_CT = 7e-6
DAKE_W = 211.9e6 / (7e-6 * 2740)


def test_fetkovich_aquifer_runs_and_balances_in_deck_units(tmp_path):
    doc, work = run_fixture(tmp_path, "BUILT_AQ_FETKOVICH.DATA")
    diag = prt.parse_prt_file(results.find_prt(work))
    assert diag["messages"]["errors"] == 0
    f = doc["field"]
    aq = doc["aquifers"]["1"]
    assert set(aq) == {"AAQP", "AAQT", "AAQR"}
    assert aq["AAQT"][-1] > 1e6 and all(b >= a - 1e-6 for a, b in zip(aq["AAQT"], aq["AAQT"][1:]))
    p0 = aq["AAQP"][0] + aq["AAQT"][0] / (DAKE_CT * DAKE_W)
    # p_aquifer = p0 - We / (ct W): V0 and ct were read in the units written
    for p, we in zip(aq["AAQP"], aq["AAQT"]):
        assert abs((p0 - we / (DAKE_CT * DAKE_W)) - p) < 0.05, (p, we)
    assert abs(p0 - 2740) < 30  # the equilibrium pressure at the datum
    # the rate integrates to the cumulative (each rate holds over its step)
    total, prev = 0.0, 0.0
    for d, r in zip(doc["days"], aq["AAQR"]):
        total += r * (d - prev)
        prev = d
    assert abs(total - aq["AAQT"][-1]) <= 1e-3 * aq["AAQT"][-1]
    # the aquifer holds the tank up: field pressure stays above the bubble point
    assert min(f["FPR"]) > 1500


def test_carter_tracy_aquifer_with_influence_table_runs(tmp_path):
    doc, work = run_fixture(tmp_path, "BUILT_AQ_CT.DATA")
    diag = prt.parse_prt_file(results.find_prt(work))
    assert diag["messages"]["errors"] == 0
    assert doc["aquifers"]["1"]["AAQT"][-1] > 1e6


# ---- SIM-U2-015: the material balance of a METRIC run ----------------------

METRIC_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "metric")


def test_metric_balance_is_computed_and_matches_the_summary(tmp_path):
    work = str(tmp_path)
    shutil.copy(os.path.join(METRIC_DIR, "METRIC_BOX.DATA"), os.path.join(work, "METRIC_BOX.DATA"))
    deck.validate_bundle(work, "METRIC_BOX.DATA")
    outcome = runner.run_flow(work, "METRIC_BOX.DATA", lambda: False)
    assert outcome["exit_code"] == 0, outcome["stderr_tail"]
    diag = prt.parse_prt_file(results.find_prt(work))
    case = results.find_summary_case(os.path.join(work, "out"))
    doc, _ = results.build_summary(case, "u2-gate", "sha", diagnostics=diag,
                                   unit_system=results.deck_unit_system(os.path.join(work, "METRIC_BOX.DATA")))
    assert doc["unit_system"] == "METRIC"
    mb = diag["material_balance"]
    assert mb["computed"], mb
    assert mb["closes"]
    f = doc["field"]
    ph = mb["phases"]
    # the cumulative table, scaled, against the run's own summary vectors
    # (sm3): within the rounding of the printed table
    assert abs(ph["oil"]["produced"] - f["FOPT"][-1]) <= 0.05e3 + 1
    assert abs(ph["water"]["injected"] - f["FWIT"][-1]) <= 0.05e3 + 1
    assert abs(ph["water"]["produced"] - f["FWPT"][-1]) <= 0.05e3 + 1
    # the gas column's scale (MMSCM = 10^6 sm3) against FGPT
    assert abs(ph["gas"]["produced"] - f["FGPT"][-1]) <= 0.05e6 + 1
