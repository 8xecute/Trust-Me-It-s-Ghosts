# CASE 001 — Dice-Integrated Story Pack v4.1

## ใช้ไฟล์ไหน

1. `CASE001_StoryScript_v4.1.md` — **เนื้อเรื่องเต็มฉบับหลัก** (บท v4.0 คงเดิม พร้อมบทรองรับ Full / Partial / Failure เพิ่มในทุกจุดที่เกี่ยวข้อง)
2. `CASE001_StoryFlow_v4.1.json` — โครงเรื่องเดิม + reference `investigation_checks` ตามฉาก + state ใหม่ที่จำเป็น
3. `CASE001_DiceChecks_v4.1.json` — 16 จุดทอยที่ใช้กับ Scripted DM; ระบุ trigger, bypass, ข้อมูลพื้นฐาน, ผล 3 ระดับ, บทพูด, เงื่อนไข state และ fallback
4. `PROMPT_CODEX_CASE001_v4.1_TH.md` — Prompt สำหรับ Codex ตรวจงานและเชื่อมข้อมูลเข้ากับโค้ดเดิม
5. `CHANGELOG_v4.1.md` — บันทึกสิ่งที่เปลี่ยนเทียบ v4.0

## ขอบเขต

- ไม่เปลี่ยนแกนเรื่อง A–Final, NPC 8 ตัว, ตัวประกัน 3 คน, ศัตรูผี 2 ตัว (ผีเงาจมน้ำ / แม่แก้ว), พิธีเดียว และ 4 Ending
- Check ข้อมูล **ไม่ใช่ทุก Action**: มี 16 optional checks, ซึ่งเรียกเมื่อผู้เล่นเลือกทำตาม trigger เท่านั้น. A2=1, B=3, C=4, D=3, E=3, H1=1, F5=1
- `DC 11 / 14 / 17`, Full ≥ DC, Partial ที่ DC−1 ถึง DC−3, Failure ที่ต่ำกว่า DC ตั้งแต่ 4. ไม่มี auto success/failure จากหน้าเต๋า
- การต่อสู้ใช้ Combat Lite v1.1 แยกจากการสืบสวน; D4/E2/Final ยังมี physical/ritual actions ตามระบบเดิม
- แหล่งความจริงด้านบทพูดคือ Markdown; JSON ช่วย Map และทดสอบ ไม่ใช่คำสั่งเปลี่ยนโค้ดเอง

## สถานะ

Playtest Draft — ยังไม่อนุมัติให้ปรับโค้ดโดยอัตโนมัติ หาก Codex พบ conflicts ให้แสดงความแตกต่างก่อน
