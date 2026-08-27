"""Failure taxonomy. Every failure lands in sim_runs.failure_stage with an
honest, actionable error_message (worker-truncated)."""
from . import config


class SimFailure(Exception):
    """A run failure with a taxonomy stage. Message is user-facing."""

    def __init__(self, stage, message):
        super().__init__(message)
        self.stage = stage
        self.message = truncate(message)


def truncate(message, limit=None):
    limit = limit or config.ERROR_MESSAGE_MAX_BYTES
    raw = str(message)
    encoded = raw.encode("utf-8", errors="replace")
    if len(encoded) <= limit:
        return raw
    return encoded[: limit - 20].decode("utf-8", errors="replace") + "\n...[truncated]"
