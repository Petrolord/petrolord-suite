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

from simworker import deck, results, runner  # noqa: E402

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
