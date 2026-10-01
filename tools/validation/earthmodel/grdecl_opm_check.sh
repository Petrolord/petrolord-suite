#!/usr/bin/env bash
# Earth Modeling U2-011: OPM Flow reads the corner-point export.
# Writes the fixture model's GRDECL (jest, EM_GRDECL_OUT), wraps it in a
# minimal oil-water deck with NOSIM, runs OPM Flow inside the Simulation
# worker's container (the engine Reservoir Simulation Studio runs) and
# prints Flow's own grid summary: active cells and pore volume.
# Usage: tools/validation/earthmodel/grdecl_opm_check.sh [container]
set -euo pipefail
CONTAINER="${1:-plstudio-sim-worker}"
OUT="$(mktemp -d)"
EM_GRDECL_OUT="$OUT" npx jest --runInBand src/pages/apps/EarthModeling/__tests__/grdeclExport.test.js -t 'OPM Flow check' >/dev/null
read -r NX NY NZ < <(node -e "const e=require('$OUT/expected.json');console.log(e.dims.nx,e.dims.ny,e.dims.nz)")
cat > "$OUT/CHECK.DATA" <<DECK
RUNSPEC
TITLE
 Earth Modeling GRDECL check
DIMENS
 $NX $NY $NZ /
OIL
WATER
METRIC
NOSIM
TABDIMS
 1 1 20 20 /
START
 1 JAN 2027 /
GRID
INCLUDE
 'GRID_TEST.GRDECL' /
PERMX
 $((NX*NY*NZ))*100 /
COPY
 PERMX PERMY /
 PERMX PERMZ /
/
PROPS
PVTW
 250 1.0 4.5E-5 0.5 0 /
PVDO
 100 1.10 1.0
 300 1.08 1.1 /
DENSITY
 850 1030 1.0 /
ROCK
 250 4.5E-5 /
SWOF
 0.10 0.0 1.0 0
 1.00 1.0 0.0 0 /
SOLUTION
PRESSURE
 $((NX*NY*NZ))*250 /
INCLUDE
 'GRID_TEST_SWAT.INC' /
SUMMARY
SCHEDULE
TSTEP
 1 /
END
DECK
docker exec "$CONTAINER" rm -rf /tmp/emcheck
docker exec "$CONTAINER" mkdir -p /tmp/emcheck
tar -C "$OUT" -cf - . | docker exec -i "$CONTAINER" tar -xf - -C /tmp/emcheck
docker exec -w /tmp/emcheck "$CONTAINER" flow CHECK.DATA --output-dir=/tmp/emcheck/out > "$OUT/flow.log" 2>&1 || true
docker exec "$CONTAINER" sh -c 'cat /tmp/emcheck/out/CHECK.PRT' > "$OUT/CHECK.PRT" 2>/dev/null || true
echo "expected: $(cat "$OUT/expected.json")"
grep -i -E "error|active|pore volume|PORV|cells" "$OUT/CHECK.PRT" | head -40 || true
tail -5 "$OUT/flow.log"
docker exec "$CONTAINER" rm -rf /tmp/emcheck
echo "files kept in $OUT"
