# Prepare the F3 (NLOG) wells for the QA import: header, zones from the NLOG
# lithostratigraphy (grouped to the group level), and a SONIC-INTEGRATED
# time-depth table (not measured checkshots: the NLOG velocity surveys are
# scanned images). Water at 1480 m/s to the seabed, a linear velocity ramp
# from 1600 m/s at the seabed to the first sonic velocity, then the integrated
# sonic. Run: python3 -I prep_f3_wells.py <nlog dir> <out json>
import json, sys, math, os
nlog, out = sys.argv[1], sys.argv[2]
WELLS = {"F02-01": 148181673, "F03-02": 106523717, "F03-04": 106523731, "F06-01": 106523790}
GROUP = {"NU": "Upper North Sea Group", "NM": "Middle North Sea Group", "NL": "Lower North Sea Group", "CK": "Chalk Group",
         "KN": "Rijnland Group", "SG": "Schieland Group", "SL": "Altena Group", "RN": "Upper Germanic Trias", "NN": "Not named"}
def las(path):
    names, rows, mode, data, nullv = [], [], "", False, -999.25
    for line in open(path, errors="replace"):
        if line.startswith("~"):
            mode = line[1].upper(); data = mode == "A"; continue
        if mode == "W" and line.strip().startswith("NULL"):
            try: nullv = float(line.split(":")[0].split()[-1])
            except Exception: pass
        if mode == "C" and line.strip() and not line.startswith("#"): names.append(line.split(".")[0].strip())
        elif data:
            p = line.split()
            if len(p) == len(names): rows.append([float(x) for x in p])
    return names, rows, nullv
res = []
for name, dbk in WELLS.items():
    det = json.load(open(f"{nlog}/{name}/details.json")); det = det[0] if isinstance(det, list) else det
    st = json.load(open(f"{nlog}/{name}/stratinterpretations.json"))
    kb = st["drpHeightInMeters"]
    lasf = [f for f in os.listdir(f"{nlog}/{name}") if f.endswith("_comp.las")][0]
    names, rows, nullv = las(f"{nlog}/{name}/{lasf}")
    rows.sort(key=lambda r: r[0])
    hdr = open(f"{nlog}/{name}/{lasf}", errors="replace").read()
    wd = None
    for alt in [f"{nlog}/{name}/" + n for n in os.listdir(f"{nlog}/{name}") if n.startswith("F0") and n.endswith(".las")]:
        for line in open(alt, errors="replace"):
            if line.startswith("EGL"):
                try: wd = -float(line.split(":")[0].split()[-1])
                except Exception: pass
    if wd is None or not (10 < wd < 100): wd = 42.0
    j = names.index("DT")
    md_dt = [(r[0], r[j]) for r in rows if r[j] != nullv and 40 < r[j] < 250]
    # one-way time integration in TVDSS (vertical assumption)
    z0 = md_dt[0][0] - kb
    v0 = 0.3048 / (md_dt[0][1] * 1e-6)
    t = 2 * wd / 1480.0  # TWT s at seabed
    # ramp seabed -> z0 linear velocity 1600 -> v0: TWT = 2*int dz/v
    n = 200; dz = (z0 - wd) / n
    for k in range(n):
        z = wd + (k + 0.5) * dz; v = 1600 + (v0 - 1600) * (z - wd) / (z0 - wd)
        t += 2 * dz / v
    table = [(0.0, 0.0), (wd, 2 * wd / 1480.0 * 1000), (z0, t * 1000)]
    prev = md_dt[0]; nextout = math.ceil(z0 / 50) * 50
    for md, dtv in md_dt[1:]:
        dzm = md - prev[0]
        if dzm <= 0: continue
        if dzm > 5:  # gap: bridge with the mean slowness
            s = 0.5 * (dtv + prev[1])
        else: s = 0.5 * (dtv + prev[1])
        t += 2 * dzm * (s * 1e-6 / 0.3048)
        z = md - kb
        if z >= nextout:
            table.append((round(z, 2), round(t * 1000, 3))); nextout += 50
        prev = (md, dtv)
    table.append((round(prev[0] - kb, 2), round(t * 1000, 3)))
    cs = []
    for z, tt in table:
        if cs and (z <= cs[-1]["tvdss_m"] or tt <= cs[-1]["twt_ms"]): continue
        cs.append({"tvdss_m": z, "twt_ms": tt, "md_m": round(z + kb, 2)})
    # zones: group-level from the preferred interpretation
    pref = [s for s in st["stratIntprts"] if s.get("preferredBln") == "J"] or st["stratIntprts"]
    zones = []
    for iv in pref[0]["stratIntvals"]:
        g = iv["stratUnitId"][:2]; nm = GROUP.get(g, g)
        if zones and zones[-1]["name"] == nm and abs(zones[-1]["baseMdM"] - iv["topDepth"]) < 0.5:
            zones[-1]["baseMdM"] = iv["bottomDepth"]
        else: zones.append({"name": nm, "code": g, "topMdM": iv["topDepth"], "baseMdM": iv["bottomDepth"]})
    res.append({"name": f"F3 {name}", "nlog": name, "dbk": dbk, "x": det["xcoordUTM"], "y": det["ycoordUTM"], "crs": "EPSG:23031",
                "kbM": kb, "tdMdM": det.get("endAhDepthInMeters") or st["endAhDepthInMeters"], "waterDepthM": wd,
                "las": f"{name}/{lasf}", "checkshots": cs, "zones": zones,
                "tdrNote": "Sonic-integrated time-depth (water 1480 m/s, ramp 1600 m/s to first sonic), not measured checkshots"})
json.dump(res, open(out, "w"), indent=1)
for r in res: print(r["name"], r["x"], r["y"], r["kbM"], r["waterDepthM"], len(r["checkshots"]), r["checkshots"][-1], [ (z["code"], z["topMdM"]) for z in r["zones"]][:6])
