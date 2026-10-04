"""SIM-U1: the material balance and convergence the report prints come from
OPM Flow's own PRT. Fixtures are verbatim excerpts of PRT files OPM Flow
2026.04 wrote on 2026-10-04 (tests/fixtures/prt, the first line of each
says which run); the integration gate below runs flow and checks the same
reading against the summary vectors of the run."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simworker import main, prt, results  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "prt")


def _read(name):
    with open(os.path.join(FIX, name)) as f:
        return f.read()


def test_spe1_with_fip_report_closes_per_component():
    d = prt.parse_prt(_read("SPE1_FIP.PRT"))
    assert d["flow_version"] == "2026.04"
    assert d["active_cells"] == 300
    assert d["pore_volume"] == {"value": 534322820.0, "unit": "RB"}
    assert d["time_steps"] == 123
    assert d["newton_iterations"] == {"total": 313, "wasted": 0}
    assert d["linearizations"] == {"total": 436, "wasted": 0}
    assert d["linear_iterations"] == {"total": 442, "wasted": 0}
    assert d["messages"]["errors"] == 0 and d["messages"]["problems"] == 0
    assert d["chops"]["count"] == 0
    assert d["balance"]["initial"]["report_step"] == 0
    assert d["balance"]["final"]["report_step"] == 120
    assert d["balance"]["final"]["pav"] == 3726
    mb = d["material_balance"]
    assert mb["computed"] and mb["report_step"] == 120 and mb["closes"]
    oil, gas, water = mb["phases"]["oil"], mb["phases"]["gas"], mb["phases"]["water"]
    # 284,630,659 - 238,732,120 STB left the reservoir; the wells took 45,898.4 MSTB
    assert oil["originally_in_place"] == 284630659 and oil["currently_in_place"] == 238732120
    assert oil["produced"] == pytest.approx(45898400)
    assert oil["error"] == pytest.approx(139)
    assert abs(oil["relative_error"]) < 1e-6
    # gas: 365.0 injected, 355.0 produced, in units of 10^6 Mscf
    assert gas["injected"] == pytest.approx(365.0e6) and gas["produced"] == pytest.approx(355.0e6)
    assert gas["error"] == pytest.approx(-4848)
    assert gas["within_rounding"]
    assert water["error"] == 0


def test_gas_scale_discriminates():
    """Negative control: read the gas columns as 10^3 Mscf (the label's
    literal meaning) and the balance is off by nearly 10 million Mscf, 2.8
    percent of the gas in place; the parser's scale closes it."""
    saved = dict(prt._CUM_SCALE)
    try:
        prt._CUM_SCALE["MMSCF"] = ("MSCF", 1e3)
        mb = prt.parse_prt(_read("SPE1_FIP.PRT"))["material_balance"]
        assert not mb["phases"]["gas"]["closes"]
        assert abs(mb["phases"]["gas"]["relative_error"]) > 0.02
        assert not mb["closes"]
    finally:
        prt._CUM_SCALE.clear()
        prt._CUM_SCALE.update(saved)


def test_builder_deck_balance_with_water_injection():
    mb = prt.parse_prt(_read("BUILT_FIP.PRT"))["material_balance"]
    assert mb["computed"] and mb["closes"] and mb["report_step"] == 60
    water = mb["phases"]["water"]
    assert water["injected"] == pytest.approx(9131400)
    assert abs(water["relative_error"]) < 1e-5


def test_no_fip_report_says_why():
    d = prt.parse_prt(_read("SPE1_NOFIP.PRT"))
    assert d["balance"]["reported"] is False
    assert d["cumulative"]["reported"] is True
    assert d["material_balance"] == {"computed": False, "reason": "no_fip_report"}
    assert d["complete"] and d["time_steps"] == 123


def test_balance_without_well_totals_says_why():
    text = _read("SPE1_FIP.PRT").replace("CUMULATIVE PRODUCTION/INJECTION TOTALS", "CUMULATIVE (removed)")
    mb = prt.parse_prt(text)["material_balance"]
    assert mb == {"computed": False, "reason": "no_well_totals"}


def test_units_not_seen_on_a_run_are_not_guessed():
    text = _read("SPE1_FIP.PRT").replace("MSTB", "KSM3").replace("MMSCF", "MSM3") \
        .replace("OIL  STB", "OIL  SM3").replace("WAT    STB", "WAT    SM3").replace("GAS    MSCF", "GAS    SM3")
    mb = prt.parse_prt(text)["material_balance"]
    assert mb["computed"] is False and mb["reason"] == "units_not_verified"


def test_metric_balance_closes_per_component():
    """SIM-U2-015: a METRIC run (METRIC_BOX.DATA, OPM Flow 2026.04): balance
    sheet in SM3, cumulative table in MSCM and MMSCM."""
    d = prt.parse_prt(_read("METRIC_BOX.PRT"))
    assert d["pore_volume"] == {"value": 500000.0, "unit": "RM3"}
    mb = d["material_balance"]
    assert mb["computed"] and mb["closes"] and mb["report_step"] == 12
    oil, water, gas = mb["phases"]["oil"], mb["phases"]["water"], mb["phases"]["gas"]
    assert oil["unit"] == "SM3" and oil["originally_in_place"] == 335466 and oil["produced"] == pytest.approx(108000)
    assert water["injected"] == pytest.approx(126000)
    assert gas["produced"] == pytest.approx(6.5e6)
    assert oil["within_rounding"] and water["within_rounding"] and gas["within_rounding"]


def test_metric_gas_scale_discriminates():
    """Negative control: MMSCM read as 10^3 sm3 leaves the gas balance open."""
    saved = dict(prt._CUM_SCALE)
    try:
        prt._CUM_SCALE["MMSCM"] = ("SM3", 1e3)
        mb = prt.parse_prt(_read("METRIC_BOX.PRT"))["material_balance"]
        assert not mb["phases"]["gas"]["closes"] and not mb["closes"]
    finally:
        prt._CUM_SCALE.clear()
        prt._CUM_SCALE.update(saved)


def test_chopped_time_steps_are_counted_with_their_reason():
    d = prt.parse_prt(_read("SPE1_CHOPS.PRT"))
    assert d["chops"]["count"] == 30
    assert d["messages"]["problems"] == 30
    assert d["newton_iterations"] == {"total": 510, "wasted": 90}
    first = d["chops"]["listed"][0]
    assert first["to_days"] == pytest.approx(0.1)
    assert first["reason"] == "Solver convergence failure - Iteration limit reached"
    assert len(d["chops"]["listed"]) == prt.MAX_CHOPS_LISTED


def test_empty_or_missing_prt():
    assert prt.parse_prt("")["material_balance"]["reason"] == "no_prt"
    assert prt.parse_prt_file("/nonexistent/X.PRT")["material_balance"]["reason"] == "no_prt"
    d = prt.parse_prt("garbage\nlines\n")
    assert d["complete"] is False and d["time_steps"] is None


def test_summary_document_carries_the_diagnostics(tmp_path):
    import shutil
    out = tmp_path / "out"
    out.mkdir()
    ref = os.path.join(os.path.dirname(__file__), "integration", "fixtures", "spe1")
    shutil.copy(os.path.join(ref, "REF_SPE1CASE1.SMSPEC"), out / "SPE1CASE1.SMSPEC")
    shutil.copy(os.path.join(ref, "REF_SPE1CASE1.UNSMRY"), out / "SPE1CASE1.UNSMRY")
    shutil.copy(os.path.join(FIX, "SPE1_FIP.PRT"), out / "SPE1CASE1.PRT")
    assert results.find_prt(str(tmp_path)).endswith("SPE1CASE1.PRT")
    diag = prt.parse_prt_file(results.find_prt(str(tmp_path)))
    doc, _ = results.build_summary(results.find_summary_case(str(out)), "flow test", "sha",
                                   diagnostics=diag, run_meta={"worker_id": "w1", "attempt": 1})
    assert doc["diagnostics"]["schema"] == "prt-1"
    assert doc["diagnostics"]["material_balance"]["computed"] is True
    assert doc["run"] == {"worker_id": "w1", "attempt": 1}


def test_failed_run_keeps_exit_code_elapsed_and_cells(monkeypatch, tmp_path):
    """Bring-up defect (2026-08-29): a sim_failed run stored no exit code and
    no elapsed time. The failure now carries them, with the active cells."""
    writes = []
    monkeypatch.setattr(main.config, "SCRATCH_DIR", str(tmp_path))
    monkeypatch.setattr(main.supa, "update_run", lambda rid, f: writes.append(dict(f)))
    monkeypatch.setattr(main.supa, "heartbeat", lambda rid: None)
    monkeypatch.setattr(main.supa, "get_run", lambda rid: {})
    monkeypatch.setattr(main.supa, "storage_upload", lambda *a, **k: None)
    monkeypatch.setattr(main.deck, "download_bundle", lambda u, c, s: [("BAD.DATA", 10)])
    monkeypatch.setattr(main.deck, "validate_bundle", lambda s, m: None)
    monkeypatch.setattr(main.deck, "sha256_of", lambda p: "sha")
    monkeypatch.setattr(main, "_fetch_case", lambda cid: {"deck_path": "u/c/deck/BAD.DATA"})

    def fake_flow(scratch, main_rel, cancelled):
        os.makedirs(os.path.join(scratch, "out"), exist_ok=True)
        with open(os.path.join(scratch, "out", "BAD.PRT"), "w") as f:
            f.write("Total number of active cells: 300 / total pore volume: 534322820 RB\n"
                    "Error: Problem with keyword EQUIL\nError: Problem with keyword EQUIL\n")
        return {"exit_code": 1, "elapsed": 2.04, "timed_out": False, "cancelled": False,
                "stderr_tail": "Error: Problem with keyword EQUIL"}

    monkeypatch.setattr(main.runner, "run_flow", fake_flow)
    main.process_run({"id": "r1", "user_id": "u", "case_id": "c", "attempt": 1}, "2026.04")
    final = writes[-1]
    assert final["status"] == "failed" and final["failure_stage"] == "sim_failed"
    assert final["exit_code"] == 1
    assert final["elapsed_seconds"] == 2.0
    assert final["active_cells"] == 300
    assert final["log_path"].endswith("/prt_excerpt.txt")
    # the error text names the problem once, not once per copy
    assert final["error_message"].count("Problem with keyword EQUIL") == 1


def test_deck_unit_system_is_read_from_runspec(tmp_path):
    ref = os.path.join(os.path.dirname(__file__), "integration", "fixtures")
    assert results.deck_unit_system(os.path.join(ref, "spe1", "SPE1CASE1.DATA")) == "FIELD"
    deck = tmp_path / "M.DATA"
    deck.write_text("RUNSPEC\nOIL\nWATER\nMETRIC -- units\nGRID\nFIELD\n")
    assert results.deck_unit_system(str(deck)) == "METRIC"
    deck.write_text("RUNSPEC\nOIL\nGRID\nFIELD\n")   # after GRID: not a unit keyword
    assert results.deck_unit_system(str(deck)) is None
    assert results.deck_unit_system(str(tmp_path / "missing.DATA")) is None
