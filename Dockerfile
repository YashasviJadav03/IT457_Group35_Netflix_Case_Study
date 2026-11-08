# ---------------------------------------------------------------------------
# Container image for the Flask web tier.
#
# Build:  docker compose up --build
# The image contains application code only; all configuration is supplied at
# runtime as environment variables. The same image therefore runs against any
# PostgreSQL server -- a local container, or a managed database such as Amazon
# RDS -- without being rebuilt.
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# No .pyc files and unbuffered stdout/stderr, so `docker logs` shows the app
# output in real time.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies are copied and installed first: this layer stays cached while
# only application code changes, which keeps rebuilds fast.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Unprivileged runtime user (uid fixed so volume/permission bugs are obvious).
RUN useradd --create-home --uid 10001 appuser

# Application code: app.py, templates/, static/ and init.sql. .env files are
# excluded by .dockerignore and must be supplied at runtime (env_file / -e).
COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 5000

# curl is not installed in the slim image, so probe with the Python stdlib.
# /health answers 200 only while PostgreSQL is reachable, so the container
# reports unhealthy whenever the database is down.
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3).status == 200 else 1)" 2>/dev/null

# gunicorn in the foreground (no shell wrapper, so SIGTERM reaches it and
# `docker compose stop` shuts down cleanly). Two workers suit a small host with
# a single CPU and limited memory. Logs go to stdout/stderr so
# `docker compose logs -f web` works.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
