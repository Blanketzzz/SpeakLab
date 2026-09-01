from __future__ import annotations

import json
import shutil
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .rubric import RUBRIC
from .scorer import score_speech_frames, score_speech_video
from .video_pipeline import (
    extract_audio,
    extract_frames,
    make_analysis_video,
    normalize_to_mp4,
    probe_duration,
    transcribe_whisper,
)

settings = get_settings()
app = FastAPI(title="SpeakLab", version="0.2.1")

app.add_middleware(
    CORSMiddleware,
    # GitHub Pages frontend calls this API from another origin.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXT = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}


def _job_path(job_id: str) -> Path:
    return settings.jobs_dir / f"{job_id}.json"


def _write_job(job_id: str, data: dict[str, Any]) -> None:
    path = _job_path(job_id)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_job(job_id: str) -> dict[str, Any]:
    path = _job_path(job_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    return json.loads(path.read_text(encoding="utf-8"))


def _process_job(job_id: str, video_path: Path, original_name: str) -> None:
    job = _read_job(job_id)
    work = settings.upload_dir / job_id
    try:
        job["status"] = "processing"
        job["stage"] = "probing"
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        _write_job(job_id, job)

        duration = None
        try:
            duration = probe_duration(video_path)
        except Exception:
            duration = None

        # Browser MediaRecorder WebM often lacks duration metadata — normalize first.
        if duration is None or video_path.suffix.lower() in {".webm", ".mkv"}:
            job["stage"] = "normalizing"
            _write_job(job_id, job)
            video_path = normalize_to_mp4(video_path, work / "speech_norm.mp4")
            duration = probe_duration(video_path)

        job["duration_sec"] = duration
        job["stage"] = "preparing_video"
        _write_job(job_id, job)

        analysis_path = work / "analysis.mp4"
        make_analysis_video(video_path, analysis_path)
        job["analysis_bytes"] = analysis_path.stat().st_size

        # Primary path: Gemini watches the video. Frames/ASR only if that fails.
        job["stage"] = "scoring_video"
        job["path"] = "direct_video"
        _write_job(job_id, job)

        transcript = ""
        try:
            result = score_speech_video(
                settings,
                duration_sec=duration,
                transcript="",
                video_path=analysis_path,
                filename=original_name,
                model=settings.kelai_model,
            )
        except Exception as primary_exc:  # noqa: BLE001
            job["primary_error"] = str(primary_exc)
            job["stage"] = "fallback_frames"
            job["path"] = "frames_fallback"
            _write_job(job_id, job)

            frames = extract_frames(video_path, work / "frames", count=settings.frame_count)
            job["stage"] = "fallback_transcript"
            _write_job(job_id, job)
            audio_path = work / "audio.wav"
            extract_audio(video_path, audio_path)
            transcript = transcribe_whisper(audio_path, model=settings.whisper_model)
            job["transcript"] = transcript

            job["stage"] = "scoring_frames"
            _write_job(job_id, job)
            result = score_speech_frames(
                settings,
                duration_sec=duration,
                transcript=transcript,
                frame_paths=frames,
                filename=original_name,
                model="gemini-2.5-flash-lite",
            )
            result.setdefault("_meta", {})["primary_error"] = str(primary_exc)

        job["status"] = "done"
        job["stage"] = "done"
        job["result"] = result
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        _write_job(job_id, job)
    except Exception as exc:  # noqa: BLE001
        job["status"] = "error"
        job["stage"] = "error"
        job["error"] = str(exc)
        job["traceback"] = traceback.format_exc()[-4000:]
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        _write_job(job_id, job)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "app": "SpeakLab",
        "model": settings.kelai_model,
        "rubric_version": RUBRIC["version"],
        "scoring_mode": "direct_video_primary",
        "fallback": "frames_plus_transcript_on_timeout",
    }


@app.get("/api/rubric")
def get_rubric() -> dict[str, Any]:
    return RUBRIC


@app.post("/api/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Allowed: {', '.join(sorted(ALLOWED_EXT))}",
        )

    job_id = uuid.uuid4().hex[:12]
    work = settings.upload_dir / job_id
    work.mkdir(parents=True, exist_ok=True)
    video_path = work / f"speech{suffix}"

    max_bytes = settings.max_upload_mb * 1024 * 1024
    size = 0
    with video_path.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                out.close()
                shutil.rmtree(work, ignore_errors=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large (max {settings.max_upload_mb} MB)",
                )
            out.write(chunk)

    now = datetime.now(timezone.utc).isoformat()
    job = {
        "id": job_id,
        "status": "queued",
        "stage": "queued",
        "filename": file.filename,
        "bytes": size,
        "created_at": now,
        "updated_at": now,
    }
    _write_job(job_id, job)
    background_tasks.add_task(_process_job, job_id, video_path, file.filename)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = _read_job(job_id)
    if job.get("status") != "error":
        job.pop("traceback", None)
    return job


FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str) -> FileResponse:
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
