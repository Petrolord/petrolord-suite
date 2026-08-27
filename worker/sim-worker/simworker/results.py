"""Parse flow's Eclipse binary summary output (SMSPEC/UNSMRY, via resdata)
into the capped summary.json/summary.csv the SPA charts, plus an honest PRT
excerpt for the log viewer."""
import csv
import glob
import io
import json
import os
import re

from resdata.summary import Summary

from . import config
from .errors import SimFailure


def find_summary_case(out_dir):
    smspecs = sorted(glob.glob(os.path.join(out_dir, "*.SMSPEC")))
    if not smspecs:
        raise SimFailure("output_missing",
                         "The simulator exited without writing summary output "
                         "(no SMSPEC file). See the PRT excerpt for why.")
    return os.path.splitext(smspecs[0])[0]


def _downsample(values, stride):
    return values[::stride] if stride > 1 else values


def build_summary(case_path, opm_version, deck_sha256):
    try:
        summary = Summary(case_path)
    except Exception as e:
        raise SimFailure("parse_failed", f"Could not read the summary output: {e}")

    try:
        days = [float(v) for v in summary.numpy_vector("TIME")]
    except Exception as e:
        raise SimFailure("parse_failed", f"Summary has no TIME vector: {e}")

    n = len(days)
    stride = max(1, -(-n // config.SUMMARY_MAX_POINTS))  # ceil division

    def vec(key):
        try:
            if not summary.has_key(key):
                return None
            return [round(float(v), 6) for v in
                    _downsample(list(summary.numpy_vector(key)), stride)]
        except Exception:
            return None

    field = {}
    for key in config.FIELD_VECTORS:
        values = vec(key)
        if values is not None:
            field[key] = values

    wells = {}
    for well in list(summary.wells())[: config.SUMMARY_MAX_WELLS]:
        entry = {}
        for base in config.WELL_VECTORS:
            values = vec(f"{base}:{well}")
            if values is not None:
                entry[base] = values
        if entry:
            wells[well] = entry

    doc = {
        "opm_version": opm_version,
        "deck_sha256": deck_sha256,
        "start_date": summary.start_date.isoformat(),
        "days": _downsample([round(d, 4) for d in days], stride),
        "field": field,
        "wells": wells,
    }
    blob = json.dumps(doc).encode("utf-8")
    if len(blob) > config.SUMMARY_MAX_BYTES:
        raise SimFailure("output_too_large",
                         f"Summary JSON is {len(blob) / 1e6:.1f} MB "
                         f"(limit {config.SUMMARY_MAX_BYTES / 1e6:.0f} MB).")
    return doc, blob


def summary_csv(doc):
    """Flat CSV: days + field vectors + well vectors (WOPR:WELL columns)."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    headers = ["days"] + list(doc["field"].keys())
    well_cols = []
    for well, entry in doc["wells"].items():
        for base in entry:
            well_cols.append((f"{base}:{well}", entry[base]))
    headers += [name for name, _ in well_cols]
    writer.writerow(headers)
    for i, day in enumerate(doc["days"]):
        row = [day]
        for key in doc["field"]:
            series = doc["field"][key]
            row.append(series[i] if i < len(series) else "")
        for _name, series in well_cols:
            row.append(series[i] if i < len(series) else "")
        writer.writerow(row)
    return buf.getvalue().encode("utf-8")


_ERROR_LINE = re.compile(r"error", re.IGNORECASE)


def prt_excerpt(workdir):
    """Error-bearing lines plus the tail of the PRT (or flow's stderr when no
    PRT exists), capped. This is the honest 'why did my run fail' artifact."""
    prts = sorted(glob.glob(os.path.join(workdir, "out", "*.PRT")))
    source = prts[0] if prts else os.path.join(workdir, "flow.stderr")
    if not os.path.isfile(source):
        return b""
    with open(source, "r", errors="replace") as f:
        lines = f.readlines()
    error_lines = [l for l in lines if _ERROR_LINE.search(l)][:200]
    tail = lines[-80:]
    text = ""
    if error_lines:
        text += "".join(error_lines) + "\n---- tail ----\n"
    text += "".join(tail)
    data = text.encode("utf-8", errors="replace")
    return data[-config.PRT_EXCERPT_MAX_BYTES:]


def dir_bytes(path):
    total = 0
    for root, _dirs, names in os.walk(path):
        for name in names:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total
