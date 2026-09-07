import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_BASE,
  STAGE_LABEL,
  criterionLabel,
  fetchJob,
  fetchRubric,
  fetchRubricList,
  formatScore,
  stagesForJob,
  uploadVideo,
  usableTranscript,
  type Job,
  type Rubric,
  type RubricSummary,
} from "./api";
import CameraRecorder from "./CameraRecorder";

type View = "home" | "working" | "done" | "error";

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fromCamera, setFromCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<"uploading" | "waiting" | null>(null);
  const [view, setView] = useState<View>("home");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rubricList, setRubricList] = useState<RubricSummary[]>([]);
  const [rubricId, setRubricId] = useState("informative");
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [customize, setCustomize] = useState(false);
  const [customJson, setCustomJson] = useState("");

  useEffect(() => {
    fetchRubricList()
      .then((data) => {
        setRubricList(data.rubrics);
        setRubricId(data.default || "informative");
      })
      .catch(() => setRubricList([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRubric(rubricId)
      .then((r) => {
        if (cancelled) return;
        setRubric(r);
        setCustomJson(JSON.stringify(r, null, 2));
      })
      .catch(() => {
        if (!cancelled) setRubric(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rubricId]);

  const runCoaching = useCallback(
    async (f: File) => {
      setBusy(true);
      setError(null);
      setFile(f);
      setUploadPct(0);
      setUploadPhase("uploading");
      try {
        let rubricJson: string | undefined;
        if (customize) {
          try {
            JSON.parse(customJson);
          } catch {
            throw new Error("Custom rubric JSON is invalid. Fix it or turn off customize.");
          }
          rubricJson = customJson;
        }
        const jobId = await uploadVideo(f, {
          rubricId,
          rubricJson,
          onProgress: (pct) => setUploadPct(pct),
          onPhase: (phase) => setUploadPhase(phase),
        });
        setUploadPct(null);
        setUploadPhase(null);
        setView("working");
        setJob({
          id: jobId,
          status: "queued",
          stage: "queued",
          filename: f.name,
          rubric_id: rubricId,
          rubric_title: rubric?.title,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setView("error");
      } finally {
        setBusy(false);
        setUploadPct(null);
        setUploadPhase(null);
      }
    },
    [customize, customJson, rubricId, rubric?.title]
  );

  const onFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setFromCamera(false);
    setError(null);
  }, []);

  const start = async () => {
    if (!file || busy) return;
    await runCoaching(file);
  };

  const downloadSpeech = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name || "speaklab-recording.webm";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
    setFromCamera(false);
    setJob(null);
    setError(null);
    setView("home");
    if (inputRef.current) inputRef.current.value = "";
  };

  const result = job?.result;
  const scaleMax =
    Number(result?._meta?.scale_max) ||
    rubric?.scale?.max ||
    20;

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
                <span className="tag">academic speech coach · v0.3</span>
              </div>
              <h2>Pick a rubric, then record or upload.</h2>
              <p className="lede">
                Choose the syllabus rubric that matches your assignment (Informative vs
                Persuasive weight different skills). Optional: customize the JSON before
                scoring. Videos go to the course server; the model is never called from your
                browser.
                {API_BASE ? ` API: ${API_BASE}` : ""}
              </p>

              <div className="rubric-picker">
                <div className="recorder-head">
                  <strong>Scoring rubric</strong>
                  <span className="hint">from UCUG 1504 syllabus · change before you start</span>
                </div>
                <div className="rubric-cards">
                  {(rubricList.length
                    ? rubricList
                    : [
                        {
                          id: "informative",
                          title: "Presentation 1 · Informative Speech",
                          description: "Syllabus informative weighting (/20).",
                          total_points: 20,
                          criterion_count: 11,
                        },
                        {
                          id: "persuasive",
                          title: "Presentation 2 · Persuasive Speech",
                          description: "Heavier eye contact & pathos (/20).",
                          total_points: 20,
                          criterion_count: 11,
                        },
                        {
                          id: "generic",
                          title: "General practice (1–5)",
                          description: "Lightweight practice scale.",
                          total_points: 5,
                          criterion_count: 6,
                        },
                      ]
                  ).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`rubric-card ${rubricId === r.id ? "on" : ""}`}
                      disabled={busy}
                      onClick={() => {
                        setRubricId(r.id);
                        setCustomize(false);
                      }}
                    >
                      <strong>{r.title}</strong>
                      <span>
                        {r.criterion_count} criteria · max {r.total_points}
                      </span>
                      <p>{r.description}</p>
                    </button>
                  ))}
                </div>
                <label className="custom-toggle">
                  <input
                    type="checkbox"
                    checked={customize}
                    disabled={busy}
                    onChange={(e) => setCustomize(e.target.checked)}
                  />
                  Customize this rubric (edit JSON before upload)
                </label>
                {customize && (
                  <textarea
                    className="custom-json"
                    value={customJson}
                    disabled={busy}
                    onChange={(e) => setCustomJson(e.target.value)}
                    rows={14}
                    spellCheck={false}
                  />
                )}
              </div>

              <CameraRecorder
                disabled={busy}
                onError={(message) => setError(message)}
                onRecorded={(recorded) => {
                  setFromCamera(true);
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
                <p>mp4 · mov · webm · ideally 4–5 minutes (assignment length)</p>
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
              <h3>{rubric?.title || "Scoring rubric"}</h3>
              <p className="hint">
                {rubric
                  ? `${rubric.course} · ${rubric.scale.label} · ${rubric.version}`
                  : "Loading rubric…"}
              </p>
              <div className="rubric-list">
                {(rubric?.criteria || []).map((c) => (
                  <div className="rubric-item" key={c.id}>
                    <div className="weight">
                      {c.max_points != null
                        ? `${c.max_points} pts`
                        : `${Math.round((c.weight || 0) * 100)}%`}
                    </div>
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
                  {job.rubric_title ? ` · ${job.rubric_title}` : ""}
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
                  {fromCamera && file && (
                    <button className="btn ghost" type="button" onClick={downloadSpeech}>
                      Download your recording
                    </button>
                  )}
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
                  rubric: {String(result._meta?.rubric_title || job?.rubric_title || "—")} ·
                  scored from: {String(result._meta?.mode || "—")} · model:{" "}
                  {String(result._meta?.model || "—")}
                </p>
                <div className="score-row">
                  <div className="big-score">
                    {formatScore(result.overall_score)}
                    <small>/ {scaleMax} overall</small>
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
                  {(result.criteria || []).map((c) => {
                    const maxPts = rubric?.criteria?.find((x) => x.id === c.id)?.max_points;
                    return (
                      <div className="row" key={c.id}>
                        <div className="n">
                          {formatScore(c.score)}
                          {maxPts != null ? (
                            <small style={{ display: "block", fontSize: "0.65rem" }}>
                              / {maxPts}
                            </small>
                          ) : null}
                        </div>
                        <div>
                          <strong>{criterionLabel(rubric, c.id)}</strong>
                          <p style={{ margin: "0.25rem 0 0", color: "var(--ink-soft)" }}>
                            {c.feedback}
                          </p>
                        </div>
                      </div>
                    );
                  })}
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
                  {fromCamera && file && (
                    <button className="btn ghost" type="button" onClick={downloadSpeech}>
                      Download your recording
                    </button>
                  )}
                  <button className="btn" onClick={reset}>
                    Score another video
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        <footer className="foot">
          SpeakLab · UCUG 1504 TA prototype · choose Informative / Persuasive / practice
        </footer>
      </div>
    </div>
  );
}
