# CASE 001 v5.5 — Disclosure continuity revision

วันที่ 14 พฤศจิกายน 2026 ผู้สร้างอนุมัติแก้ลำดับเปิดเผยข้อมูลทุก Act ตามรายการตรวจในแชท

## ขอบเขต

แก้เฉพาะ Story Script และ QA ต้นฉบับ v5.5 ไม่แก้ runtime ร่วมกับแชทหลัก ไม่ commit/push
ไม่เปลี่ยน State Contract, DC, การ์ดทอย, ศัตรู หรือกติกา
ฉบับแก้ในแต่ละฉากมีป้าย DM บรรยาย / NPC ตอบ / DM ONLY และระบุว่าใช้แทนคำตอบรหัสเดิม

## จุดแก้

- A1_Q004
- A1_Q005
- A1_Q011
- A2_Q002
- A2_Q004
- B2_Q005
- B2_Q013
- B3_Q002
- B3_Q009
- B3_Q010
- B4_Q004
- C3_Q002
- C5_Q007
- C5_Q014
- C5_Q016
- C5_Q017
- C5_Q001
- C5_Q006
- C5_Q002
- C5_Q008
- D2_Q005
- D2_Q004
- D3_Q008
- D3_Q009
- E3_Q001
- E3_Q004
- E3_Q005
- E4_Q002
- E4_Q006
- E4_Q004
- E5_Q001
- H1_Q003
- F4_Q002
- F4_Q001
- F4_Q003

## ตรวจแล้ว

- QA JSON อ่านได้ ID ไม่ซ้ำ และ stateMutationOnView เป็น false ทุกคำตอบ
- เนื้อหาตั้งแต่การ์ด A2_RADIO_ECHO จนท้ายเอกสารตรงกับก่อนแก้ทุกตัวอักษร
- SHA-256 ของ runtime v5.5 ทุกไฟล์ตรงกับก่อนแก้

## งานส่งต่อ runtime

ต้นฉบับกับ runtime ตั้งใจต่างกันในรอบนี้ ห้ามรายงานว่าใช้งานในเกมแล้ว
เงื่อนไข requirements ใหม่เป็น DM manual review ยังไม่ใช่ runtime mapping; ต้องเพิ่ม mapping ที่ตรวจข้อมูลได้รับจริงและทดสอบก่อน import
QA ใหม่ต้อง map speaker/presence และ guards ตามเดิม ไม่เปิดคำตอบจากชื่อหัวข้อ
E5_Q001 ต้องแยกหลักฐานหนี้จากหลักฐานที่ดินใน server guard
ตรวจการข้าม C2, ไม่ถามประวัติ C5, ไม่พบ/ไม่สู้/ชนะ D4, E4 ก่อนช่วยคน และการส่งคำตอบหลัง NPC ไม่อยู่
เมื่อแชทหลักพร้อม จึง sync runtime และรัน tests/typecheck/build ที่เกี่ยวข้อง

## ข้อจำกัดเดิมที่พบในการตรวจ

Guard references ที่ไม่มี definition ใน Contract มีอยู่ก่อนแก้และตรงกับ runtime เดิม: B3_Q002: B3_SOC14_FULL, B3_Q002: WICHAI_OUT_OF_EARSHOT_FOR_NAME, B3_Q003: B3_SOC14_FULL, B4_Q007: B4_FRAME_INSPECTED ไม่เพิ่มหรือแก้ guard เหล่านี้ในรอบต้นฉบับ ต้องตรวจ mapping ในรอบ runtime

การตรวจเพิ่มเติมผ่าน: scene IDs, unique IDs, บทใหม่ใน Script ตรง QA และไม่มี missing guard เพิ่มจาก baseline
