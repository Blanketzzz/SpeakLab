import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  onRecorded: (file: File) => void;
  onError: (message: string) => void;
};

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function cameraBlockReason(): string | null {
  if (typeof window === "undefined") return null;
  const secure =
    window.isSecureContext ||
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
      if (!secure) {
    return (
      "Camera permission will not appear on plain HTTP. " +
      "Use the GitHub Pages HTTPS link from your TA, or https://10.123.4.1/ " +
      "(accept the certificate warning), or upload a file instead."
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return (
      "This browser has no camera API (common in WeChat / some school browsers). " +
      "Use Chrome or Edge, or upload a recorded file instead."
    );
  }
  return null;
}

export default function CameraRecorder({ disabled, onRecorded, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busyCam, setBusyCam] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  useEffect(() => {
    setBlockReason(cameraBlockReason());
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      stopTracks();
    };
  }, [clearTimer, stopTracks]);

  const openCamera = async () => {
    if (disabled || busyCam) return;
    const blocked = cameraBlockReason();
    if (blocked) {
      setBlockReason(blocked);
      onError(blocked);
      return;
    }
    setBusyCam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
      setElapsed(0);
      setBlockReason(null);
    } catch (e) {
      let msg = "Could not open camera/microphone.";
      if (e instanceof DOMException) {
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          msg =
            "Permission denied. Check the address-bar camera icon / site settings, " +
            "allow camera + microphone, then reload. If you previously clicked Block, " +
            "the browser will not ask again until you reset the permission.";
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          msg = "No camera/microphone found on this computer.";
        } else if (e.name === "NotReadableError") {
          msg = "Camera is busy (another app may be using it). Close Zoom/Teams and retry.";
        } else {
          msg = `${e.name}: ${e.message}`;
        }
      } else if (e instanceof Error) {
        msg = e.message;
      }
      onError(msg);
      stopTracks();
      setLive(false);
    } finally {
      setBusyCam(false);
    }
  };

  const closeCamera = () => {
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    setRecording(false);
    setLive(false);
    setElapsed(0);
  };

  const startRecording = () => {
    if (!streamRef.current || recording) return;
    const mimeType = pickMimeType();
    try {
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = () => onError("Recording failed.");
      recorder.onstop = () => {
        clearTimer();
        const type = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        setRecording(false);

        if (blob.size < 1000) {
          onError("Recording was empty. Try again.");
          return;
        }
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = new File([blob], `speaklab-recording-${stamp}.${ext}`, { type });
        stopTracks();
        setLive(false);
        onRecorded(file);
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setElapsed(0);
      clearTimer();
      timerRef.current = window.setInterval(() => {
        setElapsed((n) => n + 1);
      }, 1000);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not start recorder.");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const camDisabled = Boolean(disabled || busyCam || blockReason);

  return (
    <div className="recorder">
      <div className="recorder-head">
        <strong>Record in browser</strong>
        <span className="hint">
          uses your camera + mic · stop → auto upload & score
        </span>
      </div>

      {blockReason && <p className="cam-warn">{blockReason}</p>}

      <div className={`preview ${live ? "on" : ""}`}>
        <video ref={videoRef} muted playsInline autoPlay />
        {!live && <div className="preview-empty">camera off</div>}
        {recording && (
          <div className="rec-badge">
            <i /> REC {formatElapsed(elapsed)}
          </div>
        )}
      </div>

      <div className="actions">
        {!live && (
          <button className="btn" disabled={camDisabled} onClick={openCamera}>
            {busyCam ? "Opening camera…" : "Open camera"}
          </button>
        )}
        {live && !recording && (
          <>
            <button className="btn" disabled={disabled} onClick={startRecording}>
              Start recording
            </button>
            <button className="btn ghost" onClick={closeCamera}>
              Close camera
            </button>
          </>
        )}
        {live && recording && (
          <button className="btn danger" disabled={disabled} onClick={stopRecording}>
            Stop & upload
          </button>
        )}
      </div>
    </div>
  );
}
