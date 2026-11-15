# CASE002 — งานวัดคืนที่แปด


**อัปเดต D05 และภาพ:** ผู้ใช้เลือกทางหยุดภัยถาวรหลังสังเวยแล้ว ดู [แบบจุดยึดไม้ครู](CASE002_FINAL_Anchor_Design.md) และ [ชุดภาพ/แกลเลอรี](CASE002_Artwork.md) จุดยึด+ร่างที่หยุดจริงทำให้จบ C ได้หลังสังเวย ไม่บังคับ D เพียงเพราะ completed ส่วนค่ามนุษย์/ศัตรู การตาย DC/Action และ Resolver ยังต้องล็อกก่อน runtime

ชุดพัฒนาเรื่องและแบบเชื่อมเกม Draft 0.1 · 15 พฤศจิกายน 2026 · **เอกสาร DM ONLY**

**สถานะ:** ตรวจ Repository แล้ว จัดบท A–FINAL และข้อเสนอ Contract เพื่อทบทวน มีภาพคดีใหม่แล้ว 16 ภาพที่เลือกใช้; ยังไม่มี CASE002 runtime, case selector หรือผล user playtest ยังไม่เปิดให้เล่น และไม่ได้ commit/push/deploy

**มติล่าสุด:** ผู้ใช้เลือก D01-B ฐาน v5.5 (HP15/หนึ่ง Action จบตา) และ D02-C ทอยป้องกัน D20+BODY/RES แทนฐาน 10 ใช้ 0 AP/Focus1/1 Reaction เลือกก่อนรู้ผลโจมตีแล้วทอยหลังเฉลยตัวตน อนุมัติแบบกติกาแล้วแต่ยังไม่เชื่อม runtime D05 เลือกทางหยุดภัยถาวรหลังสังเวยแล้ว; รายละเอียดไม้ครู/จุดยึดอยู่ใน CASE002_FINAL_Anchor_Design.md ส่วน D03/D04/D06/D07 ยังเปิดอยู่

## เริ่มอ่าน

1. [StoryScript ฉบับเต็ม](CASE002_StoryScript_Draft.md) — 25 ฉาก บทอ่าน Q&A, evidence chain, fail-forward และ FINAL ที่แยกก่อน/หลังสังเวย
2. [รายการตัดสินใจ D01–D07](CASE002_Open_Design_Decisions.md) — เลือกกฎฐาน การป้องกัน การตาย/ค่ามนุษย์ ศัตรู FINAL, Ending priority และ DC ก่อนเปิด combat
3. [คู่มือ DM](CASE002_DM_Runbook.md) — ขอบเขตข้อมูลก่อน ตามด้วยสิ่งที่บันทึกและแนวสวมบท

## ไฟล์ประกอบ

| ไฟล์ | ใช้ทำอะไร | สถานะ |
| --- | --- | --- |
| [Master Spec v1.0](CASE002_Master_Spec_v1.0.md) | สำเนาข้อกำหนดผู้ใช้ ไม่แก้เนื้อหา | Source |
| [Repository Audit](CASE002_Repository_Audit.md) | หลักฐานระบบจริง สิ่งใช้ซ้ำ/ขาด และข้อขัดแย้งกฎ | Phase 0 |
| [Dice Cards](CASE002_Dice_Cards.json) | จุดตรวจเสนอ 8 ใบ; active `dc:null`; ตัวเลขเสนออ้าง Core | Phase 2 draft |
| [State/Trigger Contract](CASE002_State_Trigger_Contract.json) | State default, writers, recipients, split/attack/death/sacrifice, Ending draft | Design only |
| [DM Presentation Contract](CASE002_DM_Presentation_Contract.json) | ลำดับเปิดข้อมูล NPC knowledge, opaque perceived targets, private views | Design only |
| [QA/Playtest](CASE002_QA_Playtest.md) | Acceptance 20 ข้อและ boundary/network/save cases | CASE002 ยังไม่รัน |
| [Compatibility/Regression](CASE002_Compatibility_Regression.md) | แผนแยกคดี/เซฟ/มุมมองและผลตรวจ CASE001 ณ เวลารัน | Plan + baseline |
| [Static Validation](CASE002_Static_Validation.json) | ผลตรวจความครบของเอกสาร/JSON/ID/ลิงก์ | ไม่ใช่ผล runtime |

StoryScript ใช้ต้นแบบไฟล์จริง `docs/reference/case001/v5.5/CASE001_v5.5_ACTF_3Step_Shield_StoryScript_Playtest.md` ซึ่งใน repo ไม่มี suffix `(3)` ตามชื่ออ้างอิงที่ผู้ใช้วางมา รูปแบบเอกสารเป็นต้นแบบเท่านั้น ไม่คัดลอกพล็อต/State/QA/ending ของ CASE001

## เหตุที่ยังไม่เปิด runtime

เอกสาร v1.1 ใช้ HP10/AP3/ความสามารถเดิม แต่ v5.5 ปัจจุบันปรับ HP15 และเลือกหนึ่ง Action จบตา การเปลี่ยนนี้มีบันทึกว่าเจตนาปรับสมดุล จึงห้ามแก้กลับทั้งเกมโดยอัตโนมัติ นอกจากนี้ไม่มี Active Defense Roll หรือ generic lethal resolver และยังไม่มีค่าต่อสู้ของอิง/ประยูรหรือ Enemy Preset ของ CASE002

Master Spec กำหนดให้ข้อเสนอ Defensive Roll และวิธีจบ FINAL เป็น Pending Design Decision ก่อนล็อก จึงจัดแบบให้ตรวจและเลือกก่อนเชื่อม runtime ตัวเลขเสนอในไฟล์ไม่ถือเป็นการอนุมัติ เปิด Q&A ไม่เปลี่ยน State และ HP0 ไม่ยืนยันการตาย

## ลำดับทำต่อเมื่อเลือกกฎแล้ว

1. เก็บมติ D01-B/D02-C ที่อนุมัติแล้ว ล็อกส่วนที่เหลือ D03–D07 และเติม Contract ที่ยังว่าง พร้อมตรวจว่าบทตรงค่าที่ engine Resolve ได้
2. เพิ่ม CASE002 reader/reducer/projector แบบแยก identity; เก็บ CASE001 legacy readers/เซฟเดิมและไม่อพยพแบบทำลายข้อมูล
3. เพิ่ม sceneByGroup, per-view knowledge/perceptions และ save/reconnect ของกลุ่มจริงก่อน UI แยกฝ่าย
4. เชื่อม staged attack/defense/death/sacrifice ตามกฎที่เลือก พร้อม dedupe และ privacy tests ทุก transport
5. เพิ่มภาพฉาก/หน้าผู้เล่น/DM แล้วตรวจ acceptance 20 ข้อ, CASE001 regression และ user playtest ก่อนเปิดเลือกคดี

การคง CASE002 เป็น `coming-soon` ในรอบนี้เป็นสถานะตามจริง ไม่ใช่คดีที่เล่นได้แต่ซ่อนปุ่มไว้ ไม่มีการนำ standalone A1 ของ CASE001 มาอ้างว่า multiplayer หรือ runtime ของ CASE002 ผ่านแล้ว

## ชุดภาพและทางจบที่เลือกแล้ว

- [แกลเลอรีภาพ 16 ภาพ](ARTWORK_GALLERY.html) และ [ตำแหน่งไฟล์/ผังฉาก](CASE002_Artwork.md)
- [ทางหยุดภัยถาวรหลังสังเวย](CASE002_FINAL_Anchor_Design.md) — จุดยึดไม้ครูปู B3/C3/E4 ใช้ได้ก่อนสังเวยด้วย ไม่ย้อนล้างความตาย
