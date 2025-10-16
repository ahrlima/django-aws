#!/bin/bash
set -euo pipefail

WEB_CONCURRENCY="${WEB_CONCURRENCY:-}"
if [[ -n "${WEB_CONCURRENCY}" ]]; then
  WORKERS="${WEB_CONCURRENCY}"
else
  WORKERS="${GUNICORN_WORKERS:-2}"
fi

BIND_ADDRESS="${GUNICORN_BIND:-0.0.0.0:8000}"
THREADS="${GUNICORN_THREADS:-1}"
TIMEOUT="${GUNICORN_TIMEOUT:-30}"

exec gunicorn testapp.wsgi:application \
  --bind "${BIND_ADDRESS}" \
  --workers "${WORKERS}" \
  --threads "${THREADS}" \
  --timeout "${TIMEOUT}" \
  --log-file - \
  --access-logfile -
