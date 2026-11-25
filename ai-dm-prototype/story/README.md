# ศูนย์รวมเนื้อเรื่องและบทพูด — CASE 001 (ทุกบท A–F)

โฟลเดอร์ `story/` นี้ออกแบบให้ **คนเขียนบท / ผู้ขัดเกลาสำนวน** เปิดอ่านและแก้เนื้อเรื่องได้ครบทั้งคดี (ACT A จนถึง Final F และตอนจบ Ending A–D) โดยไม่ต้องไล่เปิดไฟล์ JSON เอง

---

## สารบัญไฟล์บทพูดทั้งหมด (`00_` ถึง `07_`)

| ไฟล์ | เนื้อหา | สถานะในระบบ AI DM | แก้แล้วซิงก์กลับเข้าเกมได้ไหม? |
| :--- | :--- | :--- | :--- |
| [00_characters_and_voices.md](00_characters_and_voices.md) | โปรไฟล์เสียง 11 ตัว, อาชีพ 6 สาย, เสียงคั่น `fillers` (7), เบาะแส & ไอเท็ม | `[Live AI DM]` | **ซิงก์ได้** (`fillers`) |
| [00_dm_knowledge_and_backstory.md](00_dm_knowledge_and_backstory.md) | **DM Knowledge & ฉากหลังทั้งคดี**: เหตุการณ์ปี 2534, ความลับแม่แก้ว/วิชัย/คนหาย 3 คน, Evidence Payoff, กฎ Action-Driven และ State Contract | `[v5.5 DM Only]` | ใช้อ้างอิงแต่งฉากหลังและคุมความต่อเนื่องทั้งคดี |
| [01_act_a_script.md](01_act_a_script.md) | **ACT A** (`A1–A3`): ศาลาริมทาง, วิทยุรถตู้, หน้าบ้านผู้ใหญ่บ้าน | `[Live AI DM]` | **ซิงก์ได้อัตโนมัติ** (36 บทเดิม + 1 บทใหม่) |
| [02_act_b_script.md](02_act_b_script.md) | **ACT B** (`B1–B3`): ห้องรับแขก, วิชัย, ต้นที่ชานบ้าน, ภาพปี 2534 | `[Live AI DM]` | **ซิงก์ได้อัตโนมัติ** (36 บทเดิม + 2 บทใหม่) |
| [03_act_c_script.md](03_act_c_script.md) | **ACT C** (`C1–C5`): บ้านดล, สมุดบันทึก, เคาะสามครั้ง, ยายบุญมี | `[v5.5 Draft]` | อ่าน/ขัดเกลาก่อนนำเข้า `data/act_c/` |
| [04_act_d_script.md](04_act_d_script.md) | **ACT D** (`D1–D5`): เข้าสวนกล้วย, ศาลด้ายดำ, แม่แก้ว, รอยล้อ | `[v5.5 Draft]` | อ่าน/ขัดเกลาก่อนนำเข้า `data/act_d/` |
| [05_act_e_script.md](05_act_e_script.md) | **ACT E & H1** (`E1–E6`, `H1`): เรือนไม้ร้าง, ตัวประกัน, กำไล, วิชัย (+ Overrides) | `[v5.5 Draft]` | อ่าน/ขัดเกลาก่อนนำเข้า `data/act_e/` |
| [06_act_f_final_script.md](06_act_f_final_script.md) | **ACT F** (`F1–F6`): เผชิญหน้าแม่แก้ว, วงป้องกัน 3 ขั้น, ปิดพิธี | `[v5.5 Draft]` | อ่าน/ขัดเกลาก่อนนำเข้า `data/act_f/` |
| [07_combat_and_endings.md](07_combat_and_endings.md) | บทพูดต่อสู้ AI DM (8 บท) + ท่าผี v5.5 + ตอนจบ Ending A–D | `[Live + v5.5]` | **ซิงก์ได้** (`combat` 8 บท) |

---

## วิธีทำงานสำหรับคนขัดเกลาบทพูด

### กรณีแก้บทที่เปิดเล่นใน AI DM แล้ว (`00_characters_and_voices.md`, `01_`, `02_`, และ Combat ใน `07_`)
1. เปิดแก้ข้อความในไฟล์ Markdown ตรงบรรทัด `สไตล์เสียง (style)` หรือ `บทพูด (text)` **โดยคงรหัส `id` หลังเลขข้อไว้เหมือนเดิม** (เช่น `a1_prasert_greet`, `b2_check_soc_full`)
2. ตรวจสอบความเปลี่ยนแปลงก่อนบันทึกจริง (Dry-run):
   ```powershell
   ai-dm-prototype\.venv\Scripts\python.exe ai-dm-prototype\scripts\import_story_edits.py
   ```
3. บันทึกกลับเข้าไฟล์ `data/*.json` อัตโนมัติ:
   ```powershell
   ai-dm-prototype\.venv\Scripts\python.exe ai-dm-prototype\scripts\import_story_edits.py --apply
   ```
4. สคริปต์จะพิมพ์คำสั่ง `generate_audio.py --id <id> --overwrite` เฉพาะบรรทัดที่แก้ เพื่อเจนเสียงพากย์ใหม่เฉพาะประโยคนั้น ไม่เปลืองโควต้า
5. สำหรับ 3 `id` ที่เพิ่มเข้ามาใหม่ (`a1_qa_missing_who`, `b2_qa_ton_friends`, `b3_wichai_stay_behind`) ให้ลงทะเบียน entry ลงใน `data/act_a/dialogues.json` และ `data/act_b/dialogues.json` ก่อนรัน `generate_audio.py`

### กรณีแก้ใน JSON โดยตรง หรือเพิ่ม ACT C–F ใหม่
- ถ้าแก้ `data/*.json` โดยตรง รันคำสั่งนี้เพื่อให้ `story/*.md` อัปเดตตรงกันเสมอ:
  ```powershell
  ai-dm-prototype\.venv\Scripts\python.exe ai-dm-prototype\scripts\sync_story_docs.py
  ```
- เมื่อขัดเกลา `03_act_c_script.md` ... `06_act_f_final_script.md` เสร็จแล้ว สามารถแปลงสร้างโฟลเดอร์ `data/act_c/` (`lore.json` + `dialogues.json`) ตามรูปแบบ `data/act_b/` แล้วระบบเกม + `sync_story_docs.py` + `generate_audio.py` จะมองเห็นและยกระดับเป็น `[Live AI DM]` ให้อัตโนมัติครับ
