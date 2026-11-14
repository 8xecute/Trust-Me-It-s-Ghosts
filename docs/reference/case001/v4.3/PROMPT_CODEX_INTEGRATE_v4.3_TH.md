# Prompt สำหรับ Codex — อัปเดต CASE 001 v4.3 ในเกม TRPG เดิม

โปรเจกต์คือ **บริษัท เรื่องผีไว้ใจผม จำกัด (Trust Me, It’s Ghosts Co., Ltd.)** ฉันแนบโฟลเดอร์ `CASE001_StoryPack_v4.3_GuidedLinear` แล้ว

**วัตถุประสงค์:** นำเนื้อเรื่อง **CASE 001 Story Script v4.3 Guided Linear Investigation** เข้าเกม TRPG ออนไลน์ที่มีอยู่แล้ว โดยปรับเฉพาะระบบ Scene/Dialogue/Investigation/Journal/Hint/Transition ที่จำเป็น **ไม่สร้างเกมใหม่และไม่เปลี่ยนรูปแบบควบคุมเดิม**

## อ่านก่อนแก้

1. อ่าน `README_START_HERE.md`, `01_DM_QUICK_PLAYBOOK_v4.3.md`, `CASE001_StoryScript_v4.3.md`, `02_PHASE_HANDOFFS_v4.3.md`
2. อ่าน `data/CASE001_StoryFlow_v4.3.json`, `data/CASE001_DiceChecks_v4.3.json`, `data/CASE001_GuidedScenes_v4.3.json`
3. ตรวจโค้ด Scene Engine, Dice, Dialogue, State Persistence, Multiplayer และ UI/UX ปัจจุบันก่อนตัดสินใจว่าจะ map ข้อมูลเข้าจุดไหน
4. รายงานข้อขัดแย้งกับโค้ดเดิมและแผน Migration สั้น ๆ ก่อนแก้โค้ด

## กฎที่ต้องทำงานจริง

- ดำเนินบทหลัก A→B→C→D→E→FINAL→ENDING โดย **เมื่อทีมยืนยันออกจากบทแล้วห้ามย้อนกลับไปบทก่อนเพื่อถาม NPC ที่พลาด**; ในบทเดียวกันสำรวจ/ถามฉากย่อยได้ยืดหยุ่น
- ไม่ทำ invisible wall แบบไม่สมเหตุสมผล; ปิดบทเป็นการ commit ของ session และให้เหตุการณ์ในบทใหม่พาไปต่อ
- ก่อนเสนอหัวข้อถาม ต้องแสดง DM cue ที่ผู้เล่นสังเกตได้จริง; เสนอหัวข้อสงสัยไม่เกิน 3 และเปิดให้ถามอิสระ
- การถามอิสระต้อง route ไปยังคำถาม/ความรู้ของ NPC โดยไม่ให้ NPC แต่งความจริงเกินข้อมูลในสคริปต์
- 16 Dice checks คง Full/Partial/Failure ตาม JSON เดิม; ทอยเมื่อผู้เล่นเลือก Action ที่เข้า Trigger เท่านั้น; ตรวจ bypass จากหลักฐานหรือความปลอดภัยก่อนทอย
- D20 Failure ไม่ปิดทางหลัก และห้ามย้อนบท: ใช้ Forward Clue Recovery ผ่านหลักฐาน/พยานที่มีอยู่ในบทถัดไป เช่น C2, C5, D2, D5, E3, E4
- Hint System 3 ระดับต่อบท: สะกิด > ชี้จุด > แนะ Action; ให้เมื่อผู้เล่นกดขอหรือมีความติดขัดจริง อย่าเฉลย DM secret
- เมื่อเปลี่ยนบท แสดง Journal 3 ส่วน: `known_facts`, `open_questions`, `next_destination_rationale` ซึ่งสร้างจากสิ่งที่ทีมรู้อยู่จริง; ให้เลือกสำรวจต่อหรือยืนยันไปต่อ; เก็บ Journal ผ่าน Save/Load
- H1 เป็น informational reveal จากหลักฐานที่มี ไม่ใช่การย้อนฉาก: ประเสริฐกล่าวสารภาพเฉพาะเมื่ออยู่ในจุดที่พบจริงหรือมีช่องทางสื่อสารสมเหตุสมผล
- E2 และ E4 ทำก่อนหลังได้ในบท E, `HOSTAGES_FOUND` ไม่เท่ากับ `HOSTAGES_SAFE`; ถ้าปิดบทก่อนช่วย ให้เก็บผลจริง
- Combat ยึด **Combat Lite v1.1**; คงตัวละคร 6 อาชีพ / Universal v1.3; ไม่บังคับสู้ C4, D4, Final; ถ้าแม่แก้วถูกสลาย D แล้วไม่ฟื้นทันห้าม spawn บอสเพียงเพื่อครบบท
- State authoritative ฝั่ง Multiplayer ต้อง sync ครั้งเดียว, replay/rejoin ห้ามทอยหรือเปิดบทซ้ำ, ไม่มีการ Deploy/Push โดยอัตโนมัติ

## วิธีดำเนินการ

1. Mapping: โครงสร้าง JSON มาเป็น Scene/NPC/UI components ที่มีอยู่; บันทึกความแตกต่างก่อนเปลี่ยน
2. Data import: โหลด Story v4.3 และ 16 Checks โดยไม่ทำลายฉบับ v4.2 ที่มีอยู่; มี versioned migration/fallback หากจำเป็น
3. UI guidance: Cue ก่อน prompt, Free text question, Hint tiers, Journal, Exit confirm ใช้ดีไซน์เกมเดิม
4. Routing: phase monotonic, chapter-local exploration, no old-phase revisit, forward clue recovery, H1 overlay
5. Validation: ทดสอบทุกข้อจาก `PLAYTEST_GUIDED_LINEAR_v4.3.md`, เพิ่ม automated tests สำหรับ state/roll/journal/routing และ QA manual path
6. รายงานภาษาไทย: ไฟล์ที่แก้, สิ่งที่ใช้ได้, ผลทดสอบ, ประเด็นยังไม่ตัดสินใจ, การรักษาข้อมูลเดิม

**ข้อห้าม:** ไม่เปลี่ยนผู้ลักพาตัว (วิชัย), ไม่เพิ่มผีตัวใหม่, ไม่แก้ประวัติน้ำท่วมเป็นปิดประตู, ไม่ให้ยายรู้เรื่องที่ไม่เคยเห็น, ไม่ทำให้วิชัยวาร์ป, ไม่บังคับสู้ทุกครั้ง, ไม่แก้ค่าสแตต/ท่าอาชีพเดิม, ไม่เขียนบทพูดใหม่แทนฉบับเต็มโดยพลการ.
