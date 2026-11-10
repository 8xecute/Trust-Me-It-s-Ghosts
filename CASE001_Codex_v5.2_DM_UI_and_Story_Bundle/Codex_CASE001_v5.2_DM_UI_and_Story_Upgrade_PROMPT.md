# CODEX MASTER PROMPT — CASE 001 v5.2: DM UI Redesign + Story Runtime Upgrade

> **ใช้ Prompt นี้กับ repository เกมที่มีอยู่แล้ว** โดยวางไฟล์อ้างอิงทั้งหมดใน workspace เดียวกัน เช่น `docs/case001/`. ให้ดำเนินการแก้โค้ดและทดสอบจริง ไม่ใช่เพียงเสนอ mockup หรือแก้ Markdown.

## บทบาทและเป้าหมาย

คุณคือ Senior Full-Stack Game Engineer + UX Engineer + Narrative Systems QA สำหรับเกมออนไลน์ Cooperative Horror TRPG **บริษัท เรื่องผีไว้ใจผม จำกัด** (DM 1 คน, ผู้เล่น 2–6 คน).

**ทำ 2 งานที่ต้องเชื่อมกันในโปรเจกต์จริง:**
1. **อัปเดตหน้า DM** ให้รูปแบบการอ่าน ความเป็นระเบียบ และประสบการณ์ใช้งานใกล้เคียง `CASE001_v5.2_DM_Reader_No_Timer.html` แต่ใช้ framework/component/design system ที่ repository ใช้จริง ไม่ฝังไฟล์ HTML ยาวเป็น iframe และไม่ทำให้ระบบ multiplayer/session เดิมเสีย.
2. **อัปเดตเนื้อเรื่องที่ runtime ใช้จริง** จาก CASE 001 v4.3 (หรือเวอร์ชันใดที่พบใน repo) เป็น `CASE001_StoryScript_v5.2_No_Timer_Event_Driven.md` รวมเงื่อนไขฉาก, NPC, Dice, State, Ending และกฎ **No Timer / Event-Driven**. แก้แหล่งข้อมูลที่ตัวเกมโหลดจริง ไม่ใช่แค่เปลี่ยนเอกสาร.

**ไฟล์ที่ให้ความสำคัญตามลำดับ**
- `CASE001_StoryScript_v5.2_No_Timer_Event_Driven.md` — **Source of Truth ด้านเนื้อเรื่อง v5.2**: บทอ่านออกเสียง, บท NPC, เงื่อนไข, เบาะแส, State Contract, Ending และ 16 Dice Cards.
- `CASE001_v5.2_DM_Reader_No_Timer.html` — **Visual/UX Reference** สำหรับการจัดหน้าฝั่ง DM; ไม่ใช่โค้ดที่ต้องนำไปฝังตรง ๆ และอย่าปล่อยข้อความ DM ลับไปยังผู้เล่น.
- `CASE001_v5.2_No_Timer_ChangeLog_and_Codex.md` — ข้อกำหนด migration ระบบนาฬิกาและ F6.
- `case-001.v4.3.script.md` — baseline สำหรับตรวจความเข้ากันได้กับฉาก/ข้อมูลปัจจุบัน; ห้ามเอาเนื้อหาเก่าทับ v5.2.
- `CASE001_State_Audit_v5.0_to_v5.1.md` — รายการช่องโหว่ State ที่ต้องทดสอบ; v5.2 มี State Contract ที่อัปเดตกว่า ให้ยึด v5.2 หากขัดกัน.
- Universal Core Rules v1.3, Combat Lite v1.1 และ Character Presets v1.1: ถ้าอยู่ใน repo ให้ใช้ยืนยัน combat/HP/DC; ถ้าไม่อยู่ ห้ามเดาตัวเลขหรือสร้างกติกาใหม่.

**ห้ามใช้** Prompt อัปเดต v5.1 เก่าเป็น Source of Truth เพราะ v5.2 ยกเลิกระบบเวลาแล้ว.

## ขั้นที่ 1 — ตรวจ repository ก่อนแก้

1. ระบุ stack ของ frontend/backend, routing, auth/role, session/lobby, multiplayer sync (เช่น WebSocket/Socket.IO ถ้ามี), database/storage, tests/build command.
2. ระบุตำแหน่ง **หน้า DM ปัจจุบัน**, หน้า Player, data schema สำหรับ story/scene/dialogue, scene router, Dice/check engine, state initialization/reducer, ending resolver, content loaders และ API/events ที่รับส่งข้อมูล.
3. ตรวจว่าหน้า DM ปัจจุบันมีฟีเจอร์ใดใช้อยู่แล้ว: เปิดฉาก/อ่านออกเสียง, scene controls, การส่งข้อความถึงผู้เล่น, NPC dialog, dice, session control, auto-save. **ต้องคงฟีเจอร์เดิมที่ใช้งานได้**.
4. สรุปไฟล์ที่จะเปลี่ยนและวิธี migrate ที่เล็กที่สุดก่อนลงมือ. จากนั้นดำเนินการแก้ในงานนี้ให้ครบและทดสอบ ไม่จบแค่แผน.
5. ไม่เปลี่ยนระบบ host/deploy, auth, router หรืองาน CASE อื่นโดยไม่จำเป็น; ไม่ deploy production หรือ push remote อัตโนมัติ.

## ขั้นที่ 2 — DM UI ที่ต้องการ (ยึด HTML v5.2 เป็นแนวทาง)

### โครงหน้าจอ

- **Desktop:** sidebar ทางซ้ายประมาณ 260–300 px; พื้นที่อ่านกลางขนาดสบายตาราว 760–900 px; topbar ติดด้านบนสำหรับชื่อคดี/ฉากและเครื่องมือ; ถ้ามี State/Dice controls เดิมให้อยู่แผงเสริมหรือ drawer ที่ไม่เบียดบทอ่าน.
- **Mobile/tablet:** sidebar พับเป็นเมนู drawer; เลื่อนอ่านสะดวก ไม่ตัดคำไทย ไม่เกิด horizontal scrolling; ปุ่มกดใหญ่พอและเนื้อหาอ่านได้.
- ใช้โทน **dark navy / charcoal**, ตัวอักษรไทยอ่านง่าย, line-height และระยะห่างสบายตา ตาม reference; ใช้ CSS tokens/design system เดิมเมื่อมี, รองรับ light/dark ของแอปหากมีอยู่แล้ว.

### Sidebar / Navigation

- แยกกลุ่ม ACT A, B, C, D, E, FINAL และ ENDING.
- **รหัสฉากครบ 31**: `A1 A2 A3`, `B1…B5`, `C1…C5`, `D1…D5`, `E1…E6`, `H1`, `F1…F6`; `H1` เป็น flexible reveal ไม่ใช่สถานที่ใหม่.
- ให้กดฉากเพื่อ **อ่าน/เตรียมฉาก** ได้โดยไม่แอบอัปเดต `PHASE` หรือถือว่าฉากนั้นเกิดขึ้นจริง. ถ้าระบบเดิมมี “เริ่มฉาก/ยืนยันดำเนินฉาก” ให้เป็น Action แยก และตรวจเงื่อนไข/state ก่อนเปลี่ยน.
- แสดงฉากปัจจุบัน, ฉากที่เล่นแล้ว, ฉากทางเลือก/ข้ามได้ **เฉพาะเมื่อมีข้อมูลสถานะจริงรองรับ**; อย่าทำ indicator ปลอม.
- มีช่องค้นหาด้วยรหัสฉาก ชื่อฉาก ชื่อ NPC และข้อความภายในฉาก; คลิกผลค้นหาแล้วนำไปยังฉากนั้นและเคลียร์ตัวกรองเมื่อจำเป็น.

### Scene Card / ลำดับข้อมูล

ทุกฉากต้องมีโครงข้อมูลที่อ่านออกง่าย (ไม่แสดงข้อความดิบยาว ๆ ยัดใน card เดียว):
1. **หัวการ์ด:** Scene ID + ชื่อ + Act + optional/conditional badge ตามข้อมูลจริง.
2. **เป้าหมาย / trigger** — สำหรับ DM (สั้น กระชับ วางก่อนเนื้อหา).
3. **NPC ที่อยู่ในฉากจริง** — ตามตำแหน่ง/สถานะผู้รอดชีวิต ไม่แสดงคนที่ตาย/หนี/ไม่ได้อยู่ในพื้นที่เหมือนอยู่ตรงหน้า.
4. **🎬 DM อ่านให้ผู้เล่น** — เน้นชัดที่สุดในกล่องพื้นสีเข้มอ่อนกว่าหน้า และอ่านข้อความจริงจาก v5.2; มีปุ่ม Copy เฉพาะเนื้อหาที่อ่านได้ (ถ้าทำได้โดยไม่กระทบระบบ). ห้ามทำ Auto-send ลงช่อง Player.
5. **🗣️ บทพูด NPC และ 💬 คำตอบตามคำถาม/Action** — เป็น section ที่ไล่เลือกได้ตามเงื่อนไข; สะท้อนสภาพตัวละครแบบ v5.2. ถ้า condition ยังไม่มีทางตัดสิน ให้อธิบายให้ DM เห็น ไม่สุ่มบทเอง.
6. **🔎 เบาะแส** — แยก `เห็นทันที`, `ต้องถาม/ตรวจ`, `ยังสรุปไม่ได้` ชัดเจน. อย่าเผยข้อมูลลับเป็นสิ่งที่ผู้เล่นมองเห็นตั้งแต่เข้าฉาก.
7. **🎲 Dice / Check card** — เชื่อม check ID และ DC จริงกับระบบทอยเดิม; แสดง Full/Partial/Failure เพียงผลที่เกิดจริงหรือให้ DM เปิดดูแต่ละผลด้วยตนเอง; ห้ามแก้ DC/ability; “ไม่ได้ทอย” ไม่ใช่ failure.
8. **🧭 Fail-forward + ➡️ บทเชื่อมฉากถัดไป** — อ่านง่าย ไม่ล็อก core clue เพราะพลาดทอย.
9. **🔒 DM ลับ** — ปิดไว้โดยปริยายและกดเปิดได้, มี “เปิด/ซ่อนทั้งหมด” เฉพาะ DM. **ต้องแยกสิทธิ์ที่ server/API ไม่ใช่ซ่อนด้วย CSS อย่างเดียว**.

### เครื่องมือ DM

- พาเนล State Snapshot / Evidence / NPC status / session actions ที่มีอยู่แล้วให้ใช้งานได้ต่อ; สามารถเปิดแยก drawer/accordion เพื่อรักษาพื้นที่อ่าน.
- การกด “เลือกดูฉาก” หรือ “เปิดข้อความลับ” **ต้องไม่ถือเป็น story event**; ทุก State write จาก Action/roll/resolution ที่เกิดขึ้นและได้รับอนุญาตเท่านั้น.
- ถ้ามีระบบ broadcast/send-to-player เดิม ให้มีการกดยืนยันแยกและส่งเฉพาะข้อความที่อนุญาต (`readAloud`, NPC line หรือ clue ที่เปิดเผยแล้ว); ไม่ส่ง whole scene card / DM secret / hidden future clues ผ่าน player API.
- ปุ่ม “พิมพ์/บันทึก PDF” อาจทำ `print CSS` แบบหน้า Reader ถ้าโครงเดิมรองรับ โดยตัด sidebar/topbar และไม่ปริ้น secret โดยไม่ตั้งใจ.
- แสดง error/empty state อย่างเข้าใจง่ายเมื่อขาด scene data หรือ check/state ที่ยังไม่รองรับ; ห้ามสร้างบทหรือค่าเริ่มต้นสุ่ม.

### รูปแบบอ้างอิงที่ต้องรักษา

`CASE001_v5.2_DM_Reader_No_Timer.html` มี navigation/sidebar, search, dark reading cards, blockquote ของ DM, สีแยก clue/fallback/secret, `<details>` สำหรับ DM ลับ, ปุ่มเปิด/ซ่อนทั้งหมด, mobile drawer, print style. **ยึด UX เดียวกันใน component architecture ของแอปจริง**; อย่า copy JavaScript ตัวอย่างแบบ hardcoded เป็นทั้งระบบ.

## ขั้นที่ 3 — Upgrade CASE 001 Runtime เป็น v5.2

### เนื้อหาและการเผยข้อมูล

- รักษา **31 ฉาก (A1–F6 + H1)**, เส้น `A → B → C → D → E → FINAL → ENDING`, **Ending A–D**, **16 Dice Checks** (ID, ability, DC, thresholds/results ตาม script) แบบเดิม.
- นำ **บทพากย์/คำบรรยาย/บทสนทนา NPC/รายละเอียด Trauma และ Gritty** จาก v5.2 จริงมาใช้; ห้ามสรุปเนื้อหาเองแทนการนำเข้า. เก็บแหล่งข้อความหลักใน story data/schema ของระบบเดิม และป้องกัน duplicate stale v4.3 content.
- **ความจริงคดี:** วิชัยลักพาตัวดล/นิด/เพิ่มเพราะหนี้และคดีที่ดิน; แม่แก้วช่วยวิชัยวัยเด็กเพียงคนเดียวในปี 2534 และถูกเขาบังคับด้วยกำไลซึ่งเป็นแกนพิธีเดียว; ประเสริฐร่วมเปิดประตูผันน้ำแต่ไม่ได้เป็นผู้สั่งสูงสุดที่พิสูจน์แล้ว; ยายบุญมีไม่เห็นเปิดประตูด้วยตา; ต้นไม่เห็นการลักพาตัวชัด; ชนะ D4 ไม่ทำให้พิธี stopped.
- ตรวจ E4 ย้ายชุดเอกสารไปที่ **กระเป๋าสะพายวิชัยใต้ฐานกล่องพิธี**; hotspot/clue location ต้องตรงบท. กำไลไม่ใช่กล่อง.
- H1 เป็น **การสังเคราะห์หลักฐาน** ไม่ใช่ teleport NPC. NPC ที่ตาย/ไม่อยู่ไม่ออกบทผิดฉาก.
- ไม่เพิ่ม NPC, ศัตรู, Item พิธี, อัตรา Damage, DC ใหม่, combat rule หรือ branching canon โดยไม่มีข้อมูลรองรับ.

### No Timer เป็นกติกาที่ต้องเปลี่ยนจริง

- **เลิกใช้ countdown, turn/time pressure, `TIME_MINUTES`, deadline `03:00`, `RITUAL_0300_PRESTATE`, `RITUAL_0300_FULL_POWER`, `ritual_toll` ในการกระตุ้นเหตุการณ์หรือ death**. ถ้ามี historical data ให้รองรับอ่าน save เก่าได้ แต่ไม่ให้ฟิลด์เหล่านี้ผลิตผลใน session ใหม่.
- **ห้ามทำให้การคุย/ค้นหา/คิดนาน = โทษหรือความตาย**. เวลาในเอกสารน้ำท่วม พ.ศ. 2534 ยังอยู่เพื่อ H1; ไม่ใช่เวลาเดินจริงของเกม.
- **F6 = optional event-driven backlash**: เปิดได้ต่อเมื่อพิธียัง `active|weakened` และมีผู้เล่น/วิชัยลงมือเสี่ยงกับด้าย/กำไลจริง *หลังได้รับคำเตือน*; ให้โอกาสผู้เล่นหยุด/ตั้งรับ/ช่วยกันก่อน resolve. ถ้าจัดการพิธีถูกต้องหรือ stopped แล้ว **ข้าม F6**. ห้ามมี scripted death / damage เพิ่มจากการล่วงเวลา.
- คง E5 conditional crossfire, F5 conditional execution attempt และ combat consequences ตามกฎเดิม. พิธีหยุดแล้วควรอัปเดตเส้นผูกที่ใช้จริง ไม่คงภัยจากพิธีเดียวหลัง stopped โดยไม่มีที่มา.

### State และ Ending

- ยึดค่า default/transition ของ **State Contract v5.2**; `KAEW_D_RESULT=not_met` เริ่มต้น, เมื่อพบ/คุย D3 → `talked`, D4 จึงเขียนทับด้วยผลจริง; `GHOST_ENCOUNTER` มีผลการ resolve จริง.
- แยก `HOSTAGES_FOUND`, `HOSTAGES_SAFE`, `HOSTAGE_FATE`, `HOSTAGES_DEAD`; คนที่ตายไม่อาจยังถูกนับ safe; ห้ามนับตายซ้ำ. ตัวประกันย้ายที่ต้องบันทึกตำแหน่งจริงก่อน E5/F5/F6.
- เหตุการรับรู้ NPC หลังคนตายต้องอาศัยอยู่ใกล้/เห็น/ได้ยิน/มีคนเล่า ไม่ปล่อยให้ NPC ทั้งหมู่บ้านรู้เองทันที.
- `RITUAL_STATUS=stopped` ≠ `KAEW_FINAL=calm`; เก็บแยกกัน. `KAEW_FINAL=sealed|controlled|departed` มีข้อยังไม่ล็อกไว้ในสคริปต์ ห้ามสร้าง trigger เพื่อให้เข้า Ending ที่ต้องการ.
- Ending A ต้องมีผู้รอดครบ, พิธีหยุด, ไม่มีคนตาย, วิชัยยังมีชีวิต, หลักฐานคดีเพียงพอ, **มีการเปิดเผยอดีตปี 2534 จริง** และแม่แก้วสงบโดยสมัครใจ ไม่เท่ากับเก็บไฟล์ไว้ใน inventory เฉย ๆ.
- ถ้าระบบ State มี schema ของตัวเอง ให้ mapping/migration โดยรักษาความหมาย; หลีกเลี่ยงสร้าง State ซ้ำเป็นแหล่งความจริงสองชุด. อย่าทำงาน v5.2 State Logic Finalization เพิ่มเองจากแนวคิดเก่า เว้นแต่เป็น invariant/bug fix ที่พิสูจน์ได้จากกติกาปัจจุบัน.

## ขั้นที่ 4 — Data Contract / Security

ออกแบบให้ **เรื่องเดียวกันขับทั้ง UI และ runtime**. ใช้ existing data model หรือแปลงเป็น structured scene data ที่มีอย่างน้อย:

```ts
interface SceneDefinition {
  id: string;             // e.g., 'B1', 'E5', 'H1', 'F6'
  act: string;
  title: string;
  optional?: boolean;
  entryConditions?: unknown;    // use existing condition AST/schema
  dmObjective?: string;
  presentNpcRules?: unknown;
  readAloud?: string[];
  npcDialogue?: unknown[];
  responses?: unknown[];
  clues?: unknown[];
  checks?: string[];      // check IDs reference canonical dice data
  failForward?: string;
  nextHandoff?: string;
  dmSecret?: string[];
  stateTransitions?: unknown[]; // authored events, not rendering side-effects
}
```

นี่คือ **ตัวอย่าง field เท่านั้น ไม่ใช่คำสั่งให้สร้าง schema ซ้ำ**. ตรวจและใช้ schema ปัจจุบันก่อน. Story content ต้องปลอดภัยจากการใช้ Markdown/HTML ไม่ sanitize; ห้ามให้ HTML script รันจาก content ที่นำเข้าโดยไม่ผ่าน guard.

**Security:** ผู้เล่นต้องไม่สามารถอ่าน dmSecret, future clue, private roll outcome และ editorial truth ผ่าน API, WebSocket, static bundle, shared state, localStorage, source map หรือ endpoint query. หาก architecture เดิมส่ง scene object ทั้งก้อนให้ client ผู้เล่น ต้องแก้ให้ server-side filter หรือเลือก per-role payload ก่อนส่ง (เฉพาะ DM รับข้อมูลลับ). ทดสอบ player-role ด้วยจริง.

## ขั้นที่ 5 — QA / Acceptance Criteria (ต้องรันจริง)

### UI
- [ ] Sidebar ครบ 31 ฉากตาม ACT; H1 flexible, F6 optional; Ending A–D เข้าถึงได้.
- [ ] Search ด้วย `D3`, `กำไล`, `วิชัย`, `H1` เจอผล; กดผลไปฉากถูก.
- [ ] อ่านแต่ละฉากได้จากการ์ดเดียวโดยไม่สลับไปเปิด Markdown; read-aloud เด่น; NPC/conditional responses, clues, failforward, next, secret มีครบ.
- [ ] DM secret เริ่มปิด; เปิด/ซ่อนได้; player client ไม่เห็นแม้ inspect network/API; ไม่เพียงใช้ CSS concealment.
- [ ] มือถือใช้ drawer ได้; ปุ่มและการ์ดไม่ล้น; ภาษาไทยไม่ถูกตัดผิด.
- [ ] การเลือกฉากเพื่ออ่าน **ไม่เปลี่ยน State/PHASE**; ขยับฉากจริงใช้ actions ของเกม.
- [ ] ฟีเจอร์ session, dice, player sync และ state controls เดิมไม่ regression.

### Story, State, Timer, Ending
- [ ] 31 scene IDs + 16 check IDs ครบ และ DC/ability/results ตรง v5.2 (ไม่เทียบแค่จำนวน).
- [ ] ค้น repo ไม่พบ timer state/event ที่ยังเป็นตัวกำหนดฉาก/HP/death; 03:00 ทางประวัติศาสตร์ยังใช้เป็นหลักฐานได้หากอยู่ในเอกสาร.
- [ ] ผู้เล่นคุย/สำรวจนานเพียงใดไม่มี timer penalty; เพิ่มไม่ตายเพราะเวลา; F6 ข้ามได้เมื่อพิธีหยุดถูกวิธี.
- [ ] F6 ถ้า trigger จากความเสี่ยงต้อง telegraph และเปิดโอกาสตอบโต้; ไม่มี dead branch ที่เรียกจาก clock.
- [ ] D3 คุยแม่แก้วโดยไม่เข้า D4 แล้ว F2 แสดงผล `talked`; ไม่พบ D3 เป็น `not_met` โดยไม่ default เป็น failure.
- [ ] E2 เปิดห้องขัง = found ไม่ใช่ safe; evacuation+fate determine safe. หากตัวประกันถูกพาออก E5 ห้ามเสกตัวมาเป็น human shield.
- [ ] วิชัยถูกจับ/หนี/ตาย: F5 ห้ามมี execution กับวิชัยที่ไม่ได้อยู่ในห้อง.
- [ ] H1 มีหลักฐานจริงจึงเปิดเผย; เอกสารปี 2534 เทียบกันได้ และไม่เสกยายหรือประเสริฐมาในเรือนร้าง.
- [ ] Ending A–D ตรวจตาม priority ของ Resolver และบรรยายผลให้สอดคล้องผู้รอด/ผู้ตาย/พิธีจริง.
- [ ] Regression save/session เดิม: มีแผน migration/compatibility ที่ไม่ชวนเกิด timer death ใหม่.
- [ ] `npm test`/`npm run build` หรือคำสั่งจริงของ repo ผ่าน; เพิ่มหรืออัปเดต automated tests เท่าที่ระบบรองรับ และรายงานสิ่งที่ไม่สามารถทดสอบ.

## Deliverables ที่ต้องส่งกลับ (ตอบเป็นภาษาไทย)

1. สรุป architecture ที่พบและ UI เดิมผูก story กับ game session อย่างไร.
2. **แก้โค้ดจริง**: component/page สำหรับ DM, style/responsive, scene data/content source, runtime mapping, state/trigger migration, tests.
3. แสดงรายชื่อไฟล์ที่แก้, จุดต่างหน้าจอ DM ก่อน→หลัง (screenshots ถ้ามี browser/test tooling), และตัวอย่างฉาก B1/E4/F6.
4. รายงานการนับ 31 ฉาก, 16 dice, ผลการค้นหา references ถึง timer/deadline ที่ไม่ควรเหลือ, test/build results, player-role security check.
5. แจ้ง **ประเด็นที่ต้องให้เจ้าของเกมตัดสินใจ** เช่น HP0/Critical Fail, การฟื้นแม่แก้ว, sealed/controlled, พิธีหยุดตาม Combat Rules, การพิสูจน์เปิดเผยหลักฐาน. **ห้าม silently invent mechanics** เพื่อทำให้ tests เขียว.
6. ถ้าต้องเปลี่ยน UX หรือ data model จาก reference เพราะข้อจำกัด repo ให้ระบุเหตุผลและ tradeoff.

**ทำงานจนได้ UI ที่ใช้ในเกมจริงและ content v5.2 ที่เชื่อม runtime แล้ว** ไม่จบงานที่การวาง HTML demo หรือการแก้เอกสารอย่างเดียว.
