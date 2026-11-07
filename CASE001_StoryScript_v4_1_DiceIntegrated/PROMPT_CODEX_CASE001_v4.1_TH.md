# Prompt สำหรับ Codex — CASE 001 Story Script v4.1

ช่วยตรวจโปรเจกต์เกม **บริษัท เรื่องผีไว้ใจผม จำกัด** และรวมเนื้อเรื่อง CASE 001 แบบ Dice-Integrated Dialogue v4.1 เข้ากับระบบ Scripted DM เดิม โดยใช้ไฟล์ในโฟลเดอร์นี้:

- `README_START_HERE.md`
- `CASE001_StoryScript_v4.1.md` (source of truth: บทพูดและเนื้อเรื่อง)
- `CASE001_StoryFlow_v4.1.json` (scene/state metadata)
- `CASE001_DiceChecks_v4.1.json` (check trigger/outcome data)
- `CHANGELOG_v4.1.md`

**ทำตามลำดับ:**
1. สำรวจ repo จริงก่อนและรายงาน model ของ Scene, Dialogue, Roll, State, Multiplayer, Save/Load ที่ใช้ในปัจจุบัน; ตรวจ conflict กับ Universal Core v1.3 และ Combat Lite v1.1 ก่อนแก้
2. Map scene IDs (A2, B2, B3, B4, C2, C3, C4, C5, D2, D3, D5, E3, E4, E5, H1, F5) และ check IDs ทั้ง 16 โดยรักษา scene behavior เดิม
3. เพิ่มตัวเลือก Full/Partial/Failure **เฉพาะเมื่อผู้เล่นขอ Action และ trigger ตรง**; Bypass แล้วไม่ทอย. แสดง NPC response เฉพาะผลเดียว; ห้ามบังคับทอยตอนเข้าฉาก
4. ข้อเท็จจริงพื้นฐานและคำให้การที่รับรองไว้ต้องไม่ถูกล็อกโดยการทอย; ล้มเหลวต้องไม่ทำเนื้อเรื่องตัน. ไม่ให้ NPC รู้สิ่งที่เขาไม่รู้จริง และไม่มีการสุ่มผลคลี่คลายคดีจากเต๋าทอยครั้งเดียว
5. D20 + 6 core stats (BODY/PER/INT/SOC/SPI/RES), DC11/14/17, Partial = DC−3..DC−1, Full ≥ DC; no automatic natural20/natural1 effects. Combat attack rolls ยังไม่มี Partial
6. เชื่อม `CHECK_RESULTS`, `CLUE_LEVELS`, `RITUAL_PLAN`, `WICHAI_COOPERATING` เข้ากับ state model เดิมโดยไม่ทำลายข้อมูลเดิม; หากมีชื่อ state ที่เทียบกันได้ให้ใช้การ map ไม่สร้างซ้ำ
7. รองรับ Team 2–4, ท่าตัวละคร v1.1, Save/Load และ Multiplayer: ทอยครั้งเดียวต่อ attempt (authoritative), ไม่ broadcast ผลลัพธ์ที่ยังควรเป็น DM secret และไม่บวก AP/Focus ซ้ำ
8. เพิ่ม automated checks: ข้ามผลทอยเมื่อ bypass, failure ยังคง baseline clues, Full ไม่ทำให้ NPC เปิดเผยความลับเกินสิ่งที่รู้, ไม่สามารถลดระดับ clue, ตัวละครบางอาชีพไม่ถูกล็อกทางจบคดี, วิชัยไม่วาร์ปเมื่อถูกจับ, แม่แก้วมีตัวตนหลังร่างสลาย
9. สรุปไฟล์ที่แก้ การทดสอบที่รันและผลจริง จุด unresolved และตัวอย่างเล่นผ่าน B3/C4/D3/E4/F5 ทั้งสามผลให้ดู

**ข้อห้าม:** ห้ามเปลี่ยนเนื้อเรื่องแกน, เพิ่มผีเล็กใหม่, เพิ่ม Skill/Proficiency/Talent Tree, เขียนทับ Character presets, Deploy/Push อัตโนมัติ หรือแอบแก้กฎเมื่อพบ conflict. หาก schema ที่แนบต่างจากใน repo ให้เสนอแนวทาง mapping โดยไม่ทำลายข้อมูล
