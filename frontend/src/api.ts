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

export async function fetchRubric(): Promise<Rubric> {
  const res = await fetch("/api/rubric");
  if (!res.ok) throw new Error("Failed to load rubric");
  return res.json();
}

export async function uploadVideo(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return data.job_id as string;
}

export async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${jobId}`);
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
