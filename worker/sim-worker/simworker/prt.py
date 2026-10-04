"""Read what OPM Flow says about a run in its PRT file (SIM-U1, the report's
material balance and convergence; Reservoir round owner question 12).

Everything here is read from the simulator's own printout. Nothing is
recomputed from the grid or the tables:

- the grid line "Total number of active cells: N / total pore volume: V RB";
- the end-of-run block: number of time steps, overall linearizations,
  Newton and linear iterations with their wasted counts, and the error
  summary (warnings, errors, problems, bugs);
- every "Timestep chopped to X days" with the problem line before it;
- the fluid-in-place balance sheets ("BALANCE AT ... DAYS", FIELD TOTALS:
  currently and originally in place, per phase), printed when the deck asks
  for them (RPTSOL / RPTSCHED FIP);
- the field row of the "CUMULATIVE PRODUCTION/INJECTION TOTALS" table,
  printed when the deck asks for the well reports (RPTSCHED WELLS).

The material balance error per component is the change in place against
what the wells moved, both as the simulator printed them, at the last
report step that has both tables:

    error = (originally in place - currently in place) - (produced - injected)

A positive error means the reservoir lost more than the wells took out.
The printed tables are rounded (integers in the balance sheet, one decimal
of a thousand or a million units in the cumulative table), so the error is
only known to within that rounding; `precision` states it, and `closes`
says whether the error sits inside it.

When a table is missing the result says which and why, so the report can
print "not reported" with the reason and never a number it does not have.
"""
import re

_FLOAT = r"[-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?"

_ACTIVE = re.compile(r"Total number of active cells:\s*(\d+)\s*/\s*total pore volume:\s*(" + _FLOAT + r")\s*(\w+)")
_VERSION = re.compile(r"^Flow Version\s*=\s*(\S+)")
_TIMESTEPS = re.compile(r"^Number of timesteps:\s*(\d+)")
_OVERALL = re.compile(r"^Overall (Linearizations|Newton Iterations|Linear Iterations):\s*(\d+)\s*\(Wasted:\s*(\d+)")
_SIMTIME = re.compile(r"^Simulation time:\s*(" + _FLOAT + r")\s*s")
_SUMMARY_COUNT = re.compile(r"^(Warnings|Info|Errors|Bugs|Debug|Problems)\s+(\d+)\s*$")
_CHOP = re.compile(r"Timestep chopped to\s*(" + _FLOAT + r")\s*days", re.IGNORECASE)
_PROBLEM = re.compile(r"^Problem:\s*(.+)$")
_BALANCE_AT = re.compile(r"BALANCE\s+AT\s+(" + _FLOAT + r")\s+DAYS")
_REPORT_HDR = re.compile(r"^\s*REPORT\s+(\d+)\s+(\d{1,2} \w{3} \d{4})")
_PAV = re.compile(r"PAV\s*=\s*(" + _FLOAT + r")\s*(\w+)")
_PORV = re.compile(r"PORV\s*=\s*(" + _FLOAT + r")\s*(\w+)")
_IN_PLACE = re.compile(r"^\s*:(CURRENTLY IN PLACE|ORIGINALLY IN PLACE)\s*:(.*)$")
_PHASE_HDR = re.compile(r"OIL\s+(\w+)\s*-+:-+\s*WAT\s+(\w+)\s*-+:-+\s*GAS\s+(\w+)", re.IGNORECASE)

# Units of the cumulative table, in the balance sheet's units: the labels
# OPM Flow 2026.04 prints, each checked against the summary vectors of the
# same run (tests/test_prt_parse.py and the integration gates).
# FIELD: OPM Flow 2026.04 heads the gas columns "MMSCF" and prints them in
# units of 10^6 Mscf: SPE1 prints 365.0 for the 365,000,000 Mscf its
# WGIT:INJ holds.
# METRIC (SIM-U2-015, checked on tests/integration/fixtures/metric/
# METRIC_BOX.DATA): the balance sheet is in SM3 and the cumulative table in
# MSCM (10^3 sm3) for oil and water and MMSCM (10^6 sm3) for gas; FOPT,
# FWIT and FGPT of the run agree. Any other label (LAB, PVT-M) is not
# guessed: reason "units_not_verified".
_CUM_SCALE = {
    "MSTB": ("STB", 1e3),
    "MMSCF": ("MSCF", 1e6),
    "MSCM": ("SM3", 1e3),
    "MMSCM": ("SM3", 1e6),
}

# A balance whose error is within this fraction of what was originally in
# place is reported as closing. A Petrolord screening convention, stated as
# such in the report; the error itself is always printed.
MB_TOLERANCE = 1e-4

MAX_CHOPS_LISTED = 20


def _numbers(text):
    return [float(x) for x in re.findall(_FLOAT, text)]


def _empty():
    return {
        "schema": "prt-1",
        "flow_version": None,
        "active_cells": None,
        "pore_volume": None,          # {"value", "unit"} from the grid line
        "time_steps": None,
        "simulation_seconds": None,
        "linearizations": None,       # {"total", "wasted"}
        "newton_iterations": None,
        "linear_iterations": None,
        "messages": {},               # Warnings, Errors, Problems, Bugs ...
        "chops": {"count": 0, "listed": []},
        "balance": {"reported": False, "reports": 0, "units": None, "initial": None, "final": None},
        "cumulative": {"reported": False, "reports": 0, "final": None},
        "material_balance": {"computed": False, "reason": None},
        "complete": False,            # the end-of-run block was found
    }


def _parse_cum_units(lines, i):
    """Unit row of a CUMULATIVE table: the third header line under the title.
    Returns the 8 unit labels (oil, water, gas prod, res vol, oil, water,
    gas inj, res vol) or None."""
    for j in range(i + 1, min(i + 6, len(lines))):
        cells = [c.strip() for c in lines[j].split(":")]
        units = [c for c in cells if c]
        if len(units) >= 8 and all(re.fullmatch(r"[A-Z0-9]+", u) for u in units[-8:]):
            return units[-8:]
    return None


def _parse_field_row(line):
    """':FIELD   :  ... : v1: v2: ... v8:' -> the 8 values."""
    vals = [c.strip() for c in line.split(":")]
    nums = []
    for v in vals:
        try:
            nums.append(float(v))
        except ValueError:
            continue
    return nums[-8:] if len(nums) >= 8 else None


def parse_prt(text):
    """Parse the full text of a PRT file. Returns the prt-1 diagnostics."""
    out = _empty()
    if not text:
        out["material_balance"]["reason"] = "no_prt"
        return out
    lines = text.splitlines()

    report_no = None
    report_date = None
    balances = {}      # report number -> balance record
    cumulatives = {}   # report number -> cumulative record
    pending_problem = None
    block = None       # the balance block being read

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]

        m = _VERSION.match(line)
        if m and out["flow_version"] is None:
            out["flow_version"] = m.group(1)

        m = _ACTIVE.search(line)
        if m:
            out["active_cells"] = int(m.group(1))
            out["pore_volume"] = {"value": float(m.group(2)), "unit": m.group(3)}

        m = _PROBLEM.match(line.strip())
        if m:
            pending_problem = m.group(1).strip()

        m = _CHOP.search(line)
        if m:
            out["chops"]["count"] += 1
            if len(out["chops"]["listed"]) < MAX_CHOPS_LISTED:
                out["chops"]["listed"].append({
                    "to_days": float(m.group(1)),
                    "reason": pending_problem,
                    "report_step": report_no,
                })
            pending_problem = None

        m = _BALANCE_AT.search(line)
        if m:
            block = {"days": float(m.group(1)), "report_step": None, "date": None,
                     "pav": None, "pav_unit": None, "units": None,
                     "current": None, "original": None}
        m = _REPORT_HDR.match(line)
        if m:
            report_no = int(m.group(1))
            report_date = m.group(2)
            if block is not None and block["report_step"] is None:
                block["report_step"] = report_no
                block["date"] = report_date

        if block is not None:
            if "FIELD TOTALS" in line:
                block["field"] = True
            elif "REPORT REGION" in line:
                # region sheets follow the field sheet; the field one is done
                if block.get("field") and block["current"] is not None and block["original"] is not None:
                    balances[block["report_step"]] = block
                block = None
            if block is not None and block.get("field"):
                pm = _PAV.search(line)
                if pm and block["pav"] is None:
                    block["pav"] = float(pm.group(1))
                    block["pav_unit"] = pm.group(2)
                hm = _PHASE_HDR.search(line)
                if hm:
                    block["units"] = {"oil": hm.group(1).upper(), "water": hm.group(2).upper(), "gas": hm.group(3).upper()}
                im = _IN_PLACE.match(line)
                if im:
                    vals = _numbers(im.group(2))
                    if len(vals) >= 7:
                        rec = {"oil_liquid": vals[0], "oil_vapour": vals[1], "oil": vals[2],
                               "water": vals[3], "gas_free": vals[4], "gas_dissolved": vals[5], "gas": vals[6]}
                        key = "current" if im.group(1).startswith("CURRENTLY") else "original"
                        block[key] = rec
                    if block["current"] is not None and block["original"] is not None \
                            and im.group(1).startswith("ORIGINALLY"):
                        balances[block["report_step"]] = block
                        block = None

        if "CUMULATIVE PRODUCTION/INJECTION TOTALS" in line:
            units = _parse_cum_units(lines, i)
            for j in range(i + 1, min(i + 12, n)):
                if lines[j].lstrip().startswith(":FIELD"):
                    vals = _parse_field_row(lines[j])
                    if vals and units:
                        cumulatives[report_no] = {"report_step": report_no, "date": report_date,
                                                  "units": units, "values": vals}
                    break

        m = _TIMESTEPS.match(line)
        if m:
            out["time_steps"] = int(m.group(1))
            out["complete"] = True
        m = _SIMTIME.match(line)
        if m:
            out["simulation_seconds"] = float(m.group(1))
        m = _OVERALL.match(line)
        if m:
            key = {"Linearizations": "linearizations", "Newton Iterations": "newton_iterations",
                   "Linear Iterations": "linear_iterations"}[m.group(1)]
            out[key] = {"total": int(m.group(2)), "wasted": int(m.group(3))}
        m = _SUMMARY_COUNT.match(line.strip())
        if m and out["complete"]:
            out["messages"][m.group(1).lower()] = int(m.group(2))
        i += 1

    if balances:
        steps = sorted(k for k in balances if k is not None)
        first = balances[steps[0]] if steps else None
        last = balances[steps[-1]] if steps else None
        out["balance"] = {
            "reported": True,
            "reports": len(balances),
            "units": (last or first or {}).get("units"),
            "initial": _balance_public(first),
            "final": _balance_public(last),
        }
    if cumulatives:
        steps = sorted(k for k in cumulatives if k is not None)
        last = cumulatives[steps[-1]] if steps else None
        out["cumulative"] = {"reported": True, "reports": len(cumulatives),
                             "final": _cum_public(last)}

    out["material_balance"] = material_balance(balances, cumulatives)
    return out


def _balance_public(b):
    if not b:
        return None
    return {"report_step": b["report_step"], "date": b["date"], "days": b["days"],
            "pav": b["pav"], "pav_unit": b["pav_unit"],
            "current": b["current"], "original": b["original"]}


def _cum_public(c):
    if not c:
        return None
    u, v = c["units"], c["values"]
    return {
        "report_step": c["report_step"], "date": c["date"],
        "units": {"oil_prod": u[0], "water_prod": u[1], "gas_prod": u[2], "resv_prod": u[3],
                  "oil_inj": u[4], "water_inj": u[5], "gas_inj": u[6], "resv_inj": u[7]},
        "oil_prod": v[0], "water_prod": v[1], "gas_prod": v[2], "resv_prod": v[3],
        "oil_inj": v[4], "water_inj": v[5], "gas_inj": v[6], "resv_inj": v[7],
    }


def material_balance(balances, cumulatives):
    """Closure per component at the last report step holding both tables."""
    if not balances:
        return {"computed": False, "reason": "no_fip_report"}
    if not cumulatives:
        return {"computed": False, "reason": "no_well_totals"}
    common = sorted(k for k in balances if k is not None and k in cumulatives)
    if not common:
        return {"computed": False, "reason": "no_common_report"}
    step = common[-1]
    bal, cum = balances[step], cumulatives[step]
    units = bal.get("units") or {}
    cu = cum["units"]
    v = cum["values"]
    phases = {}
    # (component, balance unit, prod idx, inj idx)
    for comp, bunit, ip, ii in (("oil", units.get("oil"), 0, 4), ("water", units.get("water"), 1, 5),
                                ("gas", units.get("gas"), 2, 6)):
        sp, si = _CUM_SCALE.get(cu[ip]), _CUM_SCALE.get(cu[ii])
        if not bunit or not sp or not si or sp[0] != bunit or si[0] != bunit:
            return {"computed": False, "reason": "units_not_verified",
                    "detail": f"{comp}: balance {bunit}, cumulative {cu[ip]} and {cu[ii]}"}
        orig = bal["original"][comp]
        curr = bal["current"][comp]
        produced = v[ip] * sp[1]
        injected = v[ii] * si[1]
        error = (orig - curr) - (produced - injected)
        # half a unit of the last printed digit of each term
        precision = 0.5 + 0.5 + 0.05 * sp[1] + 0.05 * si[1]
        phases[comp] = {
            "unit": bunit,
            "originally_in_place": orig,
            "currently_in_place": curr,
            "produced": produced,
            "injected": injected,
            "error": error,
            "precision": precision,
            "relative_error": (error / orig) if orig else None,
            "within_rounding": abs(error) <= precision,
            "closes": abs(error) <= precision or (orig > 0 and abs(error) / orig <= MB_TOLERANCE),
        }
    return {"computed": True, "reason": None, "report_step": step, "date": bal["date"],
            "days": bal["days"], "tolerance": MB_TOLERANCE, "phases": phases,
            "closes": all(p["closes"] for p in phases.values())}


def parse_prt_file(path):
    try:
        with open(path, "r", errors="replace") as f:
            return parse_prt(f.read())
    except OSError:
        out = _empty()
        out["material_balance"]["reason"] = "no_prt"
        return out
