# Prompt 2 — ลงมืออัปเดต Combat Lite v1.1 ใน Codex (คัดลอกไป Codex)

ให้อัปเดตโปรเจกต์เกม **บริษัท เรื่องผีไว้ใจผม จำกัด (Trust Me, It’s Ghosts Co., Ltd.)** เป็น **Combat Lite v1.1** สำหรับ 2–4 ผู้เล่น ตามไฟล์ใน `TRUST_ME_GHOSTS_CombatLite_v1_1_CodexPack/` ที่แนบมานี้. ตัวเลขใหม่ให้ถือเป็น Playtest Config และทำให้ปรับได้.

**ก่อนเริ่มเขียน:** ตรวจ repository และอ่าน `00_README_START_HERE.md`, กฎ `01_COMBAT_LITE_RULES_v1_1.md`, scaling `02_ENEMY_DESIGN_AND_SCALING.md`, mapping `03_COMPATIBILITY_AND_MIGRATION.md`, adapter `04_CASE001_COMBAT_ADAPTER.md`, checklist `05_PLAYTEST_AND_ACCEPTANCE.md`, `data/*.json` รวมทั้ง `reference/` ทุกชุด. รายงานไฟล์ที่จะเปลี่ยนและการขัดแย้งที่พบก่อนลงมือในคำตอบของคุณ แล้วดำเนินการแก้ตามขั้นตอนภายในงานนี้หากไม่มี blocker ที่เสี่ยงทำข้อมูลสูญหาย.

## Implementation Requirements

1. **Preserve 6 classes as-is**: `BODY/PER/INT/SOC/SPI/RES`, ทุกอาชีพมี HP10, Sanity10, Focus4, AP3 และ 18 ท่า/6 อาชีพตาม Character v1.1. ไม่มี Skill/Proficiency/Talent Tree ใหม่.
2. **Combat Lite core**: Initiative D20+PER (ผี D20+INIT), PDEF=10+BODY, MDEF=10+RES; basic attack 2 AP; move 4 tiles/1 AP; Guard 1 AP +2 Defense ต่อ hit ถัดไป; 1 Reaction/round; D20 hit roll ครั้งเดียวไม่ทอย damage ซ้ำ; no automatic crit.
3. **Hit & damage**: physical vs PDEF, Sanity attack vs MDEF; HP/Sanity แยก; condition หลัก ROOTED/DOWNED/OVERWHELMED; Focus0 ยังใช้ Action/Passive ไม่เสีย Focus ได้; reduction/Reaction ตามสเปกและท่าต้นฉบับ.
4. **Spirit manifestation**: MANIFESTED vs INCORPOREAL เท่านั้น. Attack ทางกายภาพธรรมดาไม่โดนผีไร้ร่าง; ต้องมีทางเลือกไม่สู้/จัดการ Anchor/ไอเท็มที่ถูกต้อง. HP0 ของแม่แก้วที่ D = temporary dispersion ไม่ใช่ soul death.
5. **Enemy data + scaling**: ใช้ `data/case001_enemies_v1_1.json` เป็น design reference แล้วสร้าง adapter เข้าสู่ schema repo จริง. HP ghost = ceil(baseHP*partySize/2), party 2–4. ไม่ scale ATK/Defense/Damage และไม่ scale มนุษย์วิชัย.
6. **Boss Hazard**: 2 คน 1 จุดทุก 3 รอบ; 3 คน 1 จุดทุก 2 รอบ; 4 คน 2 จุดทุกรอบ; ต้อง telegraph ให้ผู้เล่นแต่ละคนมีเทิร์นรับมือหนึ่งครั้งก่อน resolve ที่ต้นบอสเทิร์นถัดไป; ร่วมกับ main attack 1 ครั้ง/บอสเทิร์น ไม่ stack damage ของพื้นที่ซ้อน.
7. **Rest compatibility**: ใช้ Short Rest 30m (+2 Focus,+1 Sanity; 1/Adventuring Day) และ Long Rest 6–8h (Focus เต็ม,+2HP,+2Sanity, Fatigue−1), **ไม่ใช้ Regroup 10m** ใน Combat Lite; worldTime และ state คงข้าม session/วัน.
8. **CASE 001**: integrate IDs C4/D3/D4/E5/F1–F6. ผีเงาจมน้ำเพียงหนึ่งตัวใน C, แม่แก้ว D/Final, วิชัยมนุษย์ไม่ scale. เมื่อแพ้ที่ D แม่แก้วยังกลับมาได้หากมีเงื่อนไข; Final HP ลดเหลือ 75% หากฟื้นไม่เต็ม. ห้าม force spawn หรือบังคับต่อสู้; ไม่เปลี่ยนบทพูด/กติกาน้ำท่วม/พิธีเดียว/ความจริง NPC.
9. **รักษา Multiplayer & Persistence**: ให้ combat rolls/turn/state เป็น authoritative ตามสถาปัตยกรรม repo จริง; ตรวจ reconnect/sync/save schema, feature toggle และรองรับ save เก่าด้วย migration ที่ไม่ทำลายข้อมูล.
10. **Testing**: unit + integration ตาม `05_PLAYTEST_AND_ACCEPTANCE.md` รวมทีม 2/3/4, HP/defense, action economy, Reaction, Focus0, no forced boss, 03:00 และการกลับมาหลัง session. ถ้ามีข้อสอบเดิม ให้รันและรายงานผล.

## ข้อจำกัดการแก้ไข

- ห้ามแก้ `reference/` หรือเขียนทับต้นฉบับ CASE001/Character; ห้ามแก้ live data หรือ deploy/push อัตโนมัติ.
- หาก schema เดิมไม่ตรง ใช้ adapters/migrations; ไม่เปลี่ยนชื่อ key สำคัญโดยไม่มี backward compatibility.
- ถ้าแผนต้องเปลี่ยนระบบ multiplayer, security, save schema แบบเสี่ยงสูญข้อมูล ให้หยุดส่วนเสี่ยงนั้นและเสนอทางเลือกแทน; ยังดำเนินงานส่วนที่ปลอดภัยได้.
- ถ้าต้องเพิ่มข้อมูลที่ยัง TBD ให้แยกเป็น config/rule flag ที่ปิดโดยค่าเริ่มต้น ไม่แต่งเป็นกฎถาวร.

เมื่อเสร็จ รายงานเป็นภาษาไทย: รายการไฟล์ที่เพิ่ม/แก้, กฎที่ implemented vs pending, migration, commands/tests และผลทดสอบจริง, edge cases, ข้อจำกัด, วิธีเปิดใช้/ปิดใช้ Combat Lite, สิ่งที่ต้องให้ฉันตัดสินใจต่อ โดยไม่อ้างว่าผ่าน Playtest ผู้เล่นจริงถ้ายังไม่ได้ทดสอบ.
