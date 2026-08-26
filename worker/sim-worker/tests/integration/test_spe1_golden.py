"""SPE1 golden gate (validation-first house rule).

Runs the real flow binary on the ODbL SPE1CASE1 deck through the worker's
own runner + results pipeline, then compares the parsed vectors against the
checked-in opm-tests flow reference at every report step.

Tolerances follow the opm-simulators spe1 regression settings
(abs_tol 2e-2, rel_tol 1e-3 — see opm-simulators CMakeLists spe1 entries),
loosened only for FPR/BHP absolute magnitude (psia-scale vectors compare on
relative error). The base image tag is pinned in the Dockerfile; a version
bump requires re-passing this gate (README procedure).

Needs the flow binary — run inside the worker image:
  docker compose run --rm --entrypoint python3 sim-worker -m pytest tests/integration
"""
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from simworker import results, runner  # noqa: E402
from resdata.summary import Summary  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "spe1")

ABS_TOL = 2e-2
REL_TOL = 1e-3
# Only vectors the deck's SUMMARY section actually writes (SPE1CASE1 requests
# FOPR/FGOR at field level; cumulatives exist per-well as WOPT/WGPT).
VECTORS = ["FOPR", "FGOR", "WBHP:PROD", "WBHP:INJ", "WOPT:PROD", "WGPT:PROD"]

flow_missing = shutil.which("flow") is None


@pytest.fixture(scope="module")
def spe1_run(tmp_path_factory):
    work = str(tmp_path_factory.mktemp("spe1run"))
    shutil.copy(os.path.join(FIXTURES, "SPE1CASE1.DATA"),
                os.path.join(work, "SPE1CASE1.DATA"))
    outcome = runner.run_flow(work, "SPE1CASE1.DATA", lambda: False)
    assert outcome["exit_code"] == 0, (
        f"flow failed (exit {outcome['exit_code']}): {outcome['stderr_tail']}")
    return work


@pytest.mark.skipif(flow_missing, reason="flow binary not on PATH (run inside the worker image)")
def test_spe1_matches_reference(spe1_run):
    sim = Summary(results.find_summary_case(os.path.join(spe1_run, "out")))
    ref = _reference_summary(spe1_run)

    sim_days = list(sim.numpy_vector("TIME"))
    ref_days = list(ref.numpy_vector("TIME"))
    assert len(sim_days) == len(ref_days), (
        f"report-step count differs: sim {len(sim_days)} vs ref {len(ref_days)}")

    failures = []
    for key in VECTORS:
        s = list(sim.numpy_vector(key))
        r = list(ref.numpy_vector(key))
        for i, (a, b) in enumerate(zip(s, r)):
            if abs(a - b) > max(ABS_TOL, REL_TOL * abs(b)):
                failures.append(f"{key}[{i}] sim={a:.6g} ref={b:.6g}")
                break
    assert not failures, "vectors out of tolerance: " + "; ".join(failures)

    # Cumulative production sanity: final producer WOPT within 0.1 % of ref.
    wopt_sim = list(sim.numpy_vector("WOPT:PROD"))[-1]
    wopt_ref = list(ref.numpy_vector("WOPT:PROD"))[-1]
    assert abs(wopt_sim - wopt_ref) <= 1e-3 * abs(wopt_ref)


@pytest.mark.skipif(flow_missing, reason="flow binary not on PATH (run inside the worker image)")
def test_spe1_summary_pipeline(spe1_run):
    case = results.find_summary_case(os.path.join(spe1_run, "out"))
    doc, blob = results.build_summary(case, "golden", "sha")
    assert "FOPR" in doc["field"]
    assert "PROD" in doc["wells"]
    assert len(blob) < 20 * 1024 * 1024


def _reference_summary(tmpdir):
    ref_dir = os.path.join(tmpdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    shutil.copy(os.path.join(FIXTURES, "REF_SPE1CASE1.SMSPEC"),
                os.path.join(ref_dir, "SPE1CASE1.SMSPEC"))
    shutil.copy(os.path.join(FIXTURES, "REF_SPE1CASE1.UNSMRY"),
                os.path.join(ref_dir, "SPE1CASE1.UNSMRY"))
    return Summary(os.path.join(ref_dir, "SPE1CASE1"))
