from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

from .config import Settings
from .rubric import RUBRIC, rubric_prompt_block


SYSTEM_PROMPT = """You are an expert public-speaking coach and course TA for the undergraduate class
"The Art of Public Speaking". Score student speeches with the provided academic rubric.

Prefer evidence from the attached media (video and/or frames + transcript).
Be specific, constructive, and actionable. Do not invent unsupported quotes.

Respond with ONLY valid JSON matching the schema. No markdown fences."""


SCHEMA_HINT = {
    "overall_score": "number 1-5 (one decimal ok)",
    "summary": "2-4 sentence overall coaching summary in English",
    "strengths": ["3 concrete strengths"],
    "improvements": ["3 prioritized improvements"],
    "criteria": [
        {
            "id": "structure|content|language|delivery_voice|delivery_body|engagement",
            "score": "1-5",
            "feedback": "specific feedback in English",
            "evidence": ["short evidence notes"],
        }
    ],
    "coach_checklist": ["5 short next-practice drills"],
}


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise
        return json.loads(match.group(0))


def _normalize(parsed: dict[str, Any], *, mode: str, extra: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed["overall_score"] = float(parsed.get("overall_score"))
    except (TypeError, ValueError):
        pass
    for item in parsed.get("criteria") or []:
        try:
            item["score"] = float(item.get("score"))
        except (TypeError, ValueError):
            pass
    parsed["_meta"] = {
        "model": extra.get("model"),
        "rubric_version": RUBRIC["version"],
        "mode": mode,
        **{k: v for k, v in extra.items() if k != "model"},
    }
    return parsed


def _video_file_part(video_path: Path) -> dict[str, Any]:
    mime = "video/mp4"
    suffix = video_path.suffix.lower()
    if suffix == ".webm":
        mime = "video/webm"
    elif suffix == ".mov":
        mime = "video/quicktime"
    b64 = base64.b64encode(video_path.read_bytes()).decode("ascii")
    return {
        "type": "file",
        "file": {
            "filename": video_path.name,
            "file_data": f"data:{mime};base64,{b64}",
        },
    }


def _frame_parts(frame_paths: list[Path]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    for path in frame_paths:
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
            }
        )
    return parts


def _http_client(timeout: float = 240.0) -> httpx.Client:
    proxy = os.environ.get("https_proxy") or os.environ.get("http_proxy")
    return httpx.Client(
        timeout=timeout,
        proxy=proxy,
        headers={"User-Agent": "SpeakLab/0.2"},
    )


def friendly_api_error(status: int, body: str) -> str:
    low = body.lower()
    if status in (502, 503, 504) or "gateway time-out" in low or "timeout" in low:
        return (
            f"Kelai API {status}: gateway timed out while the model was analyzing the video. "
            "SpeakLab will retry with a lighter path; if this keeps happening, try a shorter clip."
        )
    if "<html" in low:
        title = re.search(r"<title>(.*?)</title>", body, flags=re.I | re.S)
        label = title.group(1).strip() if title else "HTML error page"
        return f"Kelai API {status}: {label}"
    return f"Kelai API {status}: {body[:280]}"


def chat_completions(
    settings: Settings,
    *,
    messages: list[dict[str, Any]],
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
    timeout: float = 240.0,
) -> str:
    url = settings.kelai_base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model or settings.kelai_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    with _http_client(timeout=timeout) as client:
        resp = client.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.kelai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code >= 400:
            raise RuntimeError(friendly_api_error(resp.status_code, resp.text))
        data = resp.json()
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected Kelai response: {data}") from exc


def _score_messages(
    settings: Settings,
    messages: list[dict[str, Any]],
    *,
    mode: str,
    model: str,
    extra: dict[str, Any],
) -> dict[str, Any]:
    raw = chat_completions(settings, messages=messages, model=model)
    parsed = _extract_json(raw)
    return _normalize(parsed, mode=mode, extra={"model": model, **extra})


def score_speech_video(
    settings: Settings,
    *,
    duration_sec: float,
    transcript: str,
    video_path: Path,
    filename: str,
    model: str | None = None,
) -> dict[str, Any]:
    use_model = model or settings.kelai_model
    text = f"""Score this student speech VIDEO for an academic course.

Original filename: {filename}
Approx original duration (seconds): {duration_sec:.1f}
Note: the attached clip may be a compressed / sampled version (opening+middle+closing).

RUBRIC:
{rubric_prompt_block()}

OPTIONAL ASR TRANSCRIPT (helper only):
\"\"\"
{transcript or "[none]"}
\"\"\"

Analyze visuals and audio. Return JSON:
{json.dumps(SCHEMA_HINT, ensure_ascii=False, indent=2)}

Include ALL rubric criterion ids exactly once.
overall_score should reflect criterion scores using rubric weights.
"""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": text},
                _video_file_part(video_path),
            ],
        },
    ]
    return _score_messages(
        settings,
        messages,
        mode="direct_video",
        model=use_model,
        extra={
            "analysis_video_bytes": video_path.stat().st_size,
            "transcript_chars": len(transcript or ""),
        },
    )


def score_speech_frames(
    settings: Settings,
    *,
    duration_sec: float,
    transcript: str,
    frame_paths: list[Path],
    filename: str,
    model: str | None = None,
) -> dict[str, Any]:
    use_model = model or "gemini-2.5-flash-lite"
    text = f"""Score this student speech using sampled frames + transcript.
(Fallback mode used because direct video analysis timed out.)

Filename: {filename}
Approx duration (seconds): {duration_sec:.1f}

RUBRIC:
{rubric_prompt_block()}

TRANSCRIPT:
\"\"\"
{transcript or "[No usable transcript extracted]"}
\"\"\"

Frames are in time order. Return JSON:
{json.dumps(SCHEMA_HINT, ensure_ascii=False, indent=2)}

Include ALL rubric criterion ids exactly once.
"""
    content: list[dict[str, Any]] = [{"type": "text", "text": text}]
    content.extend(_frame_parts(frame_paths))
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]
    return _score_messages(
        settings,
        messages,
        mode="frames_plus_transcript",
        model=use_model,
        extra={
            "frame_count": len(frame_paths),
            "transcript_chars": len(transcript or ""),
        },
    )


def score_with_fallbacks(
    settings: Settings,
    *,
    duration_sec: float,
    transcript: str,
    video_path: Path,
    frame_paths: list[Path],
    filename: str,
) -> dict[str, Any]:
    # Prefer the fast model first — Kelai/Cloudflare often 504s on long Pro video jobs.
    errors: list[str] = []
    light_frames = frame_paths[:6]

    for model in ("gemini-2.5-flash-lite", settings.kelai_model):
        try:
            return score_speech_video(
                settings,
                duration_sec=duration_sec,
                transcript=transcript,
                video_path=video_path,
                filename=filename,
                model=model,
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"direct_video/{model}: {exc}")

    try:
        return score_speech_frames(
            settings,
            duration_sec=duration_sec,
            transcript=transcript,
            frame_paths=light_frames,
            filename=filename,
            model="gemini-2.5-flash-lite",
        )
    except Exception as exc:  # noqa: BLE001
        errors.append(f"frames_plus_transcript: {exc}")
        raise RuntimeError("All scoring attempts failed. " + " | ".join(errors)) from exc
