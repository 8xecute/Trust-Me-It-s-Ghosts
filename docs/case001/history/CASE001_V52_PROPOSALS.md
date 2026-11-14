# CASE 001 — ข้อเสนอหลัง v5.1 (ยังไม่อนุมัติ/ยังไม่ implement)

| Proposed Improvement | ผลกระทบ | ไฟล์/การย้ายที่ต้องเตรียม |
|---|---|---|
| Hostage record รายคนแทน counters/arrays หลายชุด | found/evacuated/fate/tether/deathCause มีเจ้าของเดียว; derive counters | CaseState, storyV51.ts, guidedCase.ts, roomSaves/checkpoint และ migration ที่เก็บสำเนาเซฟเก่า; ยังไม่ได้เปลี่ยนรูปข้อมูลนี้ |
| invariant stopped ต่อ tether ทั้งสาม | ต้องล็อกว่าปลดทุกเส้นเมื่อใด และ ritual phase ใดใช้ได้ | storyV51.ts, case001.ts, tests เวลา crossing; รอ Canon |
| เกณฑ์ legal sufficiency/disclosure แบบเครื่องตรวจได้ | อาจเปลี่ยนเกณฑ์ Ending A ต้องเจ้าของเรื่องอนุมัติ | State Contract, resolver และหลักฐาน; v5.1 ปัจจุบันบันทึกคำยืนยัน DM เท่านั้น |
| met_but_no_conversation | แยกพบแต่ไม่พูดจาก not_met หากจำเป็น | dialogue state/F2/save mapping; ไม่เพิ่ม enum ตอนนี้ |
| recovery, sealed/departed/controlled | ต้องมี trigger ที่มีเหตุและกฎอนุมัติ | caseBattle.ts, storyV51.ts, scene gates; ไม่เดาระยะ/โบนัส/penalty |
| Critical Fail และ player death | เปลี่ยนความหมาย HP0 มีผลทั้ง Core/Combat และรายงาน | shared Core/Character, damage pipeline, resolver; ไม่แปลง HP0 เป็นตายใน v5.1 |

ห้ามถือเอกสารนี้เป็น Canon หรือเรียกงานปัจจุบันว่า v5.2 ทุกข้อเป็น impact analysis เพื่อใช้ตัดสินใจภายหลัง
