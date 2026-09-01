export type CriterionScore = {
  id: string;
  score: number;
  feedback: string;
  evidence?: string[];
};

export type ScoreResult = {
  overall_score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  criteria: CriterionScore[];
  coach_checklist?: string[];
  _meta?: Record<string, unknown>;
};

export type Job = {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  stage: string;
  path?: string;
  filename: string;
  duration_sec?: number;
  transcript?: string;
  result?: ScoreResult;
  error?: string;
};

export type Rubric = {
  version: string;
  course: string;
  scale: { min: number; max: number; label: string };
  criteria: Array<{
    id: string;
    name: string;
    weight: number;
    look_for: string[];
  }>;
};

/** Primary path stages (always). Fallback stages appear only if video scoring fails. */
export const PRIMARY_STAGES = [
  "queued",
  "probing",
  "normalizing",
  "preparing_video",
  "scoring_video",
  "done",
] as const;

export const FALLBACK_STAGES = [
  "fallback_frames",
  "fallback_transcript",
  "scoring_frames",
] as const;

export const STAGE_LABEL: Record<string, string> = {
  queued: "queued",
  probing: "probe video",
  normalizing: "normalize recording",
  preparing_video: "compress for model",
  scoring_video: "model watches video",
  fallback_frames: "fallback: sample frames",
  fallback_transcript: "fallback: ASR",
  scoring_frames: "fallback: score frames",
  done: "done",
  error: "error",
};

export const CRITERION_LABELS: Record<string, string> = {
  structure: "Structure & Organization",
  content: "Content & Argument",
  language: "Language & Clarity",
  delivery_voice: "Voice & Timing",
  delivery_body: "Presence & Body Language",
  engagement: "Audience Engagement",
};


/** Backend origin. Empty = same host (server deploy). Set VITE_API_BASE for GitHub Pages. */
export const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) || ""
).replace(/\/$/, "");

export function apiUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${API_BASE}${path}`;
}

export async function fetchRubric(): Promise<Rubric> {
  const res = await fetch(apiUrl("/api/rubric"));
  if (!res.ok) throw new Error("Failed to load rubric");
  return res.json();
}

export async function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
  onPhase?: (phase: "uploading" | "waiting") => void
): Promise<string> {
  const body = new FormData();
  body.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const started = Date.now();
    xhr.open("POST", apiUrl("/api/upload"));
    xhr.timeout = 15 * 60 * 1000; // 15 min for slow tunnels

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      // Keep 99 max until bytes leave the browser; 100 means "waiting for reply".
      onProgress?.(Math.max(0, Math.min(99, Math.round((ev.loaded / ev.total) * 100))));
    };

    xhr.upload.onload = () => {
      onProgress?.(100);
      onPhase?.("waiting");
    };

    xhr.onload = () => {
      onProgress?.(100);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.job_id as string);
        } catch {
          reject(new Error("Upload succeeded but response was invalid."));
        }
        return;
      }
      let detail = `Upload failed (${xhr.status})`;
      try {
        detail = JSON.parse(xhr.responseText).detail || detail;
      } catch {
        /* ignore */
      }
      reject(new Error(detail));
    };

    xhr.onerror = () => {
      const secs = Math.round((Date.now() - started) / 1000);
      const viaTunnel = location.hostname.includes("trycloudflare.com");
      reject(
        new Error(
          viaTunnel
            ? `Upload network error after ${secs}s. The public tunnel is too slow/unreliable for large videos — use campus https://10.123.4.1/ or a shorter clip.`
            : `Upload network error after ${secs}s. Check your connection and try again.`
        )
      );
    };

    xhr.ontimeout = () => {
      const viaTunnel = location.hostname.includes("trycloudflare.com");
      reject(
        new Error(
          viaTunnel
            ? "Upload timed out on the public tunnel (often hangs near 99%). Use campus https://10.123.4.1/ for large files."
            : "Upload timed out. Try a shorter/smaller video."
        )
      );
    };

    onPhase?.("uploading");
    xhr.send(body);
  });
}

export async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}`));
  if (!res.ok) throw new Error("Failed to load job");
  return res.json();
}

export function formatScore(n: number | string | undefined) {
  if (n == null || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return v.toFixed(1);
}

/** Treat Whisper noise like "." lines as empty. */
export function usableTranscript(text?: string | null) {
  if (!text) return "";
  const cleaned = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[.。…·•]+$/.test(l))
    .join("\n")
    .trim();
  return cleaned;
}

export function stagesForJob(job: Job): string[] {
  const inFallback =
    job.path === "frames_fallback" ||
    FALLBACK_STAGES.includes(job.stage as (typeof FALLBACK_STAGES)[number]);
  if (inFallback) {
    return [...PRIMARY_STAGES.slice(0, 4), ...FALLBACK_STAGES, "done"];
  }
  return [...PRIMARY_STAGES];
}
