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
MAX_LIVE_TTS_PER_ROOM = 100
DEFAULT_EMPTY_ROOM_TTL_SECONDS = 120.0


def _dialogue_act_from_id(did: str) -> Optional[str]:
    """Extract Act code ('A'..'F') from IDs like 'b_ending_to_act_c' or 'b3_wichai_stay_behind'."""
    if not did:
        return None
    if did.startswith("h1_"):
        return "E"
    if did.startswith("ending_"):
        return "F"
    act = did[0].upper()
    if act not in {"A", "B", "C", "D", "E", "F"}:
        return None
    if len(did) >= 2 and did[1] == "_":
        return act
    if len(did) >= 3 and did[1].isdigit() and did[2] == "_":
        return act
    return None


def audio_bucket_for_entry(entry: dict[str, Any]) -> str:
    """Map a dialogue entry to its audio_assets subfolder (act_a, act_b, combat, fillers, ...)."""
    if entry.get("is_filler"):
        return "fillers"
    scene = str(entry.get("scene") or "")
    if scene == "COMBAT":
        return "combat"
    if scene and scene[0].upper() in {"A", "B", "C", "D", "E", "F"}:
        return f"act_{scene[0].lower()}"
    act = _dialogue_act_from_id(str(entry.get("id") or ""))
    if act:
        return f"act_{act.lower()}"
    return "common"


def load_scenario_files(data_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """Load modular scenario data from data/{common,combat,act_*} or fall back to flat JSONs."""
    common_dir = data_dir / "common"
    if common_dir.is_dir():
        def _read(path: Path, default: Any = None) -> Any:
            if not path.exists():
                return {} if default is None else default
            return json.loads(path.read_text(encoding="utf-8"))

        case_meta = _read(common_dir / "case.json", {})
        voices_raw = _read(common_dir / "voices.json", {})
        roles_raw = _read(common_dir / "roles.json", {})
        fillers_raw = _read(common_dir / "fillers.json", {})
        combat_enc_raw = _read(data_dir / "combat" / "encounter.json", {})
        combat_dlg_raw = _read(data_dir / "combat" / "dialogues.json", {})

        dialogues: list[dict[str, Any]] = []
        clues_catalog: dict[str, dict[str, str]] = {}
        items_catalog: dict[str, dict[str, str]] = {}
        board_nodes: list[dict[str, Any]] = []
        scenes: dict[str, dict[str, Any]] = {}
        dice_checks: dict[str, dict[str, Any]] = {}
        endings: dict[str, dict[str, Any]] = {}

        act_dirs = sorted(
            (p for p in data_dir.iterdir() if p.is_dir() and p.name.startswith("act_")),
            key=lambda p: p.name,
        )
        for act_dir in act_dirs:
            act_lore = _read(act_dir / "lore.json", {})
            act_code = str(act_lore.get("act") or act_dir.name.replace("act_", "").upper())
            clues_catalog.update(act_lore.get("clues_catalog", {}))
            items_catalog.update(act_lore.get("items_catalog", {}))
            for node in act_lore.get("board_nodes", []):
                node_copy = dict(node)
                node_copy.setdefault("act", act_code)
                board_nodes.append(node_copy)
            scenes.update(act_lore.get("scenes", {}))
            dice_checks.update(act_lore.get("dice_checks", {}))
            endings.update(act_lore.get("endings", {}))

            act_dlgs = _read(act_dir / "dialogues.json", {})
            dialogues.extend(act_dlgs.get("dialogues", []))

        dialogues.extend(combat_dlg_raw.get("dialogues", []))
        dialogues.extend(fillers_raw.get("dialogues", []))

        dialogues_raw = {
            "voice_profiles": voices_raw.get("voice_profiles", {}),
            "dialogues": dialogues,
        }
        lore_raw = {
            "case_id": case_meta.get("case_id", "CASE001"),
            "case_title": case_meta.get("case_title", "CASE 001"),
            "roles": roles_raw.get("roles", []),
            "clues_catalog": clues_catalog,
            "items_catalog": items_catalog,
            "board_nodes": board_nodes,
            "scenes": scenes,
            "dice_checks": dice_checks,
            "combat_encounter": combat_enc_raw.get("combat_encounter", {}),
            "combat_encounters": combat_enc_raw.get("encounters", {}),
            "endings": endings,
        }
        return dialogues_raw, lore_raw

    dialogues_raw = json.loads((data_dir / "dialogues.json").read_text(encoding="utf-8"))
    lore_raw = json.loads((data_dir / "world_lore.json").read_text(encoding="utf-8"))
    return dialogues_raw, lore_raw


class ScenarioRepository:
    """Loads and serves data-driven dialogues, lore, voice profiles, checks, combat, and assets."""

    def __init__(self, data_dir: Path = DATA_DIR, audio_dir: Path = AUDIO_DIR) -> None:
        self.data_dir = data_dir
        self.audio_dir = audio_dir

        dialogues_raw, lore_raw = load_scenario_files(data_dir)

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
        raw_encounters = dict(lore_raw.get("combat_encounters") or {})
        if self.combat_encounter and self.combat_encounter.get("id") not in raw_encounters:
            raw_encounters[self.combat_encounter.get("id", "DROWNED_ECHO")] = self.combat_encounter
        self.combat_encounters: dict[str, dict[str, Any]] = raw_encounters
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

    def get_combat_encounter(self, encounter_id: Optional[str] = None) -> dict[str, Any]:
        if encounter_id and encounter_id in self.combat_encounters:
            return self.combat_encounters[encounter_id]
        return self.combat_encounter

    def get_voice_profile(self, speaker: str) -> dict[str, str]:
        return self.voice_profiles.get(
            speaker,
            self.voice_profiles.get("DM", {"voice": "Charon", "style": "เสียงทุ้มต่ำ สุขุม"}),
        )

    def _iter_audio_files(self) -> list[Path]:
        if not self.audio_dir.exists():
            return []
        files: list[Path] = []
        for path in self.audio_dir.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in {".mp3", ".wav"}:
                continue
            rel_parts = path.relative_to(self.audio_dir).parts
            if rel_parts and rel_parts[0] == "preview":
                continue
            files.append(path)
        # Sort so .mp3 takes priority over .wav if both exist
        files.sort(key=lambda p: (0 if p.suffix.lower() == ".mp3" else 1, str(p)))
        return files

    def resolve_audio_url(self, audio_id: str) -> Optional[str]:
        """Return static URL if pre-generated .mp3 or .wav exists anywhere under audio_assets/."""
        for ext in ("mp3", "wav"):
            direct = self.audio_dir / f"{audio_id}.{ext}"
            if direct.exists():
                return f"/audio_assets/{audio_id}.{ext}"
        entry = self.dialogues_by_id.get(audio_id)
        if entry:
            bucket = audio_bucket_for_entry(entry)
            for ext in ("mp3", "wav"):
                bucketed = self.audio_dir / bucket / f"{audio_id}.{ext}"
                if bucketed.exists():
                    return f"/audio_assets/{bucket}/{audio_id}.{ext}"
        for path in self._iter_audio_files():
            if path.stem == audio_id:
                rel = path.relative_to(self.audio_dir).as_posix()
                return f"/audio_assets/{rel}"
        return None

    def count_cached_audio(self) -> int:
        return len({p.stem for p in self._iter_audio_files()})

    def default_filler_for_speaker(self, speaker: str) -> Optional[dict[str, Any]]:
        preferred = {
            "DM": "filler_dm_think",
            "ประเสริฐ": "filler_prasert_hmm",
            "เสียงวิทยุ": "filler_radio_static",
            "ผีเงาจมน้ำ": "filler_ghost_choke",
            "วิชัย": "filler_wichai_calm",
            "ต้น": "filler_ton_nervous",
        }.get(speaker)
        if preferred and preferred in self.fillers_by_id:
            return self.fillers_by_id[preferred]
        # New Act C-F characters use silent subtitle thinking cue before Live TTS
        if speaker in {"ยายบุญมี", "ดล", "แม่แก้ว (นางตานี)"}:
            return None
        if "filler_dm_think" in self.fillers_by_id:
            return self.fillers_by_id["filler_dm_think"]
        return self.fillers[0] if self.fillers else None

    def get_fillers_for_act(self, act: str) -> list[dict[str, Any]]:
        allowed_map = {
            "A": {"DM", "ประเสริฐ", "เสียงวิทยุ", "ผีเงาจมน้ำ"},
            "B": {"DM", "วิชัย", "ต้น"},
            "C": {"DM", "ผีเงาจมน้ำ"},
            "D": {"DM"},
            "E": {"DM", "วิชัย"},
            "F": {"DM", "วิชัย", "ประเสริฐ"},
        }
        allowed_speakers = allowed_map.get(act, {"DM"})
        return [f for f in self.fillers if f.get("speaker") in allowed_speakers]


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
    assisted_bonus: int = 0
    protected_by: Optional[str] = None
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
    encounter_id: str = "DROWNED_ECHO"
    enemy_id: str = "DROWNED_ECHO"
    enemy_name: str = "ผีเงาจมน้ำ"
    enemy_sprite: str = "/assets/characters/drowned_echo.png"
    background_image: str = "/assets/scenes/a3_grove_entrance.png"
    enemy_hp: int = 8
    enemy_max_hp: int = 8
    soothe_progress: int = 0
    soothe_goal: int = 3
    retreat_progress: int = 0
    retreat_goal: int = 2
    ghost_exposed: bool = False
    party_shield: int = 0
    ritual_shield_up: bool = False
    ritual_step: int = 0
    ritual_max_steps: int = 0
    ritual_released: bool = False
    return_scene: str = "A3"
    telegraph: Optional[dict[str, Any]] = None
    environment_features: list[dict[str, str]] = field(default_factory=list)
    last_roll: Optional[dict[str, Any]] = None
    chronicle: list[dict[str, Any]] = field(default_factory=list)
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
    npc_trust: dict[str, int] = field(
        default_factory=lambda: {"ประเสริฐ": 0, "วิชัย": 0, "ต้น": 0}
    )
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
    case_flags: dict[str, Any] = field(
        default_factory=lambda: {
            "hostages_found": False,
            "hostages_safe": 0,
            "hostages_dead": 0,
            "wichai_status": "free",
            "wichai_death_cause": None,
            "kaew_d_result": "not_met",
            "kaew_trust": "neutral",
            "kaew_final": "hostile",
            "ritual_status": "active",
            "ritual_plan": "unknown",
            "flood_truth_disclosed": False,
        }
    )


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
    def act_for_scene(scene_id: str) -> str:
        ch = str(scene_id or "A1").strip().upper()[:1]
        return ch if ch in {"A", "B", "C", "D", "E", "F"} else "A"

    @staticmethod
    def default_speaker_for_scene(scene_id: str) -> str:
        if scene_id in {"A1", "A3", "F6"}:
            return "ประเสริฐ"
        if scene_id in {"B1", "E5"}:
            return "วิชัย"
        if scene_id == "B2":
            return "ต้น"
        if scene_id == "C5":
            return "ยายบุญมี"
        if scene_id in {"D3", "D4", "F1", "F5"}:
            return "แม่แก้ว (นางตานี)"
        if scene_id == "E3":
            return "ดล"
        return "DM"

    @staticmethod
    def _act_entry_point(act: str) -> tuple[str, str]:
        return {
            "A": ("A1", "sala"),
            "B": ("B1", "headman_living_room"),
            "C": ("C1", "don_living_room"),
            "D": ("D1", "banana_path_d1"),
            "E": ("E1", "stilt_house_yard"),
            "F": ("F1", "ritual_upstairs_final"),
        }.get(act, ("A1", "sala"))

    def apply_act_start_preset(self, room: RoomState, start_act: str) -> None:
        """Seed realistic prior-act clues and items when creating a room directly in Act C–F for playtesting."""
        norm = str(start_act or "A").strip().upper()
        preset_clues: list[str] = []
        preset_items: list[str] = []
        if norm in {"C", "D", "E", "F"}:
            preset_clues.extend(["missing_names", "don_house_location", "flood_photo_seen"])
            preset_items.extend(["village_map_copy", "floodgate_duty_log_copy"])
        if norm in {"D", "E", "F"}:
            preset_clues.extend(["don_notebook_found", "knows_wichai_saved", "boonmee_thread_warning"])
            preset_items.extend(["don_black_notebook", "boonmee_prayer_book"])
        if norm in {"E", "F"}:
            preset_clues.extend(["shrine_three_names", "kaew_coerced_truth", "cart_tracks_to_house"])
            preset_items.append("camera_strap_mud")
        if norm == "F":
            preset_clues.extend(
                [
                    "hostages_found",
                    "wichai_kidnapper_confirmed",
                    "ritual_bracelet_core",
                    "ritual_plan_prepared",
                    "wichai_debt_evidence",
                    "wichai_confronted",
                ]
            )
            preset_items.extend(["brass_bracelet_kaew", "ritual_grimoire", "wichai_debt_docs"])
            room.case_flags["hostages_found"] = True
            room.case_flags["hostages_safe"] = 3
            room.case_flags["wichai_status"] = "captured"
            room.case_flags["ritual_plan"] = "prepared"
            room.case_flags["kaew_d_result"] = "talked"
            room.case_flags["kaew_trust"] = "high"

        for cid in preset_clues:
            if cid in self.repo.clues_catalog and cid not in room.clues_found:
                room.clues_found.append(cid)
        for iid in preset_items:
            if iid in self.repo.items_catalog and iid not in room.inventory:
                room.inventory.append(iid)

    @staticmethod
    def normalize_room_code(room_code: str) -> str:
        cleaned = "".join(ch for ch in room_code.strip().upper() if ch.isalnum() or ch in "-_")
        return cleaned[:16] or "ROOM01"

    def get_or_create_room(self, room_code: str, start_act: str = "A") -> RoomState:
        code = self.normalize_room_code(room_code)
        if code not in self.rooms:
            raw_act = str(start_act or "A").strip().upper()
            norm_act = raw_act if raw_act in {"A", "B", "C", "D", "E", "F"} else "A"
            scene_id, node_id = self._act_entry_point(norm_act)
            new_room = RoomState(
                room_code=code,
                current_scene=scene_id,
                board_node=node_id,
            )
            if norm_act in {"C", "D", "E", "F"}:
                self.apply_act_start_preset(new_room, norm_act)
            self.rooms[code] = new_room
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
                    "act": self.act_for_scene(room.current_scene),
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
        start_act: str = "A",
    ) -> tuple[RoomState, PlayerInfo, bool]:
        """Join or reconnect to a room, enforcing unique investigator roles."""
        room = self.get_or_create_room(room_code, start_act=start_act)
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
        if min_trust is not None:
            speaker = entry.get("speaker")
            trust_npc = speaker if speaker in room.npc_trust else "ประเสริฐ"
            if room.npc_trust.get(trust_npc, 0) < min_trust:
                return False
        return True

    def get_eligible_dialogues(self, room: RoomState, include_endings: bool = True) -> list[dict[str, Any]]:
        eligible: list[dict[str, Any]] = []
        ending_audio_ids = {e.get("audio_id") for e in self.repo.endings.values()}
        current_act = self.act_for_scene(room.current_scene)
        for entry in self.repo.dialogues:
            did = entry["id"]
            if entry.get("is_filler"):
                continue
            entry_scene = entry.get("scene")
            if entry_scene == "*":
                if _dialogue_act_from_id(did) != current_act:
                    continue
            elif entry_scene != room.current_scene:
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
            if clue_id == "hostages_found":
                room.case_flags["hostages_found"] = True
                room.case_flags["hostages_safe"] = max(int(room.case_flags.get("hostages_safe", 0)), 3)
            elif clue_id == "ritual_plan_prepared":
                room.case_flags["ritual_plan"] = "prepared"
            elif clue_id == "wichai_confronted":
                if room.case_flags.get("wichai_status") == "free":
                    room.case_flags["wichai_status"] = "captured"
            elif clue_id == "ritual_stopped":
                room.case_flags["ritual_status"] = "stopped"
            elif clue_id == "kaew_reconciled":
                room.case_flags["kaew_final"] = "calm"
            elif clue_id == "flood_truth_disclosed":
                room.case_flags["flood_truth_disclosed"] = True
            elif clue_id == "kaew_coerced_truth":
                if room.case_flags.get("kaew_d_result") == "not_met":
                    room.case_flags["kaew_d_result"] = "talked"
                    room.case_flags["kaew_trust"] = "high"
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
        node_by_scene = {
            "A1": "sala",
            "A2": "company_van",
            "A3": "sala",
            "B1": "headman_living_room",
            "B2": "headman_porch",
            "B3": "headman_archive_wall",
            "C1": "don_living_room",
            "C2": "don_desk",
            "C3": "don_floor_echo",
            "C4": "don_floor_echo",
            "C5": "grove_boonmee_house",
            "D1": "banana_path_d1",
            "D2": "banana_shrine_d2",
            "D3": "kaew_shrine_d3",
            "D4": "kaew_shrine_d3",
            "D5": "cart_tracks_d5",
            "E1": "stilt_house_yard",
            "E2": "cellar_room",
            "E3": "cellar_room",
            "E4": "ritual_upstairs",
            "E5": "ritual_upstairs",
            "E6": "ritual_upstairs",
            "F1": "ritual_upstairs_final",
            "F5": "reconcile_spot_f5",
            "F6": "dawn_road_epilogue",
        }
        if next_scene in node_by_scene:
            room.board_node = node_by_scene[next_scene]

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

    def advance_to_act(self, room_code: str, target_act: str) -> tuple[RoomState, list[dict[str, Any]]]:
        """Transition an existing room cleanly to target_act ('B'..'F'), preserving party & clues/items."""
        norm_act = str(target_act or "B").strip().upper()
        if norm_act not in {"B", "C", "D", "E", "F"}:
            norm_act = "B"
        room = self.get_or_create_room(room_code, start_act=norm_act)
        room.started = True
        room.ending_triggered = None
        room.pending_check = None
        room.combat = None
        room.scene_turn_count = 0
        room.idle_prompted = False
        room.last_activity_at = time.time()
        setattr(room, "_usage_ending_logged", None)
        self.clear_turn_queue(room)
        if room.active_speaker_sid:
            self.release_mic(room.room_code, room.active_speaker_sid, force=True)

        entry_scene, entry_node = self._act_entry_point(norm_act)
        room.current_scene = entry_scene
        room.board_node = entry_node
        for npc_name in ("ประเสริฐ", "วิชัย", "ต้น", "ยายบุญมี", "แม่แก้ว"):
            room.npc_trust.setdefault(npc_name, 0)

        events: list[dict[str, Any]] = []
        scene_cfg = self.repo.get_scene(entry_scene) or {}
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
        return room, events

    def advance_to_act_b(self, room_code: str) -> tuple[RoomState, list[dict[str, Any]]]:
        """Transition an existing room into Act B (headman's house B1), preserving players & Act A progress."""
        return self.advance_to_act(room_code, "B")

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

    @staticmethod
    def _default_combat_features() -> list[dict[str, str]]:
        return [
            {
                "id": "mud_puddle",
                "label": "แอ่งโคลนเดือดพล่าน",
                "hint": "ล่อหรือสาดไฟฉายตัดจังหวะเงาที่ผุดขึ้นจากโคลน",
                "sample": "สาดไฟฉายแรงสูงลงกลางแอ่งโคลนแล้วพุ่งกระแทกให้มันชะงัก",
            },
            {
                "id": "flashlight_beam",
                "label": "ลำแสงไฟฉายภาคสนาม",
                "hint": "ส่องตัดความมืดช่วยเปิดช่องโหว่หรือดึงเพื่อนหลบ",
                "sample": "คว้าตัวเพื่อนที่กำลังจะโดนตะปบหลบเข้าแนวลำแสงไฟฉาย",
            },
            {
                "id": "banana_grove_trails",
                "label": "แนวต้นกล้วยรกทึบ",
                "hint": "ใช้ดงกล้วยกำบังแนวถอยหรือตั้งสติเรียกความทรงจำแม่แก้ว",
                "sample": "ตะโกนถามเสียงในวิทยุเรื่องคืนน้ำท่วมปี 2534 เพื่อเรียกสติมัน",
            },
        ]

    @staticmethod
    def _prepare_round_telegraph(room: RoomState) -> None:
        combat = room.combat
        if not combat:
            return
        conscious = [p for p in room.players.values() if p.is_conscious]
        pool = [p for p in conscious if p.connected] or conscious
        if not pool:
            combat.telegraph = None
            return

        if combat.retreat_progress >= 1:
            move_id = "UNDERFLOOR_HAND"
            move_name = "มือจากใต้พื้น"
            target = max(pool, key=lambda p: p.hp)
            hint = f"โคลนรอบเท้าของ {target.name} เริ่มขยับยวบยาบ คล้ายมีมือซีดกำลังจะผุดขึ้นมาคว้าข้อเท้า!"
            counter_tip = "ช่วยเพื่อนดึงขาหลุด / กางยันต์คุ้มภัย หรือตั้งแนวรับก่อนถอย"
        elif combat.soothe_progress >= 1 or min(p.sanity for p in pool) <= 6:
            move_id = "DROWNED_WHISPER"
            move_name = "เสียงเรียกจากคราบน้ำ"
            target = min(pool, key=lambda p: p.sanity)
            hint = f"ผีเงาจมน้ำหันหน้ามาทาง {target.name} เสียงหายใจสำลักน้ำดังก้องเตรียมบั่นทอนสติ!"
            counter_tip = "ใช้ 'กล่อมวิญญาณ' หรือ 'ช่วยเพื่อน / คุ้มกัน' เพื่อยืนขวางและเรียกสติ"
        else:
            move_id = "WET_CLAW"
            move_name = "เล็บเปียกน้ำ"
            target = min(pool, key=lambda p: p.hp)
            hint = f"ผีเงาจมน้ำย่อตัวกางกรงเล็บเปียกโคลน เล็งจะพุ่งตะปบใส่ {target.name}!"
            counter_tip = "สาดไฟฉายเปิดจุดอ่อน ใช้ 'ช่วยเพื่อน / คุ้มกัน' หรือ 'ตั้งแนวป้องกัน' รับแรงปะทะ"

        combat.telegraph = {
            "move_id": move_id,
            "move_name": move_name,
            "target_id": target.public_id,
            "target_name": target.name,
            "hint": hint,
            "counter_tip": counter_tip,
        }

    def start_combat(
        self,
        room_code: str,
        return_scene: Optional[str] = None,
        encounter_id: str = "DROWNED_ECHO",
    ) -> list[dict[str, Any]]:
        room = self.get_or_create_room(room_code)
        enc = self.repo.get_combat_encounter(encounter_id)
        enc_id = enc.get("id", encounter_id or "DROWNED_ECHO")
        party_count = max(2, len(room.players))
        max_hp = int(enc.get("base_hp_for_2", 8)) + max(0, party_count - 2) * int(
            enc.get("hp_per_extra_player", 3)
        )
        ritual_max = int(enc.get("ritual_max_steps", 0))
        has_shield = ritual_max > 0

        room.started = True
        room.pending_check = None
        if enc_id == "DROWNED_ECHO" and self.act_for_scene(room.current_scene) == "A":
            room.board_node = "banana_grove_edge"
        self.clear_turn_queue(room)
        if room.active_speaker_sid:
            self.release_mic(room.room_code, room.active_speaker_sid, force=True)

        features = (
            [
                {
                    "id": "ritual_threads",
                    "label": "ด้ายบังคับ 3 ชั้น & สายป้ายชื่อ",
                    "hint": "ใช้แอ็กชันคลายพิธี: 1) คุมแรงสะท้อน -> 2) แยกสายคำสั่ง -> 3) คลายปมเกราะ",
                    "sample": "คุมแรงสะท้อนของด้ายบนโต๊ะและเริ่มแยกสายคำสั่งตามตำรา",
                },
                {
                    "id": "kaew_memory",
                    "label": "ความทรงจำคืนน้ำท่วมปี 2534",
                    "hint": "กล่อมเรียกสติแม่แก้วด้วยเหตุการณ์คืนช่วยเด็กวิชัย",
                    "sample": "ตะโกนเตือนสติแม่แก้วว่าพวกเรามาเปิดเผยความจริงปี 2534",
                },
                {
                    "id": "ritual_table",
                    "label": "โต๊ะไม้และมุมกำบังในห้องพิธี",
                    "hint": "ช่วยเพื่อนคุ้มกันคนปลดกำไลระหว่างที่รากกล้วยฟาดขึ้นมา",
                    "sample": "ยืนขวางหน้ารากไม้เพื่อคุ้มกันเพื่อนที่กำลังคลายปมกำไล",
                },
            ]
            if enc_id in {"KAEW_FINAL_BOSS", "KAEW_SHIELDED_SHADOW"}
            else self._default_combat_features()
        )
        start_msg = (
            f"เริ่มการเผชิญหน้ากับ {enc.get('name', 'ศัตรู')}! "
            + (
                "เกราะพิธี 3 ชั้นกำลังปกป้องแม่แก้ว — ต้องคลายพิธี 3 ขั้นแล้วปลดกำไล!"
                if has_shield
                else "รอบที่ 1 — ตาของผู้สืบสวน"
            )
        )
        room.combat = CombatState(
            active=True,
            round_number=1,
            phase="players",
            encounter_id=enc_id,
            enemy_id=enc_id,
            enemy_name=enc.get("name", "ผีเงาจมน้ำ"),
            enemy_sprite=enc.get("sprite", "/assets/characters/drowned_echo.png"),
            background_image=enc.get("background_image", "/assets/scenes/a3_grove_entrance.png"),
            enemy_hp=max_hp,
            enemy_max_hp=max_hp,
            soothe_progress=0,
            soothe_goal=int(enc.get("soothe_goal", 3)),
            retreat_progress=0,
            retreat_goal=int(enc.get("retreat_goal", 2)),
            ritual_shield_up=has_shield,
            ritual_step=0,
            ritual_max_steps=ritual_max,
            ritual_released=False,
            return_scene=return_scene or room.current_scene,
            environment_features=features,
            chronicle=[{"round": 1, "actor": "ระบบ", "tier": "system", "text": start_msg}],
            combat_log=[start_msg],
        )

        for p in room.players.values():
            p.acted_this_round = False
            p.guarded = False
            p.damage_reduction = 0
            p.assisted_bonus = 0
            p.protected_by = None
            p.statuses = []

        self._prepare_round_telegraph(room)

        events: list[dict[str, Any]] = []
        intro_id = "combat_drowned_intro" if enc_id == "DROWNED_ECHO" else ("f1_intro_dm" if enc_id == "KAEW_FINAL_BOSS" else "d4_intro_dm")
        intro = self.repo.get_dialogue(intro_id)
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

    def perform_combat_action(
        self,
        room_code: str,
        sid: str,
        action_id: str,
        *,
        intent_text: str = "",
        stat_override: Optional[str] = None,
        tactical_bonus: int = 0,
        tactical_reason: Optional[str] = None,
        target_ally_id: Optional[str] = None,
        narration_by_tier: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
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
            raise ValueError("ติดสถานะหวาดกลัว! รอบนี้กล่อมหรือใช้ท่าประจำอาชีพไม่ได้ (ลองโจมตี ช่วยเพื่อน หรือดึงสติ)")
        if "ROOTED" in player.statuses and action_id == "retreat":
            raise ValueError("ติดสถานะพันธนาการ! ขาถูกจับไว้ ถอยทัพไม่ได้จนกว่าจะล้างสถานะหรือพ้นรอบนี้")

        enc = self.repo.get_combat_encounter(combat.encounter_id)
        pdef = int(enc.get("pdef", 12))
        mdef = int(enc.get("mdef", 13))
        ritual_dc = int(enc.get("ritual_dc", 12))
        if room.case_flags.get("ritual_plan") == "prepared":
            ritual_dc = max(10, ritual_dc - 2)
        exposed_bonus = 2 if combat.ghost_exposed else 0
        assist_bonus = int(player.assisted_bonus or 0)
        safe_tactical = max(0, min(2, int(tactical_bonus or 0)))
        clean_intent = intent_text.strip()[:240]

        room.last_activity_at = time.time()
        summary = ""
        narration = ""
        sfx = "combat_hit"
        visual_fx = "miss"
        tier_key = "full"
        roll_detail: Optional[dict[str, Any]] = None
        events: list[dict[str, Any]] = []

        valid_stats = {"BODY", "PER", "INT", "SOC", "SPI", "RES"}
        chosen_override = stat_override.upper() if stat_override and stat_override.upper() in valid_stats else None

        def _pick_narration(default_text: str) -> str:
            if narration_by_tier and narration_by_tier.get(tier_key):
                return narration_by_tier[tier_key].strip()
            return default_text

        if action_id == "strike":
            stat = chosen_override or ("BODY" if player.stats.get("BODY", 0) >= player.stats.get("SPI", 0) else "SPI")
            mod = int(player.stats.get(stat, 0))
            d20 = secrets.randbelow(20) + 1
            bonus_total = exposed_bonus + assist_bonus + safe_tactical
            total = d20 + mod + bonus_total
            player.assisted_bonus = 0

            if d20 == 20:
                dmg = 0 if combat.ritual_shield_up else (5 + (1 if combat.ghost_exposed else 0))
                combat.enemy_hp = max(0, combat.enemy_hp - dmg)
                combat.ghost_exposed = True
                tier_key = "full"
                tier_label = "คริติคอล! (NAT 20)"
                if combat.ritual_shield_up:
                    summary = f"{player.name} โจมตีคริติคอล ({total}) แต่เกราะด้ายดำ 3 ชั้นกันดาเมจไว้! (+2 เปิดจุดอ่อนทีม)"
                    narration = _pick_narration(
                        f"{player.name} ฟาดเข้ากลางวงอาคมเต็มแรงจนเกราะสั่นสะเทือน เปิดจุดอ่อนให้ทีม (+2 ทอย) แต่ต้องคลายเกราะ 3 ขั้นก่อนดาเมจจึงจะเข้า!"
                    )
                else:
                    summary = f"{player.name} โจมตีคริติคอลด้วย {stat} (D20:20+{mod}+{bonus_total}={total}) -{dmg} HP ผี + เปิดจุดอ่อน!"
                    narration = _pick_narration(
                        f"{player.name} ชิงจังหวะแม่นยำพุ่งโจมตีเต็มแรงจนร่างโคลนของผีเงาจมน้ำแตกกระเซ็น (-{dmg} HP และเปิดช่องโหว่ทั้งทีม)!"
                    )
                sfx = "dice_success"
                visual_fx = "ghost_hit"
            elif total >= pdef:
                dmg = 0 if combat.ritual_shield_up else (3 + (1 if combat.ghost_exposed else 0))
                combat.enemy_hp = max(0, combat.enemy_hp - dmg)
                tier_key = "full"
                tier_label = "ติดเกราะพิธี!" if combat.ritual_shield_up else "สำเร็จเต็ม"
                if combat.ritual_shield_up:
                    summary = f"{player.name} โจมตีโดน ({total} ≥ {pdef}) แต่เกราะด้ายดำ 3 ชั้นกันดาเมจไว้ทั้งหมด (ต้องทำพิธีคลายเกราะก่อน!)"
                    narration = _pick_narration(
                        f"การโจมตีของ {player.name} กระแทกโดนเกราะด้ายดำสามชั้นรอบตัวแม่แก้วจนประกายไฟแตกกระจาย แต่ยังทำอันตรายร่างเธอไม่ได้!"
                    )
                else:
                    summary = f"{player.name} โจมตีด้วย {stat} (D20:{d20}+{mod + bonus_total}={total} ≥ {pdef}) โดนเต็ม! -{dmg} HP ผี"
                    narration = _pick_narration(
                        f"{player.name} จู่โจมทะลุแนวเงาโคลนเข้ากลางลำตัวเต็มแรง (-{dmg} HP)!"
                    )
                sfx = "combat_hit"
                visual_fx = "ghost_hit"
            elif total >= pdef - 3 and d20 != 1:
                dmg = 0 if combat.ritual_shield_up else 1
                combat.enemy_hp = max(0, combat.enemy_hp - dmg)
                tier_key = "partial"
                tier_label = "ติดเกราะพิธี" if combat.ritual_shield_up else "เฉียด (Partial)"
                if combat.ritual_shield_up:
                    summary = f"{player.name} โจมตีติดเกราะพิธี 3 ชั้น ({total}/{pdef}) ทำ 0 HP"
                    narration = _pick_narration(
                        f"เกราะด้ายดำสามชั้นดีดแรงปะทะของ {player.name} ออกมา ต้องปลดเกราะ 3 ขั้นบนโต๊ะก่อน!"
                    )
                else:
                    summary = f"{player.name} โจมตีเฉี่ยว ({total}/{pdef}) ทำได้ {dmg} HP ผี"
                    narration = _pick_narration(
                        f"ศัตรูเอนตัวหลบได้หวุดหวิด แต่แรงปะทะยังเฉี่ยวโดนร่างไปได้ {dmg} HP"
                    )
                sfx = "combat_hit"
                visual_fx = "ghost_hit"
            elif d20 == 1:
                tier_key = "failure"
                tier_label = "พลาดหนัก (NAT 1)"
                if player.sanity > 1:
                    player.sanity -= 1
                summary = f"{player.name} พลาดหนัก (NAT 1)! เงาจมน้ำตวัดโคลนกระแทกกลับ (สติ -1)"
                narration = _pick_narration(
                    f"{player.name} เสียหลักกลางโคลนลื่น ปล่อยให้เสียงหัวเราะสำลักน้ำกระแทกใส่จนขวัญเสีย (สติ -1)"
                )
                sfx = "dice_fail"
                visual_fx = "miss"
            else:
                tier_key = "failure"
                tier_label = "พลาด (Failure)"
                summary = f"{player.name} โจมตีพลาด ({total}/{pdef}) เงาจมน้ำเลือนหลบไปได้"
                narration = _pick_narration(
                    f"จังหวะจู่โจมของ {player.name} แหวกผ่านได้เพียงเงาละอองน้ำที่สลายหลบไปในความมืด"
                )
                sfx = "dice_fail"
                visual_fx = "miss"

            roll_detail = {
                "actor": player.name,
                "action_id": "strike",
                "action_label": "โจมตี / ปะทะ",
                "stat": stat,
                "d20": d20,
                "modifier": mod,
                "bonus": bonus_total,
                "bonus_reason": tactical_reason or ("ได้เปรียบ/จุดอ่อน" if bonus_total else None),
                "total": total,
                "target_dc": pdef,
                "dc_label": "PDEF",
                "tier": tier_key,
                "tier_label": tier_label,
                "is_ghost": False,
            }

        elif action_id == "soothe":
            stat = chosen_override or ("SOC" if player.stats.get("SOC", 0) >= player.stats.get("SPI", 0) else "SPI")
            mod = int(player.stats.get(stat, 0))
            d20 = secrets.randbelow(20) + 1
            bonus_total = exposed_bonus + assist_bonus + safe_tactical
            total = d20 + mod + bonus_total
            player.assisted_bonus = 0

            if total >= mdef:
                gain = 2 if (d20 >= 18) else 1
                combat.soothe_progress = min(combat.soothe_goal, combat.soothe_progress + gain)
                tier_key = "full"
                tier_label = "ปลอบสงบ +" + str(gain)
                summary = f"{player.name} กล่อมวิญญาณ ({stat} D20:{d20}+{mod + bonus_total}={total} ≥ {mdef}) สงบลง +{gain} ({combat.soothe_progress}/{combat.soothe_goal})"
                narration = _pick_narration(
                    f"{player.name} เอ่ยคำปลอบโยนฝ่าเสียงน้ำไหล จนร่างเงาจมน้ำชะงักนิ่งและเปลือกโคลนสั่นคลอน (+{gain} กล่อมวิญญาณ)!"
                )
                sfx = "skill_cast"
                visual_fx = "ghost_soothe"
            elif total >= mdef - 3:
                combat.ghost_exposed = True
                tier_key = "partial"
                tier_label = "ชะงัก (เปิดจุดอ่อน +2)"
                summary = f"{player.name} เรียกสติเฉียดเป้า ({total}/{mdef}) ทำให้ผีชะงักและเปิดจุดอ่อนทั้งทีม (+2 ทอย)!"
                narration = _pick_narration(
                    f"เสียงเรียกของ {player.name} ทำให้ผีเงาจมน้ำหยุดชะงักไปชั่วครู่ เปิดช่องให้เพื่อนร่วมทีมจู่โจมหรือกล่อมต่อได้แม่นขึ้น (+2 ทอย)!"
                )
                sfx = "skill_cast"
                visual_fx = "ghost_soothe"
            else:
                tier_key = "failure"
                tier_label = "ไม่เป็นผล (Failure)"
                summary = f"{player.name} พยายามกล่อมวิญญาณ ({total}/{mdef}) แต่เสียงสำลักน้ำกลบเสียงของคุณ"
                narration = _pick_narration(
                    f"เสียงครวญสำลักน้ำดังกลบคำพูดของ {player.name} จนไม่อาจเข้าถึงความทรงจำของมันได้"
                )
                sfx = "dice_fail"
                visual_fx = "miss"

            roll_detail = {
                "actor": player.name,
                "action_id": "soothe",
                "action_label": "กล่อมวิญญาณ",
                "stat": stat,
                "d20": d20,
                "modifier": mod,
                "bonus": bonus_total,
                "bonus_reason": tactical_reason or ("ได้เปรียบ/จุดอ่อน" if bonus_total else None),
                "total": total,
                "target_dc": mdef,
                "dc_label": "MDEF",
                "tier": tier_key,
                "tier_label": tier_label,
                "is_ghost": False,
            }

        elif action_id == "assist":
            others = [p for p in room.players.values() if p.player_token != player.player_token and p.is_conscious]
            ally = next((p for p in others if target_ally_id and p.public_id == target_ally_id), None)
            if ally is None and combat.telegraph:
                tele_id = combat.telegraph.get("target_id")
                ally = next((p for p in others if p.public_id == tele_id), None)
            if ally is None and others:
                afflicted = [p for p in others if p.statuses]
                pool_pick = afflicted or others
                ally = min(pool_pick, key=lambda p: (p.hp, p.sanity))

            tier_key = "full"
            if ally is not None:
                cleared = list(ally.statuses)
                ally.statuses = []
                ally.damage_reduction += 2
                ally.assisted_bonus = max(ally.assisted_bonus, 2)
                ally.protected_by = player.name
                cleared_note = f" ล้างสถานะ {', '.join(cleared)} และ" if cleared else ""
                summary = f"{player.name} เข้าคุ้มกัน {ally.name} ({cleared_note}ลดดาเมจ 2 + ได้เปรียบ +2 ทอย)"
                narration = _pick_narration(
                    f"{player.name} พุ่งเข้าไปคว้าตัวและตั้งแนวขวางหน้าให้ {ally.name} ลดแรงปะทะรอบนี้ลง 2 หน่วย พร้อมเปิดช่องได้เปรียบ +2 ให้ลงมือต่อ!"
                )
            else:
                player.guarded = True
                player.damage_reduction += 2
                player.assisted_bonus = max(player.assisted_bonus, 2)
                summary = f"{player.name} ตั้งหลักคุ้มกันตัวเอง (ลดดาเมจ 2 + ได้เปรียบ +2 ทอยรอบหน้า)"
                narration = _pick_narration(
                    f"{player.name} ก้าวถอยคุมจังหวะแสงไฟฉาย ยืนปักหลักรับมือการจู่โจมรอบนี้ด้วยความเยือกเย็น"
                )
            sfx = "skill_cast"
            visual_fx = "party_buff"
            roll_detail = {
                "actor": player.name,
                "action_id": "assist",
                "action_label": "ช่วยเพื่อน / คุ้มกัน",
                "stat": "TEAM",
                "d20": None,
                "modifier": None,
                "bonus": 2,
                "bonus_reason": tactical_reason or "คุ้มกัน & ส่งต่อความได้เปรียบ",
                "total": None,
                "target_dc": None,
                "dc_label": "Auto",
                "tier": "full",
                "tier_label": "คุ้มกันสำเร็จ",
                "is_ghost": False,
            }

        elif action_id == "steady":
            old_san, old_foc = player.sanity, player.focus
            player.sanity = min(player.max_sanity, player.sanity + 2)
            player.focus = min(player.max_focus, player.focus + 1)
            player.statuses = []
            tier_key = "full"
            summary = (
                f"{player.name} ตั้งสติและสะบัดหลุดจากอาการหลอน "
                f"(สติ {old_san}→{player.sanity}, โฟกัส {old_foc}→{player.focus})"
            )
            narration = _pick_narration(
                f"{player.name} สูดลมหายใจลึก กดความหวาดกลัวในความมืดลงจนสติกลับมามั่นคง (สติ +2, โฟกัส +1)!"
            )
            sfx = "skill_cast"
            visual_fx = "party_buff"
            roll_detail = {
                "actor": player.name,
                "action_id": "steady",
                "action_label": "ดึงสติ",
                "stat": "RES",
                "d20": None,
                "modifier": int(player.stats.get("RES", 0)),
                "bonus": 0,
                "bonus_reason": "ฟื้นสติ & ล้างสถานะ",
                "total": None,
                "target_dc": None,
                "dc_label": "Auto",
                "tier": "full",
                "tier_label": "มั่นคงขึ้น",
                "is_ghost": False,
            }

        elif action_id == "role_skill":
            if player.focus < 1:
                raise ValueError("โฟกัสไม่เพียงพอ (ต้องใช้ 1 โฟกัส) — ลองใช้ 'ดึงสติ' เพื่อฟื้นโฟกัส")
            player.focus -= 1
            skill_id = (player.skill or {}).get("id", "")
            skill_name = (player.skill or {}).get("name", "ท่าประจำอาชีพ")
            sfx = "skill_cast"
            tier_key = "full"

            if skill_id == "weakness_analysis":
                combat.ghost_exposed = True
                combat.enemy_hp = max(0, combat.enemy_hp - 1)
                summary = f"{player.name} ใช้ [{skill_name}] เปิดจุดอ่อนผี (+2 ทอยทั้งทีม) และทำ 1 HP ผี!"
                visual_fx = "ghost_hit"
            elif skill_id == "soothe_spirit":
                combat.soothe_progress = min(combat.soothe_goal, combat.soothe_progress + 2)
                summary = f"{player.name} ใช้ [{skill_name}] ปลอบวิญญาณ +2 ({combat.soothe_progress}/{combat.soothe_goal})"
                visual_fx = "ghost_soothe"
            elif skill_id == "protective_talisman":
                combat.party_shield += 2
                for ally in room.players.values():
                    ally.statuses = []
                summary = f"{player.name} ใช้ [{skill_name}] กางเกราะทั้งทีม +2 และล้างสถานะผิดปกติทั้งหมด!"
                visual_fx = "party_buff"
            elif skill_id == "defensive_line":
                player.guarded = True
                player.damage_reduction += 2
                summary = f"{player.name} ใช้ [{skill_name}] ยืนขวางหน้าดึงเป้าผีและลดดาเมจ 2 หน่วย!"
                visual_fx = "party_buff"
            elif skill_id == "field_first_aid":
                conscious = [p for p in room.players.values() if p.is_conscious]
                target = min(conscious, key=lambda p: (p.hp, p.sanity)) if conscious else player
                target.hp = min(target.max_hp, target.hp + 3)
                target.sanity = min(target.max_sanity, target.sanity + 2)
                summary = f"{player.name} ใช้ [{skill_name}] รักษา {target.name} (+3 HP, +2 สติ)"
                visual_fx = "party_buff"
            else:  # spirit_scanner or fallback
                combat.ghost_exposed = True
                for ally in room.players.values():
                    if ally.player_token != player.player_token and ally.is_conscious:
                        ally.focus = min(ally.max_focus, ally.focus + 1)
                summary = f"{player.name} ใช้ [{skill_name}] เปิดจุดอ่อนผี (+2 ทอย) และคืน +1 โฟกัสให้เพื่อน!"
                visual_fx = "party_buff"

            narration = _pick_narration(summary)
            roll_detail = {
                "actor": player.name,
                "action_id": "role_skill",
                "action_label": skill_name,
                "stat": "SKILL",
                "d20": None,
                "modifier": None,
                "bonus": 0,
                "bonus_reason": "ใช้ 1 โฟกัส",
                "total": None,
                "target_dc": None,
                "dc_label": "1 Focus",
                "tier": "full",
                "tier_label": "ปล่อยท่าสำเร็จ",
                "is_ghost": False,
            }

        elif action_id == "retreat":
            stat = chosen_override or ("BODY" if player.stats.get("BODY", 0) >= player.stats.get("PER", 0) else "PER")
            mod = int(player.stats.get(stat, 0))
            d20 = secrets.randbelow(20) + 1
            bonus_total = assist_bonus + safe_tactical
            total = d20 + mod + bonus_total
            player.assisted_bonus = 0
            combat.retreat_progress = min(combat.retreat_goal, combat.retreat_progress + 1)
            if total >= 11:
                player.damage_reduction += 1
                tier_key = "full"
                tier_label = "เปิดทาง + ตั้งรับ (+1 เกราะ)"
                summary = f"{player.name} คุ้มกันเปิดทางถอย ({stat} {total} ≥ 11 · ได้ +1 เกราะ) ({combat.retreat_progress}/{combat.retreat_goal})"
                narration = _pick_narration(
                    f"{player.name} ฉายไฟหาแนวทางออกกลางดงกล้วยพร้อมคุมหลังให้เพื่อนอย่างรัดกุม (เปิดทางถอย {combat.retreat_progress}/{combat.retreat_goal})"
                )
                sfx = "skill_cast"
            else:
                tier_key = "partial"
                tier_label = "เปิดทางถอย"
                summary = f"{player.name} คุ้มกันเปิดทางถอย ({combat.retreat_progress}/{combat.retreat_goal})"
                narration = _pick_narration(
                    f"{player.name} แหวกกอกล้วยเปิดช่องทางหนีออกไปได้อีกก้าว (เปิดทางถอย {combat.retreat_progress}/{combat.retreat_goal})"
                )
                sfx = "skill_cast"
            visual_fx = "party_buff"
            roll_detail = {
                "actor": player.name,
                "action_id": "retreat",
                "action_label": "คุ้มกันถอยทัพ",
                "stat": stat,
                "d20": d20,
                "modifier": mod,
                "bonus": bonus_total,
                "bonus_reason": tactical_reason,
                "total": total,
                "target_dc": 11,
                "dc_label": "DC",
                "tier": tier_key,
                "tier_label": tier_label,
                "is_ghost": False,
            }
        elif action_id == "ritual":
            if combat.ritual_max_steps <= 0:
                raise ValueError("ฉากต่อสู้นี้ไม่มีเกราะพิธีให้คลาย")
            best_stat = max(
                ("INT", int(player.stats.get("INT", 0))),
                ("SPI", int(player.stats.get("SPI", 0))),
                ("SOC", int(player.stats.get("SOC", 0))),
                key=lambda kv: kv[1],
            )[0]
            stat = chosen_override or best_stat
            mod = int(player.stats.get(stat, 0))
            d20 = secrets.randbelow(20) + 1
            bonus_total = exposed_bonus + assist_bonus + safe_tactical
            total = d20 + mod + bonus_total
            player.assisted_bonus = 0

            step_titles = {
                1: "ขั้น 1/3: คุมแรงสะท้อน",
                2: "ขั้น 2/3: แยกสายคำสั่ง (F4 Phase 2!)",
                3: "ขั้น 3/3: คลายปมเกราะ",
            }
            if combat.ritual_step < combat.ritual_max_steps:
                if total >= ritual_dc:
                    combat.ritual_step += 1
                    step_name = step_titles.get(combat.ritual_step, f"ขั้น {combat.ritual_step}/3")
                    tier_key = "full"
                    tier_label = f"คลายพิธี ({combat.ritual_step}/{combat.ritual_max_steps})"
                    if combat.ritual_step == 2:
                        combat.soothe_progress = min(combat.soothe_goal, combat.soothe_progress + 1)
                        summary = (
                            f"{player.name} ทำ {step_name} สำเร็จ ({stat} {total} ≥ {ritual_dc})! "
                            "ภาพคืนน้ำท่วมปี 2534 ฉายย้อน—แม่แก้วช่วยเด็กวิชัยขึ้นจากน้ำ!"
                        )
                    elif combat.ritual_step >= combat.ritual_max_steps:
                        combat.ritual_shield_up = False
                        summary = (
                            f"{player.name} ทำ {step_name} สำเร็จ ({stat} {total} ≥ {ritual_dc})! "
                            "เกราะด้ายดำ 3 ชั้นสลายแล้ว — ลงมือ 'ปลดกำไลขั้นสุดท้าย' ได้เลย!"
                        )
                    else:
                        summary = f"{player.name} ทำ {step_name} สำเร็จ ({stat} {total} ≥ {ritual_dc})!"
                    narration = _pick_narration(summary)
                    sfx = "skill_cast"
                    visual_fx = "ghost_soothe"
                elif total >= ritual_dc - 3:
                    combat.ghost_exposed = True
                    tier_key = "partial"
                    tier_label = "ปมคลายบางส่วน (+2 ทอย)"
                    summary = f"{player.name} แตะวงด้ายเฉียดเป้า ({total}/{ritual_dc}) เปิดช่องให้เพื่อนทำพิธีต่อแม่นขึ้น (+2 ทอย)"
                    narration = _pick_narration(summary)
                    sfx = "skill_cast"
                    visual_fx = "party_buff"
                else:
                    tier_key = "failure"
                    tier_label = "แรงสะท้อนตีกลับ"
                    if player.sanity > 1:
                        player.sanity -= 1
                    summary = f"{player.name} คลายปมผิดจังหวะ ({total}/{ritual_dc}) แรงด้ายสะท้อนกลับ (สติ -1)"
                    narration = _pick_narration(summary)
                    sfx = "dice_fail"
                    visual_fx = "miss"
            else:
                # Shield is already DOWN -> Controlled Release Action!
                release_dc = max(8, ritual_dc - 2)
                if total >= release_dc or d20 >= 10:
                    combat.ritual_released = True
                    tier_key = "full"
                    tier_label = "ปลดกำไลสำเร็จ!"
                    summary = f"{player.name} ปลดกำไลทองเหลืองขั้นสุดท้ายสำเร็จ ({stat} {total} ≥ {release_dc})! เส้นด้ายดำทั้งหมดสลายลงแล้ว"
                    narration = _pick_narration(summary)
                    sfx = "dice_success"
                    visual_fx = "ghost_soothe"
                else:
                    tier_key = "partial"
                    tier_label = "กำไลยังไม่หลุด"
                    combat.ghost_exposed = True
                    summary = f"{player.name} ง้างกำไลยังไม่หลุด ({total}/{release_dc}) แต่สลักคลายลง (+2 ทอยรอบหน้า)"
                    narration = _pick_narration(summary)
                    sfx = "skill_cast"
                    visual_fx = "party_buff"

            roll_detail = {
                "actor": player.name,
                "action_id": "ritual",
                "action_label": "ปลดกำไลขั้นสุดท้าย" if not combat.ritual_shield_up else "คลายเกราะพิธี 3 ขั้น",
                "stat": stat,
                "d20": d20,
                "modifier": mod,
                "bonus": bonus_total,
                "bonus_reason": tactical_reason or ("รู้แผนตำรา E4" if room.case_flags.get("ritual_plan") == "prepared" else None),
                "total": total,
                "target_dc": ritual_dc,
                "dc_label": "DC",
                "tier": tier_key,
                "tier_label": tier_label,
                "is_ghost": False,
            }
        else:
            raise ValueError("ไม่รู้จักคำสั่งต่อสู้ที่เลือก")

        player.acted_this_round = True
        combat.last_roll = roll_detail
        chronicle_text = f"[{clean_intent}] → {summary}" if clean_intent else summary
        combat.chronicle.append(
            {"round": combat.round_number, "actor": player.name, "tier": tier_key, "text": narration or summary}
        )
        combat.chronicle = combat.chronicle[-16:]
        combat.combat_log.append(chronicle_text)
        self.append_log(room, "ต่อสู้", narration or summary, kind="check")

        # Check immediate combat resolution
        if combat.ritual_released or combat.enemy_hp <= 0 or combat.soothe_progress >= combat.soothe_goal:
            won_by_soothe = combat.soothe_progress >= combat.soothe_goal
            won_by_ritual = combat.ritual_released
            enc_id = combat.encounter_id
            ret_scene = combat.return_scene
            combat.active = False
            room.combat = None

            if enc_id == "KAEW_FINAL_BOSS":
                room.case_flags["ritual_status"] = "stopped"
                if "ritual_stopped" not in room.clues_found:
                    room.clues_found.append("ritual_stopped")
                if won_by_soothe:
                    room.case_flags["kaew_final"] = "calm"
                    if "kaew_reconciled" not in room.clues_found:
                        room.clues_found.append("kaew_reconciled")
                events.extend(self._advance_scene(room, "F5"))
                return {
                    "summary": summary,
                    "narration": narration,
                    "roll_detail": roll_detail,
                    "visual_fx": "ghost_soothe" if (won_by_ritual or won_by_soothe) else "ghost_hit",
                    "sfx": "dice_success",
                    "ready_for_ghost_turn": False,
                    "events": events,
                }

            if enc_id == "KAEW_SHIELDED_SHADOW":
                room.case_flags["kaew_d_result"] = "talked" if won_by_soothe else "won"
                if won_by_soothe:
                    room.case_flags["kaew_trust"] = "high"
                if "kaew_coerced_truth" not in room.clues_found:
                    room.clues_found.append("kaew_coerced_truth")
                events.extend(self._advance_scene(room, "D5"))
                return {
                    "summary": summary,
                    "narration": narration,
                    "roll_detail": roll_detail,
                    "visual_fx": "ghost_soothe" if won_by_soothe else "ghost_hit",
                    "sfx": "dice_success",
                    "ready_for_ghost_turn": False,
                    "events": events,
                }

            if self.act_for_scene(ret_scene) == "C":
                if "spirit_echo_vision" not in room.clues_found:
                    room.clues_found.append("spirit_echo_vision")
                events.extend(self._advance_scene(room, "C5"))
                return {
                    "summary": summary,
                    "narration": narration,
                    "roll_detail": roll_detail,
                    "visual_fx": "ghost_soothe" if won_by_soothe else "ghost_hit",
                    "sfx": "dice_success",
                    "ready_for_ghost_turn": False,
                    "events": events,
                }

            room.ending_triggered = "act_a_combat_clear"
            win_id = "combat_win_soothe" if won_by_soothe else "combat_win_disperse"
            win = self.repo.get_dialogue(win_id)
            if win:
                self._apply_dialogue_unlocks(room, win)
                self.append_log(room, win["speaker"], win["text"], kind="ending")
                events.append(self._build_audio_payload(win["id"], win["speaker"], win["text"]))
            return {
                "summary": summary,
                "narration": narration,
                "roll_detail": roll_detail,
                "visual_fx": "ghost_soothe" if won_by_soothe else "ghost_hit",
                "sfx": "dice_success",
                "ready_for_ghost_turn": False,
                "events": events,
            }

        if combat.retreat_progress >= combat.retreat_goal:
            enc_id = combat.encounter_id
            ret_scene = combat.return_scene
            combat.active = False
            room.combat = None

            if enc_id == "KAEW_FINAL_BOSS":
                room.ending_triggered = self.resolve_final_ending(room)
                return {
                    "summary": summary,
                    "narration": narration,
                    "roll_detail": roll_detail,
                    "visual_fx": "party_buff",
                    "sfx": "dice_fail",
                    "ready_for_ghost_turn": False,
                    "events": events,
                }
            if enc_id == "KAEW_SHIELDED_SHADOW":
                room.case_flags["kaew_d_result"] = "fled"
                events.extend(self._advance_scene(room, "D5"))
                return {
                    "summary": summary,
                    "narration": narration,
                    "roll_detail": roll_detail,
                    "visual_fx": "party_buff",
                    "sfx": "dice_success",
                    "ready_for_ghost_turn": False,
                    "events": events,
                }
            if self.act_for_scene(ret_scene) == "C":
                events.extend(self._advance_scene(room, "C5"))
                return {
                    "summary": summary,
                    "narration": narration,
                    "roll_detail": roll_detail,
                    "visual_fx": "party_buff",
                    "sfx": "dice_success",
                    "ready_for_ghost_turn": False,
                    "events": events,
                }

            room.current_scene = "A3"
            room.board_node = "sala"
            esc = self.repo.get_dialogue("combat_escape")
            if esc:
                self._apply_dialogue_unlocks(room, esc)
                self.append_log(room, esc["speaker"], esc["text"], kind="narration")
                events.append(self._build_audio_payload(esc["id"], esc["speaker"], esc["text"]))
            return {
                "summary": summary,
                "narration": narration,
                "roll_detail": roll_detail,
                "visual_fx": "party_buff",
                "sfx": "dice_success",
                "ready_for_ghost_turn": False,
                "events": events,
            }

        ready_for_ghost = self.check_ready_for_ghost_turn(room)
        if ready_for_ghost:
            combat.phase = "ghost"
        return {
            "summary": summary,
            "narration": narration,
            "roll_detail": roll_detail,
            "visual_fx": visual_fx,
            "sfx": sfx,
            "ready_for_ghost_turn": ready_for_ghost,
            "events": events,
        }

    def apply_ghost_turn(self, room_code: str, decision: GhostTurnDecision) -> dict[str, Any]:
        room = self.get_or_create_room(room_code)
        combat = room.combat
        if not combat or not combat.active:
            raise ValueError("ไม่อยู่ในฉากต่อสู้")

        enc = self.repo.get_combat_encounter(combat.encounter_id)
        moves_by_id = {m["id"]: m for m in enc.get("moves", [])}
        move = moves_by_id.get(decision.move_id) or enc["moves"][0]

        conscious = [p for p in room.players.values() if p.is_conscious]
        if not conscious:
            enc_id = combat.encounter_id
            combat.active = False
            room.combat = None
            room.ending_triggered = "ending_d_fallen" if enc_id == "KAEW_FINAL_BOSS" else "lost_in_grove"
            return {"summary": "ทีมสืบสวนหมดสติทั้งหมดแล้ว", "events": [], "defeated": True, "roll_detail": None, "visual_fx": "miss"}

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
        cover_note = f" (ได้ {target.protected_by} ช่วยรับแรงปะทะ)" if target.protected_by else ""
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
                f"{combat.enemy_name} ใช้ [{move['name_th']}] ใส่ {target.name} "
                f"(ทอย {total} vs {defense}) โดน {dmg_label}{cond_label}{cover_note}"
            )
        else:
            summary = (
                f"{combat.enemy_name} ใช้ [{move['name_th']}] ใส่ {target.name} "
                f"(ทอย {total} vs {defense}) แต่หลบพ้นได้อย่างหวุดหวิด!{cover_note}"
            )

        ghost_roll = {
            "actor": combat.enemy_name,
            "action_id": move["id"],
            "action_label": move["name_th"],
            "stat": "ATK",
            "d20": d20,
            "modifier": atk,
            "bonus": 0,
            "bonus_reason": None,
            "total": total,
            "target_dc": defense,
            "dc_label": move.get("target_defense", "DEF"),
            "tier": "failure" if hit else "full",
            "tier_label": f"ศัตรูโจมตีเข้าเป้า ({target.name})" if hit else f"{target.name} หลบพ้น!",
            "is_ghost": True,
        }
        combat.last_roll = ghost_roll
        combat.chronicle.append(
            {"round": combat.round_number, "actor": combat.enemy_name, "tier": "ghost", "text": summary}
        )
        combat.chronicle = combat.chronicle[-16:]
        combat.combat_log.append(summary)
        self.append_log(room, combat.enemy_name, summary, kind="ending")

        events: list[dict[str, Any]] = []
        move_audio_id = move.get("audio_id") or ""
        move_entry = self.repo.get_dialogue(move_audio_id) if move_audio_id else None
        if move_entry:
            events.append(
                self._build_audio_payload(
                    dialogue_id=move_entry["id"],
                    speaker=move_entry["speaker"],
                    text=decision.narration_th.strip() or move_entry["text"],
                    mode="script",
                )
            )
        elif decision.narration_th.strip():
            events.append(
                self._build_audio_payload(
                    dialogue_id=None,
                    speaker=combat.enemy_name,
                    text=decision.narration_th.strip(),
                    mode="script",
                )
            )

        # Check defeat
        if all(not p.is_conscious for p in room.players.values()):
            enc_id = combat.encounter_id
            combat.active = False
            room.combat = None
            room.ending_triggered = "ending_d_fallen" if enc_id == "KAEW_FINAL_BOSS" else "lost_in_grove"
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
                "roll_detail": ghost_roll,
                "visual_fx": "ghost_lunge",
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
            p.protected_by = None
        self._prepare_round_telegraph(room)
        combat.combat_log.append(f"รอบที่ {combat.round_number} — ตาของผู้สืบสวน")

        return {
            "summary": summary,
            "hit": hit,
            "roll_detail": ghost_roll,
            "visual_fx": "ghost_lunge",
            "events": events,
            "defeated": False,
            "use_live_taunt": bool(decision.use_live_taunt and decision.ghost_taunt),
            "ghost_taunt": (decision.ghost_taunt or "").strip()[:220] or None,
        }

    # ----------------- NARRATIVE & GUARDRAILS -----------------

    def _build_wichai_farewell_event(self, room: RoomState) -> Optional[dict[str, Any]]:
        """Emit Wichai's parting line before transitioning out of Act B, if not yet played."""
        farewell_id = "b3_wichai_stay_behind"
        if farewell_id in room.played_audio_ids:
            return None
        entry = self.repo.get_dialogue(farewell_id)
        if not entry:
            return None
        self._apply_dialogue_unlocks(room, entry)
        self.append_log(room, entry["speaker"], entry["text"], kind="dialogue")
        return self._build_audio_payload(
            dialogue_id=entry["id"],
            speaker=entry["speaker"],
            text=entry["text"],
            mode="script",
        )

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
        act_before = self.act_for_scene(scene_before)
        default_speaker = self.default_speaker_for_scene(scene_before)
        allowed_speakers_by_scene = {
            "A1": {"DM", "ประเสริฐ"},
            "A2": {"DM", "ประเสริฐ", "เสียงวิทยุ"},
            "A3": {"DM", "ประเสริฐ"},
            "B1": {"DM", "วิชัย", "ต้น"},
            "B2": {"DM", "ต้น"},
            "B3": {"DM"},
            "C1": {"DM"},
            "C2": {"DM"},
            "C3": {"DM"},
            "C4": {"DM", "ผีเงาจมน้ำ"},
            "C5": {"DM", "ยายบุญมี"},
            "D1": {"DM"},
            "D2": {"DM"},
            "D3": {"DM", "แม่แก้ว (นางตานี)"},
            "D4": {"DM", "แม่แก้ว (นางตานี)"},
            "D5": {"DM"},
            "E1": {"DM"},
            "E2": {"DM", "ดล"},
            "E3": {"DM", "ดล"},
            "E4": {"DM"},
            "E5": {"DM", "วิชัย"},
            "E6": {"DM", "วิชัย"},
            "F1": {"DM", "แม่แก้ว (นางตานี)"},
            "F5": {"DM", "แม่แก้ว (นางตานี)", "วิชัย"},
            "F6": {"DM", "ประเสริฐ"},
        }
        allowed_speakers = allowed_speakers_by_scene.get(scene_before, {"DM", default_speaker})

        def _safe_speaker(proposed: Optional[str]) -> str:
            if proposed and proposed in self.repo.voice_profiles and proposed in allowed_speakers:
                return proposed
            return default_speaker

        def _looks_like_third_person_narration(text: str, speaker_name: str) -> bool:
            stripped = text.strip()
            if not stripped or speaker_name == "DM":
                return False
            self_prefixes: dict[str, tuple[str, ...]] = {
                "ประเสริฐ": ("ผู้ใหญ่ประเสริฐ", "ผู้ใหญ่บ้าน", "ประเสริฐ"),
                "วิชัย": ("ผู้ช่วยวิชัย", "คุณวิชัย", "พี่วิชัย", "วิชัย"),
                "ต้น": ("เด็กหนุ่ม", "อาสาสมัคร", "ต้น"),
                "ยายบุญมี": ("ยายบุญมี", "ยายมี"),
                "แม่แก้ว (นางตานี)": ("แม่แก้ว", "นางตานี", "หญิงชุดเขียว"),
                "ดล": ("นายดล", "ดล"),
            }
            if any(stripped.startswith(prefix) for prefix in self_prefixes.get(speaker_name, ())):
                return True
            dm_prefixes = (
                "คุณเห็น",
                "คุณสังเกต",
                "คุณมอง",
                "คุณรู้สึก",
                "คุณเตรียม",
                "สายตาของคุณ",
                "รอบตัวคุณ",
                "บรรยากาศรอบ",
                "ความเงียบ",
            )
            return any(stripped.startswith(prefix) for prefix in dm_prefixes)

        scene_cfg = self.repo.get_scene(scene_before) or {}
        eligible_by_id = {d["id"]: d for d in self.get_eligible_dialogues(room)}
        was_ended = room.ending_triggered is not None

        # Special A3 / F1 hooks: launch encounter when player initiates fight or ritual confrontation!
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

        if (
            scene_before == "F1"
            and not room.combat
            and not room.ending_triggered
            and "ritual_stopped" not in room.clues_found
            and decision.selected_audio_id not in {"f1_intro_dm", "f1_kaew_forced"}
            and decision.state_updates.current_scene not in {"F5", "F6"}
        ):
            combat_events = self.start_combat(
                room.room_code,
                return_scene="F1",
                encounter_id="KAEW_FINAL_BOSS",
            )
            primary = combat_events[0] if combat_events else self._build_audio_payload(
                None, "DM", "วงด้ายดำสามชั้นแผ่คลุมห้องพิธี เกราะแม่แก้วทำงานแล้ว!", mode="script"
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
            if entry["id"] == "b_ending_to_act_c":
                farewell_ev = self._build_wichai_farewell_event(room)
                self.append_log(room, entry["speaker"], entry["text"], kind="dialogue")
                ending_ev = self._build_audio_payload(
                    dialogue_id=entry["id"],
                    speaker=entry["speaker"],
                    text=entry["text"],
                    mode="script",
                )
                if farewell_ev is not None:
                    primary_event = farewell_ev
                    queued_events.append(ending_ev)
                else:
                    primary_event = ending_ev
                if room.ending_triggered is None:
                    room.ending_triggered = "act_b_complete"
            else:
                self.append_log(room, entry["speaker"], entry["text"], kind="dialogue")
                primary_event = self._build_audio_payload(
                    dialogue_id=entry["id"],
                    speaker=entry["speaker"],
                    text=entry["text"],
                    mode="script",
                )
                if entry["id"] == "a3_ending_true" and room.ending_triggered is None:
                    room.ending_triggered = "act_a_complete"
                elif entry["id"] == "c_ending_to_act_d" and room.ending_triggered is None:
                    room.ending_triggered = "act_c_complete"
                elif entry["id"] == "d_ending_to_act_e" and room.ending_triggered is None:
                    room.ending_triggered = "act_d_complete"
                elif entry["id"] == "e_ending_to_act_f" and room.ending_triggered is None:
                    room.ending_triggered = "act_e_complete"
                elif entry["id"] == "ending_a_epilogue" and room.ending_triggered is None:
                    room.ending_triggered = self.resolve_final_ending(room)
        else:
            raw_improv = (decision.improvised_text or "").strip()[:450]
            if decision.mode == "script" and decision.selected_audio_id is None and raw_improv:
                speaker = _safe_speaker(decision.character)
                safe_text = raw_improv
            elif decision.mode == "script" and decision.selected_audio_id is None and room.pending_check is not None:
                speaker = "DM"
                safe_text = (
                    f"คุณเตรียม{room.pending_check['title']} — "
                    f"กดปุ่มทอยเต๋า {room.pending_check['stat']} (เป้าหมาย DC {room.pending_check['dc']}) เพื่อดูผลลัพธ์ได้เลย"
                )
            elif decision.mode == "script" and decision.selected_audio_id not in eligible_by_id:
                speaker = default_speaker
                if speaker == "ประเสริฐ":
                    safe_text = "เอ่อ... เรื่องนั้นผมยังบอกอะไรไม่ได้ครับ ตอนนี้ลองดูข้อมูลที่เรามีอยู่ตรงหน้าก่อนนะครับ"
                elif speaker == "วิชัย":
                    safe_text = "เรื่องนั้นผมยังตอบชัด ๆ ไม่ได้ครับ ตอนนี้ลองดูแฟ้มกับแผนที่ตรงหน้าก่อนนะครับ"
                elif speaker == "ต้น":
                    safe_text = "เอ่อ... เรื่องนั้นผมไม่รู้จริง ๆ ครับพี่ เอาเท่าที่ผมเห็นก่อนนะ"
                elif speaker == "ยายบุญมี":
                    safe_text = "เรื่องนั้นยายก็ไม่กล้าพูดมั่วหรอกลูก ลองดูสมุดสวดมนต์กับเรื่องคืนน้ำท่วมก่อนดีกว่า"
                elif speaker == "แม่แก้ว (นางตานี)":
                    safe_text = "เสียงลมจากต้นกล้วยสั่นระริก — ข้าพูดมากไปกว่านี้ไม่ได้... เส้นด้ายดำยังรั้งคออยู่"
                elif speaker == "ดล":
                    safe_text = "ผมจำได้เท่าที่เห็นตอนถูกขังครับพี่ รีบขึ้นไปเช็กกำไลกับหลักฐานข้างบนเถอะ!"
                elif act_before == "B":
                    safe_text = "ยังไม่พบเบาะแสเพิ่มเติมในจุดนั้น ลองตรวจดูแฟ้ม ภาพเก่า หรือเปิดแผนที่เลือกจุดหมายต่อได้"
                elif act_before in {"C", "D", "E", "F"}:
                    safe_text = "ยังไม่พบเบาะแสเพิ่มเติมในจุดนั้น ลองเลือกคำถามหรือเปิดแผนที่ย้ายไปยังจุดอื่นต่อได้"
                else:
                    safe_text = "ยังไม่พบเบาะแสเพิ่มเติมในจุดนั้น ลองสอบถามประเสริฐหรือสำรวจรอบ ๆ ต่อได้"
            else:
                speaker = _safe_speaker(decision.character)
                safe_text = raw_improv or "อืม... ลองตรวจดูรายละเอียดรอบ ๆ อีกครั้งนะครับ"

            if _looks_like_third_person_narration(safe_text, speaker):
                speaker = "DM"

            filler = self.repo.fillers_by_id.get(decision.filler_audio_id or "")
            if not filler or filler.get("speaker") != speaker or filler.get("speaker") not in allowed_speakers:
                filler = self.repo.default_filler_for_speaker(speaker)

            if filler:
                filler_event = self._build_audio_payload(
                    dialogue_id=filler["id"],
                    speaker=filler["speaker"],
                    text=filler["text"],
                    is_filler=True,
                    mode="improvise",
                )
            else:
                filler_event = self._build_audio_payload(
                    dialogue_id=None,
                    speaker=speaker,
                    text="อืม...",
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
            allowed_trust_by_act = {
                "A": {"ประเสริฐ"},
                "B": {"วิชัย", "ต้น"},
                "C": {"ยายบุญมี"},
                "D": {"แม่แก้ว (นางตานี)"},
                "E": {"ดล", "วิชัย"},
                "F": {"แม่แก้ว (นางตานี)", "ประเสริฐ", "วิชัย"},
            }
            allowed_trust_npcs = allowed_trust_by_act.get(act_before, {"ประเสริฐ"})
            target_npc = updates.npc_trust_target if updates.npc_trust_target in allowed_trust_npcs else None
            if target_npc is None:
                if act_before == "A":
                    target_npc = "ประเสริฐ"
                elif scene_before == "B1":
                    target_npc = "วิชัย"
                elif scene_before == "B2":
                    target_npc = "ต้น"
                elif default_speaker in allowed_trust_npcs:
                    target_npc = default_speaker
            if target_npc:
                cur = room.npc_trust.get(target_npc, 0)
                room.npc_trust[target_npc] = max(-3, min(5, cur + delta))

        if updates.board_node and updates.board_node in self.repo.board_nodes_by_id:
            node = self.repo.board_nodes_by_id[updates.board_node]
            if (
                node.get("act", "A") == act_before
                and self._is_board_node_unlocked(room, node)
                and node["scene"] == room.current_scene
            ):
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
        elif (
            act_before == "B"
            and updates.ending_triggered == "act_b_complete"
            and "don_house_location" in room.clues_found
            and room.ending_triggered is None
        ):
            room.ending_triggered = "act_b_complete"
        elif (
            act_before == "C"
            and updates.ending_triggered == "act_c_complete"
            and room.ending_triggered is None
        ):
            room.ending_triggered = "act_c_complete"
        elif (
            act_before == "D"
            and updates.ending_triggered == "act_d_complete"
            and "cart_tracks_to_house" in room.clues_found
            and room.ending_triggered is None
        ):
            room.ending_triggered = "act_d_complete"
        elif (
            act_before == "E"
            and updates.ending_triggered == "act_e_complete"
            and "ritual_bracelet_core" in room.clues_found
            and room.ending_triggered is None
        ):
            room.ending_triggered = "act_e_complete"
        elif (
            act_before == "F"
            and updates.ending_triggered in {
                "ending_a",
                "ending_b",
                "ending_b_vigilante",
                "ending_c",
                "ending_c_bloodstained",
                "ending_d",
                "ending_d_fallen",
            }
            and room.ending_triggered is None
        ):
            room.ending_triggered = self.resolve_final_ending(room)

        room.total_turn_count += 1
        if target_next_scene and target_next_scene != scene_before and not room.ending_triggered:
            queued_events.extend(self._advance_scene(room, target_next_scene))
            if target_next_scene == "D4" and "kaew_coerced_truth" not in room.clues_found and not room.combat:
                queued_events.extend(
                    self.start_combat(
                        room.room_code,
                        return_scene="D4",
                        encounter_id="KAEW_SHIELDED_SHADOW",
                    )
                )
        else:
            room.scene_turn_count += 1

        if not was_ended and room.ending_triggered:
            ending_cfg = self.repo.get_ending(room.ending_triggered)
            if ending_cfg:
                end_audio_id = ending_cfg.get("audio_id")
                already_emitted = primary_event.get("dialogue_id") == end_audio_id or any(
                    ev.get("dialogue_id") == end_audio_id for ev in queued_events
                )
                if end_audio_id and not already_emitted:
                    if room.ending_triggered == "act_b_complete":
                        farewell_ev = self._build_wichai_farewell_event(room)
                        if farewell_ev is not None:
                            queued_events.append(farewell_ev)
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
                elif room.ending_triggered == "act_b_complete":
                    room.board_node = "road_to_don_house"
                elif room.ending_triggered == "act_c_complete":
                    room.board_node = "c_to_act_d_gate"
                elif room.ending_triggered == "act_d_complete":
                    room.board_node = "d_to_act_e_house"
                elif room.ending_triggered == "act_e_complete":
                    room.board_node = "e_to_act_f_ritual"

        return {
            "primary_event": primary_event,
            "queued_events": queued_events,
            "needs_live_tts": needs_live_tts,
            "live_tts_speaker": live_tts_speaker,
            "live_tts_text": live_tts_text,
        }

    def resolve_final_ending(self, room: RoomState) -> str:
        """Deterministically resolve CASE 001 Final Ending A-D from v5.5 rules."""
        if "player_dead" in room.case_flags or any(not p.is_conscious for p in room.players.values()):
            return "ending_d_fallen"
        if "ritual_stopped" not in room.clues_found:
            return "ending_d"
        if "hostage_dead" in room.case_flags:
            return "ending_c_bloodstained"
        if "wichai_executed_by_kaew" in room.case_flags:
            return "ending_b_vigilante"
        has_evidence = (
            "wichai_debt_evidence" in room.clues_found
            and "wichai_debt_docs" in room.inventory
            and "wichai_escaped" not in room.case_flags
        )
        if not has_evidence or "hostages_found" not in room.clues_found:
            return "ending_c"
        if "kaew_reconciled" in room.clues_found and "flood_truth_disclosed" in room.clues_found:
            return "ending_a"
        return "ending_b"

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
        current_act = self.act_for_scene(room.current_scene)
        if node.get("act", "A") != current_act:
            raise ValueError("สถานที่นี้อยู่คนละช่วงเนื้อเรื่องกับฉากปัจจุบัน")
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
            room.board_node = "headman_house"
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
        elif node_id == "headman_living_room":
            if room.current_scene != "B1":
                events.extend(self._advance_scene(room, "B1"))
        elif node_id == "headman_porch":
            if room.current_scene != "B2":
                events.extend(self._advance_scene(room, "B2"))
        elif node_id == "headman_archive_wall":
            if room.current_scene != "B3":
                events.extend(self._advance_scene(room, "B3"))
        elif node_id == "road_to_don_house" and not room.ending_triggered:
            room.ending_triggered = "act_b_complete"
            room.board_node = "road_to_don_house"
            farewell_ev = self._build_wichai_farewell_event(room)
            if farewell_ev is not None:
                events.append(farewell_ev)
            end_entry = self.repo.get_dialogue("b_ending_to_act_c")
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
        elif node_id == "don_living_room":
            if room.current_scene != "C1":
                events.extend(self._advance_scene(room, "C1"))
        elif node_id == "don_desk":
            if room.current_scene != "C2":
                events.extend(self._advance_scene(room, "C2"))
        elif node_id == "don_floor_echo":
            if room.current_scene != "C3":
                events.extend(self._advance_scene(room, "C3"))
        elif node_id == "grove_boonmee_house":
            if room.current_scene != "C5":
                events.extend(self._advance_scene(room, "C5"))
        elif node_id == "c_to_act_d_gate" and not room.ending_triggered:
            room.ending_triggered = "act_c_complete"
            room.board_node = "c_to_act_d_gate"
            end_entry = self.repo.get_dialogue("c_ending_to_act_d")
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
        elif node_id == "banana_path_d1":
            if room.current_scene != "D1":
                events.extend(self._advance_scene(room, "D1"))
        elif node_id == "banana_shrine_d2":
            if room.current_scene != "D2":
                events.extend(self._advance_scene(room, "D2"))
        elif node_id == "kaew_shrine_d3":
            if room.current_scene != "D3":
                events.extend(self._advance_scene(room, "D3"))
        elif node_id == "cart_tracks_d5":
            if room.current_scene != "D5":
                events.extend(self._advance_scene(room, "D5"))
        elif node_id == "d_to_act_e_house" and not room.ending_triggered:
            room.ending_triggered = "act_d_complete"
            room.board_node = "d_to_act_e_house"
            end_entry = self.repo.get_dialogue("d_ending_to_act_e")
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
        elif node_id == "stilt_house_yard":
            if room.current_scene != "E1":
                events.extend(self._advance_scene(room, "E1"))
        elif node_id == "cellar_room":
            if room.current_scene != "E2":
                events.extend(self._advance_scene(room, "E2"))
        elif node_id == "ritual_upstairs":
            if room.current_scene != "E4":
                events.extend(self._advance_scene(room, "E4"))
        elif node_id == "e_to_act_f_ritual" and not room.ending_triggered:
            room.ending_triggered = "act_e_complete"
            room.board_node = "e_to_act_f_ritual"
            end_entry = self.repo.get_dialogue("e_ending_to_act_f")
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
        elif node_id == "ritual_upstairs_final":
            if room.current_scene != "F1":
                events.extend(self._advance_scene(room, "F1"))
        elif node_id == "reconcile_spot_f5":
            if room.current_scene != "F5":
                events.extend(self._advance_scene(room, "F5"))
        elif node_id == "dawn_road_epilogue":
            if room.current_scene != "F6":
                events.extend(self._advance_scene(room, "F6"))

        return {"board_node": room.board_node, "events": events}

    def serialize_public_state(self, room: RoomState) -> dict[str, Any]:
        """Return strictly spoiler-free room snapshot for clients (never leaks other players' tokens)."""
        self._expire_stale_mic_lock(room)
        current_act = self.act_for_scene(room.current_scene)
        scene_cfg = self.repo.get_scene(room.current_scene) or {}
        board_nodes = [
            {
                "id": n["id"],
                "act": n.get("act", "A"),
                "name": n["name"],
                "subtitle": n["subtitle"],
                "scene": n["scene"],
                "x": n["x"],
                "y": n["y"],
                "unlocked": self._is_board_node_unlocked(room, n),
            }
            for n in self.repo.board_nodes
            if n.get("act", "A") == current_act
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
                "encounter_id": c.encounter_id,
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
                "ritual_shield_up": c.ritual_shield_up,
                "ritual_step": c.ritual_step,
                "ritual_max_steps": c.ritual_max_steps,
                "ritual_released": c.ritual_released,
                "telegraph": c.telegraph,
                "environment_features": c.environment_features,
                "last_roll": c.last_roll,
                "chronicle": c.chronicle[-10:],
                "combat_log": c.combat_log[-10:],
            }

        return {
            "room_code": room.room_code,
            "act": current_act,
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
            "case_flags": sorted(room.case_flags),
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
                    "assisted_bonus": p.assisted_bonus,
                    "protected_by": p.protected_by,
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
