#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

if [[ ! -d frontend/dist ]]; then
  (cd frontend && npm install && npm run build)
fi

export PYTHONPATH="$ROOT"
exec .venv/bin/uvicorn backend.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8787}"
