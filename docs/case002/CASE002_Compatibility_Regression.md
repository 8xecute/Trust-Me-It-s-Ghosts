# CASE002 — Compatibility & Regression


**อัปเดต D05 และภาพ:** ผู้ใช้เลือกทางหยุดภัยถาวรหลังสังเวยแล้ว ดู [แบบจุดยึดไม้ครู](CASE002_FINAL_Anchor_Design.md) และ [ชุดภาพ/แกลเลอรี](CASE002_Artwork.md) จุดยึด+ร่างที่หยุดจริงทำให้จบ C ได้หลังสังเวย ไม่บังคับ D เพียงเพราะ completed ส่วนค่ามนุษย์/ศัตรู การตาย DC/Action และ Resolver ยังต้องล็อกก่อน runtime

วันที่: 15 พฤศจิกายน 2026
สถานะ: **DESIGN PLAN ONLY — ยังไม่แก้ runtime หรือเซฟ**

ผู้ใช้อนุมัติด้านดีไซน์แล้ว: **D01-B** ฐาน runtime v5.5 HP15/หนึ่งการกระทำต่อเทิร์น และ **D02-C** Active Defense รายละเอียดด้านล่าง การอนุมัติยังไม่ใช่ implementation หรือผลทดสอบ CASE002; D03–D07 ยัง pending ส่วน D05 เลือกทางหยุดภัยถาวรแล้วและรายละเอียดจุดยึดยังเป็นแบบ

## ขอบเขตที่ส่งมอบและสิ่งที่ยังไม่เปิดใช้

ชุด CASE002 เป็นบทฉบับร่าง สัญญาข้อมูล และแผน integration ตามข้อกำหนดใหม่ ยังไม่ใช่คดีที่เลือกเล่นได้ ไม่เพิ่ม CASE002 ลงตัวเลือกจริง และไม่แก้ source/content ของ CASE001 เพื่อทำให้บทใหม่ดูเหมือนพร้อมเล่น

รายละเอียดหลักฐานอยู่ใน [Repository Audit](CASE002_Repository_Audit.md) เอกสารนี้แยกผล baseline ของ CASE001 จาก acceptance ที่ CASE002 ยังต้องทำ ห้ามนับเอกสารหรือ prototype ว่าเป็น runtime proof

## Ownership และเส้นทางอ่าน/เขียนปัจจุบัน

| ข้อมูล | Reader/Writer ปัจจุบัน | สิ่งที่ต้องคงไว้ |
| --- | --- | --- |
| CASE001 content | [v51Content.ts](../../packages/server/src/case001/v51Content.ts#L13), [qa53.ts](../../packages/server/src/case001/qa53.ts#L11) | รุ่น เนื้อหา Q&A และ ending ไม่เปลี่ยนตาม CASE002 |
| World/action | [WorldStore](../../packages/server/src/world.ts#L39), [apply](../../packages/server/src/world.ts#L303) | server เป็น authoritative; CASE001 branch คงพฤติกรรมเดิม |
| Snapshot/DM | [snapshot](../../packages/server/src/world.ts#L263), [dmPanel](../../packages/server/src/world.ts#L200) | คง CASE001 shape ให้ client/เซฟเดิม; CASE002 ใช้ projector แยก |
| Portable save | [export/import](../../packages/server/src/portableSession.ts#L10) | legacy `baan-session` version1 และ CASE001 v5.5 validator ยังใช้ได้ |
| Autosave | [openRoomSaves](../../packages/server/src/roomSaves.ts#L6) | เก็บข้อมูลเดิม ไม่ rewrite ไฟล์เพียงเพราะตรวจพบ และ validate ก่อน publish |
| Checkpoint/retry | [checkpoint/restore](../../packages/server/src/world.ts#L157), [dedupe](../../packages/server/src/world.ts#L320) | คงผลทอยและการกันซ้ำผ่าน save/reconnect |
| Player display | [OnlineGame](../../packages/client/src/OnlineGame.tsx#L244), [CaseScene](../../packages/client/src/ui/case/CaseScene.tsx#L1) | CASE001 asset, NPC, ฉากและการทอยเดิมยังใช้ได้ |

## แผนเพิ่ม CASE002 โดยรักษา CASE001

1. เพิ่ม case identity ที่ boundary โดยมี `caseId` และ `contentVersion` ตรวจจาก server registry ไม่เดาจากชื่อ scene/ending เพิ่ม state/loader/trigger/resolver ของ CASE002 แยกจาก `case001`
2. Dispatch action ของ CASE002 ก่อนเข้า branch CASE001 ไม่ส่ง State หรือ Q&A ใหม่เข้า `newState51`, `validateSave51`, `availableQa53` หรือ ending resolver เดิม เพิ่ม schema เฉพาะคดีแทนการขยาย enum เฉพาะ CASE001 ให้รับทุกค่า
3. ใช้ shared Core Stats และสูตรเดิมตาม combat profile ที่อนุมัติ ไม่เปลี่ยน character presets เพื่อปิดช่องว่างของ friendly fire ห้ามเอาสถานะ `final55`/shield ของ CASE001 มาเป็นวิธีหยุดนายโรง
4. สร้าง CASE002 projection และ actions ให้ครบก่อนปรับ UI ใช้ภาพฉากเป็นหลัก DM เปิดฉากตามตำแหน่งจริง ผู้เล่นไม่ยืนยันเปลี่ยน Act และไม่เห็นคำถามสำเร็จรูปหรือเมนูทอยล่วงหน้าทุกจุด
5. เปิด case selection เมื่อผ่าน acceptance ของคดีใหม่แล้วเท่านั้น CASE001 ใช้ค่าเริ่มต้น/ทางเข้าเดิม และ API เดิมไม่ถูกตีความว่าเป็น CASE002

## Save compatibility ที่เสนอ — ยังไม่ใช้จริง

| รูปแบบ | Identity | การอ่าน | การเขียน/rollback |
| --- | --- | --- | --- |
| legacy version1 | ไม่มี explicit case identity; มี `world.case001` | ตรวจด้วย CASE001 v5.5 validator เดิมก่อนกำหนด identity ภายในเป็น CASE001 ปฏิเสธ shape ที่ขัดกัน | คง reader/writer เดิมและไฟล์ต้นฉบับ ไม่แปลงเป็น CASE002 |
| proposed version2 | `caseId`, `contentVersion`, state schema version | ตรวจ case registry/version และ validate คดีที่ระบุ ห้าม fallback ไป CASE001 เมื่อไม่รู้จัก | CASE002 เขียน version2; server รุ่นเก่าต้องปฏิเสธอย่างชัดเจน ไม่ควรลองเปิดแล้ว mutate |

Version2 เป็นข้อเสนอสำหรับ save envelope ไม่ใช่การ bump ตัวเลขเพียงอย่างเดียว ต้องระบุ migration/validator และ transport tests ก่อนเปิด writer ใหม่ Portable และ autosave ต้องมี identity สอดคล้องกัน

ต้องเก็บ groups, ตำแหน่งจริง, scene ต่อกลุ่ม, knowledge recipients, perceptions, pending attack stage, attacker roll, defender response ที่ใช้แล้ว, ผล damage/death, sacrifice evidence และ dedupe state ให้ครบ การโหลดกลาง D3 ต้องไม่ทอยใหม่หรือใช้ Reaction ได้อีกเพราะ reconnect

นำเข้าโดยตรวจ membership และ state ใน store ทดลองก่อน publish ทั้งคู่ตามแนว [portableSession](../../packages/server/src/portableSession.ts#L31) Unknown case/version, mixed CASE001/CASE002 state และ dangling references ต้อง fail โดยไม่สร้างห้องค้าง ไม่ overwrite เซฟเดิม

Rollback: ก่อนเปิด CASE002 writer สำรองเซฟที่เกี่ยวข้อง คง legacy reader และ CASE001 source เดิมไว้ หาก rollback runtime ให้ปิดการสร้าง CASE002 ห้องใหม่ เก็บ version2 ไว้โดยไม่ downgrade/แปลงทิ้ง Runtime เก่าไม่รองรับการ resume คดีใหม่ จึงต้องแจ้ง incompatibility และเก็บไฟล์สำหรับรุ่นที่รองรับ ไม่มีการล้างกลุ่มหรือ pending attack เพื่อให้โหลดผ่าน

## Split party และขอบเขตข้อมูล

- จำนวนทีมและสมาชิกมาจากการตัดสินใจจริง รองรับ 1/1, 1/2, 2/2, 2/3, 3/3 รวมถึงไม่แยกทีม ไม่มี teleport จากการเปลี่ยนชื่อ Act
- server ถือ entity จริง ตำแหน่งจริง และ perception map ชุดเดียว client ส่ง `appearanceRef` ที่ได้เห็น ห้ามส่ง target identity จริงเพื่อหลบภาพลวงตา
- `appearanceRef` ต้องผูก viewer และ perception revision ตรวจ stale/cross-view refs ตำแหน่งและ range ใหม่ตอน commit การโจมตี
- ก่อน reveal ห้าม true target ID, HP, profession, portrait key, log actor/target, event ID หรือ error บอกตัวจริงโดยอ้อม
- กรอง roll/HP/inventory/history/หลักฐานของอีกกลุ่มด้วย allowlist ไม่ใช้ `...world` แล้วหวังให้ UI ซ่อนให้
- เมื่อรวมทีมไม่ union ความรู้โดยอัตโนมัติ บันทึกสิ่งที่ผู้เล่นบอกต่อ ผู้รับ และลำดับจริง อนุญาตการตรวจด้วยเสียง สัมผัสหรือรหัสที่เหมาะสมโดยไม่บังคับทอยทุกวิธี
- DM เห็นตัวจริงและแต่ละ perception ส่วน preview ผู้เล่นใช้ projector ชุดเดียวกับ payload ที่ส่งจริง ไม่เอา DM-only data เข้า public asset/bundle

## Pending attack และการกันซ้ำ

ลำดับที่ต้องรองรับตาม D02-C ที่อนุมัติคือ Intent → ตรวจ/ยืนยัน → ฝ่ายรับ commit โหมดและจอง Focus/Reaction ก่อน Attacker Roll และก่อนรู้ผล → attacker roll → identity reveal แก่ฝ่ายรับ → defense roll ตามโหมดที่ commit ไว้ → resolve โดย server ทุกขั้นมี pending attack ID และ stage ที่ตรวจได้ ต้องทดสอบทั้ง event เดิมส่งซ้ำและใช้ action ID ใหม่ยิงซ้ำใส่ pending attack เดิม

โค้ดเดิม [world.ts](../../packages/server/src/world.ts#L320) กันซ้ำตาม actor/action ID และ serialize `seen` เป็นฐานให้ใช้ต่อ แต่ยังไม่พิสูจน์ transaction ของ CASE002 การทอยแล้วต้อง freeze ผลตาม attack ไม่ย้อนเปลี่ยนตัวเลขเพื่อให้บทเกิด และ apply HP/resource/death ได้ครั้งเดียว

D02-C ได้รับอนุมัติด้านดีไซน์แล้ว แต่ยังไม่มี Active Defense runtime ของ CASE002 ใช้งาน สูตรกายภาพคือ `D20 + BODY + preparedGuardBonus` สูตรจิตใจคือ `D20 + RES + preparedGuardBonus` แทนฐาน 10 ของ PDEF/MDEF; ไม่บวก PDEF/MDEF อีกชั้น ต้นทุน 0 AP, Focus1, หนึ่ง Reaction ต่อรอบ และจ่ายครั้งเดียว ไม่ลอง Fixed Defense ก่อนแล้วค่อยทอยแก้ ไม่สลับกลับ Fixed Defense หลังเห็นผล และไม่ใช้ Reaction อื่นซ้ำใน hit เดียว Guard ต้องเตรียมไว้ตามสิทธิ์จริง ผู้ไม่มี Focus/Reaction ไม่รู้ตัว หรือไม่มีวิธีรับมือใช้ Fixed Defense ตามฐานที่อนุมัติ NPC ยังไม่มีสิทธิ์ D02-C จนอนุมัติ profile ใน D03

Generic lethal ยังรอ D03 ห้ามถือ HP0 เป็น death เพื่อทำ sacrifice สำเร็จ การตายโดยนายโรง/ผีไม่เข้าเงื่อนไขเครื่องสังเวยแม้เกิดในพื้นที่แสดง การอนุมัติ D01-B/D02-C ไม่อนุมัติค่าศัตรู มนุษย์ วิธี FINAL หรือ DC เพิ่มเติม

## Acceptance matrix ของ CASE002

ทุกข้อด้านล่างมีสถานะ **NOT IMPLEMENTED / ยังไม่รัน** ไม่ใช่ผลผ่านจากการตรวจเอกสาร

| ID | กรณีที่ต้องทดสอบ | หลักฐาน runtime ที่ต้องได้ |
| --- | --- | --- |
| C2-01 | ผู้เล่นสองคนแบ่ง 1/1 | server เก็บสมาชิกและตำแหน่งจริง; แต่ละคนเห็นฉาก/ข้อมูลของตน |
| C2-02 | ผู้เล่นหกคนแบ่ง 3/3 | DM หนึ่งคนไม่ถูกรวมเป็นสมาชิกกลุ่ม; ไม่มีข้อมูลข้ามทีม |
| C2-03 | ไม่แยกทีม | เดินเส้นทางสืบสวนและเข้าสู่ E/FINAL ได้โดยไม่มี death หรือ teleport บังคับ |
| C2-04 | ภาพลวงตาต่างกันสองฝ่าย | snapshot, ack และ Socket payload ไม่เผย identity map; opaque ref ตรวจผู้รับ |
| C2-05 | ตรวจสอบโดยไม่โจมตี | มีทางยืนยันตัวตน/ไปต่อ; ไม่บังคับ attack หรือสำเร็จทอยเดียว |
| C2-06 | ฝ่ายโจมตีพลาด | damage0; ผลทอยบันทึกครั้งเดียว; ยังเปิดโปงภาพลวงตาได้ |
| C2-07 | commit D02-C ก่อน Attacker Roll แล้วทอย Defense หลัง identity reveal | กายภาพ D20+BODY หรือจิตใจ D20+RES แทนฐาน10; 0 AP/Focus1/หนึ่ง Reaction; ไม่ตรวจ Fixed Defense ซ้ำและไม่มี Guard ย้อนหลัง |
| C2-08 | Network event/reconnect ซ้ำ | roll, Focus, damage และ death ไม่เกิดซ้ำ รวม ID ใหม่ใส่ pending เดิม |
| C2-09 | Friendly fire บาดเจ็บ | HP เปลี่ยนจริงโดยไม่ตั้ง death อัตโนมัติ |
| C2-10 | ช่วยอิงโดยไม่ทำร้าย | ING_RESCUED จากการกระทำจริง; ไม่มีการตายจากบทอ่าน |
| C2-11 | อิงบาดเจ็บแล้วช่วยได้ | เก็บ injury/treatment ตามกฎจริง ไม่รีเซ็ต HP จากเปลี่ยนฉาก |
| C2-12 | อิงตายจากผู้เล่น | ต้องอ้าง approved lethal resolver, action, killer และ victim จริง |
| C2-13 | นายโรงฆ่าอิง | combat/death จริง แต่ sacrifice ไม่ completed |
| C2-14 | สังเวยสำเร็จตั้งแต่ D | E/FINAL และ ending รับรู้ permanent return; พิธีเดิมไม่สะกดกลับ |
| C2-15 | ป้องกันสังเวยทั้งหมด | FINAL ยังเข้าและจบได้โดยไม่สร้างเหยื่อเพิ่ม |
| C2-16 | จำนวนมนุษย์ในคืนแปด | มีเฉพาะทีม ประยูร อิง; เอกสารย้อนหลังไม่สร้างมนุษย์ปัจจุบัน |
| C2-17 | สืบนาน/พัก | ไม่มี countdown หรือ death จากเวลาผ่านไป |
| C2-18 | Secret negative tests | ตรวจ serialized payload/bundle ทั้งหมด ไม่ตรวจเฉพาะ DOM |
| C2-19 | Ending A–D และผลผสม | priority deterministic; บรรยายตรง survivors, killer, sacrifice, boss status |
| C2-20 | CASE001 regression | คดีเดิมเปิด เล่น โหลดเซฟ export/import และ Socket ผ่านหลัง integration |

เพิ่ม boundary tests: unknown/mixed case save, perception ref หมดอายุหรือของอีกคน, spoofed DM action, disconnected defender, double response, save ทุก pending stage, knowledge share ที่ไม่ได้เกิดจริง และ State ไม่เปลี่ยนเมื่อเพียงเปิด Q&A

Boundary ของ D02-C ที่ต้องพิสูจน์เพิ่ม: ผู้รับไม่มี Focus/ใช้ Reaction แล้ว/ไม่รู้ตัวใช้ Fixed Defense ตามสิทธิ์เดิม, commit ห้ามอ่านผลโจมตีก่อน, ไม่เปลี่ยนโหมดหลัง reveal, จองและจ่าย Focus/Reaction ครั้งเดียวผ่าน retry/save/reconnect, ไม่ทอย Defense สองครั้ง และ NPC ไม่มี profile ที่ยังไม่อนุมัติ การทดสอบทั้งหมดของ CASE002 ยังเป็น **NOT IMPLEMENTED / NOT RUN**

## ผล baseline CASE001 ที่มีอยู่

ผลต่อไปนี้ผู้รวมงานตรวจในสภาพ repository ระหว่างจัดชุดเอกสาร CASE002 ไม่ใช่การรับรอง integration ที่ยังไม่ได้เขียน:

เป็นผล ณ เวลาที่รัน ไม่ใช่การรับรอง working tree/combined diff ล่าสุด มีงานภายนอก CASE002 แก้ client พร้อมกัน ได้แก่ `OnlineGame`, `CaseScene`, `EncounterBoard`, `TurnEncounter`, `DmPlayerView`, `DmWorkspace` และชุด `sceneArt`/assets/tests งานนี้ไม่แตะ source เหล่านั้น ผล client 50/50 รันก่อนมี scene-art test ใหม่ และไม่ได้รัน broad checks ซ้ำเพื่อรับรองการเปลี่ยนของแชทอื่น ผู้รวมงานต้องแยกการตรวจงานเหล่านั้นออกจาก baseline นี้

| การตรวจ | ผล | ข้อจำกัด |
| --- | --- | --- |
| Server tests | **312/312 ผ่าน** | Node24 `--experimental-transform-types` พร้อมตัวช่วย `.local-logs/case002-resolve.mjs` resolve `.js` ไป `.ts` เพราะ `tsx` ไม่พร้อม |
| Client tests | **50/50 ผ่าน** | Node24 native TypeScript และ `.local-logs/case002-client-resolve.mjs` ใช้ esbuild สำหรับ TSX และ extensionless import เพราะ `tsx` ไม่พร้อม |
| `npm run typecheck` | **ผ่าน** | เป็น baseline code เดิม ไม่ใช่ CASE002 runtime |
| `npm run build` ครั้งแรก | **ไม่ผ่าน** | ขาด `VITE_SERVER_URL` สำหรับ production client |
| Build/rebuild หลังระบุ env | **ผ่าน** | ใช้ `VITE_SERVER_URL=https://trust-me-it-s-ghosts.onrender.com` เฉพาะคำสั่งตาม [DEPLOYMENT](../../DEPLOYMENT.md#L18) ไม่มีการ deploy หรือเปลี่ยน environment ถาวร |
| Socket smoke หลัง build | **7/7 ผ่าน** | ครั้งแรกติด `EACCES 127.0.0.1` เพราะ environment จำกัดการเชื่อมต่อ; รันใหม่หลังอนุญาต local network แล้วผ่าน |
| CASE002 runtime acceptance | **NOT IMPLEMENTED / ไม่ได้รัน** | ยังอยู่ design/story/contract stage |
| User playtest | **ไม่ได้ทำ** | A1 standalone prototype ไม่เชื่อม State/Multiplayer และไม่เป็นหลักฐานนี้ |

## คำสั่งสำหรับรอบ integration

รันจาก repository หลักใน [PROJECT_LAYOUT](../PROJECT_LAYOUT.md#L1):

```powershell
npm run typecheck
npm run build
node --import tsx --test packages/server/tests/*.test.ts
npm run test -w @baan/client
node --test packages/client/tests/*.test.mjs
node --test tests/smoke/production-smoke.test.mjs tests/smoke/production-v51-smoke.test.mjs tests/smoke/production-session-smoke.test.mjs tests/smoke/production-npc-placement.test.mjs tests/smoke/autosave-status.test.mjs
```

ถ้า environment ยังไม่มี `tsx` ให้ใช้ Node24 transform-types และ resolver ที่ตรวจไว้ โดยรายงานคำสั่ง/ข้อจำกัดจริง ไม่อ้างว่ารันคำสั่ง `tsx` ผ่าน Production build ต้องมี `VITE_SERVER_URL` ที่ใช้ทดสอบก่อน build ตามการตรวจของผู้รวมงาน

ก่อนเปิด CASE002 ให้บันทึกผล C2-01 ถึง C2-20 และ evidence ของ server/client/Socket แยกจาก CASE001 พร้อมตรวจไฟล์ค้างของผู้ใช้อีกครั้ง ไม่มี commit/push โดยงานนี้
