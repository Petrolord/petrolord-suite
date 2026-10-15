#!/bin/bash
# usage (on the worker host): /srv/qi-benchmark/kit/run.sh <plan.json> <results.json>
# Chromium in the Playwright image; the QA account from /srv/qi-benchmark/kit/.qa.env (mode 600).
cd /srv/qi-benchmark/kit
docker run --rm --ipc=host --network host -v /srv/qi-benchmark:/srv/qi-benchmark -v /root/cropbench/node_modules:/srv/qi-benchmark/kit/node_modules:ro \
  --env-file /srv/qi-benchmark/kit/.qa.env -w /srv/qi-benchmark/kit mcr.microsoft.com/playwright:v1.61.1-noble node drive-qi.mjs "$1" "$2"
