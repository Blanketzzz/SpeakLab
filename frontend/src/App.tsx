import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_BASE,
  CRITERION_LABELS,
  STAGE_LABEL,
  fetchJob,
  fetchRubric,
  formatScore,
  stagesForJob,
  uploadVideo,
  usableTranscript,
  type Job,
  type Rubric,
} from "./api";
import CameraRecorder from "./CameraRecorder";

type View = "home" | "working" | "done" | "error";

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<"uploading" | "waiting" | null>(null);
  const [view, setView] = useState<View>("home");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);

  useEffect(() => {
    fetchRubric()
      .then(setRubric)
      .catch(() => setRubric(null));
  }, []);

  const runCoaching = useCallback(async (f: File) => {
    setBusy(true);
    setError(null);
    setFile(f);
    setUploadPct(0);
    setUploadPhase("uploading");
    try {
      const jobId = await uploadVideo(
        f,
        (pct) => setUploadPct(pct),
        (phase) => setUploadPhase(phase)
      );
      setUploadPct(null);
      setUploadPhase(null);
      setView("working");
      setJob({
        id: jobId,
        status: "queued",
        stage: "queued",
        filename: f.name,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setView("error");
    } finally {
      setBusy(false);
      setUploadPct(null);
      setUploadPhase(null);
    }
  }, []);

  const onFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setError(null);
  }, []);

  const start = async () => {
    if (!file || busy) return;
    await runCoaching(file);
  };

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "processing")) return;
    const timer = setInterval(async () => {
      try {
        const next = await fetchJob(job.id);
        setJob(next);
        if (next.status === "done") setView("done");
        if (next.status === "error") {
          setError(next.error || "Scoring failed");
          setView("error");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Polling failed");
        setView("error");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);

  const reset = () => {
    setFile(null);
    setJob(null);
    setError(null);
    setView("home");
    if (inputRef.current) inputRef.current.value = "";
  };

  const result = job?.result;

  return (
    <div className="app">
      <div className="grid-bg" aria-hidden>
        <div className="doodle a">✦</div>
        <div className="doodle b">◉</div>
        <div className="doodle c">♪</div>
      </div>

      <div className="wrap">
        <header className="top">
          <div className="pill">course · The Art of Public Speaking</div>
          <div className="pill">open link · no login</div>
        </header>

        {view === "home" && (
          <>
            <section className="hero">
              <div className="brand-row">
                <h1 className="brand">
                  SpeakLab<span className="cursor" aria-hidden />
                </h1>
                <span className="tag">academic speech coach · v0.2</span>
              </div>
              <h2>Record or upload a speech. Get rubric-based feedback.</h2>
              <p className="lede">
                Practice in-browser with your webcam, or drop an existing video.
                Videos are uploaded to the course server, which then calls the AI
                API — the model is never called from your browser.
                {API_BASE
                  ? " You are on GitHub Pages; large uploads may be slow because the API is reached via a public relay. Prefer the campus server link for class work."
                  : " You are on the course server — uploads stay on campus LAN."}
              </p>
              {API_BASE && (
                <p className="cam-warn" style={{ marginTop: "0.85rem" }}>
                  Class / large videos: open{" "}
                  <a href="https://10.123.4.1/" style={{ color: "inherit", fontWeight: 700 }}>
                    https://10.123.4.1/
                  </a>{" "}
                  (accept the certificate warning once). That path is{" "}
                  browser → campus server → AI, with no Cloudflare hop.
                </p>
              )}

              <CameraRecorder
                disabled={busy}
                onError={(message) => setError(message)}
                onRecorded={(recorded) => {
                  void runCoaching(recorded);
                }}
              />

              <div className="or-line">
                <span>or upload a file</span>
              </div>

              <div
                className={`upload ${dragOver ? "over" : ""}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  onFile(e.dataTransfer.files?.[0] ?? null);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                }}
              >
                <strong>{file ? file.name : "Drop / choose your speech video"}</strong>
                <p>mp4 · mov · webm · ideally under ~10 minutes</p>
                <input
                  ref={inputRef}
                  className="hidden"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv,.m4v"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="actions">
                <button className="btn" disabled={!file || busy} onClick={start}>
                  {busy
                    ? uploadPhase === "waiting"
                      ? "Waiting for server…"
                      : uploadPct != null
                        ? `Uploading… ${uploadPct}%`
                        : "Uploading…"
                    : "Run coaching pass"}
                </button>
                {file && (
                  <button className="btn ghost" onClick={reset}>
                    Clear
                  </button>
                )}
              </div>
              {error && <p className="err">{error}</p>}
            </section>

            <section className="section" id="rubric">
              <h3>Scoring rubric</h3>
              <p className="hint">
                {rubric
                  ? `${rubric.course} · ${rubric.scale.label} · ${rubric.version}`
                  : "Loading rubric…"}
              </p>
              <div className="rubric-list">
                {(rubric?.criteria || []).map((c) => (
                  <div className="rubric-item" key={c.id}>
                    <div className="weight">{Math.round(c.weight * 100)}%</div>
                    <div>
                      <h4>{c.name}</h4>
                      <ul>
                        {c.look_for.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {(view === "working" || view === "done" || view === "error") && (
          <>
            {view === "working" && job && (
              <section className="section progress">
                <h2>Working on it…</h2>
                <p className="hint">
                  {job.filename}
                  {job.duration_sec ? ` · ${job.duration_sec.toFixed(0)}s` : ""}
                  {job.path ? ` · path: ${job.path}` : ""}
                </p>
                <div className="stages">
                  {stagesForJob(job).map((s) => {
                    const order = stagesForJob(job);
                    const currentIdx = Math.max(0, order.indexOf(job.stage || "queued"));
                    const idx = order.indexOf(s);
                    const cls =
                      idx < currentIdx ? "ok" : idx === currentIdx ? "on" : "";
                    return (
                      <span key={s} className={`chip ${cls}`}>
                        {STAGE_LABEL[s] || s}
                      </span>
                    );
                  })}
                </div>
              </section>
            )}

            {view === "error" && (
              <section className="section">
                <h2 className="err">Something broke</h2>
                <p>{error}</p>
                <div className="actions">
                  <button className="btn" onClick={reset}>
                    Try again
                  </button>
                </div>
              </section>
            )}

            {view === "done" && result && (
              <section className="section result">
                <h2>Coaching report</h2>
                <p className="hint">
                  scored from: {String(result._meta?.mode || "—")} · model:{" "}
                  {String(result._meta?.model || "—")}
                  {result._meta?.mode === "direct_video"
                    ? " · frames/ASR were not used for this score"
                    : " · used frames+ASR fallback"}
                </p>
                <div className="score-row">
                  <div className="big-score">
                    {formatScore(result.overall_score)}
                    <small>/ 5 overall</small>
                  </div>
                  <p>{result.summary}</p>
                </div>

                <div className="cols">
                  <div>
                    <h3>Strengths</h3>
                    <ul className="list">
                      {(result.strengths || []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Priority fixes</h3>
                    <ul className="list">
                      {(result.improvements || []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <h3 style={{ marginTop: "1.25rem" }}>By criterion</h3>
                <div className="criteria">
                  {(result.criteria || []).map((c) => (
                    <div className="row" key={c.id}>
                      <div className="n">{formatScore(c.score)}</div>
                      <div>
                        <strong>{CRITERION_LABELS[c.id] || c.id}</strong>
                        <p style={{ margin: "0.25rem 0 0", color: "var(--ink-soft)" }}>
                          {c.feedback}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {!!result.coach_checklist?.length && (
                  <>
                    <h3 style={{ marginTop: "1.25rem" }}>Practice checklist</h3>
                    <ul className="list">
                      {result.coach_checklist.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}

                {usableTranscript(job?.transcript) && (
                  <>
                    <h3 style={{ marginTop: "1.25rem" }}>ASR transcript (fallback only)</h3>
                    <pre className="transcript">{usableTranscript(job?.transcript)}</pre>
                  </>
                )}

                <div className="actions" style={{ marginTop: "1.25rem" }}>
                  <button className="btn" onClick={reset}>
                    Score another video
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        <footer className="foot">
          SpeakLab · course TA prototype · rubric in backend/rubric.py
          {API_BASE ? ` · API ${API_BASE}` : ""}
        </footer>
      </div>
    </div>
  );
}
