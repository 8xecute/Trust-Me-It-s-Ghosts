"""AI DM Engine: Groq Whisper STT, Gemini JSON DM Decision, and Live Gemini TTS."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
from typing import Any, Callable, Optional, TypeVar

from backend.schemas import CombatPlayerActionPlan, DMDecision, GhostTurnDecision, StateUpdates
from backend.state_manager import RoomManager, RoomState, ScenarioRepository

WORLD_LORE_BY_ACT = {
    "A": (
        "ฉากหลัง: หมู่บ้านหนองตาล ชนบทไทยปี พ.ศ. 2534 (1991) เวลาหัวค่ำ คืนนี้อากาศแห้งอบอ้าวไร้เมฆฝนและเงียบผิดปกติ "
        "ชาวบ้านส่วนใหญ่ปิดไฟปิดหน้าต่างเงียบ หลายหลังติดผ้ายันต์หน้าประตู และวางถุงกับกล่องสัมภาระกองหน้าชานคล้ายเตรียมย้ายหนี\n"
        "ทีมผู้เล่น: พนักงานจากบริษัทรับจ้างสืบสวนลี้ลับ บริษัทรับงานไว้เรียบร้อยแล้วก่อนเดินทางมาถึง (CASE_ACCEPTED=true) "
        "เดินทางมาด้วยรถตู้บริษัท (จอดเปิดไฟหน้าอยู่ริมถนนข้างศาลา "
        "ในรถมีอุปกรณ์ภาคสนามพื้นฐาน เช่น ไฟฉาย วิทยุสื่อสาร ปฐมพยาบาล และเครื่องสแกนคลื่นของนักศึกษาฝึกงาน)\n"
        "ตัวละครผู้ใหญ่ประเสริฐ: ชายวัย 50+ เป็นผู้ใหญ่บ้านที่เคร่งเครียด เหนื่อยล้า แต่พยายามคุมสติและสุภาพกับทีม "
        "เขายืนรออยู่ที่ศาลาพร้อมไฟฉายและสำเนาใบรับแจ้งคนหาย (ส่วนแผนที่ละเอียดและแฟ้มเต็มอยู่ที่บ้านของเขา) "
        "เขาหวั่นใจทุกครั้งที่พูดถึงแนวสวนกล้วยและอดีตของ 'แก้ว'\n"
        "การใช้ดุลยพินิจตอบคำถามทั่วไป: สามารถบรรยายรายละเอียดสภาพอากาศแห้งอบอ้าว สิ่งของรอบตัว บรรยากาศหมู่บ้านยุค 2534 "
        "ท่าทีตัวละคร หรือคำถามเล่นบทบาทสมมติทั่วไปของประเสริฐ/DM ได้อย่างเป็นธรรมชาติ โดยไม่ขัดกฎห้ามสปอยล์ด้านล่าง"
    ),
    "B": (
        "ฉากหลัง: ภายในและชานบ้านไม้สองชั้นของผู้ใหญ่ประเสริฐ บ้านหนองตาล ปี พ.ศ. 2534 คืนนี้ฟ้าแห้งสนิทไร้เมฆฝน "
        "แต่ลมที่พัดมาจากฝั่งสวนกล้วยกลับเย็นชื้นและมีกลิ่นดินเปียกอย่างประหลาด ภายในห้องรับแขกเปิดหลอดไฟสว่างรอไว้\n"
        "สถานะผู้ใหญ่ประเสริฐ (สำคัญมาก): สายตรวจโทรตามประเสริฐออกไปช่วยดูจุดตั้งด่านหน้าหมู่บ้านทันทีตั้งแต่เริ่มฉาก B1 "
        "ดังนั้น **ประเสริฐไม่อยู่ในฉาก และห้ามให้ประเสริฐมีบทพูดใน ACT B เด็ดขาด**\n"
        "ตัวละครในฉาก B1 (ห้องรับแขกและโต๊ะแผนที่): วิชัย ผู้ช่วยผู้ใหญ่วัย 40 ปลาย ๆ สวมเสื้อเชิ้ตพับแขน สุขุม สุภาพ เป็นทางการ "
        "ระแวดระวัง คอยดูแลแฟ้มคนหายและแผนที่สองชั้น (หมุดแดงคนหายทับวงที่ดินสีน้ำเงิน) ส่วน ต้น อาสาสมัครวัยรุ่นนั่งกำพวงกุญแจเงียบ ๆ ข้างประตู "
        "และจะไม่ยอมเล่าเรื่องลึกต่อหน้าวิชัย\n"
        "ตัวละครในฉาก B2 (ชานบ้านหน้าประตู): แยกคุยกับ ต้น เพียงลำพังริมรถมอเตอร์ไซค์ พูดจาตรงไปตรงมาแบบวัยรุ่นเจ้าถิ่น "
        "ระแวงสายตาวิชัยที่มองลอดหน้าต่าง\n"
        "ฉาก B3 (ผนังภาพเก่าปี 2534 และตู้แฟ้ม): ไม่มี NPC อยู่ใกล้ ๆ — DM เป็นผู้บรรยายเท่านั้น "
        "มีภาพถ่ายเก่าปี 2534 (ชาวบ้านยืนข้างประตูน้ำ) และตู้วางกองแฟ้มเอกสารเก่า\n"
        "การเดินสำรวจและการจบบท: ผู้เล่นสามารถสลับไปมาระหว่าง B1 (โต๊ะแผนที่/วิชัย), B2 (ชานบ้าน/ต้น) และ B3 (ผนังภาพเก่า) ได้อิสระ "
        "และเมื่อพบพิกัดบ้านดล (don_house_location) แล้วตัดสินใจออกเดินทางไปบ้านดล จะจบบท ACT B เข้าสู่ ACT C"
    ),
    "C": (
        "ฉากหลัง: บ้านไม้ชั้นเดียวของดล (ชายหนุ่มผู้สูญหาย) และบ้านยายบุญมีก่อนทางแยกเข้าสวนกล้วย\n"
        "ฉาก C1–C4 (บ้านดล): ไม่มีคนอยู่ ประตูแง้ม มีจานกับข้าวแห้งกรัง บนโต๊ะทำงานมีปฏิทิน โน้ตตาเพิ่ม และสมุดปกดำจดรายชื่อผู้ถูกกดราคาที่ดิน ชื่อวิชัย และเศษด้ายดำ "
        "มุมพื้นไม้มีเสียงเคาะสามครั้งและคราบน้ำเย็น (ไม่มีห้องขังใต้พื้นบ้านดล — ห้ามบอกว่าพบตัวประกันที่นี่) ใน C4 อาจเผชิญเงาผีจมน้ำเพื่อขอภาพนิมิตคนเข็นรถไปเรือนร้างท้ายสวน\n"
        "ฉาก C5 (บ้านยายบุญมี): ยายบุญมีหญิงชราผู้ดูแลศาลเล่าความจริงคืนน้ำท่วม 2534 ว่า 'แม่แก้ว' ลงน้ำช่วยเด็กชาย 'วิชัย' ขึ้นมาก่อนตัวเองจะจมน้ำตาย "
        "และเตือนว่ามีด้ายดำถูกผูกเพิ่มที่ศาลทีหลัง ห้ามดึง/กระชากส่งเดช พร้อมสมุดสวดมนต์จดชื่ออพยพที่เทียบกับเวรประตูน้ำได้ (H1)"
    ),
    "D": (
        "ฉากหลัง: ทางเดินสวนกล้วยยามค่ำ ศาลผ้าเขียวพันด้ายดำ และรอยล้อรถเข็นหลังศาล (D1–D5)\n"
        "จุดสำคัญ (D2): ศาลเก่ามีด้ายดำเส้นใหม่รัดแน่นกับป้ายชื่อ 'ดล', 'นิด', 'เพิ่ม' และสายคล้องกล้องเปื้อนโคลนของนิด ด้ายไต่ขึ้นยอดกล้วยและเชื่อมไปแกนควบคุมที่อื่น (ห้ามตัด/กระชากปลายสายที่ศาล)\n"
        "ตัวละคร แม่แก้ว (นางตานี) (D3–D4): หญิงชุดเขียวไม่เคยฆ่าหรือลักพาตัวคนหาย เธอถูกหลอกว่าจะเปิดความจริงแฟ้ม 2534 แล้วถูกด้ายอาคมรั้งเสียงร้องไว้ "
        "สามารถพูดคุย สัมผัสวิญญาณ หรือปะทะพอรับมือใน D4 ก่อนเดินอ้อมหลังศาล (D5) ตามรอยล้อรถเข็นและเศษกระสอบข้าวไปเรือนไม้ร้างท้ายสวน"
    ),
    "E": (
        "ฉากหลัง: เรือนไม้ยกพื้นร้างท้ายสวนกล้วย (E1–E6) และจุดเชื่อมหลักฐาน 2534 (H1)\n"
        "ใต้ถุน (E2–E3): กระสอบกั้นบังประตูไม้ หลังพังหรือเปิดเข้าไปพบตัวประกันทั้ง 3 คน (ดล นิด ตาเพิ่ม) ยังมีชีวิต ดลยืนยันว่า 'วิชัย' เป็นคนจับมาขังและขึ้นไปทำพิธีบนชั้นสอง\n"
        "ชั้นสอง (E4–E6): พบกำไลทองเหลืองสลักชื่อ 'แก้ว' (แกนควบคุมพิธี) ตำราวิธีคลายเกราะ 3 ขั้น (1.คุมแรงสะท้อน -> 2.แยกสายคำสั่ง -> 3.คลายปมเกราะ) "
        "และหลักฐานหนี้สินกับสัญญาซื้อขายที่ดินของวิชัยใต้ผ้าคลุมโต๊ะ เมื่อวิชัยกลับขึ้นมาจึงกดดันและคุมตัวเขาไว้ ก่อนลงมือคลายกำไลเข้าสู่ FINAL (ACT F)"
    ),
    "F": (
        "ฉากหลัง: ห้องพิธีชั้นสองยามวงป้องกันกำไลทำงาน (F1–F5) และถนนหน้าหมู่บ้านยามฟ้าสาง (F6 Epilogue)\n"
        "การปะทะใน F1: เกราะด้ายดำ 3 ชั้นปกป้องร่างแม่แก้วไว้ ห้ามบังคับฆ่าแม่แก้วจน HP 0 — ชัยชนะคือการคลายเกราะ 3 ขั้นแล้วทำ 'ปลดกำไลขั้นสุดท้าย' (Controlled Release)\n"
        "หลังคลายเกราะ (F5): แม่แก้วเป็นอิสระ เล่าว่าถูกวิชัยหลอก และถามทีมว่าจะเปิดเผยความจริงให้ชาวบ้านและจัดการวิชัยอย่างไร\n"
        "บทส่งท้ายยามฟ้าสาง (F6): นำแฟ้มคดี หลักฐานวิชัย และหลักฐานคืนน้ำท่วมปี 2534 (H1) ส่งให้ผู้ใหญ่ประเสริฐและเจ้าหน้าที่เพื่อปิดคดีสู่ Ending A–D ตามผลจริงของทีม"
    ),
}
WORLD_LORE_SUMMARY = WORLD_LORE_BY_ACT["A"]

SCENE_ENVIRONMENT_NOTES = {
    "A1": "ศาลาริมทางไม้เก่าหน้าทางเข้าหมู่บ้าน คืนนี้อากาศแห้งอบอ้าวไร้เมฆฝน มีหมอกบางในความมืด แสงไฟหน้ารถตู้ส่องไปตามบ้านเรือนที่ปิดเงียบ ติดผ้ายันต์หน้าประตู และวางข้าวของเตรียมย้ายหนี ประเสริฐยืนคุยอยู่หน้าศาลา",
    "A2": "ข้างประตูรถตู้บริษัทที่เปิดค้างไว้ วิทยุสื่อสารในรถเพิ่งส่งเสียงซ่าและเสียงผู้หญิงสำลักน้ำ ประเสริฐยืนหน้าซีดอยู่ใกล้ ๆ",
    "A3": "หน้าบ้านไม้สองชั้นของประเสริฐที่ยังเปิดไฟสว่างในห้องรับแขก ส่วนด้านขวามือเป็นซอยมืดทอดไปสู่ปากทางสวนกล้วย",
    "B1": "ห้องรับแขกบ้านผู้ใหญ่บ้าน บนโต๊ะไม้กลางห้องมีแฟ้มคนหายและแผนที่หมู่บ้านสองชั้นกางอยู่ใต้แสงไฟ วิชัยยืนดูแลแฟ้มอยู่ริมโต๊ะ และต้นนั่งเงียบ ๆ ข้างประตู (ประเสริฐออกไปแล้ว)",
    "B2": "ชานบ้านไม้หน้าประตูบ้านผู้ใหญ่ คืนนี้ฟ้าแห้งสนิทไร้เมฆฝน แต่ลมจากฝั่งสวนกลับเย็นชื้นและมีกลิ่นดินเปียกอย่างประหลาด ต้นยืนพิงรถมอเตอร์ไซค์กำพวงกุญแจ คอยชำเลืองหน้าต่างห้องรับแขกที่มีเงาวิชัยมองมาเป็นระยะ",
    "B3": "มุมผนังด้านในห้องรับแขก แสงหลอดไฟห้องรับแขกส่องกรอบภาพถ่ายเก่าปี 2534 แสดงชาวบ้านยืนข้างประตูน้ำ และมีตู้วางกองแฟ้มเอกสารเก่าอยู่ด้านล่าง (DM บรรยายเท่านั้น ห้ามสวมบทประเสริฐหรือ NPC อื่น)",
    "C1": "ห้องโถงบ้านไม้ของดล ประตูมุ้งลวดแง้มไว้ บนโต๊ะอาหารมีจานกับข้าวแห้งกรัง บนโต๊ะทำงานมีสมุดและกระดาษโน้ตวางอยู่",
    "C2": "หน้าโต๊ะทำงานบ้านดล มีปฏิทินวงนัดนิด โน้ตลายมือตาเพิ่ม และสมุดปกดำจดชื่อผู้ขายที่ดินพร้อมชื่อวิชัยกับเศษด้ายดำ",
    "C3": "มุมพื้นไม้ในบ้านดลที่ส่งเสียงเคาะ 3 ครั้งและเกิดคราบชื้นเย็นเยียบ เศษด้ายดำสั่นไหวเบา ๆ",
    "C4": "ห้องมืดในบ้านดลที่มีเงาเปียกโชกของผีเงาจมน้ำปรากฏตัวพร้อมบรรยากาศเย็นเยียบและนิมิตของคนเข็นรถบรรทุกหนัก",
    "C5": "เรือนไม้ของยายบุญมีก่อนทางแยกเข้าสวนกล้วย กลิ่นธูปสมุนไพรจาง ๆ ยายบุญมีนั่งถือสมุดสวดมนต์เก่าพร้อมผ้าเขียวพับเรียบร้อย",
    "D1": "ทางเดินดินชื้นเข้าสู่สวนกล้วยมืด ใบกล้วยทึบแกว่งทวนลมจนเผยให้เห็นหลังคาศาลเก่าและรอยกดคู่บนดิน",
    "D2": "ศาลไม้เก่าคลุมผ้าเขียวที่ถูกด้ายดำเส้นใหม่พันรัดเสาแน่นพร้อมป้ายชื่อ ดล นิด เพิ่ม และสายคล้องกล้องเปื้อนโคลนของนิดโคนต้นกล้วย",
    "D3": "หลังเสาศาลเก่ากลางดงกล้วย หญิงชุดเขียว (แม่แก้ว) ยืนนิ่งท่ามกลางหมอกเย็นและแรงดึงของเส้นด้ายดำ",
    "D4": "บริเวณหน้าศาลท่ามกลางใบกล้วยที่สั่นสะท้าน แม่แก้วถูกด้ายอาคมบังคับให้ขยับตวัดเส้นด้ายใส่ผู้ที่เข้าใกล้",
    "D5": "แนวป่ากล้วยด้านหลังศาล รอยล้อรถเข็นหนักกดลึกบนดินโคลนคู่กับรอยรองเท้าคนและเศษกระสอบข้าว มุ่งหน้าสู่เรือนไม้ร้างท้ายสวน",
    "E1": "ลานหน้าเรือนไม้ยกพื้นร้างท้ายสวนกล้วย รอยล้อหยุดลงที่นี่ มีเสียงเคาะเบา ๆ จากประตูใต้ถุนที่มีกระสอบปิดบัง และแสงเทียนสีส้มบนชั้นสอง",
    "E2": "หน้าประตูไม้ห้องใต้ถุนเรือนไม้ร้างที่ล็อกขัดกลอนและวางกระสอบข้าวบังไว้ มีเสียงเรียกขอความช่วยเหลืออู้อี้จากข้างใน",
    "E3": "ภายในห้องใต้ถุนอับชื้น ดล นิด และตาเพิ่มนั่งพิงเสาไม้หลังถูกแก้มัดและผ้าปิดปาก",
    "E4": "ห้องพิธีชั้นสองบนเรือนไม้ กลิ่นน้ำตาเทียนและด้ายดำ บนโต๊ะกลางห้องมีกล่องไม้ใส่กำไลทองเหลืองสลักชื่อ 'แก้ว' กับตำราพิธี ใต้โต๊ะมีเอกสารหนี้สินและสัญญาซื้อขายที่ดินของวิชัย",
    "E5": "เชิงบันไดและกลางห้องพิธีชั้นสอง วิชัยเพิ่งเดินขึ้นมาพบทีมสืบสวนอยู่หน้าโต๊ะกำไลและแฟ้มหนี้สินของตัวเอง",
    "E6": "กลางห้องพิธีชั้นสอง วิชัยถูกคุมตัวไว้แล้ว ทีมยืนล้อมกำไลทองเหลืองบนโต๊ะเตรียมลงมือคลายพิธี",
    "F1": "ห้องพิธีชั้นสองที่วงด้ายดำสามชั้นแผ่คลุมโต๊ะและร่างแม่แก้ว แสงเทียนไหววูบใต้แรงสะท้อนอาคม",
    "F5": "ห้องพิธีชั้นสองหลังเส้นด้ายดำสลายลงหมด กำไลทองเหลืองหลุดจากแกน แม่แก้วในชุดเขียวอ่อนยืนสงบนิ่งเบื้องหน้าทีมและวิชัย",
    "F6": "ถนนดินหน้าหมู่บ้านหนองตาลยามฟ้าสาง แสงอาทิตย์แรกสาดผ่านแนวสวนกล้วย รถกู้ภัยและตำรวจจอดอยู่ข้างหน้า ผู้ใหญ่ประเสริฐยืนรอรับฟังความจริงทั้งหมด",
}
T = TypeVar("T")
logger = logging.getLogger(__name__)

THAI_STT_PROMPT = (
    "ประเสริฐ, วิชัย, ต้น, สวนกล้วย, บ้านผู้ใหญ่บ้าน, บ้านดล, แผนที่, ประตูน้ำ, "
    "ห่อผ้าดำ, รอยข่วน, รถเข็น, ภาพถ่าย, ปี 2534, ผู้หญิงชุดเขียว, ใบรับแจ้งความ, วิทยุสื่อสาร"
)

GEMINI_STT_INSTRUCTION = (
    "ถอดเสียงพูดภาษาไทยของผู้เล่นในคลิปเสียงนี้ให้เป็นข้อความภาษาไทยที่ถูกต้องตรงตามเสียงพูดทุกคำ "
    "(คำศัพท์ที่อาจพบในเกม: ประเสริฐ, วิชัย, ต้น, สวนกล้วย, บ้านผู้ใหญ่บ้าน, บ้านดล, แผนที่, ชานบ้าน, "
    "ประตูน้ำ, ห่อผ้าดำ, รอยข่วน, รถเข็น, ภาพถ่าย, ปี 2534, ใบรับแจ้งความ, วิทยุสื่อสาร, "
    "ผู้หญิงชุดเขียว, ผีเงาจมน้ำ, ทอยเต๋า, สังเกต, ตรวจสอบ, ค่าจ้าง, ตำรวจ)\n"
    "กฎสำคัญ:\n"
    "- ตอบกลับมาเฉพาะข้อความที่ผู้เล่นพูดเท่านั้น ห้ามใส่เครื่องหมายคำพูด คำอธิบาย หรือคำนำ\n"
    "- หากไม่มีเสียงพูดหรือมีแต่เสียงรบกวน ให้ตอบว่า <EMPTY>"
)

_WHISPER_HALLUCINATIONS = {
    "ขอบคุณ",
    "ขอบคุณครับ",
    "ขอบคุณค่ะ",
    "ขอบคุณที่รับชม",
    "ขอบคุณที่รับชมครับ",
    "ขอบคุณที่รับชมค่ะ",
    "ขอบคุณสำหรับการรับชม",
    "ขอบคุณสำหรับการรับชมครับ",
    "ขอบคุณสำหรับการรับชมค่ะ",
    "โปรดติดตามตอนต่อไป",
    "กดติดตาม",
    "ซับไตเติล",
    "amaraorg",
    "mbc",
}


def _get_field(item: Any, key: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _clean_whisper_transcript(result: Any) -> str:
    """Filter high-no-speech segments and standalone Thai Whisper hallucinations."""
    if isinstance(result, str):
        raw_text = result.strip()
    else:
        segments = _get_field(result, "segments")
        if isinstance(segments, list) and segments:
            kept: list[str] = []
            for seg in segments:
                seg_text = str(_get_field(seg, "text", "") or "").strip()
                if not seg_text:
                    continue
                no_speech = _get_field(seg, "no_speech_prob")
                if no_speech is not None and float(no_speech) > 0.72:
                    continue
                avg_logprob = _get_field(seg, "avg_logprob")
                if avg_logprob is not None and float(avg_logprob) < -1.2:
                    continue
                kept.append(seg_text)
            raw_text = " ".join(kept).strip()
        else:
            raw_text = str(_get_field(result, "text", "") or "").strip()

    if not raw_text:
        return ""
    normalized = re.sub(r"[\s\.\,\!\?\-\"'“”‘’()\[\]]+", "", raw_text).lower()
    if normalized in _WHISPER_HALLUCINATIONS:
        return ""
    return raw_text


class AIDMEngine:
    """Hybrid Script-First + Safe Improvisation AI Game Master."""

    def __init__(self) -> None:
        self.groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.gemini_api_key = (
            os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
        ).strip()
        self.gemini_paid_api_key = (
            os.getenv("GEMINI_PAID_API_KEY") or os.getenv("GEMINI_FALLBACK_API_KEY") or ""
        ).strip()

        self.stt_model = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")
        self.dm_model = os.getenv("GEMINI_DM_MODEL", "gemini-3.5-flash-lite")
        self.live_tts_model = os.getenv("GEMINI_LIVE_TTS_MODEL", "gemini-3.8-flash-lite-tts")

        self._groq_client: Any = None
        self._gemini_client: Any = None
        self._gemini_paid_client: Any = None
        self._primary_cooldown_until: float = 0.0
        self._prefer_paid_client: bool = False

        if self.groq_api_key:
            try:
                from groq import Groq

                self._groq_client = Groq(api_key=self.groq_api_key)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to initialize Groq client: %s", exc)

        if self.gemini_api_key:
            try:
                from google import genai

                self._gemini_client = genai.Client(
                    api_key=self.gemini_api_key,
                    http_options={"api_version": "v1beta"},
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to initialize primary Gemini client: %s", exc)

        if self.gemini_paid_api_key and self.gemini_paid_api_key != self.gemini_api_key:
            try:
                from google import genai

                self._gemini_paid_client = genai.Client(
                    api_key=self.gemini_paid_api_key,
                    http_options={"api_version": "v1beta"},
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to initialize paid fallback Gemini client: %s", exc)

    @property
    def groq_ready(self) -> bool:
        return self._groq_client is not None

    @property
    def gemini_ready(self) -> bool:
        return self._gemini_client is not None or self._gemini_paid_client is not None

    @property
    def gemini_failover_configured(self) -> bool:
        return self._gemini_client is not None and self._gemini_paid_client is not None

    @staticmethod
    def _is_quota_error(exc: Exception) -> bool:
        msg = str(exc).lower()
        return "429" in msg or "resource_exhausted" in msg or "quota" in msg

    @staticmethod
    def _is_daily_quota_error(exc: Exception) -> bool:
        msg = str(exc)
        return "RequestsPerDay" in msg or "per day" in msg.lower()

    @staticmethod
    def _is_transient_error(exc: Exception) -> bool:
        msg = str(exc).lower()
        return any(
            tok in msg
            for tok in (
                "503",
                "unavailable",
                "high demand",
                "overloaded",
                "502",
                "504",
                "deadline_exceeded",
                "timed out",
                "connection",
            )
        )

    def _run_with_gemini_failover(self, call_fn: Callable[[Any], T]) -> T:
        """Try primary GEMINI_API_KEY with transient retry, failing over to paid key on quota or 503."""

        def _call_with_retry(client: Any) -> T:
            last_exc: Optional[Exception] = None
            for attempt in range(3):
                try:
                    return call_fn(client)
                except Exception as exc:  # noqa: BLE001
                    last_exc = exc
                    if not self._is_transient_error(exc) or attempt >= 2:
                        raise
                    backoff = 1.0 * (attempt + 1)
                    logger.warning(
                        "Gemini transient error (attempt %d/3), retrying in %.1fs: %s",
                        attempt + 1,
                        backoff,
                        exc,
                    )
                    time.sleep(backoff)
            assert last_exc is not None
            raise last_exc

        now = time.time()
        if (
            not self._prefer_paid_client
            and self._gemini_client is not None
            and now >= self._primary_cooldown_until
        ):
            try:
                return _call_with_retry(self._gemini_client)
            except Exception as exc:  # noqa: BLE001
                is_quota = self._is_quota_error(exc)
                should_failover = is_quota or self._is_transient_error(exc)
                if self._gemini_paid_client is not None and should_failover:
                    if is_quota:
                        self._prefer_paid_client = True
                        self._primary_cooldown_until = float("inf")
                        logger.info(
                            "Primary GEMINI_API_KEY hit quota limit; switching to GEMINI_PAID_API_KEY for subsequent calls in this session"
                        )
                    else:
                        logger.info("Switching from primary GEMINI_API_KEY to GEMINI_PAID_API_KEY after transient error")
                    return _call_with_retry(self._gemini_paid_client)
                raise
        if self._gemini_paid_client is not None:
            return _call_with_retry(self._gemini_paid_client)
        raise RuntimeError("No Gemini client configured")

    async def transcribe_audio(
        self, audio_bytes: bytes, filename: str = "speech.webm", mime_type: str = "audio/webm"
    ) -> str:
        """Transcribe Thai player audio via Gemini Multimodal (primary) with Groq Whisper fallback."""
        clean_mime = (mime_type or "audio/webm").split(";")[0].strip() or "audio/webm"

        if self.gemini_ready:
            def _call_gemini_stt(client: Any) -> str:
                from google.genai import types
                from google.genai.types import GenerateContentConfig

                response = client.models.generate_content(
                    model=self.dm_model,
                    contents=[
                        GEMINI_STT_INSTRUCTION,
                        types.Part.from_bytes(data=audio_bytes, mime_type=clean_mime),
                    ],
                    config=GenerateContentConfig(temperature=0.0),
                )
                return _clean_whisper_transcript(getattr(response, "text", "") or "")

            try:
                gemini_text = await asyncio.to_thread(self._run_with_gemini_failover, _call_gemini_stt)
                cleaned = gemini_text.strip()
                if cleaned == "<EMPTY>" or cleaned.upper() == "EMPTY":
                    return ""
                return cleaned
            except Exception as exc:  # noqa: BLE001
                logger.warning("Gemini audio STT failed, falling back to Groq Whisper: %s", exc)
                if not self._groq_client:
                    raise

        if not self._groq_client:
            raise RuntimeError("ยังไม่ได้ตั้งค่า GEMINI_API_KEY หรือ GROQ_API_KEY สำหรับถอดเสียงพูด")

        def _call_groq() -> str:
            result = self._groq_client.audio.transcriptions.create(
                model=self.stt_model,
                file=(filename, audio_bytes),
                language="th",
                prompt=THAI_STT_PROMPT,
                response_format="verbose_json",
                temperature=0.0,
            )
            return _clean_whisper_transcript(result)

        return await asyncio.to_thread(_call_groq)

    def _build_dm_prompt(
        self,
        room: RoomState,
        room_manager: RoomManager,
        player_name: str,
        transcript: str,
    ) -> str:
        repo = room_manager.repo
        act = room_manager.act_for_scene(room.current_scene)
        scene_cfg = repo.get_scene(room.current_scene) or {}
        eligible_dialogues = room_manager.get_eligible_dialogues(room)
        available_checks = room_manager.get_available_checks(room)

        dialogue_menu = [
            {
                "id": d["id"],
                "speaker": d["speaker"],
                "topic_hint": (d.get("trigger_condition") or {}).get("topic_hint", ""),
                "text": d["text"],
                "already_played": d["id"] in room.played_audio_ids,
            }
            for d in eligible_dialogues
        ]

        filler_menu = [
            {"id": f["id"], "speaker": f["speaker"], "text": f["text"]}
            for f in repo.get_fillers_for_act(act)
        ]

        check_menu = [
            {
                "id": c["id"],
                "title": c["title"],
                "stat": c["stat"],
                "dc": c["dc"],
                "trigger_hint": c.get("trigger_hint", ""),
            }
            for c in available_checks
        ]

        party_summary = [
            {
                "name": p.name,
                "role": p.role_name,
                "is_current_speaker": p.name == player_name,
                "hp": f"{p.hp}/{p.max_hp}",
                "sanity": f"{p.sanity}/{p.max_sanity}",
                "focus": f"{p.focus}/{p.max_focus}",
                "top_stats": {k: v for k, v in (p.stats or {}).items() if v >= 3},
                "skill": (p.skill or {}).get("name", ""),
            }
            for p in room.players.values()
        ]

        game_state_snapshot = {
            "act": act,
            "current_scene": room.current_scene,
            "clues_found": room.clues_found,
            "inventory": room.inventory,
            "npc_trust": room.npc_trust,
            "played_audio_ids": room.played_audio_ids,
            "pending_check": room.pending_check["id"] if room.pending_check else None,
        }

        guardrails = "\n".join(
            f"- {rule}" for rule in scene_cfg.get("spoiler_guardrails", [])
        )

        recent_turns = room.transcript_log[-12:]
        recent_lines = "\n".join(
            f"{t['speaker']}: {t['text']}" for t in recent_turns
        )
        scene_env = SCENE_ENVIRONMENT_NOTES.get(room.current_scene, "")
        world_lore = WORLD_LORE_BY_ACT.get(act, WORLD_LORE_BY_ACT["A"])

        ending_note = ""
        if room.current_scene == "A3":
            ending_note = (
                "\nกติกาตอนจบของฉาก A3:\n"
                "- ถ้าผู้เล่นตกลงเดินเข้าบ้านผู้ใหญ่บ้านเพื่อดูแฟ้ม/คุยพยาน -> เลือก selected_audio_id='a3_ending_true' และ state_updates.ending_triggered='act_a_complete'\n"
                "- ถ้าผู้เล่นยืนกรานจะเดินเข้าสวนกล้วยมืดทันทีโดยไม่ดูแผนที่ -> เลือก selected_audio_id='a3_ending_bad' และ state_updates.ending_triggered='lost_in_grove'\n"
            )
        elif act == "B":
            ending_note = (
                "\nกติกาการย้ายจุดและตอนจบของ ACT B (B1 <-> B2 <-> B3):\n"
                "- ผู้เล่นเดินสลับระหว่าง 3 จุดในบ้านผู้ใหญ่ได้อิสระ โดยตั้งค่า state_updates.current_scene:\n"
                "  * เดิน/กลับมาห้องรับแขก โต๊ะแผนที่ หรือคุยกับวิชัย -> state_updates.current_scene='B1'\n"
                "  * เดินออกไปชานบ้านหน้าประตู เพื่อแยกคุยกับต้นพ้นหูวิชัย -> state_updates.current_scene='B2'\n"
                "  * เดินไปดูผนังภาพเก่าปี 2534 และตู้แฟ้ม -> state_updates.current_scene='B3'\n"
                "  (เมื่อย้ายฉาก ให้ใช้ mode='improvise' บรรยายจังหวะเดินสั้น 1 ประโยค ระบบจะเล่นบทเปิดฉากใหม่ให้อัตโนมัติ)\n"
                "- ถ้าปรับความไว้วางใจของวิชัยหรือต้น ให้ระบุทั้ง state_updates.npc_trust_delta และ state_updates.npc_trust_target ('วิชัย' หรือ 'ต้น')\n"
                "- หากมีเบาะแส 'don_house_location' แล้วและทีมตกลงออกเดินทางไปบ้านดล -> เลือก selected_audio_id='b_ending_to_act_c' และ state_updates.ending_triggered='act_b_complete'\n"
                "- ข้อห้ามสำคัญ: ห้ามเลือก character='ประเสริฐ' ใน ACT B เด็ดขาด และในฉาก B3 ให้ใช้ character='DM' เท่านั้น\n"
            )
        elif act == "C":
            ending_note = (
                "\nกติกาการย้ายจุดและตอนจบของ ACT C (C1–C5):\n"
                "- เลือก state_updates.current_scene เพื่อเดินไปโต๊ะทำงาน (C2), มุมพื้นเสียงเคาะ (C3), นิมิต C4, หรือบ้านยายบุญมี (C5)\n"
                "- ใน C5 หากผู้เล่นได้คุยกับยายบุญมีแล้วและตกลงเดินเข้าสวนกล้วยต่อ -> เลือก selected_audio_id='c_ending_to_act_d' และ state_updates.ending_triggered='act_c_complete'\n"
            )
        elif act == "D":
            ending_note = (
                "\nกติกาการย้ายจุดและตอนจบของ ACT D (D1–D5):\n"
                "- เลือก state_updates.current_scene เพื่อเดินจาก D1 -> ศาล D2 -> พบแม่แก้ว D3/D4 -> แนวรอยล้อหลังศาล D5\n"
                "- ใน D5 เมื่อผู้เล่นสำรวจรอยล้อและตกลงตามไปที่เรือนไม้ร้างท้ายสวน -> เลือก selected_audio_id='d_ending_to_act_e' และ state_updates.ending_triggered='act_d_complete'\n"
            )
        elif act == "E":
            ending_note = (
                "\nกติกาการย้ายจุดและตอนจบของ ACT E (E1–E6, H1):\n"
                "- ผู้เล่นเปิดใต้ถุน (E2) -> แก้มัดคุยกับดล (E3) -> ขึ้นชั้นสองตรวจกำไล ตำรา และหลักฐานวิชัยใต้โต๊ะ (E4) -> เผชิญหน้าวิชัย (E5) -> คุมตัวเตรียมคลายกำไล (E6)\n"
                "- หากผู้เล่นนำบันทึกเวรประตูน้ำมาเทียบกับสมุดยายบุญมี -> ใช้ requested_check_id='H1_FLOOD_TIMELINE'\n"
                "- ใน E6 เมื่อผู้เล่นยืนยันเริ่มคลายกำไลทองเหลือง -> เลือก selected_audio_id='e_ending_to_act_f' และ state_updates.ending_triggered='act_e_complete'\n"
            )
        elif act == "F":
            ending_note = (
                "\nกติกาของ ACT F (FINAL F1, F5, F6 Epilogue):\n"
                "- ใน F1 เมื่อผู้เล่นพร้อมสู้/คลายเกราะ 3 ขั้น ระบบจะเปิดฉากต่อสู้ KAEW_FINAL_BOSS อัตโนมัติ (ห้ามข้ามไป F5 จนกว่าจะมี clue 'ritual_stopped')\n"
                "- ใน F5 หลังคลายเกราะสำเร็จ ให้ผู้เล่นเจรจากับแม่แก้ว (F5_KAEW_RECONCILE) หรือเลือกจัดการวิชัย แล้วมุ่งหน้าสู่รุ่งเช้า (F6: f5_move_to_f6_dawn)\n"
                "- ใน F6 เมื่อส่งมอบหลักฐานให้ประเสริฐ (f6_prasert_confess) และปิดคดี -> เลือก selected_audio_id='ending_a_epilogue' และ state_updates.ending_triggered='ending_a'\n"
            )

        speaker_hints_by_scene = {
            "B3": "'DM' เท่านั้น",
            "C1": "'DM' เท่านั้น",
            "C2": "'DM' เท่านั้น",
            "C3": "'DM' เท่านั้น",
            "C4": "'ผีเงาจมน้ำ' หรือ 'DM'",
            "C5": "'ยายบุญมี' หรือ 'DM'",
            "D1": "'DM' เท่านั้น",
            "D2": "'DM' เท่านั้น",
            "D3": "'แม่แก้ว (นางตานี)' หรือ 'DM'",
            "D4": "'แม่แก้ว (นางตานี)' หรือ 'DM'",
            "D5": "'DM' เท่านั้น",
            "E1": "'DM' เท่านั้น",
            "E2": "'ดล' หรือ 'DM'",
            "E3": "'ดล' หรือ 'DM'",
            "E4": "'DM' เท่านั้น",
            "E5": "'วิชัย' หรือ 'DM'",
            "E6": "'วิชัย' หรือ 'DM'",
            "F1": "'แม่แก้ว (นางตานี)' หรือ 'DM'",
            "F5": "'แม่แก้ว (นางตานี)', 'วิชัย', หรือ 'DM'",
            "F6": "'ประเสริฐ' หรือ 'DM'",
        }
        improv_speaker_hint = speaker_hints_by_scene.get(
            room.current_scene,
            "'วิชัย', 'ต้น', หรือ 'DM'" if act == "B" else "'ประเสริฐ' หรือ 'DM'",
        )

        return f"""คุณคือ AI Game Master (DM) และผู้สวมบท NPC สำหรับเกมสืบสวนสยองขวัญภาษาไทย 'CASE 001: เสียงร้องจากสวนกล้วย' (ช่วง ACT {act})

## ฉากปัจจุบันและสภาพแวดล้อม
- Scene: {room.current_scene} ({scene_cfg.get('title', '')})
- สถานการณ์: {scene_cfg.get('subtitle', '')}
- สภาพแวดล้อม: {scene_env}

## ข้อมูลโลกและบริบทฉาก (ใช้ตอบคำถามทั่วไปและบทบาทสมมติได้อิสระ)
{world_lore}

## ทีมผู้สืบสวนในห้องตอนนี้
{json.dumps(party_summary, ensure_ascii=False)}

## กฎการตัดสินใจและข้อห้ามสปอยล์ (ห้ามละเมิดข้อห้ามสปอยล์เด็ดขาด)
{guardrails}
- ห้ามเร่งเนื้อเรื่อง ห้ามเปลี่ยนฉาก (ตั้งค่า state_updates.current_scene หรือเลือกบทที่เปลี่ยนฉาก) และห้ามจบ Act (ตั้งค่า state_updates.ending_triggered) เองจนกว่าผู้เล่นจะบอกหรือยืนยันชัดเจนว่าต้องการไปต่อหรือย้ายจุดแล้ว หากผู้เล่นยังถามหรือสำรวจอยู่ในฉากเดิม ให้ตอบอยู่ในฉากเดิมต่อเสมอ
- ห้ามเสกเบาะแสหรือไอเท็มนอกเหนือจากฉากปัจจุบัน และห้ามเปลี่ยนไปฉากที่ไม่อยู่ใน allowed_next_scenes ของฉากนี้
- เลือก mode='script' และ selected_audio_id จาก dialogue_menu เฉพาะเมื่อคำถามตรงกับ topic_hint ของบทนั้น (ให้ความสำคัญกับบทที่ already_played=false ก่อน)
- ห้ามเลือกบทที่ already_played=true ซ้ำ ยกเว้นผู้เล่นขอให้พูดซ้ำหรือทบทวนโดยตรง — หากผู้เล่นถามต่อยอดหรือถามซ้ำ ให้ใช้ mode='improvise' ตอบขยายความหรือรับมุกอย่างเป็นธรรมชาติแทน
- เมื่อผู้เล่นถามคำถามทั่วไป สำรวจสิ่งของ/สภาพแวดล้อม (เช่น รถตู้ เฟอร์นิเจอร์ สภาพอากาศ เสื้อผ้า อาชีพเพื่อน) หรือชวนคุยเล่นในบทบาท -> ใช้ mode='improvise' (ตั้ง selected_audio_id=null) แล้วให้ character เป็น {improv_speaker_hint} ตอบตรงคำถาม 1-3 ประโยคภาษาไทยที่เป็นธรรมชาติ พร้อมเลือก filler_audio_id ที่ตรงกับผู้พูด
- กฎแยกผู้พูด DM กับ NPC (สำคัญ): หากข้อความเป็นคำบรรยายบุคคลที่ 3 (บรรยายท่าทาง แววตา บรรยากาศ หรือขึ้นต้นด้วยชื่อตัวละครเช่น 'ผู้ใหญ่ประเสริฐ...', 'วิชัย...', 'ต้น...', 'คุณเห็น...', 'คุณสังเกต...') ต้องตั้ง character='DM' และ filler_audio_id='filler_dm_think' เท่านั้น — หากเลือก character เป็น NPC ('ประเสริฐ', 'วิชัย', 'ต้น') ข้อความ improvised_text ต้องเป็นคำพูดโต้ตอบตรงในมุมมองบุคคลที่ 1 (ผม/ฉัน/พี่) เท่านั้น ห้ามบรรยายท่าทางตัวเองแบบบุคคลที่ 3
- ถ้าผู้เล่นขอทำแอ็กชันที่ตรงกับ trigger_hint ใน available_checks และยังไม่ได้ทอย -> ให้ตั้งค่า requested_check_id เป็น id ของ check นั้น และใช้ mode='improvise' (selected_audio_id=null) อธิบายสั้น ๆ ใน improvised_text ให้ผู้เล่นกดทอยเต๋า
{ending_note}

## สถานะเกมปัจจุบัน (Game State)
{json.dumps(game_state_snapshot, ensure_ascii=False)}

## บทพูดตามสคริปต์ที่ใช้ได้ในฉาก {room.current_scene} (เลือกได้เฉพาะ id ในรายการนี้)
{json.dumps(dialogue_menu, ensure_ascii=False)}

## เสียงคั่นเวลา (ใช้เฉพาะตอน mode='improvise')
{json.dumps(filler_menu, ensure_ascii=False)}

## การ์ดทอยเต๋า (Dice Checks) ที่ยังใช้ได้ในฉากนี้
{json.dumps(check_menu, ensure_ascii=False)}

## บทสนทนาล่าสุด (12 ข้อความล่าสุด)
{recent_lines or '(ยังไม่มีบทสนทนาก่อนหน้า)'}

## คำพูดของผู้เล่นในเทิร์นนี้
[{player_name}]: {transcript}
"""

    async def decide_turn(
        self,
        room: RoomState,
        room_manager: RoomManager,
        player_name: str,
        transcript: str,
    ) -> tuple[DMDecision, bool]:
        """Return (DMDecision, used_fallback_bool)."""
        if not self.gemini_ready:
            return self._local_fallback_decision(room, room_manager, transcript), True

        prompt = self._build_dm_prompt(room, room_manager, player_name, transcript)

        def _call_gemini(client: Any) -> DMDecision:
            from google.genai.types import GenerateContentConfig

            response = client.models.generate_content(
                model=self.dm_model,
                contents=prompt,
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=DMDecision,
                    temperature=0.3,
                ),
            )
            parsed = getattr(response, "parsed", None)
            if isinstance(parsed, DMDecision):
                return parsed
            if isinstance(parsed, dict):
                return DMDecision.model_validate(parsed)
            return DMDecision.model_validate_json(response.text)

        try:
            decision = await asyncio.to_thread(self._run_with_gemini_failover, _call_gemini)
            return decision, False
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini DM decision failed, using local fallback: %s", exc)
            return self._local_fallback_decision(room, room_manager, transcript), True

    def _local_fallback_decision(
        self,
        room: RoomState,
        room_manager: RoomManager,
        transcript: str,
    ) -> DMDecision:
        """Deterministic Thai keyword matcher when GEMINI_API_KEY is unset or unavailable."""
        text = transcript.lower()
        eligible_ids = {d["id"] for d in room_manager.get_eligible_dialogues(room)}
        available_check_ids = {c["id"] for c in room_manager.get_available_checks(room)}
        scene = room.current_scene

        def pick_script(did: str, speaker: str = "ประเสริฐ", check_id: Optional[str] = None, ending: Optional[str] = None) -> DMDecision:
            return DMDecision(
                mode="script",
                character=speaker,
                selected_audio_id=did,
                requested_check_id=check_id,
                state_updates=StateUpdates(ending_triggered=ending),  # type: ignore[arg-type]
                reason="local_fallback_keyword",
            )

        if scene == "A1":
            if any(k in text for k in ("สังเกต", "พิรุธ", "ท่าที", "สีหน้า", "per")) and "A1_PER_OBSERVE" in available_check_ids:
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเพ่งสังเกตท่าทีของประเสริฐและบรรยากาศรอบศาลาอย่างตั้งใจ — กรุณากดทอยเต๋า PER เพื่อประเมินสิ่งที่สังเกตเห็น",
                    requested_check_id="A1_PER_OBSERVE",
                    reason="local_fallback_check_per",
                )
            if any(k in text for k in ("ตรวจ", "วิเคราะห์", "ละเอียด", "int")) and any(k in text for k in ("เอกสาร", "ใบรับแจ้ง", "แฟ้ม")) and "A1_INT_FILES" in available_check_ids:
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเปิดดูรายละเอียดวันเวลาในสำเนาใบรับแจ้งคนหาย — กรุณากดทอยเต๋า INT เพื่อตรวจสอบจุดผิดปกติ",
                    requested_check_id="A1_INT_FILES",
                    reason="local_fallback_check_int",
                )
            if any(k in text for k in ("หญิงชุดเขียว", "ชุดเขียว", "แก้ว")) and "a1_qa_green_lady" in eligible_ids:
                return pick_script("a1_qa_green_lady", "ประเสริฐ")
            if any(k in text for k in ("คลี่แฟ้ม", "เปิดแฟ้ม", "ข้างรถ", "รถตู้", "ไปบ้าน", "ไปต่อ")) and "a1_open_folder_to_a2" in eligible_ids:
                return pick_script("a1_open_folder_to_a2", "DM")
            if any(k in text for k in ("ใบรับแจ้ง", "เอกสาร", "ขอดูใบ")) and "a1_inspect_report_free" in eligible_ids:
                return pick_script("a1_inspect_report_free", "DM")
            if any(k in text for k in ("ปิดบัง", "โกหก", "ความลับ", "พิรุธ")) and "a1_qa_hiding_secret" in eligible_ids:
                return pick_script("a1_qa_hiding_secret", "ประเสริฐ")
            if any(k in text for k in ("หายตรงไหน", "แถวไหน", "ที่ไหน", "สถานที่")) and "a1_qa_location" in eligible_ids:
                return pick_script("a1_qa_location", "ประเสริฐ")
            if any(k in text for k in ("ตำรวจ", "แจ้งความ")) and "a1_qa_police" in eligible_ids:
                return pick_script("a1_qa_police", "ประเสริฐ")
            if any(k in text for k in ("จ้าง", "บริษัท")) and "a1_qa_why_company" in eligible_ids:
                return pick_script("a1_qa_why_company", "ประเสริฐ")
            if any(k in text for k in ("ค่าจ้าง", "เงิน", "ราคา")) and "a1_qa_fee" in eligible_ids:
                return pick_script("a1_qa_fee", "ประเสริฐ")
            if any(k in text for k in ("เป็นใคร", "ทำงานอะไร", "นิสัย", "ประวัติ", "รู้จักดล", "รู้จักนิด", "รู้จักเพิ่ม")) and "a1_qa_missing_who" in eligible_ids:
                return pick_script("a1_qa_missing_who", "ประเสริฐ")
            if any(k in text for k in ("คนหาย", "ใครบ้าง", "ลำดับ", "ชื่อ")) and "a1_qa_order" in eligible_ids:
                return pick_script("a1_qa_order", "ประเสริฐ")

        elif scene == "A2":
            if any(k in text for k in ("สัมผัส", "พลัง", "วิญญาณ", "คลื่น", "spi")) and "A2_RADIO_ECHO" in available_check_ids:
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_radio_static",
                    improvised_text="คุณยื่นมือเข้าใกล้เครื่องวิทยุสื่อสารและตั้งจิตสัมผัสคลื่นที่หลงเหลืออยู่ — กรุณากดทอยเต๋า SPI",
                    requested_check_id="A2_RADIO_ECHO",
                    reason="local_fallback_check_spi",
                )
            if any(k in text for k in ("บันทึก", "ย้อนหลัง", "ฟังซ้ำ", "เช็กวิทยุ", "ตรวจเครื่อง")) and "a2_qa_replay_static" in eligible_ids:
                return pick_script("a2_qa_replay_static", "DM")
            if any(k in text for k in ("เสียงใคร", "พูดว่าอะไร", "พูดอะไร")) and "a2_qa_whose_voice" in eligible_ids:
                return pick_script("a2_qa_whose_voice", "DM")
            if any(k in text for k in ("มาจากไหน", "ข้างนอก")) and "a2_qa_radio_origin" in eligible_ids:
                return pick_script("a2_qa_radio_origin", "DM")
            if any(k in text for k in ("บ้านผู้ใหญ่", "ดูแฟ้ม", "ไปต่อ", "เดินทาง")) and "a2_move_to_a3" in eligible_ids:
                return pick_script("a2_move_to_a3", "ประเสริฐ")

        elif scene == "A3":
            if any(k in text for k in ("เข้าบ้าน", "ดูแฟ้ม", "ตกลง", "เข้าไป")) and "a3_ending_true" in eligible_ids:
                return pick_script("a3_ending_true", "DM", ending="act_a_complete")
            if any(k in text for k in ("เข้าสวน", "แยกเดิน", "ไม่รอ", "บุกสวน")) and "a3_ending_bad" in eligible_ids:
                return pick_script("a3_ending_bad", "DM", ending="lost_in_grove")
            if any(k in text for k in ("ใครรอ", "พยาน", "วิชัย", "ต้น")) and "a3_qa_who_waiting" in eligible_ids:
                return pick_script("a3_qa_who_waiting", "ประเสริฐ")
            if any(k in text for k in ("ทำไมไม่", "พาเข้าสวน")) and "a3_qa_why_not_grove" in eligible_ids:
                return pick_script("a3_qa_why_not_grove", "ประเสริฐ")

        elif scene in {"B1", "B2", "B3"}:
            if any(k in text for k in ("บ้านดล", "ไปบ้านดล", "ออกเดินทาง", "ข้อมูลพอแล้ว")) and "b_ending_to_act_c" in eligible_ids:
                return pick_script("b_ending_to_act_c", "DM", ending="act_b_complete")
            if any(k in text for k in ("วิชัยไปด้วย", "ไปด้วยกันไหม", "ไปบ้านดลด้วย", "อยู่เฝ้า", "รออยู่ที่นี่")) and "b3_wichai_stay_behind" in eligible_ids:
                return pick_script("b3_wichai_stay_behind", "วิชัย")

            if scene != "B2" and any(k in text for k in ("ชานบ้าน", "ออกไปคุยกับต้น", "แยกคุย", "ตามต้นออกไป", "หน้าประตู")):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินเลี่ยงออกจากห้องรับแขกไปที่ชานบ้านหน้าประตูเพื่อคุยกับต้นให้พ้นสายตาวิชัย",
                    state_updates=StateUpdates(current_scene="B2"),
                    reason="local_fallback_move_b2",
                )
            if scene != "B3" and any(k in text for k in ("ผนัง", "ภาพเก่า", "ภาพถ่าย", "กรอบรูป", "2534", "ตู้แฟ้ม")) and not (
                scene == "B1" and any(k in text for k in ("ถามวิชัย", "วิชัย")) and "b1_qa_wichai_flood_kaew" in eligible_ids
            ):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินไปสำรวจผนังภาพถ่ายเก่าปี 2534 และตู้แฟ้มด้านในห้องรับแขก",
                    state_updates=StateUpdates(current_scene="B3"),
                    reason="local_fallback_move_b3",
                )
            if scene != "B1" and any(k in text for k in ("ห้องรับแขก", "กลับเข้าบ้าน", "โต๊ะแผนที่", "ไปหาวิชัย")):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินกลับเข้ามาที่โต๊ะแผนที่ในห้องรับแขกบ้านผู้ใหญ่",
                    state_updates=StateUpdates(current_scene="B1"),
                    reason="local_fallback_move_b1",
                )

            if scene == "B1":
                if any(k in text for k in ("สังเกต", "พิรุธ", "ท่าที", "แววตา", "สีหน้า", "per")) and "B2_WICHAI_TELL" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณเพ่งสังเกตสีหน้า จังหวะคำพูด และแววตาของวิชัยอย่างละเอียด — กรุณากดทอยเต๋า PER",
                        requested_check_id="B2_WICHAI_TELL",
                        reason="local_fallback_check_b2_per",
                    )
                if any(k in text for k in ("แฟ้ม", "แผนที่", "โต๊ะ", "ตรวจดู", "ขอดู")) and "b1_inspect_files_free" in eligible_ids:
                    return pick_script("b1_inspect_files_free", "DM")
                if any(k in text for k in ("น้ำท่วม", "2534", "แม่แก้ว", "แก้ว")) and "b1_qa_wichai_flood_kaew" in eligible_ids:
                    return pick_script("b1_qa_wichai_flood_kaew", "วิชัย")
                if any(k in text for k in ("รอยข่วน", "รอยช้ำ", "หลังมือ", "มือของวิชัย", "แผล")) and "b1_qa_wichai_hand" in eligible_ids:
                    return pick_script("b1_qa_wichai_hand", "วิชัย")
                if any(k in text for k in ("วงสีน้ำเงิน", "ที่ดิน", "ซื้อขาย", "บังคับขาย")) and "b1_qa_wichai_land" in eligible_ids:
                    return pick_script("b1_qa_wichai_land", "วิชัย")
                if any(k in text for k in ("กลางคืน", "เคยเข้าสวน", "คืนเกิดเหตุ")) and "b1_qa_wichai_night_grove" in eligible_ids:
                    return pick_script("b1_qa_wichai_night_grove", "วิชัย")
                if any(k in text for k in ("ผี", "ข่าวลือ", "แก้ว")) and "b1_qa_wichai_ghost_rumor" in eligible_ids:
                    return pick_script("b1_qa_wichai_ghost_rumor", "วิชัย")
                if any(k in text for k in ("ดล", "นิสัยดล")) and "b1_qa_wichai_don" in eligible_ids:
                    return pick_script("b1_qa_wichai_don", "วิชัย")
                if any(k in text for k in ("ประเสริฐ", "ผู้ใหญ่ไปไหน", "ผู้ใหญ่หาย")) and "b1_qa_where_prasert" in eligible_ids:
                    return pick_script("b1_qa_where_prasert", "วิชัย")
                if any(k in text for k in ("จับ", "คนร้าย", "ปรักปรำ", "คุมตัว", "โกหก")) and "b1_qa_accuse_wichai" in eligible_ids:
                    return pick_script("b1_qa_accuse_wichai", "วิชัย")
                if any(k in text for k in ("เข้าสวน", "พาทัวร์สวน")) and "b1_warn_skip_to_grove" in eligible_ids:
                    return pick_script("b1_warn_skip_to_grove", "วิชัย")
                if any(k in text for k in ("ต้น", "ทักต้น", "อาสา")) and "b1_ton_short_greet" in eligible_ids:
                    return pick_script("b1_ton_short_greet", "ต้น")

            elif scene == "B2":
                if any(k in text for k in ("ปลอบ", "มั่นใจ", "เล่ามาให้หมด", "ปลอดภัย", "เกลี้ยกล่อม", "ความจริง", "soc")) and "B3_TON_DISCLOSURE" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_ton_nervous",
                        improvised_text="คุณหันไปยืนยันกับต้นว่าตรงนี้พ้นหูวิชัยแล้ว — กรุณากดทอยเต๋า SOC เพื่อกล่อมให้ต้นยอมเล่าสิ่งที่เห็น",
                        requested_check_id="B3_TON_DISCLOSURE",
                        reason="local_fallback_check_b3_soc",
                    )
                if any(k in text for k in ("ขู่", "บังคับ", "ตะคอก", "สารภาพ")) and "b2_qa_ton_threaten" in eligible_ids:
                    return pick_script("b2_qa_ton_threaten", "ต้น")
                if any(k in text for k in ("ห่อผ้า", "รถเข็น", "เห็นหน้า")) and "b2_qa_ton_bundle_detail" in eligible_ids:
                    return pick_script("b2_qa_ton_bundle_detail", "ต้น")
                if any(k in text for k in ("กลัว", "ระแวง", "ทำไมมา", "ไม่อยากซวย")) and "b2_qa_ton_why_scared" in eligible_ids:
                    return pick_script("b2_qa_ton_why_scared", "ต้น")
                if any(k in text for k in ("ผี", "เปียกน้ำ", "ชุดเขียว")) and "b2_qa_ton_ghost" in eligible_ids:
                    return pick_script("b2_qa_ton_ghost", "ต้น")
                if any(k in text for k in ("รู้จักดล", "รู้จักนิด", "รู้จักเพิ่ม", "รุ่นเดียว", "ก่อนหาย", "คุยอะไรกับดล", "เพื่อน")) and "b2_qa_ton_friends" in eligible_ids:
                    return pick_script("b2_qa_ton_friends", "ต้น")
                if any(k in text for k in ("เห็นอะไร", "คืนนั้น", "ทางเข้าสวน", "เล่า")) and "b2_ton_baseline" in eligible_ids:
                    return pick_script("b2_ton_baseline", "ต้น")

            elif scene == "B3":
                if any(k in text for k in ("เทียบ", "แผนที่", "เชื่อมโยง", "ทางน้ำ", "แนวคันดิน", "int")) and "B4_FLOOD_PHOTO" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณยกภาพถ่ายประตูน้ำปี 2534 ขึ้นมาเทียบแนวคันดินกับแผนที่หมู่บ้าน — กรุณากดทอยเต๋า INT",
                        requested_check_id="B4_FLOOD_PHOTO",
                        reason="local_fallback_check_b4_int",
                    )
                if any(k in text for k in ("ยกกรอบ", "แตะกรอบ", "ดูใกล้", "หยดน้ำ", "กระจก")) and "b3_inspect_frame_droplet" in eligible_ids:
                    return pick_script("b3_inspect_frame_droplet", "DM")
                if any(k in text for k in ("รื้อ", "ตู้แฟ้ม", "เอกสารเก่า", "บันทึกเวร")) and "b3_open_old_folder_free" in eligible_ids:
                    return pick_script("b3_open_old_folder_free", "DM")
                if any(k in text for k in ("ใครในรูป", "ประเสริฐ", "อพยพ", "เก็บแฟ้ม")) and "b3_qa_photo_prasert" in eligible_ids:
                    return pick_script("b3_qa_photo_prasert", "DM")

        elif scene.startswith("C"):
            if scene == "C5" and any(k in text for k in ("เข้าสวน", "ไปศาล", "ไปต่อ", "จบบท", "act d")) and "c_ending_to_act_d" in eligible_ids:
                return pick_script("c_ending_to_act_d", "DM", ending="act_c_complete")
            if scene != "C2" and any(k in text for k in ("โต๊ะทำงาน", "สมุดดล", "ปฏิทิน", "c2")):
                if "c1_search_desk_to_c2" in eligible_ids:
                    return pick_script("c1_search_desk_to_c2", "DM")
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินไปสำรวจโต๊ะทำงานของดลที่มีปฏิทินและสมุดปกดำวางอยู่",
                    state_updates=StateUpdates(current_scene="C2"),
                    reason="local_fallback_move_c2",
                )
            if scene != "C3" and any(k in text for k in ("เคาะ", "พื้นไม้", "คราบ", "มุมห้อง", "c3")):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณขยับไปดูมุมพื้นไม้ในห้องที่ส่งเสียงเคาะสามครั้งและมีคราบชื้นเย็นเยียบ",
                    state_updates=StateUpdates(current_scene="C3"),
                    reason="local_fallback_move_c3",
                )
            if scene != "C5" and any(k in text for k in ("ยาย", "บุญมี", "บ้านยาย", "c5")):
                if scene == "C4" and "c4_leave_to_c5" in eligible_ids:
                    return pick_script("c4_leave_to_c5", "DM")
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินออกมาที่เรือนไม้ของยายบุญมีก่อนทางแยกเข้าสวนกล้วย",
                    state_updates=StateUpdates(current_scene="C5"),
                    reason="local_fallback_move_c5",
                )
            if scene == "C1":
                if any(k in text for k in ("กับข้าว", "จาน", "ประตู", "มุ้งลวด")) and "c1_qa_food_door" in eligible_ids:
                    return pick_script("c1_qa_food_door", "DM")
                if any(k in text for k in ("ใต้พื้น", "ห้องขัง", "คนหาย")) and "c1_check_floor_empty" in eligible_ids:
                    return pick_script("c1_check_floor_empty", "DM")
            elif scene == "C2":
                if any(k in text for k in ("เทียบ", "int", "ราคา", "ที่ดิน", "ข่าวผี")) and "C2_LAND_PATTERN" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณเปิดสมุดปกดำเทียบวันที่ข่าวผีกับวันนัดซื้อขายที่ดิน — กรุณากดทอยเต๋า INT",
                        requested_check_id="C2_LAND_PATTERN",
                        reason="local_fallback_check_c2_int",
                    )
                if any(k in text for k in ("อ่าน", "สมุด", "รายละเอียด")) and "c2_qa_read_all" in eligible_ids:
                    return pick_script("c2_qa_read_all", "DM")
            elif scene == "C3":
                if any(k in text for k in ("สัมผัส", "spi", "ด้าย", "พลัง", "ตรวจ")) and "C3_SPIRIT_RESIDUE" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณยื่นมือสัมผัสไอเย็นรอบเศษด้ายดำและคราบชื้นบนพื้น — กรุณากดทอยเต๋า SPI",
                        requested_check_id="C3_SPIRIT_RESIDUE",
                        reason="local_fallback_check_c3_spi",
                    )
                if any(k in text for k in ("เรียก", "เงา", "เผชิญ", "c4")) and "c3_trigger_c4_echo" in eligible_ids:
                    return pick_script("c3_trigger_c4_echo", "DM")
            elif scene == "C4":
                if any(k in text for k in ("ตั้งจิต", "ขอภาพ", "นิมิต", "spi", "ติดต่อ")) and "C4_DROWNED_ECHO_VISION" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณตั้งจิตติดต่อกับเงาดำเปียกโชกเพื่อรับภาพนิมิตคืนเกิดเหตุ — กรุณากดทอยเต๋า SPI",
                        requested_check_id="C4_DROWNED_ECHO_VISION",
                        reason="local_fallback_check_c4_spi",
                    )
                if any(k in text for k in ("ถอย", "ไป", "ยาย", "c5")) and "c4_leave_to_c5" in eligible_ids:
                    return pick_script("c4_leave_to_c5", "DM")
            elif scene == "C5":
                if any(k in text for k in ("เทียบ", "สมุดสวดมนต์", "อพยพ", "ประตูน้ำ", "int")) and "C5_EVACUATION_RECORDS" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id=None,
                        improvised_text="คุณเปิดสมุดสวดมนต์จดชื่ออพยพของยายบุญมีมาเทียบเวลาประตูน้ำปี 2534 — กรุณากดทอยเต๋า INT",
                        requested_check_id="C5_EVACUATION_RECORDS",
                        reason="local_fallback_check_c5_int",
                    )
                if any(k in text for k in ("ช่วยใคร", "เด็ก", "วิชัย")) and "c5_qa_which_child" in eligible_ids:
                    return pick_script("c5_qa_which_child", "ยายบุญมี")
                if any(k in text for k in ("แม่แก้ว", "แก้ว", "น้ำท่วม", "2534")) and "c5_qa_kaew_story" in eligible_ids:
                    return pick_script("c5_qa_kaew_story", "ยายบุญมี")
                if any(k in text for k in ("สมุด", "ด้ายดำ", "ศาล")) and "c5_qa_floodgate_book" in eligible_ids:
                    return pick_script("c5_qa_floodgate_book", "ยายบุญมี")

        elif scene.startswith("D"):
            if scene == "D5" and any(k in text for k in ("เรือนไม้", "ตามรอย", "ไปต่อ", "จบบท", "act e")) and "d_ending_to_act_e" in eligible_ids:
                return pick_script("d_ending_to_act_e", "DM", ending="act_d_complete")
            if scene == "D1" and any(k in text for k in ("ศาล", "ผ้าเขียว", "เดิน", "d2")) and "d1_move_to_d2" in eligible_ids:
                return pick_script("d1_move_to_d2", "DM")
            if scene == "D2":
                if any(k in text for k in ("ตรวจ", "ปมด้าย", "int", "เทียบ", "สายกล้อง")) and "D2_BINDING_PATTERN" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณส่องไฟตรวจปมด้ายดำ ป้ายชื่อ 3 คน และสายกล้องของนิดโดยยังไม่แตะต้องปลายสาย — กรุณากดทอยเต๋า INT",
                        requested_check_id="D2_BINDING_PATTERN",
                        reason="local_fallback_check_d2_int",
                    )
                if any(k in text for k in ("ตัด", "ดึง", "กระชาก")) and "d2_qa_warn_cut" in eligible_ids:
                    return pick_script("d2_qa_warn_cut", "DM")
                if any(k in text for k in ("หลังเสา", "แม่แก้ว", "เรียก", "d3")) and "d2_move_to_d3" in eligible_ids:
                    return pick_script("d2_move_to_d3", "DM")
            if scene == "D3":
                if any(k in text for k in ("ตั้งจิต", "สัมผัส", "spi", "ความรู้สึก")) and "D3_KAEW_CONTACT" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณตั้งจิตสื่อสารและสัมผัสแรงกดดันของเส้นด้ายที่รั้งร่างแม่แก้ว — กรุณากดทอยเต๋า SPI",
                        requested_check_id="D3_KAEW_CONTACT",
                        reason="local_fallback_check_d3_spi",
                    )
                if any(k in text for k in ("ทำไม", "หลอก", "จับคน")) and "d3_qa_why_scare" in eligible_ids:
                    return pick_script("d3_qa_why_scare", "แม่แก้ว (นางตานี)")
                if any(k in text for k in ("ใครคุม", "ใครสั่ง", "กำไล", "วิชัย")) and "d3_qa_who_controls" in eligible_ids:
                    return pick_script("d3_qa_who_controls", "แม่แก้ว (นางตานี)")
                if any(k in text for k in ("บุญมี", "ยาย")) and "d3_qa_boonmee" in eligible_ids:
                    return pick_script("d3_qa_boonmee", "แม่แก้ว (นางตานี)")
                if any(k in text for k in ("ปะทะ", "สู้", "d4")):
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="เส้นด้ายดำกระตุกตึงจนแม่แก้วถูกดึงพุ่งเข้ามาขวางหน้าศาล — เตรียมรับมือแม่แก้วในร่างเงา!",
                        state_updates=StateUpdates(current_scene="D4"),
                        reason="local_fallback_move_d4",
                    )
                if any(k in text for k in ("รอยล้อ", "หลังศาล", "เดินอ้อม", "d5")) and "d3_move_to_d5" in eligible_ids:
                    return pick_script("d3_move_to_d5", "DM")
            if scene == "D4" and any(k in text for k in ("รอยล้อ", "d5", "อ้อม", "ปลอบ", "ผ่าน")) and "d4_reconcile_to_d5" in eligible_ids:
                return pick_script("d4_reconcile_to_d5", "แม่แก้ว (นางตานี)")
            if scene == "D5":
                if any(k in text for k in ("สำรวจ", "รอยล้อ", "per", "กระสอบ", "รองเท้า")) and "D5_CART_TRACKS" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณส่องไฟสำรวจรอยล้อรถเข็นหนัก เศษกระสอบข้าว และรอยรองเท้าหลังศาล — กรุณากดทอยเต๋า PER",
                        requested_check_id="D5_CART_TRACKS",
                        reason="local_fallback_check_d5_per",
                    )

        elif scene.startswith("E"):
            if "H1_FLOOD_TIMELINE" in available_check_ids and any(
                k in text for k in ("h1", "เส้นเวลา", "เวรประตูน้ำ", "สมุดยายบุญมี", "เทียบหลักฐาน 2534")
            ):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณวางสมุดอพยพของยายบุญมีเทียบเวลาเข้ากับบันทึกเวรเปิดประตูน้ำปี 2534 — กรุณากดทอยเต๋า INT (H1)",
                    requested_check_id="H1_FLOOD_TIMELINE",
                    reason="local_fallback_check_h1_int",
                )
            if scene == "E6" and any(k in text for k in ("คลายกำไล", "เริ่ม", "act f", "จบบท", "ลงมือ")) and "e_ending_to_act_f" in eligible_ids:
                return pick_script("e_ending_to_act_f", "DM", ending="act_e_complete")
            if scene == "E1":
                if any(k in text for k in ("ใต้ถุน", "กระสอบ", "ประตู", "e2")) and "e1_open_cellar_to_e2" in eligible_ids:
                    return pick_script("e1_open_cellar_to_e2", "DM")
                if any(k in text for k in ("ชั้นสอง", "ข้างบน", "บันได", "e4")):
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณย่องขึ้นบันไดไม้เก่าไปยังห้องพิธีชั้นสองที่มีแสงเทียนสีส้ม",
                        state_updates=StateUpdates(current_scene="E4"),
                        reason="local_fallback_move_e4",
                    )
            if scene == "E2":
                if any(k in text for k in ("ถีบ", "พัง", "งัด", "body", "กระแทก")) and "E2_DOOR_BREAK" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณเตรียมถีบกระแทกกลอนประตูห้องใต้ถุนให้หลุด — กรุณากดทอยเต๋า BODY",
                        requested_check_id="E2_DOOR_BREAK",
                        reason="local_fallback_check_e2_body",
                    )
                if any(k in text for k in ("ช่วย", "แก้มัด", "เข้าไป", "e3")) and "e2_untie_to_e3" in eligible_ids:
                    return pick_script("e2_untie_to_e3", "DM")
            if scene == "E3":
                if any(k in text for k in ("ปลอบ", "เรียงลำดับ", "soc", "ดล")) and "E3_HOSTAGES_ORDER" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id=None,
                        improvised_text="คุณช่วยปลอบดลให้หายสั่นและถามรายละเอียดการถูกจับ — กรุณากดทอยเต๋า SOC",
                        requested_check_id="E3_HOSTAGES_ORDER",
                        reason="local_fallback_check_e3_soc",
                    )
                if any(k in text for k in ("ใครทำ", "วิชัย", "ถามดล")) and "e3_don_confirm" in eligible_ids:
                    return pick_script("e3_don_confirm", "ดล")
                if any(k in text for k in ("ชั้นสอง", "ขึ้นข้างบน", "ห้องพิธี", "e4")) and "e3_upstairs_to_e4" in eligible_ids:
                    return pick_script("e3_upstairs_to_e4", "DM")
            if scene == "E4":
                if any(k in text for k in ("ถอด", "ตำรา", "กำไล", "int", "ลำดับ", "คลาย")) and "E4_BRACELET_DECODE" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณกางตำราพิธีบนโต๊ะชั้นสองเพื่อถอดลำดับคลายเกราะกำไล 3 ขั้น — กรุณากดทอยเต๋า INT",
                        requested_check_id="E4_BRACELET_DECODE",
                        reason="local_fallback_check_e4_int",
                    )
                if any(k in text for k in ("ใต้โต๊ะ", "กระเป๋า", "หนี้", "สัญญา", "ค้น")) and "e4_search_under_table" in eligible_ids:
                    return pick_script("e4_search_under_table", "DM")
                if any(k in text for k in ("วิชัย", "เสียงฝีเท้า", "บันได", "e5")) and "e4_wichai_arrives_to_e5" in eligible_ids:
                    return pick_script("e4_wichai_arrives_to_e5", "DM")
            if scene == "E5":
                if any(k in text for k in ("กดดัน", "เจรจา", "จี้หลักฐาน", "soc", "ยอมรับ")) and "E5_WICHAI_NEGOTIATE" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_wichai_think",
                        improvised_text="คุณชูสัญญาซื้อขายที่ดินและหนังสือทวงหนี้จี้ถามวิชัยตรง ๆ — กรุณากดทอยเต๋า SOC",
                        requested_check_id="E5_WICHAI_NEGOTIATE",
                        reason="local_fallback_check_e5_soc",
                    )
                if any(k in text for k in ("แรงจูงใจ", "สารภาพ", "ทำไม", "หลอกแม่แก้ว")) and "e5_qa_confess_motive" in eligible_ids:
                    return pick_script("e5_qa_confess_motive", "วิชัย")
                if any(k in text for k in ("มัด", "คุมตัว", "จับ", "e6")) and "e5_capture_to_e6" in eligible_ids:
                    return pick_script("e5_capture_to_e6", "DM")

        elif scene.startswith("F"):
            if scene == "F5":
                if any(k in text for k in ("เจรจา", "ปรองดอง", "ขอร้อง", "soc", "เปิดเผย")) and "F5_KAEW_RECONCILE" in available_check_ids:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id=None,
                        improvised_text="คุณเอ่ยกับแม่แก้วอย่างจริงใจและแสดงความตั้งใจจะเปิดเผยความจริงให้ชาวบ้านรับรู้ — กรุณากดทอยเต๋า SOC",
                        requested_check_id="F5_KAEW_RECONCILE",
                        reason="local_fallback_check_f5_soc",
                    )
                if any(k in text for k in ("รุ่งเช้า", "ฟ้าสาง", "หน้าถนน", "ประเสริฐ", "f6")) and "f5_move_to_f6_dawn" in eligible_ids:
                    return pick_script("f5_move_to_f6_dawn", "DM")
            if scene == "F6":
                if any(k in text for k in ("ประเสริฐ", "h1", "ประตูน้ำ", "หลักฐาน", "ยื่น")) and "f6_prasert_confess" in eligible_ids:
                    return pick_script("f6_prasert_confess", "ประเสริฐ")
                if any(k in text for k in ("จบคดี", "ปิดคดี", "สรุป", "epilogue", "รถตู้", "กลับ")) and "ending_a_epilogue" in eligible_ids:
                    return pick_script("ending_a_epilogue", "DM", ending=room_manager.resolve_final_ending(room))

        default_speaker = room_manager.default_speaker_for_scene(scene)
        filler_obj = room_manager.repo.default_filler_for_speaker(default_speaker)
        default_filler = filler_obj["id"] if filler_obj else None
        if default_speaker == "ประเสริฐ":
            default_text = "ความจริงทั้งหมดอยู่ที่เอกสารตรงหน้าแล้วครับ พวกคุณตัดสินใจได้เลย" if scene == "F6" else "ผมอยากให้เราตรวจดูข้อมูลคนหายและแฟ้มที่บ้านผมให้แน่ใจก่อนนะครับ มีอะไรอยากถามเพิ่มไหม?"
        elif default_speaker == "วิชัย":
            default_text = "ข้อมูลคนหายกับแผนที่อยู่ที่โต๊ะนี้ทั้งหมดแล้วครับ อยากตรวจสอบหรือซักถามเรื่องไหนต่อบอกได้เลย"
        elif default_speaker == "ต้น":
            default_text = "ตรงนี้ไม่มีใครได้ยินหรอกพี่... อยากรู้อะไรก็รีบถามแล้วกันนะ เดี๋ยวพี่วิชัยจะสงสัย"
        elif default_speaker == "ยายบุญมี":
            default_text = "เรื่องคืนน้ำท่วมกับศาลด้ายดำ ยายจำได้เท่าที่เห็นและจดไว้ในสมุดสวดมนต์นี่แหละลูก อยากถามอะไรก็รีบถาม"
        elif default_speaker == "แม่แก้ว (นางตานี)":
            default_text = "เส้นลมเย็นพัดผ่านใบกล้วย... พวกเจ้าจะทำอะไรกับความจริงและชายผู้นั้นก็จงเลือกเสีย"
        elif default_speaker == "ดล":
            default_text = "ผม นิด กับตาเพิ่มปลอดภัยแล้วครับพี่ ข้างบนวิชัยเอาตำรากับกำไลทองเหลืองวางไว้บนโต๊ะพิธี!"
        elif scene == "B3":
            default_text = "ภาพถ่ายเก่าปี 2534 และกองแฟ้มใต้ผนังยังรอให้คุณตรวจสอบละเอียด หรือเทียบกับแผนที่หมู่บ้าน"
        elif scene.startswith(("C", "D", "E", "F")):
            default_text = "แสงสลัวยังคลุมพื้นที่ตรงหน้า คุณสามารถตรวจสอบร่องรอย ซักถามรายละเอียด หรือกดจุดแผนที่เพื่อย้ายจุดต่อได้"
        else:
            default_text = "บรรยากาศรอบศาลาเงียบสงัด อากาศแห้งอบอ้าวและเงียบผิดปกติ — พวกคุณจะสอบถามอะไรเพิ่มหรือสำรวจจุดใดต่อ?"
        return DMDecision(
            mode="improvise",
            character=default_speaker,
            filler_audio_id=default_filler,
            improvised_text=default_text,
            reason="local_fallback_generic",
        )

    async def synthesize_live_tts(
        self,
        text: str,
        speaker: str,
        repo: ScenarioRepository,
    ) -> Optional[bytes]:
        """Synthesize live WAV bytes using Gemini Flash-Lite TTS with locked voice profile."""
        if not self.gemini_ready or not text.strip():
            return None

        profile = repo.get_voice_profile(speaker)
        voice_name = profile.get("voice", "Charon")
        style = profile.get("style", "")

        def _call_tts(client: Any) -> Optional[bytes]:
            from google.genai import types

            part_fields = getattr(types.Part, "model_fields", {})
            if "speech_metadata" in part_fields and style:
                contents: Any = [
                    {
                        "role": "user",
                        "parts": [
                            {"text": text.strip(), "speech_metadata": {"style": style}}
                        ],
                    }
                ]
            else:
                contents = text.strip()

            config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                    )
                ),
            )
            response = client.models.generate_content(
                model=self.live_tts_model,
                contents=contents,
                config=config,
            )
            candidates = getattr(response, "candidates", None) or []
            for candidate in candidates:
                content = getattr(candidate, "content", None)
                parts = getattr(content, "parts", None) or []
                for part in parts:
                    inline_data = getattr(part, "inline_data", None)
                    if inline_data and getattr(inline_data, "data", None):
                        data = inline_data.data
                        return data if isinstance(data, bytes) else base64.b64decode(data)
            return None

        try:
            return await asyncio.to_thread(self._run_with_gemini_failover, _call_tts)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini live TTS failed: %s", exc)
            return None

    async def decide_ghost_turn(
        self,
        room: RoomState,
        repo: ScenarioRepository,
    ) -> tuple[GhostTurnDecision, bool]:
        """Use Gemini Tactical Ghost AI (or smart deterministic fallback) to pick move & target."""
        combat = room.combat
        enc = repo.get_combat_encounter(combat.encounter_id if combat else "DROWNED_ECHO")
        if not self.gemini_ready:
            return self._local_fallback_ghost_turn(room, enc), True

        conscious = [p for p in room.players.values() if p.is_conscious]
        connected_conscious = [p for p in conscious if p.connected] or conscious
        if not combat or not connected_conscious:
            return self._local_fallback_ghost_turn(room, enc), True

        targets_json = [
            {
                "player_id": p.public_id,
                "name": p.name,
                "role": p.role_name,
                "hp": p.hp,
                "sanity": p.sanity,
                "statuses": p.statuses,
                "guarded": p.guarded,
            }
            for p in connected_conscious
        ]
        moves_json = [
            {
                "id": m["id"],
                "name_th": m["name_th"],
                "target_defense": m["target_defense"],
                "damage_resource": m["damage_resource"],
                "damage": m["damage"],
                "condition": m["condition"],
                "detail": m["detail"],
            }
            for m in enc.get("moves", [])
        ]

        ritual_info = (
            f"\n- เกราะกำไลพิธี 3 ขั้น: {'เปิดอยู่' if combat.ritual_shield_up else 'คลายหมดแล้ว'} ({combat.ritual_step}/{combat.ritual_max_steps})"
            if combat.ritual_max_steps > 0
            else ""
        )

        prompt = f"""คุณคือ AI ควบคุม '{combat.enemy_name}' ในฉากต่อสู้แบบผลัดเทิร์นของเกมสืบสวนสยองขวัญไทย

## สถานะการต่อสู้ปัจจุบัน
- รอบที่: {combat.round_number}
- HP {combat.enemy_name}: {combat.enemy_hp}/{combat.enemy_max_hp}
- ความคืบหน้ากล่อมวิญญาณ: {combat.soothe_progress}/{combat.soothe_goal}
- ความคืบหน้าถอยทัพ: {combat.retreat_progress}/{combat.retreat_goal}{ritual_info}
- สัญญาณอันตรายที่ส่งออกไว้ก่อนหน้า (Telegraph): {json.dumps(combat.telegraph, ensure_ascii=False)}

## เป้าหมายผู้สืบสวนที่ยังมีสติ (เลือก target_player_id จากรายการนี้เท่านั้น)
{json.dumps(targets_json, ensure_ascii=False)}

## ท่าของศัตรูที่ใช้ได้ (เลือก move_id จากรายการนี้เท่านั้น)
{json.dumps(moves_json, ensure_ascii=False)}

## แนวทางแทคติก
- เลือก move_id เฉพาะจากรายการท่าด้านบนให้สอดคล้องกับสถานะผู้เล่น (เช่น ใช้ท่าที่ติด ROOTED เมื่อทีมจะถอย ใช้ท่าตัดสติ/MDEF เมื่อเป้าหมายสติต่ำหรือกำลังทำพิธี/กล่อม)
- ตั้ง use_live_taunt=true เฉพาะบางรอบที่ดราม่า (เช่น เป้าหมายสติต่ำกว่า 6 หรือใกล้จบศึก) แล้วเขียน ghost_taunt สั้น 1 ประโยค
- เขียน narration_th เป็นคำบรรยายสั้น ๆ 1 ประโยคภาษาไทย
"""

        def _call_gemini_ghost(client: Any) -> GhostTurnDecision:
            from google.genai.types import GenerateContentConfig

            response = client.models.generate_content(
                model=self.dm_model,
                contents=prompt,
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GhostTurnDecision,
                    temperature=0.5,
                ),
            )
            parsed = getattr(response, "parsed", None)
            if isinstance(parsed, GhostTurnDecision):
                return parsed
            if isinstance(parsed, dict):
                return GhostTurnDecision.model_validate(parsed)
            return GhostTurnDecision.model_validate_json(response.text)

        try:
            decision = await asyncio.to_thread(self._run_with_gemini_failover, _call_gemini_ghost)
            return decision, False
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini ghost AI failed, using fallback: %s", exc)
            return self._local_fallback_ghost_turn(room, enc), True

    @staticmethod
    def _local_fallback_ghost_turn(
        room: RoomState,
        enc: Optional[dict[str, Any]] = None,
    ) -> GhostTurnDecision:
        combat = room.combat
        enemy_name = combat.enemy_name if combat else "ผีเงาจมน้ำ"
        moves = (enc or {}).get("moves", [])
        move_ids = [m["id"] for m in moves]
        root_move = next((m["id"] for m in moves if m.get("condition") == "ROOTED"), None) or (
            move_ids[0] if move_ids else "WET_CLAW"
        )
        shaken_move = next((m["id"] for m in moves if m.get("condition") == "SHAKEN"), None) or (
            move_ids[-1] if move_ids else "DROWNED_WHISPER"
        )
        default_move = move_ids[0] if move_ids else "WET_CLAW"

        conscious = [p for p in room.players.values() if p.is_conscious]
        pool = [p for p in conscious if p.connected] or conscious
        if not pool:
            return GhostTurnDecision(
                move_id=default_move,
                target_player_id="",
                use_live_taunt=False,
                narration_th=f"{enemy_name} ฟาดผ่านความมืดอันว่างเปล่า",
            )

        if combat and combat.retreat_progress >= 1:
            target = max(pool, key=lambda p: p.hp)
            return GhostTurnDecision(
                move_id=root_move,
                target_player_id=target.public_id,
                use_live_taunt=True,
                ghost_taunt=f"{target.name}... ยังออกไปไม่ได้...",
                narration_th=f"แรงอาคมจาก {enemy_name} พุ่งคว้าข้อเท้าของ {target.name} ไว้แน่น!",
            )

        if combat and (combat.soothe_progress >= 1 or combat.ritual_step >= 1):
            target = min(pool, key=lambda p: p.sanity)
            return GhostTurnDecision(
                move_id=shaken_move,
                target_player_id=target.public_id,
                use_live_taunt=True,
                ghost_taunt="ด้ายดำยังรั้งอยู่... อย่าเพิ่งหยุด...",
                narration_th=f"คลื่นเสียงสะท้อนจาก {enemy_name} กดทับสติของ {target.name} อย่างหนัก!",
            )

        target = min(pool, key=lambda p: p.hp)
        return GhostTurnDecision(
            move_id=default_move,
            target_player_id=target.public_id,
            use_live_taunt=False,
            narration_th=f"{enemy_name} พุ่งเข้าจู่โจมใส่ {target.name} ท่ามกลางความมืด!",
        )

    async def plan_combat_player_action(
        self,
        room: RoomState,
        player: Any,
        declaration_text: str,
        repo: ScenarioRepository,
    ) -> tuple[CombatPlayerActionPlan, bool]:
        """Interpret a freeform TRPG combat declaration into mechanics, tactical bonus, and narration."""
        if not self.gemini_ready:
            return self._local_fallback_combat_action(room, player, declaration_text), True

        combat = room.combat
        enemy_label = combat.enemy_name if combat else "ผีเงาจมน้ำ"
        has_ritual = bool(combat and combat.ritual_max_steps > 0)
        ritual_rule = (
            f"- ด่านนี้มีวงป้องกันกำไล 3 ขั้น (คลายแล้ว {combat.ritual_step}/{combat.ritual_max_steps} · "
            f"{'เกราะยังอยู่ ต้องใช้ action_id=\"ritual\" คลายเกราะก่อน' if combat.ritual_shield_up else 'เกราะสลายแล้ว ใช้ action_id=\"ritual\" ปลดกำไลขั้นสุดท้ายเพื่อปิดฉาก!'} )\n"
            if has_ritual
            else ""
        )
        ritual_action_desc = (
            ", 'ritual' (ทำพิธีคลายเกราะ 3 ขั้น / ปลดกำไลทองเหลืองขั้นสุดท้าย)"
            if has_ritual
            else ""
        )
        party_list = [
            {
                "player_id": p.public_id,
                "name": p.name,
                "role": p.role_name,
                "hp": f"{p.hp}/{p.max_hp}",
                "sanity": f"{p.sanity}/{p.max_sanity}",
                "statuses": p.statuses,
            }
            for p in room.players.values()
        ]
        prompt = f"""คุณคือ AI Game Master (DM) ของเกม TRPG สืบสวนสยองขวัญไทย 'CASE 001: เสียงร้องจากสวนกล้วย' ระหว่างการเผชิญหน้ากับ {enemy_label}

## ผู้เล่นที่ประกาศการกระทำ
- ชื่อ: {player.name} ({player.role_name})
- ค่าสถานะ: {json.dumps(player.stats, ensure_ascii=False)}
- โฟกัส: {player.focus}/{player.max_focus} | สถานะติดตัว: {player.statuses}
- ท่าประจำอาชีพ: {json.dumps(player.skill, ensure_ascii=False)}

## สถานะการต่อสู้และสิ่งแวดล้อมในฉาก ({combat.round_number if combat else 1})
- HP {enemy_label}: {combat.enemy_hp if combat else 0}/{combat.enemy_max_hp if combat else 8} | กล่อม: {combat.soothe_progress if combat else 0}/{combat.soothe_goal if combat else 3} | ถอย: {combat.retreat_progress if combat else 0}/{combat.retreat_goal if combat else 2}
{ritual_rule}- สัญญาณอันตรายรอบนี้ (Telegraph): {json.dumps(combat.telegraph if combat else None, ensure_ascii=False)}
- องค์ประกอบฉาก: {json.dumps(combat.environment_features if combat else [], ensure_ascii=False)}
- เพื่อนร่วมทีม: {json.dumps(party_list, ensure_ascii=False)}

## การกระทำที่ผู้เล่นประกาศ
"{declaration_text}"

## กติกาการตัดสิน
- เลือก action_id ที่ตรงเจตนาที่สุด: 'strike' (โจมตี/ขัดขวางกายภาพ), 'soothe' (กล่อม/พูดเรียกสติ/สวด), 'assist' (ช่วย/บัง/ดึงเพื่อนหลบ), 'steady' (ตั้งสติ/ถอยมาคุมตัวเอง), 'role_skill' (ใช้ท่าประจำอาชีพ — ใช้ได้เฉพาะเมื่อ focus >= 1), 'retreat' (คุ้มกันเปิดทางหนี){ritual_action_desc}
- เลือก stat_choice ที่สมเหตุสมผลกับวิธีที่ผู้เล่นบรรยาย (เช่น สาดไฟฉาย/สังเกตจุดอ่อนใช้ PER/INT, พูดคุยปลอบโยนใช้ SOC, ใช้อาคม/สัมผัสวิญญาณ/คลายพิธีใช้ SPI/INT, ใช้แรงกายใช้ BODY)
- ให้ tactical_bonus (+1 หรือ +2) เฉพาะเมื่อผู้เล่นใช้สภาพแวดล้อม (ไฟฉาย, แอ่งโคลน, ดงกล้วย, ตำราพิธี E4) หรือแก้ทาง Telegraph รอบนี้ได้ชาญฉลาด พร้อมอธิบายสั้น ๆ ใน tactical_reason
- เขียน narration_full, narration_partial, narration_failure เป็นภาษาไทยบรรยายผลลัพธ์อย่างสมจริง"""

        def _call_plan(client: Any) -> CombatPlayerActionPlan:
            from google.genai.types import GenerateContentConfig

            response = client.models.generate_content(
                model=self.dm_model,
                contents=prompt,
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=CombatPlayerActionPlan,
                    temperature=0.4,
                ),
            )
            parsed = getattr(response, "parsed", None)
            if isinstance(parsed, CombatPlayerActionPlan):
                return parsed
            if isinstance(parsed, dict):
                return CombatPlayerActionPlan.model_validate(parsed)
            return CombatPlayerActionPlan.model_validate_json(response.text)

        try:
            plan = await asyncio.to_thread(self._run_with_gemini_failover, _call_plan)
            if plan.action_id == "role_skill" and player.focus < 1:
                plan.action_id = "steady"
            return plan, False
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini combat action planner failed, using fallback: %s", exc)
            return self._local_fallback_combat_action(room, player, declaration_text), True

    @staticmethod
    def _local_fallback_combat_action(
        room: RoomState,
        player: Any,
        declaration_text: str,
    ) -> CombatPlayerActionPlan:
        text = declaration_text.lower()
        combat = room.combat
        tele_target_id = (combat.telegraph or {}).get("target_id") if combat else None

        bonus = 0
        reason: Optional[str] = None
        if any(k in text for k in ("ไฟฉาย", "แอ่งโคลน", "โคลน", "กิ่งกล้วย", "ต้นกล้วย", "ใบกล้วย")):
            bonus = 2
            reason = "ใช้สภาพแวดล้อมในฉากได้อย่างชาญฉลาด"
        elif any(k in text for k in ("น้ำท่วม", "2534", "แม่แก้ว", "แก้ว", "ดึง", "คว้า", "ขวาง")):
            bonus = 1
            reason = "จับจังหวะแก้ทางสถานการณ์ได้ตรงจุด"

        shaken = "SHAKEN" in (player.statuses or [])
        rooted = "ROOTED" in (player.statuses or [])

        if (
            combat
            and combat.ritual_max_steps > 0
            and any(k in text for k in ("กำไล", "คลาย", "ปม", "ด้าย", "เกราะ", "พิธี", "ปลด", "แยกสาย", "คุมแรง"))
        ):
            stat_pick = "INT" if player.stats.get("INT", 0) >= player.stats.get("SPI", 0) else "SPI"
            return CombatPlayerActionPlan(
                action_id="ritual",
                stat_choice=stat_pick,
                tactical_bonus=bonus,
                tactical_reason=reason,
                narration_full=f"{player.name} ลงมือตามขั้นตอน ({declaration_text}) จนวงด้ายดำบนกำไลทองเหลืองคลายตัวลงอย่างแม่นยำ!",
                narration_partial=f"{player.name} แตะแยกปมด้ายเฉียดจังหวะ เปิดช่องให้คลายพิธีต่อได้ง่ายขึ้น (+2 ทอย)",
                narration_failure=f"{player.name} พยายาม ({declaration_text}) แต่แรงสะท้อนจากเกราะกำไลตีกลับมา!",
            )

        if any(k in text for k in ("ช่วย", "บัง", "ดึงเพื่อน", "คว้าเพื่อน", "คว้าแขน", "คุ้มกันเพื่อน", "ขวาง")):
            others = [p for p in room.players.values() if p.player_token != player.player_token and p.is_conscious]
            ally_id = tele_target_id or (others[0].public_id if others else None)
            return CombatPlayerActionPlan(
                action_id="assist",
                tactical_bonus=bonus,
                tactical_reason=reason or "เข้าช่วยคุ้มกันเพื่อนร่วมทีม",
                target_ally_id=ally_id,
                narration_full=f"{player.name} ลงมือตามที่ประกาศ ({declaration_text}) เข้าช่วยคุ้มกันเพื่อนและส่งต่อจังหวะได้เปรียบ +2 ทันที!",
                narration_partial=f"{player.name} รีบพุ่งเข้าช่วยเพื่อนตามที่ประกาศจนพ้นระยะอันตรายได้ทัน!",
                narration_failure=f"{player.name} พยายามเข้าขวางเต็มที่แม้จังหวะในความมืดจะฉุกละหุกก็ตาม",
            )

        if not shaken and player.focus >= 1 and any(
            k in text for k in ("ท่าประจำอาชีพ", "สกิล", "ยันต์", "สแกน", "ปฐมพยาบาล", "แนวป้องกัน", "วิเคราะห์จุดอ่อน")
        ):
            skill_name = (player.skill or {}).get("name", "ท่าประจำอาชีพ")
            return CombatPlayerActionPlan(
                action_id="role_skill",
                tactical_bonus=bonus,
                tactical_reason=reason,
                narration_full=f"{player.name} ทุ่มสมาธิใช้ [{skill_name}] ควบคู่กับการกระทำ ({declaration_text}) ได้ผลเต็มกำลัง!",
                narration_partial=f"{player.name} ปล่อยท่า [{skill_name}] ออกมาต้านภัยรอบตัวได้สำเร็จ",
                narration_failure=f"{player.name} พยายามตั้งท่า [{skill_name}] แต่คลื่นอาฆาตกดดันไว้",
            )

        if any(k in text for k in ("ดึงสติ", "ตั้งสติ", "หายใจ", "สะบัด", "สงบใจ")):
            return CombatPlayerActionPlan(
                action_id="steady",
                narration_full=f"{player.name} ตั้งหลักรวบรวมสติ ({declaration_text}) จนหลุดจากอาการหลอน (+2 สติ, +1 โฟกัส)!",
                narration_partial=f"{player.name} พยายามตั้งสติและคุมจังหวะลมหายใจกลับมาได้",
                narration_failure=f"{player.name} ยังรู้สึกหนาวเยือกแต่ก็ดึงสติกลับมาได้ระดับหนึ่ง",
            )

        if not rooted and any(k in text for k in ("ถอย", "หนี", "เปิดทาง", "วิ่งออก")):
            stat_pick = "PER" if "ไฟฉาย" in text or "มอง" in text else "BODY"
            return CombatPlayerActionPlan(
                action_id="retreat",
                stat_choice=stat_pick,
                tactical_bonus=bonus,
                tactical_reason=reason,
                narration_full=f"{player.name} ({declaration_text}) เปิดทางหนีฝ่าแนวต้นกล้วยและตั้งรับได้อย่างเฉียบขาด!",
                narration_partial=f"{player.name} ({declaration_text}) พาทีมขยับเข้าใกล้ทางออกได้อีกก้าว",
                narration_failure=f"{player.name} แหวกพุ่มกล้วยเปิดทางออกมาได้แม้จะทุลักทุเล",
            )

        if not shaken and any(k in text for k in ("กล่อม", "ปลอบ", "สวด", "ถาม", "เรียกสติ", "แม่แก้ว", "น้ำท่วม", "2534", "คุย")):
            stat_pick = "SPI" if any(k in text for k in ("สวด", "วิญญาณ", "จิต")) else "SOC"
            return CombatPlayerActionPlan(
                action_id="soothe",
                stat_choice=stat_pick,
                tactical_bonus=bonus,
                tactical_reason=reason,
                narration_full=f"{player.name} ({declaration_text}) สื่อสารทะลุเสียงสำลักน้ำจนเงาร่างของวิญญาณสงบนิ่งลงอย่างเห็นได้ชัด!",
                narration_partial=f"{player.name} ({declaration_text}) ทำให้ผีเงาจมน้ำชะงักไปเสี้ยววินาที เปิดจุดอ่อน (+2 ทอย) ให้เพื่อนร่วมทีม!",
                narration_failure=f"{player.name} พยายาม ({declaration_text}) แต่เสียงน้ำเชี่ยวหลอนกลับดังกลบจนมันไม่ยอมฟัง",
            )

        stat_pick = (
            "PER"
            if any(k in text for k in ("ไฟฉาย", "ส่อง", "เล็ง"))
            else ("SPI" if player.stats.get("SPI", 0) > player.stats.get("BODY", 0) else "BODY")
        )
        return CombatPlayerActionPlan(
            action_id="strike",
            stat_choice=stat_pick,
            tactical_bonus=bonus,
            tactical_reason=reason,
            narration_full=f"{player.name} ({declaration_text}) จู่โจมตรงจุดจนร่างโคลนของผีเงาจมน้ำสะท้านถอย!",
            narration_partial=f"{player.name} ({declaration_text}) ปะทะเฉี่ยวโดนร่างเงาเปียกโชกไปได้หวุดหวิด",
            narration_failure=f"{player.name} ({declaration_text}) พลาดเป้า ร่างเงาโคลนเลือนหายไปในเงาต้นกล้วยได้ทัน",
        )
