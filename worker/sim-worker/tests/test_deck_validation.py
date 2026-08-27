"""Deck validation unit tests: the deny-list and caps that gate every run."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from simworker import config, deck  # noqa: E402
from simworker.errors import SimFailure  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), "integration", "fixtures", "spe1")


def write(dirpath, name, text):
    path = os.path.join(dirpath, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)
    return path


MINIMAL = """RUNSPEC
DIMENS
 10 10 3 /
SCHEDULE
TSTEP
 10*30.4 /
END
"""


def test_minimal_deck_passes(tmp_path):
    write(tmp_path, "CASE.DATA", MINIMAL)
    deck.validate_bundle(str(tmp_path), "CASE.DATA")


def test_spe1_reference_deck_passes(tmp_path):
    with open(os.path.join(FIXTURES, "SPE1CASE1.DATA")) as f:
        write(tmp_path, "SPE1CASE1.DATA", f.read())
    deck.validate_bundle(str(tmp_path), "SPE1CASE1.DATA")


@pytest.mark.parametrize("keyword", ["PYACTION", "pyaction", "PYINPUT", "PATHS"])
def test_banned_keywords_rejected(tmp_path, keyword):
    write(tmp_path, "CASE.DATA", MINIMAL.replace("SCHEDULE", f"{keyword}\nSCHEDULE"))
    with pytest.raises(SimFailure) as e:
        deck.validate_bundle(str(tmp_path), "CASE.DATA")
    assert e.value.stage == "validate_failed"
    assert keyword.upper() in e.value.message


def test_banned_keyword_in_comment_is_fine(tmp_path):
    write(tmp_path, "CASE.DATA", "-- PYACTION is documented here\n" + MINIMAL)
    deck.validate_bundle(str(tmp_path), "CASE.DATA")


def test_include_traversal_rejected(tmp_path):
    write(tmp_path, "CASE.DATA", MINIMAL + "\nINCLUDE\n '../../etc/passwd' /\n")
    with pytest.raises(SimFailure) as e:
        deck.validate_bundle(str(tmp_path), "CASE.DATA")
    assert "escapes the deck bundle" in e.value.message


def test_absolute_include_rejected(tmp_path):
    write(tmp_path, "CASE.DATA", MINIMAL + "\nINCLUDE\n '/etc/passwd' /\n")
    with pytest.raises(SimFailure):
        deck.validate_bundle(str(tmp_path), "CASE.DATA")


def test_missing_include_rejected(tmp_path):
    write(tmp_path, "CASE.DATA", MINIMAL + "\nINCLUDE\n 'props.inc' /\n")
    with pytest.raises(SimFailure) as e:
        deck.validate_bundle(str(tmp_path), "CASE.DATA")
    assert "missing from the bundle" in e.value.message


def test_valid_relative_include_passes(tmp_path):
    write(tmp_path, "props/props.inc", "-- ok\n")
    write(tmp_path, "CASE.DATA", MINIMAL + "\nINCLUDE\n 'props/props.inc' /\n")
    deck.validate_bundle(str(tmp_path), "CASE.DATA")


def test_dimens_cap(tmp_path):
    big = MINIMAL.replace("10 10 3", "200 200 100")  # 4,000,000 cells
    write(tmp_path, "CASE.DATA", big)
    with pytest.raises(SimFailure) as e:
        deck.validate_bundle(str(tmp_path), "CASE.DATA")
    assert "cells" in e.value.message


def test_report_step_cap(tmp_path):
    many = MINIMAL.replace("10*30.4", f"{config.MAX_REPORT_STEPS + 1}*1.0")
    write(tmp_path, "CASE.DATA", many)
    with pytest.raises(SimFailure) as e:
        deck.validate_bundle(str(tmp_path), "CASE.DATA")
    assert "report steps" in e.value.message


def test_oversize_main_deck_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DECK_MAX_BYTES", 100)
    write(tmp_path, "CASE.DATA", MINIMAL + "-- padding " * 50)
    with pytest.raises(SimFailure):
        deck.validate_bundle(str(tmp_path), "CASE.DATA")
