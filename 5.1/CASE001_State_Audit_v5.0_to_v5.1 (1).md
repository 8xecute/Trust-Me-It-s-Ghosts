# CASE 001 — State Reachability Audit (v5.0 → v5.1)

**ขอบเขต:** ตรวจฉาก A1–F6, H1, Ending A–D และ State/Dice Reference ภายใน Story Script v5.0. ไม่ตรวจไฟล์ Core Rules, Combat Lite หรือโค้ดเกมจริงที่ไม่ได้แนบกับการตรวจครั้งนี้. จึงเป็น **การตรวจความต่อเนื่องของสคริปต์** ไม่ใช่การยืนยัน implementation runtime.

## ผลตรวจที่ยืนยันจากสคริปต์

1. **`KAEW_D_RESULT=not_met` — missing initialization:** F2 มีบท `not_met` แต่ D3 ไม่เขียนผลเมื่อพบแม่แก้ว; D4 เขียนเพียง talked/won/fled/lost (ฉาก D3–D4, F2). เสนอ initial `not_met`, set `talked` เมื่อ D3 trigger, และเก็บ not_met เมื่อข้าม D3 จริง.
2. **`GHOST_ENCOUNTER` — missing writes:** C4 บันทึก escaped แต่ไม่ระบุ `won/pacified/lost` เป็นผลสถานะชัด (C4). เสนอเขียนหลัง resolution.
3. **`RITUAL_TETHER_INTACT[เพิ่ม]` — missing initial / transition:** F6 ใช้ตรวจ true แต่ไม่มีการ initialize; คดีระบุด้าย/ชื่อสามคนผูกกับกำไล (D2/E4). เสนอเริ่ม true และ false เฉพาะปลดจริง.
4. **`HOSTAGE_FATE` — missing initial:** F6 ตรวจ alive และ E5 เขียน dead แต่ไม่พบ default ที่ระบุชัด; เสนอ alive ทั้งสาม ณ เริ่มเกม.
5. **`RITUAL_0300_FULL_POWER` — semantic mismatch:** v5.0 ตั้ง true หลังเพิ่มตาย แทนที่จะคำนวณจากสถานะพิธี; กรณี active แต่เพิ่มถูกปลด tether จึงอาจบันทึก false ทั้งที่พิธียังแรงเต็ม (F6). เสนอคำนวณก่อนเปลี่ยนเป็น entrenched เสมอ.
6. **`KAEW_FINAL=controlled` — no reachable producer after stopped:** Ending B กล่าวถึง controlled แต่ไม่พบ Action/transition ที่ทำให้แม่แก้วยัง controlled หลังพิธีแกนเดียว stopped (F5, Ending B, State Reference); คง enum เดิมและติด flag รอการตัดสินใจ.
7. **`KAEW_FINAL=sealed/departed` — underspecified:** กล่าวเป็นทางเลือก แต่ขั้นตอนหรือเงื่อนไขที่ยืนยันสำเร็จไม่ครบ (F5). ไม่ควรตั้งเพื่อให้เลือก Ending ตามต้องการ.
8. **Initial values ส่วนใหญ่ขาด:** TON_TRUST, KAEW_TRUST, GHOST_CLUE, RITUAL_STATUS, WICHAI_STATUS, BRIBE_ACCEPTED, WICHAI_COOPERATING, CHECK_RESULTS, counters (State Reference). ฉบับ v5.1 เสนอ State Contract ชัดเจน.
9. **`TIME_MINUTES` ไม่มีตัวอย่าง monotonic:** ฉากข้าม 23:00 → 03:00 ต้องไม่ reset เป็น 0 ตอนเที่ยงคืน; เสนอ elapsed minute หรือใช้ timestamp รูปแบบเดียวตลอด (A1–F6).
10. **Ending A มีเกณฑ์หลักฐานเกิน bool collected:** การเก็บเอกสาร =/= เปิดเผยอดีต หรือมีหลักฐานคดีที่รับฟังได้จริง; นโยบายใน Ending Resolver มีแล้วแต่ runtime flags แยกไม่ชัด.
11. **`CHECK_RESULTS.*` แยก not attempted จาก failure:** ถ้าข้ามฉาก/ไม่ทอยต้องไม่ตั้ง failure อัตโนมัติ.
12. **`KAEW_TEMP_DISPERSED=true` ยังไม่มี recovery event:** หลัง D4 won, F2 ระบุรอฟื้นจริงแต่ไม่มีระยะ/เงื่อนไขจาก Core/Combat; ห้ามฟื้นเอง (D4, F2).

## ผลลัพธ์ v5.1

- เพิ่ม **State Contract** พร้อม defaults ก่อนเริ่ม A1.
- เพิ่ม **transition ที่ขาด** ที่ C4, D2–D3, F2 และ F6.
- เก็บ **31 ฉาก / 16 Dice Cards / Ending A–D / ช่วงผลทอยและ DC เดิม** ครบ โดยตรวจ block Dice Cards ตรงกันทุกตัวอักษร.
- แยกปัญหาเชิง Story/State ที่แก้ชัดเจนได้ ออกจากปัญหาที่ต้องอาศัย Core/Combat หรือเจ้าของ Canon เลือก.

## กฎแปลงเป็น Code (ตัวอย่าง pseudocode)

```ts
// Initialize once per case. Do not use undefined as a substitute for not_met.
state.KAEW_D_RESULT = 'not_met';
// D3 actually triggered and Mae Kaew spoke to the party.
if (scene === 'D3' && maeKaewContactHappened) state.KAEW_D_RESULT = 'talked';
// D4 resolution overrides prior conversation result only if the encounter happened.
if (scene === 'D4' && resolvedResult) state.KAEW_D_RESULT = resolvedResult; // won/fled/lost/talked

// At exactly one crossing of 03:00 game time, BEFORE entrenched.
state.RITUAL_0300_PRESTATE = state.RITUAL_STATUS;
state.RITUAL_0300_FULL_POWER = state.RITUAL_0300_PRESTATE === 'active';
if (state.RITUAL_0300_FULL_POWER && state.RITUAL_TETHER_INTACT['เพิ่ม'] && state.HOSTAGE_FATE['เพิ่ม'] === 'alive') {
  state.HOSTAGE_FATE['เพิ่ม'] = 'dead';
  state.HOSTAGES_DEAD += 1;
  state.DEATH_CAUSE['เพิ่ม'] = 'ritual_toll';
}
if (state.RITUAL_STATUS !== 'stopped') state.RITUAL_STATUS = 'entrenched';
```

> ห้ามใช้ตัวอย่างนี้แทนขั้นตอนการสู้หรือหยุดกำไลจริง: ตัวเลข AP/HP/เงื่อนไขอนุญาตการปลดสาย ยังต้องอ้างอิง Universal Core Rules และ Combat Lite.
