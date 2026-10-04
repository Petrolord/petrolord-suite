"""SIM-U1 gate: the material balance read from the PRT, checked against the
simulator's own summary vectors of the same run. The cumulative table's
units are an observed convention of OPM Flow 2026.04 (gas headed MMSCF and
printed in 10^6 Mscf); this is the check that holds them, so a bump of the
pinned simulator that changes them fails here.

Runs SPE1CASE1 (ODbL, fixtures/spe1/ATTRIBUTION) with the fluid-in-place
report switched on (RPTSOL and RPTSCHED FIP; reporting only, no physics),
and the Model Builder's default deck, which asks for the report itself."""
import os
import shutil
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from resdata.summary import Summary  # noqa: E402

from simworker import prt, results, runner  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures")
flow_missing = shutil.which("flow") is None
pytestmark = pytest.mark.skipif(
    flow_missing, reason="flow binary not on PATH (run inside the worker image)")


def _spe1_with_fip(work):
    with open(os.path.join(FIX, "spe1", "SPE1CASE1.DATA")) as f:
        text = f.read()
    text = text.replace("\nSUMMARY", "\nRPTSOL\n 'FIP=1' /\n\nSUMMARY", 1)
    text = text.replace("'PRES' 'SGAS' 'RS' 'WELLS' /", "'PRES' 'SGAS' 'RS' 'WELLS' 'FIP=1' /", 1)
    assert "'FIP=1' /" in text
    with open(os.path.join(work, "SPE1FIP.DATA"), "w") as f:
        f.write(text)
    return "SPE1FIP.DATA"


def test_spe1_balance_matches_the_summary_vectors(tmp_path):
    work = str(tmp_path)
    main_rel = _spe1_with_fip(work)
    outcome = runner.run_flow(work, main_rel, lambda: False)
    assert outcome["exit_code"] == 0, outcome["stderr_tail"]

    diag = prt.parse_prt_file(results.find_prt(work))
    assert diag["active_cells"] == 300 and diag["complete"]
    mb = diag["material_balance"]
    assert mb["computed"] and mb["closes"], mb

    case = results.find_summary_case(os.path.join(work, "out"))
    s = Summary(case)
    wopt = float(s.numpy_vector("WOPT:PROD")[-1])
    wgpt = float(s.numpy_vector("WGPT:PROD")[-1])
    wgit = float(s.numpy_vector("WGIT:INJ")[-1])
    oil, gas = mb["phases"]["oil"], mb["phases"]["gas"]
    # the PRT table rounds to 0.1 MSTB and 0.1 x 10^6 Mscf
    assert abs(oil["produced"] - wopt) <= 50.0 + 1e-6
    assert abs(gas["produced"] - wgpt) <= 0.05e6 + 1e-6
    assert abs(gas["injected"] - wgit) <= 0.05e6 + 1e-6
    # and the balance closes against the summary vectors too
    assert abs((oil["originally_in_place"] - oil["currently_in_place"]) - wopt) / oil["originally_in_place"] < 1e-6
    net_gas = wgit - wgpt
    assert abs((gas["currently_in_place"] - gas["originally_in_place"]) - net_gas) / gas["originally_in_place"] < 1e-4


def test_builder_deck_reports_its_own_balance(tmp_path):
    work = str(tmp_path)
    shutil.copy(os.path.join(FIX, "generated", "BUILT.DATA"), os.path.join(work, "BUILT.DATA"))
    outcome = runner.run_flow(work, "BUILT.DATA", lambda: False)
    assert outcome["exit_code"] == 0, outcome["stderr_tail"]
    diag = prt.parse_prt_file(results.find_prt(work))
    mb = diag["material_balance"]
    assert diag["balance"]["reported"] and diag["cumulative"]["reported"]
    assert mb["computed"] and mb["closes"], mb
    case = results.find_summary_case(os.path.join(work, "out"))
    doc, _ = results.build_summary(case, "gate", "sha", diagnostics=diag)
    fopt = doc["field"]["FOPT"][-1]
    assert abs(mb["phases"]["oil"]["produced"] - fopt) <= 50.0 + 1.0
    fwit = doc["field"]["FWIT"][-1]
    assert abs(mb["phases"]["water"]["injected"] - fwit) <= 50.0 + 1.0
