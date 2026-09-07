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
  rubric_id?: string;
  rubric_title?: string;
  result?: ScoreResult;
  error?: string;
};

export type RubricCriterion = {
  id: string;
  name: string;
  max_points?: number;
  weight: number;
  look_for: string[];
};

export type Rubric = {
  id?: string;
  version: string;
  course: string;
  title?: string;
  assignment?: string;
  description?: string;
  scale: { min: number; max: number; label: string };
  criteria: RubricCriterion[];
};

export type RubricSummary = {
  id: string;
  title: string;
  version: string;
  assignment?: string;
  description: string;
  scale: { min: number; max: number; label: string };
  criterion_count: number;
  total_points: number;
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

/** Backend origin. Empty = same host (server deploy). Set VITE_API_BASE for GitHub Pages. */
export const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) || ""
).replace(/\/$/, "");

export function apiUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${API_BASE}${path}`;
}

export async function fetchRubricList(): Promise<{
  default: string;
  rubrics: RubricSummary[];
}> {
  const res = await fetch(apiUrl("/api/rubrics"));
  if (!res.ok) throw new Error("Failed to load rubrics");
  return res.json();
}

export async function fetchRubric(rubricId?: string): Promise<Rubric> {
  const path = rubricId ? `/api/rubric/${encodeURIComponent(rubricId)}` : "/api/rubric";
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error("Failed to load rubric");
  return res.json();
}

export type UploadOpts = {
  rubricId?: string;
  rubricJson?: string;
  onProgress?: (pct: number) => void;
  onPhase?: (phase: "uploading" | "waiting") => void;
};

export async function uploadVideo(file: File, opts: UploadOpts = {}): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  body.append("rubric_id", opts.rubricId || "informative");
  if (opts.rubricJson) body.append("rubric_json", opts.rubricJson);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const started = Date.now();
    xhr.open("POST", apiUrl("/api/upload"));
    xhr.timeout = 15 * 60 * 1000;

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      opts.onProgress?.(Math.max(0, Math.min(99, Math.round((ev.loaded / ev.total) * 100))));
    };

    xhr.upload.onload = () => {
      opts.onProgress?.(100);
      opts.onPhase?.("waiting");
    };

    xhr.onload = () => {
      opts.onProgress?.(100);
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
      reject(new Error(`Upload network error after ${secs}s. Check your connection and try again.`));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out. Try a shorter/smaller video."));
    };

    opts.onPhase?.("uploading");
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
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
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

export function criterionLabel(rubric: Rubric | null | undefined, id: string) {
  const hit = rubric?.criteria?.find((c) => c.id === id);
  return hit?.name || id;
}
