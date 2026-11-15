# CASE002 — QA และแผน Playtest


**อัปเดต D05 และภาพ:** ผู้ใช้เลือกทางหยุดภัยถาวรหลังสังเวยแล้ว ดู [แบบจุดยึดไม้ครู](CASE002_FINAL_Anchor_Design.md) และ [ชุดภาพ/แกลเลอรี](CASE002_Artwork.md) จุดยึด+ร่างที่หยุดจริงทำให้จบ C ได้หลังสังเวย ไม่บังคับ D เพียงเพราะ completed ส่วนค่ามนุษย์/ศัตรู การตาย DC/Action และ Resolver ยังต้องล็อกก่อน runtime

วันที่ 15 พฤศจิกายน 2026 · Draft 0.1 · **ยังไม่มี CASE002 runtime หรือ user playtest**

รายการต่อไปนี้เป็น acceptance ที่ต้องทำหลังอนุมัติแบบ ไม่ใช่ผลว่าทดสอบผ่านแล้ว ผลตรวจระบบเดิมอยู่ใน [Regression](CASE002_Compatibility_Regression.md) การตรวจ JSON/ลิงก์/จำนวนฉากพิสูจน์เพียงความครบของชุดแบบ ไม่พิสูจน์ multiplayer หรือ combat

ผู้ใช้อนุมัติด้านดีไซน์แล้ว: **D01-B** ใช้ฐาน runtime v5.5 ปัจจุบัน HP15/หนึ่งการกระทำต่อเทิร์น และ **D02-C** Active Defense ตามสูตร ต้นทุน และจังหวะที่เลือก การอนุมัติไม่ได้ทำให้ CASE002 runtime มีอยู่หรือผ่านการทดสอบ D03–D07 ยัง pending ส่วน D05 เลือกทางหยุดภัยถาวรแล้วและรายละเอียดจุดยึดยังเป็นแบบ

## กติกาการทดสอบ

ใช้กฎ/ค่าที่อนุมัติใน D01–D07 และ seed หรือ injectable D20 เฉพาะ test fixture ไม่แก้ die ในเกมจริง เก็บ before/after state, action/event IDs และ payload ที่แต่ละฝ่ายได้รับ ทดสอบผ่าน server/socket จริงก่อนยืนยัน privacy ไม่ตรวจเฉพาะข้อความบนจอ

D02-C ที่ต้องใช้ใน fixture เมื่อ implementation พร้อม: ฝ่ายรับ commit โหมดและจอง Focus/Reaction ก่อน Attacker Roll/ก่อนรู้ผล หลัง server ล็อกผลโจมตีและ identity reveal แก่ฝ่ายรับแล้วจึงทอย `D20 + BODY + preparedGuardBonus` สำหรับกายภาพ หรือ `D20 + RES + preparedGuardBonus` สำหรับจิตใจ แทนฐาน 10 ของ PDEF/MDEF ไม่บวก Defense เดิมอีกชั้น ต้นทุน 0 AP, Focus1 และหนึ่ง Reaction ต่อรอบ จ่ายครั้งเดียว ไม่ลอง Fixed Defense ก่อน ไม่สลับกลับหลังเห็นผล ไม่ใช้ Reaction อื่นซ้ำใน hit เดียว Guard ต้องเตรียมไว้จริง ส่วน NPC ต้องรอ profile ใน D03

ขณะยังไม่อนุมัติ lethality ห้ามสร้างผลว่า HP0 เป็น death เพื่อให้เคสสังเวยผ่าน ห้ามใช้เซฟ CASE001 เปลี่ยนชื่อเป็น CASE002 fixture

## Acceptance 20 ข้อตาม Master Prompt

สถานะทุกข้อ: **NOT IMPLEMENTED / NOT RUN** สำหรับ CASE002

| ID | Setup และ Action | ผลที่ต้องพิสูจน์ |
| --- | --- | --- |
| C2-01 | DM + ผู้เล่น 2 คน; ประกาศแยกและเดิน C2/C3 คนละทาง | แบ่ง 1/1 ได้; พิกัดและ scene แต่ละกลุ่มตรงการเดิน ไม่มีภาพ/ข้อมูลข้ามกลุ่ม |
| C2-02 | DM + 6 คน; เลือก 3/3 โดยเปลี่ยนสมาชิกได้ก่อนแยก | ทุกคนอยู่กลุ่มเดียวเท่านั้น; DM ไม่ถูกนับเป็น investigator; ไม่เกิน 7 คนต่อห้อง |
| C2-03 | 2 และ 6 คนเลือกอยู่รวมกัน ตรวจ C2 แล้ว C3 | เดินถึง C4/D/E/FINAL ได้; D ไม่บังคับแยกหรือสร้างมนุษย์เพิ่ม; สื่อสารต่อเนื่องทำให้หลอกไม่สำเร็จได้ |
| C2-04 | A เห็นหน้ากาก B เห็นอีกภาพ; เปิดหลักฐานเฉพาะ A | snapshot, ack, narrative, roll และ combat log ของ B ไม่มีข้อมูล A ที่ไม่ได้ส่งจริง |
| C2-05 | D1 ผู้เล่นขอรหัสร่วม เทียบอุปกรณ์และสัมผัสที่ทำได้ | identity proof ที่แน่ชัดไม่ต้องทอย; ไม่โจมตี ไม่มี AP/HP/Focus loss และไป D5 ได้ |
| C2-06 | ล็อก real target แล้ว attacker roll รวมต่ำกว่า approved defense | damage=0 ไม่มี partial attack/auto critical; เปิด defender view ตาม stage; ยังพิสูจน์ตัวตนต่อได้ |
| C2-07 | defender commit D02-C ก่อน Attacker Roll แล้ว attacker roll/identity reveal/defense roll ตามลำดับ | ใช้ D20+BODY หรือ D20+RES แทนฐาน10 ตามชนิดโจมตี; 0 AP/Focus1/หนึ่ง Reaction ครั้งเดียว; ไม่บวก PDEF/MDEF ซ้ำ ไม่ตรวจ Fixed Defense ก่อน และไม่มี Guard ย้อนหลัง |
| C2-08 | replay actionId เดิม และ actionId ใหม่ที่อ้าง attackId ที่ resolved แล้ว | damage/resource/ledger เปลี่ยนครั้งเดียว; เส้น reconnect/import ไม่ล้าง dedupe |
| C2-09 | friendly-fire โดนเพื่อนจนบาดเจ็บหรือ HP0 | HP ลดจริงและคงต่อหลัง regroup; HP0=Downed ตามกฎที่เลือก ไม่ตายทันที ไม่ completed sacrifice |
| C2-10 | E2 เทียบ B4/ถามตัวตน/ปลดเชือกแล้วพาออก | Ing identity, rescued, safe เปลี่ยนจากเหตุคนละขั้น; ไม่มี forced hit/death; ช่วยได้โดยไม่โจมตี |
| C2-11 | E2 โจมตีผิดแล้วช่วยอิงที่ยังมีชีวิต | รักษาตาม resource/range/condition ของกฎ; injured ไม่กลายเป็น dead; sacrifice incomplete |
| C2-12 | approved lethal fixture: ผู้เล่นทำให้อิงเสียชีวิตจริงในเขตที่กำหนด | มี deathEventId, killer, actionId, rule, zone, DM confirmation; sacrifice completed ครั้งเดียวหากครบทั้งหมด |
| C2-13 | นายโรงลงมือฆ่าอิงจาก combat ที่ Resolve จริง | บันทึก killerKind=ghost; sacrifice ยัง incomplete แม้มี human death; ending บอกสาเหตุตรงจริง |
| C2-14 | ผู้เล่นฆ่าเพื่อนจริงในพื้นที่ D ที่อนุมัติว่าเป็นเขตการแสดง | completed เป็น monotone; E/FINAL branch permanent แล้ว; ไม่ใช้บท “ยังรอเครื่องสังเวยแรก”; ไม่ลบการตายเมื่อรวมทีม |
| C2-15 | ป้องกันการโจมตีผิดทั้งหมด ช่วยอิง/ประยูรและเข้า FINAL | สู้/คุ้มกัน/ยุติภัยตาม D05 ที่อนุมัติได้ ไม่มีจำเป็นต้องสังเวยเพื่อปลดบอส |
| C2-16 | ตรวจ entity registry ทุกฉากรวมย้อนหลัง | มนุษย์จริงมีเฉพาะทีม ประยูร อิง; ศักดิ์/ชด/ครูสิงห์ในเอกสารไม่ spawn เป็นมนุษย์คืนนี้; ฝูงชนลวงไม่นับ death |
| C2-17 | ตรวจหลายจุด ย้อนอ่าน พัก หรือปล่อยเวลาจริงผ่านไป | ไม่มี countdown, timer-death หรือบังคับ fail; อันตราย lethal ต้องมาจาก Action/รอบ combat จริงตาม D03 ไม่จากเปิดหน้า |
| C2-18 | serialize ทุก player transport, bundle, assets labels, errors | ไม่มี DM secret, full QA, unseen knowledge, target mapping หรือ hidden IDs; defender/attacker reveal คนละ audience |
| C2-19 | fixture A/B/C/D + mixed cases, sacrificeก่อนD, deathsจากแต่ละฝ่าย | deterministic priority ไม่ขัดสถานะ; ไม่มี approved lasting-stop หลังสังเวยแล้วอ้างปิดโรงเดิม; Fallen Agent จาก actual player death |
| C2-20 | เปิด/เล่น/โหลด/export/import CASE001 v5.5 ก่อนและหลัง integration | คดีเดิมคงพฤติกรรมเดิม; v1 save ถูก reader เดิม; ไม่อ่าน CASE002 QA/state/ending/fallback |

## Boundary และความปลอดภัยของข้อมูล

- ส่ง `appearanceRef` ของอีกคน/อีกห้อง/อีก revision, เป้าหมดอายุ หรือ real actor ID ที่เดาเอง ต้อง reject ด้วยข้อความกลาง ไม่บอกชื่อจริงใน error
- ระหว่าง attack แต่ละ stage ลองประกาศ attack ใหม่ ลอง skip attacker roll ลอง response สองครั้ง เปลี่ยนเป้า/อุปกรณ์/range หลัง die ต้องไม่ overwrite intent ที่ล็อกแล้ว
- ต้นทุน attacker reserve ก่อนทอย commit ครั้งเดียวก่อนรู้ die; cancel ได้เฉพาะก่อนทอย ไม่เปิดช่องกดใหม่หลังรู้ผลเพื่อ reroll
- ย้ายตำแหน่งระหว่าง pending ต้อง serialize/ปฏิเสธตามลำดับที่กำหนด ไม่ใช้พิกัดภาพลวงเป็นระยะจริง
- ทดสอบ attacker, defender, protector ที่สิทธิ์ Reaction หมด/Focus ไม่พอ/อยู่ไกล/Downed และกรณีรับแทนใช้ defense ของคนรับใหม่ ไม่หัก cost เมื่อคำสั่งไม่ถูกต้อง
- D02-C: ผู้ไม่มี Focus/Reaction ไม่รู้ตัว หรือไม่มีวิธีรับมือจริงใช้ Fixed Defense ตามฐาน D01-B; ห้ามให้ NPC ใช้ก่อนอนุมัติ profile D03 การอนุมัติสูตรให้ผู้เล่นไม่สร้างทรัพยากร NPC ขึ้นเอง
- D02-C: commit โหมดก่อน Attacker Roll ต้องไม่อ่าน die/total/result ที่ยังไม่เปิด; หลัง identity reveal ห้ามเลือกเปลี่ยนโหมด ย้อนกลับ Fixed Defense หรือทอย Defense ซ้ำเพื่อเลือกค่าที่ดีกว่า
- D02-C: ทดสอบ Physical ใช้ BODY และ Mental ใช้ RES โดยแทนฐาน10 เท่านั้น; Focus1/Reaction หนึ่งครั้งคงผ่าน retry/save/reconnect; Guard2 เฉพาะที่เตรียมไว้จริง ไม่ซ้อนการป้องกันสองชั้น
- save/reconnect ทุก stage ต้องคง die, target, cost, response และ ledgers; disconnect ไม่หัก HP อัตโนมัติและไม่เดินเวลาระหว่างผู้เล่นรอ
- death event ปลอม, victim ที่ไม่ใช่มนุษย์จริง, killer==victim, แค่บาดเจ็บ, อยู่นอกเขต หรือไม่มี causal action ต้องไม่ completed sacrifice
- full session save มีความลับ DM: download/recovery เฉพาะ DM; ผู้เล่นขอผ่าน Socket ต้องไม่รับ full save/token สมาชิกอื่น
- import unknown/mixed case/version หรือ CASE002 state แฝงใน v1 ต้อง fail ก่อน publish membership/state และไม่แก้ต้นฉบับเซฟ
- เปิด/ค้น Q&A หลายครั้งแล้วเทียบ authoritative state: ต้องไม่เปลี่ยน; ส่งบทต้องไม่ Resolve combat/พิธี/การตาย
- รวมกลุ่มแล้วความรู้ไม่ union; เฉพาะข้อมูลที่ผู้เล่นพูดต่อจริงและผู้รับได้ยินจึงเพิ่ม knowledge

## การตรวจความครบของชุดแบบ

ตรวจแยกจาก runtime:

1. StoryScript มี 25 ฉาก A1–A3, B1–B5, C1–C4, D1–D5, E1–E5, F1–F3 ครบ template และ Q&A อย่างน้อย 3 ประเด็นต่อฉาก
2. การ์ด 8 ID ไม่ซ้ำ อ้าง scene ที่มีจริง ทุกใบ `dc:null`, `proposed_dc` มีที่มาจาก Core, ไม่ execute ระหว่างรออนุมัติ
3. หลักฐาน 12 ID มีแหล่งหลักและสำรอง ไม่ล็อกด้วย Full Check ใบเดียว และไม่ปะปน inference เป็น fact
4. Contract ทุกไฟล์ระบุ CASE002, draft และไม่ต่อ runtime; ไม่อ้าง CASE001 state เป็น default
5. ตรวจเส้นทาง C2/C3 แบบกลุ่มเดียว, D1→D5 แบบไม่โจมตี, E2→E3 แบบช่วยไม่เจ็บ และ FINAL ทั้งก่อน/หลังสังเวย
6. ตรวจ manual: บทพูดคนที่ตาย/ไม่อยู่ต้องถูกตัด, ผล D ต้องสืบต่อ E/F, พิธีเดิมไม่แก้ permanent return และไม่มีอนุมัติเลข combat โดยนัย

ผลตรวจความครบจะบันทึกใน `CASE002_Static_Validation.json` พร้อมข้อจำกัด เป็นการตรวจข้อมูลเอกสาร ไม่มี server reducer ของ CASE002 ให้ทดสอบในรอบนี้

## รอบ Playtest ที่ต้องทำหลัง integration

| รอบ | ทีม/แนวทาง | จุดเน้น |
| --- | --- | --- |
| PT-01 | 2 คน แยก 1/1 เลือกตรวจไม่โจมตี | private views, no-roll proof, ไม่ต้องมีผู้เชี่ยวชาญครบอาชีพ |
| PT-02 | 6 คน แยก 3/3 มี friendly fire ที่ตกลงขอบเขตไว้ | staged reveal, response eligibility, duplicate network และ recovery |
| PT-03 | อยู่รวมกันและสืบไม่ครบ | fail-forward, ไม่บังคับแยก, ช่วยอิง/เข้า FINAL ได้ |
| PT-04 | สังเวยจาก D จริงตาม lethal fixture ที่อนุมัติ | permanent branch, คุ้มกันผู้รอดชีวิต, ไม่ขัด Ending |
| PT-05 | ไม่มีสังเวย และอิงบาดเจ็บแล้วรักษา | ข้อมูลช่วยป้องกันครั้งสอง, ทางปิดโรงก่อนสังเวย |

แต่ละรอบเก็บ team size/classes, rulesVersion, ชื่อ fixture, นาทีจริง, Action/check ที่เกิด, recipients, resource ก่อน/หลัง, death causal IDs, ช่วงที่ DM ไม่แน่ใจว่าเล่าได้แค่ไหน, สิ่งที่ DM ไม่รู้ว่าต้องบันทึก และ ending facts ไม่ใช้ feedback จาก standalone A1 ของ CASE001 แทนผล CASE002

## เพิ่มเติมตาม D05 ทางที่ผู้ใช้เลือก

- completed=true แล้วตัดจุดยึดและหยุดร่างจริง: จบ C ได้ พร้อม cause/Fallen Agent ตามจริง ไม่ reset completed
- completed=true แล้วชนะเพียงร่างโดยจุดยึดยังอยู่: ไม่แอบถือว่าหยุดภัยถาวร; ตรวจ D ตามภัยที่เหลือ
- ตัดจุดยึดก่อนร่างหรือหยุดร่างก่อนตัดจุดยึด ให้ผลถาวรตรงกันเมื่อครบสองเหตุ ไม่มี respawn จากการเปิดฉาก
- พบ/จัดการจุดยึดก่อน FINAL ต้องรับผลจริง ไม่ย้ายของหนีและไม่บังคับให้เกิดสังเวย
- B3/C3/E4 ให้ E12 เฉพาะผู้รับที่ตรวจจริง มีทางสำรอง ไม่เพิ่มโบนัสหรือ neutralize จาก Q&A
- ชุดภาพ16ภาพ/ผัง25ฉากยังไม่ใช่ runtime privacy proof; ตรวจก่อนเปิดให้ผู้เล่นเสมอ
