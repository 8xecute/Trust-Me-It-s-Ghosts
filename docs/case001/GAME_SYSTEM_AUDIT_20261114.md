# ตรวจระบบเกม CASE001 v5.5 — 14 พฤศจิกายน 2026

Baseline: commit `223dfc2` จาก working tree สะอาดก่อนเริ่มตรวจ
ขอบเขต: การเข้าห้อง/ตัวละคร, DM และ Q&A, scene navigation, combat, evidence/ending, save/reconnect และ production build
เป็นงานตรวจและเสนอแก้ ยังไม่แก้ application code ไม่ commit/push

## ผลตรวจพื้นฐาน

- Workspace typecheck ผ่าน
- Production build ผ่านโดยใช้ VITE_SERVER_URL จาก DEPLOYMENT.md
- Server/client tests 342 รายการผ่าน
- Production Socket.IO smoke 6 รายการผ่าน รวม polling/WebSocket, save/reconnect และ NPC placement/restart
- tsx ใน node_modules ยังใช้ไม่ได้ จึงรัน server tests หลัง transpile ให้ import dist ที่เพิ่ง build และ bundle client tests ด้วย esbuild วิธีเดียวกับรอบ integration
- ยังไม่ได้ตรวจภาพ desktop/mobile ผ่าน browser, ทดสอบบาลานซ์ด้วยคน หรือยืนยันสถานะ Render จริง

Tests ผ่านไม่ได้ยืนยันว่า branch เงื่อนไขทุกชุดถูกต้อง จึงสร้าง probes เพิ่มใน .local-logs/audit-probes.mjs และบันทึกผลใน .local-logs/audit-probes.json

## ข้อค้นพบที่ยืนยันแล้ว

### 1. P1 — การ์ดซักต้นใน B3 ไม่มีเงื่อนไขที่เปิดได้

ตำแหน่ง: packages/server/src/case001/storyDice.ts:58 และ :81

ฐาน eligibility ต้องไม่มี v43-ton-protected แต่สาขา 5.3/5.5 นำค่าเดิมมา AND กับต้องมี fact เดียวกัน ทำให้เป็น false เสมอ
Probe: ที่ B3 ผู้เล่นมีชีวิตและอยู่ B ทั้งก่อนและหลังตั้ง fact พร้อม TON_TRUST=high ไม่พบ B3_TON_DISCLOSURE ใน storyCheckOptions
Story Script ระบุว่าความปลอดภัยไม่ได้แปลว่า Full อัตโนมัติ จึงไม่ควรแก้ด้วยแจกข้อมูลลึกเมื่อกด protect

นอกจากนี้ QA B3_Q002 และ B3_Q003 อ้าง B3_SOC14_FULL / WICHAI_OUT_OF_EARSHOT_FOR_NAME ที่ไม่มี definition ใน contract และ B4_Q007 ขาด B4_FRAME_INSPECTED รวม 4 references จึง fail closed ตั้งแต่ก่อนถึง mapping รายคำถาม
ผล: ผู้เล่นยังไปต่อได้ แต่การสืบต้นและส่งคำตอบรถเข็น/ห่อดำผ่านคลังทำไม่ได้ตามเงื่อนไขที่เขียนไว้
แก้: แยกความปลอดภัยจากผล SOC ให้ไม่ขัดกัน แมป guard จากผลตรวจจริงและตำแหน่งผู้ฟัง เพิ่ม validation ของ QA v5.5 ซึ่งปัจจุบันตรวจโครงสร้างเข้มเฉพาะ bank v5.3

### 2. P1 — เหตุแม่แก้วทำร้ายวิชัยใน F5 เริ่มได้ด้วยเหตุผิด และจบผลถึงตายไม่ได้

ตำแหน่ง: packages/server/src/case001/storyV51.ts:429, :443 และ command51 สาขา attempt/fatal

Probe: RITUAL_STATUS=stopped, วิชัยมาถึงจริง, humanCaseSupported=false และ f5Question=delivered ทำให้เสนอ attempt โดยไม่มี fact ของการยั่วยุหรือความพยายามทำร้ายต่อหน้า
หลัง command51('attempt') มี pending execution announced=true แต่ dmOptions51 เสนอ prevented อย่างเดียว เพราะกรอง fatal ออกจาก v5.5 ทั้งหมด
ผล: สาขาวิชัยเสียชีวิตจากแม่แก้วและ ending modifier vigilante_ghost ไม่มีทาง resolve ผ่านคำสั่งปกติ ขณะที่เหตุเริ่มยังใช้การไม่มีหลักฐานเป็นเงื่อนไข ซึ่งบทล่าสุดระบุว่าไม่เพียงพอ
แก้: ใช้เหตุคุกคามที่เกิดจริง พร้อมระยะและโอกาสรับมือ แยกการ resolve F5 execution จากเหตุมีด/โล่ E5 ที่เลิกใช้ ไม่คืน fatal แบบเหมารวมทุกสาขา

หมายเหตุเพิ่มเติม: completeCaseRound ปิดคดีทันทีเมื่อทั้งทีมหมดสภาพ และไม่เปิดช่วง villain action ต่อพยานตามสาขา 4A จึงยังต้องทำความสามารถรองรับสาขานี้ตามกติกาที่มีจริง ไม่สมมติว่าทุกคนตาย; PLAYER_DEATHS ถูกอ่านใน resolver แต่ไม่พบจุดบันทึกการตายผู้เล่นในเส้นทาง runtime ปัจจุบัน HP0 ต้องคงความหมายว่าล้ม ไม่ใช่ตาย

### 3. P2 — ยันต์ลดความเสียหายคืน HP หลังถูก clamp จนเกิดการรอดผิดผล

ตำแหน่ง: packages/server/src/case001/caseBattle.ts:357 และ packages/server/src/tacticalEncounter.ts:273

resolveNpcAttack หัก HP และ clamp ที่ 0 ก่อน จากนั้น ward คืน HP 1 ภายหลัง
Probe: HP1 ถูก WET_CLAW damage2 และมียันต์ ผลปัจจุบัน HP1 แต่ผลที่ถูกต้องคือ HP0 เพราะ damage หลังลดเหลือ1
Combat log กลับรายงานเสีย HP1 ขณะที่ changes ว่างเพราะค่าก่อนและหลังเท่ากัน
แก้: คำนวณ guard/ward และ effective damage ก่อนหัก resource ครั้งเดียว ใช้ค่า delta จริงกับ log; ตรวจ Sanity ใกล้ศูนย์ด้วย

### 4. P2 — พาคนหายออกหนึ่งคนทำให้ Q&A E3 ของคนที่เหลือปิดทั้งหมด

ตำแหน่ง: packages/server/src/case001/qa53.ts:82

สาขา E3 บังคับให้ hostageNames.every(hostagePresent) ก่อนตรวจคำถามแต่ละข้อ
Probe: ห้องเปิด ดลแก้ผ้าปากแล้ว เมื่อทุกคนอยู่ availableQa53 คืน 6 คำตอบ แต่ตั้ง escorts=['เพิ่ม'] แล้วเหลือ 0 แม้ดลและนิดยังอยู่
แก้: ใช้ presence เฉพาะคนที่จำเป็นต่อคำถามนั้น คงเงื่อนไขครบสามคนเฉพาะคำถามที่ต้องเทียบข้อมูลครบจริง

### 5. P2 — คำสั่งสำหรับ DM ยังปนข้อความพร้อมส่งให้ผู้เล่น

ตำแหน่ง: packages/server/scenarios/case-001/case-001.v5.5.qa.json:347 และ packages/server/src/case001/dmPresentation55.ts:playerAnswer55

Probe: playerAnswer55(A2_Q004) คืนทั้งข้อความ C3/F4 และคำแนะนำวิธีบรรยายในภายหลัง จึงกลายเป็นค่าเริ่มต้นของช่องส่งคำตอบ
ตัวกรอง regex จับคำบางคำได้ แต่ไม่ได้แยกเนื้อหาผู้เล่นจาก editorial guidance อย่างเป็นโครงสร้าง
แก้: แยก answer/guidance ที่ต้นข้อมูลและตรวจ schema คงการแก้ข้อความก่อนส่งของ DM; sync ต้นฉบับที่อนุมัติหลัง mapping เงื่อนไขครบ

ข้อค้างที่ทราบ: ชุดแก้ disclosure 35 รายการยังอยู่ในต้นฉบับ local v5.5 ที่ถูก .gitignore ไม่ได้ import เป็น runtime ปัจจุบัน จึงยังไม่ควรบอกว่าการแก้ภาษาและปูชื่อทุก Act ใช้งานในเกมแล้ว

### 6. P2 — หลักฐานที่ดินในบทส่งท้ายผูกกับรหัสคำให้การต้นผิดชนิด

ตำแหน่ง: packages/server/src/case001/guidedCase.ts:141 และ packages/server/src/case001/storyV51.ts:515

collect-land ตั้ง LAND_EVIDENCE_COLLECTED แต่ไม่ได้เพิ่ม E08; E08 ถูกสร้างจากคำให้การต้นใน B3
Probe: เก็บเอกสารที่ดินแล้ว หยุดพิธี มี gate-truth/E07 แต่ไม่มี E08 หน้าเลือกส่งหลักฐานให้เพียง E07 เมื่อเพิ่ม E08 จึงแสดง “หลักฐานหนี้และซื้อขายที่ดิน”
ผล: ทีมที่ข้ามการซักต้นส่งรายการเอกสารที่ค้นใน E4 ผ่านตัวเลือกนี้ไม่ได้ และ UI เรียกคำให้การ B3 เป็นเอกสารคนละชนิด
แก้: ให้ตัวเลือกส่งเอกสารอ่านจากหลักฐาน E4 ที่เก็บจริง แยก identity ของคำให้การต้นจากเอกสารหนี้ ไม่จำเป็นต้องใช้ E08 แทนทั้งคู่

### 7. P2 — เซฟเสียหนึ่งไฟล์ทำให้เซิร์ฟเวอร์เริ่มไม่ขึ้นทั้งระบบ

ตำแหน่ง: packages/server/src/roomSaves.ts:16 และ packages/server/src/index.ts:37

openRoomSaves parse/restore ทุกไฟล์โดยไม่มีการจัดการข้อผิดพลาดรายไฟล์ และถูกเรียกตอน startup โดยตรง
Probe: ใส่ JSON ที่ถูกตัดค้างใน directory ทดสอบแล้ว openRoomSaves โยน SyntaxError ทั้งชุด
แก้: validate/restore รายห้องใน staging ก่อนเผยเข้า store แยกไฟล์เสียเพื่อกู้คืน พร้อมแจ้งว่าเซฟห้องใดโหลดไม่ได้ โดยไม่หยุดห้องอื่น
ควรให้ client เห็นสถานะ autosave ล้มเหลวด้วย เพราะ saveStartedRoom ปัจจุบัน catch แล้วเขียนเฉพาะ server log

## ลำดับที่เสนอ

1. แก้ B3 และ F5 ให้ตรงเงื่อนไขเนื้อเรื่อง พร้อม regression tests
2. แก้ damage/ward และ E3 ที่เปลี่ยนผลการเล่นโดยตรง
3. แก้ identity หลักฐาน แยกข้อความผู้เล่น/DM และค่อย sync disclosure source เข้า runtime
4. เพิ่มการกู้เซฟและแสดงข้อผิดพลาด autosave ให้ DM

## ปรับปรุงเพิ่มเติมหลังแก้ bug

- ทำคำสั่ง npm test ที่รันชุด server/client/smoke ได้ซ้ำจาก clean install ไม่ต้องใช้สคริปต์ local เฉพาะเครื่อง และตั้ง CI ให้ตรวจชุดหลักทุก PR
- เพิ่มการทดสอบเงื่อนไขแบบข้าม/กลับฉาก, แยกทีม, คุ้มกันพยานบางคน, HP/Sanity 0–2, restore กลางไฟต์ และการปลดพิธีหลังชนะร่าง
- กำหนดสถานะการรองรับ CASE002/003 ให้ชัด ปัจจุบันเป็นเพียง preview หน้าแรก ยังไม่มี runtime สำหรับเลือก/โหลดหลายคดี
- ถอน adapter และข้อมูลหลายเวอร์ชัน B4–B7 ตามรายงานเดิมเป็นงานแยก หลังพิสูจน์ความเข้ากันได้ของเซฟ ไม่ลบรวมระหว่างแก้ bug

ไม่มีการแก้กติกา DC ตัวละคร หรือ application code ในรอบตรวจนี้
