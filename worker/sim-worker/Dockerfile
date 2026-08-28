# Sim worker: OPM Flow (from the official release image) + the Python poll
# loop. Flow runs as a subprocess of the worker, same unprivileged user;
# GPL is satisfied by the process boundary (flow is never linked or
# redistributed).
#
# PINNED BY DIGEST. This file used to say the tag was pinned deliberately and
# then pull `:latest`, so any rebuild could silently land a different
# simulator than the one the SPE1 golden was passed against, and nothing would
# have told anyone.
#
# The digest below is OPM Flow 2026.04. It is the multi-arch manifest list
# that `latest` resolved to on 2026-05-20, covering linux/amd64
# (sha256:db8865d7c80440513c8c73d...) and linux/arm64
# (sha256:810b1a2b72ee24a194df033...), which are the same images published as
# the 2026.04_amd64 and 2026.04_arm64 tags. Upstream publishes no plain
# `2026.04` tag, which is why this is a digest rather than a version tag.
#
# To bump: change the digest, rebuild, and re-run the FULL test suite. If the
# SPE1 golden drifts beyond tolerance, regenerate the reference fixtures from
# the matching opm-tests revision. Never silently widen the tolerance.
FROM openporousmedia/opmreleases@sha256:18c497f6a918c160cd290081d4163abf6e2c349797e18e3b5669c9095044adff

# The base image defaults to a non-root 'opm' user; build steps need root.
USER root

# Belt and braces on the pin. If the digest is ever changed without updating
# this expectation, the build fails here rather than at a silently different
# answer six months later.
ARG EXPECTED_OPM_VERSION=2026.04
RUN set -eu; \
    actual="$(flow --version 2>&1 | head -1 | awk '{print $NF}')"; \
    if [ "$actual" != "$EXPECTED_OPM_VERSION" ]; then \
        echo "OPM version mismatch: pinned digest gives '$actual', expected '$EXPECTED_OPM_VERSION'." >&2; \
        echo "If this bump is intended, update EXPECTED_OPM_VERSION and re-run the SPE1 golden." >&2; \
        exit 1; \
    fi; \
    echo "OPM Flow $actual confirmed from the pinned digest."

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 simuser \
    && mkdir -p /scratch && chown simuser:simuser /scratch

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
        "httpx>=0.27,<1" \
        "resdata>=5,<6" \
        "pytest>=8,<9"

COPY simworker /app/simworker
RUN chown -R simuser:simuser /app

USER simuser
WORKDIR /app
ENV PATH="/opt/venv/bin:/usr/local/bin:/usr/bin:/bin"

CMD ["python3", "-m", "simworker.main"]
