"""Fluid U2 gate: the simulator keyword export of Fluid Systems Studio
(PVTO, PVDG and PVTW with comment lines, FLUID-U2-003) is read by the
simulator. The fixture is the Model Builder's default deck (BUILT.DATA)
with its three PVT keywords replaced by the Fluid Systems Studio export of
the same fluid, comment lines and all.

Regenerate with: GEN_SIM_FIXTURE=1 npx jest src/components/fluidstudio/__tests__/fluidSimExport.test.jsx
(repo root). A drift between the fixture and the export fails jest, so this
file always tests what the app actually exports."""
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from simworker import deck, results, runner  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "generated",
                       "FLUID_EXPORT.DATA")
flow_missing = shutil.which("flow") is None
pytestmark = pytest.mark.skipif(
    flow_missing, reason="flow binary not on PATH (run inside the worker image)")


def test_fluid_export_deck_passes_worker_validation(tmp_path):
    shutil.copy(FIXTURE, os.path.join(str(tmp_path), "FLUID_EXPORT.DATA"))
    deck.validate_bundle(str(tmp_path), "FLUID_EXPORT.DATA")  # must not raise


def test_fluid_export_deck_runs_like_the_builder_deck(tmp_path):
    work = str(tmp_path)
    shutil.copy(FIXTURE, os.path.join(work, "FLUID_EXPORT.DATA"))
    outcome = runner.run_flow(work, "FLUID_EXPORT.DATA", lambda: False)
    assert outcome["exit_code"] == 0, (
        f"flow rejected the Fluid Systems Studio PVT export: {outcome['stderr_tail']}")

    case = results.find_summary_case(os.path.join(work, "out"))
    doc, blob = results.build_summary(case, "fluid-export-gate", "sha")
    assert len(doc["days"]) > 50
    # the same producer target as the builder deck: 4000 STB/d
    assert abs(doc["field"]["FOPR"][0] - 4000) < 1
    # field pressure stays physical (psia)
    assert 500 < doc["field"]["FPR"][-1] < 10000
