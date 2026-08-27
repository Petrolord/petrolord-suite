"""S4 gate: a Model Builder deck with structural TOPS (surface-sampled),
a deviated producer (trajectory COMPDAT connections) and an MBAL history
phase (WCONHIST/WCONINJH + DATES, then a prediction tail) passes the
worker's validation and runs in flow with the observed rates honoured.

The fixture is the deterministic output of the S4 builder test form —
regenerate with: GEN_SIM_FIXTURE=1 npx jest src/utils/__tests__/simS4Import.test.js
(repo root). A drift between fixture and builder fails jest, so this file
always tests what the app actually generates."""
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from simworker import deck, results, runner  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "generated",
                       "BUILT_S4.DATA")
flow_missing = shutil.which("flow") is None
pytestmark = pytest.mark.skipif(
    flow_missing, reason="flow binary not on PATH (run inside the worker image)")


def test_s4_deck_passes_worker_validation(tmp_path):
    shutil.copy(FIXTURE, os.path.join(str(tmp_path), "BUILT_S4.DATA"))
    deck.validate_bundle(str(tmp_path), "BUILT_S4.DATA")  # must not raise


def test_s4_deck_runs_history_then_prediction(tmp_path):
    work = str(tmp_path)
    shutil.copy(FIXTURE, os.path.join(work, "BUILT_S4.DATA"))
    outcome = runner.run_flow(work, "BUILT_S4.DATA", lambda: False)
    assert outcome["exit_code"] == 0, (
        f"flow rejected the S4 deck: {outcome['stderr_tail']}")

    case = results.find_summary_case(os.path.join(work, "out"))
    doc, blob = results.build_summary(case, "s4-gate", "sha")

    # 3 monthly history periods + 12 prediction reports.
    assert len(doc["days"]) >= 14
    # Observed-rate vectors made it through the whitelist.
    assert "FOPRH" in doc["field"]
    assert "WOPRH" in doc["wells"]["PROD1"]
    # WCONHIST honoured: the first history month produces ~2000 STB/d
    # and the observed vector reports exactly the input.
    assert abs(doc["field"]["FOPRH"][0] - 2000) < 1
    assert abs(doc["field"]["FOPR"][0] - 2000) < 20
    # The injector history is visible as field water injection.
    assert "FWIR" in doc["field"]
    assert abs(doc["field"]["FWIR"][0] - 2500) < 25
    # Prediction phase switches to the declared 4000 STB/d target (or its
    # BHP-limited reality) — the rate changes off the last observed value.
    assert doc["field"]["FOPR"][-1] != doc["field"]["FOPR"][0]
    # Pressure stays physical across history + prediction.
    assert 500 < doc["field"]["FPR"][-1] < 10000
