"""FastAPI + python-socketio authoritative server for the Automated AI Game Master."""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import socketio
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

from backend.dm_engine import AIDMEngine  # noqa: E402
from backend.state_manager import RoomManager, RoomState, ScenarioRepository  # noqa: E402
from backend.usage_tracker import UsageTracker  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai_dm_server")


class _QuietPollingAccessFilter(logging.Filter):
    """Suppress noisy static, audio-range (206), polling, and healthcheck access logs on Render."""

    _QUIET_PREFIXES = (
        '"GET /healthz',
        '"GET /api/rooms',
        '"GET /api/scenario',
        '"GET /audio_assets/',
        '"GET /assets/',
        '"GET /audio_fx.js',
        '"GET /styles.css',
        '"GET /app.js',
    )

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if '"GET /favicon.ico' in msg:
            return False
        if any(prefix in msg for prefix in self._QUIET_PREFIXES) and any(
            code in msg for code in (" 200", " 204", " 206", " 304")
        ):
            return False
        return True


logging.getLogger("uvicorn.access").addFilter(_QuietPollingAccessFilter())
for _noisy_logger in ("google_genai", "google_genai.models", "httpx", "httpx2"):
    logging.getLogger(_noisy_logger).setLevel(logging.WARNING)

FRONTEND_DIR = BASE_DIR / "frontend"
AUDIO_DIR = BASE_DIR / "audio_assets"
ASSETS_DIR = FRONTEND_DIR / "assets"

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

repo = ScenarioRepository()
room_manager = RoomManager(repo)
dm_engine = AIDMEngine()
usage_tracker = UsageTracker()


def _extract_client_info_from_environ(environ: dict[str, Any]) -> tuple[str, str]:
    """Extract client IP (respecting Render X-Forwarded-For) and User-Agent from Socket.IO environ."""
    headers: dict[str, str] = {}
    scope = environ.get("asgi.scope")
    if isinstance(scope, dict):
        for raw_k, raw_v in scope.get("headers") or []:
            k = raw_k.decode("latin-1").lower() if isinstance(raw_k, (bytes, bytearray)) else str(raw_k).lower()
            v = raw_v.decode("latin-1") if isinstance(raw_v, (bytes, bytearray)) else str(raw_v)
            headers[k] = v
    raw_ip = (
        headers.get("x-forwarded-for")
        or headers.get("x-real-ip")
        or str(environ.get("HTTP_X_FORWARDED_FOR") or environ.get("REMOTE_ADDR") or "")
    )
    if not raw_ip and isinstance(scope, dict) and scope.get("client"):
        raw_ip = str(scope["client"][0])
    ua = headers.get("user-agent") or str(environ.get("HTTP_USER_AGENT") or "")
    return raw_ip, ua

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    max_http_buffer_size=10_000_000,
)

_room_turn_locks: dict[str, asyncio.Lock] = {}


def _get_room_lock(room_code: str) -> asyncio.Lock:
    if room_code not in _room_turn_locks:
        _room_turn_locks[room_code] = asyncio.Lock()
    return _room_turn_locks[room_code]


def _ext_from_mime(mime_type: str) -> str:
    lower = (mime_type or "").lower()
    if "mp4" in lower or "m4a" in lower or "aac" in lower:
        return "speech.m4a"
    if "ogg" in lower:
        return "speech.ogg"
    if "wav" in lower:
        return "speech.wav"
    if "mpeg" in lower or "mp3" in lower:
        return "speech.mp3"
    return "speech.webm"


def _cleanup_empty_rooms_and_locks() -> list[str]:
    closed_codes = room_manager.cleanup_empty_rooms()
    for code in closed_codes:
        _room_turn_locks.pop(code, None)
        logger.info(
            "Auto-closed empty room %s (no active users for %ds)",
            code,
            int(room_manager.empty_room_ttl_seconds),
        )
    return closed_codes


async def _idle_watcher_loop() -> None:
    """Close empty rooms after TTL and emit gentle ambient prompt if an active room stays silent."""
    while True:
        await asyncio.sleep(15)
        _cleanup_empty_rooms_and_locks()
        now = time.time()
        for room in list(room_manager.rooms.values()):
            has_connected = any(p.connected for p in room.players.values())
            if (
                room.started
                and not room.ending_triggered
                and not (room.combat and room.combat.active)
                and not room.idle_prompted
                and has_connected
                and not room.active_speaker_sid
                and (now - room.last_activity_at) > 120
            ):
                room.idle_prompted = True
                act = room_manager.act_for_scene(room.current_scene)
                guideline = room_manager.compute_guideline_snapshot(room)
                scene_goal = guideline.get("scene_goal") or guideline.get("act_goal") or ""
                pending_main = next(
                    (l for l in guideline.get("leads", []) if l.get("kind") == "main" and not l.get("done")),
                    None,
                )
                ambient_prefix = {
                    "A": "ลมกลางคืนพัดผ่านศาลาริมทางจนใบกล้วยไกล ๆ ไหวกรอบแกรบ...",
                    "B": "เสียงลมเย็นพัดผ่านบานประตูไม้บ้านผู้ใหญ่บ้าน...",
                    "C": "ความเงียบยามค่ำในหมู่บ้านชวนขนลุก...",
                    "D": "ใบกล้วยรอบทางเดินสวนขยับเสียดสีในความมืด...",
                    "E": "เสียงไม้เก่าลั่นเบา ๆ ท่ามกลางแสงเทียนสลัว...",
                    "F": "แรงลมเย็นพัดผ่านความมืดก่อนรุ่งสาง...",
                }.get(act, "ความเงียบยามค่ำพัดผ่านรอบตัวคุณ...")
                if pending_main and pending_main.get("label"):
                    prompt_text = f"{ambient_prefix} ตอนนี้ลองดูแนวทางหลัก: {pending_main['label']} หรือสำรวจรอบ ๆ ต่อได้"
                elif scene_goal:
                    prompt_text = f"{ambient_prefix} เป้าหมายตอนนี้: {scene_goal}"
                else:
                    prompt_text = f"{ambient_prefix} พวกคุณจะสอบถาม สำรวจ หรือขยับจุดหมายต่อดี?"
                room_manager.append_log(room, "DM", prompt_text, kind="hint")
                await sio.emit(
                    "dm:audio",
                    {
                        "mode": "script",
                        "dialogue_id": "filler_dm_think",
                        "character": "DM",
                        "subtitle": prompt_text,
                        "audio_url": repo.resolve_audio_url("filler_dm_think"),
                        "is_filler": False,
                    },
                    room=room.room_code,
                )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_idle_watcher_loop())
    logger.info(
        "AI DM Server started | groq=%s | gemini=%s | cached_audio=%d/%d",
        dm_engine.groq_ready,
        dm_engine.gemini_ready,
        repo.count_cached_audio(),
        len(repo.dialogues),
    )
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="AI TRPG Game Master (CASE001 Act A & B)", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _track_page_visit_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and request.url.path == "/" and response.status_code < 400:
        raw_ip = (
            request.headers.get("x-forwarded-for")
            or request.headers.get("x-real-ip")
            or (request.client.host if request.client else "")
        )
        ua = request.headers.get("user-agent") or ""
        visitor, device = usage_tracker.record_page_visit(raw_ip, ua)
        logger.info(
            "[USAGE] VISIT | visitor=%s | device=%s | total_visits=%d | unique=%d",
            visitor,
            device,
            usage_tracker.total_page_visits,
            len(usage_tracker.unique_visitors),
        )
    return response


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


@app.get("/healthz")
async def healthz() -> dict[str, Any]:
    _cleanup_empty_rooms_and_locks()
    return {
        "ok": True,
        "groq_configured": dm_engine.groq_ready,
        "gemini_configured": dm_engine.gemini_ready,
        "pregen_audio_count": repo.count_cached_audio(),
        "total_dialogues": len(repo.dialogues),
        "active_rooms": len(room_manager.rooms),
        "empty_room_ttl_seconds": int(room_manager.empty_room_ttl_seconds),
    }


@app.get("/api/scenario")
async def get_scenario() -> dict[str, Any]:
    return {
        "case_id": repo.lore.get("case_id"),
        "case_title": repo.case_title,
        "roles": repo.roles,
        "scenes": {
            sid: {"id": sid, "title": sc.get("title"), "subtitle": sc.get("subtitle")}
            for sid, sc in repo.scenes.items()
        },
        "combat_encounter": {
            "id": repo.combat_encounter.get("id"),
            "name": repo.combat_encounter.get("name"),
            "moves": repo.combat_encounter.get("moves", []),
        },
        "groq_configured": dm_engine.groq_ready,
        "gemini_configured": dm_engine.gemini_ready,
    }


@app.get("/api/rooms")
async def list_active_rooms() -> dict[str, Any]:
    _cleanup_empty_rooms_and_locks()
    return {"rooms": room_manager.list_public_rooms()}


@app.get("/api/usage")
async def get_usage_summary() -> dict[str, Any]:
    """Return in-memory visitor, session, and gameplay usage analytics (no secrets)."""
    _cleanup_empty_rooms_and_locks()
    online_players = sum(
        sum(1 for p in r.players.values() if p.connected) for r in room_manager.rooms.values()
    )
    return usage_tracker.get_summary(
        active_rooms=len(room_manager.rooms),
        online_players=online_players,
    )


@app.get("/api/rooms/{room_code}/roles")
async def get_room_taken_roles(room_code: str) -> dict[str, Any]:
    normalized = room_manager.normalize_room_code(room_code)
    return {
        "room_code": normalized,
        "taken_roles": room_manager.get_taken_roles(normalized),
    }


@app.get("/api/rooms/{room_code}/session")
async def get_room_reconnect_session(room_code: str, token: str = "") -> dict[str, Any]:
    _cleanup_empty_rooms_and_locks()
    session = room_manager.get_reconnect_session(room_code, token.strip() or None)
    if not session:
        return {"can_reconnect": False}
    return session


async def _emit_room_state(room: RoomState) -> None:
    await sio.emit("room:state", room_manager.serialize_public_state(room), room=room.room_code)


def _record_ending_once(room: RoomState) -> None:
    if not room.ending_triggered:
        return
    if getattr(room, "_usage_ending_logged", None) == room.ending_triggered:
        return
    setattr(room, "_usage_ending_logged", room.ending_triggered)
    usage_tracker.record_ending(room.room_code, room.ending_triggered, room.total_turn_count)
    logger.info(
        "[USAGE] ENDING | room=%s | ending=%s | turns=%d",
        room.room_code,
        room.ending_triggered,
        room.total_turn_count,
    )


async def _run_ghost_turn(room: RoomState) -> None:
    await sio.emit(
        "dm:thinking",
        {"active": True, "stage": "ผีเงาจมน้ำกำลังเลือกเป้าหมายโจมตี..."},
        room=room.room_code,
    )
    try:
        ghost_decision, used_fallback = await dm_engine.decide_ghost_turn(room, repo)
        logger.info(
            "[%s] Ghost turn | move=%s | target=%s | fallback=%s",
            room.room_code,
            ghost_decision.move_id,
            ghost_decision.target_player_id,
            used_fallback,
        )
        res = room_manager.apply_ghost_turn(room.room_code, ghost_decision)

        await sio.emit(
            "combat:sfx",
            {
                "sfx": "ghost_attack" if res.get("hit") else "dice_fail",
                "summary": res["summary"],
            },
            room=room.room_code,
        )
        if res.get("roll_detail"):
            await sio.emit(
                "combat:roll",
                {
                    "roll": res["roll_detail"],
                    "narration": res["summary"],
                    "visual_fx": res.get("visual_fx", "ghost_lunge"),
                },
                room=room.room_code,
            )
        for ev in res["events"]:
            await sio.emit("dm:audio", ev, room=room.room_code)

        if res.get("use_live_taunt") and res.get("ghost_taunt"):
            audio_b64 = None
            if room_manager.consume_live_tts_quota(room):
                wav_bytes = await dm_engine.synthesize_live_tts(
                    res["ghost_taunt"], "ผีเงาจมน้ำ", repo
                )
                audio_b64 = base64.b64encode(wav_bytes).decode("ascii") if wav_bytes else None
            await sio.emit(
                "dm:audio",
                {
                    "mode": "improvise",
                    "dialogue_id": None,
                    "character": "ผีเงาจมน้ำ",
                    "subtitle": res["ghost_taunt"],
                    "audio_base64": audio_b64,
                    "mime_type": "audio/wav" if audio_b64 else None,
                    "is_filler": False,
                },
                room=room.room_code,
            )

        await _emit_room_state(room)
        _record_ending_once(room)
    finally:
        await sio.emit("dm:thinking", {"active": False, "stage": ""}, room=room.room_code)


async def _execute_combat_action(
    room: RoomState,
    sid: str,
    action_id: str,
    *,
    declaration_text: str = "",
    target_ally_id: Optional[str] = None,
) -> None:
    lock = _get_room_lock(room.room_code)
    async with lock:
        player = room_manager.get_player_by_sid(sid)
        if not player:
            await sio.emit("dm:error", {"message": "ไม่พบข้อมูลตัวละครของคุณในห้อง"}, to=sid)
            return

        chosen_action = action_id
        stat_override: Optional[str] = None
        tactical_bonus = 0
        tactical_reason: Optional[str] = None
        chosen_ally = target_ally_id
        narration_by_tier: Optional[dict[str, str]] = None

        clean_decl = declaration_text.strip()
        if clean_decl:
            await sio.emit(
                "dm:thinking",
                {"active": True, "stage": "AI DM กำลังตัดสินการกระทำและคำนวณโบนัสแทคติก..."},
                room=room.room_code,
            )
            try:
                plan, _used_fb = await dm_engine.plan_combat_player_action(room, player, clean_decl, repo)
                chosen_action = plan.action_id
                stat_override = plan.stat_choice
                tactical_bonus = plan.tactical_bonus
                tactical_reason = plan.tactical_reason
                chosen_ally = chosen_ally or plan.target_ally_id
                narration_by_tier = {
                    "full": plan.narration_full,
                    "partial": plan.narration_partial,
                    "failure": plan.narration_failure,
                }
            finally:
                await sio.emit("dm:thinking", {"active": False, "stage": ""}, room=room.room_code)

        try:
            res = room_manager.perform_combat_action(
                room.room_code,
                sid,
                chosen_action,
                intent_text=clean_decl,
                stat_override=stat_override,
                tactical_bonus=tactical_bonus,
                tactical_reason=tactical_reason,
                target_ally_id=chosen_ally,
                narration_by_tier=narration_by_tier,
            )
        except ValueError as exc:
            await sio.emit("dm:error", {"message": str(exc)}, to=sid)
            return

        await sio.emit(
            "combat:sfx",
            {"sfx": res["sfx"], "summary": res["summary"]},
            room=room.room_code,
        )
        if res.get("roll_detail"):
            await sio.emit(
                "combat:roll",
                {
                    "roll": res["roll_detail"],
                    "narration": res.get("narration") or res["summary"],
                    "visual_fx": res.get("visual_fx", "miss"),
                },
                room=room.room_code,
            )
        if res["events"]:
            for ev in res["events"]:
                await sio.emit("dm:audio", ev, room=room.room_code)
        elif res.get("narration"):
            await sio.emit(
                "dm:audio",
                {
                    "mode": "script",
                    "dialogue_id": None,
                    "character": "DM",
                    "subtitle": res["narration"],
                    "audio_url": None,
                    "is_filler": False,
                },
                room=room.room_code,
            )

        await _emit_room_state(room)
        _record_ending_once(room)
        if res["ready_for_ghost_turn"] and room.combat and room.combat.active:
            await _run_ghost_turn(room)


async def _process_player_turn(room: RoomState, sid: str, player_name: str, text: str) -> None:
    if room.combat and room.combat.active:
        await _execute_combat_action(room, sid, "", declaration_text=text)
        return

    lock = _get_room_lock(room.room_code)
    async with lock:
        if not room.started:
            room.started = True

        await sio.emit(
            "dm:thinking",
            {"active": True, "stage": "AI DM กำลังวิเคราะห์คำพูดและกติกาฉาก..."},
            room=room.room_code,
        )
        try:
            decision, used_fallback = await dm_engine.decide_turn(
                room, room_manager, player_name, text
            )
            logger.info(
                "[%s] Turn by %s | mode=%s | id=%s | fallback=%s | check=%s",
                room.room_code,
                player_name,
                decision.mode,
                decision.selected_audio_id,
                used_fallback,
                decision.requested_check_id,
            )
            outcome = room_manager.validate_and_apply_decision(
                room, decision, player_name, actor_sid=sid
            )
            actor = room_manager.get_player_by_sid(sid)
            usage_tracker.record_turn(
                actor.player_token if actor else None,
                room.room_code,
                player_name,
                decision.mode,
            )
            logger.info(
                "[USAGE] TURN | room=%s | player=%s | mode=%s | scene=%s | total_turns=%d",
                room.room_code,
                player_name,
                decision.mode,
                room.current_scene,
                room.total_turn_count,
            )
            _record_ending_once(room)

            await sio.emit("dm:audio", outcome["primary_event"], room=room.room_code)

            if outcome["needs_live_tts"]:
                audio_b64 = None
                if room_manager.consume_live_tts_quota(room):
                    await sio.emit(
                        "dm:thinking",
                        {"active": True, "stage": "กำลังสังเคราะห์เสียงพูดตัวละคร..."},
                        room=room.room_code,
                    )
                    wav_bytes = await dm_engine.synthesize_live_tts(
                        outcome["live_tts_text"],
                        outcome["live_tts_speaker"],
                        repo,
                    )
                    audio_b64 = base64.b64encode(wav_bytes).decode("ascii") if wav_bytes else None

                await sio.emit(
                    "dm:audio",
                    {
                        "mode": "improvise",
                        "dialogue_id": None,
                        "character": outcome["live_tts_speaker"],
                        "subtitle": outcome["live_tts_text"],
                        "audio_base64": audio_b64,
                        "mime_type": "audio/wav" if audio_b64 else None,
                        "is_filler": False,
                    },
                    room=room.room_code,
                )

            for ev in outcome["queued_events"]:
                await sio.emit("dm:audio", ev, room=room.room_code)

            bypass_roll = outcome.get("bypassed_roll")
            if bypass_roll:
                usage_tracker.record_dice(
                    actor.player_token if actor else None,
                    room.room_code,
                    bypass_roll["rolled_by"],
                    bypass_roll["check_id"],
                    bypass_roll["total"],
                    bypass_roll["tier"],
                )
                logger.info(
                    "[USAGE] DICE | room=%s | player=%s | check=%s | total=%d | tier=%s | bypassed=True",
                    room.room_code,
                    bypass_roll["rolled_by"],
                    bypass_roll["check_id"],
                    bypass_roll["total"],
                    bypass_roll["tier"],
                )
                await sio.emit("dice:result", bypass_roll, room=room.room_code)

            await _emit_room_state(room)
        finally:
            await sio.emit("dm:thinking", {"active": False, "stage": ""}, room=room.room_code)


@sio.event
async def connect(sid: str, environ: dict[str, Any]) -> None:
    raw_ip, ua = _extract_client_info_from_environ(environ)
    usage_tracker.register_socket_client(sid, raw_ip, ua)
    logger.debug("Client connected: %s", sid)


@sio.event
async def disconnect(sid: str) -> None:
    room, player, mic_released = room_manager.remove_player(sid)
    if room:
        if mic_released:
            await sio.emit("mic:unlocked", {}, room=room.room_code)
        if player:
            online_left = sum(1 for p in room.players.values() if p.connected)
            duration_s = usage_tracker.record_leave(
                sid, player.player_token, room.room_code, player.name, online_left
            )
            logger.info(
                "[USAGE] LEAVE | room=%s | player=%s (%s) | duration=%ds | online_left=%d",
                room.room_code,
                player.name,
                player.role_name,
                duration_s,
                online_left,
            )
            room_manager.append_log(
                room, "ระบบ", f"{player.name} ขาดการเชื่อมต่อ (สามารถกลับเข้าห้องเดิมได้)", kind="system"
            )
        else:
            usage_tracker.pop_socket_client(sid)
        await _emit_room_state(room)
        if mic_released:
            await _drain_input_queue(room)
        if room.combat and room.combat.active and room_manager.check_ready_for_ghost_turn(room):
            room.combat.phase = "ghost"
            await _run_ghost_turn(room)
    else:
        usage_tracker.pop_socket_client(sid)


@sio.on("room:leave")
async def on_room_leave(sid: str, _data: dict[str, Any] | None = None) -> None:
    room, player, mic_released = room_manager.remove_player(sid)
    if room:
        await sio.leave_room(sid, room.room_code)
        if mic_released:
            await sio.emit("mic:unlocked", {}, room=room.room_code)
        if player:
            online_left = sum(1 for p in room.players.values() if p.connected)
            duration_s = usage_tracker.record_leave(
                sid, player.player_token, room.room_code, player.name, online_left
            )
            logger.info(
                "[USAGE] LEAVE_MENU | room=%s | player=%s (%s) | duration=%ds | online_left=%d",
                room.room_code,
                player.name,
                player.role_name,
                duration_s,
                online_left,
            )
            room_manager.append_log(
                room,
                "ระบบ",
                f"{player.name} ออกจากห้องกลับไปหน้าเมนู (สามารถกลับเข้าห้องเดิมได้)",
                kind="system",
            )
        await _emit_room_state(room)
        if mic_released:
            await _drain_input_queue(room)
        if room.combat and room.combat.active and room_manager.check_ready_for_ghost_turn(room):
            room.combat.phase = "ghost"
            await _run_ghost_turn(room)
    await sio.emit("room:left", {"ok": True}, to=sid)


@sio.on("room:join")
async def on_room_join(sid: str, data: dict[str, Any]) -> None:
    room_code = str(data.get("room_code") or "BANANA01")
    player_name = str(data.get("player_name") or "ผู้สืบสวน")
    role_id = str(data.get("role_id") or "investigator")
    player_token = data.get("player_token")
    reconnect_only = bool(data.get("reconnect_only", False))
    start_act = "A"

    try:
        room, player, reconnected = room_manager.add_player(
            room_code,
            sid,
            player_name,
            role_id,
            player_token=str(player_token) if player_token else None,
            start_act=start_act,
            reconnect_only=reconnect_only,
        )
    except ValueError as exc:
        await sio.emit(
            "room:join_error",
            {
                "message": str(exc),
                "taken_roles": room_manager.get_taken_roles(room_code),
            },
            to=sid,
        )
        return

    await sio.enter_room(sid, room.room_code)
    sess = usage_tracker.record_join(
        sid, room.room_code, player.player_token, player.name, player.role_name, reconnected
    )
    online_cnt = sum(1 for p in room.players.values() if p.connected)
    logger.info(
        "[USAGE] %s | room=%s | player=%s | role=%s | visitor=%s | device=%s | online=%d/%d",
        "RECONNECT" if reconnected else "JOIN",
        room.room_code,
        player.name,
        player.role_name,
        sess.visitor,
        sess.device,
        online_cnt,
        len(room.players),
    )
    action_label = "กลับเข้าห้องสืบสวนอีกครั้ง" if reconnected else "เข้าร่วมทีมสืบสวน"
    room_manager.append_log(
        room,
        "ระบบ",
        f"{player.name} ({player.role_name}) {action_label}",
        kind="system",
    )

    await sio.emit(
        "room:joined",
        {
            "player_token": player.player_token,
            "reconnected": reconnected,
            "player": {
                "id": player.public_id,
                "sid": player.sid,
                "name": player.name,
                "role_id": player.role_id,
                "role_name": player.role_name,
                "avatar": player.avatar,
                "stats": player.stats,
                "skill": player.skill,
            },
            "state": room_manager.serialize_public_state(room),
            "history": room.transcript_log,
            "api_status": {
                "groq_configured": dm_engine.groq_ready,
                "gemini_configured": dm_engine.gemini_ready,
            },
        },
        to=sid,
    )
    await _emit_room_state(room)


@sio.on("game:start")
async def on_game_start(sid: str, _data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    _, events = room_manager.start_game(room.room_code)
    await _emit_room_state(room)
    for ev in events:
        await sio.emit("dm:audio", ev, room=room.room_code)


@sio.on("mic:start")
async def on_mic_start(sid: str, _data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    player = room_manager.get_player_by_sid(sid)
    if not room:
        return
    if room.combat and room.combat.active:
        if room.combat.phase != "players":
            await sio.emit("dm:error", {"message": "กรุณารอตาของผีเงาจมน้ำสักครู่"}, to=sid)
            return
        if player and (not player.is_conscious or player.acted_this_round):
            await sio.emit(
                "dm:error",
                {"message": "คุณลงมือในรอบนี้ไปแล้วหรือหมดสติอยู่ กรุณารอเพื่อนร่วมทีม"},
                to=sid,
            )
            return
    can_mic, reason_holder = room_manager.can_start_mic(room, sid)
    if not can_mic:
        await sio.emit("mic:denied", {"holder_name": reason_holder}, to=sid)
        return
    granted, holder_name = room_manager.acquire_mic(room.room_code, sid)
    if granted:
        await sio.emit("mic:locked", {"sid": sid, "speaker_name": holder_name}, room=room.room_code)
        await _emit_room_state(room)
    else:
        await sio.emit("mic:denied", {"holder_name": holder_name}, to=sid)


@sio.on("mic:cancel")
async def on_mic_cancel(sid: str, _data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    if room_manager.release_mic(room.room_code, sid):
        await sio.emit("mic:unlocked", {}, room=room.room_code)
        await _emit_room_state(room)
        await _drain_input_queue(room)


async def _run_text_turn(room: RoomState, player: Any, sid: str, text: str) -> None:
    room_manager.begin_turn(room, player, f"AI DM กำลังตอบ {player.name}...")
    await _emit_room_state(room)
    try:
        room_manager.append_log(room, player.name, text, kind="player")
        await sio.emit(
            "player:transcript",
            {"speaker": player.name, "role_name": player.role_name, "text": text},
            room=room.room_code,
        )
        await _process_player_turn(room, sid, player.name, text)
    finally:
        room_manager.end_turn(room)
        if room_manager.rooms.get(room.room_code) is room:
            await _emit_room_state(room)


async def _drain_input_queue(room: RoomState) -> None:
    while (
        room_manager.rooms.get(room.room_code) is room
        and not room.turn_busy
        and room.active_speaker_sid is None
        and not room.ending_triggered
        and not (room.combat and room.combat.active)
    ):
        next_item = room_manager.pop_next_queued_input(room)
        if not next_item:
            break
        queued_player = room.players.get(next_item["player_id"]) or room_manager.get_player_by_sid(
            next_item["sid"]
        )
        if not queued_player:
            for p in room.players.values():
                if p.public_id == next_item["player_id"]:
                    queued_player = p
                    break
        if not queued_player:
            continue
        await _run_text_turn(room, queued_player, next_item["sid"], next_item["text"])


@sio.on("mic:transcribe")
async def on_mic_transcribe(sid: str, data: dict[str, Any]) -> None:
    """Transcribe player's voice to text and send it back only to the sender's chat input."""
    room = room_manager.get_room_by_sid(sid)
    player = room_manager.get_player_by_sid(sid)
    if not room or not player:
        return

    if room.combat and room.combat.active:
        if room.combat.phase != "players":
            await sio.emit(
                "mic:transcript",
                {"ok": False, "error": "กรุณารอตาของผีเงาจมน้ำให้จบก่อน"},
                to=sid,
            )
            return
        if not player.is_conscious or player.acted_this_round:
            await sio.emit(
                "mic:transcript",
                {"ok": False, "error": "คุณลงมือในรอบนี้ไปแล้ว กรุณารอขึ้นรอบใหม่"},
                to=sid,
            )
            return

    if room.ending_triggered:
        ending_act = room_manager.act_for_scene(room.current_scene)
        await sio.emit(
            "mic:transcript",
            {"ok": False, "error": f"บท ACT {ending_act} จบลงแล้ว กรุณากดปุ่มในหน้าสรุปเพื่อดำเนินการต่อหรือเล่นซ้ำ"},
            to=sid,
        )
        return

    raw_payload = data.get("audio")
    mime_type = str(data.get("mime_type") or "audio/webm")
    if isinstance(raw_payload, str):
        if "," in raw_payload:
            raw_payload = raw_payload.split(",", 1)[1]
        audio_bytes = base64.b64decode(raw_payload)
    elif isinstance(raw_payload, (bytes, bytearray)):
        audio_bytes = bytes(raw_payload)
    else:
        audio_bytes = b""

    if len(audio_bytes) < 400:
        await sio.emit(
            "mic:transcript",
            {"ok": False, "error": "ไฟล์เสียงสั้นเกินไป กรุณากดปุ่มไมค์ค้างไว้ขณะพูด"},
            to=sid,
        )
        return

    try:
        transcript = await dm_engine.transcribe_audio(
            audio_bytes, _ext_from_mime(mime_type), mime_type=mime_type
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("STT error for %s: %s", player.name, exc)
        await sio.emit(
            "mic:transcript",
            {"ok": False, "error": f"ถอดเสียงไม่สำเร็จ ({exc}) — สามารถพิมพ์ข้อความในช่องแชทด้านล่างแทนได้"},
            to=sid,
        )
        return

    if not transcript:
        await sio.emit(
            "mic:transcript",
            {"ok": False, "error": "ไม่ได้ยินเสียงพูดชัดเจน กรุณาลองพูดใหม่อีกครั้ง"},
            to=sid,
        )
        return

    clean_text = transcript.strip()[:300]
    usage_tracker.record_voice_stt(player.player_token, room.room_code, player.name, len(clean_text))
    logger.info("[USAGE] STT | room=%s | player=%s | chars=%d", room.room_code, player.name, len(clean_text))
    await sio.emit("mic:transcript", {"ok": True, "text": clean_text}, to=sid)


@sio.on("mic:audio")
async def on_mic_audio(sid: str, data: dict[str, Any]) -> None:
    room = room_manager.get_room_by_sid(sid)
    player = room_manager.get_player_by_sid(sid)
    if not room or not player:
        return

    room_manager.release_mic(room.room_code, sid, force=True)
    await sio.emit("mic:unlocked", {}, room=room.room_code)

    if room.combat and room.combat.active:
        if room.combat.phase != "players" or not player.is_conscious or player.acted_this_round:
            await _emit_room_state(room)
            await sio.emit(
                "dm:error",
                {"message": "ตอนนี้ยังลงมือในรอบนี้ไม่ได้ กรุณารอตาถัดไป"},
                to=sid,
            )
            return
        await _emit_room_state(room)

    if room.ending_triggered:
        ending_act = room_manager.act_for_scene(room.current_scene)
        await _emit_room_state(room)
        await sio.emit(
            "dm:error",
            {"message": f"บท ACT {ending_act} จบลงแล้ว กรุณากดปุ่มในหน้าสรุปเพื่อดำเนินการต่อหรือเล่นซ้ำ"},
            to=sid,
        )
        return

    raw_payload = data.get("audio")
    mime_type = str(data.get("mime_type") or "audio/webm")
    if isinstance(raw_payload, str):
        if "," in raw_payload:
            raw_payload = raw_payload.split(",", 1)[1]
        audio_bytes = base64.b64decode(raw_payload)
    elif isinstance(raw_payload, (bytes, bytearray)):
        audio_bytes = bytes(raw_payload)
    else:
        audio_bytes = b""

    if len(audio_bytes) < 400:
        await _emit_room_state(room)
        await sio.emit(
            "dm:error",
            {"message": "ไฟล์เสียงสั้นเกินไป กรุณากดปุ่มไมค์ค้างไว้ขณะพูด"},
            to=sid,
        )
        await _drain_input_queue(room)
        return

    room_manager.begin_turn(room, player, f"กำลังถอดเสียงพูดของ {player.name}...")
    await _emit_room_state(room)
    await sio.emit(
        "dm:thinking",
        {"active": True, "stage": f"กำลังถอดเสียงพูดของ {player.name}..."},
        room=room.room_code,
    )
    try:
        try:
            transcript = await dm_engine.transcribe_audio(
                audio_bytes, _ext_from_mime(mime_type), mime_type=mime_type
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("STT error for %s: %s", player.name, exc)
            await sio.emit("dm:thinking", {"active": False, "stage": ""}, room=room.room_code)
            await sio.emit(
                "dm:error",
                {"message": f"ถอดเสียงไม่สำเร็จ ({exc}) — สามารถพิมพ์ข้อความในช่องแชทด้านล่างแทนได้"},
                to=sid,
            )
            return

        if not transcript:
            await sio.emit("dm:thinking", {"active": False, "stage": ""}, room=room.room_code)
            await sio.emit("dm:error", {"message": "ไม่ได้ยินเสียงพูดชัดเจน กรุณาลองพูดใหม่อีกครั้ง"}, to=sid)
            return

        room_manager.append_log(room, player.name, transcript, kind="player")
        await sio.emit(
            "player:transcript",
            {"speaker": player.name, "role_name": player.role_name, "text": transcript},
            room=room.room_code,
        )
        await _process_player_turn(room, sid, player.name, transcript)
    finally:
        room_manager.end_turn(room)
        if room_manager.rooms.get(room.room_code) is room:
            await _emit_room_state(room)
            await _drain_input_queue(room)


@sio.on("chat:message")
async def on_chat_message(sid: str, data: dict[str, Any]) -> None:
    room = room_manager.get_room_by_sid(sid)
    player = room_manager.get_player_by_sid(sid)
    if not room or not player:
        return
    if room.combat and room.combat.active:
        text = str(data.get("text") or "").strip()[:300]
        if not text:
            return
        if room.combat.phase != "players":
            await sio.emit("dm:error", {"message": "กรุณารอตาของผีเงาจมน้ำสักครู่"}, to=sid)
            return
        if not player.is_conscious:
            await sio.emit("dm:error", {"message": "ตัวละครของคุณหมดสติหรือเสียขวัญแล้ว ไม่สามารถลงมือได้"}, to=sid)
            return
        if player.acted_this_round:
            await sio.emit("dm:error", {"message": "คุณลงมือในรอบนี้ไปแล้ว รอเพื่อนร่วมทีมหรือขึ้นรอบถัดไป"}, to=sid)
            return
        room_manager.append_log(room, player.name, text, kind="player")
        await sio.emit(
            "player:transcript",
            {"speaker": player.name, "role_name": player.role_name, "text": text},
            room=room.room_code,
        )
        await _execute_combat_action(room, sid, "", declaration_text=text)
        return
    if room.ending_triggered:
        ending_act = room_manager.act_for_scene(room.current_scene)
        await sio.emit(
            "dm:error",
            {"message": f"บท ACT {ending_act} จบลงแล้ว กรุณากดปุ่มในหน้าสรุปเพื่อดำเนินการต่อหรือเล่นซ้ำ"},
            to=sid,
        )
        return

    text = str(data.get("text") or "").strip()
    if not text:
        return
    text = text[:300]

    if room.turn_busy or room.active_speaker_sid is not None:
        ok, msg = room_manager.enqueue_text_input(room, player, sid, text)
        if not ok:
            await sio.emit("dm:error", {"message": msg}, to=sid)
            return
        await _emit_room_state(room)
        return

    await _run_text_turn(room, player, sid, text)
    await _drain_input_queue(room)


@sio.on("dice:prep")
async def on_dice_prep(sid: str, data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    payload = data or {}
    action = str(payload.get("action") or "").strip()
    stat = payload.get("stat")
    mode = payload.get("mode")
    target_public_id = payload.get("target_public_id")
    try:
        res = room_manager.prep_pending_check(
            room.room_code,
            sid,
            action=action,
            stat=str(stat) if stat is not None else None,
            mode=str(mode) if mode is not None else None,
            target_public_id=str(target_public_id) if target_public_id is not None else None,
        )
    except ValueError as exc:
        await sio.emit("dm:error", {"message": str(exc)}, to=sid)
        return
    if res.get("notice"):
        room_manager.append_log(room, "ระบบ", res["notice"], kind="system")
        await sio.emit("system:notice", {"message": res["notice"]}, room=room.room_code)
    await _emit_room_state(room)


@sio.on("dice:roll")
async def on_dice_roll(sid: str, _data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    try:
        result = room_manager.resolve_dice_roll(room.room_code, sid)
    except ValueError as exc:
        await sio.emit("dm:error", {"message": str(exc)}, to=sid)
        return

    roll = result["roll"]
    roller = room_manager.get_player_by_sid(sid)
    usage_tracker.record_dice(
        roller.player_token if roller else None,
        room.room_code,
        roll["rolled_by"],
        roll["check_id"],
        roll["total"],
        roll["tier"],
    )
    logger.info(
        "[USAGE] DICE | room=%s | player=%s | check=%s | total=%d | tier=%s",
        room.room_code,
        roll["rolled_by"],
        roll["check_id"],
        roll["total"],
        roll["tier"],
    )
    await sio.emit("dice:result", roll, room=room.room_code)
    if result["audio_event"]:
        await sio.emit("dm:audio", result["audio_event"], room=room.room_code)
    await _emit_room_state(room)


@sio.on("board:move")
async def on_board_move(sid: str, data: dict[str, Any]) -> None:
    room = room_manager.get_room_by_sid(sid)
    player = room_manager.get_player_by_sid(sid)
    if not room:
        return
    node_id = str(data.get("node_id") or "")
    actor_name = player.name if player else "ผู้สืบสวน"
    try:
        result = room_manager.move_board_node(room.room_code, node_id, actor_name)
    except ValueError as exc:
        await sio.emit("dm:error", {"message": str(exc)}, to=sid)
        return

    if room.combat and room.combat.active and node_id == "banana_grove_edge":
        usage_tracker.record_combat_start(room.room_code, actor_name)
        logger.info("[USAGE] COMBAT_START | room=%s | by=%s", room.room_code, actor_name)
    else:
        _record_ending_once(room)

    await _emit_room_state(room)
    for ev in result["events"]:
        await sio.emit("dm:audio", ev, room=room.room_code)


@sio.on("dossier:inspect")
async def on_dossier_inspect(sid: str, data: dict[str, Any]) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    if not room.started:
        await sio.emit("dm:error", {"message": "กรุณากดเริ่มบทก่อนสำรวจฉากและหลักฐาน"}, to=sid)
        return
    target_type = str((data or {}).get("target_type") or "")
    target_id = str((data or {}).get("target_id") or "")
    try:
        result = room_manager.inspect_dossier_target(room.room_code, sid, target_type, target_id)
    except ValueError as exc:
        await sio.emit("dm:error", {"message": str(exc)}, to=sid)
        return
    if result.get("event"):
        await sio.emit("dm:audio", result["event"], room=room.room_code)
    await _emit_room_state(room)


@sio.on("combat:start_demo")
async def on_combat_start_demo(sid: str, _data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    player = room_manager.get_player_by_sid(sid)
    if not room:
        return
    if room.combat and room.combat.active:
        return
    if room.ending_triggered:
        room.ending_triggered = None
        setattr(room, "_usage_ending_logged", None)
    scene_upper = (room.current_scene or "A1").upper()
    enc_id = (
        "KAEW_FINAL_BOSS"
        if scene_upper.startswith("F")
        else ("KAEW_SHIELDED_SHADOW" if scene_upper in {"D3", "D4"} else "DROWNED_ECHO")
    )
    events = room_manager.start_combat(room.room_code, return_scene=room.current_scene, encounter_id=enc_id)
    actor_name = player.name if player else "ผู้สืบสวน"
    usage_tracker.record_combat_start(room.room_code, actor_name)
    logger.info("[USAGE] COMBAT_START | room=%s | by=%s", room.room_code, actor_name)
    await _emit_room_state(room)
    for ev in events:
        await sio.emit("dm:audio", ev, room=room.room_code)


@sio.on("combat:action")
async def on_combat_action(sid: str, data: dict[str, Any]) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    action_id = str(data.get("action_id") or "")
    intent_text = str(data.get("intent_text") or "").strip()
    target_ally_id = data.get("target_ally_id")
    await _execute_combat_action(
        room,
        sid,
        action_id,
        declaration_text=intent_text,
        target_ally_id=str(target_ally_id) if target_ally_id else None,
    )


_ACT_TRANSITION_LABELS = {
    "B": "เข้าสู่บทที่ 2 (ACT B): บ้านผู้ใหญ่บ้าน — ห้องรับแขกและโต๊ะแผนที่",
    "C": "เข้าสู่บทที่ 3 (ACT C): บ้านดลและบ้านยายบุญมีก่อนทางแยกเข้าสวน",
    "D": "เข้าสู่บทที่ 4 (ACT D): เข้าสวนกล้วย ศาลด้ายดำ และรอยล้อรถเข็น",
    "E": "เข้าสู่บทที่ 5 (ACT E): เรือนไม้ร้าง ตัวประกัน กำไล และหลักฐานวิชัย",
    "F": "เข้าสู่บทสุดท้าย (FINAL ACT F): ปลุกวงป้องกันกำไล 3 ขั้นของแม่แก้ว",
}


async def _handle_advance_act(room: RoomState, target_act: str) -> None:
    _, events = room_manager.advance_to_act(room.room_code, target_act)
    label = _ACT_TRANSITION_LABELS.get(target_act, f"เข้าสู่บท ACT {target_act}")
    room_manager.append_log(room, "ระบบ", label, kind="system")
    await sio.emit(
        "room:act_changed",
        {"act": target_act, "scene": room.current_scene, "history": room.transcript_log},
        room=room.room_code,
    )
    await _emit_room_state(room)
    for ev in events:
        await sio.emit("dm:audio", ev, room=room.room_code)


@sio.on("room:advance_act_b")
async def on_room_advance_act_b(sid: str, _data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    await _handle_advance_act(room, "B")


@sio.on("room:advance_act")
async def on_room_advance_act(sid: str, data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    target_act = str((data or {}).get("act") or "B").strip().upper()
    if target_act not in {"B", "C", "D", "E", "F"}:
        target_act = "B"
    await _handle_advance_act(room, target_act)


@sio.on("room:reset")
async def on_room_reset(sid: str, data: dict[str, Any] | None = None) -> None:
    room = room_manager.get_room_by_sid(sid)
    if not room:
        return
    code = room.room_code
    raw_act = str((data or {}).get("act") or room_manager.act_for_scene(room.current_scene)).strip().upper()
    act = raw_act if raw_act in {"A", "B", "C", "D", "E", "F"} else "A"

    preserved_players = dict(room.players)
    for p in preserved_players.values():
        p.hp = p.max_hp
        p.sanity = p.max_sanity
        p.focus = p.max_focus
        p.statuses = []
        p.guarded = False
        p.damage_reduction = 0
        p.assisted_bonus = 0
        p.protected_by = None
        p.acted_this_round = False

    entry_scene, entry_node = room_manager._act_entry_point(act)
    fresh = RoomState(
        room_code=code,
        current_scene=entry_scene,
        board_node=entry_node,
        visited_scenes=[entry_scene],
        players=preserved_players,
    )
    if act in {"C", "D", "E", "F"}:
        room_manager.apply_act_start_preset(fresh, act)
    room_manager.rooms[code] = fresh
    label_map = {
        "A": "บทนำ ACT A",
        "B": "ACT B (บ้านผู้ใหญ่บ้าน)",
        "C": "ACT C (บ้านดลและยายบุญมี)",
        "D": "ACT D (สวนกล้วยและศาลด้ายดำ)",
        "E": "ACT E (เรือนไม้ร้างและตัวประกัน)",
        "F": "ACT F (FINAL — กำไลแม่แก้วและบทส่งท้าย)",
    }
    label = label_map.get(act, f"ACT {act}")
    room_manager.append_log(fresh, "ระบบ", f"รีเซ็ตห้องเพื่อเริ่ม {label} ใหม่อีกครั้ง", kind="system")
    await sio.emit("room:reset_done", {"history": fresh.transcript_log, "act": act}, room=code)
    await _emit_room_state(fresh)


app.mount("/audio_assets", StaticFiles(directory=str(AUDIO_DIR)), name="audio_assets")
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
