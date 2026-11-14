# รายการระบบค้างสำหรับพิจารณาลบ

ตรวจวันที่ 14 พฤศจิกายน 2026 จาก working tree ปัจจุบัน ไม่ใช่เฉพาะ commit ล่าสุด

ขอบเขต: เกม CASE 001 v5.5 ที่ DM คุมเนื้อเรื่อง ไม่มีระบบข้อความถึง DM หรือผู้เล่นยืนยันเปลี่ยนบท ส่วน encounter แยกออกไปออกแบบในแชทอื่น

ผลนี้เป็นการตรวจเส้นทางเรียกจาก App/OnlineGame, จุดเรียก API, feature flags และทางรองรับเซฟเก่า ไม่ใช่การรับรองจาก coverage ทุกสาขา ยังไม่ลบหรือแก้โค้ด และยังไม่รัน tests เพราะเป็นงานตรวจรายการ

## A — เสนอเก็บกวาดก่อน ความเสี่ยงต่ำ

| ID | รายการ | หลักฐาน | ขอบเขตลบและข้อควรระวัง |
| --- | --- | --- | --- |
| A1 | หน้ากล่องคำถามเข้า DM แบบเก่า | DmWorkspace.tsx ยังมี DmQuestions และสาขา dmTab === questions แต่ไม่พบปุ่มหรือจุด setDmTab('questions') แล้ว ปัจจุบันปุ่มไปคลังคำตอบแทน | ลบ component, สาขาแท็บ, pendingQuestions และ CSS เฉพาะส่วนที่ไม่มีผู้เรียก โดยคงคลัง Q&A และ dmSendQa |
| A2 | ตัวเชื่อมให้ผู้เล่นยืนยันบทใน CaseStoryThread | ยังรับ onConfirm และ connected เพื่อแสดงปุ่ม แต่ไม่พบผู้เรียกจริงส่ง onConfirm ใน src | ลบ props และปุ่มเก่าได้ ระบบ DM เปิดบทกับ server guards ต้องคงไว้ |
| A3 | props คำถามผู้เล่นใน GuidedPanel | site และ pendingQuestions ยังอยู่ใน signature หลังเลิกฟอร์มข้อความ และ component คืน null เมื่อไม่ใช่ DM | ลบ props และจุดส่งค่าที่ไม่ใช้งาน ไม่ลบ GuidedPanel ทั้งตัวเพราะยังมีทางอ้างอิงจาก DM/legacy |
| A4 | CSS ปุ่มคำถามสำเร็จรูป | พบ .question-options ใน case-interface.css และ style.css แต่ไม่พบ class นี้ใน JSX ปัจจุบัน | ลบเฉพาะ selectors ที่ยืนยันไม่มีผู้ใช้ ไม่ลบ CSS ทั่วไปของคำสั่งหรือแบบฟอร์ม |
| A5 | ตัวเชื่อมคำสั่ง vision ของผู้เล่นใน encounter | TurnEncounter ไม่มี choice id vision แล้ว แต่ยังมี storyOption, onStoryRoll, เงื่อนไข choice === vision และ OnlineGame ยังส่ง callback มา | เสนอเก็บกวาดในแชท encounter เท่านั้น ห้ามลบการ์ด C4_DROWNED_ECHO_VISION หรือการทอยที่ DM ส่ง |

ไฟล์อ้างอิง:

- packages/client/src/ui/gm/DmWorkspace.tsx
- packages/client/src/ui/case/CaseStoryThread.tsx
- packages/client/src/ui/case/GuidedPanel.tsx
- packages/client/src/ui/combat/TurnEncounter.tsx
- packages/client/src/OnlineGame.tsx
- packages/client/src/style.css
- packages/client/src/case-interface.css

## B — ไม่ใช้ใน flow v5.5 แต่ต้องตัดสินใจก่อนลบ

| ID | รายการ | สถานะปัจจุบัน | ต้องตัดสินใจ/ผลกระทบ |
| --- | --- | --- | --- |
| B1 | API และข้อมูลคิวข้อความเดิม | world.ts ยังมี askGm, dmReply, dmAnswer, DmQuestion, pendingQuestionCount, suggestedAnswers และ dmSession.questions; v5.5 ปฏิเสธ askGm แล้ว แต่รุ่นเก่ายังมี tests/ทางใช้งาน | จะเลิกรองรับข้อความในห้องและเซฟเก่าด้วยหรือไม่ ต้องทำ migration หรืออ่านฟิลด์เก่าแล้วละทิ้งอย่างชัดเจน ไม่ลบ dmSendQa และประวัติ answers |
| B2 | ระบบวางแผนสำรวจพร้อมกัน | ยังมี ExplorationPlan, planSubmit/planResolve/planCancel ใน world.ts แต่ไม่พบผู้เรียกใน client ปัจจุบัน และ sceneMode ปฏิเสธการส่ง/แก้แผน | ถ้าไม่มีแผนใช้กับคดีอื่น สามารถถอน API, projection, serializer และ tests ของระบบนี้เป็นชุดได้ ต้องจัดการแผนค้างในเซฟเก่า |
| B3 | renderer Phaser แบบเดิม | App.tsx เปิด OnlineGame เท่านั้น ไม่พบผู้เรียก createGame ภายนอก rendering/game.ts; game.ts อ้าง game/movement.ts, encounter.ts, objects.ts | ถ้ายืนยันใช้ React UI อย่างเดียว ให้ลบ dependency graph ของ renderer พร้อม phaser ได้ ต้องตรวจ utility ที่ยังมี tests และ asset ที่หน้าเกมใหม่ใช้อยู่ ห้ามลบภาพยกโฟลเดอร์ |
| B4 | ไฟล์เนื้อเรื่องและ adapter v4.x–v5.3 | v51Content.ts ยังโหลดหลายเวอร์ชันตั้งแต่เริ่ม รวมถึงการเทียบกติกาจุดทอยเดิม | ต้องเลือกระหว่างรองรับเซฟเก่าต่อ หรือทำ migration เป็น v5.5 ก่อน การลบ JSON เก่าอย่างเดียวทำให้ server เริ่มไม่ขึ้น |
| B5 | Timer, เหตุ 03:00 และ ritual_toll | v5.5 ใช้ No Timer แต่ storyV51.ts ยังมีสาขาเวลาและฟิลด์สำหรับรุ่นเก่า โดยมี noTimer guard กันไว้ | ลบได้เมื่อเลิกรองรับเวอร์ชันจับเวลาหรือย้ายข้อมูลเก่ามาเรียบร้อย ห้ามลบฟิลด์ State โดยไม่มี migration |
| B6 | เหตุมีด/จับตัวประกันเป็นโล่ใน E5 แบบเก่า | ตัวเลือก e5-threat, shield และ fatal ถูกกรองออกใน v5.5 แต่ reducer/ข้อมูล death cause เก่ายังอยู่ | ต้องแยกกติกา v5.5 ออกจาก legacy ก่อน ไม่ลบประวัติผู้เสียชีวิตจากเซฟเก่า และไม่สร้างเหตุฆ่าผ่านพิธี 4A ขึ้นแทนเอง |
| B7 | scenario sample และ flow เกมเก่า | sample.json/sample.dm.json ยังถูก world.ts โหลด และมีการใช้ progress/ending ของระบบกลาง | แม้ไม่ใช่คดีหลักปัจจุบัน ยังไม่ใช่ไฟล์ไร้ผู้เรียก ต้องตัดสินใจว่าจะเก็บ engine ตัวอย่างไว้สำหรับคดีอื่นหรือถอนทาง legacy ทั้งชุด |

## C — ปิดบางโหมด แต่ยังไม่ควรลบ

| ID | รายการ | เหตุผล |
| --- | --- | --- |
| C1 | EncounterBoard และระบบกริด | ยังถูก OnlineGame เรียกเมื่อ battle ไม่มี turnEncounter รวมถึงเซฟเก่าที่เริ่มต่อสู้แบบกริด โหมดไม่มี DM และ encounter ที่ยังไม่ถูกย้าย ต้องคุยในแชท encounter ก่อน |
| C2 | พรสวรรค์/สกิลอาชีพ | BASIC_RULES_MODE=true พักการใช้งาน แต่โค้ดสูตร ความสามารถ และ tests ยังอยู่ อีกทั้งเกี่ยวข้องกับแนวทางตัวละคร/encounter ที่จะพัฒนา |
| C3 | background และ backgroundUses | โบนัสภูมิหลังถูกยกเลิก แต่ยังมีการอ่านและ serialize ข้อมูลเก่า ต้องแยกประวัติสำหรับสวมบทออกจากกลไกโบนัส และรักษาความเข้ากันได้ของเซฟ |
| C4 | ต้นฉบับใน docs/reference และ assets/source | ไม่ถูกโหลดขณะเล่น แต่เป็นข้อมูลอ้างอิงของ importer/ตรวจความถูกต้อง และภาพต้นฉบับที่สร้าง runtime assets จึงไม่ใช่ขยะ |
| C5 | dmSendQa, dmSession.answers, คลังคำตอบและประวัติส่ง | ยังใช้จริง เป็นระบบแทน inbox เก่า ห้ามลบรวมกับ B1 |
| C6 | เซฟ, reconnect, attendance, rewind และ State guards | ยังเป็นระบบหลัก แม้หน้าผู้เล่นไม่มีปุ่มควบคุมเรื่องราวแล้ว |

## D — พบ bug ต้องแยกจากการลบโค้ด

GuidedPanel.tsx มี if(!isDm) return null แต่ส่วนแสดง events/บทในฉากด้านล่างถูกครอบด้วย !isDm && (...) อีกครั้ง ทำให้สาขานั้นเข้าไม่ได้สำหรับทั้งผู้เล่นและ DM

นี่ไม่ใช่หลักฐานว่าบท DM ทั้งก้อนควรถูกลบ ต้องตรวจว่าต้องการเก็บ fallback สำหรับ DM/legacy หรือไม่ แล้วแก้เงื่อนไขหรือรวม UI ให้มีเจ้าของเดียว ห้ามลบทั้ง component เพียงเพราะสาขานี้ไม่ทำงาน

ยังมีข้อความรอผู้สืบสวนยืนยันใน fallback นี้ ซึ่งไม่ตรง flow v5.5 ปัจจุบัน ต้องแก้หรือลบเฉพาะ fallback ที่ตัดสินใจเลิกใช้

## ลำดับเสนอ

1. เริ่ม A1–A4: cleanup UI และ props ที่ไม่ใช้ ไม่เปลี่ยนเกมหรือเซฟ
2. ส่ง A5 ให้แชท encounter พิจารณา เพื่อไม่แก้ไฟล์ชนกัน
3. ตัดสิน B1/B2/B3 ว่าจะเลิกระบบเก่าทั้งชุดหรือไม่ ก่อนแก้ API/dependencies
4. วางนโยบายเซฟเก่าก่อน B4–B6
5. เก็บ C ไว้ และแก้ D เป็น bug แยก

ก่อนลบจริงต้องรัน tests/build และเส้นทางเปิดเซฟ/ส่งคำตอบ/ทอย/เปลี่ยนฉากซ้ำอีกครั้ง รายงานนี้ยังไม่อนุมัติการลบรายการใด


## ผลดำเนินการ 14 พฤศจิกายน 2026

ผู้ใช้สั่งลบรายการและเปิดแชทวิเคราะห์เนื้อเรื่องแยก งานนี้ยังไม่เสร็จทั้งรายการ เพราะรอคำชี้แจงว่ารวมกลุ่ม C ซึ่งเป็นระบบที่ยังใช้จริงหรือไม่

- A1–A4: ลบกล่องคำถามเข้า DM เก่า แท็บที่เข้าไม่ได้ props ยืนยันบทของผู้เล่น props สำรวจที่ไม่ใช้ และ CSS ปุ่มคำถามเก่า คงคลังคำตอบและการส่งคำตอบโดย DM
- B3: ถอน Phaser จาก package และ lockfile ลบ renderer game/villageArt/isometric/view พร้อมโมดูล client game movement/encounter/objects, data/location และ tests เฉพาะโมดูลที่ถอน ตรวจแล้วไม่มีผู้เรียกจากเกมปัจจุบัน เก็บภาพทั้งหมดและระบบต่อสู้ React ไว้
- D: แก้ fallback DM ให้เห็นบทฉากแทนสาขาที่เข้าไม่ได้ ลบข้อความรอผู้เล่นยืนยันและปุ่มยืนยันบทของผู้เล่นใน fallback
- A5: ยังไม่แตะ เนื่องจาก encounter อยู่ในแชทแยกและมีการเปลี่ยนไฟล์อยู่
- B1/B2/B4/B5/B6/B7: ยังไม่ถอน ต้องจัดการ API, serializer, State และทางรองรับเซฟเก่าร่วมกัน ไม่ใช่ลบไฟล์ข้อมูลแยกชิ้น
- C1–C6: ยังเก็บทั้งหมด รอคำชี้แจงขอบเขตการลบ

ตรวจสอบ: typecheck ผ่านก่อนถอน renderer; production build หลังแก้ทั้งหมดผ่าน (รวม TypeScript ของ shared/server/client); UI regression tests ผ่าน 4/4 รวมบท DM fallback, ปุ่มส่งคำตอบ, การไม่แสดงกล่องข้อความและปุ่มควบคุมเรื่องให้ผู้เล่น ยังไม่ทดสอบ multiplayer ในเบราว์เซอร์หรือ import เซฟรอบนี้ ไม่ได้ commit/push

เปิดแชท “ตรวจและปรับเนื้อเรื่อง/Q&A v5.5 ทีละ Act” แล้ว เริ่มวิเคราะห์ Act A โดยยังไม่แก้ runtime เพื่อไม่ชนงานเก็บกวาด


## รอบยืนยันขอบเขต A/B และนโยบายเซฟ

ผู้ใช้ยืนยันให้ลบ A/B และเก็บ C ทั้งหมด จากนั้นยืนยันว่ารับเฉพาะ portable save v5.5 โดยปฏิเสธไฟล์เก่าอย่างชัดเจน ไม่แปลง State อัตโนมัติ

เสร็จเพิ่ม:
- A5: ถอน storyOption/onStoryRoll และสาขา vision ที่ไม่มีตัวเลือกแล้ว คงการรอการ์ดทอยจาก DM และ C4_DROWNED_ECHO_VISION ตามเดิม
- B1: ถอน askGm/dmReply/dmAnswer, DmQuestion, suggestedAnswers, pendingQuestionCount และการเปิดคิวคำถามให้ client คง dmSendQa และประวัติ answers เซฟเก่าที่มีคิวคำถามจะละทิ้งเฉพาะคิวนั้นขณะ restore รวม checkpoint ย้อนบท ส่วน dmDismiss ใช้ทิ้งบทบรรยายที่ยังไม่ส่ง ไม่ใช่คำถามที่เลิกใช้
- B2: ถอน ExplorationPlan และคำสั่ง planSubmit/planResolve/planCancel รวม public projection และ tests เฉพาะระบบที่เลิกใช้ เมื่อ restore จะละทิ้งแผนเก่าทั้งสถานะปัจจุบันและ checkpoint ย้อนบท คำสั่งจาก client เก่าปฏิเสธก่อนเปลี่ยน State
- portableSession และหน้า preview ไฟล์ตรวจ version 5.5 ก่อนนำเข้า ทดสอบไฟล์ 4.3/5.1/5.2/5.3 ว่าไม่สร้างห้องครึ่งหนึ่งหรือเปลี่ยน State
- tests ที่มีจุดประสงค์เฉพาะ inbox เดิมถูกถอน ไม่ได้ใช้ skip เพื่อซ่อนผลล้มเหลว ส่วน tests การส่ง Q&A โดย DM, journal, rewind, pause, report และความลับยังคงอยู่ พร้อม tests ทดแทนการปฏิเสธคำสั่งและการอ่านเซฟ

ผลรอบล่าสุด: Server 239/239, UI 8/8, Client TypeScript 20/20 (หลัง A5), Socket.IO portable v5.5 1/1, production build ผ่าน

ยังเหลือ B4–B7: ถอน adapter/ข้อมูล runtime หลายเวอร์ชันและสาขาจับเวลา/เหตุ E5 แบบเก่า รวม scenario sample ที่ world ยังอ้าง ต้องตรวจ dependency graph ก่อนถอนทั้งชุด นโยบายเซฟได้รับคำตอบแล้ว ไม่ต้องถามผู้ใช้เรื่องนี้ซ้ำ กลุ่ม C ยังคงอยู่ ไม่ได้ commit/push รอบนี้
