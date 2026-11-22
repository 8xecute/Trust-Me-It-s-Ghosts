"""In-memory visitor and play-session usage tracker for Render observability (no database)."""

from __future__ import annotations

import hashlib
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

BANGKOK_TZ = timezone(timedelta(hours=7))


def format_bangkok_time(ts: Optional[float] = None) -> str:
    dt = datetime.fromtimestamp(time.time() if ts is None else ts, tz=BANGKOK_TZ)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def mask_ip_and_tag(raw_ip: str) -> str:
    """Return privacy-preserving visitor label (masked IP + short stable hash tag)."""
    ip = (raw_ip or "").split(",")[0].strip()
    if not ip:
        return "unknown"
    tag = hashlib.sha256(ip.encode("utf-8")).hexdigest()[:4]
    if "." in ip:
        parts = ip.split(".")
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.x.x#{tag}"
    if ":" in ip:
        prefix = ":".join(ip.split(":")[:2])
        return f"{prefix}:*#{tag}"
    return f"client#{tag}"


def summarize_user_agent(ua: str) -> str:
    """Compact browser/OS summary from User-Agent header."""
    lower = (ua or "").lower()
    if not lower:
        return "Unknown"
    if "edg/" in lower:
        browser = "Edge"
    elif "chrome/" in lower and "chromium" not in lower:
        browser = "Chrome"
    elif "firefox/" in lower:
        browser = "Firefox"
    elif "safari/" in lower and "chrome/" not in lower:
        browser = "Safari"
    elif "curl/" in lower or "python" in lower:
        browser = "HTTPClient"
    else:
        browser = "Browser"

    if "iphone" in lower or "ipad" in lower:
        os_name = "iOS"
    elif "android" in lower:
        os_name = "Android"
    elif "windows" in lower:
        os_name = "Windows"
    elif "mac os" in lower or "macintosh" in lower:
        os_name = "macOS"
    elif "linux" in lower:
        os_name = "Linux"
    else:
        os_name = "OtherOS"
    return f"{browser}/{os_name}"


@dataclass
class PlayerSessionRecord:
    player_token: str
    room_code: str
    player_name: str
    role_name: str
    visitor: str
    device: str
    joined_at: float
    last_seen_at: float
    joined_at_th: str
    last_seen_th: str
    reconnect_count: int = 0
    turns_count: int = 0
    voice_stt_count: int = 0
    dice_rolls_count: int = 0
    online: bool = True
    last_ending: Optional[str] = None


class UsageTracker:
    """Tracks page visits, unique visitors, room joins, gameplay turns, and durations."""

    def __init__(self, max_sessions: int = 100, max_events: int = 150) -> None:
        self.started_at: float = time.time()
        self.started_at_th: str = format_bangkok_time(self.started_at)
        self.total_page_visits: int = 0
        self.unique_visitors: set[str] = set()
        self.total_joins: int = 0
        self.total_reconnects: int = 0
        self.total_turns: int = 0
        self.total_voice_stt: int = 0
        self.total_dice_rolls: int = 0
        self.total_combats: int = 0
        self.total_endings: int = 0

        self._sid_client_meta: dict[str, tuple[str, str]] = {}
        self._sessions: dict[str, PlayerSessionRecord] = {}
        self._session_order: deque[str] = deque(maxlen=max_sessions)
        self._events: deque[dict[str, Any]] = deque(maxlen=max_events)

    def register_socket_client(self, sid: str, raw_ip: str, user_agent: str) -> tuple[str, str]:
        visitor = mask_ip_and_tag(raw_ip)
        device = summarize_user_agent(user_agent)
        self._sid_client_meta[sid] = (visitor, device)
        if visitor != "unknown":
            self.unique_visitors.add(visitor)
        return visitor, device

    def get_socket_client(self, sid: str) -> tuple[str, str]:
        return self._sid_client_meta.get(sid, ("unknown", "Unknown"))

    def pop_socket_client(self, sid: str) -> None:
        self._sid_client_meta.pop(sid, None)

    def _add_event(
        self,
        event_type: str,
        room_code: str = "-",
        player_name: str = "-",
        detail: str = "",
    ) -> dict[str, Any]:
        ev = {
            "time_th": format_bangkok_time(),
            "type": event_type,
            "room_code": room_code,
            "player_name": player_name,
            "detail": detail,
        }
        self._events.appendleft(ev)
        return ev

    def record_page_visit(self, raw_ip: str, user_agent: str) -> tuple[str, str]:
        visitor = mask_ip_and_tag(raw_ip)
        device = summarize_user_agent(user_agent)
        self.total_page_visits += 1
        if visitor != "unknown":
            self.unique_visitors.add(visitor)
        self._add_event("VISIT", detail=f"visitor={visitor} device={device}")
        return visitor, device

    def record_join(
        self,
        sid: str,
        room_code: str,
        player_token: str,
        player_name: str,
        role_name: str,
        reconnected: bool,
    ) -> PlayerSessionRecord:
        now = time.time()
        visitor, device = self.get_socket_client(sid)
        session = self._sessions.get(player_token)

        if session is None:
            self.total_joins += 1
            session = PlayerSessionRecord(
                player_token=player_token,
                room_code=room_code,
                player_name=player_name,
                role_name=role_name,
                visitor=visitor,
                device=device,
                joined_at=now,
                last_seen_at=now,
                joined_at_th=format_bangkok_time(now),
                last_seen_th=format_bangkok_time(now),
            )
            self._sessions[player_token] = session
            if len(self._session_order) == self._session_order.maxlen:
                evicted = self._session_order[0]
                if evicted != player_token:
                    self._sessions.pop(evicted, None)
            self._session_order.append(player_token)
        else:
            if reconnected:
                self.total_reconnects += 1
                session.reconnect_count += 1
            session.player_name = player_name
            session.role_name = role_name
            session.online = True
            session.last_seen_at = now
            session.last_seen_th = format_bangkok_time(now)
            if visitor != "unknown":
                session.visitor = visitor
            if device != "Unknown":
                session.device = device

        ev_type = "RECONNECT" if reconnected else "JOIN"
        self._add_event(
            ev_type,
            room_code=room_code,
            player_name=player_name,
            detail=f"role={role_name} visitor={session.visitor} device={session.device}",
        )
        return session

    def record_turn(self, player_token: Optional[str], room_code: str, player_name: str, mode: str) -> None:
        self.total_turns += 1
        now = time.time()
        if player_token and player_token in self._sessions:
            rec = self._sessions[player_token]
            rec.turns_count += 1
            rec.last_seen_at = now
            rec.last_seen_th = format_bangkok_time(now)
        self._add_event("TURN", room_code=room_code, player_name=player_name, detail=f"mode={mode}")

    def record_voice_stt(self, player_token: Optional[str], room_code: str, player_name: str, chars: int) -> None:
        self.total_voice_stt += 1
        now = time.time()
        if player_token and player_token in self._sessions:
            rec = self._sessions[player_token]
            rec.voice_stt_count += 1
            rec.last_seen_at = now
            rec.last_seen_th = format_bangkok_time(now)
        self._add_event("STT", room_code=room_code, player_name=player_name, detail=f"chars={chars}")

    def record_dice(
        self, player_token: Optional[str], room_code: str, player_name: str, check_id: str, total: int, tier: str
    ) -> None:
        self.total_dice_rolls += 1
        now = time.time()
        if player_token and player_token in self._sessions:
            rec = self._sessions[player_token]
            rec.dice_rolls_count += 1
            rec.last_seen_at = now
            rec.last_seen_th = format_bangkok_time(now)
        self._add_event(
            "DICE", room_code=room_code, player_name=player_name, detail=f"{check_id} total={total} ({tier})"
        )

    def record_combat_start(self, room_code: str, player_name: str) -> None:
        self.total_combats += 1
        self._add_event("COMBAT_START", room_code=room_code, player_name=player_name, detail="ผีเงาจมน้ำ")

    def record_ending(self, room_code: str, ending: str, total_turns: int) -> None:
        self.total_endings += 1
        now = time.time()
        for rec in self._sessions.values():
            if rec.room_code == room_code and rec.online:
                rec.last_ending = ending
                rec.last_seen_at = now
                rec.last_seen_th = format_bangkok_time(now)
        self._add_event("ENDING", room_code=room_code, detail=f"{ending} (turns={total_turns})")

    def record_leave(
        self, sid: str, player_token: Optional[str], room_code: str, player_name: str, online_remaining: int
    ) -> int:
        now = time.time()
        duration_s = 0
        if player_token and player_token in self._sessions:
            rec = self._sessions[player_token]
            rec.online = False
            rec.last_seen_at = now
            rec.last_seen_th = format_bangkok_time(now)
            duration_s = max(0, int(round(now - rec.joined_at)))
        self.pop_socket_client(sid)
        self._add_event(
            "LEAVE",
            room_code=room_code,
            player_name=player_name,
            detail=f"duration={duration_s}s online_left={online_remaining}",
        )
        return duration_s

    def get_summary(self, active_rooms: int, online_players: int) -> dict[str, Any]:
        now = time.time()
        sessions_list: list[dict[str, Any]] = []
        for token in reversed(self._session_order):
            rec = self._sessions.get(token)
            if not rec:
                continue
            item = asdict(rec)
            item.pop("player_token", None)
            end_ts = now if rec.online else rec.last_seen_at
            item["duration_seconds"] = max(0, int(round(end_ts - rec.joined_at)))
            sessions_list.append(item)

        return {
            "started_at_th": self.started_at_th,
            "uptime_seconds": max(0, int(round(now - self.started_at))),
            "totals": {
                "page_visits": self.total_page_visits,
                "unique_visitors": len(self.unique_visitors),
                "total_joins": self.total_joins,
                "total_reconnects": self.total_reconnects,
                "total_turns": self.total_turns,
                "total_voice_stt": self.total_voice_stt,
                "total_dice_rolls": self.total_dice_rolls,
                "total_combats": self.total_combats,
                "total_endings": self.total_endings,
                "active_rooms": active_rooms,
                "online_players": online_players,
            },
            "recent_sessions": sessions_list,
            "recent_events": list(self._events),
        }
