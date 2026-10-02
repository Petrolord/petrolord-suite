"""Results parsing against the checked-in opm-tests SPE1 flow reference
(SMSPEC/UNSMRY, ODbL — see fixtures/spe1/ATTRIBUTION)."""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simworker import results  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), "integration", "fixtures", "spe1")


def _case_dir(tmp_path):
    """resdata wants matching basenames; stage REF_* as SPE1CASE1.*"""
    out = tmp_path / "out"
    out.mkdir()
    shutil.copy(os.path.join(FIXTURES, "REF_SPE1CASE1.SMSPEC"), out / "SPE1CASE1.SMSPEC")
    shutil.copy(os.path.join(FIXTURES, "REF_SPE1CASE1.UNSMRY"), out / "SPE1CASE1.UNSMRY")
    return str(out)


def test_build_summary_from_reference(tmp_path):
    case = results.find_summary_case(_case_dir(tmp_path))
    doc, blob = results.build_summary(case, "flow test", "sha")
    assert doc["start_date"].startswith("2015-01-01")
    assert len(doc["days"]) > 50
    # SPE1's SUMMARY section requests FOPR and GOR only at field level.
    assert "FOPR" in doc["field"] and "FGOR" in doc["field"]
    assert len(doc["field"]["FOPR"]) == len(doc["days"])
    # SPE1 has PROD and INJ wells with BHP.
    assert "PROD" in doc["wells"] and "WBHP" in doc["wells"]["PROD"]
    assert "INJ" in doc["wells"]
    # Time axis is strictly increasing.
    days = doc["days"]
    assert all(b > a for a, b in zip(days, days[1:]))
    json.loads(blob)  # valid JSON


def test_step_counts_are_the_runs_own(tmp_path):
    """H13: SPE1 has 120 report steps written as 123 simulator time steps."""
    case = results.find_summary_case(_case_dir(tmp_path))
    doc, _ = results.build_summary(case, "flow test", "sha")
    assert doc["steps"] == {"report_steps": 120, "time_steps": 123, "stride": 1, "points": 123}
    assert len(doc["days"]) == 123
    assert results.stored_report_steps(doc) == 120


def test_thinning_does_not_change_the_step_counts(tmp_path, monkeypatch):
    """H13: with the series thinned, the counts stay the run's. The old code
    stored len(days) as report_steps (here 31, or 25 at a cap of 25)."""
    from simworker import config
    monkeypatch.setattr(config, "SUMMARY_MAX_POINTS", 40)
    case = results.find_summary_case(_case_dir(tmp_path))
    doc, _ = results.build_summary(case, "flow test", "sha")
    assert doc["steps"]["stride"] == 4            # ceil(123 / 40)
    assert len(doc["days"]) == 31                 # rows 0, 4, 8, ...
    assert doc["steps"]["points"] == 31
    assert doc["steps"]["time_steps"] == 123
    assert doc["steps"]["report_steps"] == 120
    # negative control: the stored number is not the plotted series length
    assert results.stored_report_steps(doc) == 120
    assert results.stored_report_steps(doc) != len(doc["days"])
    # the CSV holds the plotted points, as the SPA now says
    assert len(results.summary_csv(doc).decode().splitlines()) == 31 + 1


def test_stored_report_steps_falls_back_to_time_steps():
    doc = {"days": [0, 1], "steps": {"report_steps": None, "time_steps": 9000, "stride": 2, "points": 4500}}
    assert results.stored_report_steps(doc) == 9000


def test_summary_csv_round_trip(tmp_path):
    case = results.find_summary_case(_case_dir(tmp_path))
    doc, _ = results.build_summary(case, "flow test", "sha")
    csv_bytes = results.summary_csv(doc)
    lines = csv_bytes.decode().splitlines()
    assert lines[0].startswith("days,")
    assert "WBHP:PROD" in lines[0]
    assert len(lines) == len(doc["days"]) + 1


def test_missing_output_dir_raises(tmp_path):
    import pytest
    from simworker.errors import SimFailure
    with pytest.raises(SimFailure) as e:
        results.find_summary_case(str(tmp_path))
    assert e.value.stage == "output_missing"
