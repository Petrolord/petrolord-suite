"""SCAL U2 gate: the simulator keyword export of SCAL Studio (SWOF and SGOF
with comment lines and the Leverett J capillary pressure in the Pcow
column, SCAL-U2-001) is read by the simulator. The fixture is the Model
Builder's default deck (BUILT.DATA) with its SWOF and SGOF replaced by the
SCAL Studio export of the studio's opening curves, Pc on.

Regenerate with: GEN_SIM_FIXTURE=1 npx jest src/components/scalstudio/__tests__/scalSimKeywords.test.js
(repo root). A drift between the fixture and the export fails jest, so this
file always tests what the app actually exports."""
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from simworker import deck, results, runner  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "generated",
                       "SCAL_EXPORT.DATA")
flow_missing = shutil.which("flow") is None
pytestmark = pytest.mark.skipif(
    flow_missing, reason="flow binary not on PATH (run inside the worker image)")


def test_scal_export_deck_passes_worker_validation(tmp_path):
    shutil.copy(FIXTURE, os.path.join(str(tmp_path), "SCAL_EXPORT.DATA"))
    deck.validate_bundle(str(tmp_path), "SCAL_EXPORT.DATA")  # must not raise


def test_scal_export_deck_runs(tmp_path):
    work = str(tmp_path)
    shutil.copy(FIXTURE, os.path.join(work, "SCAL_EXPORT.DATA"))
    outcome = runner.run_flow(work, "SCAL_EXPORT.DATA", lambda: False)
    assert outcome["exit_code"] == 0, (
        f"flow rejected the SCAL Studio SWOF/SGOF export: {outcome['stderr_tail']}")

    case = results.find_summary_case(os.path.join(work, "out"))
    doc, blob = results.build_summary(case, "scal-export-gate", "sha")
    assert len(doc["days"]) > 50
    # the same producer target as the builder deck: 4000 STB/d
    assert abs(doc["field"]["FOPR"][0] - 4000) < 1
    # field pressure stays physical (psia)
    assert 500 < doc["field"]["FPR"][-1] < 10000
