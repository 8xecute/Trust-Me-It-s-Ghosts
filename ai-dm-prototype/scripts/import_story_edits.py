#!/usr/bin/env python3
"""Parse edited `style` and `text` fields from story/*.md back into data/ JSON files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
STORY_DIR = BASE_DIR / "story"

HEADER_RE = re.compile(r"^####\s+\d+\.\s+`([a-zA-Z0-9_]+)`\s+—")
STYLE_RE = re.compile(r"^- \*\*สไตล์เสียง \(`style`\):\*\*\s*(.*)$")
TEXT_RE = re.compile(r"^- \*\*บทพูด \(`text`\):\*\*\s*(.*)$")


def parse_markdown_dialogues(md_text: str) -> dict[str, dict[str, str]]:
    """Extract {dialogue_id: {'style': ..., 'text': ...}} from Markdown dialogue blocks."""
    parsed: dict[str, dict[str, str]] = {}
    current_id: str | None = None

    for raw_line in md_text.splitlines():
        line = raw_line.strip()
        m_head = HEADER_RE.match(line)
        if m_head:
            current_id = m_head.group(1)
            parsed.setdefault(current_id, {})
            continue
        if current_id is None:
            continue
        if line.startswith("## ") or line.startswith("### ") or line == "---":
            current_id = None
            continue
        m_style = STYLE_RE.match(line)
        if m_style:
            val = m_style.group(1).strip()
            if val and val != "-":
                parsed[current_id]["style"] = val
            continue
        m_text = TEXT_RE.match(line)
        if m_text:
            val = m_text.group(1).strip()
            if val:
                parsed[current_id]["text"] = val

    return {k: v for k, v in parsed.items() if "text" in v or "style" in v}


def _live_dialogue_json_paths(data_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for candidate in (data_dir / "common" / "fillers.json", data_dir / "combat" / "dialogues.json"):
        if candidate.exists():
            paths.append(candidate)
    for act_dir in sorted(p for p in data_dir.iterdir() if p.is_dir() and p.name.startswith("act_")):
        p = act_dir / "dialogues.json"
        if p.exists():
            paths.append(p)
    return paths


def collect_changes(
    story_dir: Path = STORY_DIR, data_dir: Path = DATA_DIR
) -> tuple[list[dict[str, Any]], dict[Path, dict[str, Any]]]:
    """Compare Markdown edits against live data JSONs and return (changes, updated_file_payloads)."""
    edited_by_id: dict[str, dict[str, str]] = {}
    for md_path in sorted(story_dir.glob("*.md")):
        if md_path.name == "README.md":
            continue
        edited_by_id.update(parse_markdown_dialogues(md_path.read_text(encoding="utf-8")))

    changes: list[dict[str, Any]] = []
    updated_payloads: dict[Path, dict[str, Any]] = {}

    for json_path in _live_dialogue_json_paths(data_dir):
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        file_dirty = False
        for entry in payload.get("dialogues", []):
            did = entry.get("id")
            if did not in edited_by_id:
                continue
            edits = edited_by_id[did]
            for field_name in ("style", "text"):
                if field_name not in edits:
                    continue
                old_val = (entry.get(field_name) or "").strip()
                new_val = edits[field_name].strip()
                if new_val != old_val:
                    changes.append(
                        {
                            "id": did,
                            "file": str(json_path.relative_to(data_dir)),
                            "field": field_name,
                            "old": old_val,
                            "new": new_val,
                        }
                    )
                    entry[field_name] = new_val
                    file_dirty = True
        if file_dirty:
            updated_payloads[json_path] = payload

    return changes, updated_payloads


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import edited dialogue `text` / `style` fields from story/*.md into data/ JSONs."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write detected edits into data/ JSON files (default is dry-run preview)",
    )
    args = parser.parse_args()

    changes, updated_payloads = collect_changes()
    if not changes:
        print("No dialogue edits detected between story/*.md and data/*.json.")
        return 0

    print(f"Detected {len(changes)} change(s):")
    for ch in changes:
        print(f"  [{ch['file']}] {ch['id']}.{ch['field']}:")
        print(f"    - old: {ch['old']}")
        print(f"    + new: {ch['new']}")

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to save changes to data/.")
        return 0

    for json_path, payload in updated_payloads.items():
        json_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Updated {json_path.relative_to(BASE_DIR)}")

    changed_ids = sorted({c["id"] for c in changes})
    print("\nTo regenerate voices for changed lines only:")
    for did in changed_ids:
        print(f"  ai-dm-prototype\\.venv\\Scripts\\python.exe ai-dm-prototype\\scripts\\generate_audio.py --id {did} --overwrite")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
