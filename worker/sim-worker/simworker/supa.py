"""Thin Supabase client over httpx: PostgREST for sim_runs, Storage for the
sim bucket. Service-role key; the worker is the only writer to sim_runs
(RLS has no client write policies). Retries with backoff on transient
failures; callers see exceptions only after retries are exhausted."""
import datetime as _dt
import logging
import time

import httpx

from . import config

log = logging.getLogger("simworker.supa")

_TRANSIENT = {408, 425, 429, 500, 502, 503, 504}


def _headers(extra=None):
    h = {
        "apikey": config.SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SERVICE_ROLE_KEY}",
    }
    if extra:
        h.update(extra)
    return h


def _request(method, url, *, retries=4, **kwargs):
    delay = 1.0
    last = None
    for attempt in range(retries):
        try:
            resp = httpx.request(method, url, headers=_headers(kwargs.pop("extra_headers", None)),
                                 timeout=60.0, **kwargs)
            if resp.status_code in _TRANSIENT:
                last = RuntimeError(f"{method} {url} -> {resp.status_code}: {resp.text[:200]}")
            else:
                return resp
        except httpx.HTTPError as e:  # DNS, timeouts, resets
            last = e
        time.sleep(delay)
        delay *= 2
    raise last


def utcnow_iso():
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


# ---------------------------------------------------------------- sim_runs ---

def _rest(path):
    return f"{config.SUPABASE_URL}/rest/v1/{path}"


def fetch_oldest_queued():
    resp = _request("GET", _rest("sim_runs"), params={
        "status": "eq.queued",
        "order": "queued_at.asc",
        "limit": "1",
        "select": "*",
    })
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def claim_run(run_id):
    """Atomic claim: only wins if the row is still queued. Returns the claimed
    row, or None if another worker (or a cancel) got there first."""
    resp = _request("PATCH", _rest("sim_runs"),
                    params={"id": f"eq.{run_id}", "status": "eq.queued"},
                    json={
                        "status": "running",
                        "claimed_at": utcnow_iso(),
                        "heartbeat_at": utcnow_iso(),
                        "worker_id": config.WORKER_ID,
                    },
                    extra_headers={"Prefer": "return=representation"})
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        return None
    # attempt increments on every claim (initial or requeue).
    row = rows[0]
    resp = _request("PATCH", _rest("sim_runs"), params={"id": f"eq.{run_id}"},
                    json={"attempt": int(row.get("attempt") or 0) + 1},
                    extra_headers={"Prefer": "return=representation"})
    resp.raise_for_status()
    updated = resp.json()
    return updated[0] if updated else row


def update_run(run_id, fields):
    resp = _request("PATCH", _rest("sim_runs"), params={"id": f"eq.{run_id}"}, json=fields)
    resp.raise_for_status()


def get_run(run_id):
    resp = _request("GET", _rest("sim_runs"), params={"id": f"eq.{run_id}", "select": "*"})
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def heartbeat(run_id):
    update_run(run_id, {"heartbeat_at": utcnow_iso()})


def sweep_stale():
    """Requeue runs whose worker stopped heartbeating; fail them out after
    MAX_ATTEMPTS claims (org-export stale-claim precedent, DB-side)."""
    cutoff = (_dt.datetime.now(_dt.timezone.utc)
              - _dt.timedelta(seconds=config.STALE_AFTER_S)).isoformat()
    resp = _request("GET", _rest("sim_runs"), params={
        "status": "eq.running",
        "heartbeat_at": f"lt.{cutoff}",
        "select": "id,attempt",
    })
    resp.raise_for_status()
    for row in resp.json():
        if int(row.get("attempt") or 0) < config.MAX_ATTEMPTS:
            log.warning("requeueing stale run %s (attempt %s)", row["id"], row["attempt"])
            _request("PATCH", _rest("sim_runs"),
                     params={"id": f"eq.{row['id']}", "status": "eq.running",
                             "heartbeat_at": f"lt.{cutoff}"},
                     json={"status": "queued", "worker_id": None,
                           "claimed_at": None, "heartbeat_at": None}).raise_for_status()
        else:
            log.warning("failing stale run %s after %s attempts", row["id"], row["attempt"])
            _request("PATCH", _rest("sim_runs"),
                     params={"id": f"eq.{row['id']}", "status": "eq.running",
                             "heartbeat_at": f"lt.{cutoff}"},
                     json={"status": "failed", "failure_stage": "worker_lost",
                           "error_message": "The worker crashed or was restarted during this run.",
                           "finished_at": utcnow_iso()}).raise_for_status()


# ----------------------------------------------------------------- storage ---

def _storage(path):
    return f"{config.SUPABASE_URL}/storage/v1/{path}"


def storage_list(prefix):
    """Recursive listing of the sim bucket under prefix -> [(relpath, bytes)]."""
    out = []

    def walk(sub):
        resp = _request("POST", _storage(f"object/list/{config.BUCKET}"),
                        json={"prefix": sub, "limit": 1000,
                              "sortBy": {"column": "name", "order": "asc"}})
        resp.raise_for_status()
        for entry in resp.json():
            name = entry.get("name")
            if not name:
                continue
            full = f"{sub}/{name}" if sub else name
            if entry.get("id") is None:  # folder placeholder
                walk(full)
            else:
                size = (entry.get("metadata") or {}).get("size") or 0
                out.append((full, int(size)))

    walk(prefix.rstrip("/"))
    return out


def storage_download(path):
    resp = _request("GET", _storage(f"object/{config.BUCKET}/{path}"))
    if resp.status_code != 200:
        raise RuntimeError(f"storage download {path} -> {resp.status_code}")
    return resp.content


def storage_upload(path, data, content_type):
    resp = _request("POST", _storage(f"object/{config.BUCKET}/{path}"),
                    content=data,
                    extra_headers={"Content-Type": content_type, "x-upsert": "true"})
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"storage upload {path} -> {resp.status_code}: {resp.text[:200]}")
