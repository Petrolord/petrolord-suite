# Sim worker: OPM Flow (from the official release image) + the Python poll
# loop. Flow runs as a subprocess of the worker, same unprivileged user;
# GPL is satisfied by the process boundary (flow is never linked or
# redistributed). Pin the base tag deliberately — bumping it requires
# re-passing the SPE1 golden (see README).
FROM openporousmedia/opmreleases:latest

# The base image defaults to a non-root 'opm' user; build steps need root.
USER root

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
