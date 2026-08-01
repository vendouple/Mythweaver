#!/usr/bin/env python3
"""Chatterbox TTS sidecar service.

A small, persistent, loopback-only HTTP service that owns a single
``ChatterboxTTS`` model instance and serves synthesis requests from the
Next.js app (or any local client) without paying model-load cost per call.

Endpoints:
    GET  /health      -> liveness/readiness + discovered voices
    POST /synthesize  -> JSON {text, voiceId, exaggeration?, cfgWeight?}
                         returns audio/wav bytes with duration metadata headers

Design constraints:
    * Binds to 127.0.0.1 only (loopback); never reachable off-host.
    * Loads the model exactly once, lazily on first use, guarded by a lock.
    * Serializes synthesis through a single lock (GPU inference is not
      thread-safe and the model is stateful per-call).
    * Never writes generated audio to disk; WAV is rendered in-memory.
    * Voice reference files are discovered under the workspace ``public/voice``
      directory; voice ids are validated strictly against that directory to
      prevent path traversal.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import sys
import threading
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# services/tts/server.py -> workspace root is two levels up.
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
VOICE_DIR = WORKSPACE_ROOT / "public" / "voice"

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5123

# Reference audio extensions we accept as voice prompts.
VOICE_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg"}

# Bounds for generation knobs.
EXAGGERATION_MIN, EXAGGERATION_MAX = 0.0, 2.0
CFG_WEIGHT_MIN, CFG_WEIGHT_MAX = 0.0, 1.0
MAX_TEXT_CHARS = 4000

LOG = logging.getLogger("tts-sidecar")


# ---------------------------------------------------------------------------
# Model manager: single lazy-loaded instance, serialized access
# ---------------------------------------------------------------------------


class ModelManager:
    """Owns the ChatterboxTTS model and serializes synthesis."""

    def __init__(self) -> None:
        self._model: Any = None
        self._load_lock = threading.Lock()
        self._synth_lock = threading.Lock()
        self._load_error: Optional[str] = None

    def _ensure_loaded(self) -> Any:
        """Load the model exactly once (thread-safe, lazy)."""
        if self._model is not None:
            return self._model
        with self._load_lock:
            if self._model is not None:  # re-check inside the lock
                return self._model
            try:
                import torch  # deferred: heavy import only when needed
                from chatterbox.tts import ChatterboxTTS

                device = "cuda" if torch.cuda.is_available() else "cpu"
                LOG.info("Loading ChatterboxTTS on %s ...", device)
                self._model = ChatterboxTTS.from_pretrained(device=device)
                LOG.info("Model loaded (sample rate=%s).", self.sample_rate)
            except Exception as exc:  # noqa: BLE001 - report any load failure
                self._load_error = f"{type(exc).__name__}: {exc}"
                LOG.exception("Failed to load ChatterboxTTS")
                raise
        return self._model

    @property
    def ready(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> Optional[str]:
        return self._load_error

    @property
    def sample_rate(self) -> int:
        model = self._model
        return int(getattr(model, "sr", 24000)) if model is not None else 24000

    def synthesize(
        self,
        *,
        text: str,
        audio_prompt_path: Path,
        exaggeration: float,
        cfg_weight: float,
    ) -> tuple[bytes, float, int]:
        """Run one synthesis, serialized across all requests.

        Returns (wav_bytes, duration_seconds, sample_rate).
        """
        model = self._ensure_loaded()
        with self._synth_lock:
            started = time.perf_counter()
            wav = model.generate(
                text=text,
                audio_prompt_path=str(audio_prompt_path),
                exaggeration=exaggeration,
                cfg_weight=cfg_weight,
            )
            elapsed = time.perf_counter() - started

        import torchaudio  # deferred import, matches model deps

        sample_rate = int(getattr(model, "sr", 24000))
        num_frames = int(wav.shape[-1])
        duration = num_frames / float(sample_rate)

        # Render WAV in-memory only; nothing is persisted to disk.
        buffer = io.BytesIO()
        torchaudio.save(buffer, wav, sample_rate, format="wav")
        LOG.info(
            "Synthesized %d frames (%.2fs audio) in %.2fs",
            num_frames,
            duration,
            elapsed,
        )
        return buffer.getvalue(), duration, sample_rate


MODEL = ModelManager()


# ---------------------------------------------------------------------------
# Voice discovery & validation
# ---------------------------------------------------------------------------


def discover_voices() -> dict[str, Path]:
    """Map voice id (file stem) -> reference audio path under VOICE_DIR."""
    voices: dict[str, Path] = {}
    if not VOICE_DIR.is_dir():
        return voices
    for entry in sorted(VOICE_DIR.iterdir()):
        if entry.is_file() and entry.suffix.lower() in VOICE_EXTENSIONS:
            voices[entry.stem] = entry
    return voices


def resolve_voice(voice_id: str) -> Optional[Path]:
    """Resolve a voice id to a reference file, rejecting path traversal.

    The id must be a bare filename stem (no separators) that resolves to a
    real file strictly inside VOICE_DIR.
    """
    if not voice_id or len(voice_id) > 128:
        return None
    candidate = Path(voice_id)
    # Reject anything that is not a plain name (blocks "..", "/", "\\", drives).
    if candidate.name != voice_id or candidate.is_absolute():
        return None
    if voice_id in {".", ".."}:
        return None
    path = discover_voices().get(voice_id)
    if path is None:
        return None
    resolved = path.resolve()
    try:
        resolved.relative_to(VOICE_DIR.resolve())
    except ValueError:
        return None
    return resolved if resolved.is_file() else None


# ---------------------------------------------------------------------------
# HTTP layer (stdlib only)
# ---------------------------------------------------------------------------


def _clamp(value: Any, lo: float, hi: float, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, number))


class TTSRequestHandler(BaseHTTPRequestHandler):
    server_version = "ChatterboxSidecar/1.0"
    protocol_version = "HTTP/1.1"

    # -- helpers ---------------------------------------------------------

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_wav(self, wav: bytes, duration: float, sample_rate: int) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.send_header("X-Audio-Duration", f"{duration:.3f}")
        self.send_header("X-Audio-Sample-Rate", str(sample_rate))
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, fmt: str, *args: Any) -> None:  # route via logging
        LOG.info("%s - %s", self.address_string(), fmt % args)

    # -- routes ----------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
        if self.path.split("?", 1)[0] == "/health":
            voices = discover_voices()
            status = "ok" if MODEL.ready else ("error" if MODEL.load_error else "loading")
            payload = {
                "status": status,
                "modelLoaded": MODEL.ready,
                "loadError": MODEL.load_error,
                "voiceDir": str(VOICE_DIR),
                "voices": sorted(voices.keys()),
                "voiceCount": len(voices),
            }
            code = HTTPStatus.OK if not MODEL.load_error else HTTPStatus.SERVICE_UNAVAILABLE
            self._send_json(code, payload)
        else:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802 (stdlib naming)
        request_id = uuid.uuid4().hex[:12]
        if self.path.split("?", 1)[0] != "/synthesize":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return

        # --- parse body ---
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 64 * 1024:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid or missing body"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "body must be valid JSON"})
            return
        if not isinstance(payload, dict):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "body must be a JSON object"})
            return

        # --- validate fields ---
        text = payload.get("text")
        if not isinstance(text, str) or not text.strip():
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "text must be a non-empty string"})
            return
        text = text.strip()
        if len(text) > MAX_TEXT_CHARS:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": f"text exceeds {MAX_TEXT_CHARS} characters"},
            )
            return

        voice_id = payload.get("voiceId")
        if not isinstance(voice_id, str) or not voice_id.strip():
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "voiceId must be a non-empty string"})
            return
        voice_path = resolve_voice(voice_id.strip())
        if voice_path is None:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "error": f"unknown or invalid voiceId: {voice_id!r}",
                    "availableVoices": sorted(discover_voices().keys()),
                },
            )
            return

        exaggeration = _clamp(payload.get("exaggeration", 0.5), EXAGGERATION_MIN, EXAGGERATION_MAX, 0.5)
        cfg_weight = _clamp(payload.get("cfgWeight", 0.5), CFG_WEIGHT_MIN, CFG_WEIGHT_MAX, 0.5)

        LOG.info(
            "[%s] synthesize voice=%s chars=%d exag=%.3f cfg=%.3f",
            request_id,
            voice_id,
            len(text),
            exaggeration,
            cfg_weight,
        )

        # --- synthesize (serialized) ---
        try:
            wav, duration, sample_rate = MODEL.synthesize(
                text=text,
                audio_prompt_path=voice_path,
                exaggeration=exaggeration,
                cfg_weight=cfg_weight,
            )
        except Exception as exc:  # noqa: BLE001 - surface inference failure
            LOG.exception("[%s] synthesis failed", request_id)
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": f"synthesis failed: {type(exc).__name__}: {exc}"},
            )
            return

        self._send_wav(wav, duration, sample_rate)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Chatterbox TTS loopback sidecar")
    parser.add_argument("--host", default=DEFAULT_HOST, help="bind host (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"bind port (default {DEFAULT_PORT})")
    parser.add_argument(
        "--preload",
        action="store_true",
        help="load the model at startup instead of on first request",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Loopback-only guard: this service must never bind to a public interface.
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("sidecar is loopback-only; refusing to bind a non-local host")

    if args.preload:
        try:
            MODEL._ensure_loaded()
        except Exception:
            LOG.warning("Preload failed; service will retry lazily per request.")

    server = ThreadingHTTPServer((args.host, args.port), TTSRequestHandler)
    LOG.info("TTS sidecar listening on http://%s:%d (voice dir: %s)", args.host, args.port, VOICE_DIR)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOG.info("Shutting down.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
