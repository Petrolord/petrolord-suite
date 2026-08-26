"""Caps and tuning for the sim worker. Every value is env-overridable so the
VPS deployment can be retuned without a code change (documented in README)."""
import os


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
WORKER_ID = os.environ.get("WORKER_ID", "sim-worker-1")

BUCKET = "sim"

# Loop cadence
POLL_INTERVAL_S = _int("POLL_INTERVAL_S", 10)
HEARTBEAT_INTERVAL_S = _int("HEARTBEAT_INTERVAL_S", 30)
STALE_AFTER_S = _int("STALE_AFTER_S", 180)
MAX_ATTEMPTS = _int("MAX_ATTEMPTS", 2)

# Flow process caps
FLOW_THREADS = _int("FLOW_THREADS", 2)
FLOW_NICENESS = _int("FLOW_NICENESS", 10)
WALL_CLOCK_S = min(_int("WALL_CLOCK_S", 1800), 3600)
RLIMIT_AS_BYTES = _int("RLIMIT_AS_BYTES", 5 * 1024**3)
RLIMIT_FSIZE_BYTES = _int("RLIMIT_FSIZE_BYTES", 2 * 1024**3)
RLIMIT_NOFILE = _int("RLIMIT_NOFILE", 256)

# Deck bundle caps (worker-authoritative; the enqueue RPC pre-checks size)
BUNDLE_MAX_BYTES = _int("BUNDLE_MAX_BYTES", 25 * 1024**2)
BUNDLE_MAX_FILES = _int("BUNDLE_MAX_FILES", 40)
DECK_MAX_BYTES = _int("DECK_MAX_BYTES", 10 * 1024**2)
MAX_TOTAL_CELLS = _int("MAX_TOTAL_CELLS", 200_000)
MAX_REPORT_STEPS = _int("MAX_REPORT_STEPS", 5_000)

# Output caps
OUTPUT_MAX_BYTES = _int("OUTPUT_MAX_BYTES", 2 * 1024**3)
SUMMARY_MAX_BYTES = _int("SUMMARY_MAX_BYTES", 20 * 1024**2)
SUMMARY_MAX_POINTS = _int("SUMMARY_MAX_POINTS", 5_000)
SUMMARY_MAX_WELLS = _int("SUMMARY_MAX_WELLS", 50)
PRT_EXCERPT_MAX_BYTES = _int("PRT_EXCERPT_MAX_BYTES", 200 * 1024)
ERROR_MESSAGE_MAX_BYTES = _int("ERROR_MESSAGE_MAX_BYTES", 4096)

SCRATCH_DIR = os.environ.get("SCRATCH_DIR", "/scratch")

FIELD_VECTORS = ["FOPR", "FOPT", "FWPR", "FWCT", "FGPR", "FGOR", "FPR"]
WELL_VECTORS = ["WOPR", "WWPR", "WGPR", "WBHP", "WWCT"]
