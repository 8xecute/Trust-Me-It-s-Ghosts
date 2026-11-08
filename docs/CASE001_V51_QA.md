# CASE 001 v5.1 — รายงานส่งมอบและ QA

สถานะ: อัปเดตระบบจริงใน workspace สำหรับข้อกำหนดที่ชัดเจนแล้ว ยังไม่ประกาศว่า Canon พร้อม production ครบทุกสาขา และยังไม่ได้ deploy ไปบริการจริง

## สิ่งที่เปลี่ยนจาก v4.3

| บท | การเปลี่ยนที่ runtime ใช้จริง |
|---|---|
| A1–A3 | เหตุผลจ้างบริษัท/ตำรวจตามขอบเขต รายชื่อคนหาย และประเสริฐไม่สารภาพอดีตทันที |
| B1–B5 | แผนที่คนหายกับที่ดินมาก่อน B2; รอยมือและเสื้อกระตุ้นต้นปะติดปะต่อ; แยกคำให้การจากหลักฐานพิสูจน์ |
| C1–C5 | สมุดดลชี้ศาล/บ้านยายเอง; ผีเงาจมน้ำมีผล won/pacified/escaped/lost จริง; ยายไม่เห็นเปิดประตูน้ำและไม่รู้วิธีปลดกำไล |
| D1–D5 | ป้ายชื่อ ด้าย และรอยล้อเป็นเบาะแสหลายทาง; D3 พูดจริงเขียน talked; D4 won ไม่หยุดพิธีและไม่สร้างร่างฟื้นใน Final |
| E1–E6/H1 | คนหายบาดเจ็บและมีอารมณ์/ขอบเขตพยาน; คำถามไม่รู้ของในกล่องก่อนพบ; เก็บเอกสาร/อ่าน/เปิดเผยเป็นคนละเหตุ; E5 เฉพาะวิชัยมาถึงจริง; H1 ไม่เรียก NPC ที่ไม่อยู่ |
| F1–F6 | F2 อ่านผล D; F4 เฉพาะ phase ความทรงจำจริง; F5 ประเมินความสงบแยกจาก stopped; F6 ตรวจ 03:00 ในทุกบทครั้งเดียว ไม่รอเปิด F6 |
| Ending A–D | เรียง precedence ผู้เล่นตาย → พิธียังทำงาน → ตัวประกันตาย → Vigilante → ผลไม่ครบ → ภัยแม่แก้ว → A; รายงานจำนวนและสาเหตุจริง |
| UI/ข้อมูล | Reader แยกคำบรรยาย/บทพูด/เงื่อนไข/DM ลับ; ยืนยันบริบทก่อนส่งคำตอบ; player snapshot ไม่ส่ง sourceMarkdown, State Contract หรือ DM secret |
| กฎเดิม | คง Dice 16 รหัส Stat/DC และช่วงผลต้นฉบับ; ล็อก DC ที่ UI/request/resolver สำหรับ v5.1; คงต้นทุน Action เดิมและความรุนแรง deadline เดิม ไม่เพิ่มศัตรูหรือ HP/AP/Focus ใหม่ |

ข้อมูลทุกฉากนำเข้าจากต้นฉบับเต็มเป็น JSON แยก Act พร้อม Markdown ฝั่ง server และ source hash ใน manifest ไม่ได้แก้เฉพาะเอกสาร มีตัวนำเข้าซ้ำได้ที่ scripts/import-case001-v51.py ไฟล์แนบต้นฉบับใน 5.1 ไม่ถูกแก้

## ผลทดสอบ

- ชุด server/client: **177 ผ่าน / 0 ไม่ผ่าน** รวม v5.1 จำนวน **31 กรณี**
- Production smoke: **3 ผ่าน / 0 ไม่ผ่าน** ได้แก่ config, polling/WebSocket เดิม และ built server ที่เปิดห้อง v5.1 เป็นค่าเริ่มต้นจริง
- TypeScript server/client ผ่าน; production build ผ่านด้วย `VITE_SERVER_URL=https://game.example` ซึ่งเป็น URL ตัวอย่างสำหรับตรวจ build เท่านั้น ไม่ใช่การตั้งค่า deployment จริง
- ไม่มี human browser playtest เต็มคดีหรือการทดสอบผ่าน TLS/proxy ของบริการจริงในงานนี้

คำสั่งที่ใช้:

```powershell
$env:VITE_SERVER_URL = 'https://game.example'
npm run build
node --import tsx --test packages/server/tests/*.test.ts packages/client/tests/*.test.ts
node --test production-smoke.test.mjs production-v51-smoke.test.mjs
```

ข้อจำกัดของสภาพแวดล้อมระหว่างทดสอบ: ครั้งแรกรัน disk-save suite ใน temp ของ sandbox พบ EPERM ตอน rename; เปลี่ยน TEMP/TMP ไปโฟลเดอร์ทดสอบภายใน workspace แล้วชุด 177 ผ่านครบ การเชื่อม localhost ถูก sandbox ปฏิเสธ EACCES จึงรัน production smoke นอก sandbox หลังได้รับอนุญาตจากระบบ แล้วผ่านทั้งสามกรณี ไม่ได้แก้ roomSaves หรือ network rules เพื่อให้เทสต์ผ่าน

## Coverage ของ v5.1

- 31 ฉาก / Ending 4 / Dice 16 และ Ability/DC เดิม; ตรวจข้อความบทพูดตรงต้นฉบับ
- ผู้สืบสวน 2/4/6 คน เดินหน้าและข้ามฉากเสริมได้; ไม่ย้อนบท
- B1 ปูงานที่ดิน; ข้ามต้นยังพบ C2; B3/D5 ทอยพลาดแล้วยังไปต่อ
- D3 คุยจริง → talked; ข้าม D3 → not_met; D4 ชนะจริง → dispersed; F2 ไม่ฟื้นร่างเอง
- C4 ทุกผลจริงจาก encounter reducer; ไม่มีภาพหน้าวิชัยจากผี
- E4 decode Full ไม่หยุดพิธี; E4 cue ไม่อ่านโน้ตหลังใบแผนที่ให้ฟรี; server ปฏิเสธ Action ก่อน cue ถูกส่ง
- E5 คนไม่อยู่/คนถูกอพยพแล้วไม่มีโล่; ทอยล้มเหลวไม่ฆ่าเอง; มี reaction window ที่ส่งถึงผู้เล่นก่อน DM ยืนยันผลถึงตาย
- F5 วิชัยไม่อยู่ไม่มี Execution; มีจังหวะป้องกัน; ยับยั้งได้หรือเกิด Vigilante Ghost ตามเหตุจริง
- 03:00 ในบท E ไม่จบเกม; active + tether + alive ใน lethal ทำ Toll ครั้งเดียว; weakened/stopped/nonlethal/เพิ่มตายแล้วไม่ตายเพิ่ม
- สายเพิ่มถูกปลดก่อนเวลาไม่เกิด Toll เป็น **unit fixture** เพราะ Action ปลดรายคนยังไม่มีข้อกำหนดอนุมัติ
- ตัวประกันตายลด safe/escort ทันที; คำพูดคนตายถูกปิด; ปฏิกิริยาอาศัยเห็นเหตุ/รับแจ้งจริง
- เล่นเส้นทางจริงถึง A, B ปกติ, B Vigilante, C และ D; A ไม่ผ่านเมื่อยังไม่เปิดเผย/ช่วยไม่ครบ/คนตาย
- Fallen Agent เป็น **resolver fixture** เพราะไม่มี Core event ที่อนุมัติให้ผู้เล่นตาย; ไม่แปลง HP0 เป็น dead
- Checkpoint/save/resume ไม่ทอยซ้ำ ไม่ Toll ซ้ำ; เซฟ v4.3 ไม่ถูกแปลง; เซฟ v5.1 ที่ขาด State ถูกปฏิเสธ
- ตรวจ DM/player boundaries ผ่าน WorldStore และ Socket.IO ของ built server

## ประเด็นยังไม่ปิด

อ่านตารางทุก State และข้อ Needs Rules Decision ใน [CASE001_V51_STATE_AUDIT.md](CASE001_V51_STATE_AUDIT.md)

1. C5 Editorial Props: Card/DC เดิมยังอยู่ แต่ optional check นี้ยังไม่เปิด เพราะเอกสารสองแหล่งรออนุมัติ
2. การปลด tether รายคน/ผล stopped ต่อสาย และ recovery ของร่างแม่แก้ว ยังไม่มีขั้นตอนที่อนุมัติ
3. sealed/departed/controlled ยังไม่เปิด producer; ไม่ใช้แทน calm เพื่อบังคับ A
4. Critical Fail และ player-death event ยังไม่อนุมัติ; ใช้ HP0/Downed เดิม
5. เกณฑ์หลักฐานเพียงพอ/การเปิดเผยจริง และผลระยะ/Guard/Help ใน E5/F5 ต้อง DM ยืนยันเหตุจริง หน้า DM บันทึกผล ไม่ได้จำลอง combat มนุษย์ครบเอง

ข้อเสนอ v5.2 เป็น impact analysis แยกใน [CASE001_V52_PROPOSALS.md](CASE001_V52_PROPOSALS.md) **ยังไม่ได้ implement และไม่ถือเป็น Canon**

## วิธีเปิดทดสอบ

1. รัน `npm run dev` จาก root แล้วเปิด Vite URL ที่ terminal แสดง ปกติคือ localhost:5173
2. สร้างห้องใหม่ รุ่นที่มี DM 1 คนและผู้สืบสวนอย่างน้อย 2 คน ห้องใหม่ใช้ v5.1 หลัง restart server; เซฟเก่ายังใช้เวอร์ชันเดิม
3. สำหรับ lethal ให้ตั้ง `CASE001_LETHAL=true` ก่อนรัน หรือประกาศผ่านหน้า DM ขณะอยู่บท A ผู้เล่นเห็นสถานะ variant ชัดเจน
4. DM เปิด “ฉาก / คู่มือ” เลือกฉาก ส่ง cue แล้วใช้ “บันทึกเหตุจริงและเงื่อนไขบท” ยืนยันเงื่อนไขเฉพาะที่เกิดจริง ก่อนส่งบท NPC ตามคิว
5. ใช้การยืนยันบทเดิมเพื่อเดิน A→B→C→D→E→FINAL เมื่ออยู่ Final ยังตรวจแกน/เปิดห้องช่วยคนที่พลาดใน E ได้ในสถานที่เดิม โดยไม่ย้อนบท
6. เก็บหลักฐาน H1 จากแหล่งจริง บันทึกการเปิดเผยจริงก่อน A; อย่าตั้งสำเร็จจากแค่หยิบเอกสาร
7. ใช้ `CASE_STORY_VERSION=4.3` หรือ `4.1` หากต้องการเปิดห้องใหม่รุ่นเดิม `CASE_SAVE_DIR` ใช้ตำแหน่ง private storage เดิม ไม่ลบหรือเขียนทับเซฟเก่า

## ไฟล์ที่แก้/เพิ่ม

รายการนี้ไม่รวมไฟล์แนบของผู้ใช้ใน 5.1 และไฟล์ build/temp:

- `README.md`
- `docs/CASE001_V51_PLAN.md`
- `docs/CASE001_V51_STATE_AUDIT.md`
- `docs/CASE001_V51_STORY_MAP.md`
- `docs/CASE001_V52_PROPOSALS.md`
- `packages/client/src/network/onlineTypes.ts`
- `packages/client/src/ui/case/GuidedPanel.tsx`
- `packages/client/src/ui/gm/DmScript.tsx`
- `packages/client/src/ui/gm/DmWorkspace.tsx`
- `packages/server/scenarios/case-001/case-001.v5.1.A.json`
- `packages/server/scenarios/case-001/case-001.v5.1.B.json`
- `packages/server/scenarios/case-001/case-001.v5.1.C.json`
- `packages/server/scenarios/case-001/case-001.v5.1.D.json`
- `packages/server/scenarios/case-001/case-001.v5.1.E.json`
- `packages/server/scenarios/case-001/case-001.v5.1.F.json`
- `packages/server/scenarios/case-001/case-001.v5.1.endings.json`
- `packages/server/scenarios/case-001/case-001.v5.1.manifest.json`
- `packages/server/scenarios/case-001/case-001.v5.1.script.md`
- `packages/server/src/case001/case001.ts`
- `packages/server/src/case001/caseActions.ts`
- `packages/server/src/case001/caseBattle.ts`
- `packages/server/src/case001/caseNotebook.ts`
- `packages/server/src/case001/caseStory.ts`
- `packages/server/src/case001/guidedCase.ts`
- `packages/server/src/case001/storyDice.ts`
- `packages/server/src/case001/storyV51.ts`
- `packages/server/src/case001/v51Content.ts`
- `packages/server/src/index.ts`
- `packages/server/src/world.ts`
- `packages/server/tests/case-v51.test.ts`
- `production-v51-smoke.test.mjs`
- `scripts/import-case001-v51.py`
- `docs/CASE001_V51_QA.md` (รายงานนี้)
- `docs/CASE001_V51_TEST_RESULTS.txt` (บันทึกผลตรวจ)
