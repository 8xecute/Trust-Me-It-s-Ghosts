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
    # No forced scene transition and no automatic anti-stall hint after 6+ turns
    assert "a1_antistall_hint" not in queued_ids
    assert room.current_scene == "A1"
    assert player.sanity == 10

    # Player explicitly chooses to open the folder by the van -> transitions to A2 & plays eerie radio
    move_a2 = DMDecision(mode="script", character="DM", selected_audio_id="a1_open_folder_to_a2")
    a2_outcome = mgr.validate_and_apply_decision(room, move_a2, "พลอย")
    a2_queued_ids = [ev["dialogue_id"] for ev in a2_outcome["queued_events"]]
    assert "a2_radio_voice" in a2_queued_ids
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
    engine._prefer_paid_client = False

    def fake_daily_call(client: str) -> str:
        calls.append(client)
        if client == "primary_client":
            raise RuntimeError("429 RESOURCE_EXHAUSTED: RequestsPerDay exceeded")
        return "paid_ok"

    # 1st call hits primary -> daily quota 429 -> fails over to paid & pins paid for session
    assert engine._run_with_gemini_failover(fake_daily_call) == "paid_ok"
    assert calls == ["primary_client", "paid_client"]
    assert engine._prefer_paid_client is True
    assert engine._primary_cooldown_until > time.time()

    # 2nd call goes directly to paid without waiting on primary
    calls.clear()
    assert engine._run_with_gemini_failover(fake_daily_call) == "paid_ok"
    assert calls == ["paid_client"]

    # Reset and verify per-minute RPM 429 also permanently switches to paid for the session
    engine._primary_cooldown_until = 0.0
    engine._prefer_paid_client = False
    calls.clear()

    def fake_rpm_call(client: str) -> str:
        calls.append(client)
        if client == "primary_client":
            raise RuntimeError("429 RESOURCE_EXHAUSTED: GenerateRequestsPerMinutePerProjectPerModel-FreeTier")
        return "paid_rpm_ok"

    assert engine._run_with_gemini_failover(fake_rpm_call) == "paid_rpm_ok"
    assert calls == ["primary_client", "paid_client"]
    assert engine._prefer_paid_client is True

    calls.clear()
    assert engine._run_with_gemini_failover(fake_rpm_call) == "paid_rpm_ok"
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


def test_act_b_data_integrity_and_unique_voices() -> None:
    repo = ScenarioRepository()
    assert len(repo.dialogues) == 90
    for new_id in ("a1_qa_missing_who", "b2_qa_ton_friends", "b3_wichai_stay_behind"):
        assert new_id in repo.dialogues_by_id
    for scene_id in ("A1", "A2", "A3", "B1", "B2", "B3"):
        assert scene_id in repo.scenes
    for check_id in ("B2_WICHAI_TELL", "B3_TON_DISCLOSURE", "B4_FLOOD_PHOTO"):
        assert check_id in repo.dice_checks
    assert "act_b_complete" in repo.endings
    assert "filler_wichai_calm" in repo.fillers_by_id
    assert "filler_ton_nervous" in repo.fillers_by_id
    act_b_fillers = repo.get_fillers_for_act("B")
    assert all(f["speaker"] in {"DM", "วิชัย", "ต้น"} for f in act_b_fillers)


def test_act_b_flow_checks_guardrails_and_ending() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, _, _ = mgr.add_player("ACTB01", "sid_1", "เอม", "investigator", start_act="B")

    assert room.current_scene == "B1"
    assert room.board_node == "headman_living_room"
    snap0 = mgr.serialize_public_state(room)
    assert snap0["act"] == "B"
    assert [n["id"] for n in snap0["board_nodes"]] == [
        "headman_living_room",
        "headman_porch",
        "headman_archive_wall",
        "road_to_don_house",
    ]
    assert snap0["board_nodes"][-1]["unlocked"] is False

    # In Act A room, Act B cross-scene dialogues must NOT be eligible even if clues were injected
    room_a, _, _ = mgr.add_player("ACTAONLY", "sid_a", "บี", "investigator", start_act="A")
    room_a.clues_found.append("don_house_location")
    assert all(
        d["id"] not in {"b_ending_to_act_c", "b3_wichai_stay_behind"}
        for d in mgr.get_eligible_dialogues(room_a)
    )
    assert "b3_wichai_stay_behind" in {d["id"] for d in mgr.get_eligible_dialogues(room)}

    _, intro_events = mgr.start_game("ACTB01")
    assert [ev["dialogue_id"] for ev in intro_events] == ["b1_intro_dm", "b1_wichai_greet"]

    # Guardrail 1: Prasert must NEVER speak in Act B (even if LLM hallucinates character="ประเสริฐ" or filler)
    bad_prasert = DMDecision(
        mode="improvise",
        character="ประเสริฐ",
        filler_audio_id="filler_prasert_hmm",
        improvised_text="สวัสดีครับ",
    )
    out_guard = mgr.validate_and_apply_decision(room, bad_prasert, "เอม")
    assert out_guard["live_tts_speaker"] == "วิชัย"
    assert out_guard["primary_event"]["character"] == "วิชัย"

    # Guardrail 2: b1_qa_wichai_flood_kaew must be rejected before flood_photo_seen is unlocked
    early_flood = DMDecision(mode="script", character="วิชัย", selected_audio_id="b1_qa_wichai_flood_kaew")
    out_early = mgr.validate_and_apply_decision(room, early_flood, "เอม")
    assert out_early["needs_live_tts"] is True
    assert "wichai_flood_survivor" not in room.clues_found

    # Guardrail 3: Inspecting files in B1 unlocks don_house_location, map_two_layers, village_map_copy & road_to_don_house node
    files_res = mgr.validate_and_apply_decision(
        room,
        DMDecision(mode="script", character="DM", selected_audio_id="b1_inspect_files_free"),
        "เอม",
    )
    assert files_res["needs_live_tts"] is False
    assert "don_house_location" in room.clues_found
    assert "map_two_layers" in room.clues_found
    assert "village_map_copy" in room.inventory

    # Trigger and resolve B2_WICHAI_TELL in B1
    pending_b2 = mgr.trigger_check(room, "B2_WICHAI_TELL", "เอม")
    assert pending_b2 is not None
    res_b2 = mgr.resolve_dice_roll("ACTB01", "sid_1")
    assert res_b2["roll"]["check_id"] == "B2_WICHAI_TELL"

    # Cross-act board movement is rejected
    with pytest.raises(ValueError, match="คนละช่วงเนื้อเรื่อง"):
        mgr.move_board_node("ACTB01", "sala", "เอม")

    # Move to B2 porch via board map -> plays b2_intro_dm and Ton can talk + gain/lose trust
    move_b2 = mgr.move_board_node("ACTB01", "headman_porch", "เอม")
    assert room.current_scene == "B2"
    assert [ev["dialogue_id"] for ev in move_b2["events"]] == ["b2_intro_dm"]
    mgr.trigger_check(room, "B3_TON_DISCLOSURE", "เอม")
    mgr.resolve_dice_roll("ACTB01", "sid_1")
    assert "B3_TON_DISCLOSURE" in room.resolved_checks

    # Move to B3 archive wall via DM scene update -> plays b3_intro_dm & unlocks flood_photo_seen
    move_b3 = mgr.validate_and_apply_decision(
        room,
        DMDecision(
            mode="improvise",
            character="DM",
            improvised_text="คุณเดินกลับเข้าห้องรับแขกไปดูผนังภาพถ่ายเก่าปี 2534",
            state_updates=StateUpdates(current_scene="B3"),
        ),
        "เอม",
    )
    assert room.current_scene == "B3"
    assert room.board_node == "headman_archive_wall"
    assert any(ev["dialogue_id"] == "b3_intro_dm" for ev in move_b3["queued_events"])
    assert "flood_photo_seen" in room.clues_found

    # Return to B1 -> now b1_qa_wichai_flood_kaew IS eligible!
    mgr.move_board_node("ACTB01", "headman_living_room", "เอม")
    assert room.current_scene == "B1"
    out_flood_ok = mgr.validate_and_apply_decision(
        room,
        DMDecision(mode="script", character="วิชัย", selected_audio_id="b1_qa_wichai_flood_kaew"),
        "เอม",
    )
    assert out_flood_ok["needs_live_tts"] is False
    assert "wichai_flood_survivor" in room.clues_found

    # Depart to Don's house via board map -> emits Wichai farewell then b_ending_to_act_c
    end_res = mgr.move_board_node("ACTB01", "road_to_don_house", "เอม")
    assert room.ending_triggered == "act_b_complete"
    assert room.board_node == "road_to_don_house"
    assert [ev["dialogue_id"] for ev in end_res["events"]] == [
        "b3_wichai_stay_behind",
        "b_ending_to_act_c",
    ]


def test_seamless_act_a_to_act_b_transition() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, p1, _ = mgr.add_player("AB01", "sid_1", "ฟรังก์", "investigator", start_act="A")
    mgr.start_game("AB01")
    mgr.validate_and_apply_decision(
        room, DMDecision(mode="script", character="DM", selected_audio_id="a1_open_folder_to_a2"), "ฟรังก์"
    )
    mgr.validate_and_apply_decision(
        room, DMDecision(mode="script", character="ประเสริฐ", selected_audio_id="a2_move_to_a3"), "ฟรังก์"
    )
    mgr.move_board_node("AB01", "headman_house", "ฟรังก์")
    assert room.ending_triggered == "act_a_complete"
    prev_clues = list(room.clues_found)
    assert len(prev_clues) > 0

    _, b_events = mgr.advance_to_act_b("AB01")
    assert room.current_scene == "B1"
    assert room.board_node == "headman_living_room"
    assert room.ending_triggered is None
    assert p1.player_token in room.players
    assert all(c in room.clues_found for c in prev_clues)
    assert [ev["dialogue_id"] for ev in b_events] == ["b1_intro_dm", "b1_wichai_greet"]


def test_modular_data_and_categorized_audio_assets() -> None:
    from backend.state_manager import audio_bucket_for_entry

    repo = ScenarioRepository()
    assert len(repo.dialogues) == 90
    assert repo.count_cached_audio() == 88
    assert repo.resolve_audio_url("a1_intro_dm") == "/audio_assets/act_a/a1_intro_dm.wav"
    assert repo.resolve_audio_url("b1_intro_dm") == "/audio_assets/act_b/b1_intro_dm.wav"
    assert repo.resolve_audio_url("combat_drowned_intro") == "/audio_assets/combat/combat_drowned_intro.wav"
    assert repo.resolve_audio_url("filler_dm_think") == "/audio_assets/fillers/filler_dm_think.wav"

    pending_voice_ids = {"b2_qa_ton_friends", "b3_wichai_stay_behind"}
    assert audio_bucket_for_entry(repo.dialogues_by_id["a1_qa_missing_who"]) == "act_a"
    assert audio_bucket_for_entry(repo.dialogues_by_id["b2_qa_ton_friends"]) == "act_b"
    assert audio_bucket_for_entry(repo.dialogues_by_id["b3_wichai_stay_behind"]) == "act_b"

    for entry in repo.dialogues:
        if entry["id"] in pending_voice_ids:
            continue
        url = repo.resolve_audio_url(entry["id"])
        assert url is not None, f"Missing audio for {entry['id']}"
        rel = url.removeprefix("/audio_assets/")
        assert (PROTO_DIR / "audio_assets" / rel).exists()

    with TestClient(app) as client:
        res_health = client.get("/healthz")
        assert res_health.status_code == 200
        assert res_health.json()["pregen_audio_count"] == 88
        assert client.get("/audio_assets/act_b/b1_intro_dm.wav").status_code == 200


def test_story_workspace_files_and_roundtrip_parser(tmp_path: Path) -> None:
    import shutil
    from scripts.import_story_edits import collect_changes, parse_markdown_dialogues

    story_dir = PROTO_DIR / "story"
    expected = (
        "README.md",
        "00_characters_and_voices.md",
        "00_dm_knowledge_and_backstory.md",
        "01_act_a_script.md",
        "02_act_b_script.md",
        "03_act_c_script.md",
        "04_act_d_script.md",
        "05_act_e_script.md",
        "06_act_f_final_script.md",
        "07_combat_and_endings.md",
    )
    for name in expected:
        p = story_dir / name
        assert p.exists(), f"Missing story doc {name}"
        assert p.stat().st_size > 500

    dm_doc = (story_dir / "00_dm_knowledge_and_backstory.md").read_text(encoding="utf-8")
    for marker in (
        "DM KNOWLEDGE",
        "Evidence Payoff Contract",
        "เงื่อนไขสถานะของคดี",
        "State Snapshot",
        "7.1 สถานะที่ใช้ในคดี",
        "7.2 หลักฐานหลายทาง",
    ):
        assert marker in dm_doc, f"Missing DM section marker: {marker}"

    # Synced workspace must produce 0 pending diffs
    changes, _ = collect_changes(story_dir=story_dir, data_dir=PROTO_DIR / "data")
    assert changes == []

    # Simulate writer polishing a line in a temp copy of story/ & data/
    tmp_story = tmp_path / "story"
    tmp_data = tmp_path / "data"
    shutil.copytree(story_dir, tmp_story)
    shutil.copytree(PROTO_DIR / "data", tmp_data)
    act_b_md = tmp_story / "02_act_b_script.md"
    raw = act_b_md.read_text(encoding="utf-8")
    edited = raw.replace(
        "สวัสดีครับ ผมวิชัย ผู้ช่วยผู้ใหญ่ ผมจัดแฟ้มคนหายกับแผนที่ไว้ให้แล้วครับ อยากเริ่มดูตรงไหน บอกได้เลย",
        "สวัสดีครับ ผมวิชัย ผู้ช่วยผู้ใหญ่ เตรียมแฟ้มกับแผนที่ไว้ให้ครบแล้วครับ เชิญดูได้เลย",
    )
    act_b_md.write_text(edited, encoding="utf-8")

    tmp_changes, payloads = collect_changes(story_dir=tmp_story, data_dir=tmp_data)
    assert len(tmp_changes) == 1
    assert tmp_changes[0]["id"] == "b1_wichai_greet"
    assert tmp_changes[0]["field"] == "text"
    assert any("act_b" in str(p) for p in payloads)
    assert "b1_wichai_greet" in parse_markdown_dialogues(edited)


def test_patched_story_content_and_new_dialogues() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    engine = AIDMEngine()

    # 1. Dry muggy night narration & updated lore/prompts
    assert "อากาศแห้งอบอ้าวไร้เมฆฝน" in repo.get_dialogue("a1_intro_dm")["text"]
    assert "ฟ้าแห้งสนิทไร้เมฆฝน" in repo.get_dialogue("b2_intro_dm")["text"]
    assert "ผ้ายันต์หน้าประตู" in repo.clues_catalog["prasert_nervous_clue"]["detail"]
    assert "เด็กหนุ่มช่างสงสัย" in repo.clues_catalog["missing_names"]["detail"]
    assert "ขอดูแฟ้มในมือผู้ใหญ่ตรงข้างรถตู้เลยได้ไหมครับ?" in repo.get_scene("A1")["quick_prompts"]
    assert "คุณวิชัยช่วยดูแลเรื่องอะไรในหมู่บ้าน แล้วเคยเข้าสวนตอนกลางคืนไหม?" in repo.get_scene("B1")["quick_prompts"]

    # 2. Local fallback matches the new Q&A IDs in A1 and B2
    room_a, _, _ = mgr.add_player("PATCH01", "p_1", "เอก", "investigator", start_act="A")
    mgr.start_game("PATCH01")
    d_a1 = engine._local_fallback_decision(room_a, mgr, "ดล นิด เพิ่ม เป็นใคร ทำงานอะไรครับ")
    assert d_a1.mode == "script"
    assert d_a1.selected_audio_id == "a1_qa_missing_who"

    room_b, _, _ = mgr.add_player("PATCH02", "p_2", "พลอย", "medium", start_act="B")
    mgr.start_game("PATCH02")
    mgr.validate_and_apply_decision(
        room_b, DMDecision(mode="script", character="DM", selected_audio_id="b1_inspect_files_free"), "พลอย"
    )
    mgr._advance_scene(room_b, "B2")
    d_b2 = engine._local_fallback_decision(room_b, mgr, "ต้นรู้จักดลกับนิดมาก่อนไหม")
    assert d_b2.mode == "script"
    assert d_b2.selected_audio_id == "b2_qa_ton_friends"

    # 3. Departing via script decision b_ending_to_act_c sequences Wichai farewell before ending narration
    end_out = mgr.validate_and_apply_decision(
        room_b, DMDecision(mode="script", character="DM", selected_audio_id="b_ending_to_act_c"), "พลอย"
    )
    assert end_out["primary_event"]["dialogue_id"] == "b3_wichai_stay_behind"
    assert end_out["queued_events"][0]["dialogue_id"] == "b_ending_to_act_c"

    # 4. Story draft docs preserve Epilogue and updated CASE_ACCEPTED guidance
    story_dir = PROTO_DIR / "story"
    endings_doc = (story_dir / "07_combat_and_endings.md").read_text(encoding="utf-8")
    dm_doc = (story_dir / "00_dm_knowledge_and_backstory.md").read_text(encoding="utf-8")
    assert "บท Epilogue รุ่งเช้ากับผู้ใหญ่ประเสริฐ" in endings_doc
    assert "CASE_ACCEPTED=true" in dm_doc


def test_trpg_combat_telegraph_assist_and_freeform_declarations() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    engine = AIDMEngine()

    room, p1, _ = mgr.add_player("TRPG01", "t_1", "เอก", "investigator")
    _, p2, _ = mgr.add_player("TRPG01", "t_2", "พลอย", "medium")
    mgr.start_combat("TRPG01", return_scene="A3")

    assert room.combat is not None
    assert room.combat.telegraph is not None
    assert room.combat.telegraph["target_id"] in {p1.public_id, p2.public_id}
    assert len(room.combat.environment_features) == 3

    # p2 was telegraphed or afflicted -> p1 uses assist to cover p2 and grant +2 bonus
    p2.statuses = ["ROOTED"]
    assist_res = mgr.perform_combat_action(
        "TRPG01", "t_1", "assist", target_ally_id=p2.public_id
    )
    assert assist_res["visual_fx"] == "party_buff"
    assert p2.statuses == []
    assert p2.damage_reduction >= 2
    assert p2.assisted_bonus == 2
    assert p2.protected_by == "เอก"
    assert room.combat.last_roll is not None and room.combat.last_roll["action_id"] == "assist"

    # Freeform Thai combat declaration awards tactical bonus + custom narrations & consumes assisted_bonus
    decl = "สาดไฟฉายแรงสูงลงกลางแอ่งโคลนแล้วพุ่งกระแทกให้มันชะงัก"
    plan = engine._local_fallback_combat_action(room, p2, decl)
    assert plan.action_id == "strike"
    assert plan.tactical_bonus == 2
    assert plan.stat_choice == "PER"

    strike_res = mgr.perform_combat_action(
        "TRPG01",
        "t_2",
        plan.action_id,
        intent_text=decl,
        stat_override=plan.stat_choice,
        tactical_bonus=plan.tactical_bonus,
        tactical_reason=plan.tactical_reason,
        narration_by_tier={
            "full": plan.narration_full,
            "partial": plan.narration_partial,
            "failure": plan.narration_failure,
        },
    )
    assert strike_res["ready_for_ghost_turn"] is True
    assert strike_res["roll_detail"] is not None
    assert strike_res["roll_detail"]["bonus"] >= 4  # +2 assist +2 tactical
    assert strike_res["roll_detail"]["stat"] == "PER"
    assert p2.assisted_bonus == 0

    # Ghost turn records ghost last_roll and refreshes telegraph for round 2
    ghost_res = mgr.apply_ghost_turn(
        "TRPG01",
        GhostTurnDecision(
            move_id="WET_CLAW",
            target_player_id=p2.public_id,
            narration_th="ผีเงาจมน้ำตวัดเล็บใส่พลอย!",
        ),
    )
    assert ghost_res["roll_detail"]["is_ghost"] is True
    assert room.combat is not None
    assert room.combat.round_number == 2
    assert room.combat.telegraph is not None


def test_third_person_narration_coerced_to_dm_speaker() -> None:
    repo = ScenarioRepository()
    mgr = RoomManager(repo)
    room, _, _ = mgr.add_player("NARR01", "sid_1", "เอก", "investigator")
    mgr.start_game("NARR01")

    # Third-person narration accidentally tagged as Prasert must be coerced to DM + DM filler
    out_narration = mgr.validate_and_apply_decision(
        room,
        DMDecision(
            mode="improvise",
            character="ประเสริฐ",
            filler_audio_id="filler_prasert_hmm",
            improvised_text="ผู้ใหญ่ประเสริฐหันมามองหน้าคุณนิ่ง ๆ แววตาสั่นระริกด้วยความกังวล",
        ),
        "เอก",
    )
    assert out_narration["live_tts_speaker"] == "DM"
    assert out_narration["primary_event"]["character"] == "DM"
    assert out_narration["primary_event"]["dialogue_id"] == "filler_dm_think"

    # First-person Prasert line mentioning another NPC keeps ประเสริฐ as speaker
    out_speech = mgr.validate_and_apply_decision(
        room,
        DMDecision(
            mode="improvise",
            character="ประเสริฐ",
            filler_audio_id="filler_prasert_hmm",
            improvised_text="วิชัยช่วยเตรียมแฟ้มกับแผนที่รอไว้ที่บ้านแล้วครับ",
        ),
        "เอก",
    )
    assert out_speech["live_tts_speaker"] == "ประเสริฐ"
    assert out_speech["primary_event"]["character"] == "ประเสริฐ"
    assert out_speech["primary_event"]["dialogue_id"] == "filler_prasert_hmm"
