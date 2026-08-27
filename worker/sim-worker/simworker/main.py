"""Sim worker main loop.

Pull model: poll sim_runs for queued rows, claim atomically, download +
validate the deck, run flow under caps, parse and upload results under the
run owner's storage prefix, finalize the row. A heartbeat thread keeps
heartbeat_at fresh and picks up cancel_requested; a stale sweep at startup
and each idle cycle requeues (attempt-capped) runs whose worker died."""
import logging
import os
import shutil
import subprocess
import threading
import time

from . import config, deck, results, runner, supa
from .errors import SimFailure, truncate

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("simworker")


def opm_version():
    try:
        out = subprocess.run(["flow", "--version"], capture_output=True,
                             text=True, timeout=30).stdout.strip()
        return out or "unknown"
    except Exception:
        return "unknown"


class Heartbeat(threading.Thread):
    """Updates heartbeat_at and mirrors cancel_requested into an Event."""

    def __init__(self, run_id):
        super().__init__(daemon=True)
        self.run_id = run_id
        self.cancel = threading.Event()
        self._stop = threading.Event()

    def run(self):
        while not self._stop.wait(config.HEARTBEAT_INTERVAL_S):
            try:
                supa.heartbeat(self.run_id)
                row = supa.get_run(self.run_id)
                if row and row.get("cancel_requested"):
                    self.cancel.set()
            except Exception as e:
                log.warning("heartbeat failed for %s: %s", self.run_id, e)

    def stop(self):
        self._stop.set()


def process_run(run, version):
    run_id = run["id"]
    user_id = run["user_id"]
    case_id = run["case_id"]
    scratch = os.path.join(config.SCRATCH_DIR, run_id)
    hb = Heartbeat(run_id)
    hb.start()
    result_prefix = f"{user_id}/{case_id}/runs/{run_id}"
    try:
        os.makedirs(scratch, exist_ok=True)
        supa.update_run(run_id, {"opm_version": version})

        # --- deck ---
        files = deck.download_bundle(user_id, case_id, scratch)
        case = _fetch_case(case_id)
        main_rel = _main_deck_rel(case, files)
        deck.validate_bundle(scratch, main_rel)
        deck_sha = deck.sha256_of(os.path.join(scratch, main_rel))
        supa.update_run(run_id, {"deck_sha256": deck_sha})

        # --- simulate ---
        outcome = runner.run_flow(scratch, main_rel, hb.cancel.is_set)
        log.info("run %s: flow exit=%s elapsed=%.1fs timed_out=%s cancelled=%s",
                 run_id, outcome["exit_code"], outcome["elapsed"],
                 outcome["timed_out"], outcome["cancelled"])

        excerpt = results.prt_excerpt(scratch)
        if excerpt:
            supa.storage_upload(f"{result_prefix}/prt_excerpt.txt", excerpt, "text/plain")

        base_fields = {
            "exit_code": outcome["exit_code"],
            "elapsed_seconds": round(outcome["elapsed"], 1),
            "log_path": f"{result_prefix}/prt_excerpt.txt" if excerpt else None,
        }

        if outcome["cancelled"]:
            supa.update_run(run_id, {**base_fields, "status": "cancelled",
                                     "finished_at": supa.utcnow_iso()})
            return
        if outcome["timed_out"]:
            raise SimFailure("timeout",
                             f"The run exceeded the {config.WALL_CLOCK_S} s wall-clock limit "
                             "and was stopped. Reduce the schedule or grid size.")
        if outcome["exit_code"] != 0:
            if outcome["exit_code"] in (-9, 137):
                raise SimFailure("oom",
                                 "The simulator was killed by the memory cap "
                                 f"({config.RLIMIT_AS_BYTES / 1024**3:.0f} GiB). "
                                 "Reduce the grid size.")
            raise SimFailure("sim_failed", _sim_error_text(scratch, outcome))

        out_dir = os.path.join(scratch, "out")
        out_size = results.dir_bytes(out_dir)
        if out_size > config.OUTPUT_MAX_BYTES:
            raise SimFailure("output_too_large",
                             f"Simulator output is {out_size / 1e9:.1f} GB "
                             f"(limit {config.OUTPUT_MAX_BYTES / 1e9:.0f} GB).")

        # --- results ---
        case_path = results.find_summary_case(out_dir)
        doc, blob = results.build_summary(case_path, version, deck_sha)
        try:
            supa.storage_upload(f"{result_prefix}/summary.json", blob, "application/json")
            supa.storage_upload(f"{result_prefix}/summary.csv",
                                results.summary_csv(doc), "text/csv")
        except Exception as e:
            raise SimFailure("upload_failed", f"Could not store the results: {e}")

        supa.update_run(run_id, {
            **base_fields,
            "status": "complete",
            "finished_at": supa.utcnow_iso(),
            "result_path": f"{result_prefix}/summary.json",
            "result_bytes": len(blob),
            "report_steps": len(doc["days"]),
            "failure_stage": None,
            "error_message": None,
        })
        log.info("run %s complete (%d steps, %d wells)", run_id,
                 len(doc["days"]), len(doc["wells"]))

    except SimFailure as f:
        log.warning("run %s failed at %s: %s", run_id, f.stage, f.message)
        _finalize_failed(run_id, f.stage, f.message)
    except Exception as e:  # unexpected — still land honestly
        log.exception("run %s crashed", run_id)
        _finalize_failed(run_id, "sim_failed",
                         truncate(f"Unexpected worker error: {e}"))
    finally:
        hb.stop()
        shutil.rmtree(scratch, ignore_errors=True)


def _finalize_failed(run_id, stage, message):
    try:
        supa.update_run(run_id, {
            "status": "failed",
            "failure_stage": stage,
            "error_message": message,
            "finished_at": supa.utcnow_iso(),
        })
    except Exception:
        log.exception("could not finalize run %s (stale sweep will catch it)", run_id)


def _fetch_case(case_id):
    import httpx  # noqa: F401 (parity with supa's transport)
    resp = supa._request("GET", supa._rest("sim_cases"),
                         params={"id": f"eq.{case_id}", "select": "*"})
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise SimFailure("validate_failed", "The run's case no longer exists.")
    return rows[0]


def _main_deck_rel(case, files):
    """The case's deck_path is a full storage key; runs use its path relative
    to the deck/ prefix. Falls back to the only .DATA file in the bundle."""
    deck_path = case.get("deck_path") or ""
    marker = "/deck/"
    if marker in deck_path:
        rel = deck_path.split(marker, 1)[1]
        if any(f == rel for f, _ in files):
            return rel
    datas = [f for f, _ in files if f.upper().endswith(".DATA")]
    if len(datas) == 1:
        return datas[0]
    raise SimFailure("validate_failed",
                     "Could not identify the main .DATA deck in the bundle "
                     "(set the case's deck file, or upload exactly one .DATA).")


def _sim_error_text(scratch, outcome):
    excerpt = results.prt_excerpt(scratch).decode("utf-8", errors="replace")
    error_lines = [l for l in excerpt.splitlines() if "error" in l.lower()][:40]
    body = "\n".join(error_lines) if error_lines else outcome["stderr_tail"]
    return truncate("The simulator reported an error:\n" + (body or "(no error text)"))


def main():
    if not config.SUPABASE_URL or not config.SERVICE_ROLE_KEY:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    version = opm_version()
    log.info("sim worker %s starting (opm: %s)", config.WORKER_ID, version)
    os.makedirs(config.SCRATCH_DIR, exist_ok=True)
    while True:
        try:
            supa.sweep_stale()
            queued = supa.fetch_oldest_queued()
            if queued:
                claimed = supa.claim_run(queued["id"])
                if claimed:
                    log.info("claimed run %s (attempt %s)", claimed["id"], claimed["attempt"])
                    process_run(claimed, version)
                    continue  # look for more work immediately
        except Exception:
            log.exception("poll cycle failed")
        time.sleep(config.POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
