#!/usr/bin/env python3
"""Generate numbered, writer-friendly Thai Markdown story files (00_..07_) into story/ for Acts A-F."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.state_manager import _dialogue_act_from_id, audio_bucket_for_entry, load_scenario_files  # noqa: E402

DATA_DIR = BASE_DIR / "data"
STORY_DIR = BASE_DIR / "story"
V55_DIR = REPO_ROOT / "packages" / "server" / "scenarios" / "case-001"

ACT_META = [
    ("A", "01_act_a_script.md", "ACT A: ศาลาริมทาง รถตู้บริษัท และหน้าบ้านผู้ใหญ่บ้าน"),
    ("B", "02_act_b_script.md", "ACT B: บ้านผู้ใหญ่บ้าน (ห้องรับแขก ชานบ้าน และผนังภาพปี 2534)"),
    ("C", "03_act_c_script.md", "ACT C: บ้านดล สมุดบันทึก เคาะสามครั้ง และยายบุญมี"),
    ("D", "04_act_d_script.md", "ACT D: เข้าสวนกล้วย ศาลด้ายดำ แม่แก้ว และรอยล้อ"),
    ("E", "05_act_e_script.md", "ACT E & H1: เรือนไม้ร้าง ตัวประกัน กำไลแม่แก้ว วิชัย และคืนปี 2534"),
    ("F", "06_act_f_final_script.md", "ACT F (FINAL): เผชิญหน้าแม่แก้วและยุติพิธีกรรม"),
]

LEGACY_UNNUMBERED = (
    "overview_voices_and_clues.md",
    "act_a_script.md",
    "act_b_script.md",
)


def _read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return {} if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def _format_unlocks(u: dict[str, Any]) -> str:
    parts: list[str] = []
    if u.get("clues"):
        parts.append("เบาะแส: " + ", ".join(f"`{c}`" for c in u["clues"]))
    if u.get("items"):
        parts.append("ไอเท็ม: " + ", ".join(f"`{i}`" for i in u["items"]))
    if u.get("next_scene"):
        parts.append(f"เปลี่ยนฉาก -> `{u['next_scene']}`")
    if u.get("trust_delta"):
        td = ", ".join(f"{k}: {v:+d}" for k, v in u["trust_delta"].items())
        parts.append(f"ความไว้วางใจ: {td}")
    return " · ".join(parts) if parts else "-"


def _emit_dialogue_block(lines: list[str], d: dict[str, Any], idx: int) -> None:
    cond = d.get("trigger_condition") or {}
    reqs: list[str] = []
    if cond.get("requires_clues"):
        reqs.append("ต้องมีเบาะแส: " + ", ".join(f"`{c}`" for c in cond["requires_clues"]))
    if cond.get("requires_items"):
        reqs.append("ต้องมีไอเท็ม: " + ", ".join(f"`{i}`" for i in cond["requires_items"]))
    if cond.get("min_trust") is not None:
        reqs.append(f"trust >= {cond['min_trust']}")
    req_str = f" ({'; '.join(reqs)})" if reqs else ""
    once_str = "ครั้งเดียว" if cond.get("once") else "ซ้ำได้"
    bucket = audio_bucket_for_entry(d)

    lines.append(f"#### {idx}. `{d['id']}` — **{d['speaker']}** (`{d.get('voice', '')}`)")
    lines.append(f"- **จังหวะใช้งาน ({once_str}){req_str}:** {cond.get('topic_hint', '-')}")
    lines.append(f"- **ไฟล์เสียง:** `audio_assets/{bucket}/{d['id']}.wav`")
    lines.append(f"- **สไตล์เสียง (`style`):** {d.get('style', '-')}")
    lines.append(f"- **บทพูด (`text`):** {d['text']}")
    unlock_str = _format_unlocks(d.get("unlocks") or {})
    if unlock_str != "-":
        lines.append(f"- **ผลลัพธ์ (`unlocks`):** {unlock_str}")
    lines.append("")


def build_00_characters_and_voices(dlg_raw: dict[str, Any], lore_raw: dict[str, Any]) -> str:
    voice_profiles = dlg_raw.get("voice_profiles", {})
    fillers = [d for d in dlg_raw.get("dialogues", []) if d.get("is_filler")]
    clues = lore_raw.get("clues_catalog", {})
    items = lore_raw.get("items_catalog", {})
    roles = lore_raw.get("roles", [])

    lines: list[str] = [
        f"# ตัวละคร โปรไฟล์เสียง เบาะแส และเสียงคั่นเวลา — {lore_raw.get('case_title', 'CASE 001')}",
        "",
        "> สถานะ: **[Live AI DM — ใช้งานจริงในระบบ]**  ",
        "> แก้ `text` หรือ `style` ของเสียงคั่นเวลา (`filler_*`) ในไฟล์นี้ได้โดยตรง แล้วรัน `python scripts/import_story_edits.py --apply`",
        "",
        "## โปรไฟล์เสียงตัวละคร (`data/common/voices.json`)",
        "",
        "| ตัวละคร (`speaker`) | เสียง Gemini (`voice`) | สไตล์การพากย์ (`style`) |",
        "| :--- | :--- | :--- |",
    ]
    for spk, prof in voice_profiles.items():
        lines.append(f"| **{spk}** | `{prof.get('voice', '')}` | {prof.get('style', '')} |")

    lines.extend(["", "## อาชีพผู้เล่น 6 สาย (`data/common/roles.json`)", ""])
    for r in roles:
        stats = ", ".join(f"{k}:{v}" for k, v in (r.get("stats") or {}).items())
        sk = r.get("skill") or {}
        lines.append(
            f"- **{r['name']}** (`{r['id']}`): {r.get('subtitle', '')} · `{stats}` · ท่า: **{sk.get('name', '-')}** ({sk.get('description', '')})"
        )

    lines.extend(["", f"## เสียงคั่นเวลาตอน AI คิดสด (`data/common/fillers.json` — {len(fillers)} รายการ)", ""])
    for i, f in enumerate(fillers, 1):
        _emit_dialogue_block(lines, f, i)

    lines.extend(["---", "", f"## เบาะแสทั้งหมดที่ใช้งานใน AI DM ตอนนี้ ({len(clues)} รายการ)", ""])
    for cid, c in clues.items():
        lines.append(f"- `{cid}` — **{c['label']}**: {c['detail']}")

    lines.extend(["", f"## ไอเท็มและเอกสารทั้งหมด ({len(items)} รายการ)", ""])
    for iid, it in items.items():
        lines.append(f"- `{iid}` — **{it['label']}**: {it['detail']}")

    lines.append("")
    return "\n".join(lines)


def build_live_act_doc(act_letter: str, heading: str, dlg_raw: dict[str, Any], lore_raw: dict[str, Any]) -> str:
    scenes = lore_raw.get("scenes", {})
    checks = lore_raw.get("dice_checks", {})
    all_dlgs = dlg_raw.get("dialogues", [])

    act_scenes = sorted(sid for sid in scenes if sid.startswith(act_letter))
    prefix_lower = f"{act_letter.lower()}_"

    lines: list[str] = [
        f"# {heading}",
        "",
        f"> สถานะ: **[Live AI DM — พร้อมใช้งานและมีเสียงพากย์]**  ",
        f"> แหล่งข้อมูลหลัก: `data/act_{act_letter.lower()}/dialogues.json` และ `data/act_{act_letter.lower()}/lore.json`  ",
        "> วิธีแก้บท: แก้ตรงบรรทัด `สไตล์เสียง (style)` หรือ `บทพูด (text)` (คงรหัส `id` ไว้) แล้วรัน `python scripts/import_story_edits.py --apply`",
        "",
    ]

    for sid in act_scenes:
        sc = scenes[sid]
        lines.append(f"## ฉาก {sc.get('title', sid)}")
        lines.append(f"- **สถานการณ์:** {sc.get('subtitle', '')}")
        if sc.get("quick_prompts"):
            lines.append("- **ปุ่มคำถามด่วน (`quick_prompts`):** " + " | ".join(f'"{q}"' for q in sc["quick_prompts"]))
        for cid in sc.get("available_checks", []):
            if cid in checks:
                c = checks[cid]
                lines.append(f"- **Dice Check `{c['id']}` ({c['stat']} DC {c['dc']}):** {c['title']} — _{c.get('trigger_hint', '')}_")
        if sc.get("spoiler_guardrails"):
            lines.append("- **กฎกันสปอยล์ประจำฉาก:**")
            for g in sc["spoiler_guardrails"]:
                lines.append(f"  - {g}")
        lines.append("")

        sc_dlgs = [d for d in all_dlgs if not d.get("is_filler") and d.get("scene") == sid]
        for i, d in enumerate(sc_dlgs, 1):
            _emit_dialogue_block(lines, d, i)

    cross_dlgs = [
        d for d in all_dlgs if not d.get("is_filler") and d.get("scene") == "*" and _dialogue_act_from_id(d["id"]) == act_letter
    ]
    if cross_dlgs:
        lines.append(f"## บทสรุปเชื่อมฉากใน ACT {act_letter}")
        lines.append("")
        for i, d in enumerate(cross_dlgs, 1):
            _emit_dialogue_block(lines, d, i)

    return "\n".join(lines)


def build_v55_draft_act_doc(act_letter: str, heading: str) -> str:
    act_raw = _read_json(V55_DIR / f"case-001.v5.5.{act_letter}.json", {})
    qa_raw = _read_json(V55_DIR / "case-001.v5.5.qa.json", {})
    checks_raw = _read_json(V55_DIR / "case-001.v5.5.checks.json", [])
    overrides_raw = _read_json(V55_DIR / "case-001.v5.5.overrides.json", {})

    qa_by_scene = {s.get("scene"): s.get("questions", []) for s in qa_raw.get("scenes", [])}
    checks_by_scene: dict[str, list[dict[str, Any]]] = {}
    for chk in checks_raw:
        checks_by_scene.setdefault(chk.get("scene_id", ""), []).append(chk)
    overrides_by_scene: dict[str, dict[str, Any]] = {
        ov.get("scene", ""): ov for ov in overrides_raw.get("overrides", [])
    }

    lines: list[str] = [
        f"# {heading}",
        "",
        "> สถานะ: **[v5.5 Draft — ต้นฉบับล่าสุดสำหรับอ่าน/ขัดเกลาก่อนนำเข้า `ai-dm-prototype/data/`]**  ",
        f"> อ้างอิงจาก `packages/server/scenarios/case-001/case-001.v5.5.{act_letter}.json` (+ `qa.json`, `checks.json`, `overrides.json`)",
        "",
    ]

    for sid, sc in act_raw.items():
        lines.append("---")
        lines.append("")
        lines.append(f"## {sid}: {sc.get('title', sid)}")
        lines.append("")

        dm_read = (sc.get("dmReadAloud") or "").strip()
        if dm_read:
            lines.append("### บทบรรยายหลัก (DM อ่าน)")
            lines.append("")
            lines.append(dm_read)
            lines.append("")

        npc_lines = (sc.get("npcLines") or "").strip()
        if npc_lines:
            lines.append("### บทพูด/ปฏิกิริยาตัวละคร")
            lines.append("")
            lines.append(npc_lines)
            lines.append("")

        dialogue_list = sc.get("dialogue") or []
        if dialogue_list:
            lines.append("### บทพูดสั้นที่คัดแยกแล้ว (`dialogue`)")
            lines.append("")
            for d in dialogue_list:
                lines.append(f"- `{d.get('id', '')}` — **{d.get('speaker', 'DM')}**: “{d.get('text', '')}”")
            lines.append("")

        if sid in overrides_by_scene:
            ov = overrides_by_scene[sid]
            lines.append(f"### ข้อความบังคับใช้แทนบทเก่า — Presentation Override (`{ov.get('checkId', '')}`)")
            lines.append("")
            for tier in ("full", "partial", "failure"):
                tr = (ov.get("results") or {}).get(tier) or {}
                if not tr:
                    continue
                lines.append(f"- **{tier.upper()} (DM อ่าน):** {tr.get('dmNarration', '')}")
                npc_dlg = tr.get("npcDialogue")
                if isinstance(npc_dlg, dict) and npc_dlg.get("text"):
                    lines.append(f"  - **บทพูด ({npc_dlg.get('speaker', '')}):** “{npc_dlg['text']}”")
                if tr.get("note"):
                    lines.append(f"  - _หมายเหตุ: {tr['note']}_")
            lines.append("")

        sc_checks = checks_by_scene.get(sid, [])
        if sc_checks:
            lines.append("### การ์ดทอยเต๋าในฉาก (Dice Checks)")
            lines.append("")
            for c in sc_checks:
                lines.append(f"#### `{c['id']}` — {c.get('title', '')} (`{c.get('stat', '')}` DC {c.get('dc', '')})")
                lines.append(f"- **เรียกทอยเมื่อ:** {c.get('trigger', '-')}")
                lines.append(f"- **ได้แน่ ๆ ไม่ต้องทอย:** {c.get('baseline', '-')}")
                for tier in ("full", "partial", "failure"):
                    tr = c.get(tier) or {}
                    dm_t = tr.get("dm", "-")
                    dlg_t = tr.get("dialogue", "-")
                    lines.append(f"- **{tier.upper()}:** {dm_t} | บทพูด: {dlg_t}")
                lines.append("")

        rows = qa_by_scene.get(sid, [])
        if rows:
            lines.append(f"### คู่คำถาม–คำตอบในฉาก ({len(rows)} ข้อจาก `v5.5.qa.json`)")
            lines.append("")
            for idx, q in enumerate(rows, 1):
                ans = (q.get("playerAnswer") or q.get("answer") or "").strip()
                spk = q.get("speaker") or q.get("kind") or "DM"
                lines.append(f"{idx}. **`{q.get('id', '')}` — คำถาม:** {q.get('question', '')}")
                lines.append(f"   - **ผู้ตอบ (`{spk}`):** {ans}")
                if q.get("dm_note"):
                    lines.append(f"   - _หมายเหตุ DM: {q['dm_note']}_")
            lines.append("")

        purpose = (sc.get("purpose") or "").strip()
        fallback = (sc.get("fallback") or "").strip()
        responses = (sc.get("responses") or "").strip()
        if purpose or fallback or responses:
            lines.append("<details>")
            lines.append("<summary>บันทึกกำกับสำหรับ DM และทางเลือกเสริมในฉาก</summary>")
            lines.append("")
            if purpose:
                lines.append(purpose)
                lines.append("")
            if fallback:
                lines.append("**ข้อมูลฟรี / ทางสำรอง:**")
                lines.append(fallback)
                lines.append("")
            if responses:
                lines.append("**แนวทางตอบการกระทำ:**")
                lines.append(responses)
                lines.append("")
            lines.append("</details>")
            lines.append("")

    return "\n".join(lines)


def build_07_combat_and_endings(dlg_raw: dict[str, Any], lore_raw: dict[str, Any]) -> str:
    all_dlgs = dlg_raw.get("dialogues", [])
    combat = lore_raw.get("combat_encounter", {})
    live_endings = lore_raw.get("endings", {})

    combat_dlgs = [d for d in all_dlgs if not d.get("is_filler") and d.get("scene") == "COMBAT"]
    v55_endings = _read_json(V55_DIR / "case-001.v5.5.endings.json", {})
    v55_ghost_moves = _read_json(V55_DIR / "case-001.ghost-moves-v55.json", {})
    v55_pacify = _read_json(V55_DIR / "case-001.pacify-v55.json", {})
    overrides_raw = _read_json(V55_DIR / "case-001.v5.5.overrides.json", {})

    lines: list[str] = [
        "# ฉากต่อสู้และตอนจบทั้งหมด (Combat & Endings A–D)",
        "",
        "> **ส่วน Live AI DM (`data/combat/dialogues.json`):** แก้ `style` / `text` แล้วรัน `python scripts/import_story_edits.py --apply` ได้ทันที  ",
        "> **ส่วน v5.5 Draft:** อ้างอิงท่าผี เงื่อนไขกล่อม และตอนจบ Ending A–D ฉบับสมบูรณ์",
        "",
        f"## 1. บทพูดฉากต่อสู้ AI DM (`COMBAT` — {combat.get('name', 'ผีเงาจมน้ำ')}) [Live AI DM]",
        "",
    ]
    for i, d in enumerate(combat_dlgs, 1):
        _emit_dialogue_block(lines, d, i)

    lines.extend(["---", "", "## 2. ข้อความสรุปตอนจบในหน้าจอ AI DM (Act A & Act B) [Live AI DM]", ""])
    for eid, e in live_endings.items():
        lines.append(f"- **`{eid}`** ({e.get('type', '')}) · เสียง `{e.get('audio_id', '')}`")
        lines.append(f"  - **หัวข้อ:** {e.get('title', '')}")
        lines.append(f"  - **คำอธิบายสรุป:** {e.get('summary', '')}")

    lines.extend(["", "---", "", "## 3. ท่าต่อสู้และการกล่อมวิญญาณครบชุด (`v5.5 Reference`)", ""])
    for enc_id, moves in v55_ghost_moves.items():
        lines.append(f"### ศัตรู `{enc_id}`")
        for m in moves:
            lines.append(f"- **`{m['id']}` — {m.get('name_th', '')}:** {m.get('detail', '')} (ดาเมจ {m.get('damage', 0)} {m.get('damageResource', '')})")
        if enc_id in v55_pacify:
            p = v55_pacify[enc_id]
            lines.append(f"- **การกล่อม/เรียกสติ (`pacify`):** {p.get('description', '')} → _{p.get('success', '')}_")
        lines.append("")

    lines.extend(["---", "", "## 4. ตอนจบทั้งคดี Ending A–D (`case-001.v5.5.endings.json`) [v5.5 Draft]", ""])
    for eid, e in v55_endings.items():
        lines.append(f"### Ending {eid} — {e.get('title', '')}")
        lines.append("")
        lines.append(e.get("script", ""))
        lines.append("")

    guards = overrides_raw.get("endingNarrativeGuards") or []
    if guards:
        lines.append("### ข้อควรระวังตอนจบใน v5.5 (`overrides.json`)")
        for g in guards:
            lines.append(f"- **Ending {g.get('ending', '')}:** {g.get('replacedDMPresentation', '')}")
        lines.append("")

    return "\n".join(lines)


def _find_line_idx(lines: list[str], prefix: str, start: int = 0) -> int | None:
    """Return first line index >= start whose stripped text starts with prefix."""
    for i in range(start, len(lines)):
        if lines[i].lstrip().startswith(prefix):
            return i
    return None


def _slice_lines(
    lines: list[str],
    start_prefix: str,
    end_prefixes: tuple[str, ...] = (),
    *,
    demote_headings: bool = False,
) -> str:
    """Extract markdown lines from start_prefix up to earliest matching end_prefix."""
    s_idx = _find_line_idx(lines, start_prefix)
    if s_idx is None:
        return ""
    e_idx = len(lines)
    for ep in end_prefixes:
        found = _find_line_idx(lines, ep, start=s_idx + 1)
        if found is not None and found < e_idx:
            e_idx = found
    chunk = lines[s_idx:e_idx]
    while chunk and chunk[-1].strip() in ("", "---"):
        chunk.pop()
    if demote_headings:
        chunk = [
            f"#{line}" if line.startswith("#") and not line.startswith("#####") else line
            for line in chunk
        ]
    return "\n".join(chunk).strip()


def build_00_dm_knowledge_and_backstory(lore_raw: dict[str, Any]) -> str:
    """Build DM Knowledge, backstory timeline, payoff contract, and state reference."""
    script_path = V55_DIR / "case-001.v5.5.script.md"
    raw = script_path.read_text(encoding="utf-8") if script_path.exists() else ""
    src_lines = raw.splitlines()

    backstory_truth = _slice_lines(
        src_lines,
        "## II. เหตุและผลของคดี",
        ("# บทสำหรับเล่นจริง", "## DM ONLY — Evidence Payoff Contract"),
    )
    payoff_and_motives = _slice_lines(
        src_lines,
        "## DM ONLY — Evidence Payoff Contract",
        ("## ACT A — บทฉบับล็อก",),
    )
    action_driven_rules = _slice_lines(
        src_lines,
        "# CASE 001 — v5.5 Playtest Draft",
        ("## สารบัญฉาก",),
        demote_headings=True,
    )
    state_contract = _slice_lines(
        src_lines,
        "## 🧭 เงื่อนไขสถานะของคดี",
        ("# เตรียมเกม — ความจริงและเงื่อนไขของ DM",),
    )
    state_snapshot = _slice_lines(
        src_lines,
        "# ภาคผนวก ก — State Snapshot",
        ('<a id="dice-cards"></a>', "**[วิธีอ่านผลทอย]**"),
        demote_headings=True,
    )
    state_variables = _slice_lines(
        src_lines,
        "## 7.1 สถานะที่ใช้ในคดี",
    )
    editorial_audit = _slice_lines(
        src_lines,
        "## I. ผลการตรวจต้นฉบับก่อนเกลี่ย",
        ("## II. เหตุและผลของคดี",),
    )

    live_scenes = list((lore_raw.get("scenes") or {}).keys())
    lines: list[str] = [
        f"# คู่มือ DM: ความลับ ฉากหลัง เหตุจูงใจ และโครงสร้างสถานะ — {lore_raw.get('case_title', 'CASE 001')}",
        "",
        "> **[DM ONLY — ความลับทั้งคดีและฉากหลังสำหรับผู้แต่งบท/ผู้สร้างฉาก ห้ามส่งทั้งไฟล์ให้ผู้เล่น]**  ",
        "> คัดแยกโดยตรงจากต้นฉบับหลัก `packages/server/scenarios/case-001/case-001.v5.5.script.md` เพื่อรวมเรื่องราวเบื้องหลัง ความจริงเหตุการณ์ปี 2534 เหตุจูงใจตัวละคร กฎ Action-Driven และตัวแปรสถานะทั้งหมดไว้ในจุดเดียว (โดยไม่ซ้ำซ้อนกับบทพูดใน `01_`–`06_`)",
        "",
        "### จุดเชื่อมระหว่างฉากหลัง `v5.5` กับตัวเกม `AI DM Prototype`",
        f"- **ฉากที่เปิดเล่นจริงใน AI DM (`data/act_a/`, `data/act_b/`):** {', '.join(f'`{s}`' for s in live_scenes) if live_scenes else '-'} (`A1–A3`, `B1–B3`, `COMBAT` ปรับจังหวะสำหรับเสียงพากย์และ Q&A อิสระ)",
        "- **บท C–F (`03_`–`06_`) และฉากหลังเต็มคดี:** ยึดข้อเท็จจริงและโครงสร้างตัวแปรตามเอกสารนี้ทั้งหมด เมื่อจะพัฒนาฉากหลังหรือต่อ `ACT C–F` เข้าระบบ ให้ยึดลำดับเหตุผลปี 2534, สายหลักฐาน, และ State Contract ด้านล่างเป็นแกนหลัก",
        "",
    ]

    sections = [
        backstory_truth,
        payoff_and_motives,
        action_driven_rules,
        state_contract,
        state_snapshot,
        state_variables,
        editorial_audit,
    ]
    for sec in sections:
        if sec:
            lines.extend(["---", "", sec, ""])

    if not any(sections):
        lines.extend(["---", "", "_ไม่พบไฟล์ต้นฉบับ v5.5 script ที่ `packages/server/scenarios/case-001/case-001.v5.5.script.md`_", ""])

    return "\n".join(lines)


def _merge_preserving_epilogue(generated: str, existing_path: Path) -> str:
    """Preserve section '## 5.' (e.g. Ending A Epilogue) from existing 07_combat_and_endings.md."""
    if not existing_path.exists():
        return generated
    existing = existing_path.read_text(encoding="utf-8")
    marker = "\n## 5."
    idx = existing.find(marker)
    if idx == -1:
        return generated
    # Back up to the preceding horizontal rule if present
    sep_idx = existing.rfind("\n---\n", 0, idx)
    tail_start = sep_idx if sep_idx != -1 else idx
    tail = existing[tail_start:].strip()
    if marker.strip() in generated:
        return generated
    return generated.rstrip() + "\n\n" + tail + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync live data/ and v5.5 draft scenarios into numbered story/*.md docs."
    )
    parser.add_argument(
        "--overwrite-drafts",
        action="store_true",
        help="Also overwrite 00_dm_knowledge_and_backstory.md, v5.5 draft Acts (03_-06_), and custom 07_ epilogues from v5.5 script",
    )
    args = parser.parse_args()

    STORY_DIR.mkdir(parents=True, exist_ok=True)
    for old_name in LEGACY_UNNUMBERED:
        old_path = STORY_DIR / old_name
        if old_path.exists():
            old_path.unlink()

    dlg_raw, lore_raw = load_scenario_files(DATA_DIR)
    live_act_dirs = {
        p.name.replace("act_", "").upper()
        for p in DATA_DIR.iterdir()
        if p.is_dir() and p.name.startswith("act_")
    }

    written: list[str] = []

    (STORY_DIR / "00_characters_and_voices.md").write_text(
        build_00_characters_and_voices(dlg_raw, lore_raw), encoding="utf-8"
    )
    written.append("00_characters_and_voices.md")

    dm_path = STORY_DIR / "00_dm_knowledge_and_backstory.md"
    if args.overwrite_drafts or not dm_path.exists():
        dm_path.write_text(build_00_dm_knowledge_and_backstory(lore_raw), encoding="utf-8")
        written.append("00_dm_knowledge_and_backstory.md")

    for act_letter, filename, heading in ACT_META:
        target_path = STORY_DIR / filename
        if act_letter in live_act_dirs:
            content = build_live_act_doc(act_letter, heading, dlg_raw, lore_raw)
            target_path.write_text(content, encoding="utf-8")
            written.append(filename)
        elif args.overwrite_drafts or not target_path.exists():
            content = build_v55_draft_act_doc(act_letter, heading)
            target_path.write_text(content, encoding="utf-8")
            written.append(filename)

    endings_path = STORY_DIR / "07_combat_and_endings.md"
    endings_content = build_07_combat_and_endings(dlg_raw, lore_raw)
    if not args.overwrite_drafts:
        endings_content = _merge_preserving_epilogue(endings_content, endings_path)
    endings_path.write_text(endings_content, encoding="utf-8")
    written.append("07_combat_and_endings.md")

    print("Synced story workspace:", ", ".join(written))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
