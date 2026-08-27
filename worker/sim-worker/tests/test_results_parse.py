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
