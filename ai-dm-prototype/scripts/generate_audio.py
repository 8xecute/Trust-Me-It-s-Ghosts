#!/usr/bin/env python3
"""Resumable batch TTS generator for dialogues.json using google-genai."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
DIALOGUES_PATH = BASE_DIR / "data" / "dialogues.json"
AUDIO_DIR = BASE_DIR / "audio_assets"
ENV_PATH = BASE_DIR / ".env"


def build_tts_contents(text: str, style: str) -> Any:
    """Build Gemini TTS contents, passing style via speech_metadata only if SDK supports it."""
    from google.genai import types

    part_fields = getattr(types.Part, "model_fields", {})
    if "speech_metadata" in part_fields and style:
        return [
            {
                "role": "user",
                "parts": [
                    {
                        "text": text,
                        "speech_metadata": {"style": style},
                    }
                ],
            }
        ]
    # Passing plain verbatim text prevents TTS models from reading style directions aloud.
    return text


def extract_audio_bytes(response: Any) -> bytes:
    """Extract raw WAV audio bytes from a generate_content response."""
    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            inline_data = getattr(part, "inline_data", None)
            if inline_data and getattr(inline_data, "data", None):
                data = inline_data.data
                if isinstance(data, bytes):
                    return data
                if isinstance(data, str):
                    import base64

                    return base64.b64decode(data)
    raise ValueError("Gemini TTS response contained no inline_data audio bytes.")


def convert_wav_to_mp3(wav_bytes: bytes, output_mp3: Path, ffmpeg_bin: str) -> None:
    """Convert raw WAV bytes to 96kbps mono MP3 using ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        tmp_wav.write(wav_bytes)
        tmp_wav_path = Path(tmp_wav.name)

    try:
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(tmp_wav_path),
                "-vn",
                "-ac",
                "1",
                "-b:a",
                "96k",
                str(output_mp3),
            ],
            check=True,
        )
    finally:
        if tmp_wav_path.exists():
            tmp_wav_path.unlink()


class DailyQuotaExhaustedError(RuntimeError):
    """Raised when the Gemini API daily quota for the selected TTS model is exhausted."""


def generate_one(
    client: Any,
    model: str,
    entry: dict[str, Any],
    voice_profiles: dict[str, Any],
    ffmpeg_bin: str | None,
    max_retries: int = 3,
) -> Path:
    """Generate audio for one dialogue entry with exponential backoff retries."""
    from google.genai import types

    dialogue_id = entry["id"]
    speaker = entry.get("speaker", "DM")
    profile = voice_profiles.get(speaker, {})
    voice = entry.get("voice") or profile.get("voice") or "Charon"
    style = entry.get("style") or profile.get("style") or ""
    text = entry["text"].strip()

    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
            )
        ),
    )
    contents = build_tts_contents(text, style)

    last_err: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            wav_bytes = extract_audio_bytes(response)
            AUDIO_DIR.mkdir(parents=True, exist_ok=True)
            if ffmpeg_bin:
                out_path = AUDIO_DIR / f"{dialogue_id}.mp3"
                convert_wav_to_mp3(wav_bytes, out_path, ffmpeg_bin)
            else:
                out_path = AUDIO_DIR / f"{dialogue_id}.wav"
                out_path.write_bytes(wav_bytes)
            return out_path
        except Exception as exc:  # noqa: BLE001
            err_msg = str(exc)
            if "RequestsPerDay" in err_msg or "per day" in err_msg.lower():
                raise DailyQuotaExhaustedError(err_msg) from exc

            last_err = exc
            if attempt < max_retries:
                is_rpm = "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "RequestsPerMinute" in err_msg
                backoff = 20 if is_rpm else (2**attempt)
                print(
                    f"  [retry {attempt}/{max_retries - 1}] {dialogue_id} error: {exc}. Waiting {backoff}s...",
                    file=sys.stderr,
                )
                time.sleep(backoff)
    assert last_err is not None
    raise last_err


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Batch pre-generate Thai voice lines from data/dialogues.json into audio_assets/."
    )
    parser.add_argument(
        "--model",
        default=os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-lite-tts"),
        help="Gemini TTS model ID (default: gemini-3.8-flash-lite-tts)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="Delay in seconds between API requests to respect rate limits (default: 1.5)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Regenerate files even if audio_assets/{id}.mp3 or .wav already exists",
    )
    parser.add_argument(
        "--only-fillers",
        action="store_true",
        help="Only generate entries marked with is_filler=true",
    )
    parser.add_argument(
        "--id",
        dest="only_id",
        default=None,
        help="Generate only a single dialogue ID",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List dialogues that would be generated without calling the Gemini API",
    )
    args = parser.parse_args()

    load_dotenv(ENV_PATH)

    if not DIALOGUES_PATH.exists():
        print(f"Error: {DIALOGUES_PATH} not found.", file=sys.stderr)
        return 1

    payload = json.loads(DIALOGUES_PATH.read_text(encoding="utf-8"))
    voice_profiles = payload.get("voice_profiles", {})
    dialogues = payload.get("dialogues", [])

    if args.only_fillers:
        dialogues = [d for d in dialogues if d.get("is_filler")]
    if args.only_id:
        dialogues = [d for d in dialogues if d.get("id") == args.only_id]
        if not dialogues:
            print(f"Error: dialogue id '{args.only_id}' not found.", file=sys.stderr)
            return 1

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin and not args.dry_run:
        print(
            "Note: ffmpeg not found on PATH; saving raw 24kHz .wav files directly (backend serves both .mp3 and .wav)."
        )

    pending: list[dict[str, Any]] = []
    skipped = 0
    for entry in dialogues:
        did = entry["id"]
        mp3_exists = (AUDIO_DIR / f"{did}.mp3").exists()
        wav_exists = (AUDIO_DIR / f"{did}.wav").exists()
        if (mp3_exists or wav_exists) and not args.overwrite:
            skipped += 1
        else:
            pending.append(entry)

    print(
        f"Dialogues selected: {len(dialogues)} | Already cached (skip): {skipped} | Pending: {len(pending)} | Model: {args.model}"
    )

    if args.dry_run:
        for entry in pending:
            speaker = entry.get("speaker", "DM")
            voice = entry.get("voice") or voice_profiles.get(speaker, {}).get("voice", "Charon")
            preview = entry["text"][:60].replace("\n", " ")
            print(f"  [DRY-RUN] {entry['id']} ({entry['scene']} | {speaker}/{voice}): {preview}...")
        return 0

    if not pending:
        print("Nothing to generate. All selected audio assets already exist.")
        return 0

    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    paid_api_key = (
        os.getenv("GEMINI_PAID_API_KEY") or os.getenv("GEMINI_FALLBACK_API_KEY") or ""
    ).strip()

    if not api_key and not paid_api_key:
        print(
            f"Error: GEMINI_API_KEY is not set. Add it to {ENV_PATH} or environment variables.",
            file=sys.stderr,
        )
        return 1

    from google import genai

    primary_key = api_key or paid_api_key
    has_paid_fallback = bool(paid_api_key and paid_api_key != primary_key)
    client = genai.Client(api_key=primary_key, http_options={"api_version": "v1beta"})
    using_paid = not api_key and bool(paid_api_key)

    generated = 0
    failed = 0
    for idx, entry in enumerate(pending, start=1):
        did = entry["id"]
        speaker = entry.get("speaker", "DM")
        print(f"[{idx}/{len(pending)}] Generating {did} ({speaker})...", end=" ", flush=True)
        try:
            out_path = generate_one(client, args.model, entry, voice_profiles, ffmpeg_bin)
            generated += 1
            print(f"OK -> {out_path.name} ({out_path.stat().st_size} bytes)")
        except (DailyQuotaExhaustedError, Exception) as exc:  # noqa: BLE001
            err_lower = str(exc).lower()
            is_quota = isinstance(exc, DailyQuotaExhaustedError) or (
                "429" in err_lower or "resource_exhausted" in err_lower or "quota" in err_lower
            )
            if is_quota and has_paid_fallback and not using_paid:
                print("PRIMARY QUOTA HIT -> Switching to GEMINI_PAID_API_KEY...", end=" ", flush=True)
                client = genai.Client(api_key=paid_api_key, http_options={"api_version": "v1beta"})
                using_paid = True
                try:
                    out_path = generate_one(client, args.model, entry, voice_profiles, ffmpeg_bin)
                    generated += 1
                    print(f"OK -> {out_path.name} ({out_path.stat().st_size} bytes)")
                    if idx < len(pending) and args.delay > 0:
                        time.sleep(args.delay)
                    continue
                except Exception as paid_exc:  # noqa: BLE001
                    exc = paid_exc

            failed += 1
            if isinstance(exc, DailyQuotaExhaustedError):
                print("STOPPED (Daily quota exhausted)")
                print(
                    f"\n[Quota Limit] โควตารายวัน (RequestsPerDay) ของโมเดล {args.model} เต็มแล้ว ({exc})\n"
                    "คำแนะนำ: สามารถรันต่อภายหลังได้ทันทีด้วยคำสั่งเดิม (สคริปต์จะข้ามไฟล์ที่สร้างแล้วให้)\n"
                    "สำหรับ Free Tier (จำกัด 3 ครั้ง/นาที) แนะนำให้เพิ่ม --delay 21 หรือตั้ง GEMINI_PAID_API_KEY เพิ่มใน .env",
                    file=sys.stderr,
                )
                break
            print(f"FAILED ({exc})")

        if idx < len(pending) and args.delay > 0:
            time.sleep(args.delay)

    print(f"\nSummary: generated={generated}, skipped={skipped}, failed={failed}")
    return 1 if failed > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
