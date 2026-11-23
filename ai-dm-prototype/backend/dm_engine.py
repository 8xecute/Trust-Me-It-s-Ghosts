"""AI DM Engine: Groq Whisper STT, Gemini JSON DM Decision, and Live Gemini TTS."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
from typing import Any, Callable, Optional, TypeVar

from backend.schemas import DMDecision, GhostTurnDecision, StateUpdates
from backend.state_manager import RoomManager, RoomState, ScenarioRepository

WORLD_LORE_BY_ACT = {
    "A": (
        "ฉากหลัง: หมู่บ้านหนองตาล ชนบทไทยปี พ.ศ. 2534 (1991) เวลาหัวค่ำราวสองทุ่มเศษ ฝนตกพรำต่อเนื่อง บรรยากาศเงียบวังเวง "
        "ชาวบ้านส่วนใหญ่ปิดไฟปิดหน้าต่างเงียบ และหลายหลังมัดสัมภาระวางไว้หน้าชานคล้ายเตรียมย้ายหนี\n"
        "ทีมผู้เล่น: พนักงานจากบริษัทรับจ้างสืบสวนลี้ลับ เดินทางมาด้วยรถตู้บริษัท (จอดเปิดไฟหน้าอยู่ริมถนนข้างศาลา "
        "ในรถมีอุปกรณ์ภาคสนามพื้นฐาน เช่น ไฟฉาย วิทยุสื่อสาร ปฐมพยาบาล และเครื่องสแกนคลื่นของนักศึกษาฝึกงาน)\n"
        "ตัวละครผู้ใหญ่ประเสริฐ: ชายวัย 50+ เป็นผู้ใหญ่บ้านที่เคร่งเครียด เหนื่อยล้า แต่พยายามคุมสติและสุภาพกับทีม "
        "เขายืนรออยู่ที่ศาลาพร้อมไฟฉายและสำเนาใบรับแจ้งคนหาย (ส่วนแผนที่ละเอียดและแฟ้มเต็มอยู่ที่บ้านของเขา) "
        "เขาหวั่นใจทุกครั้งที่พูดถึงแนวสวนกล้วยและอดีตของ 'แก้ว'\n"
        "การใช้ดุลยพินิจตอบคำถามทั่วไป: สามารถบรรยายรายละเอียดสภาพอากาศ สิ่งของรอบตัว บรรยากาศหมู่บ้านยุค 2534 "
        "ท่าทีตัวละคร หรือคำถามเล่นบทบาทสมมติทั่วไปของประเสริฐ/DM ได้อย่างเป็นธรรมชาติ โดยไม่ขัดกฎห้ามสปอยล์ด้านล่าง"
    ),
    "B": (
        "ฉากหลัง: ภายในและชานบ้านไม้สองชั้นของผู้ใหญ่ประเสริฐ บ้านหนองตาล ปี พ.ศ. 2534 ฝนเริ่มซาลงเหลือลมชื้นกับกลิ่นดิน\n"
        "สถานะผู้ใหญ่ประเสริฐ (สำคัญมาก): สายตรวจโทรตามประเสริฐออกไปช่วยดูจุดตั้งด่านหน้าหมู่บ้านทันทีตั้งแต่เริ่มฉาก B1 "
        "ดังนั้น **ประเสริฐไม่อยู่ในฉาก และห้ามให้ประเสริฐมีบทพูดใน ACT B เด็ดขาด**\n"
        "ตัวละครในฉาก B1 (ห้องรับแขกและโต๊ะแผนที่): วิชัย ผู้ช่วยผู้ใหญ่วัย 40 ปลาย ๆ สวมเสื้อเชิ้ตพับแขน สุขุม สุภาพ เป็นทางการ "
        "ระแวดระวัง คอยดูแลแฟ้มคนหายและแผนที่สองชั้น (หมุดแดงคนหายทับวงที่ดินสีน้ำเงิน) ส่วน ต้น อาสาสมัครวัยรุ่นนั่งกำพวงกุญแจเงียบ ๆ ข้างประตู "
        "และจะไม่ยอมเล่าเรื่องลึกต่อหน้าวิชัย\n"
        "ตัวละครในฉาก B2 (ชานบ้านหน้าประตู): แยกคุยกับ ต้น เพียงลำพังริมรถมอเตอร์ไซค์ พูดจาตรงไปตรงมาแบบวัยรุ่นเจ้าถิ่น "
        "ระแวงสายตาวิชัยที่มองลอดหน้าต่าง\n"
        "ฉาก B3 (ผนังภาพเก่าปี 2534 และตู้แฟ้ม): ไม่มี NPC อยู่ใกล้ ๆ — DM เป็นผู้บรรยายเท่านั้น "
        "มีภาพถ่ายเก่าปี 2534 (ชาวบ้านยืนข้างประตูน้ำ) และตู้วางกองแฟ้มเอกสารเก่า\n"
        "การเดินสำรวจและการจบบท: ผู้เล่นสามารถสลับไปมาระหว่าง B1 (โต๊ะแผนที่/วิชัย), B2 (ชานบ้าน/ต้น) และ B3 (ผนังภาพเก่า) ได้อิสระ "
        "และเมื่อพบพิกัดบ้านดล (don_house_location) แล้วตัดสินใจออกเดินทางไปบ้านดล จะจบบท ACT B เข้าสู่ ACT C"
    ),
}
WORLD_LORE_SUMMARY = WORLD_LORE_BY_ACT["A"]

SCENE_ENVIRONMENT_NOTES = {
    "A1": "ศาลาริมทางไม้เก่าหน้าทางเข้าหมู่บ้าน ฝนโปรยปราย มีแสงไฟหน้ารถตู้ส่องไปตามบ้านเรือนที่ปิดเงียบ ประเสริฐยืนคุยอยู่หน้าศาลา",
    "A2": "ข้างประตูรถตู้บริษัทที่เปิดค้างไว้ วิทยุสื่อสารในรถเพิ่งส่งเสียงซ่าและเสียงผู้หญิงสำลักน้ำ ประเสริฐยืนหน้าซีดอยู่ใกล้ ๆ",
    "A3": "หน้าบ้านไม้สองชั้นของประเสริฐที่ยังเปิดไฟสว่างในห้องรับแขก ส่วนด้านขวามือเป็นซอยมืดทอดไปสู่ปากทางสวนกล้วย",
    "B1": "ห้องรับแขกบ้านผู้ใหญ่บ้าน บนโต๊ะไม้กลางห้องมีแฟ้มคนหายและแผนที่หมู่บ้านสองชั้นกางอยู่ใต้แสงไฟ วิชัยยืนดูแลแฟ้มอยู่ริมโต๊ะ และต้นนั่งเงียบ ๆ ข้างประตู (ประเสริฐออกไปแล้ว)",
    "B2": "ชานบ้านไม้หน้าประตูบ้านผู้ใหญ่ ฝนหยุดซาเหลือลมชื้นกับกลิ่นดิน ต้นยืนพิงรถมอเตอร์ไซค์กำพวงกุญแจ คอยชำเลืองหน้าต่างห้องรับแขกที่มีเงาวิชัยมองมาเป็นระยะ",
    "B3": "มุมผนังด้านในห้องรับแขก แสงตะเกียงส่องกรอบภาพถ่ายเก่าปี 2534 แสดงชาวบ้านยืนข้างประตูน้ำ และมีตู้วางกองแฟ้มเอกสารเก่าอยู่ด้านล่าง (DM บรรยายเท่านั้น ห้ามสวมบทประเสริฐหรือ NPC อื่น)",
}
T = TypeVar("T")
logger = logging.getLogger(__name__)

THAI_STT_PROMPT = (
    "ประเสริฐ, วิชัย, ต้น, สวนกล้วย, บ้านผู้ใหญ่บ้าน, บ้านดล, แผนที่, ประตูน้ำ, "
    "ห่อผ้าดำ, รอยข่วน, รถเข็น, ภาพถ่าย, ปี 2534, ผู้หญิงชุดเขียว, ใบรับแจ้งความ, วิทยุสื่อสาร"
)

GEMINI_STT_INSTRUCTION = (
    "ถอดเสียงพูดภาษาไทยของผู้เล่นในคลิปเสียงนี้ให้เป็นข้อความภาษาไทยที่ถูกต้องตรงตามเสียงพูดทุกคำ "
    "(คำศัพท์ที่อาจพบในเกม: ประเสริฐ, วิชัย, ต้น, สวนกล้วย, บ้านผู้ใหญ่บ้าน, บ้านดล, แผนที่, ชานบ้าน, "
    "ประตูน้ำ, ห่อผ้าดำ, รอยข่วน, รถเข็น, ภาพถ่าย, ปี 2534, ใบรับแจ้งความ, วิทยุสื่อสาร, "
    "ผู้หญิงชุดเขียว, ผีเงาจมน้ำ, ทอยเต๋า, สังเกต, ตรวจสอบ, ค่าจ้าง, ตำรวจ)\n"
    "กฎสำคัญ:\n"
    "- ตอบกลับมาเฉพาะข้อความที่ผู้เล่นพูดเท่านั้น ห้ามใส่เครื่องหมายคำพูด คำอธิบาย หรือคำนำ\n"
    "- หากไม่มีเสียงพูดหรือมีแต่เสียงรบกวน ให้ตอบว่า <EMPTY>"
)

_WHISPER_HALLUCINATIONS = {
    "ขอบคุณ",
    "ขอบคุณครับ",
    "ขอบคุณค่ะ",
    "ขอบคุณที่รับชม",
    "ขอบคุณที่รับชมครับ",
    "ขอบคุณที่รับชมค่ะ",
    "ขอบคุณสำหรับการรับชม",
    "ขอบคุณสำหรับการรับชมครับ",
    "ขอบคุณสำหรับการรับชมค่ะ",
    "โปรดติดตามตอนต่อไป",
    "กดติดตาม",
    "ซับไตเติล",
    "amaraorg",
    "mbc",
}


def _get_field(item: Any, key: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _clean_whisper_transcript(result: Any) -> str:
    """Filter high-no-speech segments and standalone Thai Whisper hallucinations."""
    if isinstance(result, str):
        raw_text = result.strip()
    else:
        segments = _get_field(result, "segments")
        if isinstance(segments, list) and segments:
            kept: list[str] = []
            for seg in segments:
                seg_text = str(_get_field(seg, "text", "") or "").strip()
                if not seg_text:
                    continue
                no_speech = _get_field(seg, "no_speech_prob")
                if no_speech is not None and float(no_speech) > 0.72:
                    continue
                avg_logprob = _get_field(seg, "avg_logprob")
                if avg_logprob is not None and float(avg_logprob) < -1.2:
                    continue
                kept.append(seg_text)
            raw_text = " ".join(kept).strip()
        else:
            raw_text = str(_get_field(result, "text", "") or "").strip()

    if not raw_text:
        return ""
    normalized = re.sub(r"[\s\.\,\!\?\-\"'“”‘’()\[\]]+", "", raw_text).lower()
    if normalized in _WHISPER_HALLUCINATIONS:
        return ""
    return raw_text


class AIDMEngine:
    """Hybrid Script-First + Safe Improvisation AI Game Master."""

    def __init__(self) -> None:
        self.groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.gemini_api_key = (
            os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
        ).strip()
        self.gemini_paid_api_key = (
            os.getenv("GEMINI_PAID_API_KEY") or os.getenv("GEMINI_FALLBACK_API_KEY") or ""
        ).strip()

        self.stt_model = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")
        self.dm_model = os.getenv("GEMINI_DM_MODEL", "gemini-3.5-flash-lite")
        self.live_tts_model = os.getenv("GEMINI_LIVE_TTS_MODEL", "gemini-3.8-flash-lite-tts")

        self._groq_client: Any = None
        self._gemini_client: Any = None
        self._gemini_paid_client: Any = None
        self._primary_cooldown_until: float = 0.0

        if self.groq_api_key:
            try:
                from groq import Groq

                self._groq_client = Groq(api_key=self.groq_api_key)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to initialize Groq client: %s", exc)

        if self.gemini_api_key:
            try:
                from google import genai

                self._gemini_client = genai.Client(
                    api_key=self.gemini_api_key,
                    http_options={"api_version": "v1beta"},
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to initialize primary Gemini client: %s", exc)

        if self.gemini_paid_api_key and self.gemini_paid_api_key != self.gemini_api_key:
            try:
                from google import genai

                self._gemini_paid_client = genai.Client(
                    api_key=self.gemini_paid_api_key,
                    http_options={"api_version": "v1beta"},
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to initialize paid fallback Gemini client: %s", exc)

    @property
    def groq_ready(self) -> bool:
        return self._groq_client is not None

    @property
    def gemini_ready(self) -> bool:
        return self._gemini_client is not None or self._gemini_paid_client is not None

    @property
    def gemini_failover_configured(self) -> bool:
        return self._gemini_client is not None and self._gemini_paid_client is not None

    @staticmethod
    def _is_quota_error(exc: Exception) -> bool:
        msg = str(exc).lower()
        return "429" in msg or "resource_exhausted" in msg or "quota" in msg

    @staticmethod
    def _is_daily_quota_error(exc: Exception) -> bool:
        msg = str(exc)
        return "RequestsPerDay" in msg or "per day" in msg.lower()

    @staticmethod
    def _is_transient_error(exc: Exception) -> bool:
        msg = str(exc).lower()
        return any(
            tok in msg
            for tok in (
                "503",
                "unavailable",
                "high demand",
                "overloaded",
                "502",
                "504",
                "deadline_exceeded",
                "timed out",
                "connection",
            )
        )

    def _run_with_gemini_failover(self, call_fn: Callable[[Any], T]) -> T:
        """Try primary GEMINI_API_KEY with transient retry, failing over to paid key on quota or 503."""

        def _call_with_retry(client: Any) -> T:
            last_exc: Optional[Exception] = None
            for attempt in range(3):
                try:
                    return call_fn(client)
                except Exception as exc:  # noqa: BLE001
                    last_exc = exc
                    if not self._is_transient_error(exc) or attempt >= 2:
                        raise
                    backoff = 1.0 * (attempt + 1)
                    logger.warning(
                        "Gemini transient error (attempt %d/3), retrying in %.1fs: %s",
                        attempt + 1,
                        backoff,
                        exc,
                    )
                    time.sleep(backoff)
            assert last_exc is not None
            raise last_exc

        now = time.time()
        if self._gemini_client is not None and now >= self._primary_cooldown_until:
            try:
                return _call_with_retry(self._gemini_client)
            except Exception as exc:  # noqa: BLE001
                should_failover = self._is_quota_error(exc) or self._is_transient_error(exc)
                if self._gemini_paid_client is not None and should_failover:
                    if self._is_daily_quota_error(exc):
                        self._primary_cooldown_until = time.time() + 600.0
                    logger.info("Switching from primary GEMINI_API_KEY to GEMINI_PAID_API_KEY")
                    return _call_with_retry(self._gemini_paid_client)
                raise
        if self._gemini_paid_client is not None:
            return _call_with_retry(self._gemini_paid_client)
        raise RuntimeError("No Gemini client configured")

    async def transcribe_audio(
        self, audio_bytes: bytes, filename: str = "speech.webm", mime_type: str = "audio/webm"
    ) -> str:
        """Transcribe Thai player audio via Gemini Multimodal (primary) with Groq Whisper fallback."""
        clean_mime = (mime_type or "audio/webm").split(";")[0].strip() or "audio/webm"

        if self.gemini_ready:
            def _call_gemini_stt(client: Any) -> str:
                from google.genai import types
                from google.genai.types import GenerateContentConfig

                response = client.models.generate_content(
                    model=self.dm_model,
                    contents=[
                        GEMINI_STT_INSTRUCTION,
                        types.Part.from_bytes(data=audio_bytes, mime_type=clean_mime),
                    ],
                    config=GenerateContentConfig(temperature=0.0),
                )
                return _clean_whisper_transcript(getattr(response, "text", "") or "")

            try:
                gemini_text = await asyncio.to_thread(self._run_with_gemini_failover, _call_gemini_stt)
                cleaned = gemini_text.strip()
                if cleaned == "<EMPTY>" or cleaned.upper() == "EMPTY":
                    return ""
                return cleaned
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini audio STT failed, falling back to Groq Whisper: %s", exc)
                if not self._groq_client:
                    raise

        if not self._groq_client:
            raise RuntimeError("ยังไม่ได้ตั้งค่า GEMINI_API_KEY หรือ GROQ_API_KEY สำหรับถอดเสียงพูด")

        def _call_groq() -> str:
            result = self._groq_client.audio.transcriptions.create(
                model=self.stt_model,
                file=(filename, audio_bytes),
                language="th",
                prompt=THAI_STT_PROMPT,
                response_format="verbose_json",
                temperature=0.0,
            )
            return _clean_whisper_transcript(result)

        return await asyncio.to_thread(_call_groq)

    def _build_dm_prompt(
        self,
        room: RoomState,
        room_manager: RoomManager,
        player_name: str,
        transcript: str,
    ) -> str:
        repo = room_manager.repo
        act = room_manager.act_for_scene(room.current_scene)
        scene_cfg = repo.get_scene(room.current_scene) or {}
        eligible_dialogues = room_manager.get_eligible_dialogues(room)
        available_checks = room_manager.get_available_checks(room)

        dialogue_menu = [
            {
                "id": d["id"],
                "speaker": d["speaker"],
                "topic_hint": (d.get("trigger_condition") or {}).get("topic_hint", ""),
                "text": d["text"],
                "already_played": d["id"] in room.played_audio_ids,
            }
            for d in eligible_dialogues
        ]

        filler_menu = [
            {"id": f["id"], "speaker": f["speaker"], "text": f["text"]}
            for f in repo.get_fillers_for_act(act)
        ]

        check_menu = [
            {
                "id": c["id"],
                "title": c["title"],
                "stat": c["stat"],
                "dc": c["dc"],
                "trigger_hint": c.get("trigger_hint", ""),
            }
            for c in available_checks
        ]

        party_summary = [
            {
                "name": p.name,
                "role": p.role_name,
                "is_current_speaker": p.name == player_name,
                "hp": f"{p.hp}/{p.max_hp}",
                "sanity": f"{p.sanity}/{p.max_sanity}",
                "focus": f"{p.focus}/{p.max_focus}",
                "top_stats": {k: v for k, v in (p.stats or {}).items() if v >= 3},
                "skill": (p.skill or {}).get("name", ""),
            }
            for p in room.players.values()
        ]

        game_state_snapshot = {
            "act": act,
            "current_scene": room.current_scene,
            "scene_turn_count": room.scene_turn_count,
            "clues_found": room.clues_found,
            "inventory": room.inventory,
            "npc_trust": room.npc_trust,
            "played_audio_ids": room.played_audio_ids,
            "pending_check": room.pending_check["id"] if room.pending_check else None,
        }

        guardrails = "\n".join(
            f"- {rule}" for rule in scene_cfg.get("spoiler_guardrails", [])
        )

        recent_turns = room.transcript_log[-12:]
        recent_lines = "\n".join(
            f"{t['speaker']}: {t['text']}" for t in recent_turns
        )
        scene_env = SCENE_ENVIRONMENT_NOTES.get(room.current_scene, "")
        world_lore = WORLD_LORE_BY_ACT.get(act, WORLD_LORE_BY_ACT["A"])

        ending_note = ""
        if room.current_scene == "A3":
            ending_note = (
                "\nกติกาตอนจบของฉาก A3:\n"
                "- ถ้าผู้เล่นตกลงเดินเข้าบ้านผู้ใหญ่บ้านเพื่อดูแฟ้ม/คุยพยาน -> เลือก selected_audio_id='a3_ending_true' และ state_updates.ending_triggered='act_a_complete'\n"
                "- ถ้าผู้เล่นยืนกรานจะเดินเข้าสวนกล้วยมืดทันทีโดยไม่ดูแผนที่ -> เลือก selected_audio_id='a3_ending_bad' และ state_updates.ending_triggered='lost_in_grove'\n"
            )
        elif act == "B":
            ending_note = (
                "\nกติกาการย้ายจุดและตอนจบของ ACT B (B1 <-> B2 <-> B3):\n"
                "- ผู้เล่นเดินสลับระหว่าง 3 จุดในบ้านผู้ใหญ่ได้อิสระ โดยตั้งค่า state_updates.current_scene:\n"
                "  * เดิน/กลับมาห้องรับแขก โต๊ะแผนที่ หรือคุยกับวิชัย -> state_updates.current_scene='B1'\n"
                "  * เดินออกไปชานบ้านหน้าประตู เพื่อแยกคุยกับต้นพ้นหูวิชัย -> state_updates.current_scene='B2'\n"
                "  * เดินไปดูผนังภาพเก่าปี 2534 และตู้แฟ้ม -> state_updates.current_scene='B3'\n"
                "  (เมื่อย้ายฉาก ให้ใช้ mode='improvise' บรรยายจังหวะเดินสั้น 1 ประโยค ระบบจะเล่นบทเปิดฉากใหม่ให้อัตโนมัติ)\n"
                "- ถ้าปรับความไว้วางใจของวิชัยหรือต้น ให้ระบุทั้ง state_updates.npc_trust_delta และ state_updates.npc_trust_target ('วิชัย' หรือ 'ต้น')\n"
                "- หากมีเบาะแส 'don_house_location' แล้วและทีมตกลงออกเดินทางไปบ้านดล -> เลือก selected_audio_id='b_ending_to_act_c' และ state_updates.ending_triggered='act_b_complete'\n"
                "- ข้อห้ามสำคัญ: ห้ามเลือก character='ประเสริฐ' ใน ACT B เด็ดขาด และในฉาก B3 ให้ใช้ character='DM' เท่านั้น\n"
            )

        improv_speaker_hint = (
            "'DM' เท่านั้น"
            if room.current_scene == "B3"
            else ("'วิชัย', 'ต้น', หรือ 'DM'" if act == "B" else "'ประเสริฐ' หรือ 'DM'")
        )

        return f"""คุณคือ AI Game Master (DM) และผู้สวมบท NPC สำหรับเกมสืบสวนสยองขวัญภาษาไทย 'CASE 001: เสียงร้องจากสวนกล้วย' (ช่วง ACT {act})

## ฉากปัจจุบันและสภาพแวดล้อม
- Scene: {room.current_scene} ({scene_cfg.get('title', '')})
- สถานการณ์: {scene_cfg.get('subtitle', '')}
- สภาพแวดล้อม: {scene_env}

## ข้อมูลโลกและบริบทฉาก (ใช้ตอบคำถามทั่วไปและบทบาทสมมติได้อิสระ)
{world_lore}

## ทีมผู้สืบสวนในห้องตอนนี้
{json.dumps(party_summary, ensure_ascii=False)}

## กฎการตัดสินใจและข้อห้ามสปอยล์ (ห้ามละเมิดข้อห้ามสปอยล์เด็ดขาด)
{guardrails}
- ห้ามเสกเบาะแสหรือไอเท็มนอกเหนือจากฉากปัจจุบัน และห้ามเปลี่ยนไปฉากที่ไม่อยู่ใน allowed_next_scenes ของฉากนี้
- เลือก mode='script' และ selected_audio_id จาก dialogue_menu เฉพาะเมื่อคำถามตรงกับ topic_hint ของบทนั้น (ให้ความสำคัญกับบทที่ already_played=false ก่อน)
- ห้ามเลือกบทที่ already_played=true ซ้ำ ยกเว้นผู้เล่นขอให้พูดซ้ำหรือทบทวนโดยตรง — หากผู้เล่นถามต่อยอดหรือถามซ้ำ ให้ใช้ mode='improvise' ตอบขยายความหรือรับมุกอย่างเป็นธรรมชาติแทน
- เมื่อผู้เล่นถามคำถามทั่วไป สำรวจสิ่งของ/สภาพแวดล้อม (เช่น รถตู้ เฟอร์นิเจอร์ สภาพอากาศ เสื้อผ้า อาชีพเพื่อน) หรือชวนคุยเล่นในบทบาท -> ใช้ mode='improvise' (ตั้ง selected_audio_id=null) แล้วให้ character เป็น {improv_speaker_hint} ตอบตรงคำถาม 1-3 ประโยคภาษาไทยที่เป็นธรรมชาติ พร้อมเลือก filler_audio_id ที่ตรงกับผู้พูด
- ถ้าผู้เล่นขอทำแอ็กชันที่ตรงกับ trigger_hint ใน available_checks และยังไม่ได้ทอย -> ให้ตั้งค่า requested_check_id เป็น id ของ check นั้น และใช้ mode='improvise' (selected_audio_id=null) อธิบายสั้น ๆ ใน improvised_text ให้ผู้เล่นกดทอยเต๋า
{ending_note}

## สถานะเกมปัจจุบัน (Game State)
{json.dumps(game_state_snapshot, ensure_ascii=False)}

## บทพูดตามสคริปต์ที่ใช้ได้ในฉาก {room.current_scene} (เลือกได้เฉพาะ id ในรายการนี้)
{json.dumps(dialogue_menu, ensure_ascii=False)}

## เสียงคั่นเวลา (ใช้เฉพาะตอน mode='improvise')
{json.dumps(filler_menu, ensure_ascii=False)}

## การ์ดทอยเต๋า (Dice Checks) ที่ยังใช้ได้ในฉากนี้
{json.dumps(check_menu, ensure_ascii=False)}

## บทสนทนาล่าสุด (12 ข้อความล่าสุด)
{recent_lines or '(ยังไม่มีบทสนทนาก่อนหน้า)'}

## คำพูดของผู้เล่นในเทิร์นนี้
[{player_name}]: {transcript}
"""

    async def decide_turn(
        self,
        room: RoomState,
        room_manager: RoomManager,
        player_name: str,
        transcript: str,
    ) -> tuple[DMDecision, bool]:
        """Return (DMDecision, used_fallback_bool)."""
        if not self.gemini_ready:
            return self._local_fallback_decision(room, room_manager, transcript), True

        prompt = self._build_dm_prompt(room, room_manager, player_name, transcript)

        def _call_gemini(client: Any) -> DMDecision:
            from google.genai.types import GenerateContentConfig

            response = client.models.generate_content(
                model=self.dm_model,
                contents=prompt,
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=DMDecision,
                    temperature=0.3,
                ),
            )
            parsed = getattr(response, "parsed", None)
            if isinstance(parsed, DMDecision):
                return parsed
            if isinstance(parsed, dict):
                return DMDecision.model_validate(parsed)
            return DMDecision.model_validate_json(response.text)

        try:
            decision = await asyncio.to_thread(self._run_with_gemini_failover, _call_gemini)
            return decision, False
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini DM decision failed, using local fallback: %s", exc)
            return self._local_fallback_decision(room, room_manager, transcript), True

    def _local_fallback_decision(
        self,
        room: RoomState,
        room_manager: RoomManager,
        transcript: str,
    ) -> DMDecision:
        """Deterministic Thai keyword matcher when GEMINI_API_KEY is unset or unavailable."""
        text = transcript.lower()
        eligible_ids = {d["id"] for d in room_manager.get_eligible_dialogues(room)}
        available_check_ids = {c["id"] for c in room_manager.get_available_checks(room)}
        scene = room.current_scene

        def pick_script(did: str, speaker: str = "ประเสริฐ", check_id: Optional[str] = None, ending: Optional[str] = None) -> DMDecision:
            return DMDecision(
                mode="script",
                character=speaker,
                selected_audio_id=did,
                requested_check_id=check_id,
                state_updates=StateUpdates(ending_triggered=ending),  # type: ignore[arg-type]
                reason="local_fallback_keyword",
            )

        if scene == "A1":
            if any(k in text for k in ("สังเกต", "พิรุธ", "ท่าที", "สีหน้า", "per")) and "A1_PER_OBSERVE" in available_check_ids:
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเพ่งสังเกตท่าทีของประเสริฐและบรรยากาศรอบศาลาอย่างตั้งใจ — กรุณากดทอยเต๋า PER เพื่อประเมินสิ่งที่สังเกตเห็น",
                    requested_check_id="A1_PER_OBSERVE",
                    reason="local_fallback_check_per",
                )
            if any(k in text for k in ("ตรวจ", "วิเคราะห์", "ละเอียด", "int")) and any(k in text for k in ("เอกสาร", "ใบรับแจ้ง", "แฟ้ม")) and "A1_INT_FILES" in available_check_ids:
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเปิดดูรายละเอียดวันเวลาในสำเนาใบรับแจ้งคนหาย — กรุณากดทอยเต๋า INT เพื่อตรวจสอบจุดผิดปกติ",
                    requested_check_id="A1_INT_FILES",
                    reason="local_fallback_check_int",
                )
            if any(k in text for k in ("หญิงชุดเขียว", "ชุดเขียว", "แก้ว")) and "a1_qa_green_lady" in eligible_ids:
                return pick_script("a1_qa_green_lady", "ประเสริฐ")
            if any(k in text for k in ("คลี่แฟ้ม", "เปิดแฟ้ม", "ข้างรถ", "รถตู้", "ไปบ้าน", "ไปต่อ")) and "a1_open_folder_to_a2" in eligible_ids:
                return pick_script("a1_open_folder_to_a2", "DM")
            if any(k in text for k in ("ใบรับแจ้ง", "เอกสาร", "ขอดูใบ")) and "a1_inspect_report_free" in eligible_ids:
                return pick_script("a1_inspect_report_free", "DM")
            if any(k in text for k in ("ปิดบัง", "โกหก", "ความลับ", "พิรุธ")) and "a1_qa_hiding_secret" in eligible_ids:
                return pick_script("a1_qa_hiding_secret", "ประเสริฐ")
            if any(k in text for k in ("หายตรงไหน", "แถวไหน", "ที่ไหน", "สถานที่")) and "a1_qa_location" in eligible_ids:
                return pick_script("a1_qa_location", "ประเสริฐ")
            if any(k in text for k in ("ตำรวจ", "แจ้งความ")) and "a1_qa_police" in eligible_ids:
                return pick_script("a1_qa_police", "ประเสริฐ")
            if any(k in text for k in ("จ้าง", "บริษัท")) and "a1_qa_why_company" in eligible_ids:
                return pick_script("a1_qa_why_company", "ประเสริฐ")
            if any(k in text for k in ("ค่าจ้าง", "เงิน", "ราคา")) and "a1_qa_fee" in eligible_ids:
                return pick_script("a1_qa_fee", "ประเสริฐ")
            if any(k in text for k in ("คนหาย", "ใครบ้าง", "ลำดับ", "ชื่อ")) and "a1_qa_order" in eligible_ids:
                return pick_script("a1_qa_order", "ประเสริฐ")

        elif scene == "A2":
            if any(k in text for k in ("สัมผัส", "พลัง", "วิญญาณ", "คลื่น", "spi")) and "A2_RADIO_ECHO" in available_check_ids:
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_radio_static",
                    improvised_text="คุณยื่นมือเข้าใกล้เครื่องวิทยุสื่อสารและตั้งจิตสัมผัสคลื่นที่หลงเหลืออยู่ — กรุณากดทอยเต๋า SPI",
                    requested_check_id="A2_RADIO_ECHO",
                    reason="local_fallback_check_spi",
                )
            if any(k in text for k in ("บันทึก", "ย้อนหลัง", "ฟังซ้ำ", "เช็กวิทยุ", "ตรวจเครื่อง")) and "a2_qa_replay_static" in eligible_ids:
                return pick_script("a2_qa_replay_static", "DM")
            if any(k in text for k in ("เสียงใคร", "พูดว่าอะไร", "พูดอะไร")) and "a2_qa_whose_voice" in eligible_ids:
                return pick_script("a2_qa_whose_voice", "DM")
            if any(k in text for k in ("มาจากไหน", "ข้างนอก")) and "a2_qa_radio_origin" in eligible_ids:
                return pick_script("a2_qa_radio_origin", "DM")
            if any(k in text for k in ("บ้านผู้ใหญ่", "ดูแฟ้ม", "ไปต่อ", "เดินทาง")) and "a2_move_to_a3" in eligible_ids:
                return pick_script("a2_move_to_a3", "ประเสริฐ")

        elif scene == "A3":
            if any(k in text for k in ("เข้าบ้าน", "ดูแฟ้ม", "ตกลง", "เข้าไป")) and "a3_ending_true" in eligible_ids:
                return pick_script("a3_ending_true", "DM", ending="act_a_complete")
            if any(k in text for k in ("เข้าสวน", "แยกเดิน", "ไม่รอ", "บุกสวน")) and "a3_ending_bad" in eligible_ids:
                return pick_script("a3_ending_bad", "DM", ending="lost_in_grove")
            if any(k in text for k in ("ใครรอ", "พยาน", "วิชัย", "ต้น")) and "a3_qa_who_waiting" in eligible_ids:
                return pick_script("a3_qa_who_waiting", "ประเสริฐ")
            if any(k in text for k in ("ทำไมไม่", "พาเข้าสวน")) and "a3_qa_why_not_grove" in eligible_ids:
                return pick_script("a3_qa_why_not_grove", "ประเสริฐ")

        elif scene in {"B1", "B2", "B3"}:
            if any(k in text for k in ("บ้านดล", "ไปบ้านดล", "ออกเดินทาง", "ข้อมูลพอแล้ว")) and "b_ending_to_act_c" in eligible_ids:
                return pick_script("b_ending_to_act_c", "DM", ending="act_b_complete")

            if scene != "B2" and any(k in text for k in ("ชานบ้าน", "ออกไปคุยกับต้น", "แยกคุย", "ตามต้นออกไป", "หน้าประตู")):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินเลี่ยงออกจากห้องรับแขกไปที่ชานบ้านหน้าประตูเพื่อคุยกับต้นให้พ้นสายตาวิชัย",
                    state_updates=StateUpdates(current_scene="B2"),
                    reason="local_fallback_move_b2",
                )
            if scene != "B3" and any(k in text for k in ("ผนัง", "ภาพเก่า", "ภาพถ่าย", "กรอบรูป", "2534", "ตู้แฟ้ม")) and not (
                scene == "B1" and any(k in text for k in ("ถามวิชัย", "วิชัย")) and "b1_qa_wichai_flood_kaew" in eligible_ids
            ):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินไปสำรวจผนังภาพถ่ายเก่าปี 2534 และตู้แฟ้มด้านในห้องรับแขก",
                    state_updates=StateUpdates(current_scene="B3"),
                    reason="local_fallback_move_b3",
                )
            if scene != "B1" and any(k in text for k in ("ห้องรับแขก", "กลับเข้าบ้าน", "โต๊ะแผนที่", "ไปหาวิชัย")):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินกลับเข้ามาที่โต๊ะแผนที่ในห้องรับแขกบ้านผู้ใหญ่",
                    state_updates=StateUpdates(current_scene="B1"),
                    reason="local_fallback_move_b1",
                )

            if scene == "B1":
                if any(k in text for k in ("สังเกต", "พิรุธ", "ท่าที", "แววตา", "สีหน้า", "per")) and "B2_WICHAI_TELL" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณเพ่งสังเกตสีหน้า จังหวะคำพูด และแววตาของวิชัยอย่างละเอียด — กรุณากดทอยเต๋า PER",
                        requested_check_id="B2_WICHAI_TELL",
                        reason="local_fallback_check_b2_per",
                    )
                if any(k in text for k in ("แฟ้ม", "แผนที่", "โต๊ะ", "ตรวจดู", "ขอดู")) and "b1_inspect_files_free" in eligible_ids:
                    return pick_script("b1_inspect_files_free", "DM")
                if any(k in text for k in ("น้ำท่วม", "2534", "แม่แก้ว", "แก้ว")) and "b1_qa_wichai_flood_kaew" in eligible_ids:
                    return pick_script("b1_qa_wichai_flood_kaew", "วิชัย")
                if any(k in text for k in ("รอยข่วน", "รอยช้ำ", "หลังมือ", "มือของวิชัย", "แผล")) and "b1_qa_wichai_hand" in eligible_ids:
                    return pick_script("b1_qa_wichai_hand", "วิชัย")
                if any(k in text for k in ("วงสีน้ำเงิน", "ที่ดิน", "ซื้อขาย", "บังคับขาย")) and "b1_qa_wichai_land" in eligible_ids:
                    return pick_script("b1_qa_wichai_land", "วิชัย")
                if any(k in text for k in ("กลางคืน", "เคยเข้าสวน", "คืนเกิดเหตุ")) and "b1_qa_wichai_night_grove" in eligible_ids:
                    return pick_script("b1_qa_wichai_night_grove", "วิชัย")
                if any(k in text for k in ("ผี", "ข่าวลือ", "แก้ว")) and "b1_qa_wichai_ghost_rumor" in eligible_ids:
                    return pick_script("b1_qa_wichai_ghost_rumor", "วิชัย")
                if any(k in text for k in ("ดล", "นิสัยดล")) and "b1_qa_wichai_don" in eligible_ids:
                    return pick_script("b1_qa_wichai_don", "วิชัย")
                if any(k in text for k in ("ประเสริฐ", "ผู้ใหญ่ไปไหน", "ผู้ใหญ่หาย")) and "b1_qa_where_prasert" in eligible_ids:
                    return pick_script("b1_qa_where_prasert", "วิชัย")
                if any(k in text for k in ("จับ", "คนร้าย", "ปรักปรำ", "คุมตัว", "โกหก")) and "b1_qa_accuse_wichai" in eligible_ids:
                    return pick_script("b1_qa_accuse_wichai", "วิชัย")
                if any(k in text for k in ("เข้าสวน", "พาทัวร์สวน")) and "b1_warn_skip_to_grove" in eligible_ids:
                    return pick_script("b1_warn_skip_to_grove", "วิชัย")
                if any(k in text for k in ("ต้น", "ทักต้น", "อาสา")) and "b1_ton_short_greet" in eligible_ids:
                    return pick_script("b1_ton_short_greet", "ต้น")

            elif scene == "B2":
                if any(k in text for k in ("ปลอบ", "มั่นใจ", "เล่ามาให้หมด", "ปลอดภัย", "เกลี้ยกล่อม", "ความจริง", "soc")) and "B3_TON_DISCLOSURE" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_ton_nervous",
                        improvised_text="คุณหันไปยืนยันกับต้นว่าตรงนี้พ้นหูวิชัยแล้ว — กรุณากดทอยเต๋า SOC เพื่อกล่อมให้ต้นยอมเล่าสิ่งที่เห็น",
                        requested_check_id="B3_TON_DISCLOSURE",
                        reason="local_fallback_check_b3_soc",
                    )
                if any(k in text for k in ("ขู่", "บังคับ", "ตะคอก", "สารภาพ")) and "b2_qa_ton_threaten" in eligible_ids:
                    return pick_script("b2_qa_ton_threaten", "ต้น")
                if any(k in text for k in ("ห่อผ้า", "รถเข็น", "เห็นหน้า")) and "b2_qa_ton_bundle_detail" in eligible_ids:
                    return pick_script("b2_qa_ton_bundle_detail", "ต้น")
                if any(k in text for k in ("กลัว", "ระแวง", "ทำไมมา", "ไม่อยากซวย")) and "b2_qa_ton_why_scared" in eligible_ids:
                    return pick_script("b2_qa_ton_why_scared", "ต้น")
                if any(k in text for k in ("ผี", "เปียกน้ำ", "ชุดเขียว")) and "b2_qa_ton_ghost" in eligible_ids:
                    return pick_script("b2_qa_ton_ghost", "ต้น")
                if any(k in text for k in ("เห็นอะไร", "คืนนั้น", "ทางเข้าสวน", "เล่า")) and "b2_ton_baseline" in eligible_ids:
                    return pick_script("b2_ton_baseline", "ต้น")

            elif scene == "B3":
                if any(k in text for k in ("เทียบ", "แผนที่", "เชื่อมโยง", "ทางน้ำ", "แนวคันดิน", "int")) and "B4_FLOOD_PHOTO" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณยกภาพถ่ายประตูน้ำปี 2534 ขึ้นมาเทียบแนวคันดินกับแผนที่หมู่บ้าน — กรุณากดทอยเต๋า INT",
                        requested_check_id="B4_FLOOD_PHOTO",
                        reason="local_fallback_check_b4_int",
                    )
                if any(k in text for k in ("ยกกรอบ", "แตะกรอบ", "ดูใกล้", "หยดน้ำ", "กระจก")) and "b3_inspect_frame_droplet" in eligible_ids:
                    return pick_script("b3_inspect_frame_droplet", "DM")
                if any(k in text for k in ("รื้อ", "ตู้แฟ้ม", "เอกสารเก่า", "บันทึกเวร")) and "b3_open_old_folder_free" in eligible_ids:
                    return pick_script("b3_open_old_folder_free", "DM")
                if any(k in text for k in ("ใครในรูป", "ประเสริฐ", "อพยพ", "เก็บแฟ้ม")) and "b3_qa_photo_prasert" in eligible_ids:
                    return pick_script("b3_qa_photo_prasert", "DM")

        default_speaker = room_manager.default_speaker_for_scene(scene)
        default_filler = room_manager.repo.default_filler_for_speaker(default_speaker)["id"]
        if default_speaker == "ประเสริฐ":
            default_text = "ผมอยากให้เราตรวจดูข้อมูลคนหายและแฟ้มที่บ้านผมให้แน่ใจก่อนนะครับ มีอะไรอยากถามเพิ่มไหม?"
        elif default_speaker == "วิชัย":
            default_text = "ข้อมูลคนหายกับแผนที่อยู่ที่โต๊ะนี้ทั้งหมดแล้วครับ อยากตรวจสอบหรือซักถามเรื่องไหนต่อบอกได้เลย"
        elif default_speaker == "ต้น":
            default_text = "ตรงนี้ไม่มีใครได้ยินหรอกพี่... อยากรู้อะไรก็รีบถามแล้วกันนะ เดี๋ยวพี่วิชัยจะสงสัย"
        elif scene == "B3":
            default_text = "ภาพถ่ายเก่าปี 2534 และกองแฟ้มใต้ผนังยังรอให้คุณตรวจสอบละเอียด หรือเทียบกับแผนที่หมู่บ้าน"
        else:
            default_text = "บรรยากาศรอบศาลาเงียบสงัด มีเพียงเสียงฝนโปรย — พวกคุณจะสอบถามอะไรเพิ่มหรือสำรวจจุดใดต่อ?"
        return DMDecision(
            mode="improvise",
            character=default_speaker,
            filler_audio_id=default_filler,
            improvised_text=default_text,
            reason="local_fallback_generic",
        )

    async def synthesize_live_tts(
        self,
        text: str,
        speaker: str,
        repo: ScenarioRepository,
    ) -> Optional[bytes]:
        """Synthesize live WAV bytes using Gemini Flash-Lite TTS with locked voice profile."""
        if not self.gemini_ready or not text.strip():
            return None

        profile = repo.get_voice_profile(speaker)
        voice_name = profile.get("voice", "Charon")
        style = profile.get("style", "")

        def _call_tts(client: Any) -> Optional[bytes]:
            from google.genai import types

            part_fields = getattr(types.Part, "model_fields", {})
            if "speech_metadata" in part_fields and style:
                contents: Any = [
                    {
                        "role": "user",
                        "parts": [
                            {"text": text.strip(), "speech_metadata": {"style": style}}
                        ],
                    }
                ]
            else:
                contents = text.strip()

            config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                    )
                ),
            )
            response = client.models.generate_content(
                model=self.live_tts_model,
                contents=contents,
                config=config,
            )
            candidates = getattr(response, "candidates", None) or []
            for candidate in candidates:
                content = getattr(candidate, "content", None)
                parts = getattr(content, "parts", None) or []
                for part in parts:
                    inline_data = getattr(part, "inline_data", None)
                    if inline_data and getattr(inline_data, "data", None):
                        data = inline_data.data
                        return data if isinstance(data, bytes) else base64.b64decode(data)
            return None

        try:
            return await asyncio.to_thread(self._run_with_gemini_failover, _call_tts)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini live TTS failed: %s", exc)
            return None

    async def decide_ghost_turn(
        self,
        room: RoomState,
        repo: ScenarioRepository,
    ) -> tuple[GhostTurnDecision, bool]:
        """Use Gemini Tactical Ghost AI (or smart deterministic fallback) to pick move & target."""
        if not self.gemini_ready:
            return self._local_fallback_ghost_turn(room), True

        combat = room.combat
        enc = repo.combat_encounter
        conscious = [p for p in room.players.values() if p.is_conscious]
        connected_conscious = [p for p in conscious if p.connected] or conscious
        if not combat or not connected_conscious:
            return self._local_fallback_ghost_turn(room), True

        targets_json = [
            {
                "player_id": p.public_id,
                "name": p.name,
                "role": p.role_name,
                "hp": p.hp,
                "sanity": p.sanity,
                "statuses": p.statuses,
                "guarded": p.guarded,
            }
            for p in connected_conscious
        ]
        moves_json = [
            {
                "id": m["id"],
                "name_th": m["name_th"],
                "target_defense": m["target_defense"],
                "damage_resource": m["damage_resource"],
                "damage": m["damage"],
                "condition": m["condition"],
                "detail": m["detail"],
            }
            for m in enc.get("moves", [])
        ]

        prompt = f"""คุณคือ AI ควบคุม 'ผีเงาจมน้ำ' ในฉากต่อสู้แบบผลัดเทิร์นของเกมสืบสวนสยองขวัญไทย

## สถานะการต่อสู้ปัจจุบัน
- รอบที่: {combat.round_number}
- HP ผีเงาจมน้ำ: {combat.enemy_hp}/{combat.enemy_max_hp}
- ความคืบหน้ากล่อมวิญญาณ: {combat.soothe_progress}/{combat.soothe_goal}
- ความคืบหน้าถอยทัพ: {combat.retreat_progress}/{combat.retreat_goal}

## เป้าหมายผู้สืบสวนที่ยังมีสติ (เลือก target_player_id จากรายการนี้เท่านั้น)
{json.dumps(targets_json, ensure_ascii=False)}

## ท่าของผีที่ใช้ได้ (เลือก move_id จากรายการนี้เท่านั้น)
{json.dumps(moves_json, ensure_ascii=False)}

## แนวทางแทคติก
- ถ้าทีมกำลังจะถอยทัพสำเร็จ (retreat_progress >= 1) ให้ใช้ UNDERFLOOR_HAND เพื่อดึงข้อเท้าติดพันธนาการ
- ถ้าทีมเน้นกล่อมหรือมีคนสติต่ำ / ร่างทรง ให้ใช้ DROWNED_WHISPER เพื่อตัดสติและติดสถานะหวาดกลัว
- ถ้าเป้าหมาย HP ต่ำหรือเปิดช่องโหว่ ให้ใช้ WET_CLAW
- ตั้ง use_live_taunt=true เฉพาะบางรอบที่ดราม่า (เช่น เป้าหมายสติต่ำกว่า 6 หรือผีใกล้แพ้) แล้วเขียน ghost_taunt หลอน ๆ สั้น 1 ประโยค
- เขียน narration_th เป็นคำบรรยายสั้น ๆ 1 ประโยคภาษาไทย
"""

        def _call_gemini_ghost(client: Any) -> GhostTurnDecision:
            from google.genai.types import GenerateContentConfig

            response = client.models.generate_content(
                model=self.dm_model,
                contents=prompt,
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GhostTurnDecision,
                    temperature=0.5,
                ),
            )
            parsed = getattr(response, "parsed", None)
            if isinstance(parsed, GhostTurnDecision):
                return parsed
            if isinstance(parsed, dict):
                return GhostTurnDecision.model_validate(parsed)
            return GhostTurnDecision.model_validate_json(response.text)

        try:
            decision = await asyncio.to_thread(self._run_with_gemini_failover, _call_gemini_ghost)
            return decision, False
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini ghost AI failed, using fallback: %s", exc)
            return self._local_fallback_ghost_turn(room), True

    @staticmethod
    def _local_fallback_ghost_turn(room: RoomState) -> GhostTurnDecision:
        combat = room.combat
        conscious = [p for p in room.players.values() if p.is_conscious]
        pool = [p for p in conscious if p.connected] or conscious
        if not pool:
            return GhostTurnDecision(
                move_id="WET_CLAW",
                target_player_id="",
                use_live_taunt=False,
                narration_th="เงาดำจมน้ำตะปบผ่านความมืดอันว่างเปล่า",
            )

        if combat and combat.retreat_progress >= 1:
            target = max(pool, key=lambda p: p.hp)
            return GhostTurnDecision(
                move_id="UNDERFLOOR_HAND",
                target_player_id=target.public_id,
                use_live_taunt=True,
                ghost_taunt=f"{target.name}... คิดจะหนีไปไหน...",
                narration_th=f"มือซีดเปียกโชกผุดขึ้นจากโคลนคว้าข้อเท้าของ {target.name} ไว้แน่น!",
            )

        if combat and combat.soothe_progress >= 1:
            target = min(pool, key=lambda p: p.sanity)
            return GhostTurnDecision(
                move_id="DROWNED_WHISPER",
                target_player_id=target.public_id,
                use_live_taunt=True,
                ghost_taunt="อย่าปลอบข้า... น้ำยังท่วมอยู่...",
                narration_th=f"เสียงสำลักน้ำเย็นเยียบกระซิบกรอกหู {target.name} จนเสียขวัญ!",
            )

        target = min(pool, key=lambda p: p.hp)
        return GhostTurnDecision(
            move_id="WET_CLAW",
            target_player_id=target.public_id,
            use_live_taunt=False,
            narration_th=f"ผีเงาจมน้ำพุ่งเล็บเปียกโคลนเข้าตะปบใส่ {target.name} ท่ามกลางความมืด!",
        )
