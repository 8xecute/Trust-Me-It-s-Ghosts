"""Pydantic schemas for Gemini Structured Outputs and room state."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class StateUpdates(BaseModel):
    """Allowed game state deltas proposed by the AI DM."""

    current_scene: Optional[str] = Field(
        default=None,
        description="รหัสฉากถัดไป (เช่น 'A2', 'A3' หรือ 'B1', 'B2', 'B3') เฉพาะเมื่อผู้เล่นขยับจุดหรือเงื่อนไขเนื้อเรื่องถึงจุดเปลี่ยนฉากจริงเท่านั้น",
    )
    add_inventory: list[str] = Field(
        default_factory=list,
        description="รหัสไอเท็มที่ผู้เล่นได้รับในเทิร์นนี้ (ต้องอยู่ใน allowed_items ของฉาก)",
    )
    add_clues: list[str] = Field(
        default_factory=list,
        description="รหัสเบาะแสที่ผู้เล่นค้นพบในเทิร์นนี้ (ต้องอยู่ใน allowed_clues ของฉาก)",
    )
    npc_trust_delta: int = Field(
        default=0,
        description="การเปลี่ยนแปลงความไว้วางใจของ NPC (-1, 0, หรือ +1)",
    )
    npc_trust_target: Optional[str] = Field(
        default=None,
        description="ชื่อ NPC ที่ได้รับผล npc_trust_delta (เช่น 'ประเสริฐ', 'วิชัย', 'ต้น')",
    )
    board_node: Optional[str] = Field(
        default=None,
        description="รหัสจุดบนกระดานแผนที่หากทีมย้ายตำแหน่งในเทิร์นนี้",
    )
    ending_triggered: Optional[Literal["act_a_complete", "act_a_combat_clear", "lost_in_grove", "act_b_complete"]] = Field(
        default=None,
        description="รหัสตอนจบหากเงื่อนไขจบบท (ACT A หรือ ACT B) ครบถ้วนแล้ว",
    )


class DMDecision(BaseModel):
    """Strict structured response returned by Gemini DM Decision Engine."""

    mode: Literal["script", "improvise"] = Field(
        description="ใช้ 'script' เมื่อมีบทใน dialogues.json ที่ตรงกับคำถาม/การกระทำ หรือ 'improvise' เฉพาะเมื่อผู้เล่นถามนอกบท"
    )
    character: str = Field(
        description="ชื่อตัวละครที่พูดในเทิร์นนี้ เช่น 'DM', 'ประเสริฐ' (เฉพาะ ACT A), 'วิชัย' (ACT B), 'ต้น' (ACT B), หรือ 'เสียงวิทยุ'"
    )
    selected_audio_id: Optional[str] = Field(
        default=None,
        description="รหัสบทพูดจาก dialogues.json เมื่อ mode == 'script' เท่านั้น มิฉะนั้นเป็น null",
    )
    filler_audio_id: Optional[str] = Field(
        default=None,
        description="รหัสเสียงคั่นเวลา (is_filler=true) 1-2 วินาที เมื่อ mode == 'improvise'",
    )
    improvised_text: Optional[str] = Field(
        default=None,
        description="บทพูดภาษาไทยสั้น ๆ 1-2 ประโยคตามบุคลิกตัวละครและกฎกันสปอยล์ เมื่อ mode == 'improvise' เท่านั้น",
    )
    requested_check_id: Optional[str] = Field(
        default=None,
        description="รหัส Dice Check จากฉากปัจจุบัน เฉพาะเมื่อผู้เล่นระบุการกระทำที่ตรงเงื่อนไขทอยและยังไม่เคยทอยมาก่อน",
    )
    state_updates: StateUpdates = Field(
        default_factory=StateUpdates,
        description="การอัปเดตสถานะเกมที่อนุญาตในฉากนี้",
    )
    reason: Optional[str] = Field(
        default=None,
        description="เหตุผลสั้น ๆ สำหรับบันทึกภายใน (ไม่แสดงให้ผู้เล่นเห็น)",
    )


class GhostTurnDecision(BaseModel):
    """Strict structured tactical move returned by Gemini Tactical Ghost AI."""

    move_id: Literal["WET_CLAW", "UNDERFLOOR_HAND", "DROWNED_WHISPER"] = Field(
        description="รหัสท่าโจมตีของผีเงาจมน้ำจากรายการท่าที่ใช้ได้"
    )
    target_player_id: str = Field(
        description="player_id ของผู้เล่นที่มีสติอยู่ซึ่งผีเลือกโจมตี"
    )
    use_live_taunt: bool = Field(
        default=False,
        description="ตั้งเป็น true เฉพาะจังหวะดราม่าที่อยากให้ผีพูดเยาะเย้ยผู้เล่นเป้าหมายสด ๆ",
    )
    ghost_taunt: Optional[str] = Field(
        default=None,
        description="คำพูดหลอนสั้น ๆ 1 ประโยคของผีเงาจมน้ำ (ใช้เมื่อ use_live_taunt == true)",
    )
    narration_th: str = Field(
        description="คำบรรยายสั้น ๆ 1 ประโยคภาษาไทยว่าผีจู่โจมเป้าหมายอย่างไร"
    )
