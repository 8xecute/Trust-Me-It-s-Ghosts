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
            "act_objectives": case_meta.get("act_objectives", {}),
            "combine_recipes": case_meta.get("combine_recipes", []),
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
        self.act_objectives: dict[str, dict[str, Any]] = lore_raw.get("act_objectives", {})
        self.combine_recipes: list[dict[str, Any]] = lore_raw.get("combine_recipes", [])
        self.combine_recipes_by_id: dict[str, dict[str, Any]] = {
            r["id"]: r for r in self.combine_recipes if isinstance(r, dict) and r.get("id")
        }
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
    visited_scenes: list[str] = field(default_factory=list)
    inspected_objects: list[str] = field(default_factory=list)
    completed_combines: list[str] = field(default_factory=list)
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
                visited_scenes=[scene_id],
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

    def _meets_condition(
        self,
        room: RoomState,
        cond: Optional[dict[str, Any]],
        default_speaker: Optional[str] = None,
    ) -> bool:
        """Generic data-driven check for clues, items, case_flags, and NPC trust thresholds."""
        if not cond:
            return True
        req_clues = cond.get("clues") or cond.get("requires_clues") or []
        for clue_id in req_clues:
            if clue_id not in room.clues_found:
                return False
        req_items = cond.get("items") or cond.get("requires_items") or []
        for item_id in req_items:
            if item_id not in room.inventory:
                return False
        for flag_key, expected_val in (cond.get("flags") or {}).items():
            actual_val = room.case_flags.get(flag_key)
            if isinstance(expected_val, bool):
                if bool(actual_val) != expected_val:
                    return False
            elif actual_val != expected_val:
                return False
        min_trust = cond.get("min_trust")
        if isinstance(min_trust, dict):
            for npc_name, threshold in min_trust.items():
                if room.npc_trust.get(npc_name, 0) < int(threshold):
                    return False
        elif min_trust is not None:
            trust_npc = default_speaker if default_speaker in room.npc_trust else "ประเสริฐ"
            if room.npc_trust.get(trust_npc, 0) < int(min_trust):
                return False
        return True

    def _meets_trigger_condition(self, room: RoomState, entry: dict[str, Any]) -> bool:
        cond = entry.get("trigger_condition") or {}
        if cond.get("once") and entry["id"] in room.played_audio_ids:
            return False
        return self._meets_condition(room, cond, default_speaker=entry.get("speaker"))

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

    def check_eligibility(self, room: RoomState, check_id: str) -> dict[str, Any]:
        """Evaluate generic 3-pillar eligibility, bypass_if readiness, and gated retry rules."""
        scene = self.repo.get_scene(room.current_scene) or {}
        chk = self.repo.get_check(check_id)
        if not chk or check_id not in scene.get("available_checks", []):
            return {
                "check_id": check_id,
                "eligible": False,
                "bypassed": False,
                "bypass_reason_th": "",
                "blocked_reason": "wrong_scene",
                "missing_hint": "",
                "attempt": 1,
                "max_attempts": 2,
                "can_retry_hint": "",
            }

        retry_cfg = chk.get("retry") or {}
        on_failure = bool(retry_cfg.get("on_failure", True))
        requires_new = bool(retry_cfg.get("requires_new_clue_or_item", True))
        max_attempts = max(1, int(retry_cfg.get("max_attempts", 2)))

        prev = room.resolved_checks.get(check_id)
        attempt = 1
        if prev is not None:
            prev_tier = prev.get("tier")
            is_prev_failure = prev_tier == "failure" or (prev_tier is None and prev.get("success") is False)
            prev_attempt = max(1, int(prev.get("attempt", 1)))
            if not is_prev_failure or not on_failure:
                return {
                    "check_id": check_id,
                    "eligible": False,
                    "bypassed": False,
                    "bypass_reason_th": "",
                    "blocked_reason": "already_resolved",
                    "missing_hint": "",
                    "attempt": prev_attempt,
                    "max_attempts": max_attempts,
                    "can_retry_hint": "",
                }
            if prev_attempt >= max_attempts:
                return {
                    "check_id": check_id,
                    "eligible": False,
                    "bypassed": False,
                    "bypass_reason_th": "",
                    "blocked_reason": "max_attempts",
                    "missing_hint": "",
                    "attempt": prev_attempt,
                    "max_attempts": max_attempts,
                    "can_retry_hint": "ใช้โอกาสตรวจสอบจุดนี้ครบจำนวนสูงสุดแล้ว ลองหาวิธีหรือเบาะแสอื่นต่อแทน",
                }
            if requires_new:
                prev_clues = int(prev.get("clues_count", 0))
                prev_items = int(prev.get("items_count", 0))
                has_new_evidence = (len(room.clues_found) > prev_clues) or (len(room.inventory) > prev_items)
                if not has_new_evidence:
                    return {
                        "check_id": check_id,
                        "eligible": False,
                        "bypassed": False,
                        "bypass_reason_th": "",
                        "blocked_reason": "needs_new_evidence",
                        "missing_hint": "",
                        "attempt": prev_attempt,
                        "max_attempts": max_attempts,
                        "can_retry_hint": "ต้องพบเบาะแสหรือไอเท็มใหม่เพิ่มก่อน จึงจะกลับมาลองตรวจสอบจุดนี้ซ้ำได้",
                    }
            attempt = prev_attempt + 1

        req_cfg = chk.get("requires") or {}
        if req_cfg and not self._meets_condition(room, req_cfg):
            return {
                "check_id": check_id,
                "eligible": False,
                "bypassed": False,
                "bypass_reason_th": "",
                "blocked_reason": "missing_requires",
                "missing_hint": str(req_cfg.get("missing_hint") or "ยังขาดหลักฐานหรือเงื่อนไขสำคัญก่อนตรวจสอบจุดนี้"),
                "attempt": attempt,
                "max_attempts": max_attempts,
                "can_retry_hint": "",
            }

        bypass_cfg = chk.get("bypass_if") or {}
        has_bypass = bool(
            (bypass_cfg.get("clues") or [])
            or (bypass_cfg.get("items") or [])
            or (bypass_cfg.get("flags") or {})
        )
        bypassed = bool(has_bypass and self._meets_condition(room, bypass_cfg))
        bypass_reason_th = (
            str(bypass_cfg.get("reason_th") or "หลักฐานครบถ้วนแล้ว จึงยืนยันข้อเท็จจริงได้ทันทีโดยไม่ต้องเสี่ยงทอยเต๋า")
            if bypassed
            else ""
        )
        return {
            "check_id": check_id,
            "eligible": True,
            "bypassed": bypassed,
            "bypass_reason_th": bypass_reason_th,
            "blocked_reason": "",
            "missing_hint": "",
            "attempt": attempt,
            "max_attempts": max_attempts,
            "can_retry_hint": "",
        }

    def get_available_checks(self, room: RoomState) -> list[dict[str, Any]]:
        scene = self.repo.get_scene(room.current_scene) or {}
        checks: list[dict[str, Any]] = []
        for cid in scene.get("available_checks", []):
            elig = self.check_eligibility(room, cid)
            if not elig["eligible"]:
                continue
            chk = self.repo.get_check(cid)
            if chk:
                enriched = dict(chk)
                enriched["_eligibility"] = elig
                checks.append(enriched)
        return checks

    def get_blocked_checks(self, room: RoomState) -> list[dict[str, Any]]:
        """Return current scene checks blocked by unmet requires or gated retry."""
        scene = self.repo.get_scene(room.current_scene) or {}
        blocked: list[dict[str, Any]] = []
        for cid in scene.get("available_checks", []):
            elig = self.check_eligibility(room, cid)
            if elig["blocked_reason"] in {"missing_requires", "needs_new_evidence"}:
                chk = self.repo.get_check(cid) or {}
                blocked.append(
                    {
                        "id": cid,
                        "title": chk.get("title", cid),
                        "trigger_hint": chk.get("trigger_hint", ""),
                        "blocked_reason": elig["blocked_reason"],
                        "hint": elig["missing_hint"] or elig["can_retry_hint"],
                    }
                )
        return blocked

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

    def _grant_clue(self, room: RoomState, clue_id: str) -> bool:
        """Record clue_id if valid and synchronize derived case_flags."""
        if clue_id not in self.repo.clues_catalog:
            return False
        added = clue_id not in room.clues_found
        if added:
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
        return added

    def _grant_item(self, room: RoomState, item_id: str) -> bool:
        if item_id not in self.repo.items_catalog or item_id in room.inventory:
            return False
        room.inventory.append(item_id)
        return True

    def _apply_dialogue_unlocks(self, room: RoomState, entry: dict[str, Any]) -> Optional[str]:
        did = entry["id"]
        first_time = did not in room.played_audio_ids

        unlocks = entry.get("unlocks") or {}
        for clue_id in unlocks.get("clues", []):
            self._grant_clue(room, clue_id)
        for item_id in unlocks.get("items", []):
            self._grant_item(room, item_id)
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
        if next_scene not in room.visited_scenes:
            room.visited_scenes.append(next_scene)
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
        if room.current_scene not in room.visited_scenes:
            room.visited_scenes.append(room.current_scene)
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
        if entry_scene not in room.visited_scenes:
            room.visited_scenes.append(entry_scene)
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

    def _recompute_pending_bonuses(self, pending: dict[str, Any]) -> None:
        bonus_cap = max(0, int(pending.get("bonus_cap", 2)))
        focus_bonus = 2 if pending.get("focus_committed") else 0
        assist_bonus = int(pending.get("assist_bonus", 0)) if pending.get("assist_mode") == "bonus" else 0
        pending["assist_bonus"] = assist_bonus
        pending["effective_bonus"] = min(bonus_cap, focus_bonus + assist_bonus)

    def _build_alt_stat_options(self, chk: dict[str, Any]) -> list[dict[str, Any]]:
        raw_alt = chk.get("alt_stats") or {}
        if not raw_alt:
            return []
        base_stat = str(chk["stat"]).upper()
        base_dc = int(chk["dc"])
        base_cfg = raw_alt.get(base_stat) if isinstance(raw_alt.get(base_stat), dict) else {}
        options: list[dict[str, Any]] = [
            {
                "stat": base_stat,
                "dc": max(2, base_dc + int(base_cfg.get("dc_delta", 0))),
                "label": str(base_cfg.get("label") or chk.get("base_stat_label") or f"วิธีหลัก ({base_stat})"),
            }
        ]
        seen = {base_stat}
        for alt_stat, cfg in raw_alt.items():
            s_code = str(alt_stat or "").strip().upper()
            if not s_code or s_code in seen:
                continue
            seen.add(s_code)
            cfg_dict = cfg if isinstance(cfg, dict) else {}
            dc_delta = int(cfg_dict.get("dc_delta", 0))
            options.append(
                {
                    "stat": s_code,
                    "dc": max(2, base_dc + dc_delta),
                    "label": str(cfg_dict.get("label") or f"เปลี่ยนวิธี ({s_code})"),
                }
            )
        return options

    def _apply_check_tier_effects(
        self,
        room: RoomState,
        chk: dict[str, Any],
        tier: str,
        actor: Optional[PlayerInfo],
        recipient_scope: str,
    ) -> str:
        eff = (chk.get("tier_effects") or {}).get(tier) or {}
        for clue_id in eff.get("unlock_clues") or []:
            self._grant_clue(room, clue_id)
        for item_id in eff.get("unlock_items") or []:
            self._grant_item(room, item_id)
        for flag_k, flag_v in (eff.get("set_flags") or {}).items():
            room.case_flags[flag_k] = flag_v

        trust_cfg = eff.get("trust_delta")
        delta_notes: list[str] = []
        if isinstance(trust_cfg, dict):
            for npc, td in trust_cfg.items():
                delta_i = int(td)
                if delta_i != 0:
                    cur = room.npc_trust.get(npc, 0)
                    room.npc_trust[npc] = max(-3, min(5, cur + delta_i))
                    delta_notes.append(f"ความเชื่อใจ {npc} {'+' if delta_i > 0 else ''}{delta_i}")

        hp_delta = int(eff.get("hp_delta") or 0)
        sanity_delta = int(eff.get("sanity_delta") or 0)
        targets = (
            [actor]
            if recipient_scope == "actor" and actor is not None
            else list(room.players.values())
        )
        if hp_delta != 0:
            for p in targets:
                if hp_delta < 0 and p.hp > 0:
                    p.hp = max(1, p.hp + hp_delta)
                elif hp_delta > 0:
                    p.hp = min(p.max_hp, p.hp + hp_delta)
            delta_notes.append(f"HP {'+' if hp_delta > 0 else ''}{hp_delta}")
        if sanity_delta != 0:
            for p in targets:
                if sanity_delta < 0 and p.sanity > 0:
                    p.sanity = max(1, p.sanity + sanity_delta)
                elif sanity_delta > 0:
                    p.sanity = min(p.max_sanity, p.sanity + sanity_delta)
            delta_notes.append(f"สติ {'+' if sanity_delta > 0 else ''}{sanity_delta}")

        note_th = str(eff.get("note_th") or "").strip()
        consequence_th = note_th or (" | ".join(delta_notes) if delta_notes else "")
        if consequence_th and (hp_delta != 0 or sanity_delta != 0 or bool(delta_notes)):
            self.append_log(room, "ระบบ", consequence_th, kind="system")
        return consequence_th

    def resolve_bypassed_check(
        self,
        room: RoomState,
        check_id: str,
        actor_name: str,
        actor_sid: Optional[str] = None,
    ) -> dict[str, Any]:
        """Auto-resolve a check whose bypass_if condition is satisfied without rolling."""
        chk = self.repo.get_check(check_id)
        if not chk:
            raise ValueError("ไม่พบข้อมูลการ์ดทอยเต๋า")
        elig = self.check_eligibility(room, check_id)
        actor = self.get_player_by_sid(actor_sid) if actor_sid else next(
            (p for p in room.players.values() if p.name == actor_name), None
        )
        recipient_scope = str(chk.get("recipient_scope") or "party")
        reason_th = elig.get("bypass_reason_th") or "หลักฐานครบถ้วนแล้ว จึงผ่านจุดนี้ได้โดยไม่ต้องทอยเต๋า"

        outcome_audio_id = (chk.get("audio_ids") or {}).get("full")
        outcome_entry = self.repo.get_dialogue(outcome_audio_id) if outcome_audio_id else None
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

        consequence_th = self._apply_check_tier_effects(room, chk, "full", actor, recipient_scope) or reason_th
        if not outcome_entry:
            self.append_log(room, "DM", consequence_th, kind="check")
            audio_event = self._build_audio_payload(None, "DM", consequence_th, mode="script")

        dc = int(chk["dc"])
        attempt = int(elig.get("attempt", 1))
        max_attempts = int(elig.get("max_attempts", 2))
        room.resolved_checks[chk["id"]] = {
            "tier": "full",
            "tier_label": "ผ่านอัตโนมัติ (หลักฐานครบ)",
            "d20": 0,
            "d20_rolls": [],
            "modifier": 0,
            "bonus": 0,
            "bonus_reasons": [reason_th],
            "total": dc,
            "dc": dc,
            "stat": chk["stat"],
            "rolled_by": actor_name,
            "attempt": attempt,
            "clues_count": len(room.clues_found),
            "items_count": len(room.inventory),
            "bypassed": True,
            "consequence_th": consequence_th,
        }
        room.pending_check = None
        room.last_activity_at = time.time()

        return {
            "roll": {
                "check_id": chk["id"],
                "title": chk["title"],
                "stat": chk["stat"],
                "d20": 0,
                "d20_rolls": [],
                "modifier": 0,
                "bonus": 0,
                "bonus_reasons": [reason_th],
                "total": dc,
                "dc": dc,
                "tier": "full",
                "tier_label": "ผ่านอัตโนมัติ (หลักฐานครบ)",
                "rolled_by": actor_name,
                "bypassed": True,
                "consequence_th": consequence_th,
                "can_retry_hint": "",
                "attempt": attempt,
                "max_attempts": max_attempts,
                "recipient_scope": recipient_scope,
            },
            "audio_event": audio_event,
        }

    def trigger_check(
        self,
        room: RoomState,
        check_id: str,
        requested_by: str,
        requested_by_sid: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        elig = self.check_eligibility(room, check_id)
        if not elig["eligible"]:
            return None
        chk = self.repo.get_check(check_id)
        if not chk:
            return None

        if elig["bypassed"]:
            bypass_res = self.resolve_bypassed_check(
                room, check_id, requested_by, actor_sid=requested_by_sid
            )
            return {
                "id": chk["id"],
                "check_id": chk["id"],
                "bypassed": True,
                "roll": bypass_res["roll"],
                "audio_event": bypass_res["audio_event"],
            }

        actor = None
        if requested_by_sid:
            cand = self.get_player_by_sid(requested_by_sid)
            if cand and cand.player_token in room.players:
                actor = cand
        if actor is None:
            actor = next((p for p in room.players.values() if p.name == requested_by), None)

        base_stat = str(chk["stat"]).upper()
        base_dc = int(chk["dc"])
        pending = {
            "id": chk["id"],
            "check_id": chk["id"],
            "title": chk["title"],
            "stat": base_stat,
            "base_stat": base_stat,
            "dc": base_dc,
            "base_dc": base_dc,
            "partial_margin": int(chk.get("partial_margin", 3)),
            "requested_by": actor.name if actor else requested_by,
            "requested_by_sid": actor.sid if actor else None,
            "requested_by_public_id": actor.public_id if actor else None,
            "allow_focus": bool(chk.get("allow_focus", True)),
            "allow_assist": bool(chk.get("allow_assist", True)),
            "bonus_cap": int(chk.get("bonus_cap", 2)),
            "focus_committed": False,
            "assist_by_sid": None,
            "assist_by_name": None,
            "assist_mode": None,
            "assist_bonus": 0,
            "effective_bonus": 0,
            "alt_stats": self._build_alt_stat_options(chk),
            "attempt": int(elig["attempt"]),
            "max_attempts": int(elig["max_attempts"]),
            "recipient_scope": str(chk.get("recipient_scope") or "party"),
        }
        room.pending_check = pending
        return pending

    def prep_pending_check(
        self,
        room_code: str,
        sid: str,
        action: str,
        stat: Optional[str] = None,
        mode: Optional[str] = None,
        target_public_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Handle pre-roll check preparations: select_stat, toggle_focus, assist, handoff."""
        room = self.get_or_create_room(room_code)
        if not room.pending_check:
            raise ValueError("ขณะนี้ยังไม่มีการทอยเต๋าที่รอผลอยู่")
        player = self.get_player_by_sid(sid)
        if not player or player.player_token not in room.players:
            raise ValueError("ไม่พบผู้เล่นในห้อง")

        pending = room.pending_check
        lock_sid = pending.get("requested_by_sid")
        lock_connected = any(p.sid == lock_sid and p.connected for p in room.players.values()) if lock_sid else False
        is_roller = (sid == lock_sid) if lock_connected else True
        norm_action = str(action or "").strip().lower()
        room.last_activity_at = time.time()

        if norm_action == "select_stat":
            if not is_roller:
                raise ValueError("มีเพียงผู้ทอยที่รับผิดชอบจุดนี้เท่านั้นที่เลือกแนวทางทอยได้")
            req_stat = str(stat or "").strip().upper()
            options = pending.get("alt_stats") or []
            matched = next((opt for opt in options if opt.get("stat") == req_stat), None)
            if not matched and req_stat == pending.get("base_stat"):
                matched = {"stat": pending["base_stat"], "dc": pending["base_dc"], "label": req_stat}
            if not matched:
                raise ValueError("แนวทางทอยที่เลือกไม่ถูกต้องสำหรับจุดนี้")
            pending["stat"] = matched["stat"]
            pending["dc"] = int(matched["dc"])
            return {"pending_check": pending, "notice": f"{player.name} เลือกแนวทาง {pending['stat']} (DC {pending['dc']})"}

        if norm_action == "toggle_focus":
            if not is_roller:
                raise ValueError("มีเพียงผู้ทอยหลักเท่านั้นที่ใช้โฟกัสเสริมการทอยนี้ได้")
            if not pending.get("allow_focus", True):
                raise ValueError("จุดตรวจสอบนี้ไม่สามารถทุ่มโฟกัสเสริมได้")
            if not pending.get("focus_committed"):
                if player.focus < 1:
                    raise ValueError("โฟกัสของคุณไม่พอสำหรับทุ่มเสริม (+2)")
                pending["focus_committed"] = True
                notice = f"{player.name} เตรียมทุ่ม 1 โฟกัส (+2)"
            else:
                pending["focus_committed"] = False
                notice = f"{player.name} ยกเลิกการทุ่มโฟกัส"
            self._recompute_pending_bonuses(pending)
            return {"pending_check": pending, "notice": notice}

        if norm_action == "assist":
            if lock_connected and sid == lock_sid:
                raise ValueError("ผู้ทอยหลักไม่สามารถกดช่วยตัวเองได้ ให้เพื่อนร่วมทีมช่วยแทน")
            if not pending.get("allow_assist", True):
                raise ValueError("จุดตรวจสอบนี้ต้องประเมินคนเดียว ไม่สามารถช่วยเพื่อนได้")
            if not player.is_conscious:
                raise ValueError("ตัวละครของคุณหมดสติ ไม่สามารถช่วยเพื่อนได้")
            existing_sid = pending.get("assist_by_sid")
            if existing_sid and existing_sid != sid:
                raise ValueError(f"{pending.get('assist_by_name') or 'เพื่อนร่วมทีม'} กำลังช่วยการทอยนี้อยู่แล้ว (ช่วยได้สูงสุด 1 คน)")
            req_mode = "bonus" if str(mode or "advantage").strip().lower() == "bonus" else "advantage"
            if existing_sid == sid and (mode is None or pending.get("assist_mode") == req_mode):
                pending["assist_by_sid"] = None
                pending["assist_by_name"] = None
                pending["assist_mode"] = None
                pending["assist_bonus"] = 0
                notice = f"{player.name} ยกเลิกการช่วยทอย"
            else:
                pending["assist_by_sid"] = sid
                pending["assist_by_name"] = player.name
                pending["assist_mode"] = req_mode
                pending["assist_bonus"] = 2 if req_mode == "bonus" else 0
                mode_label = "ได้เปรียบ 2d20" if req_mode == "advantage" else "ช่วยเสริม +2"
                notice = f"{player.name} เข้าช่วย {pending.get('requested_by', 'เพื่อน')} ({mode_label})"
            self._recompute_pending_bonuses(pending)
            return {"pending_check": pending, "notice": notice}

        if norm_action == "handoff":
            if not is_roller:
                raise ValueError("มีเพียงผู้ทอยปัจจุบันเท่านั้นที่ส่งต่อสิทธิ์การทอยให้เพื่อนได้")
            target = next(
                (p for p in room.players.values() if p.connected and p.public_id == target_public_id),
                None,
            )
            if not target:
                raise ValueError("ไม่พบเพื่อนร่วมทีมที่ต้องการส่งต่อสิทธิ์ทอย")
            pending["requested_by"] = target.name
            pending["requested_by_sid"] = target.sid
            pending["requested_by_public_id"] = target.public_id
            pending["focus_committed"] = False
            if pending.get("assist_by_sid") == target.sid:
                pending["assist_by_sid"] = None
                pending["assist_by_name"] = None
                pending["assist_mode"] = None
                pending["assist_bonus"] = 0
            self._recompute_pending_bonuses(pending)
            return {"pending_check": pending, "notice": f"{player.name} ส่งต่อหน้าที่ทอยเต๋าให้ {target.name}"}

        raise ValueError("คำสั่งเตรียมทอยเต๋าไม่ถูกต้อง")

    def resolve_dice_roll(self, room_code: str, sid: str) -> dict[str, Any]:
        room = self.get_or_create_room(room_code)
        if not room.pending_check:
            raise ValueError("ขณะนี้ยังไม่มีการทอยเต๋าที่รอผลอยู่")

        chk_meta = room.pending_check
        chk = self.repo.get_check(chk_meta["id"])
        if not chk:
            room.pending_check = None
            raise ValueError("ไม่พบข้อมูลการ์ดทอยเต๋า")

        expected_sid = chk_meta.get("requested_by_sid")
        expected_connected = any(p.sid == expected_sid and p.connected for p in room.players.values()) if expected_sid else False
        if expected_connected and sid != expected_sid:
            raise ValueError(
                f"จุดนี้กำหนดให้ {chk_meta.get('requested_by', 'ผู้เล่นที่ประกาศแอ็กชัน')} เป็นผู้ทอยเต๋า (หรือกดส่งต่อสิทธิ์ให้เพื่อน)"
            )

        player = self.get_player_by_sid(sid)
        roller_name = player.name if player else str(chk_meta.get("requested_by") or "ผู้สืบสวน")
        stat_name = str(chk_meta.get("stat") or chk["stat"]).upper()
        modifier = int(player.stats.get(stat_name, 0)) if player else 0
        dc = int(chk_meta.get("dc") or chk["dc"])
        partial_margin = int(chk_meta.get("partial_margin", chk.get("partial_margin", 3)))
        bonus_cap = max(0, int(chk_meta.get("bonus_cap", chk.get("bonus_cap", 2))))

        raw_bonus = 0
        bonus_reasons: list[str] = []
        if chk_meta.get("focus_committed") and (not expected_sid or sid == expected_sid) and player and player.focus >= 1:
            player.focus -= 1
            raw_bonus += 2
            bonus_reasons.append(f"{player.name} ทุ่ม 1 โฟกัส (+2)")

        assist_mode = chk_meta.get("assist_mode")
        assist_by_sid = chk_meta.get("assist_by_sid")
        assist_by_name = chk_meta.get("assist_by_name") or "เพื่อนร่วมทีม"
        if assist_by_sid and assist_by_sid != sid and assist_mode == "advantage":
            d1 = secrets.randbelow(20) + 1
            d2 = secrets.randbelow(20) + 1
            d20_rolls = [d1, d2]
            d20 = max(d1, d2)
            bonus_reasons.append(f"{assist_by_name} ช่วย (ได้เปรียบ 2d20: {d1}, {d2})")
        else:
            d20 = secrets.randbelow(20) + 1
            d20_rolls = [d20]
            if assist_by_sid and assist_by_sid != sid and assist_mode == "bonus":
                raw_bonus += int(chk_meta.get("assist_bonus", 2))
                bonus_reasons.append(f"{assist_by_name} ช่วยเสริม (+2)")

        bonus = min(bonus_cap, raw_bonus)
        total = d20 + modifier + bonus
        partial_min = dc - partial_margin

        if total >= dc:
            tier = "full"
            tier_label = "สำเร็จเต็ม (Full Success)"
        elif total >= partial_min:
            tier = "partial"
            tier_label = "สำเร็จบางส่วน (Partial Success)"
        else:
            tier = "failure"
            tier_label = "ล้มเหลว (Failure)"

        outcome_audio_id = (chk.get("audio_ids") or {}).get(tier)
        outcome_entry = self.repo.get_dialogue(outcome_audio_id) if outcome_audio_id else None
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

        recipient_scope = str(chk_meta.get("recipient_scope") or chk.get("recipient_scope") or "party")
        consequence_th = self._apply_check_tier_effects(room, chk, tier, player, recipient_scope)
        if not outcome_entry and consequence_th:
            self.append_log(room, "DM", consequence_th, kind="check")
            audio_event = self._build_audio_payload(None, "DM", consequence_th, mode="script")

        retry_cfg = chk.get("retry") or {}
        on_failure = bool(retry_cfg.get("on_failure", True))
        requires_new = bool(retry_cfg.get("requires_new_clue_or_item", True))
        attempt = int(chk_meta.get("attempt", 1))
        max_attempts = max(1, int(chk_meta.get("max_attempts", retry_cfg.get("max_attempts", 2))))
        can_retry_hint = ""
        if tier == "failure" and on_failure and attempt < max_attempts:
            can_retry_hint = (
                "สามารถค้นพบเบาะแสหรือไอเท็มใหม่เพิ่ม แล้วกลับมาลองตรวจสอบจุดนี้ซ้ำได้ (เหลือโอกาสอีกครั้ง)"
                if requires_new
                else "สามารถเปลี่ยนแนวทางแล้วกลับมาลองตรวจสอบจุดนี้อีกครั้งได้"
            )

        # Snapshot evidence count AFTER unlocks & tier_effects so check failure unlocks don't self-enable retries.
        room.resolved_checks[chk["id"]] = {
            "tier": tier,
            "tier_label": tier_label,
            "d20": d20,
            "d20_rolls": d20_rolls,
            "modifier": modifier,
            "bonus": bonus,
            "bonus_reasons": bonus_reasons,
            "total": total,
            "dc": dc,
            "stat": stat_name,
            "rolled_by": roller_name,
            "attempt": attempt,
            "clues_count": len(room.clues_found),
            "items_count": len(room.inventory),
            "bypassed": False,
            "consequence_th": consequence_th,
        }
        room.pending_check = None
        room.last_activity_at = time.time()

        return {
            "roll": {
                "check_id": chk["id"],
                "title": chk["title"],
                "stat": stat_name,
                "d20": d20,
                "d20_rolls": d20_rolls,
                "modifier": modifier,
                "bonus": bonus,
                "bonus_reasons": bonus_reasons,
                "total": total,
                "dc": dc,
                "tier": tier,
                "tier_label": tier_label,
                "rolled_by": roller_name,
                "bypassed": False,
                "consequence_th": consequence_th,
                "can_retry_hint": can_retry_hint,
                "attempt": attempt,
                "max_attempts": max_attempts,
                "recipient_scope": recipient_scope,
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
                "hint": "ใช้แนวต้นกล้วยกำบังตัวหรือส่งเสียงถามเพื่อทำให้เงาจมน้ำชะงัก",
                "sample": "ใช้แนวต้นกล้วยกำบัง แล้วตะโกนถามเสียงในวิทยุว่าใครยังติดอยู่ตรงนี้",
            },
        ]

    def _prepare_round_telegraph(self, room: RoomState) -> None:
        combat = room.combat
        if not combat:
            return
        conscious = [p for p in room.players.values() if p.is_conscious]
        pool = [p for p in conscious if p.connected] or conscious
        if not pool:
            combat.telegraph = None
            return

        enc = self.repo.get_combat_encounter(combat.encounter_id)
        moves = enc.get("moves", [])
        root_move = next((m for m in moves if m.get("condition") == "ROOTED"), None)
        shaken_move = next((m for m in moves if m.get("condition") == "SHAKEN"), None)
        default_move = moves[0] if moves else {
            "id": "WET_CLAW",
            "name_th": "เล็บเปียกน้ำ",
        }
        enc_id = combat.encounter_id

        if combat.retreat_progress >= 1 and root_move:
            move_id = root_move["id"]
            move_name = root_move["name_th"]
            target = max(pool, key=lambda p: p.hp)
            if enc_id in {"KAEW_FINAL_BOSS", "KAEW_SHIELDED_SHADOW"}:
                hint = f"เส้นด้ายดำจาก {combat.enemy_name} ขยับตึงเล็งคว้าข้อเท้าและตัดแนวตั้งรับของ {target.name}!"
            else:
                hint = f"โคลนรอบเท้าของ {target.name} เริ่มขยับยวบยาบ คล้ายมีมือซีดกำลังจะผุดขึ้นมาคว้าข้อเท้า!"
            counter_tip = "ช่วยเพื่อนดึงหลุด / กางยันต์คุ้มภัย หรือตั้งแนวรับก่อนถอย"
        elif (
            combat.soothe_progress >= 1
            or combat.ritual_step >= 1
            or min(p.sanity for p in pool) <= 6
        ) and shaken_move:
            move_id = shaken_move["id"]
            move_name = shaken_move["name_th"]
            target = min(pool, key=lambda p: p.sanity)
            if enc_id == "KAEW_FINAL_BOSS":
                hint = f"วงอาคมรอบ {combat.enemy_name} สั่นสะเทือน ส่งคลื่นคำสั่งกดทับสติของ {target.name}!"
            elif enc_id == "KAEW_SHIELDED_SHADOW":
                hint = f"แรงอาคมบีบให้ {combat.enemy_name} เปล่งเสียงสะท้อนกดทับสติของ {target.name}!"
            else:
                hint = f"{combat.enemy_name} หันหน้ามาทาง {target.name} เสียงหายใจสำลักน้ำดังก้องเตรียมบั่นทอนสติ!"
            counter_tip = "ใช้ 'กล่อมวิญญาณ' หรือ 'ช่วยเพื่อน / คุ้มกัน' เพื่อยืนขวางและเรียกสติ"
        else:
            move_id = default_move["id"]
            move_name = default_move["name_th"]
            target = min(pool, key=lambda p: p.hp)
            if enc_id == "KAEW_FINAL_BOSS":
                hint = f"เส้นด้ายรอบกำไลของ {combat.enemy_name} ตวัดพุ่งเล็งใส่ {target.name}!"
            elif enc_id == "KAEW_SHIELDED_SHADOW":
                hint = f"รากกล้วยและด้ายดำหน้าศาลพุ่งกระชากใส่ {target.name}!"
            else:
                hint = f"{combat.enemy_name} ย่อตัวกางกรงเล็บเปียกโคลน เล็งจะพุ่งตะปบใส่ {target.name}!"
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

        if enc_id == "KAEW_FINAL_BOSS":
            is_prepared = room.case_flags.get("ritual_plan") == "prepared"
            knows_2534 = "knows_wichai_saved" in room.clues_found
            features = [
                {
                    "id": "ritual_threads",
                    "label": "ปมด้าย 3 ชั้น & สายป้ายชื่อบนโต๊ะ",
                    "hint": (
                        "ใช้ลำดับคลายพิธีตามตำรา: 1) คุมแรงสะท้อน -> 2) แยกสายคำสั่ง -> 3) คลายปมเกราะ"
                        if is_prepared
                        else "สังเกตจุดเชื่อมสายด้ายสามจุดบนโต๊ะแล้วค่อย ๆ คลายทีละจุด (INT/SPI)"
                    ),
                    "sample": (
                        "คุมแรงสะท้อนของด้ายบนโต๊ะและเริ่มแยกสายคำสั่งตามตำรา"
                        if is_prepared
                        else "เพ่งสังเกตปมด้ายที่ตึงที่สุดบนโต๊ะแล้วลองคลายแรงสะท้อนทีละจุด"
                    ),
                },
                {
                    "id": "kaew_memory",
                    "label": "ความทรงจำคืนน้ำท่วมปี 2534" if knows_2534 else "สติและเสียงพูดของแม่แก้ว",
                    "hint": (
                        "กล่อมเรียกสติแม่แก้วด้วยเหตุการณ์คืนช่วยชีวิตเด็กในน้ำท่วม"
                        if knows_2534
                        else "พูดปลอบประโลมให้แม่แก้วต้านแรงด้ายดำที่บังคับอยู่"
                    ),
                    "sample": (
                        "ตะโกนเตือนสติแม่แก้วว่าพวกเรามาเปิดเผยความจริงปี 2534"
                        if knows_2534
                        else "ตะโกนบอกแม่แก้วว่าพวกเราจะหยุดกำไลให้เธอเป็นอิสระ"
                    ),
                },
                {
                    "id": "ritual_table",
                    "label": "โต๊ะไม้และมุมกำบังในห้องพิธี",
                    "hint": "ช่วยเพื่อนคุ้มกันคนที่กำลังคลายปมกำไลระหว่างที่รากกล้วยฟาดขึ้นมา",
                    "sample": "ยืนขวางหน้ารากไม้เพื่อคุ้มกันเพื่อนที่กำลังคลายปมกำไล",
                },
            ]
        elif enc_id == "KAEW_SHIELDED_SHADOW":
            knows_2534 = "knows_wichai_saved" in room.clues_found
            features = [
                {
                    "id": "shrine_pillar",
                    "label": "เสาศาลเก่าและเงากอกล้วย",
                    "hint": "ใช้เสาศาลและกอกล้วยกำบังจังหวะด้ายดำตวัด",
                    "sample": "หลบเข้าหลังเสาศาลแล้วเรียกสติแม่แก้วว่าพวกเราไม่คิดทำร้าย",
                },
                {
                    "id": "kaew_bound_threads",
                    "label": "เส้นด้ายดำที่ข้อมือ",
                    "hint": "ด้ายถูกบังคับจากที่อื่น ลองเจรจาหรือตั้งรับแทนการตัดด้ายตรงนี้",
                    "sample": "สังเกตแรงตึงของด้ายดำที่ข้อมือแล้วตั้งแนวคุ้มกันให้เพื่อน",
                },
                (
                    {
                        "id": "kaew_past_echo",
                        "label": "ความทรงจำคืนน้ำท่วมปี 2534",
                        "hint": "เตือนสติแม่แก้วด้วยเหตุการณ์คืนน้ำท่วมปี 2534 ที่ยายบุญมีเล่า",
                        "sample": "ตะโกนเรียกสติแม่แก้วถึงคืนน้ำท่วมปี 2534 ว่าพวกเราจะช่วยเปิดเผยความจริง",
                    }
                    if knows_2534
                    else {
                        "id": "flashlight_shrine",
                        "label": "ลำแสงไฟฉายภาคสนาม",
                        "hint": "สาดไฟฉายเปิดทางถอยหรือตัดจังหวะรากไม้รอบศาล",
                        "sample": "สาดไฟฉายตัดแนวรากกล้วยเพื่อช่วยเปิดทางให้เพื่อนร่วมทีม",
                    }
                ),
            ]
        else:
            features = self._default_combat_features()
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
        actor_sid: Optional[str] = None,
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
            scene_before == "D4"
            and not room.combat
            and not room.ending_triggered
            and (decision.action_kind == "combat" or decision.state_updates.start_combat)
        ):
            combat_events = self.start_combat(
                room.room_code,
                return_scene="D4",
                encounter_id="KAEW_SHIELDED_SHADOW",
            )
            primary = combat_events[0] if combat_events else self._build_audio_payload(
                None, "DM", "เส้นด้ายดำและรากกล้วยหน้าศาลพุ่งเข้าต้านทีมสืบสวน!", mode="script"
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
            and (decision.action_kind == "combat" or decision.state_updates.start_combat)
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
        bypassed_roll: Optional[dict[str, Any]] = None
        bypass_primary_event: Optional[dict[str, Any]] = None
        blocked_check_hint: Optional[str] = None

        if decision.requested_check_id and room.pending_check is None:
            elig = self.check_eligibility(room, decision.requested_check_id)
            if not elig["eligible"]:
                if elig["blocked_reason"] in {"missing_requires", "needs_new_evidence", "max_attempts"}:
                    blocked_check_hint = elig["missing_hint"] or elig["can_retry_hint"]
            else:
                trig = self.trigger_check(
                    room, decision.requested_check_id, actor_name, requested_by_sid=actor_sid
                )
                if trig and trig.get("bypassed"):
                    bypassed_roll = trig.get("roll")
                    bypass_audio = trig.get("audio_event")
                    if decision.mode == "script" and decision.selected_audio_id in eligible_by_id:
                        if bypass_audio:
                            queued_events.append(bypass_audio)
                    else:
                        bypass_primary_event = bypass_audio or self._build_audio_payload(
                            None,
                            "DM",
                            (bypassed_roll or {}).get("consequence_th") or "ผ่านการตรวจสอบโดยไม่ต้องทอยเต๋า",
                            mode="script",
                        )

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
        elif bypass_primary_event is not None:
            primary_event = bypass_primary_event
            needs_live_tts = False
        else:
            raw_improv = (decision.improvised_text or "").strip()[:450]
            if blocked_check_hint:
                speaker = "DM"
                safe_text = blocked_check_hint
            elif decision.mode == "script" and decision.selected_audio_id is None and raw_improv:
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
                    safe_text = "เรื่องนั้นยายก็ไม่กล้าพูดมั่วหรอกลูก ลองถามเรื่องศาลหรือคืนน้ำท่วมปี 2534 ก่อนดีกว่า"
                elif speaker == "แม่แก้ว (นางตานี)":
                    safe_text = "เสียงลมจากต้นกล้วยสั่นระริก — ข้าพูดมากไปกว่านี้ไม่ได้... เส้นด้ายดำยังรั้งคออยู่"
                elif speaker == "ดล":
                    safe_text = "ผมจำได้เท่าที่เห็นตอนถูกขังครับพี่ รีบขึ้นไปดูข้างบนเถอะครับ!"
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
            if clue_id in scene_cfg.get("allowed_clues", []):
                self._grant_clue(room, clue_id)

        for item_id in updates.add_inventory:
            if item_id in scene_cfg.get("allowed_items", []):
                self._grant_item(room, item_id)

        if decision.inspect_target_id:
            insp = next(
                (it for it in scene_cfg.get("inspectables", []) if it.get("id") == decision.inspect_target_id),
                None,
            )
            if insp:
                if insp["id"] not in room.inspected_objects:
                    room.inspected_objects.append(insp["id"])
                for cid in insp.get("unlock_clues", []):
                    self._grant_clue(room, cid)
                for iid in insp.get("unlock_items", []):
                    self._grant_item(room, iid)
            else:
                recipe = self.repo.combine_recipes_by_id.get(decision.inspect_target_id)
                if recipe and all(i in room.inventory for i in recipe.get("requires_items", [])) and all(
                    c in room.clues_found for c in recipe.get("requires_clues", [])
                ):
                    if recipe["id"] not in room.completed_combines:
                        room.completed_combines.append(recipe["id"])
                    for cid in recipe.get("unlock_clues", []):
                        self._grant_clue(room, cid)

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
            "bypassed_roll": bypassed_roll,
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

        scene_node_map = {
            "A1": "sala",
            "A2": "company_van",
            "A3": "sala",
        }
        room.board_node = node_id
        room.last_activity_at = time.time()
        events: list[dict[str, Any]] = []

        if node_id == "banana_grove_edge":
            if room.current_scene == "A3" and not room.ending_triggered:
                events.extend(self.start_combat(room.room_code, return_scene="A3"))
            else:
                room.board_node = scene_node_map.get(room.current_scene, "sala")
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
        elif node_id == "sala" and not room.ending_triggered:
            if room.current_scene != "A1":
                events.extend(self._advance_scene(room, "A1"))
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
        elif node_id == "company_van":
            if room.current_scene == "A1":
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
            elif room.current_scene != "A2" and not room.ending_triggered:
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

    def compute_guideline_snapshot(self, room: RoomState) -> dict[str, Any]:
        """Compute spoiler-free deterministic mission objectives, leads, inspectables, and combine hints."""
        current_act = self.act_for_scene(room.current_scene)
        scene_cfg = self.repo.get_scene(room.current_scene) or {}
        act_meta = self.repo.act_objectives.get(current_act, {})
        default_act_titles = {
            "A": "บทนำ: ศาลาริมทางบ้านหนองตาล",
            "B": "บ้านผู้ใหญ่บ้าน & แฟ้มคดี",
            "C": "ตามรอยเบาะแสในหมู่บ้าน",
            "D": "เข้าสู่แนวสวนกล้วยยามค่ำ",
            "E": "เรือนไม้ร้างท้ายสวน",
            "F": "บทสรุปคดีบ้านหนองตาล",
        }
        act_title = act_meta.get("title") or default_act_titles.get(current_act, f"ACT {current_act}")
        act_goal = act_meta.get("main_goal") or scene_cfg.get("subtitle", "")

        g_cfg = scene_cfg.get("guideline") or {}
        scene_goal = g_cfg.get("main_objective") or scene_cfg.get("subtitle", "")

        leads_out: list[dict[str, Any]] = []
        trackable_main_leads: list[dict[str, Any]] = []
        for lead in g_cfg.get("leads", []):
            vis_clues = lead.get("visible_if_clues") or []
            if vis_clues and not all(c in room.clues_found for c in vis_clues):
                continue
            done_clues = lead.get("done_when_clues") or []
            done_checks = lead.get("done_when_checks") or []
            done_scenes = lead.get("done_when_scenes") or []
            done_items = lead.get("done_when_items") or []
            has_done_condition = bool(done_clues or done_checks or done_scenes or done_items)
            is_done = (
                any(c in room.clues_found for c in done_clues)
                or any(cid in room.resolved_checks for cid in done_checks)
                or any(sid in room.visited_scenes for sid in done_scenes)
                or any(iid in room.inventory for iid in done_items)
            )
            entry = {
                "id": lead.get("id", ""),
                "label": lead.get("label", ""),
                "kind": "optional" if lead.get("kind") == "optional" else "main",
                "done": bool(is_done),
                "prompt_suggestion": lead.get("prompt_suggestion", ""),
            }
            leads_out.append(entry)
            if entry["kind"] == "main" and has_done_condition:
                trackable_main_leads.append(entry)

        any_clues = g_cfg.get("ready_when_any_clues") or []
        all_clues = g_cfg.get("ready_when_all_clues") or []
        if any_clues or all_clues:
            any_ok = (not any_clues) or any(c in room.clues_found for c in any_clues)
            all_ok = (not all_clues) or all(c in room.clues_found for c in all_clues)
            ready_to_advance = any_ok and all_ok
        else:
            main_leads = trackable_main_leads or [l for l in leads_out if l["kind"] == "main"]
            ready_to_advance = all(l["done"] for l in main_leads) if main_leads else True

        ready_label = g_cfg.get("ready_label") or (
            "พร้อมก้าวสู่จุดถัดไปแล้ว" if ready_to_advance else "กำลังสืบสวนเบาะแสหลัก"
        )

        # Exclude pure Act-exit leads (empty done_when_*) so unlocking the exit never flags itself as missing.
        missing_recommended: list[str] = [
            l["label"] for l in trackable_main_leads if not l["done"] and l["label"]
        ]
        act_safeguards: list[str] = []
        if current_act == "B":
            if room.current_scene != "B1" and "don_house_location" not in room.clues_found:
                act_safeguards.append("กลับไปตรวจแฟ้มคนหายและแผนที่ในห้องรับแขกเพื่อหาจุดหมายถัดไป")
            if "don_house_location" in room.clues_found and "B2" not in room.visited_scenes:
                act_safeguards.append("ลองเดินคุยและสำรวจมุมอื่นในบ้านผู้ใหญ่ให้ครบก่อนเดินทางต่อ")
        elif current_act == "E":
            if "hostages_found" not in room.clues_found:
                act_safeguards.append("ตรวจสอบเสียงเคาะหลังประตูห้องใต้ถุนให้เรียบร้อย")
            if "ritual_bracelet_core" in room.clues_found and "wichai_debt_evidence" not in room.clues_found:
                act_safeguards.append("ตรวจค้นใต้ผ้าคลุมโต๊ะบนชั้นสองให้ครบก่อน")
        elif current_act == "F" and room.current_scene == "F5":
            if "kaew_reconciled" not in room.clues_found:
                act_safeguards.append("เจรจาทำความเข้าใจกับแม่แก้วก่อนออกสู่ถนนใหญ่")
        for msg in act_safeguards:
            if msg not in missing_recommended:
                missing_recommended.append(msg)

        inspectables_out: list[dict[str, Any]] = []
        for obj in scene_cfg.get("inspectables", []):
            vis = obj.get("visible_if_clues") or []
            if vis and not all(c in room.clues_found for c in vis):
                continue
            inspectables_out.append(
                {
                    "id": obj["id"],
                    "label": obj["label"],
                    "inspected": obj["id"] in room.inspected_objects,
                }
            )

        combine_hints: list[dict[str, Any]] = []
        for recipe in self.repo.combine_recipes:
            if not isinstance(recipe, dict) or not recipe.get("id"):
                continue
            req_items = recipe.get("requires_items") or []
            req_clues = recipe.get("requires_clues") or []
            ready = all(i in room.inventory for i in req_items) and all(
                c in room.clues_found for c in req_clues
            )
            completed = recipe["id"] in room.completed_combines
            if ready or completed:
                combine_hints.append(
                    {
                        "id": recipe["id"],
                        "title": recipe["title"],
                        "ready": bool(ready),
                        "completed": bool(completed),
                    }
                )

        combat_goal: Optional[str] = None
        combat_optional_goal: Optional[str] = None
        if room.combat and room.combat.active:
            c = room.combat
            enc = self.repo.get_combat_encounter(c.encounter_id)
            if c.encounter_id == "KAEW_FINAL_BOSS":
                if c.ritual_shield_up:
                    combat_goal = (
                        f"เป้าหมายหลัก: คลายเกราะกำไล 3 ขั้น ({c.ritual_step}/{c.ritual_max_steps}) "
                        "— ระหว่างเกราะอยู่การโจมตีปกติจะไม่เข้า!"
                    )
                else:
                    combat_goal = (
                        "เป้าหมายหลัก: เกราะสลายแล้ว! กดปุ่ม 'ปลดกำไลขั้นสุดท้าย' เพื่อยุติพิธีโดยไม่ทำร้ายแม่แก้ว"
                    )
            else:
                combat_goal = enc.get("primary_goal_th") or (
                    f"เป้าหมายหลัก: รับมือ {c.enemy_name} "
                    f"(โจมตี / กล่อม {c.soothe_progress}/{c.soothe_goal} / ถอย {c.retreat_progress}/{c.retreat_goal})"
                )
            combat_optional_goal = enc.get("optional_goal_th") or (
                "ทางเลือกเสริม: ใช้สภาพแวดล้อมในฉากหรือช่วยคุ้มกันเพื่อนเพื่อรับโบนัส +2"
            )

        return {
            "act": current_act,
            "act_title": act_title,
            "act_goal": act_goal,
            "scene_id": room.current_scene,
            "scene_goal": scene_goal,
            "ready_to_advance": bool(ready_to_advance),
            "ready_label": ready_label,
            "missing_recommended": missing_recommended,
            "leads": leads_out,
            "inspectables": inspectables_out,
            "combine_hints": combine_hints,
            "combat_goal": combat_goal,
            "combat_optional_goal": combat_optional_goal,
        }

    def inspect_dossier_target(
        self,
        room_code: str,
        sid: str,
        target_type: str,
        target_id: str,
    ) -> dict[str, Any]:
        """Inspect a scene object, held inventory item, or combine ready items/clues."""
        room = self.get_or_create_room(room_code)
        player = self.get_player_by_sid(sid)
        actor_name = player.name if player else "ผู้สืบสวน"
        room.last_activity_at = time.time()
        room.idle_prompted = False

        if target_type == "inventory":
            if target_id not in room.inventory or target_id not in self.repo.items_catalog:
                raise ValueError("ไม่พบเอกสารหรือไอเท็มชิ้นนี้ในสัมภาระของทีม")
            item = self.repo.items_catalog[target_id]
            text = f"{actor_name} ตรวจดู [{item['label']}]: {item['detail']}"
            self.append_log(room, "DM", text, kind="narration")
            return {
                "event": self._build_audio_payload(None, "DM", text, mode="script"),
                "unlocked_clues": [],
                "unlocked_items": [],
            }

        if room.combat and room.combat.active:
            raise ValueError("กำลังเผชิญหน้าอยู่! จัดการการต่อสู้รอบนี้ให้จบก่อน")
        if room.ending_triggered:
            raise ValueError("บทนี้จบลงแล้ว กรุณากดดำเนินการต่อหรือเริ่มใหม่")

        if target_type == "scene_object":
            scene_cfg = self.repo.get_scene(room.current_scene) or {}
            obj = next(
                (it for it in scene_cfg.get("inspectables", []) if it.get("id") == target_id),
                None,
            )
            if not obj:
                raise ValueError("ไม่พบจุดสำรวจนี้ในฉากปัจจุบัน")
            vis = obj.get("visible_if_clues") or []
            if vis and not all(c in room.clues_found for c in vis):
                raise ValueError("ยังไม่พบเงื่อนไขที่มองเห็นจุดสำรวจนี้")

            if target_id not in room.inspected_objects:
                room.inspected_objects.append(target_id)
            unlocked_clues = [cid for cid in obj.get("unlock_clues", []) if self._grant_clue(room, cid)]
            unlocked_items = [iid for iid in obj.get("unlock_items", []) if self._grant_item(room, iid)]

            text = obj["description"]
            self.append_log(room, "DM", text, kind="narration")
            return {
                "event": self._build_audio_payload(None, "DM", text, mode="script"),
                "unlocked_clues": unlocked_clues,
                "unlocked_items": unlocked_items,
            }

        if target_type == "combine":
            recipe = self.repo.combine_recipes_by_id.get(target_id)
            if not recipe:
                raise ValueError("ไม่พบชุดหลักฐานที่จะนำมาเชื่อมโยง")
            req_items = recipe.get("requires_items") or []
            req_clues = recipe.get("requires_clues") or []
            if not (all(i in room.inventory for i in req_items) and all(c in room.clues_found for c in req_clues)):
                raise ValueError("ยังรวบรวมเอกสารหรือเบาะแสที่ใช้เทียบกันไม่ครบ")

            if target_id not in room.completed_combines:
                room.completed_combines.append(target_id)
            unlocked_clues = [cid for cid in recipe.get("unlock_clues", []) if self._grant_clue(room, cid)]
            text = recipe.get("result_text") or f"เชื่อมโยงหลักฐาน '{recipe['title']}' เรียบร้อยแล้ว"
            self.append_log(room, "DM", text, kind="narration")
            return {
                "event": self._build_audio_payload(None, "DM", text, mode="script"),
                "unlocked_clues": unlocked_clues,
                "unlocked_items": [],
            }

        raise ValueError("ประเภทการตรวจสอบไม่ถูกต้อง")

    def serialize_public_state(self, room: RoomState) -> dict[str, Any]:
        """Return strictly spoiler-free room snapshot for clients (never leaks other players' tokens)."""
        self._expire_stale_mic_lock(room)
        current_act = self.act_for_scene(room.current_scene)
        scene_cfg = self.repo.get_scene(room.current_scene) or {}
        exit_node_ids = {
            "headman_house",
            "road_to_don_house",
            "c_to_act_d_gate",
            "d_to_act_e_house",
            "e_to_act_f_ritual",
        }
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
                "visited": n["scene"] in room.visited_scenes,
                "is_exit": n["id"] in exit_node_ids,
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
            enc = self.repo.get_combat_encounter(c.encounter_id)
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
                "pdef": int(enc.get("pdef", 12)),
                "mdef": int(enc.get("mdef", 13)),
                "ritual_dc": int(enc.get("ritual_dc", 12)),
                "ritual_plan": room.case_flags.get("ritual_plan"),
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

        guideline = self.compute_guideline_snapshot(room)

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
            "guideline": guideline,
            "visited_scenes": list(room.visited_scenes),
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
