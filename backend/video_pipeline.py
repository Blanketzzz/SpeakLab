from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


def _run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-2000:]}"
        )


def _parse_hms(hms: str) -> float:
    h, m, s = hms.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def probe_duration(video_path: Path) -> float:
    """
    Browser MediaRecorder WebM often lacks format.duration.
    Fall back to stream tags, then a lightweight decode pass.
    """
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=duration",
            "-of",
            "json",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(proc.stdout or "{}")
    fmt_dur = (data.get("format") or {}).get("duration")
    if fmt_dur not in (None, "N/A", "n/a"):
        try:
            return float(fmt_dur)
        except (TypeError, ValueError):
            pass
    for stream in data.get("streams") or []:
        stream_dur = stream.get("duration")
        if stream_dur not in (None, "N/A", "n/a"):
            try:
                return float(stream_dur)
            except (TypeError, ValueError):
                continue

    # Decode timestamps — works for Chrome webm without container duration.
    proc = subprocess.run(
        ["ffmpeg", "-i", str(video_path), "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    err = proc.stderr or ""
    times = re.findall(r"time=(\d{2}:\d{2}:\d{2}\.\d+)", err)
    if times:
        return max(_parse_hms(t) for t in times)
    match = re.search(r"Duration:\s*(\d{2}:\d{2}:\d{2}\.\d+)", err)
    if match:
        return _parse_hms(match.group(1))

    raise RuntimeError(
        "Could not determine video duration (common with some browser recordings). "
        "Try recording a bit longer or upload an mp4."
    )


def normalize_to_mp4(video_path: Path, out_path: Path | None = None) -> Path:
    """Re-encode to mp4 so downstream tooling always has duration + AAC audio."""
    out = out_path or (video_path.with_suffix(".normalized.mp4"))
    _run(
        [
            "ffmpeg",
            "-y",
            "-fflags",
            "+genpts",
            "-i",
            str(video_path),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(out),
        ]
    )
    if not out.exists() or out.stat().st_size == 0:
        raise RuntimeError("Failed to normalize recording to mp4")
    return out


def make_analysis_video(
    video_path: Path,
    out_path: Path,
    *,
    max_height: int = 360,
    target_total_mb: float = 2.0,
    max_seconds: float = 30.0,
) -> Path:
    """
    Build a compact copy for multimodal API upload.
    Long talks are trimmed to opening/middle/closing clips to avoid gateway timeouts.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    duration = max(probe_duration(video_path), 0.5)
    work = out_path.parent

    source = video_path
    if duration > max_seconds:
        # Keep three windows so structure + closing are still visible.
        clip = max_seconds / 3.0
        starts = [0.0, max((duration - clip) / 2.0, 0.0), max(duration - clip, 0.0)]
        parts: list[Path] = []
        list_file = work / "concat.txt"
        for i, start in enumerate(starts):
            part = work / f"seg_{i}.mp4"
            _run(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    f"{start:.3f}",
                    "-i",
                    str(video_path),
                    "-t",
                    f"{clip:.3f}",
                    "-c",
                    "copy",
                    str(part),
                ]
            )
            parts.append(part)
        list_file.write_text(
            "".join(f"file '{p.name}'\n" for p in parts), encoding="utf-8"
        )
        concat_path = work / "concat_raw.mp4"
        _run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-c",
                "copy",
                str(concat_path),
            ]
        )
        source = concat_path
        duration = max(probe_duration(source), 0.5)

    audio_kbps = 48
    video_budget_bits = max(target_total_mb * 8_000_000 - audio_kbps * 1000 * duration, 200_000)
    video_kbps = max(int(video_budget_bits / duration / 1000), 180)
    video_kbps = min(video_kbps, 900)

    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-vf",
            f"scale=-2:min({max_height}\\,ih)",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-b:v",
            f"{video_kbps}k",
            "-maxrate",
            f"{int(video_kbps * 1.25)}k",
            "-bufsize",
            f"{int(video_kbps * 2)}k",
            "-c:a",
            "aac",
            "-b:a",
            f"{audio_kbps}k",
            "-ac",
            "1",
            "-movflags",
            "+faststart",
            str(out_path),
        ]
    )
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError("Failed to build analysis video")
    return out_path


def extract_frames(video_path: Path, out_dir: Path, count: int = 8) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = max(probe_duration(video_path), 0.1)
    start = min(0.4, duration * 0.02)
    end = max(duration - 0.4, start + 0.1)
    usable = max(end - start, 0.1)
    paths: list[Path] = []
    for i in range(count):
        t = start + (usable * (i + 0.5) / count)
        out = out_dir / f"frame_{i:02d}.jpg"
        _run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{t:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-q:v",
                "4",
                str(out),
            ]
        )
        if out.exists() and out.stat().st_size > 0:
            paths.append(out)
    if not paths:
        raise RuntimeError("Failed to extract any frames from the video.")
    return paths


def extract_audio(video_path: Path, out_wav: Path) -> Path:
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(out_wav),
        ]
    )
    return out_wav


def transcribe_whisper(audio_path: Path, model: str = "base") -> str:
    out_dir = audio_path.parent
    _run(
        [
            "whisper",
            str(audio_path),
            "--model",
            model,
            "--output_format",
            "txt",
            "--output_dir",
            str(out_dir),
            "--fp16",
            "False",
        ]
    )
    txt = out_dir / f"{audio_path.stem}.txt"
    if not txt.exists():
        candidates = list(out_dir.glob("*.txt"))
        if not candidates:
            return ""
        txt = candidates[0]
    return txt.read_text(encoding="utf-8").strip()
