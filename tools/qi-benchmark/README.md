# QI open-dataset benchmark kit (internal, not shipped)

Drives the Suite's own services in Chromium with the QA account
(qa-seismic@petrolord.com), the way the apps call them: well import (Well
Data Manager registry path), Seismolord server import with a crop, seismic
QC, post-stack inversion (blind check, volume), porosity calibration. See
`docs/scope/QI-BENCHMARK.md` for the datasets, licences and results.

Data never enters git or the studio VPS. It lives on the worker host under
`/srv/qi-benchmark/` (`f3/`, `volve/`, `kit/`).

## Build and copy (studio VPS)

    # esbuild must resolve from inside the repo
    cp tools/qi-benchmark/build-bench.mjs .qibench-build.mjs
    node .qibench-build.mjs tools/qi-benchmark/qibench-entry.js /tmp/qibench.js "$PWD"; rm .qibench-build.mjs
    scp /tmp/qibench.js tools/qi-benchmark/{drive-qi.mjs,run.sh,prep_f3_wells.py,*.json} root@191.215.43.115:/srv/qi-benchmark/kit/
    scp /root/.qa-seismic.env root@191.215.43.115:/srv/qi-benchmark/kit/.qa.env   # chmod 600 there

## Run (worker host)

    cd /srv/qi-benchmark/kit
    python3 -I prep_f3_wells.py /srv/qi-benchmark/f3/nlog f3/wells.json   # wells, zones, sonic time-depth
    ./run.sh plan-f3-full.json results/f3-full.json                         # Playwright image, port 8330 (storage CORS)

Each step's result is written to the results JSON as it finishes; a rerun
continues by key. Writes are named `BENCH ...`; `removeVolumes` and
`removeWells` steps clean up by prefix.
