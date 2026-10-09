#!/bin/bash
# Disk housekeeping for the Petrolord build server (staging, demo videos,
# prod zip cuts). Run from cron:
#   weekly:  housekeeping.sh clean   full safe cleanup
#   daily:   housekeeping.sh check   alarm at THRESHOLD% used; cleans first,
#            then writes ALERT_FILE if the disk is still over the line
# Add --dry-run to list what would go without deleting anything.
#
# Never touches: git worktrees, the staging container or its volumes in use,
# the database, live and recent upload zips, the narration cache (re-cuts
# would pay for TTS again), or a finished video the R2 bucket does not hold.
set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH  # cron runs with a bare PATH

MODE=${1:-clean}
DRY=0; [ "${2:-}" = "--dry-run" ] || [ "${1:-}" = "--dry-run" ] && DRY=1
[ "$MODE" = "--dry-run" ] && MODE=clean
THRESHOLD=${HOUSEKEEPING_THRESHOLD:-85}
VIDEOS=${DEMO_VIDEO_OUT:-/root/demo-videos}
ALERT_FILE=${HOUSEKEEPING_ALERT_FILE:-/root/DISK-ALERT.txt}
LOG=${HOUSEKEEPING_LOG:-/var/log/petrolord-housekeeping.log}
SCRATCH_ROOT=/tmp/claude-0
R2_ENV=${R2_ENV_FILE:-/root/.r2.env}
R2_KEEP_DAYS=${R2_KEEP_LOCAL_DAYS:-30}  # local copies of uploaded cuts kept this long

log() { echo "$(date -u +%FT%TZ) [$MODE] $*" >> "$LOG"; { [ -t 1 ] || [ $DRY = 1 ]; } && echo "$*"; }
used_pct() { df --output=pcent / | tail -1 | tr -dc '0-9'; }
used_gb() { df --output=used -B1G / | tail -1 | tr -dc '0-9'; }
gone() { # rm with a log line; honours --dry-run
  for p in "$@"; do
    [ -e "$p" ] || continue
    if [ $DRY = 1 ]; then log "would remove $p ($(du -sh "$p" 2>/dev/null | cut -f1))"
    else rm -rf -- "$p" && log "removed $p"; fi
  done
}
in_r2() { # in_r2 <dir> <file>: the bucket holds this exact file (size + MD5 ETag per r2.json)
  [ -f "$R2_ENV" ] && [ -f "$1/r2.json" ] && [ -f "$1/$2" ] || return 1
  local want size md5 hdr
  want=$(python3 -c 'import json,sys; f=json.load(open(sys.argv[1]))["files"][sys.argv[2]]; print(f["key"], f["size"], f["md5"])' "$1/r2.json" "$2" 2>/dev/null) || return 1
  read -r key size md5 <<<"$want"
  [ "$(stat -c %s "$1/$2")" = "$size" ] && [ "$(md5sum "$1/$2" | cut -d' ' -f1)" = "$md5" ] || return 1
  hdr=$( set -a; . "$R2_ENV"; set +a
    curl -sfI --max-time 60 --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
      -H 'Accept-Encoding: identity' -H "x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" \
      "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com/$R2_BUCKET/$key") || return 1
  grep -qi "^content-length: *$size" <<<"$hdr" && grep -qi "^etag: *\"$md5\"" <<<"$hdr"
}
keep_newest() { # keep_newest N glob...: remove all but the N newest matches
  local n=$1; shift
  ls -1t "$@" 2>/dev/null | tail -n +$((n + 1)) | while read -r f; do gone "$f"; done
}

clean() {
  local before; before=$(used_gb)

  # 1. demo videos: once the finished cut is 3 days old, the raw screen
  #    recording, render work files and browser profile are not needed
  #    (storyboards are in git, so any video can be re-recorded)
  for d in "$VIDEOS"/*/; do
    [ -f "$d/youtube.mp4" ] || continue
    [ -n "$(find "$d/youtube.mp4" -mtime +3)" ] || continue
    gone "$d/raw.mkv" "$d/work" "$d/profile"
  done
  # finished cuts: free the local copy R2_KEEP_DAYS after upload, only when
  # the bucket still holds the identical file (node tools/demo-video/r2.mjs get
  # <id> brings it back)
  for d in "$VIDEOS"/*/; do
    [ -f "$d/r2.json" ] && [ -n "$(find "$d/r2.json" -mtime +"$R2_KEEP_DAYS")" ] || continue
    for f in youtube.mp4 nape.mp4; do in_r2 "${d%/}" "$f" && gone "$d$f"; done
  done
  find "$VIDEOS" -maxdepth 1 -type f \( -name 'probe-*.png' -o -name 'seed-*.png' -o -name 'merge-*.log' \) -mtime +7 2>/dev/null | while read -r f; do gone "$f"; done
  keep_newest 1 -d /root/demo-video-work/site-*

  # 2. test and package caches (rebuilt on demand)
  gone /tmp/jest_*
  local npm_gb; npm_gb=$(du -s -BG /root/.npm/_cacache 2>/dev/null | cut -f1 | tr -dc '0-9')
  if [ "${npm_gb:-0}" -gt 5 ]; then
    if [ $DRY = 1 ]; then log "would clear npm cache (${npm_gb}G)"; else npm cache clean --force >/dev/null 2>&1 && log "cleared npm cache (${npm_gb}G)"; fi
  fi

  # 3. Claude session scratch: a session folder with nothing written in 7 days
  # (project folders only, named after the working directory with a leading
  # dash; tool venvs beside them are left alone)
  for d in "$SCRATCH_ROOT"/-*/*/; do
    [ -d "$d" ] || continue
    [ -z "$(find "$d" -newermt '-7 days' -print -quit 2>/dev/null)" ] && gone "${d%/}"
  done
  find /tmp -maxdepth 1 \( -name 'w2w6apply.*' -o -name 'tmp*' \) -mtime +7 2>/dev/null | while read -r f; do gone "$f"; done

  # 4. prod zip cuts: build-check folders after a day; keep the 3 newest
  #    zips per product (live, the one before it, and one pending)
  find /root -maxdepth 1 -type d \( -name 'cleanroom-*' -o -name 'zipcut-*' \) -mtime +1 2>/dev/null | while read -r f; do gone "$f"; done
  for p in suite nextgen hse; do keep_newest 3 /root/$p-upload-*.zip; done

  # 5. docker: build cache, dangling images, anonymous volumes no container uses
  if [ $DRY = 1 ]; then log "would prune docker build cache, dangling images, unused anonymous volumes"
  else
    docker builder prune -f >/dev/null 2>&1
    docker image prune -f >/dev/null 2>&1
    docker volume prune -f >/dev/null 2>&1
  fi

  log "clean done: ${before}G -> $(used_gb)G used ($(used_pct)%)"
}

check() {
  local pct; pct=$(used_pct)
  if [ "$pct" -lt "$THRESHOLD" ]; then
    [ -f "$ALERT_FILE" ] && [ $DRY = 0 ] && rm -f "$ALERT_FILE" && log "back under ${THRESHOLD}% ($pct%), alert cleared"
    return 0
  fi
  log "disk at ${pct}% (threshold ${THRESHOLD}%), cleaning"
  clean
  pct=$(used_pct)
  # the alert is rewritten at most once a day (the folder sizes take a while)
  if [ "$pct" -ge "$THRESHOLD" ] && [ $DRY = 0 ] && [ -z "$(find "$ALERT_FILE" -mmin -1440 2>/dev/null)" ]; then
    {
      echo "DISK ALERT $(date -u +%FT%TZ): / is ${pct}% full after automatic cleanup (threshold ${THRESHOLD}%)."
      df -h / | tail -1
      echo "Largest folders:"
      timeout 300 du -xsh "$VIDEOS" /root/demo-video-work /root/.npm /root/seis-bench /tmp/claude-0 /tmp/jest_0 /var/lib/docker 2>/dev/null | sort -h
    } > "$ALERT_FILE"
    log "still at ${pct}% after cleanup, wrote $ALERT_FILE"
  fi
}

case "$MODE" in
  clean) clean ;;
  check) check ;;
  *) echo "usage: housekeeping.sh clean|check [--dry-run]"; exit 2 ;;
esac
