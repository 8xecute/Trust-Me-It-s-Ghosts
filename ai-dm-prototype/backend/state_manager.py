"""Authoritative multiplayer room state, unique roles, reconnect, guardrails, and turn-based combat."""

from __future__ import annotations

import json
import os
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

from backend.schemas import DMDecision, GhostTurnDecision

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = BASE_DIR / "audio_assets"
MIC_LOCK_TIMEOUT_SECONDS = 18.0
MAX_LIVE_TTS_PER_ROOM = 25
DEFAULT_EMPTY_ROOM_TTL_SECONDS = 120.0


class ScenarioRepository:
    """Loads and serves data-driven dialogues, lore, voice profiles, checks, combat, and assets."""

    def __init__(self, data_dir: Path = DATA_DIR, audio_dir: Path = AUDIO_DIR) -> None:
        self.data_dir = data_dir
        self.audio_dir = audio_dir

        dialogues_raw = json.loads((data_dir / "dialogues.json").read_text(encoding="utf-8"))
        lore_raw = json.loads((data_dir / "world_lore.json").read_text(encoding="utf-8"))

        self.voice_profiles: dict[str, dict[str, str]] = dialogues_raw.get("voice_profiles", {})
        self.dialogues: list[dict[str, Any]] = dialogues_raw.get("dialogues", [])
        self.dialogues_by_id: dict[str, dict[str, Any]] = {
            entry["id"]: entry for entry in self.dialogues
        }
        self.fillers: list[dict[str, Any]] = [
            entry for entry in self.dialogues if entry.get("is_filler")
        ]
        self.fillers_by_id: dict[str, dict[str, Any]] = {
            entry["id"]: entry for entry in self.fillers
        }

        self.lore: dict[str, Any] = lore_raw
        self.case_title: str = lore_raw.get("case_title", "CASE 001")
        self.roles: list[dict[str, Any]] = lore_raw.get("roles", [])
        self.roles_by_id: dict[str, dict[str, Any]] = {r["id"]: r for r in self.roles}
        self.clues_catalog: dict[str, dict[str, str]] = lore_raw.get("clues_catalog", {})
        self.items_catalog: dict[str, dict[str, str]] = lore_raw.get("items_catalog", {})
        self.board_nodes: list[dict[str, Any]] = lore_raw.get("board_nodes", [])
        self.board_nodes_by_id: dict[str, dict[str, Any]] = {
            n["id"]: n for n in self.board_nodes
        }
        self.scenes: dict[str, dict[str, Any]] = lore_raw.get("scenes", {})
        self.dice_checks: dict[str, dict[str, Any]] = lore_raw.get("dice_checks", {})
        self.combat_encounter: dict[str, Any] = lore_raw.get("combat_encounter", {})
        self.endings: dict[str, dict[str, Any]] = lore_raw.get("endings", {})

        self.reserved_check_audio_ids: set[str] = {
            audio_id
            for check in self.dice_checks.values()
            for audio_id in check.get("audio_ids", {}).values()
        }
        self.reserved_antistall_audio_ids: set[str] = {
            scene["anti_stall_audio_id"]
            for scene in self.scenes.values()
            if scene.get("anti_stall_audio_id")
        }

    def get_dialogue(self, dialogue_id: str) -> Optional[dict[str, Any]]:
        return self.dialogues_by_id.get(dialogue_id)

    def get_scene(self, scene_id: str) -> Optional[dict[str, Any]]:
        return self.scenes.get(scene_id)

    def get_check(self, check_id: str) -> Optional[dict[str, Any]]:
        return self.dice_checks.get(check_id)

    def get_ending(self, ending_id: str) -> Optional[dict[str, Any]]:
        return self.endings.get(ending_id)

    def get_role(self, role_id: str) -> Optional[dict[str, Any]]:
        return self.roles_by_id.get(role_id)

    def get_voice_profile(self, speaker: str) -> dict[str, str]:
        return self.voice_profiles.get(
            speaker,
            self.voice_profiles.get("DM", {"voice": "Charon", "style": "เสียงทุ้มต่ำ สุขุม"}),
        )

    def resolve_audio_url(self, audio_id: str) -> Optional[str]:
        """Return static URL if pre-generated .mp3 or .wav exists on disk."""
        for ext in ("mp3", "wav"):
            if (self.audio_dir / f"{audio_id}.{ext}").exists():
                return f"/audio_assets/{audio_id}.{ext}"
        return None

    def count_cached_audio(self) -> int:
        if not self.audio_dir.exists():
            return 0
        seen: set[str] = set()
        for path in self.audio_dir.iterdir():
            if path.is_file() and path.suffix.lower() in {".mp3", ".wav"}:
                seen.add(path.stem)
        return len(seen)

    def default_filler_for_speaker(self, speaker: str) -> dict[str, Any]:
        preferred = {
            "DM": "filler_dm_think",
            "ประเสริฐ": "filler_prasert_hmm",
            "เสียงวิทยุ": "filler_radio_static",
            "ผีเงาจมน้ำ": "filler_ghost_choke",
        }.get(speaker, "filler_dm_think")
        if preferred in self.fillers_by_id:
            return self.fillers_by_id[preferred]
        return self.fillers[0]


@dataclass
class PlayerInfo:
    player_token: str
    public_id: str
    sid: Optional[str]
    name: str
    role_id: str
    role_name: str
    avatar: str
    stats: dict[str, int]
    skill: dict[str, Any] = field(default_factory=dict)
    hp: int = 15
    max_hp: int = 15
    sanity: int = 10
    max_sanity: int = 10
    focus: int = 4
    max_focus: int = 4
    statuses: list[str] = field(default_factory=list)
    guarded: bool = False
    damage_reduction: int = 0
    acted_this_round: bool = False
    connected: bool = True
    joined_at: float = field(default_factory=time.time)

    @property
    def is_conscious(self) -> bool:
        return self.hp > 0 and self.sanity > 0


@dataclass
class CombatState:
    active: bool = True
    round_number: int = 1
    phase: Literal["players", "ghost"] = "players"
    enemy_id: str = "DROWNED_ECHO"
    enemy_name: str = "ผีเงาจมน้ำ"
    enemy_sprite: str = "/assets/characters/drowned_echo.png"
    background_image: str = "/assets/scenes/banana_grove.png"
    enemy_hp: int = 8
    enemy_max_hp: int = 8
    soothe_progress: int = 0
    soothe_goal: int = 3
    retreat_progress: int = 0
    retreat_goal: int = 2
    ghost_exposed: bool = False
    party_shield: int = 0
    return_scene: str = "A3"
    combat_log: list[str] = field(default_factory=list)


@dataclass
class RoomState:
    room_code: str
    started: bool = False
    current_scene: str = "A1"
    board_node: str = "sala"
    scene_turn_count: int = 0
    total_turn_count: int = 0
    inventory: list[str] = field(default_factory=list)
    clues_found: list[str] = field(default_factory=list)
    npc_trust: dict[str, int] = field(default_factory=lambda: {"ประเสริฐ": 0})
    played_audio_ids: list[str] = field(default_factory=list)
    resolved_checks: dict[str, dict[str, Any]] = field(default_factory=dict)
    pending_check: Optional[dict[str, Any]] = None
    ending_triggered: Optional[str] = None
    players: dict[str, PlayerInfo] = field(default_factory=dict)  # keyed by player_token
    active_speaker_sid: Optional[str] = None
    active_speaker_name: Optional[str] = None
    mic_locked_at: Optional[float] = None
    last_activity_at: float = field(default_factory=time.time)
    empty_since: Optional[float] = None
    idle_prompted: bool = False
    live_tts_used: int = 0
    live_tts_limit: int = MAX_LIVE_TTS_PER_ROOM
    combat: Optional[CombatState] = None
    turn_busy: bool = False
    turn_owner_id: Optional[str] = None
    turn_owner_name: Optional[str] = None
    turn_stage: str = ""
    input_queue: list[dict[str, Any]] = field(default_factory=list)
    transcript_log: list[dict[str, Any]] = field(default_factory=list)


class RoomManager:
    """Manages rooms, unique roles, reconnect, mic lock, guardrails, dice, and turn-based combat."""

    def __init__(self, repo: ScenarioRepository, empty_room_ttl_seconds: Optional[float] = None) -> None:
        self.repo = repo
        self.rooms: dict[str, RoomState] = {}
        self.sid_to_player: dict[str, tuple[str, str]] = {}  # sid -> (room_code, player_token)
        if empty_room_ttl_seconds is not None:
            ttl = float(empty_room_ttl_seconds)
        else:
            raw_ttl = os.getenv("EMPTY_ROOM_TTL_SECONDS", str(int(DEFAULT_EMPTY_ROOM_TTL_SECONDS)))
            try:
                ttl = float(raw_ttl)
            except ValueError:
                ttl = DEFAULT_EMPTY_ROOM_TTL_SECONDS
        self.empty_room_ttl_seconds: float = max(5.0, ttl)

    @staticmethod
    def normalize_room_code(room_code: str) -> str:
        cleaned = "".join(ch for ch in room_code.strip().upper() if ch.isalnum() or ch in "-_")
        return cleaned[:16] or "ROOM01"

    def get_or_create_room(self, room_code: str) -> RoomState:
        code = self.normalize_room_code(room_code)
        if code not in self.rooms:
            self.rooms[code] = RoomState(room_code=code)
        return self.rooms[code]

    def get_room_by_sid(self, sid: str) -> Optional[RoomState]:
        info = self.sid_to_player.get(sid)
        if not info:
            return None
        return self.rooms.get(info[0])

    def get_player_by_sid(self, sid: str) -> Optional[PlayerInfo]:
        info = self.sid_to_player.get(sid)
        if not info:
            return None
        room = self.rooms.get(info[0])
        if not room:
            return None
        return room.players.get(info[1])

    def cleanup_empty_rooms(
        self, ttl_seconds: Optional[float] = None, now: Optional[float] = None
    ) -> list[str]:
        """Close and delete rooms that have had zero connected players for at least TTL seconds."""
        ttl = self.empty_room_ttl_seconds if ttl_seconds is None else float(ttl_seconds)
        current = time.time() if now is None else float(now)
        closed_codes: list[str] = []

        for code, room in list(self.rooms.items()):
            has_online = any(p.connected for p in room.players.values())
            if has_online:
                room.empty_since = None
                continue
            if room.empty_since is None:
                room.empty_since = current
            if (current - room.empty_since) >= ttl:
                self.rooms.pop(code, None)
                stale_sids = [sid for sid, (rc, _tok) in self.sid_to_player.items() if rc == code]
                for stale_sid in stale_sids:
                    self.sid_to_player.pop(stale_sid, None)
                closed_codes.append(code)

        return closed_codes

    def get_taken_roles(self, room_code: str) -> list[str]:
        self.cleanup_empty_rooms()
        code = self.normalize_room_code(room_code)
        room = self.rooms.get(code)
        if not room:
            return []
        return [p.role_id for p in room.players.values()]

    def list_public_rooms(self) -> list[dict[str, Any]]:
        """Return spoiler-free active room summaries sorted by recent activity."""
        self.cleanup_empty_rooms()
        now = time.time()
        active = [r for r in self.rooms.values() if r.players]
        active.sort(key=lambda r: r.last_activity_at, reverse=True)
        summaries: list[dict[str, Any]] = []
        for room in active:
            scene_cfg = self.repo.get_scene(room.current_scene) or {}
            online_count = sum(1 for p in room.players.values() if p.connected)
            closing_in_seconds: Optional[int] = None
            if online_count == 0 and room.empty_since is not None:
                closing_in_seconds = max(
                    0, int(round(self.empty_room_ttl_seconds - (now - room.empty_since)))
                )
            summaries.append(
                {
                    "room_code": room.room_code,
                    "scene_id": room.current_scene,
                    "scene_title": scene_cfg.get("title", room.current_scene),
                    "player_count": len(room.players),
                    "online_count": online_count,
                    "max_players": 6,
                    "started": room.started,
                    "in_combat": bool(room.combat and room.combat.active),
                    "ended": room.ending_triggered is not None,
                    "taken_roles": [p.role_id for p in room.players.values()],
                    "closing_in_seconds": closing_in_seconds,
                }
            )
        return summaries

    def add_player(
        self,
        room_code: str,
        sid: str,
        name: str,
        role_id: str,
        player_token: Optional[str] = None,
    ) -> tuple[RoomState, PlayerInfo, bool]:
        """Join or reconnect to a room, enforcing unique investigator roles."""
        room = self.get_or_create_room(room_code)
        clean_name = name.strip()[:32] or "ผู้สืบสวน"

        # 1) Reconnect existing player by token
        if player_token and player_token in room.players:
            existing = room.players[player_token]
            if existing.sid and existing.sid != sid:
                self.sid_to_player.pop(existing.sid, None)
            existing.sid = sid
            existing.connected = True
            if name.strip():
                existing.name = clean_name
            self.sid_to_player[sid] = (room.room_code, existing.player_token)
            room.last_activity_at = time.time()
            room.empty_since = None
            return room, existing, True

        # 2) New player -> enforce unique role per room
        role = self.repo.get_role(role_id) or self.repo.roles[0]
        if any(p.role_id == role["id"] for p in room.players.values()):
            raise ValueError(
                f"อาชีพ '{role['name']}' มีผู้เล่นในห้องนี้เลือกไปแล้ว กรุณาเลือกอาชีพอื่น"
            )

        token = secrets.token_urlsafe(12)
        public_id = f"p_{len(room.players) + 1}_{secrets.token_hex(2)}"
        player = PlayerInfo(
            player_token=token,
            public_id=public_id,
            sid=sid,
            name=clean_name,
            role_id=role["id"],
            role_name=role["name"],
            avatar=role["avatar"],
            stats=dict(role.get("stats") or {}),
            skill=dict(role.get("skill") or {}),
            hp=int(role.get("max_hp", 15)),
            max_hp=int(role.get("max_hp", 15)),
            sanity=int(role.get("max_sanity", 10)),
            max_sanity=int(role.get("max_sanity", 10)),
            focus=int(role.get("max_focus", 4)),
            max_focus=int(role.get("max_focus", 4)),
        )
        room.players[token] = player
        self.sid_to_player[sid] = (room.room_code, token)
        room.last_activity_at = time.time()
        room.empty_since = None
        return room, player, False

    def remove_player(self, sid: str) -> tuple[Optional[RoomState], Optional[PlayerInfo], bool]:
        """Mark player offline on disconnect so they can reconnect with full stats."""
        info = self.sid_to_player.pop(sid, None)
        if not info:
            return None, None, False
        room_code, token = info
        room = self.rooms.get(room_code)
        if not room:
            return None, None, False

        player = room.players.get(token)
        if player and player.sid == sid:
            player.connected = False
            player.sid = None

        if not any(p.connected for p in room.players.values()):
            room.empty_since = room.empty_since or time.time()

        mic_released = False
        if room.active_speaker_sid == sid:
            room.active_speaker_sid = None
            room.active_speaker_name = None
            room.mic_locked_at = None
            mic_released = True
        return room, player, mic_released

    def consume_live_tts_quota(self, room: RoomState) -> bool:
        if room.live_tts_used >= room.live_tts_limit:
            return False
        room.live_tts_used += 1
        return True

    def _expire_stale_mic_lock(self, room: RoomState) -> bool:
        if room.active_speaker_sid and room.mic_locked_at is not None:
            if (time.time() - room.mic_locked_at) > MIC_LOCK_TIMEOUT_SECONDS:
                room.active_speaker_sid = None
                room.active_speaker_name = None
                room.mic_locked_at = None
                return True
        return False

    def acquire_mic(self, room_code: str, sid: str) -> tuple[bool, Optional[str]]:
        room = self.get_or_create_room(room_code)
        self._expire_stale_mic_lock(room)
        if room.active_speaker_sid and room.active_speaker_sid != sid:
            return False, room.active_speaker_name or "ผู้เล่นอื่น"
        player = self.get_player_by_sid(sid)
        speaker_name = player.name if player else "ผู้เล่น"
        room.active_speaker_sid = sid
        room.active_speaker_name = speaker_name
        room.mic_locked_at = time.time()
        room.last_activity_at = time.time()
        room.idle_prompted = False
        return True, speaker_name

    def release_mic(self, room_code: str, sid: str, force: bool = False) -> bool:
        room = self.get_or_create_room(room_code)
        if force or room.active_speaker_sid == sid:
            was_locked = room.active_speaker_sid is not None
            room.active_speaker_sid = None
            room.active_speaker_name = None
            room.mic_locked_at = None
            return was_locked
        return False

    def can_start_mic(self, room: RoomState, sid: str) -> tuple[bool, str]:
        self._expire_stale_mic_lock(room)
        if room.active_speaker_sid and room.active_speaker_sid != sid:
            return False, room.active_speaker_name or "ผู้เล่นอื่น"
        if room.turn_busy:
            return False, room.turn_owner_name or "ผู้เล่นอื่น"
        if room.input_queue:
            return False, room.input_queue[0]["player_name"]
        return True, ""

    def begin_turn(self, room: RoomState, player: PlayerInfo, stage: str = "") -> None:
        room.turn_busy = True
        room.turn_owner_id = player.public_id
        room.turn_owner_name = player.name
        room.turn_stage = stage

    def end_turn(self, room: RoomState) -> None:
        room.turn_busy = False
        room.turn_owner_id = None
        room.turn_owner_name = None
        room.turn_stage = ""

    def enqueue_text_input(
        self,
        room: RoomState,
        player: PlayerInfo,
        sid: str,
        text: str,
    ) -> tuple[bool, str]:
        if room.turn_owner_id == player.public_id or (
            room.active_speaker_sid and room.active_speaker_sid == sid
        ):
            return False, "คำพูดก่อนหน้าของคุณกำลังประมวลผลอยู่ กรุณารอสักครู่"
        if any(q["player_id"] == player.public_id for q in room.input_queue):
            return False, "คุณอยู่ในคิวรอส่งแล้ว กรุณารอให้ถึงคิวของคุณก่อน"
        if len(room.input_queue) >= 5:
            return False, "คิวข้อความเต็มชั่วคราว กรุณารอสักครู่"
        room.input_queue.append(
            {
                "player_id": player.public_id,
                "player_name": player.name,
                "sid": sid,
                "text": text,
            }
        )
        return True, f"เข้าคิวลำดับที่ {len(room.input_queue)} แล้ว"

    def pop_next_queued_input(self, room: RoomState) -> Optional[dict[str, Any]]:
        if not room.input_queue:
            return None
        return room.input_queue.pop(0)

    def clear_turn_queue(self, room: RoomState) -> None:
        room.input_queue.clear()
        self.end_turn(room)

    def append_log(self, room: RoomState, speaker: str, text: str, kind: str = "dialogue") -> dict[str, Any]:
        entry = {
            "id": f"log_{len(room.transcript_log) + 1}",
            "speaker": speaker,
            "text": text,
            "kind": kind,
            "scene": room.current_scene,
            "timestamp": time.time(),
        }
        room.transcript_log.append(entry)
        if len(room.transcript_log) > 150:
            room.transcript_log = room.transcript_log[-150:]
        return entry

    def _meets_trigger_condition(self, room: RoomState, entry: dict[str, Any]) -> bool:
        cond = entry.get("trigger_condition") or {}
        if cond.get("once") and entry["id"] in room.played_audio_ids:
            return False
        for clue_id in cond.get("requires_clues", []):
            if clue_id not in room.clues_found:
                return False
        for item_id in cond.get("requires_items", []):
            if item_id not in room.inventory:
                return False
        min_trust = cond.get("min_trust")
        if min_trust is not None and room.npc_trust.get("ประเสริฐ", 0) < min_trust:
            return False
        return True

    def get_eligible_dialogues(self, room: RoomState, include_endings: bool = True) -> list[dict[str, Any]]:
        eligible: list[dict[str, Any]] = []
        ending_audio_ids = {e.get("audio_id") for e in self.repo.endings.values()}
        for entry in self.repo.dialogues:
            did = entry["id"]
            if entry.get("is_filler"):
                continue
            if entry.get("scene") != room.current_scene:
                continue
            if did in self.repo.reserved_check_audio_ids:
                continue
            if did in self.repo.reserved_antistall_audio_ids:
                continue
            if not include_endings and did in ending_audio_ids:
                continue
            if self._meets_trigger_condition(room, entry):
                eligible.append(entry)
        return eligible

    def get_available_checks(self, room: RoomState) -> list[dict[str, Any]]:
        scene = self.repo.get_scene(room.current_scene) or {}
        checks: list[dict[str, Any]] = []
        for cid in scene.get("available_checks", []):
            if cid in room.resolved_checks:
                continue
            chk = self.repo.get_check(cid)
            if chk:
                checks.append(chk)
        return checks

    def _build_audio_payload(
        self,
        dialogue_id: Optional[str],
        speaker: str,
        text: str,
        is_filler: bool = False,
        mode: str = "script",
    ) -> dict[str, Any]:
        audio_url = self.repo.resolve_audio_url(dialogue_id) if dialogue_id else None
        return {
            "mode": mode,
            "dialogue_id": dialogue_id,
            "character": speaker,
            "subtitle": text,
            "audio_url": audio_url,
            "is_filler": is_filler,
        }

    def _apply_dialogue_unlocks(self, room: RoomState, entry: dict[str, Any]) -> Optional[str]:
        did = entry["id"]
        first_time = did not in room.played_audio_ids

        unlocks = entry.get("unlocks") or {}
        for clue_id in unlocks.get("clues", []):
            if clue_id in self.repo.clues_catalog and clue_id not in room.clues_found:
                room.clues_found.append(clue_id)
        for item_id in unlocks.get("items", []):
            if item_id in self.repo.items_catalog and item_id not in room.inventory:
                room.inventory.append(item_id)
        for npc, delta in (unlocks.get("trust_delta") or {}).items():
            cur = room.npc_trust.get(npc, 0)
            room.npc_trust[npc] = max(-3, min(5, cur + int(delta)))

        # Horror Sanity check: hearing the eerie radio voice drains 1 Sanity (min 1)
        if did == "a2_radio_voice" and first_time:
            for p in room.players.values():
                if p.sanity > 1:
                    p.sanity -= 1
            self.append_log(
                room,
                "ระบบ",
                "เสียงสำลักน้ำจากวิทยุทำให้ทุกคนในทีมเสียขวัญ (-1 สติ)",
                kind="system",
            )

        if first_time:
            room.played_audio_ids.append(did)

        next_scene = unlocks.get("next_scene")
        scene_cfg = self.repo.get_scene(room.current_scene) or {}
        if next_scene and next_scene in scene_cfg.get("allowed_next_scenes", []):
            return next_scene
        return None

    def _advance_scene(self, room: RoomState, next_scene: str) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        if next_scene == room.current_scene or next_scene not in self.repo.scenes:
            return events

        room.current_scene = next_scene
        room.scene_turn_count = 0
        room.pending_check = None
        if next_scene == "A2":
            room.board_node = "company_van"
        elif next_scene == "A3":
            room.board_node = "sala"

        scene_cfg = self.repo.get_scene(next_scene) or {}
        for intro_id in scene_cfg.get("intro_audio_ids", []):
            if intro_id in room.played_audio_ids:
                continue
            entry = self.repo.get_dialogue(intro_id)
            if not entry:
                continue
            self._apply_dialogue_unlocks(room, entry)
            self.append_log(room, entry["speaker"], entry["text"], kind="narration")
            events.append(
                self._build_audio_payload(
                    dialogue_id=entry["id"],
                    speaker=entry["speaker"],
                    text=entry["text"],
                    mode="script",
                )
            )
        return events

    def start_game(self, room_code: str) -> tuple[RoomState, list[dict[str, Any]]]:
        room = self.get_or_create_room(room_code)
        room.last_activity_at = time.time()
        room.idle_prompted = False
        if room.started:
            return room, []

        room.started = True
        events: list[dict[str, Any]] = []
        scene_cfg = self.repo.get_scene(room.current_scene) or {}
        for intro_id in scene_cfg.get("intro_audio_ids", []):
            entry = self.repo.get_dialogue(intro_id)
            if not entry:
                continue
            self._apply_dialogue_unlocks(room, entry)
            self.append_log(room, entry["speaker"], entry["text"], kind="narration")
            events.append(
                self._build_audio_payload(
                    dialogue_id=entry["id"],
                    speaker=entry["speaker"],
                    text=entry["text"],
                    mode="script",
                )
            )
        return room, events

    def trigger_check(self, room: RoomState, check_id: str, requested_by: str) -> Optional[dict[str, Any]]:
        scene_cfg = self.repo.get_scene(room.current_scene) or {}
        if check_id not in scene_cfg.get("available_checks", []):
            return None
        if check_id in room.resolved_checks:
            return None
        chk = self.repo.get_check(check_id)
        if not chk:
            return None

        pending = {
            "id": chk["id"],
            "title": chk["title"],
            "stat": chk["stat"],
            "dc": chk["dc"],
            "partial_margin": chk.get("partial_margin", 3),
            "requested_by": requested_by,
        }
        room.pending_check = pending
        return pending

    def resolve_dice_roll(self, room_code: str, sid: str) -> dict[str, Any]:
        room = self.get_or_create_room(room_code)
        if not room.pending_check:
            raise ValueError("ขณะนี้ยังไม่มีการทอยเต๋าที่รอผลอยู่")

        chk_meta = room.pending_check
        chk = self.repo.get_check(chk_meta["id"])
        if not chk:
            room.pending_check = None
            raise ValueError("ไม่พบข้อมูลการ์ดทอยเต๋า")

        player = self.get_player_by_sid(sid)
        roller_name = player.name if player else "ผู้สืบสวน"
        stat_name = chk["stat"]
        modifier = int(player.stats.get(stat_name, 0)) if player else 0

        d20 = secrets.randbelow(20) + 1
        total = d20 + modifier
        dc = int(chk["dc"])
        partial_min = dc - int(chk.get("partial_margin", 3))

        if total >= dc:
            tier = "full"
            tier_label = "สำเร็จเต็ม (Full Success)"
        elif total >= partial_min:
            tier = "partial"
            tier_label = "สำเร็จบางส่วน (Partial Success)"
        else:
            tier = "failure"
            tier_label = "ล้มเหลว (Failure)"

        room.resolved_checks[chk["id"]] = {
            "tier": tier,
            "tier_label": tier_label,
            "d20": d20,
            "modifier": modifier,
            "total": total,
            "dc": dc,
            "stat": stat_name,
            "rolled_by": roller_name,
        }
        room.pending_check = None
        room.last_activity_at = time.time()

        outcome_audio_id = chk["audio_ids"][tier]
        outcome_entry = self.repo.get_dialogue(outcome_audio_id)
        audio_event: Optional[dict[str, Any]] = None
        if outcome_entry:
            self._apply_dialogue_unlocks(room, outcome_entry)
            self.append_log(room, outcome_entry["speaker"], outcome_entry["text"], kind="check")
            audio_event = self._build_audio_payload(
                dialogue_id=outcome_entry["id"],
                speaker=outcome_entry["speaker"],
                text=outcome_entry["text"],
                mode="script",
            )

        return {
            "roll": {
                "check_id": chk["id"],
                "title": chk["title"],
                "stat": stat_name,
                "d20": d20,
                "modifier": modifier,
                "total": total,
                "dc": dc,
                "tier": tier,
                "tier_label": tier_label,
                "rolled_by": roller_name,
            },
            "audio_event": audio_event,
        }

    # ----------------- TURN-BASED COMBAT ENGINE -----------------

    def start_combat(self, room_code: str, return_scene: Optional[str] = None) -> list[dict[str, Any]]:
        room = self.get_or_create_room(room_code)
        enc = self.repo.combat_encounter
        party_count = max(2, len(room.players))
        max_hp = int(enc.get("base_hp_for_2", 8)) + max(0, party_count - 2) * int(
            enc.get("hp_per_extra_player", 3)
        )

        room.started = True
        room.pending_check = None
        room.board_node = "banana_grove_edge"
        self.clear_turn_queue(room)
        if room.active_speaker_sid:
            self.release_mic(room.room_code, room.active_speaker_sid, force=True)
        room.combat = CombatState(
            active=True,
            round_number=1,
            phase="players",
            enemy_id=enc.get("id", "DROWNED_ECHO"),
            enemy_name=enc.get("name", "ผีเงาจมน้ำ"),
            enemy_sprite=enc.get("sprite", "/assets/characters/drowned_echo.png"),
            background_image=enc.get("background_image", "/assets/scenes/banana_grove.png"),
            enemy_hp=max_hp,
            enemy_max_hp=max_hp,
            soothe_progress=0,
            soothe_goal=int(enc.get("soothe_goal", 3)),
            retreat_progress=0,
            retreat_goal=int(enc.get("retreat_goal", 2)),
            return_scene=return_scene or room.current_scene,
            combat_log=["เริ่มการเผชิญหน้ากับ ผีเงาจมน้ำ! รอบที่ 1 — ตาของผู้สืบสวน"],
        )

        for p in room.players.values():
            p.acted_this_round = False
            p.guarded = False
            p.damage_reduction = 0
            p.statuses = []

        events: list[dict[str, Any]] = []
        intro = self.repo.get_dialogue("combat_drowned_intro")
        if intro:
            self.append_log(room, intro["speaker"], intro["text"], kind="narration")
            events.append(
                self._build_audio_payload(
                    dialogue_id=intro["id"],
                    speaker=intro["speaker"],
                    text=intro["text"],
                    mode="script",
                )
            )
        return events

    def check_ready_for_ghost_turn(self, room: RoomState) -> bool:
        if not room.combat or not room.combat.active:
            return False
        conscious_connected = [
            p for p in room.players.values() if p.is_conscious and p.connected
        ]
        if not conscious_connected:
            conscious_connected = [p for p in room.players.values() if p.is_conscious]
        if not conscious_connected:
            return False
        return all(p.acted_this_round for p in conscious_connected)

    def perform_combat_action(self, room_code: str, sid: str, action_id: str) -> dict[str, Any]:
        room = self.get_or_create_room(room_code)
        combat = room.combat
        if not combat or not combat.active:
            raise ValueError("ขณะนี้ไม่ได้อยู่ในฉากต่อสู้")
        if combat.phase != "players":
            raise ValueError("กรุณารอตาของผีเงาจมน้ำสักครู่")

        player = self.get_player_by_sid(sid)
        if not player:
            raise ValueError("ไม่พบข้อมูลตัวละครของคุณในห้อง")
        if not player.is_conscious:
            raise ValueError("ตัวละครของคุณหมดสติหรือเสียขวัญแล้ว ไม่สามารถลงมือได้")
        if player.acted_this_round:
            raise ValueError("คุณลงมือในรอบนี้ไปแล้ว รอเพื่อนร่วมทีมหรือขึ้นรอบถัดไป")

        if "SHAKEN" in player.statuses and action_id in {"soothe", "role_skill"}:
            raise ValueError("ติดสถานะหวาดกลัว! รอบนี้กล่อมหรือใช้ท่าประจำอาชีพไม่ได้ (ลองโจมตีหรือดึงสติ)")
        if "ROOTED" in player.statuses and action_id == "retreat":
            raise ValueError("ติดสถานะพันธนาการ! ขาถูกจับไว้ ถอยทัพไม่ได้จนกว่าจะล้างสถานะหรือพ้นรอบนี้")

        enc = self.repo.combat_encounter
        pdef = int(enc.get("pdef", 12))
        mdef = int(enc.get("mdef", 13))
        exposed_bonus = 2 if combat.ghost_exposed else 0

        room.last_activity_at = time.time()
        summary = ""
        sfx = "combat_hit"
        events: list[dict[str, Any]] = []

        if action_id == "strike":
            stat = "BODY" if player.stats.get("BODY", 0) >= player.stats.get("SPI", 0) else "SPI"
            mod = int(player.stats.get(stat, 0))
            d20 = secrets.randbelow(20) + 1
            total = d20 + mod + exposed_bonus
            if total >= pdef:
                dmg = 3 + (1 if combat.ghost_exposed else 0)
                combat.enemy_hp = max(0, combat.enemy_hp - dmg)
                summary = f"{player.name} โจมตีด้วย {stat} (D20:{d20}+{mod + exposed_bonus}={total} ≥ {pdef}) โดนเต็ม! -{dmg} HP ผี"
                sfx = "combat_hit"
            elif total >= pdef - 3:
                dmg = 1
                combat.enemy_hp = max(0, combat.enemy_hp - dmg)
                summary = f"{player.name} โจมตีเฉี่ยว ({total}/{pdef}) ทำได้ {dmg} HP ผี"
                sfx = "combat_hit"
            else:
                summary = f"{player.name} โจมตีพลาด ({total}/{pdef}) เงาจมน้ำเลือนหลบไปได้"
                sfx = "dice_fail"

        elif action_id == "soothe":
            stat = "SOC" if player.stats.get("SOC", 0) >= player.stats.get("SPI", 0) else "SPI"
            mod = int(player.stats.get(stat, 0))
            d20 = secrets.randbelow(20) + 1
            total = d20 + mod + exposed_bonus
            if total >= mdef:
                gain = 2 if d20 >= 18 else 1
                combat.soothe_progress = min(combat.soothe_goal, combat.soothe_progress + gain)
                summary = f"{player.name} กล่อมวิญญาณ ({stat} {total} ≥ {mdef}) สงบลง +{gain} ({combat.soothe_progress}/{combat.soothe_goal})"
                sfx = "skill_cast"
            else:
                summary = f"{player.name} พยายามกล่อมวิญญาณ ({total}/{mdef}) แต่เสียงสำลักน้ำกลบเสียงของคุณ"
                sfx = "dice_fail"

        elif action_id == "steady":
            old_san, old_foc = player.sanity, player.focus
            player.sanity = min(player.max_sanity, player.sanity + 2)
            player.focus = min(player.max_focus, player.focus + 1)
            player.statuses = []
            summary = (
                f"{player.name} ตั้งสติและสะบัดหลุดจากอาการหลอน "
                f"(สติ {old_san}→{player.sanity}, โฟกัส {old_foc}→{player.focus})"
            )
            sfx = "skill_cast"

        elif action_id == "role_skill":
            if player.focus < 1:
                raise ValueError("โฟกัสไม่เพียงพอ (ต้องใช้ 1 โฟกัส) — ลองใช้ 'ดึงสติ' เพื่อฟื้นโฟกัส")
            player.focus -= 1
            skill_id = (player.skill or {}).get("id", "")
            skill_name = (player.skill or {}).get("name", "ท่าประจำอาชีพ")
            sfx = "skill_cast"

            if skill_id == "weakness_analysis":
                combat.ghost_exposed = True
                combat.enemy_hp = max(0, combat.enemy_hp - 1)
                summary = f"{player.name} ใช้ [{skill_name}] เปิดจุดอ่อนผี (+2 ทอยทั้งทีม) และทำ 1 HP ผี!"
            elif skill_id == "soothe_spirit":
                combat.soothe_progress = min(combat.soothe_goal, combat.soothe_progress + 2)
                summary = f"{player.name} ใช้ [{skill_name}] ปลอบวิญญาณ +2 ({combat.soothe_progress}/{combat.soothe_goal})"
            elif skill_id == "protective_talisman":
                combat.party_shield += 2
                for ally in room.players.values():
                    ally.statuses = []
                summary = f"{player.name} ใช้ [{skill_name}] กางเกราะทั้งทีม +2 และล้างสถานะผิดปกติทั้งหมด!"
            elif skill_id == "defensive_line":
                player.guarded = True
                player.damage_reduction += 2
                summary = f"{player.name} ใช้ [{skill_name}] ยืนขวางหน้าดึงเป้าผีและลดดาเมจ 2 หน่วย!"
            elif skill_id == "field_first_aid":
                conscious = [p for p in room.players.values() if p.is_conscious]
                target = min(conscious, key=lambda p: (p.hp, p.sanity)) if conscious else player
                target.hp = min(target.max_hp, target.hp + 3)
                target.sanity = min(target.max_sanity, target.sanity + 2)
                summary = f"{player.name} ใช้ [{skill_name}] รักษา {target.name} (+3 HP, +2 สติ)"
            else:  # spirit_scanner or fallback
                combat.ghost_exposed = True
                for ally in room.players.values():
                    if ally.player_token != player.player_token and ally.is_conscious:
                        ally.focus = min(ally.max_focus, ally.focus + 1)
                summary = f"{player.name} ใช้ [{skill_name}] เปิดจุดอ่อนผี (+2 ทอย) และคืน +1 โฟกัสให้เพื่อน!"

        elif action_id == "retreat":
            combat.retreat_progress = min(combat.retreat_goal, combat.retreat_progress + 1)
            summary = f"{player.name} คุ้มกันเปิดทางถอย ({combat.retreat_progress}/{combat.retreat_goal})"
            sfx = "skill_cast"
        else:
            raise ValueError("ไม่รู้จักคำสั่งต่อสู้ที่เลือก")

        player.acted_this_round = True
        combat.combat_log.append(summary)
        self.append_log(room, "ต่อสู้", summary, kind="check")

        # Check immediate combat resolution
        if combat.enemy_hp <= 0:
            combat.active = False
            room.combat = None
            room.ending_triggered = "act_a_combat_clear"
            win = self.repo.get_dialogue("combat_win_disperse")
            if win:
                self._apply_dialogue_unlocks(room, win)
                self.append_log(room, win["speaker"], win["text"], kind="ending")
                events.append(self._build_audio_payload(win["id"], win["speaker"], win["text"]))
            return {"summary": summary, "sfx": "dice_success", "ready_for_ghost_turn": False, "events": events}

        if combat.soothe_progress >= combat.soothe_goal:
            combat.active = False
            room.combat = None
            room.ending_triggered = "act_a_combat_clear"
            win = self.repo.get_dialogue("combat_win_soothe")
            if win:
                self._apply_dialogue_unlocks(room, win)
                self.append_log(room, win["speaker"], win["text"], kind="ending")
                events.append(self._build_audio_payload(win["id"], win["speaker"], win["text"]))
            return {"summary": summary, "sfx": "dice_success", "ready_for_ghost_turn": False, "events": events}

        if combat.retreat_progress >= combat.retreat_goal:
            combat.active = False
            room.combat = None
            room.current_scene = "A3"
            room.board_node = "sala"
            esc = self.repo.get_dialogue("combat_escape")
            if esc:
                self._apply_dialogue_unlocks(room, esc)
                self.append_log(room, esc["speaker"], esc["text"], kind="narration")
                events.append(self._build_audio_payload(esc["id"], esc["speaker"], esc["text"]))
            return {"summary": summary, "sfx": "dice_success", "ready_for_ghost_turn": False, "events": events}

        ready_for_ghost = self.check_ready_for_ghost_turn(room)
        if ready_for_ghost:
            combat.phase = "ghost"
        return {
            "summary": summary,
            "sfx": sfx,
            "ready_for_ghost_turn": ready_for_ghost,
            "events": events,
        }

    def apply_ghost_turn(self, room_code: str, decision: GhostTurnDecision) -> dict[str, Any]:
        room = self.get_or_create_room(room_code)
        combat = room.combat
        if not combat or not combat.active:
            raise ValueError("ไม่อยู่ในฉากต่อสู้")

        enc = self.repo.combat_encounter
        moves_by_id = {m["id"]: m for m in enc.get("moves", [])}
        move = moves_by_id.get(decision.move_id) or enc["moves"][0]

        conscious = [p for p in room.players.values() if p.is_conscious]
        if not conscious:
            combat.active = False
            room.combat = None
            room.ending_triggered = "lost_in_grove"
            return {"summary": "ทีมสืบสวนหมดสติทั้งหมดแล้ว", "events": [], "defeated": True}

        connected_conscious = [p for p in conscious if p.connected]
        pool = connected_conscious or conscious

        target = next(
            (p for p in pool if p.public_id == decision.target_player_id or p.name == decision.target_player_id),
            None,
        )
        if target is None:
            target = min(pool, key=lambda p: (p.hp, p.sanity))

        # Bodyguard taunt intercepts physical PDEF attacks
        if move.get("target_defense") == "PDEF":
            taunter = next((p for p in pool if p.guarded), None)
            if taunter:
                target = taunter

        # Clear previous round statuses now that ghost turn starts (newly inflicted statuses apply for next round)
        for p in room.players.values():
            p.statuses = []

        atk = int(enc.get("atk", 3))
        d20 = secrets.randbelow(20) + 1
        total = d20 + atk
        if move.get("target_defense") == "PDEF":
            stat_val = max(target.stats.get("BODY", 1), target.stats.get("RES", 1))
        else:
            stat_val = max(target.stats.get("SPI", 1), target.stats.get("RES", 1))
        defense = max(11, min(15, 10 + int(stat_val)))

        hit = total >= defense
        mitigated = 0
        if hit:
            raw_dmg = int(move.get("damage", 2))
            mitigated = max(0, raw_dmg - combat.party_shield - target.damage_reduction)
            if move.get("damage_resource") == "Sanity":
                target.sanity = max(0, target.sanity - mitigated)
                dmg_label = f"-{mitigated} สติ"
            else:
                target.hp = max(0, target.hp - mitigated)
                dmg_label = f"-{mitigated} HP"

            cond = move.get("condition")
            cond_label = ""
            if cond and target.is_conscious:
                target.statuses.append(cond)
                cond_label = " + ติดพันธนาการ!" if cond == "ROOTED" else " + ติดหวาดกลัว!"
            summary = (
                f"ผีเงาจมน้ำใช้ [{move['name_th']}] ใส่ {target.name} "
                f"(ทอย {total} vs {defense}) โดน {dmg_label}{cond_label}"
            )
        else:
            summary = (
                f"ผีเงาจมน้ำใช้ [{move['name_th']}] ใส่ {target.name} "
                f"(ทอย {total} vs {defense}) แต่หลบพ้นได้อย่างหวุดหวิด!"
            )

        combat.combat_log.append(summary)
        self.append_log(room, "ผีเงาจมน้ำ", summary, kind="ending")

        events: list[dict[str, Any]] = []
        move_entry = self.repo.get_dialogue(move.get("audio_id", ""))
        if move_entry:
            events.append(
                self._build_audio_payload(
                    dialogue_id=move_entry["id"],
                    speaker=move_entry["speaker"],
                    text=decision.narration_th.strip() or move_entry["text"],
                    mode="script",
                )
            )

        # Check defeat
        if all(not p.is_conscious for p in room.players.values()):
            combat.active = False
            room.combat = None
            room.ending_triggered = "lost_in_grove"
            defeat_entry = self.repo.get_dialogue("combat_defeat_bad")
            if defeat_entry:
                self.append_log(room, defeat_entry["speaker"], defeat_entry["text"], kind="ending")
                events.append(
                    self._build_audio_payload(
                        dialogue_id=defeat_entry["id"],
                        speaker=defeat_entry["speaker"],
                        text=defeat_entry["text"],
                        mode="script",
                    )
                )
            return {
                "summary": summary,
                "hit": hit,
                "events": events,
                "defeated": True,
                "use_live_taunt": False,
                "ghost_taunt": None,
            }

        # Advance to next round
        combat.round_number += 1
        combat.phase = "players"
        combat.ghost_exposed = False
        combat.party_shield = 0
        for p in room.players.values():
            p.acted_this_round = False
            p.guarded = False
            p.damage_reduction = 0
        combat.combat_log.append(f"รอบที่ {combat.round_number} — ตาของผู้สืบสวน")

        return {
            "summary": summary,
            "hit": hit,
            "events": events,
            "defeated": False,
            "use_live_taunt": bool(decision.use_live_taunt and decision.ghost_taunt),
            "ghost_taunt": (decision.ghost_taunt or "").strip()[:220] or None,
        }

    # ----------------- NARRATIVE & GUARDRAILS -----------------

    def validate_and_apply_decision(
        self,
        room: RoomState,
        decision: DMDecision,
        actor_name: str,
    ) -> dict[str, Any]:
        """Strictly enforce scene/spoiler guardrails on LLM output and advance room state."""
        room.last_activity_at = time.time()
        room.idle_prompted = False

        scene_before = room.current_scene
        scene_cfg = self.repo.get_scene(scene_before) or {}
        eligible_by_id = {d["id"]: d for d in self.get_eligible_dialogues(room)}
        was_ended = room.ending_triggered is not None

        # Special A3 hook: insisting on walking straight into the dark grove launches Drowned Echo combat!
        if scene_before == "A3" and not room.combat and not room.ending_triggered and (
            decision.selected_audio_id == "a3_ending_bad"
            or decision.state_updates.ending_triggered == "lost_in_grove"
        ):
            combat_events = self.start_combat(room.room_code, return_scene="A3")
            primary = combat_events[0] if combat_events else self._build_audio_payload(
                None, "DM", "เงาดำเปียกโชกผุดขึ้นขวางปากทางสวนกล้วย!", mode="script"
            )
            return {
                "primary_event": primary,
                "queued_events": combat_events[1:],
                "needs_live_tts": False,
                "live_tts_speaker": "DM",
                "live_tts_text": "",
            }

        primary_event: dict[str, Any]
        queued_events: list[dict[str, Any]] = []
        proposed_next_scene: Optional[str] = None
        needs_live_tts = False
        live_tts_speaker = "DM"
        live_tts_text = ""

        if decision.requested_check_id and room.pending_check is None:
            self.trigger_check(room, decision.requested_check_id, actor_name)

        if decision.mode == "script" and decision.selected_audio_id in eligible_by_id:
            entry = eligible_by_id[decision.selected_audio_id]
            proposed_next_scene = self._apply_dialogue_unlocks(room, entry)
            self.append_log(room, entry["speaker"], entry["text"], kind="dialogue")
            primary_event = self._build_audio_payload(
                dialogue_id=entry["id"],
                speaker=entry["speaker"],
                text=entry["text"],
                mode="script",
            )
            if entry["id"] == "a3_ending_true" and room.ending_triggered is None:
                room.ending_triggered = "act_a_complete"
        else:
            raw_improv = (decision.improvised_text or "").strip()[:450]
            if decision.mode == "script" and decision.selected_audio_id is None and raw_improv:
                speaker = (
                    decision.character
                    if decision.character in self.repo.voice_profiles
                    else ("ประเสริฐ" if room.current_scene in {"A1", "A3"} else "DM")
                )
                safe_text = raw_improv
            elif decision.mode == "script" and decision.selected_audio_id is None and room.pending_check is not None:
                speaker = "DM"
                safe_text = (
                    f"คุณเตรียม{room.pending_check['title']} — "
                    f"กดปุ่มทอยเต๋า {room.pending_check['stat']} (เป้าหมาย DC {room.pending_check['dc']}) เพื่อดูผลลัพธ์ได้เลย"
                )
            elif decision.mode == "script" and decision.selected_audio_id not in eligible_by_id:
                speaker = "ประเสริฐ" if room.current_scene in {"A1", "A3"} else "DM"
                safe_text = (
                    "เอ่อ... เรื่องนั้นผมยังบอกอะไรไม่ได้ครับ ตอนนี้ลองดูข้อมูลที่เรามีอยู่ตรงหน้าก่อนนะครับ"
                    if speaker == "ประเสริฐ"
                    else "ยังไม่พบเบาะแสเพิ่มเติมในจุดนั้น ลองสอบถามประเสริฐหรือสำรวจรอบ ๆ ต่อได้"
                )
            else:
                speaker = (
                    decision.character
                    if decision.character in self.repo.voice_profiles
                    else ("ประเสริฐ" if room.current_scene in {"A1", "A3"} else "DM")
                )
                safe_text = raw_improv or "อืม... ลองตรวจดูรายละเอียดรอบ ๆ อีกครั้งนะครับ"

            filler = self.repo.fillers_by_id.get(decision.filler_audio_id or "")
            if not filler:
                filler = self.repo.default_filler_for_speaker(speaker)

            filler_event = self._build_audio_payload(
                dialogue_id=filler["id"],
                speaker=filler["speaker"],
                text=filler["text"],
                is_filler=True,
                mode="improvise",
            )
            self.append_log(room, speaker, safe_text, kind="improvise")
            primary_event = filler_event
            needs_live_tts = True
            live_tts_speaker = speaker
            live_tts_text = safe_text

        updates = decision.state_updates
        for clue_id in updates.add_clues:
            if (
                clue_id in scene_cfg.get("allowed_clues", [])
                and clue_id in self.repo.clues_catalog
                and clue_id not in room.clues_found
            ):
                room.clues_found.append(clue_id)

        for item_id in updates.add_inventory:
            if (
                item_id in scene_cfg.get("allowed_items", [])
                and item_id in self.repo.items_catalog
                and item_id not in room.inventory
            ):
                room.inventory.append(item_id)

        if updates.npc_trust_delta:
            delta = max(-1, min(1, int(updates.npc_trust_delta)))
            cur = room.npc_trust.get("ประเสริฐ", 0)
            room.npc_trust["ประเสริฐ"] = max(-3, min(5, cur + delta))

        if updates.board_node and updates.board_node in self.repo.board_nodes_by_id:
            node = self.repo.board_nodes_by_id[updates.board_node]
            if self._is_board_node_unlocked(room, node) and node["scene"] == room.current_scene:
                room.board_node = updates.board_node

        target_next_scene = proposed_next_scene
        if not target_next_scene and updates.current_scene in scene_cfg.get("allowed_next_scenes", []):
            target_next_scene = updates.current_scene

        if (
            scene_before == "A3"
            and updates.ending_triggered == "act_a_complete"
            and room.ending_triggered is None
        ):
            room.ending_triggered = "act_a_complete"

        room.total_turn_count += 1
        if target_next_scene and target_next_scene != scene_before:
            queued_events.extend(self._advance_scene(room, target_next_scene))
        else:
            room.scene_turn_count += 1

        current_scene_cfg = self.repo.get_scene(room.current_scene) or {}
        stall_limit = int(current_scene_cfg.get("anti_stall_turn_limit", 6))
        anti_stall_id = current_scene_cfg.get("anti_stall_audio_id")
        if (
            not room.ending_triggered
            and room.pending_check is None
            and room.scene_turn_count >= stall_limit
            and anti_stall_id
            and anti_stall_id not in room.played_audio_ids
        ):
            stall_entry = self.repo.get_dialogue(anti_stall_id)
            if stall_entry:
                self._apply_dialogue_unlocks(room, stall_entry)
                self.append_log(room, stall_entry["speaker"], stall_entry["text"], kind="hint")
                queued_events.append(
                    self._build_audio_payload(
                        dialogue_id=stall_entry["id"],
                        speaker=stall_entry["speaker"],
                        text=stall_entry["text"],
                        mode="script",
                    )
                )

        if not was_ended and room.ending_triggered:
            ending_cfg = self.repo.get_ending(room.ending_triggered)
            if ending_cfg:
                end_audio_id = ending_cfg.get("audio_id")
                already_emitted = primary_event.get("dialogue_id") == end_audio_id or any(
                    ev.get("dialogue_id") == end_audio_id for ev in queued_events
                )
                if end_audio_id and not already_emitted:
                    end_entry = self.repo.get_dialogue(end_audio_id)
                    if end_entry:
                        self._apply_dialogue_unlocks(room, end_entry)
                        self.append_log(room, end_entry["speaker"], end_entry["text"], kind="ending")
                        queued_events.append(
                            self._build_audio_payload(
                                dialogue_id=end_entry["id"],
                                speaker=end_entry["speaker"],
                                text=end_entry["text"],
                                mode="script",
                            )
                        )
                if room.ending_triggered == "act_a_complete":
                    room.board_node = "headman_house"

        return {
            "primary_event": primary_event,
            "queued_events": queued_events,
            "needs_live_tts": needs_live_tts,
            "live_tts_speaker": live_tts_speaker,
            "live_tts_text": live_tts_text,
        }

    def _is_board_node_unlocked(self, room: RoomState, node: dict[str, Any]) -> bool:
        if node.get("unlocked_by_default"):
            return True
        if node["id"] == "headman_house" and room.current_scene == "A3":
            return True
        reqs = node.get("requires_clues") or []
        return any(req in room.clues_found for req in reqs)

    def move_board_node(self, room_code: str, node_id: str, actor_name: str) -> dict[str, Any]:
        room = self.get_or_create_room(room_code)
        if room.combat and room.combat.active:
            raise ValueError("กำลังเผชิญหน้ากับผีเงาจมน้ำ! กรุณาสู้ ปลอบ หรือถอยทัพให้จบก่อน")

        node = self.repo.board_nodes_by_id.get(node_id)
        if not node:
            raise ValueError("ไม่พบจุดแผนที่ที่เลือก")
        if not self._is_board_node_unlocked(room, node):
            raise ValueError("ยังไม่มีข้อมูลตำแหน่งนี้ กรุณาสอบถามหรือตรวจแฟ้มก่อน")

        room.board_node = node_id
        room.last_activity_at = time.time()
        events: list[dict[str, Any]] = []

        if node_id == "banana_grove_edge":
            if room.current_scene == "A3" and not room.ending_triggered:
                events.extend(self.start_combat(room.room_code, return_scene="A3"))
            else:
                warn_text = (
                    f"{actor_name} ชี้ไปทางปากทางสวนกล้วยที่มืดทึบ — "
                    "ประเสริฐเตือนให้ดูแฟ้มข้อมูลก่อนเพื่อไม่ให้เดินหลงทาง"
                )
                self.append_log(room, "DM", warn_text, kind="narration")
                events.append(
                    self._build_audio_payload(
                        dialogue_id=None,
                        speaker="DM",
                        text=warn_text,
                        mode="script",
                    )
                )
        elif node_id == "headman_house" and not room.ending_triggered:
            if room.current_scene != "A3":
                events.extend(self._advance_scene(room, "A3"))
            room.ending_triggered = "act_a_complete"
            end_entry = self.repo.get_dialogue("a3_ending_true")
            if end_entry:
                self._apply_dialogue_unlocks(room, end_entry)
                self.append_log(room, end_entry["speaker"], end_entry["text"], kind="ending")
                events.append(
                    self._build_audio_payload(
                        dialogue_id=end_entry["id"],
                        speaker=end_entry["speaker"],
                        text=end_entry["text"],
                        mode="script",
                    )
                )
        elif node_id == "company_van" and room.current_scene == "A1":
            open_entry = self.repo.get_dialogue("a1_open_folder_to_a2")
            if open_entry and open_entry["id"] not in room.played_audio_ids:
                self._apply_dialogue_unlocks(room, open_entry)
                self.append_log(room, open_entry["speaker"], open_entry["text"], kind="narration")
                events.append(
                    self._build_audio_payload(
                        dialogue_id=open_entry["id"],
                        speaker=open_entry["speaker"],
                        text=open_entry["text"],
                        mode="script",
                    )
                )
                events.extend(self._advance_scene(room, "A2"))

        return {"board_node": room.board_node, "events": events}

    def serialize_public_state(self, room: RoomState) -> dict[str, Any]:
        """Return strictly spoiler-free room snapshot for clients (never leaks other players' tokens)."""
        self._expire_stale_mic_lock(room)
        scene_cfg = self.repo.get_scene(room.current_scene) or {}
        board_nodes = [
            {
                "id": n["id"],
                "name": n["name"],
                "subtitle": n["subtitle"],
                "scene": n["scene"],
                "x": n["x"],
                "y": n["y"],
                "unlocked": self._is_board_node_unlocked(room, n),
            }
            for n in self.repo.board_nodes
        ]
        clues = [
            {
                "id": cid,
                "label": self.repo.clues_catalog[cid]["label"],
                "detail": self.repo.clues_catalog[cid]["detail"],
            }
            for cid in room.clues_found
            if cid in self.repo.clues_catalog
        ]
        items = [
            {
                "id": iid,
                "label": self.repo.items_catalog[iid]["label"],
                "detail": self.repo.items_catalog[iid]["detail"],
            }
            for iid in room.inventory
            if iid in self.repo.items_catalog
        ]
        ending_obj = self.repo.get_ending(room.ending_triggered) if room.ending_triggered else None

        combat_dict = None
        if room.combat and room.combat.active:
            c = room.combat
            combat_dict = {
                "active": c.active,
                "round_number": c.round_number,
                "phase": c.phase,
                "enemy_id": c.enemy_id,
                "enemy_name": c.enemy_name,
                "enemy_sprite": c.enemy_sprite,
                "background_image": c.background_image,
                "enemy_hp": c.enemy_hp,
                "enemy_max_hp": c.enemy_max_hp,
                "soothe_progress": c.soothe_progress,
                "soothe_goal": c.soothe_goal,
                "retreat_progress": c.retreat_progress,
                "retreat_goal": c.retreat_goal,
                "ghost_exposed": c.ghost_exposed,
                "party_shield": c.party_shield,
                "combat_log": c.combat_log[-10:],
            }

        return {
            "room_code": room.room_code,
            "started": room.started,
            "case_title": self.repo.case_title,
            "current_scene": room.current_scene,
            "scene_title": scene_cfg.get("title", room.current_scene),
            "scene_subtitle": scene_cfg.get("subtitle", ""),
            "background_image": scene_cfg.get("background_image", "/assets/scenes/a1_sala.png"),
            "npcs": scene_cfg.get("npcs", []),
            "quick_prompts": scene_cfg.get("quick_prompts", []),
            "board_node": room.board_node,
            "board_nodes": board_nodes,
            "scene_turn_count": room.scene_turn_count,
            "anti_stall_turn_limit": int(scene_cfg.get("anti_stall_turn_limit", 6)),
            "total_turn_count": room.total_turn_count,
            "inventory": items,
            "clues_found": clues,
            "npc_trust": dict(room.npc_trust),
            "pending_check": room.pending_check,
            "resolved_checks": room.resolved_checks,
            "ending": ending_obj,
            "taken_roles": [p.role_id for p in room.players.values()],
            "live_tts_used": room.live_tts_used,
            "live_tts_limit": room.live_tts_limit,
            "combat": combat_dict,
            "players": [
                {
                    "id": p.public_id,
                    "sid": p.sid,
                    "connected": p.connected,
                    "name": p.name,
                    "role_id": p.role_id,
                    "role_name": p.role_name,
                    "avatar": p.avatar,
                    "stats": p.stats,
                    "skill": p.skill,
                    "hp": p.hp,
                    "max_hp": p.max_hp,
                    "sanity": p.sanity,
                    "max_sanity": p.max_sanity,
                    "focus": p.focus,
                    "max_focus": p.max_focus,
                    "statuses": list(p.statuses),
                    "guarded": p.guarded,
                    "acted_this_round": p.acted_this_round,
                }
                for p in room.players.values()
            ],
            "mic_locked": room.active_speaker_sid is not None,
            "active_speaker_sid": room.active_speaker_sid,
            "active_speaker_name": room.active_speaker_name,
            "turn_queue": {
                "busy": room.turn_busy or (room.active_speaker_sid is not None),
                "owner_id": room.turn_owner_id,
                "owner_name": room.turn_owner_name or room.active_speaker_name,
                "stage": room.turn_stage
                or (f"{room.active_speaker_name} กำลังพูด..." if room.active_speaker_name else ""),
                "items": [
                    {"player_id": q["player_id"], "player_name": q["player_name"]}
                    for q in room.input_queue
                ],
            },
        }
