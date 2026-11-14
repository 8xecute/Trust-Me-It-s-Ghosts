# CASE 001 v5.1 — State audit และการย้ายข้อมูล

เอกสารสำหรับ DM/ผู้พัฒนา ไม่ส่งให้ผู้เล่น ค่า runtime อยู่ใน CaseState.v51 ยกเว้นค่าที่ derive จากเจ้าของข้อมูลเดิม ไม่มีการเปลี่ยนเป็น hostage record แบบข้อเสนอ v5.2

## Initial → Writer → Reader

| State | Initial | Writer/เหตุจริง | Reader/ความต่อเนื่อง |
|---|---|---|---|
| PHASE | A | ผู้สืบสวนยืนยัน handoff; resolver ปิดคดี | เปิดฉากเฉพาะบทปัจจุบัน; ห้ามย้อนบท |
| CASE_ACCEPTED | false | ยืนยันออก A ไป B | DM State Contract/รายงาน |
| TIME_MINUTES | 0 จาก 23:00 | tick ด้วยต้นทุนเดิม; ไม่เพิ่มจากเวลาคุยนอกเกม | 03:00 = 240; ห้ามติดลบ/ย้อนเวลา |
| KNOWN_MISSING_NAMES | false | A1 หรือ B1 ส่ง cue แล้ว | สมุด/DM audit |
| LOCATION_B_KNOWN | false | A1/A3/B1 ส่งแล้ว | บันทึกข้อมูลที่ได้รับ ไม่เปิดทุกพื้นที่ล่วงหน้า |
| LOCATION_C_KNOWN | false | B1/B5 หรือถึง C1 | เหตุไปบ้านดล |
| LOCATION_D_KNOWN | false | C2 หรือถึง D1 | เหตุไปศาล |
| LOCATION_E_KNOWN | false | D5 หรือถึง E1 | รอยล้อ/ทางสำรอง |
| TON_TRUST | low | DM ยืนยันจัดที่คุยปลอดภัยจริง → high | B3 คำให้การส่วนตัว; ไม่ให้ผลทอยสร้างความปลอดภัยเอง |
| SUSPECT_WICHAI | unknown | B2/B3/C2 Full → suspected; E2/E3 พยานจริง → confirmed | แยกคำสงสัยกับการยืนยัน ไม่เปลี่ยนจากภาพผี |
| FLOOD_TRUTH | unknown | B4/C5 Full หรือ H1 Partial → partial; H1 วิเคราะห์จริง/Full → evidence | H1 และการเจรจา ไม่ใช่การเปิดเผยสาธารณะ |
| KNOWS_WICHAI_SAVED | false | ถามชื่อเด็ก C5 หรือ D3 ยืนยันในบริบทจริง | ข้อมูลที่ทีมรู้; ไม่แจกเมื่อข้ามคำถาม |
| GHOST_ENCOUNTER | not_started | finishCaseBattle EN01 ตามผลจริง won/pacified/escaped/lost; ทีมล้มเขียน lost | ไม่อนุมานผลจากแค่เปิด C4 |
| GHOST_CLUE | none | C4 สงบ/Full → vision; ชนะเหลือร่องรอย/Partial → trace | ไม่เห็นหน้าวิชัย; trace ไม่ทับ vision |
| KAEW_TRUST | neutral | D3 Full พร้อมการช่วยจริง → high; DM ยืนยันไม่ไว้ใจจากโจมตีไม่จำเป็น → low | บันทึกบทบาท/เจรจา ไม่เพิ่มโบนัสหรือ penalty ใหม่ |
| KAEW_D_RESULT | not_met | ส่งบทแม่แก้ว D3 → talked; EN02 ตัดสินจริง → won/fled/lost/talked | F2 เลือกบทเดียวตามค่าจริง |
| KAEW_TEMP_DISPERSED | false | EN02 ชนะร่างจริง → true | F2/F5/F6 และ encounter ห้ามเสกร่างกลับ; recovery unresolved |
| HOSTAGES_FOUND | 0 | เปิดห้อง E2 จริง → 3 | พบตัวไม่เท่ากับ SAFE |
| HOSTAGES_SAFE | 0 (derive) | evacuation ถึงจุดปลอดภัย; คำนวณจาก evacuated ที่ยัง alive | ตัวเลขรายงาน/Ending; ตายแล้วตัดออกทันที |
| HOSTAGES_DEAD | 0 (derive) | นับ HOSTAGE_FATE=dead | ไม่เพิ่มสองครั้งจากเหตุซ้ำ |
| HOSTAGE_FATE[ทั้งสาม] | alive | Crossfire จริงหนึ่งคน; Ritual Toll เฉพาะเพิ่ม | คนตายไม่มี escort/NPC dialogue |
| DEATH_CAUSE[ทั้งสาม] | null | crossfire_wichai / ritual_toll เมื่อเกิดจริง | รายงานตามสาเหตุ ไม่โยนความผิดให้ผีใน E5 |
| WICHAI_STATUS | free | detain/surrender สำเร็จ → captured; DM ยืนยันหนีจริง → escaped; Execution จริง → dead | ตำแหน่ง + สถานะเปิด E5/บทพูด/Ending |
| WICHAI_COOPERATING | false (derive fact เดิม) | E5 Full ขณะอยู่จริง | ลดการขัดขืน ไม่เท่ากับ captured |
| WICHAI_DEATH_CAUSE | null | Execution Attempt ผ่านจังหวะรับมือแล้วฆ่าจริง → kaew_execution | B Vigilante; ห้าม A |
| BRIBE_ACCEPTED | false (derive fact เดิม) | รับสินบนจริง | เก็บผลเดิม ไม่หยุดพิธีอัตโนมัติ |
| RITUAL_STATUS | active | seal1/seal2 สำเร็จตามระบบเดิม → weakened; seal3 สำเร็จ → stopped; crossing → entrenched หากยังไม่ stopped | F1/F5/F6/Ending; D4 won และ E4 อ่านผ่านไม่หยุดพิธี |
| RITUAL_PLAN | unknown | E4 Full → prepared; Partial → basic | แสดงแผนตามความรู้; Failure ไม่ลบแผนที่มีแล้ว |
| RITUAL_TETHER_INTACT[ทั้งสาม] | true | ยังไม่มี Action ปลดรายคนที่อนุมัติใน repo; ไม่เพิ่มปุ่มสำเร็จฟรี | F6 ตรวจสายเพิ่ม; evacuation ไม่เปลี่ยนค่า; false ทดสอบด้วย fixture เท่านั้น |
| RITUAL_0300_PRESTATE | null | clock51 ตอนข้าม 240 ครั้งแรก ก่อน entrenched | save/resume และ audit สภาพก่อนเวลา |
| RITUAL_0300_FULL_POWER | false | PRESTATE == active | ไม่ขึ้นกับว่ามีคนตายหรือไม่ |
| KAEW_FINAL | null | F5 Full พร้อมหลักฐาน/แผนจริง หรือ DM ยืนยันสมัครใจ → calm; ภัยจริง/Execution → hostile | sealed/departed/controlled ยังไม่มี producer ที่อนุมัติ |
| ENDING_MODIFIER | null | resolver ตามลำดับ → fallen_agent/bloodstained_rescue/vigilante_ghost | บทสรุปตามเหตุจริง ไม่ฝืน A |
| LAND_EVIDENCE_COLLECTED | false | DM ยืนยันเก็บเอกสาร E4 จริง | ไม่เท่ากับหลักฐานเพียงพอ |
| FLOOD_EVIDENCE_COLLECTED | false | DM ยืนยันเก็บเอกสารปี 2534 E4 จริง | H1 ยังต้องมีพยานประกอบจริง ไม่สร้าง C5 Props |
| PLAYER_DEATHS | 0 | ยังไม่มี death event ที่อนุมัติ; HP0 คง downed ตาม Core | resolver Fallen Agent พร้อมรับค่าที่มีเหตุจริงในอนาคต; ปัจจุบันทดสอบ fixture เท่านั้น |
| CHECK_RESULTS | {} (derive จาก storyChecks) | มี entry เฉพาะการทอยจริง; บันทึก Full/Partial/Failure | ข้ามไม่ใช่ Failure; ทุก DC/Ability เดิม |

## ข้อมูลประกอบภายใน ไม่ใช่กติกาใหม่

humanCaseSupported เริ่ม null ให้ DM บันทึกว่าหลักฐานเพียงพอ/ไม่พอจากแหล่งจริง ไม่ได้ให้ระบบนิยามข้อกฎหมายเอง; disclosurePlan เริ่ม null ยืนยันความเป็นไปได้จริง; pastDisclosed เริ่ม false เปลี่ยนเมื่อเปิดเผย/ส่งจริง ไม่ใช่เพียงรับปากว่าจะส่ง

contextConfirmed เก็บข้อคำถาม/Action ที่ DM ตรวจว่าตรงเงื่อนไขต้นฉบับแล้ว ก่อนส่งคำตอบ deathKnown และ witness แยกเห็นเหตุจริงจากรับแจ้ง pending เก็บเหตุคุกคามพร้อม announced=false จนส่ง Telegraph ถึงผู้เล่น จึงเปิดผลยับยั้ง/ถึงตาย adjudications บันทึกเหตุและนาที ทั้งหมด persist ในเซฟและส่งเฉพาะ DM

## Mapping จาก v4.3 และ save compatibility

| v4.3 | v5.1 | วิธีรักษาเซฟ |
|---|---|---|
| guided.version=4.3 | ห้องใหม่ 5.1 เท่านั้น | เซฟเก่าไม่ถูกแปลง; env เลือก 4.3/4.1 ได้ |
| guided.phase/scene/observed/presented/journals | โครงเดิมและ ID เดิม | ไม่เปลี่ยน scene IDs/Socket.IO protocol |
| minute | TIME_MINUTES derive จาก minute | ไม่ reset เที่ยงคืน |
| storyChecks | CHECK_RESULTS derive จากผลที่เกิดจริง | เก็บตัวทอยและ history เดิม ไม่ reroll ตอนส่งบท |
| seals[2] | RITUAL_STATUS=stopped เมื่อ Action สำเร็จ | E4 decode และ D4 victory ไม่เขียน stopped |
| ghost hidden หลังชนะ D4 | KAEW_TEMP_DISPERSED + KAEW_D_RESULT=won | ไม่มี recovery อัตโนมัติ |
| opened/escorts/evacuated | FOUND/SAFE พร้อม fate รายชื่อ | ไม่ถือว่าคนตาย safe; ไม่ใช้ record ใหม่ v5.2 |
| wichai.site/status | ตำแหน่งเดิม + WICHAI_STATUS | เดิน B→D→E ตามเวลาเดิม ไม่มี warp |
| current-testimony/truth-recorded | หลักฐานจริง + DM ยืนยัน sufficiency/disclosure | collected ไม่ทำให้ Ending A สำเร็จฟรี |
| raw v4.3 cue/dialogue | JSON v5.1 แยก Act + source Markdown ฝั่ง server | ปิด legacy automatic facts/narration เฉพาะห้อง v5.1 |

validateSave51 ตรวจค่าที่ขาด ความขัดกันของพิธี/ผนึก จำนวนปลอดภัย/คนตาย สาเหตุการตาย และสถานะก่อน 03:00 หากไม่ครบให้หยุดโหลดพร้อมข้อผิดพลาด ไม่แต่งค่าเริ่มต้นทับประวัติที่หาย ไม่มีการลบเซฟ

## Must Fix ที่ทำแล้ว

defaults; การเขียน talked/encounter outcomes; การนับตายครั้งเดียวและไม่นับ safe; prestate ก่อน entrenched; phase/presence/delivery guards; กันคำถามผู้เล่นถูกนำมาอ่านเป็นบท NPC; ไม่เผยโน้ตหลังใบแผนที่ก่อนพลิก; ไม่ให้ NPC ที่ไม่อยู่หรือเสียชีวิตพูด; ยึดต้นฉบับ v5.1 และล็อก Dice DC ที่ทั้ง request และ resolver

## Needs Rules Decision

1. C5 Editorial Props สองแหล่งยังรออนุมัติ จึงเก็บ Card C5/DC17 แต่ยังไม่เปิด Action นี้ใน v5.1
2. นิยาม Action/AP/ผลสำเร็จของการปลด tether รายคน และผล stopped ต่อสาย ไม่ infer จาก evacuation
3. Recovery หลังร่างสลาย D4 ไม่มี duration/trigger ที่อนุมัติ จึงไม่มีร่างใหม่หรือเจรจาสำเร็จฟรี
4. sealed/departed/controlled ยังไม่เปิดผลสำเร็จใน v5.1; controlled หลังหยุดพิธีชุดเดียวขัดความหมาย
5. Critical Fail/HP0 death ยังไม่อนุมัติ Core ระบุ HP0 ไม่ตายทันที จึงไม่สร้าง player-death producer; Fallen Agent เป็น resolver test จาก fixture เท่านั้น
6. เกณฑ์หลักฐานทางคดียังต้อง DM ยืนยัน ไม่วาง threshold จำนวนชิ้นเอง
7. E5/F5 ยังไม่มีแผนที่ตำแหน่งตัวประกัน/วิชัยละเอียดในระบบเดิม การคว้า/ระยะ/อาวุธ/ผล Guard-Help ใช้ DM ยืนยันผลตาม Core/Combat จริงก่อนบันทึก ไม่อ้างว่า engine คำนวณ combat มนุษย์ครบแล้ว
