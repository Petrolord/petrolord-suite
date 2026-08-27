"""Chaos checks from the S1 gate that need the real flow binary but no
Supabase: a broken deck fails with flow's actual error surfaced, the wall
clock kills a long run as 'timed_out', and a cancel lands as 'cancelled'.
(The queue-level requeue-after-worker-kill check is exercised on the VPS
deployment - see README 'Gate checks'.)"""
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from simworker import config, results, runner  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
flow_missing = shutil.which("flow") is None
pytestmark = pytest.mark.skipif(
    flow_missing, reason="flow binary not on PATH (run inside the worker image)")


def _stage_spe9(dest):
    for name in ("SPE9.DATA", "PERMVALUES.DATA", "TOPSVALUES.DATA"):
        shutil.copy(os.path.join(FIXTURES, "spe9", name), os.path.join(dest, name))


def test_broken_deck_fails_with_real_error(tmp_path):
    work = str(tmp_path)
    with open(os.path.join(work, "BROKEN.DATA"), "w") as f:
        f.write("RUNSPEC\nDIMENS\n 2 2 1 /\nTHISKEYWORDDOESNOTEXIST\nEND\n")
    outcome = runner.run_flow(work, "BROKEN.DATA", lambda: False)
    assert outcome["exit_code"] != 0
    assert not outcome["timed_out"] and not outcome["cancelled"]
    excerpt = results.prt_excerpt(work).decode(errors="replace")
    combined = (excerpt + outcome["stderr_tail"]).lower()
    assert "error" in combined  # flow's own words reach the user


def test_wall_clock_timeout_kills_flow(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "WALL_CLOCK_S", 3)
    work = str(tmp_path)
    _stage_spe9(work)
    outcome = runner.run_flow(work, "SPE9.DATA", lambda: False)
    assert outcome["timed_out"] is True
    assert outcome["cancelled"] is False
    assert outcome["exit_code"] != 0
    assert outcome["elapsed"] < 60  # SIGTERM/KILL actually worked


def test_cancel_kills_flow(tmp_path):
    work = str(tmp_path)
    _stage_spe9(work)
    outcome = runner.run_flow(work, "SPE9.DATA", lambda: True)
    assert outcome["cancelled"] is True
    assert outcome["timed_out"] is False
    assert outcome["elapsed"] < 60
