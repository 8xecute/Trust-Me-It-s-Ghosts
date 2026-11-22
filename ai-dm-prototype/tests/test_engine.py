"""Comprehensive unit and integration tests for AI Game Master CASE001 Act A + Combat."""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PROTO_DIR = Path(__file__).resolve().parent.parent
if str(PROTO_DIR) not in sys.path:
    sys.path.insert(0, str(PROTO_DIR))

from backend.dm_engine import AIDMEngine, _clean_whisper_transcript  # noqa: E402
from backend.main import app  # noqa: E402
from backend.schemas import DMDecision, GhostTurnDecision, StateUpdates  # noqa: E402
from backend.state_manager import (  # noqa: E402
    MAX_LIVE_TTS_PER_ROOM,
    MIC_LOCK_TIMEOUT_SECONDS,
    RoomManager,
    ScenarioRepository,
)


def test_scenario_data_and_assets_integrity() -> None:
    repo = ScenarioRepository()
    assert len(repo.dialogues) >= 49
    assert len(repo.roles) == 6

    for entry in repo.dialogues:
        assert entry["speaker"] in repo.voice_profiles or entry.get("voice")

    for scene in repo.scenes.values():
        for aid in scene.get("intro_audio_ids", []):
            assert repo.get_dialogue(aid) is not None, f"Missing intro dialogue {aid}"
        stall_id = scene.get("anti_stall_audio_id")
        if stall_id:
            assert repo.get_dialogue(stall_id) is not None, f"Missing stall dialogue {stall_id}"
        bg_rel = scene["background_image"].lstrip("/")
        assert (PROTO_DIR / "frontend" / bg_rel).exists(), f"Missing background {bg_rel}"
        for npc in scene.get("npcs", []):
            sprite_rel = npc["sprite"].lstrip("/")
            assert (PROTO_DIR / "frontend" / sprite_rel).exists(), f"Missing sprite {sprite_rel}"

    for role in repo.roles:
        avatar_rel = role["avatar"].lstrip("/")
        assert (PROTO_DIR / "frontend" / avatar_rel).exists(), f"Missing avatar {avatar_rel}"
        assert role["max_hp"] == 15
        assert role["max_sanity"] == 10
        assert role["max_focus"] == 4
        assert "skill" in role

    for chk in repo.dice_checks.values():
        for tier in ("full", "partial", "failure"):
            assert repo.get_dialogue(chk["audio_ids"][tier]) is not None

    enc = repo.combat_encounter
    assert enc["id"] == "DROWNED_ECHO"
    assert (PROTO_DIR / "frontend" / enc["sprite"].lstrip("/")).exists()
    assert (PROTO_DIR / "frontend" / enc["background_image"].lstrip("/")).exists()
    for move in enc["moves"]:
        assert repo.get_dialogue(move["audio_id"]) is not None

    for ending in repo.endings.values():
        assert repo.get_dialogue(ending["audio_id"]) is not None


def test_unique_roles_reconnect_and_mic_lock_timeout() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)

    room, p1, rec1 = mgr.add_player("case01", "sid_1", "ต้น", "investigator")
    assert rec1 is False
    assert room.room_code == "CASE01"

    # Duplicate role in same room must be rejected
    with pytest.raises(ValueError, match="เลือกไปแล้ว"):
        mgr.add_player("case01", "sid_2", "พลอย", "investigator")

    _, p2, rec2 = mgr.add_player("case01", "sid_2", "พลอย", "medium")
    assert rec2 is False
    assert set(mgr.get_taken_roles("CASE01")) == {"investigator", "medium"}

    # Modify HP and disconnect -> reconnect by token preserves state
    p1.hp = 9
    ok, holder = mgr.acquire_mic("CASE01", "sid_1")
    assert ok is True and holder == "ต้น"

    _, disc_player, mic_released = mgr.remove_player("sid_1")
    assert mic_released is True
    assert disc_player is not None and disc_player.connected is False

    _, re_p1, is_reconnected = mgr.add_player(
        "CASE01", "sid_1_new", "ต้น", "investigator", player_token=p1.player_token
    )
    assert is_reconnected is True
    assert re_p1.connected is True
    assert re_p1.hp == 9
    assert re_p1.sid == "sid_1_new"

    # Mic timeout
    mgr.acquire_mic("CASE01", "sid_2")
    ok_blocked, _ = mgr.acquire_mic("CASE01", "sid_1_new")
    assert ok_blocked is False
    room.mic_locked_at = time.time() - (MIC_LOCK_TIMEOUT_SECONDS + 2)
    ok_expired, _ = mgr.acquire_mic("CASE01", "sid_1_new")
    assert ok_expired is True


def test_live_tts_quota_cap() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room = mgr.get_or_create_room("QUOTA01")

    for _ in range(MAX_LIVE_TTS_PER_ROOM):
        assert mgr.consume_live_tts_quota(room) is True
    assert mgr.consume_live_tts_quota(room) is False
    assert room.live_tts_used == MAX_LIVE_TTS_PER_ROOM


def test_spoiler_guardrails_reject_cross_scene_and_reserved_ids() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, _, _ = mgr.add_player("TEST02", "sid_1", "นักสืบเอก", "investigator")
    mgr.start_game("TEST02")

    for forbidden_id in ("a2_radio_voice", "a3_ending_true", "a1_check_per_full"):
        bad_decision = DMDecision(
            mode="script",
            character="DM",
            selected_audio_id=forbidden_id,
            state_updates=StateUpdates(
                current_scene="A3",
                add_clues=["radio_memory_echo", "fake_clue_not_real"],
                add_inventory=["nonexistent_item"],
                ending_triggered="act_a_complete",
            ),
        )
        outcome = mgr.validate_and_apply_decision(room, bad_decision, "นักสืบเอก")
        assert outcome["needs_live_tts"] is True
        assert outcome["primary_event"]["is_filler"] is True
        assert room.current_scene == "A1"
        assert "radio_memory_echo" not in room.clues_found
        assert "fake_clue_not_real" not in room.clues_found
        assert room.inventory == []
        assert room.ending_triggered is None


def test_authoritative_d20_roll_and_no_duplicate_reroll() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, _, _ = mgr.add_player("DICE01", "sid_1", "เอก", "investigator")  # PER = 5
    mgr.start_game("DICE01")

    pending = mgr.trigger_check(room, "A1_PER_OBSERVE", "เอก")
    assert pending is not None

    result = mgr.resolve_dice_roll("DICE01", "sid_1")
    roll = result["roll"]
    assert 1 <= roll["d20"] <= 20
    assert roll["modifier"] == 5
    assert roll["total"] == roll["d20"] + 5
    assert roll["tier"] in {"full", "partial", "failure"}
    assert "A1_PER_OBSERVE" in room.resolved_checks
    assert mgr.trigger_check(room, "A1_PER_OBSERVE", "เอก") is None


def test_anti_stall_sanity_drop_and_automated_endings() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, player, _ = mgr.add_player("FLOW01", "sid_1", "พลอย", "medium")
    mgr.start_game("FLOW01")
    assert player.sanity == 10

    last_outcome = None
    for _ in range(6):
        decision = DMDecision(
            mode="improvise",
            character="ประเสริฐ",
            filler_audio_id="filler_prasert_hmm",
            improvised_text="ฝนตกหนักมากเลยครับวันนี้",
        )
        last_outcome = mgr.validate_and_apply_decision(room, decision, "พลอย")

    assert last_outcome is not None
    queued_ids = [ev["dialogue_id"] for ev in last_outcome["queued_events"]]
    assert "a1_antistall_hint" in queued_ids
    assert "a2_radio_voice" in queued_ids
    assert room.current_scene == "A2"
    assert player.sanity == 9  # -1 Sanity from hearing the eerie radio voice

    move_a3 = DMDecision(mode="script", character="ประเสริฐ", selected_audio_id="a2_move_to_a3")
    mgr.validate_and_apply_decision(room, move_a3, "พลอย")
    assert room.current_scene == "A3"

    board_res = mgr.move_board_node("FLOW01", "headman_house", "พลอย")
    assert room.ending_triggered == "act_a_complete"
    assert any(ev["dialogue_id"] == "a3_ending_true" for ev in board_res["events"])


def test_turn_based_combat_loop_skills_statuses_and_resolutions() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, p1, _ = mgr.add_player("COMBAT1", "sid_1", "หมอ", "ritualist")
    _, p2, _ = mgr.add_player("COMBAT1", "sid_2", "ทรง", "medium")

    intro_events = mgr.start_combat("COMBAT1", return_scene="A3")
    assert len(intro_events) == 1
    assert room.combat is not None and room.combat.active is True
    assert room.combat.enemy_max_hp == 8

    # Round 1: p1 casts protective_talisman (+2 party_shield), p2 casts soothe_spirit (+2 soothe)
    r1_p1 = mgr.perform_combat_action("COMBAT1", "sid_1", "role_skill")
    assert p1.focus == 3
    assert room.combat.party_shield == 2
    assert r1_p1["ready_for_ghost_turn"] is False

    r1_p2 = mgr.perform_combat_action("COMBAT1", "sid_2", "role_skill")
    assert p2.focus == 3
    assert room.combat.soothe_progress == 2
    assert r1_p2["ready_for_ghost_turn"] is True
    assert room.combat.phase == "ghost"

    # Ghost turn hits with DROWNED_WHISPER -> party_shield (2) absorbs 2 sanity dmg
    ghost_res = mgr.apply_ghost_turn(
        "COMBAT1",
        GhostTurnDecision(
            move_id="DROWNED_WHISPER",
            target_player_id=p2.public_id,
            use_live_taunt=False,
            narration_th="ผีกระซิบใส่ทรง",
        ),
    )
    assert p2.sanity == 10  # absorbed by party_shield
    assert room.combat is not None
    assert room.combat.round_number == 2
    assert room.combat.phase == "players"

    # Test status restrictions directly
    p1.statuses = ["ROOTED"]
    with pytest.raises(ValueError, match="พันธนาการ"):
        mgr.perform_combat_action("COMBAT1", "sid_1", "retreat")
    p2.statuses = ["SHAKEN"]
    with pytest.raises(ValueError, match="หวาดกลัว"):
        mgr.perform_combat_action("COMBAT1", "sid_2", "soothe")

    # Steady clears SHAKEN and restores focus/sanity
    p2.sanity = 7
    p2.focus = 2
    mgr.perform_combat_action("COMBAT1", "sid_2", "steady")
    assert p2.statuses == []
    assert p2.sanity == 9
    assert p2.focus == 3

    # Test escape via retreat_progress >= 2 in a fresh room
    room_esc, pe1, _ = mgr.add_player("ESC1", "es_1", "บอดี้", "bodyguard")
    _, pe2, _ = mgr.add_player("ESC1", "es_2", "คนขับ", "driver")
    mgr.start_combat("ESC1", return_scene="A3")
    mgr.perform_combat_action("ESC1", "es_1", "retreat")
    esc_res = mgr.perform_combat_action("ESC1", "es_2", "retreat")
    assert room_esc.combat is None
    assert room_esc.current_scene == "A3"
    assert any(ev["dialogue_id"] == "combat_escape" for ev in esc_res["events"])

    # Test soothing victory (soothe_progress reaches 3)
    room_win, pw1, _ = mgr.add_player("WIN1", "w_1", "หมอ", "ritualist")
    _, pw2, _ = mgr.add_player("WIN1", "w_2", "ทรง", "medium")
    mgr.start_combat("WIN1", return_scene="A3")
    assert room_win.combat is not None
    room_win.combat.soothe_progress = 2
    win_res = mgr.perform_combat_action("WIN1", "w_2", "role_skill")
    assert room_win.combat is None
    assert room_win.ending_triggered == "act_a_combat_clear"
    assert any(ev["dialogue_id"] == "combat_win_soothe" for ev in win_res["events"])

    # Test party defeat triggers lost_in_grove Bad Ending
    room_lose, pl1, _ = mgr.add_player("LOSE1", "l_1", "สืบ", "investigator")
    mgr.start_combat("LOSE1", return_scene="A3")
    pl1.hp = 0
    lose_res = mgr.apply_ghost_turn(
        "LOSE1",
        GhostTurnDecision(
            move_id="WET_CLAW",
            target_player_id=pl1.public_id,
            narration_th="ผีโจมตีซ้ำ",
        ),
    )
    assert lose_res["defeated"] is True
    assert room_lose.ending_triggered == "lost_in_grove"


def test_http_endpoints_and_frontend_serving() -> None:
    with TestClient(app) as client:
        res_health = client.get("/healthz")
        assert res_health.status_code == 200
        assert res_health.json()["total_dialogues"] >= 49

        res_scenario = client.get("/api/scenario")
        assert res_scenario.status_code == 200
        sc_body = res_scenario.json()
        assert len(sc_body["roles"]) == 6
        assert sc_body["combat_encounter"]["id"] == "DROWNED_ECHO"

        res_roles = client.get("/api/rooms/BANANA01/roles")
        assert res_roles.status_code == 200
        assert res_roles.json()["room_code"] == "BANANA01"

        res_index = client.get("/")
        assert res_index.status_code == 200
        assert "เสียงร้องจากสวนกล้วย" in res_index.text

        res_fx = client.get("/audio_fx.js")
        assert res_fx.status_code == 200
        assert "AudioFXEngine" in res_fx.text


def test_gemini_primary_to_paid_failover() -> None:
    engine = AIDMEngine()
    calls: list[str] = []
    engine._gemini_client = "primary_client"
    engine._gemini_paid_client = "paid_client"
    engine._primary_cooldown_until = 0.0

    def fake_call(client: str) -> str:
        calls.append(client)
        if client == "primary_client":
            raise RuntimeError("429 RESOURCE_EXHAUSTED: RequestsPerDay exceeded")
        return "paid_ok"

    # 1st call hits primary -> daily quota 429 -> fails over to paid & cools down primary
    assert engine._run_with_gemini_failover(fake_call) == "paid_ok"
    assert calls == ["primary_client", "paid_client"]
    assert engine._primary_cooldown_until > time.time()

    # 2nd call during cooldown goes directly to paid
    calls.clear()
    assert engine._run_with_gemini_failover(fake_call) == "paid_ok"
    assert calls == ["paid_client"]


def test_list_public_rooms_endpoint() -> None:
    from backend.main import room_manager

    room_manager.rooms.clear()
    room_manager.sid_to_player.clear()
    room_manager.add_player("PUB01", "pub_s1", "ต้น", "investigator")
    room_manager.add_player("PUB01", "pub_s2", "พลอย", "medium")
    room_manager.start_game("PUB01")

    with TestClient(app) as client:
        res = client.get("/api/rooms")
        assert res.status_code == 200
        rooms = res.json()["rooms"]
        assert len(rooms) == 1
        assert rooms[0]["room_code"] == "PUB01"
        assert rooms[0]["player_count"] == 2
        assert rooms[0]["online_count"] == 2
        assert rooms[0]["started"] is True
        assert set(rooms[0]["taken_roles"]) == {"investigator", "medium"}


def test_input_queue_prevents_simultaneous_turns() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)

    room, p1, _ = mgr.add_player("Q01", "qs_1", "ต้น", "investigator")
    _, p2, _ = mgr.add_player("Q01", "qs_2", "พลอย", "medium")
    _, p3, _ = mgr.add_player("Q01", "qs_3", "หมอ", "ritualist")

    # Player 1 starts a turn -> Player 2 cannot start mic
    mgr.begin_turn(room, p1, "กำลังถอดเสียง...")
    can_mic, holder = mgr.can_start_mic(room, "qs_2")
    assert can_mic is False
    assert holder == "ต้น"

    # Player 1 cannot double-submit into queue while holding the turn
    ok_self, _ = mgr.enqueue_text_input(room, p1, "qs_1", "ข้อความซ้ำ")
    assert ok_self is False

    # Player 2 and Player 3 can each enqueue 1 item in FIFO order
    ok_p2, _ = mgr.enqueue_text_input(room, p2, "qs_2", "คนหายมีใครบ้าง?")
    assert ok_p2 is True
    ok_p2_dup, _ = mgr.enqueue_text_input(room, p2, "qs_2", "ส่งซ้ำอีกที")
    assert ok_p2_dup is False
    ok_p3, _ = mgr.enqueue_text_input(room, p3, "qs_3", "ขอดูใบรับแจ้ง")
    assert ok_p3 is True

    snap = mgr.serialize_public_state(room)
    assert snap["turn_queue"]["busy"] is True
    assert snap["turn_queue"]["owner_name"] == "ต้น"
    assert [it["player_name"] for it in snap["turn_queue"]["items"]] == ["พลอย", "หมอ"]

    # End Player 1's turn & drain FIFO order
    mgr.end_turn(room)
    first = mgr.pop_next_queued_input(room)
    second = mgr.pop_next_queued_input(room)
    assert first is not None and first["player_name"] == "พลอย"
    assert second is not None and second["player_name"] == "หมอ"
    assert mgr.pop_next_queued_input(room) is None


def test_whisper_transcript_cleaning_filters_silence_and_hallucinations() -> None:
    # 1. Valid Thai segment stays, while high no_speech_prob / low avg_logprob segments drop
    res_mixed = {
        "segments": [
            {"text": " ถามผู้ใหญ่ประเสริฐเรื่องคนหาย ", "no_speech_prob": 0.12, "avg_logprob": -0.35},
            {"text": "ขอบคุณครับ", "no_speech_prob": 0.85, "avg_logprob": -0.5},
            {"text": "ซุบซิบไม่ชัด", "no_speech_prob": 0.25, "avg_logprob": -1.5},
        ]
    }
    assert _clean_whisper_transcript(res_mixed) == "ถามผู้ใหญ่ประเสริฐเรื่องคนหาย"

    # 2. Standalone Whisper hallucination boilerplate is suppressed
    assert _clean_whisper_transcript({"text": "  ขอบคุณที่รับชมค่ะ!  "}) == ""
    assert (
        _clean_whisper_transcript(
            {"segments": [{"text": "ขอบคุณที่รับชมค่ะ", "no_speech_prob": 0.2, "avg_logprob": -0.4}]}
        )
        == ""
    )


def test_gemini_audio_stt_primary_with_groq_fallback() -> None:
    import asyncio
    from types import SimpleNamespace

    engine = AIDMEngine()

    class _FakeModelsOK:
        def generate_content(self, **_kwargs):
            return SimpleNamespace(text="ถามผู้ใหญ่ประเสริฐเรื่องใบรับแจ้งความ")

    class _FakeModelsFail:
        def generate_content(self, **_kwargs):
            raise RuntimeError("gemini unavailable")

    class _FakeGroqTranscriptions:
        def create(self, **_kwargs):
            return {"text": "ขอดูแฟ้มคดี"}

    engine._gemini_client = SimpleNamespace(models=_FakeModelsOK())
    engine._gemini_paid_client = None
    engine._groq_client = SimpleNamespace(audio=SimpleNamespace(transcriptions=_FakeGroqTranscriptions()))

    # 1. Gemini Audio STT succeeds -> uses Gemini without calling Groq
    assert asyncio.run(engine.transcribe_audio(b"fake-audio-bytes", "speech.webm", "audio/webm;codecs=opus")) == "ถามผู้ใหญ่ประเสริฐเรื่องใบรับแจ้งความ"

    # 2. Gemini raises error -> automatically falls back to Groq Whisper
    engine._gemini_client = SimpleNamespace(models=_FakeModelsFail())
    assert asyncio.run(engine.transcribe_audio(b"fake-audio-bytes", "speech.webm", "audio/webm")) == "ขอดูแฟ้มคดี"


def test_empty_room_auto_closes_after_ttl_and_cancels_on_reconnect() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo, empty_room_ttl_seconds=60.0)

    room, p1, _ = mgr.add_player("EMPTY01", "esid_1", "ต้น", "investigator")
    assert room.empty_since is None

    # Last player disconnects -> empty_since is set and countdown appears in lobby summary
    mgr.remove_player("esid_1")
    assert room.empty_since is not None
    t0 = room.empty_since
    public_rooms = mgr.list_public_rooms()
    assert len(public_rooms) == 1
    assert public_rooms[0]["online_count"] == 0
    assert public_rooms[0]["closing_in_seconds"] is not None

    # Before TTL expires, cleanup keeps the room open
    assert mgr.cleanup_empty_rooms(now=t0 + 30.0) == []
    assert "EMPTY01" in mgr.rooms

    # Reconnecting before TTL clears empty_since and cancels auto-close
    _, _, reconnected = mgr.add_player("EMPTY01", "esid_2", "ต้น", "investigator", player_token=p1.player_token)
    assert reconnected is True
    assert room.empty_since is None
    assert mgr.cleanup_empty_rooms(now=t0 + 120.0) == []

    # Disconnect again and advance past TTL -> room is closed and roles freed
    mgr.remove_player("esid_2")
    assert room.empty_since is not None
    closed = mgr.cleanup_empty_rooms(now=room.empty_since + 61.0)
    assert closed == ["EMPTY01"]
    assert "EMPTY01" not in mgr.rooms
    assert mgr.get_taken_roles("EMPTY01") == []
    assert mgr.list_public_rooms() == []


def test_all_npc_voice_profiles_are_unique() -> None:
    repo = ScenarioRepository()
    profiles = repo.voice_profiles
    assert len(profiles) >= 11

    voices = [p["voice"] for p in profiles.values()]
    assert len(voices) == len(set(voices)), f"Duplicate NPC voices found: {voices}"

    for entry in repo.dialogues:
        speaker = entry.get("speaker")
        if speaker in profiles and entry.get("voice"):
            assert entry["voice"] == profiles[speaker]["voice"]


def test_usage_tracker_api_and_healthz_log_filter() -> None:
    import logging
    from backend.main import _QuietPollingAccessFilter, usage_tracker

    flt = _QuietPollingAccessFilter()
    rec_health = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0, '10.237.26.125:44316 - "GET /healthz HTTP/1.1" 200', (), None
    )
    rec_rooms = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0, '127.0.0.1:1000 - "GET /api/rooms HTTP/1.1" 200', (), None
    )
    rec_audio = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "",
        0,
        '27.130.34.95:0 - "GET /audio_assets/a1_intro_dm.wav HTTP/1.1" 206 Partial Content',
        (),
        None,
    )
    rec_asset = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "",
        0,
        '27.130.34.95:0 - "GET /assets/characters/prasert.png HTTP/1.1" 200 OK',
        (),
        None,
    )
    rec_favicon = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0, '27.130.34.95:0 - "GET /favicon.ico HTTP/1.1" 404 Not Found', (), None
    )
    rec_err = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0, '127.0.0.1:1000 - "GET /healthz HTTP/1.1" 500', (), None
    )
    assert flt.filter(rec_health) is False
    assert flt.filter(rec_rooms) is False
    assert flt.filter(rec_audio) is False
    assert flt.filter(rec_asset) is False
    assert flt.filter(rec_favicon) is False
    assert flt.filter(rec_err) is True

    with TestClient(app) as client:
        assert client.get("/favicon.ico").status_code == 204
        before_visits = usage_tracker.total_page_visits
        res_home = client.get("/", headers={"x-forwarded-for": "203.150.10.25", "user-agent": "Chrome/130 Windows"})
        assert res_home.status_code == 200

        usage_tracker.register_socket_client("sid_test_1", "203.150.10.25", "Chrome/130 Windows")
        usage_tracker.record_join("sid_test_1", "TEST01", "tok_test_1", "ผู้ทดสอบ", "นักสืบ", False)
        usage_tracker.record_turn("tok_test_1", "TEST01", "ผู้ทดสอบ", "script")
        usage_tracker.record_leave("sid_test_1", "tok_test_1", "TEST01", "ผู้ทดสอบ", 0)

        res_usage = client.get("/api/usage")
        assert res_usage.status_code == 200
        body = res_usage.json()
        assert body["totals"]["page_visits"] == before_visits + 1
        assert body["totals"]["unique_visitors"] >= 1
        assert body["totals"]["total_joins"] >= 1
        assert body["totals"]["total_turns"] >= 1
        assert any(s["player_name"] == "ผู้ทดสอบ" and s["turns_count"] == 1 for s in body["recent_sessions"])
        # Ensure raw IP is masked (never stored/exposed unmasked)
        assert all("203.150.10.25" not in s["visitor"] for s in body["recent_sessions"])


def test_script_mode_with_check_or_improvised_text_and_pending_check_blocks_antistall() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, _, _ = mgr.add_player("CTX01", "sid_1", "ฟรังก์", "investigator")
    mgr.start_game("CTX01")

    # 1. If Gemini emits mode="script" with selected_audio_id=None and improvised_text, honor it
    out1 = mgr.validate_and_apply_decision(
        room,
        DMDecision(
            mode="script",
            character="ประเสริฐ",
            selected_audio_id=None,
            improvised_text="คืนนี้ฝนตกหนักมาก ข้าวของในรถตู้ยังแห้งดีใช่ไหมครับ",
        ),
        "ฟรังก์",
    )
    assert out1["needs_live_tts"] is True
    assert out1["live_tts_text"] == "คืนนี้ฝนตกหนักมาก ข้าวของในรถตู้ยังแห้งดีใช่ไหมครับ"

    # 2. Advance to turn 5, then open A1_PER_OBSERVE with mode="script" and id=None on turn 6
    for _ in range(4):
        mgr.validate_and_apply_decision(
            room,
            DMDecision(mode="improvise", character="ประเสริฐ", improvised_text="ครับผม"),
            "ฟรังก์",
        )
    assert room.scene_turn_count == 5

    out6 = mgr.validate_and_apply_decision(
        room,
        DMDecision(
            mode="script",
            character="DM",
            selected_audio_id=None,
            requested_check_id="A1_PER_OBSERVE",
        ),
        "ฟรังก์",
    )
    assert room.pending_check is not None
    assert room.pending_check["id"] == "A1_PER_OBSERVE"
    assert "ทอยเต๋า" in out6["live_tts_text"]
    # Anti-stall must wait while a pending_check is waiting for player roll
    assert room.current_scene == "A1"
    assert room.scene_turn_count == 6


def test_gemini_503_transient_retry_and_failover(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(time, "sleep", lambda _s: None)
    engine = AIDMEngine()
    engine._gemini_client = "primary"
    engine._gemini_paid_client = "paid"
    engine._primary_cooldown_until = 0.0

    # 1. Primary hits transient 503 once, succeeds on retry without burning paid key
    calls: list[str] = []

    def flaky_once(client: str) -> str:
        calls.append(client)
        if len(calls) == 1:
            raise RuntimeError("503 UNAVAILABLE: This model is currently experiencing high demand.")
        return "recovered_primary"

    assert engine._run_with_gemini_failover(flaky_once) == "recovered_primary"
    assert calls == ["primary", "primary"]

    # 2. Primary persistently 503 -> fails over to paid key instead of crashing to keyword fallback
    calls2: list[str] = []

    def persistent_primary_503(client: str) -> str:
        calls2.append(client)
        if client == "primary":
            raise RuntimeError("503 UNAVAILABLE")
        return "paid_rescued"

    assert engine._run_with_gemini_failover(persistent_primary_503) == "paid_rescued"
    assert calls2 == ["primary", "primary", "primary", "paid"]
