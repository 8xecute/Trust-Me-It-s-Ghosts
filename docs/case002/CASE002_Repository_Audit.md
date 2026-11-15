# CASE002 — Repository Audit


**อัปเดต D05 และภาพ:** ผู้ใช้เลือกทางหยุดภัยถาวรหลังสังเวยแล้ว ดู [แบบจุดยึดไม้ครู](CASE002_FINAL_Anchor_Design.md) และ [ชุดภาพ/แกลเลอรี](CASE002_Artwork.md) จุดยึด+ร่างที่หยุดจริงทำให้จบ C ได้หลังสังเวย ไม่บังคับ D เพียงเพราะ completed ส่วนค่ามนุษย์/ศัตรู การตาย DC/Action และ Resolver ยังต้องล็อกก่อน runtime

วันที่ตรวจ: 15 พฤศจิกายน 2026
สถานะ: **DESIGN PLAN ONLY — ยังไม่มี CASE002 runtime**
ฐานเริ่มตรวจ: `f87473a` พร้อมไฟล์ค้างที่ไม่อยู่ในขอบเขตงานนี้ รวม `docs/case001/EARLY_SPOILER_AUDIT.md` รายการนี้ไม่ใช่การรับรองว่า working tree มีเพียงไฟล์ดังกล่าว

สถานะการตัดสินใจล่าสุด: ผู้ใช้อนุมัติ **D01-B** ให้ CASE002 ยึด runtime v5.5 ปัจจุบัน HP15 และหนึ่งการกระทำต่อเทิร์น และ **D02-C** Active Defense ตามสูตร/ต้นทุน/จังหวะที่เลือกแล้ว การอนุมัตินี้เป็น **approved design / runtime NOT IMPLEMENTED** ไม่ได้เปิดใช้กฎในเกม D03–D07 ยังรอตัดสินใจ ส่วน D05 เลือกทางหยุดภัยถาวรแล้วและรายละเอียดจุดยึดยังเป็นแบบ

## ขอบเขตและหลักฐาน

ตรวจ repository หลักตาม [PROJECT_LAYOUT](../PROJECT_LAYOUT.md#L1) และ [AGENTS.md](../../AGENTS.md#L1) ใช้ CASE001 v5.5 เป็นตัวอย่างการจัดบทและข้อมูล ไม่คัดลอกเนื้อเรื่องหรือใช้ State ของคดีเดิมเป็น CASE002

ข้อกำหนดใหม่คือ “งานวัดคืนที่แปด” มีผู้สืบสวน 2–6 คนและ DM หนึ่งคน ไม่มี countdown ใช้การกระทำจริงเป็นตัวเปลี่ยน State และต้องมีมุมมองเฉพาะฝ่าย แผนนี้ยังไม่เปลี่ยน UI, กติกา, เซฟ หรือการเลือกคดีจริง

## ผลตรวจตามส่วนของระบบ

| ส่วน | สิ่งที่มีจริง | ข้อจำกัดสำหรับ CASE002 |
| --- | --- | --- |
| StoryScript loader | [v51Content.ts](../../packages/server/src/case001/v51Content.ts#L13) อ่าน JSON/Markdown ฝั่ง server แยกรุ่น | path ระบุ `case-001` และตรวจ 31 ฉาก/ending A–D โดยเฉพาะ ต้อง loader ของ CASE002 แยก |
| Scene routing | [guidedCase.ts](../../packages/server/src/case001/guidedCase.ts#L267) มีการเปิดและเปลี่ยนฉากโดย DM | การเดินทางและการเปิดฉาก v5.5 ย้ายผู้สืบสวนทุกคนพร้อมกันที่บรรทัด 267–268 และ 276–283 ไม่ใช่ split-party routing |
| State | [world.ts](../../packages/server/src/world.ts#L39) ถือ World บน server และมี `case001` | ไม่มี discriminator เลือกคดี และ State เรื่อง/ending ของ CASE001 ไม่ใช้ร่วมกับ CASE002 |
| Dice Cards | [storyDice.ts](../../packages/server/src/case001/storyDice.ts#L1), [world.ts](../../packages/server/src/world.ts#L605) มี DM ส่งการ์ดและผู้เล่นทอยตาม request | การ์ดผูกฉาก/State เดิมและ DC ต้นฉบับ ต้องข้อมูลคดีใหม่; ไม่ทำ attack roll ให้เป็นการ์ดสืบสวนโดยอัตโนมัติ |
| Q&A | [qa53.ts](../../packages/server/src/case001/qa53.ts#L11) โหลด bank/guard ฝั่ง server | เงื่อนไขเฉพาะ CASE001 ต้อง bank และ guard evaluator ของ CASE002; การเปิดอ่านคำตอบไม่ใช่เหตุการณ์เปลี่ยน State |
| NPC และภาพฉาก | [caseNpcs.ts](../../packages/shared/src/caseNpcs.ts#L1), [CaseScene.tsx](../../packages/client/src/ui/case/CaseScene.tsx#L1) | ชื่อ NPC และ asset mapping เป็น CASE001; เพิ่มข้อมูลคดีใหม่ ไม่เปลี่ยนชื่อข้อมูลคดีเดิม |
| Case selection | [CaseCatalog.tsx](../../packages/client/src/ui/lobby/CaseCatalog.tsx#L10) แสดง CASE002 เป็น coming-soon | ยังเลือกคดีไม่ได้; [caseStart](../../packages/server/src/world.ts#L480) สร้าง CASE001 โดยตรง |
| DM UI | [DmWorkspace.tsx](../../packages/client/src/ui/gm/DmWorkspace.tsx#L167) มี reader, queue, preview และบันทึกผล | ยังผูก `world.case001`; CASE002 ต้องแสดงขอบเขตข้อมูลก่อน ผลที่ต้องบันทึกถัดมา และบทสวมบทเป็นส่วนรอง |
| Player UI | [OnlineGame.tsx](../../packages/client/src/OnlineGame.tsx#L244) มีฉาก, การ์ดทอย และสมุด/ประวัติ | ยังอ่าน `world.case001`; ต้องฉากและ perceived entities ของตนเอง พร้อมพื้นที่ภาพใหญ่และเครื่องมือย่อได้ |
| Multiplayer | [index.ts](../../packages/server/src/index.ts#L50) ส่ง snapshot แยกราย socket | ใช้โครงส่งแยกได้ แต่ต้อง projector ของ CASE002 และทดสอบ payload จริง |
| Save/import | [portableSession.ts](../../packages/server/src/portableSession.ts#L13), [roomSaves.ts](../../packages/server/src/roomSaves.ts#L6) | file version 1 และ importer รองรับ CASE001 v5.5; restore ยังตรวจ `case001` โดยตรง |

## จำนวนคนและการแบ่งทีม

[Rooms v2](../../packages/server/src/rooms.ts#L23) รองรับสมาชิกสูงสุด 7 คนอยู่แล้ว [caseStart](../../packages/server/src/world.ts#L480) ไม่นับ DM ในจำนวนผู้สืบสวนและตรวจ 2–6 คน ไม่จำเป็นต้องเพิ่มความจุห้อง

[CaseMap](../../packages/server/src/case001/caseBattle.ts#L48) มี `sites[playerId]`, ตำแหน่ง และ `travelCaseMap()` ที่บรรทัด 90 เป็นตัวอย่าง ownership ฝั่ง server แต่ค่า Site และเส้นทางเป็นคดีเดิม การเปิดฉากหนึ่งให้ทั้งห้องไม่สามารถแทน C2/C3 ที่ดำเนินพร้อมกันได้

CASE002 ต้องเก็บสมาชิกกลุ่มจากการเลือกจริง แยกตำแหน่งจริงออกจากฉากที่แต่ละกลุ่มรับรู้ รองรับ 1/1, 1/2, 2/2, 2/3, 3/3 และเส้นทางรวมทีมโดยไม่แยก ไม่มีการย้ายตำแหน่งหรือแชร์ข้อมูลอัตโนมัติเมื่ออ่านบท C4/D5

## Combat: เอกสารอ้างอิงกับ runtime ต่างกัน

| ประเด็น | เอกสารอ้างอิง | runtime v5.5 ที่ตรวจพบ | ผลต่อ CASE002 |
| --- | --- | --- | --- |
| HP และทรัพยากร | [Combat Lite v1.1](../reference/01_COMBAT_LITE_RULES_v1_1.md#L5) ระบุ HP10, AP3 และ Reaction หนึ่งครั้งต่อรอบ | [character.ts](../../packages/shared/src/character.ts#L108) มี starting HP15; ตัวละครเก่าคงค่าเซฟ; [turn skills](../case001/TURN_CLASS_SKILLS_V55.md#L3) ใช้หนึ่งการกระทำต่อเทิร์น | ผู้ใช้เลือก D01-B แล้ว: CASE002 ใช้ฐาน runtime v5.5 HP15/หนึ่งการกระทำ ไม่เปลี่ยน global preset หรือเซฟ CASE001 |
| ความสามารถ | [Character v1.1](../reference/characters/CHARACTER_STATS_ABILITIES_v1_1.md#L1) มีชุดท่าดั้งเดิม 18 ท่า | [turnSkills.ts](../../packages/shared/src/turnSkills.ts#L1) มีท่า encounter หลัก 6 ท่า หนึ่งต่ออาชีพ และแยกจาก legacy talents | การมี metadata `reaction:true` ไม่ได้แปลว่าใช้ Reaction ชุดนั้นใน encounter v5.5 ได้ |
| Defense | [Combat Lite](../reference/01_COMBAT_LITE_RULES_v1_1.md#L30) ใช้ PDEF/MDEF คงที่ ไม่ทอยป้องกันเพิ่ม | [liteDefense/liteAttack](../../packages/shared/src/combatLite.ts#L6) ให้ `10 + BODY/RES + Guard2` และ `D20 + bonus >= defense`; code มีคำเตือนว่าเป็น playtest calculations | ต้องตรวจเส้นทาง resolver จริงด้วย; ไม่มี active defense roll ที่ใช้ได้ทั่วไป |
| Guard/คุ้มกัน | เอกสารมีค่า AP/Reaction และ trigger เฉพาะท่า | [caseBattle.ts](../../packages/server/src/case001/caseBattle.ts#L336) มีการประกาศโจมตีผีและผล ward/cover ในตาผี; [runbook ท่า](../case001/TURN_CLASS_SKILLS_V55.md#L5) อธิบายขอบเขต | ห้ามนำท่าที่ป้องกันตาผีมาให้ใช้ตอบ friendly fire หลังทอยฟรี ๆ หรือเพิ่ม Guard ย้อนหลัง |
| ความตาย | บาดเจ็บ/HP0 ไม่เท่ากับเสียชีวิตอัตโนมัติ | [storyV51.ts](../../packages/server/src/case001/storyV51.ts#L12) และเหตุการณ์ fatal เป็นเงื่อนไขเฉพาะเรื่อง CASE001 | ไม่มี generic death resolver สำหรับมนุษย์ทุกคนที่นำไปใช้กับอิงหรือผู้เล่นได้ทันที ต้อง rule contract ที่อนุมัติก่อนเปิด lethal path |
| ศัตรู | มี enemy presets ของ CASE001 | [caseBattle.ts](../../packages/server/src/case001/caseBattle.ts#L16) ระบุชนิดศัตรู CASE001 และค่าต่อสู้เฉพาะคดี | การแต่งรูปลักษณ์ใหม่ไม่ใช่การอนุมัติ HP/ATK/Damage ให้ผีหน้ากากหรือนายโรง ต้อง mapping ที่ตรวจสอบได้ |

ผลตรวจตารางข้างต้นอธิบายโค้ดเดิม ณ เวลาตรวจ ปัจจุบันยังไม่ได้เพิ่มสูตร AP, HP, Damage, Active Defense หรือ Lethal ให้ runtime CASE002 แต่ `CASE002_DEFENSIVE_ROLL` แบบ D02-C ได้รับอนุมัติด้านดีไซน์แล้ว จึงไม่ใช่คำถาม pending ซ้ำ

D02-C ใช้ `D20 + BODY + preparedGuardBonus` สำหรับกายภาพ หรือ `D20 + RES + preparedGuardBonus` สำหรับจิตใจ โดยแทนฐาน 10 ของ PDEF/MDEF ไม่บวก Defense เดิมอีกชั้น ต้นทุน 0 AP, Focus1 และหนึ่ง Reaction ต่อรอบ ผู้รับต้องเลือกโหมดและจองสิทธิ์ก่อน Attacker Roll/ก่อนรู้ผล จากนั้นล็อกผลโจมตี เปิด identity ให้ฝ่ายรับ แล้วจึงทอย Defense ตามโหมดที่ commit ไว้ ไม่ลอง Fixed Defense ก่อนและไม่เปลี่ยนกลับหลังเห็นผล Guard นับเฉพาะที่เตรียมตามกฎไว้จริง ผู้ไม่มีสิทธิ์ใช้ D02-C ใช้ Fixed Defense ตามฐานที่เลือก; NPC ยังต้องรอ profile ใน D03

Lethal และค่ามนุษย์/ศัตรูยังไม่อนุมัติ การสังเวยต้องอ้าง death event ที่ผ่าน resolver ที่อนุมัติแล้วเท่านั้น การเลือก D01/D02 ไม่อนุมัติความตาย Enemy Preset หรือ DC ของการ์ดสืบสวนโดยปริยาย

## Privacy boundary ที่ต้องเพิ่ม

ปัจจุบัน [snapshot](../../packages/server/src/world.ts#L264) ตัด secret blocks แล้วกระจาย `...world` กรอง `world.players` ตาม site ที่บรรทัด 272 แต่ `characters`, `playerNames`, `inventory`, `turns`, `lastCheck` ยังเป็นข้อมูลร่วม และ `latestRoll` ที่บรรทัด 291 เป็นค่ารวมทั้งห้อง ข้อนี้เป็นความเสี่ยงเมื่อเพิ่ม deception ไม่ใช่ข้อกล่าวหาว่า CASE001 มีภาพลวงตารั่วอยู่แล้ว

CASE002 ต้องสร้าง payload ด้วย allowlist ระบุ field ทีละรายการ ไม่ส่ง true identity map, true target ID, NPC status, หลักฐานอีกกลุ่ม หรือ pending attack ที่ผู้รับยังไม่มีสิทธิ์เห็น ใช้ opaque `appearanceRef` ต่อผู้รับและ perception revision ให้ server map กลับสู่ entity จริง ตรวจตำแหน่ง ระยะ และ action window ฝั่ง server เท่านั้น

ตรวจทุกทางออก ได้แก่ snapshot, action acknowledgement, Socket events, DM preview, roll/log/history, event IDs, error text, portrait key, accessibility label และ client bundle การซ่อนชื่อใน UI อย่างเดียวไม่ผ่านเงื่อนไข ห้ามนำ DM-only JSON/Markdown เข้า static public assets

[NarrativeState](../../packages/server/src/narrative.ts#L2) เก็บ recipients และกรอง history ได้ ใช้แนวทางนี้ต่อโดยไม่รวมความรู้สองทีมอัตโนมัติเมื่อกลับมาพบกัน [dmPanel/dmPreview](../../packages/server/src/world.ts#L200) ตรวจสิทธิ์ DM อยู่แล้ว; player preview ของ CASE002 ต้องใช้ projector เดียวกับ snapshot ของผู้เล่นจริง

## Action declaration

โค้ด [world.ts](../../packages/server/src/world.ts#L313) ปฏิเสธ `askGm`, `dmReply`, `planSubmit` และ API เก่า ตามแนวทางเดิมที่ไม่ใช้กล่องส่งข้อความหา DM Prompt CASE002 ล่าสุดขอช่องประกาศ Action อิสระ จึงเป็นความต้องการใหม่เฉพาะ CASE002 ไม่ควรเปิด API เก่ากลับให้ CASE001

หากทำ integration ให้ข้อความเป็นเจตนารอ DM ตรวจ ไม่ทอย ไม่เปลี่ยน State และไม่ resolve damage เอง กำหนดผู้รับตามฉาก/กลุ่ม การสื่อสารข้ามกลุ่มต้องเกิดขึ้นจริงและบันทึกได้ ไม่เป็นช่องเฉลยข้อมูลอีกทีมโดยอัตโนมัติ

## ผล baseline และสถานะส่งต่อ

ผลที่ผู้รวมงานบันทึกระหว่างจัดชุด CASE002:

ผลเหล่านี้เป็น baseline ณ เวลาที่รัน ระหว่างมีงานอื่นแก้ client พร้อมกัน ต่อมาพบการเปลี่ยน `OnlineGame`, `CaseScene`, `EncounterBoard`, `TurnEncounter`, `DmPlayerView`, `DmWorkspace` และชุด `sceneArt`/assets/tests ซึ่งไม่ได้เป็นงาน CASE002 นี้ ไม่ได้แก้หรือย้อนงานเหล่านั้น ผล client 50/50 เกิดก่อนมี scene-art test ใหม่ จึงไม่รับรอง combined diff ปัจจุบัน และไม่มีการรันทดสอบกว้างซ้ำเพื่อรับรองงานของแชทอื่น

- Server baseline: **312/312 ผ่าน** ด้วย Node24 `--experimental-transform-types` และตัวช่วย `.local-logs/case002-resolve.mjs` สำหรับ resolve import `.js` กลับไปไฟล์ `.ts` เนื่องจาก package `tsx` ไม่พร้อมใน environment นี้
- Client baseline: **50/50 ผ่าน** ด้วย Node24 และตัวช่วย `.local-logs/case002-client-resolve.mjs` ใช้ native TypeScript ร่วมกับ esbuild สำหรับ TSX และ extensionless import; ไม่ได้อ้างว่า package `tsx` พร้อมใช้งาน
- `npm run typecheck`: **ผ่าน**
- Build: **ผ่าน** หลังระบุ `VITE_SERVER_URL=https://trust-me-it-s-ghosts.onrender.com` เฉพาะคำสั่ง ตาม [DEPLOYMENT](../../DEPLOYMENT.md#L18); ครั้งแรกที่ไม่มีค่านี้ไม่ผ่าน ไม่มีการ deploy หรือเปลี่ยน environment ถาวร
- Socket smoke: **7/7 ผ่าน** หลังอนุญาต local network; ครั้งแรกติด `EACCES 127.0.0.1` จากข้อจำกัดการเชื่อมต่อของ environment ไม่ใช่ผลยืนยันว่าเกมล้มเหลว
- CASE002 runtime tests: **NOT IMPLEMENTED / ยังไม่รัน**
- ไม่ได้อ้างว่ามี user playtest และไม่ได้ใช้ standalone A1 prototype เป็นหลักฐานว่า runtime ผ่าน

ก่อนเริ่ม Phase3 ต้องทบทวน [Compatibility/Regression](CASE002_Compatibility_Regression.md) และเติม implementation contract ตาม D01-B/D02-C ที่อนุมัติแล้ว ส่วน D03–D07 โดยเฉพาะ NPC/enemy stats, lethal, วิธีหยุดนายโรง, ending priority และ DC ยังรอตัดสินใจ ไม่ถือว่าการบันทึกตัวเลือกทำให้ runtime พร้อมเล่น
