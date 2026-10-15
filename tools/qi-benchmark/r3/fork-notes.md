## Throughput fork (#1162 threads, #1165 range, #1166 migration, #1168 upload mem)
- threads: 1.5 s CPU spin in a thread -> main loop lag 6 ms, other job HTTP <=22 ms; in-process control 1501/1494 ms. JOB_THREADS=0 fallback; selfcheck runs a pass+fail job through bundled thread.
- range: link probe byte 0 -> 206 registers link (no copy); 26 MB file linked reading 0.84 MB; 30x40 crop of 250x100 converts reading 1.89 MB, bricks identical to copy path; no-range server copies (neg control); link_changed/link_gone/link_no_ranges.
- #1166: linked rows not counted in raw allowance (APPLIED 2026-10-15).
- upload mem (#1168): 4.7 GB stack cropped to 1.18 GB, Chromium: JS heap 677/770 -> 195/184 MB; renderer 1487/1493 -> 238/292 MB; upload 109/99 s -> 24.6 s.
- deferrals: link gathers read twice; irregular-grid crop planning touches all headers; expiring signed links fail link_gone; sequential range reads; memory measured headless only.
## Deferred fork (#1163): tie guard simultaneous 0.3; F-10 polarity column; F-2 CRS conversion in prepareWell; job warnings shown; stale AVO comparison blocks calibrated run.
- deferrals: CRS conversion position only (no grid convergence on step-outs); CUSTOM CRS refused; warnings not in report/Jobs dock.
