# SpeakLab

Academic speech-coaching prototype for **The Art of Public Speaking** (HKUST(GZ) course TA tool).

Students open a link (no login), **record with webcam** or upload a speech video, and get rubric-based feedback.
The model watches the video directly; frame sampling + ASR only run if direct video scoring times out.

## Quick start (server)

```bash
cp .env.example .env   # set KELAI_API_KEY / KELAI_BASE_URL / KELAI_MODEL
chmod +x start.sh
./start.sh
```

Open `http://<host>:8787`

Dev frontend (hot reload):

```bash
PYTHONPATH=. .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8787 --reload
cd frontend && npm install && npm run dev
```

## Environment

| Variable | Meaning |
|----------|---------|
| `KELAI_API_KEY` | API token (never commit) |
| `KELAI_BASE_URL` | default `https://kelaiapi.cc/v1` |
| `KELAI_MODEL` | default `gemini-2.5-flash-lite` |
| `PORT` | default `8787` |

## Rubric

Edit `backend/rubric.py`. The homepage loads it from `/api/rubric`.

## Sharing with students

GitHub hosts **code**. Students need a **running server URL** (this app has a backend + API key).

Options:
1. Run on a lab/server and share `http://<public-host>:8787`
2. Use a tunnel (Cloudflare Tunnel / ngrok) pointed at local `:8787`
3. Deploy to a host that supports long uploads + env secrets

Do **not** put `KELAI_API_KEY` in the frontend or a public repo.
