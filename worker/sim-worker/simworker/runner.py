"""Resource-capped flow invocation. Flow runs in this container as the same
unprivileged user, in its own process group, with a scrubbed environment (no
Supabase credentials reach the simulator) and hard rlimits. Cancellation and
wall-clock kill act on the whole group (SIGTERM, grace, SIGKILL)."""
import os
import resource
import signal
import subprocess
import time

from . import config


def _preexec():
    os.setsid()  # new process group so we can kill flow + any MPI children
    resource.setrlimit(resource.RLIMIT_AS,
                       (config.RLIMIT_AS_BYTES, config.RLIMIT_AS_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE,
                       (config.RLIMIT_FSIZE_BYTES, config.RLIMIT_FSIZE_BYTES))
    resource.setrlimit(resource.RLIMIT_NOFILE,
                       (config.RLIMIT_NOFILE, config.RLIMIT_NOFILE))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def run_flow(workdir, deck_name, should_cancel):
    """Run flow on deck_name inside workdir.

    should_cancel: zero-arg callable polled every few seconds.
    Returns dict(exit_code, elapsed, timed_out, cancelled, stderr_tail).
    """
    cmd = [
        "nice", "-n", str(config.FLOW_NICENESS),
        "flow", deck_name,
        "--output-dir=out",
        f"--threads-per-process={config.FLOW_THREADS}",
        "--enable-terminal-output=false",
    ]
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "OMP_NUM_THREADS": str(config.FLOW_THREADS),
        "HOME": workdir,
    }
    stderr_path = os.path.join(workdir, "flow.stderr")
    started = time.monotonic()
    with open(stderr_path, "wb") as stderr_f:
        proc = subprocess.Popen(cmd, cwd=workdir, env=env,
                                stdout=subprocess.DEVNULL, stderr=stderr_f,
                                preexec_fn=_preexec)
        timed_out = cancelled = False
        while True:
            try:
                proc.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                elapsed = time.monotonic() - started
                if should_cancel():
                    cancelled = True
                elif elapsed > config.WALL_CLOCK_S:
                    timed_out = True
                else:
                    continue
                _kill_group(proc)
                break

    elapsed = time.monotonic() - started
    tail = b""
    try:
        with open(stderr_path, "rb") as f:
            f.seek(max(0, os.path.getsize(stderr_path) - 8192))
            tail = f.read()
    except OSError:
        pass
    return {
        "exit_code": proc.returncode,
        "elapsed": elapsed,
        "timed_out": timed_out,
        "cancelled": cancelled,
        "stderr_tail": tail.decode("utf-8", errors="replace"),
    }


def _kill_group(proc):
    try:
        pgid = os.getpgid(proc.pid)
    except ProcessLookupError:
        return
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return
        time.sleep(1)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    proc.wait()
