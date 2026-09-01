# SpeakLab — single HTTPS origin (frontend + API)
FROM node:22-bookworm AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_BASE=/
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV HOST=0.0.0.0 \
    PORT=7860 \
    MAX_UPLOAD_MB=120 \
    FRAME_COUNT=6 \
    KELAI_MODEL=gemini-2.5-flash-lite \
    PYTHONUNBUFFERED=1

EXPOSE 7860
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860} --timeout-keep-alive 75"]
