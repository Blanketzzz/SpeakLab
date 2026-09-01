# SpeakLab

Academic speech-coaching app for **The Art of Public Speaking**.

Students open **one HTTPS link** (no login): record or upload → rubric feedback.
The model watches the video; frames + ASR only if direct scoring fails.

## Student URL (recommended)

Deploy the whole app (UI + API) to a free host with real HTTPS — same origin, no IP, no Cloudflare tunnel.

### One-click Render (free)

1. Open: https://render.com/deploy?repo=https://github.com/Blanketzzz/SpeakLab  
2. Create a free Render account (GitHub login is fine).  
3. Set secret **`KELAI_API_KEY`**, then deploy.  
4. Share the URL Render gives you, e.g. `https://speaklab-xxxx.onrender.com`

Cold start: free tier may sleep after idle; first open can take ~30–60s.

### Docker (any host)

```bash
docker build -t speaklab .
docker run --rm -p 7860:7860 \
  -e KELAI_API_KEY=... \
  -e KELAI_BASE_URL=https://kelaiapi.cc/v1 \
  -e KELAI_MODEL=gemini-2.5-flash-lite \
  speaklab
```

## Local / campus server

```bash
cp .env.example .env   # set KELAI_API_KEY
chmod +x start.sh
./start.sh
```

Open `http://<host>:8787` (camera needs HTTPS).

## Environment

| Variable | Meaning |
|----------|---------|
| `KELAI_API_KEY` | API token (**never commit**) |
| `KELAI_BASE_URL` | default `https://kelaiapi.cc/v1` |
| `KELAI_MODEL` | default `gemini-2.5-flash-lite` |
| `PORT` | `8787` local / `7860` in Docker |
| `MAX_UPLOAD_MB` | default `120` on cloud images |

## Rubric

Edit `backend/rubric.py`. Homepage loads `/api/rubric`.
