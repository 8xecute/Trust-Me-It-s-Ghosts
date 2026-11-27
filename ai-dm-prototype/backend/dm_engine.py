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
                "bypass_ready": bool((c.get("_eligibility") or {}).get("bypassed")),
                "bypass_reason_th": (c.get("_eligibility") or {}).get("bypass_reason_th", ""),
                "alt_stats": [
                    {"stat": k.upper(), "dc_delta": int(v.get("dc_delta", 0)), "label": v.get("label", k)}
                    for k, v in (c.get("alt_stats") or {}).items()
                    if isinstance(v, dict)
                ],
            }
            for c in available_checks
        ]
        blocked_checks = room_manager.get_blocked_checks(room)

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
                "skill_description": (p.skill or {}).get("description", ""),
            }
            for p in room.players.values()
        ]

        guideline = room_manager.compute_guideline_snapshot(room)
        inventory_details = [
            {
                "id": iid,
                "label": repo.items_catalog[iid]["label"],
                "detail": repo.items_catalog[iid]["detail"],
            }
            for iid in room.inventory
            if iid in repo.items_catalog
        ]
        inspectables_menu = [
            {
                "id": obj["id"],
                "label": obj["label"],
                "inspected": obj["id"] in room.inspected_objects,
            }
            for obj in scene_cfg.get("inspectables", [])
            if not (obj.get("visible_if_clues") and not all(c in room.clues_found for c in obj["visible_if_clues"]))
        ]

        game_state_snapshot = {
            "act": act,
            "current_scene": room.current_scene,
            "clues_found": room.clues_found,
            "inventory": room.inventory,
            "npc_trust": room.npc_trust,
            "played_audio_ids": room.played_audio_ids,
            "pending_check": room.pending_check["id"] if room.pending_check else None,
            "scene_goal": guideline.get("scene_goal", ""),
            "ready_to_advance": guideline.get("ready_to_advance", False),
            "pending_leads": [
                {"label": l["label"], "kind": l["kind"]}
                for l in guideline.get("leads", [])
                if not l.get("done")
            ],
            "ready_combine_recipes": [
                {"id": c["id"], "title": c["title"]}
                for c in guideline.get("combine_hints", [])
                if c.get("ready") and not c.get("completed")
            ],
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
                "- เลือก state_updates.current_scene เพื่อเดินจาก D1 -> ศาล D2 -> พบแม่แก้ว D3 -> D4 (เจรจา/ถอย/ปะทะ) -> แนวรอยล้อหลังศาล D5\n"
                "- ใน D4 ให้ผู้เล่นเลือกเจรจา (d4_reconcile_to_d5) ถอย หรือปะทะได้เอง ตั้งค่า state_updates.start_combat=true และ action_kind='combat' เฉพาะเมื่อผู้เล่นเปิดฉากสู้หรือฝืนปะทะจริง\n"
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
                "- ใน F1 ผู้เล่นสามารถสังเกตจุดเชื่อมด้ายบนโต๊ะหรือพูดปลอบแม่แก้วก่อนได้ (mode='improvise', start_combat=false) — ตั้งค่า action_kind='combat' และ state_updates.start_combat=true เพื่อเริ่มศึก KAEW_FINAL_BOSS เฉพาะเมื่อผู้เล่นลงมือคลายเกราะ/จับกำไล หรือเปิดฉากปะทะจริงเท่านั้น (ห้ามข้ามไป F5 จนกว่าจะมี clue 'ritual_stopped')\n"
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
- อิสระแบบ TRPG: ผู้เล่นสามารถสำรวจจุดรอบตัว (inspectables), หยิบไอเท็มใน inventory มาใช้หรือผสานเบาะแส (combine), บลัฟ/เจรจา/กดดัน NPC, ใช้ทักษะอาชีพ (role skill) หรือถามคำถามนอกบทได้เต็มที่
- เลือก mode='script' และ selected_audio_id จาก dialogue_menu เฉพาะเมื่อตรงกับเจตนาของผู้เล่นจริง ๆ และ already_played=false (ห้ามฝืนยัดบท script ที่ตอบไม่ตรงวิธีเล่นหรือบลัฟของผู้เล่น)
- หากตรงกับจุดสำรวจใน inspectables_menu หรือชุดเชื่อมโยง ready_combine_recipes ให้ตั้ง inspect_target_id เป็น id นั้น แล้วใช้ mode='improvise' บรรยายผลลัพธ์อย่างเป็นธรรมชาติ
- เมื่อผู้เล่นถามคำถามทั่วไป บลัฟ/ต่อรอง สำรวจสิ่งของ/สภาพแวดล้อม (เช่น รถตู้ เฟอร์นิเจอร์ สภาพอากาศ อาชีพเพื่อน ใช้ทักษะสืบสวน) หรือถามต่อยอดจากบทที่ already_played=true -> ใช้ mode='improvise' (ตั้ง selected_audio_id=null) แล้วให้ character เป็น {improv_speaker_hint} ตอบตรงคำถาม 1-3 ประโยคภาษาไทยที่เป็นธรรมชาติ พร้อมเลือก filler_audio_id ที่ตรงกับผู้พูด (หากผู้เล่นดูลังเล ให้สะกิดไปที่ pending_leads แบบไม่สปอยล์ได้)
- กฎแยกผู้พูด DM กับ NPC (สำคัญ): หากข้อความเป็นคำบรรยายบุคคลที่ 3 (บรรยายท่าทาง แววตา บรรยากาศ หรือขึ้นต้นด้วยชื่อตัวละครเช่น 'ผู้ใหญ่ประเสริฐ...', 'วิชัย...', 'ต้น...', 'คุณเห็น...', 'คุณสังเกต...') ต้องตั้ง character='DM' และ filler_audio_id='filler_dm_think' เท่านั้น — หากเลือก character เป็น NPC ('ประเสริฐ', 'วิชัย', 'ต้น') ข้อความ improvised_text ต้องเป็นคำพูดโต้ตอบตรงในมุมมองบุคคลที่ 1 (ผม/ฉัน/พี่) เท่านั้น ห้ามบรรยายท่าทางตัวเองแบบบุคคลที่ 3
- ถ้าผู้เล่นขอทำแอ็กชันที่ตรงกับ trigger_hint ในการ์ดทอยเต๋าที่ยังใช้ได้ -> ให้ตั้งค่า requested_check_id เป็น id ของ check นั้น และใช้ mode='improvise' (selected_audio_id=null) (หาก bypass_ready=true ระบบจะผ่านให้ทันทีโดยไม่ต้องทอย จึงบรรยายผลเบื้องต้นแบบไม่บังคับกดทอยเต๋า)
- ถ้าผู้เล่นขอทำแอ็กชันที่ตรงกับรายการใน blocked_checks (ยังขาดหลักฐาน/เงื่อนไขหรือยังลองซ้ำไม่ได้) -> ห้ามตั้งค่า requested_check_id เด็ดขาด ให้ใช้ mode='improvise' (selected_audio_id=null) บอกใบ้ตามฟิลด์ hint อย่างเป็นธรรมชาติ
{ending_note}

## สถานะเกมปัจจุบัน (Game State & ไกท์ไลน์ฉาก)
{json.dumps(game_state_snapshot, ensure_ascii=False)}

## สิ่งของที่ทีมถืออยู่และจุดสำรวจได้ในฉาก (Inspectables)
- ไอเท็มของทีม: {json.dumps(inventory_details, ensure_ascii=False)}
- จุดสำรวจในฉาก {room.current_scene}: {json.dumps(inspectables_menu, ensure_ascii=False)}

## บทพูดตามสคริปต์ที่ใช้ได้ในฉาก {room.current_scene} (เลือกได้เฉพาะ id ในรายการนี้)
{json.dumps(dialogue_menu, ensure_ascii=False)}

## เสียงคั่นเวลา (ใช้เฉพาะตอน mode='improvise')
{json.dumps(filler_menu, ensure_ascii=False)}

## การ์ดทอยเต๋า (Dice Checks) ที่ยังใช้ได้ในฉากนี้
{json.dumps(check_menu, ensure_ascii=False)}

## การ์ดทอยเต๋าที่ยังติดเงื่อนไข (blocked_checks)
{json.dumps(blocked_checks, ensure_ascii=False)}

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
        avail_checks = room_manager.get_available_checks(room)
        available_check_ids = {c["id"] for c in avail_checks}
        elig_by_id = {c["id"]: c.get("_eligibility") or {} for c in avail_checks}
        blocked_by_id = {b["id"]: b for b in room_manager.get_blocked_checks(room)}
        scene = room.current_scene

        def check_or_hint(
            check_id: str,
            ready_text: str,
            reason: str,
            filler_id: Optional[str] = "filler_dm_think",
        ) -> Optional[DMDecision]:
            if check_id in available_check_ids:
                elig = elig_by_id.get(check_id, {})
                if elig.get("bypassed"):
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id=filler_id,
                        improvised_text=elig.get("bypass_reason_th") or ready_text.split("—")[0].strip(),
                        requested_check_id=check_id,
                        reason=f"{reason}_bypass",
                    )
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id=filler_id,
                    improvised_text=ready_text,
                    requested_check_id=check_id,
                    reason=reason,
                )
            blk = blocked_by_id.get(check_id)
            if blk and blk.get("blocked_reason") in {"missing_requires", "needs_new_evidence"}:
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id=filler_id,
                    improvised_text=blk.get("hint") or "ยังขาดหลักฐานหรือเงื่อนไขจำเป็นก่อนตรวจสอบจุดนี้",
                    reason=f"{reason}_{blk['blocked_reason']}",
                )
            return None

        def pick_script(
            did: str,
            speaker: str = "ประเสริฐ",
            check_id: Optional[str] = None,
            ending: Optional[str] = None,
            current_scene: Optional[str] = None,
            action_kind: Optional[str] = None,
            inspect_target_id: Optional[str] = None,
            reason: str = "local_fallback_keyword",
        ) -> DMDecision:
            return DMDecision(
                mode="script",
                character=speaker,
                selected_audio_id=did,
                action_kind=action_kind,
                inspect_target_id=inspect_target_id,
                requested_check_id=check_id,
                state_updates=StateUpdates(current_scene=current_scene, ending_triggered=ending),  # type: ignore[arg-type]
                reason=reason,
            )

        if scene == "A1":
            if any(k in text for k in ("ตรวจ", "วิเคราะห์", "ละเอียด", "เช็ก", "int")) and any(k in text for k in ("เอกสาร", "ใบรับแจ้ง")):
                chk_dec = check_or_hint(
                    "A1_INT_FILES",
                    "คุณเปิดดูรายละเอียดวันเวลาในสำเนาใบรับแจ้งคนหาย — กรุณากดทอยเต๋า INT เพื่อตรวจสอบจุดผิดปกติ",
                    "local_fallback_check_int",
                )
                if chk_dec:
                    return chk_dec
            if any(k in text for k in ("สังเกต", "พิรุธ", "ท่าที", "สีหน้า", "per")):
                chk_dec = check_or_hint(
                    "A1_PER_OBSERVE",
                    "คุณเพ่งสังเกตท่าทีของประเสริฐและบรรยากาศรอบศาลาอย่างตั้งใจ — กรุณากดทอยเต๋า PER เพื่อประเมินสิ่งที่สังเกตเห็น",
                    "local_fallback_check_per",
                )
                if chk_dec:
                    return chk_dec
            if any(k in text for k in ("หญิงชุดเขียว", "ชุดเขียว", "แก้ว")) and "a1_qa_green_lady" in eligible_ids:
                return pick_script("a1_qa_green_lady", "ประเสริฐ")
            if any(k in text for k in ("คลี่แฟ้ม", "เปิดแฟ้ม", "ข้างรถ", "รถตู้", "ไปบ้าน", "ไปต่อ", "แฟ้มข้อมูล", "แฟ้มในมือ")) and "a1_open_folder_to_a2" in eligible_ids:
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
            if any(k in text for k in ("สัมผัส", "พลัง", "วิญญาณ", "คลื่น", "spi")):
                chk_dec = check_or_hint(
                    "A2_RADIO_ECHO",
                    "คุณยื่นมือเข้าใกล้เครื่องวิทยุสื่อสารและตั้งจิตสัมผัสคลื่นที่หลงเหลืออยู่ — กรุณากดทอยเต๋า SPI",
                    "local_fallback_check_spi",
                    filler_id="filler_radio_static",
                )
                if chk_dec:
                    return chk_dec
            if any(k in text for k in ("บันทึก", "ย้อนหลัง", "ฟังซ้ำ", "เช็กวิทยุ", "ตรวจเครื่อง")) and "a2_qa_replay_static" in eligible_ids:
                return pick_script("a2_qa_replay_static", "DM")
            if any(k in text for k in ("เสียงใคร", "พูดว่าอะไร", "พูดอะไร")) and "a2_qa_whose_voice" in eligible_ids:
                return pick_script("a2_qa_whose_voice", "DM")
            if any(k in text for k in ("มาจากไหน", "ข้างนอก")) and "a2_qa_radio_origin" in eligible_ids:
                return pick_script("a2_qa_radio_origin", "DM")
            if any(k in text for k in ("บ้านผู้ใหญ่", "ดูแฟ้ม", "ไปต่อ", "เดินทาง", "ที่สว่าง", "ไปคุยต่อ", "ออกจากตรงนี้")) and "a2_move_to_a3" in eligible_ids:
                return pick_script("a2_move_to_a3", "ประเสริฐ")

        elif scene == "A3":
            if any(k in text for k in ("เข้าบ้าน", "ดูแฟ้ม", "ตกลง", "เข้าไป")) and "a3_ending_true" in eligible_ids:
                return pick_script("a3_ending_true", "DM", ending="act_a_complete")
            if any(k in text for k in ("ทำไมไม่", "พาเข้าสวน")) and "a3_qa_why_not_grove" in eligible_ids:
                return pick_script("a3_qa_why_not_grove", "ประเสริฐ")
            if any(k in text for k in ("เข้าสวน", "แยกเดิน", "ไม่รอ", "บุกสวน")) and "a3_ending_bad" in eligible_ids:
                return pick_script("a3_ending_bad", "DM", ending="lost_in_grove")
            if any(k in text for k in ("ใครรอ", "มีใคร", "ใครอยู่", "พยาน", "วิชัย", "ต้น")) and "a3_qa_who_waiting" in eligible_ids:
                return pick_script("a3_qa_who_waiting", "ประเสริฐ")

        elif scene in {"B1", "B2", "B3"}:
            if any(k in text for k in ("บ้านดล", "ไปบ้านดล", "ออกเดินทาง", "ข้อมูลพอแล้ว")) and "b_ending_to_act_c" in eligible_ids:
                return pick_script("b_ending_to_act_c", "DM", ending="act_b_complete")
            if any(k in text for k in ("วิชัยไปด้วย", "ไปด้วยกันไหม", "ไปบ้านดลด้วย", "อยู่เฝ้า", "รออยู่ที่นี่")) and "b3_wichai_stay_behind" in eligible_ids:
                return pick_script("b3_wichai_stay_behind", "วิชัย")

            if scene == "B1" and any(k in text for k in ("น้ำท่วม", "2534", "แม่แก้ว", "แก้ว")) and "b1_qa_wichai_flood_kaew" in eligible_ids and not any(
                k in text for k in ("เดิน", "ผนัง", "ภาพถ่าย", "กรอบรูป", "ตู้แฟ้ม")
            ):
                return pick_script("b1_qa_wichai_flood_kaew", "วิชัย")

            if scene != "B2" and any(k in text for k in ("ชานบ้าน", "ออกไปคุยกับต้น", "แยกคุย", "ตามต้นออกไป", "หน้าประตู")):
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินเลี่ยงออกจากห้องรับแขกไปที่ชานบ้านหน้าประตูเพื่อคุยกับต้นให้พ้นสายตาวิชัย",
                    state_updates=StateUpdates(current_scene="B2"),
                    reason="local_fallback_move_b2",
                )
            if scene != "B3" and (
                any(k in text for k in ("ผนัง", "ภาพเก่า", "ภาพถ่าย", "กรอบรูป", "ตู้แฟ้ม"))
                or (scene != "B1" and "2534" in text)
            ) and not (
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
            if scene == "B2" and any(k in text for k in ("กลับเข้าไป", "กลับเข้าบ้าน", "ห้องรับแขก", "โต๊ะแผนที่", "ไปหาวิชัย", "ข้างในบ้านผู้ใหญ่")):
                if "b2_return_to_b1" in eligible_ids:
                    return pick_script("b2_return_to_b1", "DM", current_scene="B1", reason="local_fallback_move_b1")
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินกลับเข้ามาที่โต๊ะแผนที่ในห้องรับแขกบ้านผู้ใหญ่",
                    state_updates=StateUpdates(current_scene="B1"),
                    reason="local_fallback_move_b1",
                )
            if scene == "B3" and any(k in text for k in ("กลับไป", "กลับเข้าบ้าน", "ห้องรับแขก", "โต๊ะแผนที่", "ไปหาวิชัย")):
                if "b3_return_to_b1" in eligible_ids:
                    return pick_script("b3_return_to_b1", "DM", current_scene="B1", reason="local_fallback_move_b1")
                return DMDecision(
                    mode="improvise",
                    character="DM",
                    filler_audio_id="filler_dm_think",
                    improvised_text="คุณเดินกลับเข้ามาที่โต๊ะแผนที่ในห้องรับแขกบ้านผู้ใหญ่",
                    state_updates=StateUpdates(current_scene="B1"),
                    reason="local_fallback_move_b1",
                )

            if scene == "B1":
                if any(k in text for k in ("สังเกต", "พิรุธ", "ท่าที", "แววตา", "สีหน้า", "per")):
                    chk_dec = check_or_hint(
                        "B2_WICHAI_TELL",
                        "คุณเพ่งสังเกตสีหน้า จังหวะคำพูด และแววตาของวิชัยอย่างละเอียด — กรุณากดทอยเต๋า PER",
                        "local_fallback_check_b2_per",
                    )
                    if chk_dec:
                        return chk_dec
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
                if any(k in text for k in ("ปลอบ", "มั่นใจ", "เล่ามาให้หมด", "ปลอดภัย", "เกลี้ยกล่อม", "ความจริง", "ส่วนตัว", "ไม่อยากพูด", "ข้างใน", "soc")):
                    chk_dec = check_or_hint(
                        "B3_TON_DISCLOSURE",
                        "คุณหันไปยืนยันกับต้นว่าตรงนี้พ้นหูวิชัยแล้ว — กรุณากดทอยเต๋า SOC เพื่อกล่อมให้ต้นยอมเล่าสิ่งที่เห็น",
                        "local_fallback_check_b3_soc",
                        filler_id="filler_ton_nervous",
                    )
                    if chk_dec:
                        return chk_dec
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
                if any(k in text for k in ("เห็นอะไร", "พอเห็น", "ได้ยินอะไร", "แปลก", "คืนนั้น", "ทางเข้าสวน", "เล่า")) and "b2_ton_baseline" in eligible_ids:
                    return pick_script("b2_ton_baseline", "ต้น")

            elif scene == "B3":
                if any(k in text for k in ("เทียบ", "แผนที่", "เชื่อมโยง", "ทางน้ำ", "แนวคันดิน", "int")):
                    chk_dec = check_or_hint(
                        "B4_FLOOD_PHOTO",
                        "คุณยกภาพถ่ายประตูน้ำปี 2534 ขึ้นมาเทียบแนวคันดินกับแผนที่หมู่บ้าน — กรุณากดทอยเต๋า INT",
                        "local_fallback_check_b4_int",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ยกกรอบ", "แตะกรอบ", "ดูใกล้", "หยดน้ำ", "กระจก", "ยกดู", "กรอบรูป", "ภาพถ่ายเก่า")) and "b3_inspect_frame_droplet" in eligible_ids:
                    return pick_script(
                        "b3_inspect_frame_droplet",
                        "DM",
                        action_kind="inspect",
                        inspect_target_id="b3_old_frame",
                        reason="local_fallback_inspectable",
                    )
                if any(k in text for k in ("รื้อ", "ตู้แฟ้ม", "เอกสารเก่า", "บันทึกเวร")) and "b3_open_old_folder_free" in eligible_ids:
                    return pick_script("b3_open_old_folder_free", "DM")
                if any(k in text for k in ("ใครในรูป", "ประเสริฐ", "อพยพ", "เก็บแฟ้ม")) and "b3_qa_photo_prasert" in eligible_ids:
                    return pick_script("b3_qa_photo_prasert", "DM")

        elif scene.startswith("C"):
            if scene == "C5" and any(k in text for k in ("เข้าสวน", "สวนกล้วย", "ขอตัวเดิน", "ไปศาล", "ไปต่อ", "จบบท", "act d")) and "c_ending_to_act_d" in eligible_ids:
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
            if scene != "C5" and (
                any(k in text for k in ("ไปบ้านยาย", "ไปหายาย", "เรือนยาย", "ทางแยก", "ออกไปหายาย", "c5"))
                or (scene == "C1" and any(k in text for k in ("ยาย", "บุญมี")))
            ):
                if scene == "C1" and "c1_move_to_c5" in eligible_ids:
                    return pick_script("c1_move_to_c5", "DM", current_scene="C5", reason="local_fallback_move_c5")
                if scene == "C2" and "c2_move_to_c5" in eligible_ids:
                    return pick_script("c2_move_to_c5", "DM", current_scene="C5", reason="local_fallback_move_c5")
                if scene == "C3" and "c3_leave_to_c5" in eligible_ids:
                    return pick_script("c3_leave_to_c5", "DM", current_scene="C5", reason="local_fallback_move_c5")
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
                if any(k in text for k in ("ห้องโถง", "มุมอับ", "มุมบ้าน", "มุมอื่น", "เสียงเคาะ", "c3")) and not any(
                    k in text for k in ("โต๊ะทำงาน", "กองแฟ้ม", "สมุด")
                ):
                    if "c1_move_to_c3" in eligible_ids:
                        return pick_script("c1_move_to_c3", "DM", current_scene="C3", reason="local_fallback_c1_to_c3")
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณเดินสำรวจรอบห้องโถงและตามมุมอับในบ้านดล ก่อนจะสังเกตเห็นคราบชื้นเย็นเยียบซึมตามรอยต่อไม้พร้อมเสียงเคาะเบา ๆ สามครั้งจากใต้พื้น",
                        state_updates=StateUpdates(current_scene="C3"),
                        reason="local_fallback_c1_to_c3",
                    )
            elif scene == "C2":
                if any(k in text for k in ("เทียบ", "int", "ราคา", "ที่ดิน", "ข่าวผี")):
                    chk_dec = check_or_hint(
                        "C2_LAND_PATTERN",
                        "คุณเปิดสมุดปกดำเทียบวันที่ข่าวผีกับวันนัดซื้อขายที่ดิน — กรุณากดทอยเต๋า INT",
                        "local_fallback_check_c2_int",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ด้ายดำ", "สันสมุด")) and "c2_qa_black_thread" in eligible_ids:
                    return pick_script("c2_qa_black_thread", "DM")
                if any(k in text for k in ("อ่าน", "สมุด", "รายละเอียด")) and "c2_qa_read_all" in eligible_ids:
                    return pick_script("c2_qa_read_all", "DM")
            elif scene == "C3":
                if any(k in text for k in ("แผ่นไม้", "ใต้พื้น", "งัดพื้น", "ข้างล่าง", "อะไรเคาะ")):
                    if "c3_inspect_floor_under" in eligible_ids:
                        return pick_script(
                            "c3_inspect_floor_under",
                            "DM",
                            action_kind="inspect",
                            inspect_target_id="c3_damp_floor",
                            reason="local_fallback_c3_inspect_floor",
                        )
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        action_kind="inspect",
                        inspect_target_id="c3_damp_floor",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คราบน้ำเย็นผิดปกติซึมตามรอยต่อไม้และผนังทั้งที่ข้างนอกแห้งสนิท เมื่อลองงัดตรวจใต้พื้นไม่พบห้องขังหรือคนหายถูกกักตัว",
                        reason="local_fallback_c3_inspect_floor",
                    )
                if any(k in text for k in ("สัมผัส", "spi", "ด้าย", "พลัง", "ตรวจ")):
                    chk_dec = check_or_hint(
                        "C3_SPIRIT_RESIDUE",
                        "คุณยื่นมือสัมผัสไอเย็นรอบเศษด้ายดำและคราบชื้นบนพื้น — กรุณากดทอยเต๋า SPI",
                        "local_fallback_check_c3_spi",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("เรียก", "เงา", "เผชิญ", "ก้มฟัง", "ตามดูคราบ", "c4")) and "c3_trigger_c4_echo" in eligible_ids:
                    return pick_script("c3_trigger_c4_echo", "DM")
            elif scene == "C4":
                if any(
                    k in text
                    for k in (
                        "ตั้งจิต",
                        "ขอภาพ",
                        "นิมิต",
                        "spi",
                        "ติดต่อ",
                        "สื่อสาร",
                        "จับสัมผัส",
                        "ตั้งสติ",
                        "ตั้งหลัก",
                        "เผชิญหน้า",
                        "เรียกสติ",
                        "ร่างตรงหน้า",
                    )
                ):
                    chk_dec = check_or_hint(
                        "C4_DROWNED_ECHO_VISION",
                        "คุณตั้งจิตติดต่อกับเงาดำเปียกโชกเพื่อรับภาพนิมิตคืนเกิดเหตุ — กรุณากดทอยเต๋า SPI",
                        "local_fallback_check_c4_spi",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ถอย", "ไป", "ยาย", "c5")) and "c4_leave_to_c5" in eligible_ids:
                    return pick_script("c4_leave_to_c5", "DM")
                if any(k in text for k in ("ตั้งหลัก", "เผชิญหน้า", "เรียกสติ", "ร่างตรงหน้า", "ตั้งจิต", "นิมิต", "สื่อสาร", "พูด")):
                    if "c4_steady_stand" in eligible_ids:
                        return pick_script("c4_steady_stand", "DM", reason="local_fallback_c4_steady")
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="เสียงเรียกสติของพวกคุณทำให้เงาเปียกโชกหยุดชะงัก ไอเย็นจางลงเผยให้เห็นทิศทางของร่องรอยมุ่งไปทางเรือนไม้ท้ายสวน ก่อนทุกอย่างจะสงบลงพอให้ถอยไปหายายบุญมีได้",
                        reason="local_fallback_c4_steady",
                    )
            elif scene == "C5":
                if any(k in text for k in ("เทียบ", "สมุดสวดมนต์", "int")):
                    chk_dec = check_or_hint(
                        "C5_EVACUATION_RECORDS",
                        "คุณเปิดสมุดสวดมนต์จดชื่ออพยพของยายบุญมีมาเทียบเวลาประตูน้ำปี 2534 — กรุณากดทอยเต๋า INT",
                        "local_fallback_check_c5_int",
                        filler_id=None,
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ช่วยใคร", "เด็ก", "วิชัย")) and "c5_qa_which_child" in eligible_ids:
                    return pick_script("c5_qa_which_child", "ยายบุญมี")
                if any(k in text for k in ("ด้ายดำ", "ที่ยายเตือน")) and "c5_qa_black_thread_warning" in eligible_ids:
                    return pick_script("c5_qa_black_thread_warning", "ยายบุญมี")
                if any(k in text for k in ("สมุด", "ด้ายดำ", "ศาล", "บันทึก", "รายชื่อ", "อพยพ")) and not any(k in text for k in ("ดูแลศาล", "เรื่องเล่า")) and "c5_qa_floodgate_book" in eligible_ids:
                    return pick_script("c5_qa_floodgate_book", "ยายบุญมี")
                if any(k in text for k in ("แม่แก้ว", "แก้ว", "น้ำท่วม", "2534", "ดูแลศาล", "เรื่องเล่า")) and "c5_qa_kaew_story" in eligible_ids:
                    return pick_script("c5_qa_kaew_story", "ยายบุญมี")

        elif scene.startswith("D"):
            if scene == "D5" and any(k in text for k in ("เรือนไม้", "ตามรอย", "ไปต่อ", "จบบท", "act e")) and "d_ending_to_act_e" in eligible_ids:
                return pick_script("d_ending_to_act_e", "DM", ending="act_d_complete")
            if scene == "D1":
                if any(k in text for k in ("ถอย", "กลับ", "หน้าสวน", "ตั้งหลัก")) and not any(k in text for k in ("ศาล", "เดินต่อ")):
                    if "d1_retreat_entrance" in eligible_ids:
                        return pick_script("d1_retreat_entrance", "DM", reason="local_fallback_d1_retreat")
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณชะลอฝีเท้าแล้วถอยกลับมาตั้งหลักบริเวณทางเข้าหน้าสวนกล้วย ลมกลางคืนยังพัดใบกล้วยไหวผิดจังหวะ เมื่อพร้อมแล้วสามารถส่องไฟตรวจรอยดินแล้วเดินหน้าต่อได้",
                        reason="local_fallback_d1_retreat",
                    )
                if any(k in text for k in ("สังเกต", "ความผิดปกติ", "แนวต้นกล้วย")) and "d1_qa_observe_path" in eligible_ids:
                    return pick_script("d1_qa_observe_path", "DM")
                if any(k in text for k in ("ศาล", "ผ้าเขียว", "เดิน", "d2")) and "d1_move_to_d2" in eligible_ids:
                    return pick_script("d1_move_to_d2", "DM")
            if scene == "D2":
                if any(k in text for k in ("ป้ายชื่อ", "ป้ายผ้า", "ดล นิด เพิ่ม", "สายคล้องกล้อง", "โคนต้นกล้วย")) and "ปมด้าย" not in text:
                    if "d2_inspect_tags_strap" in eligible_ids:
                        return pick_script(
                            "d2_inspect_tags_strap",
                            "DM",
                            action_kind="inspect",
                            inspect_target_id="d2_shrine_tags_strap",
                            reason="local_fallback_d2_inspect_tags",
                        )
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        action_kind="inspect",
                        inspect_target_id="d2_shrine_tags_strap",
                        filler_audio_id="filler_dm_think",
                        improvised_text="ป้ายผ้าเปื้อนดินเขียนชื่อ ดล นิด เพิ่ม ขึงปมด้ายดำแน่น ส่วนโคนต้นกล้วยหลังศาลมีสายคล้องกล้องถ่ายรูปขาดตกจมโคลนอยู่",
                        reason="local_fallback_d2_inspect_tags",
                    )
                if any(k in text for k in ("ตรวจ", "ปมด้าย", "int", "เทียบ", "สายกล้อง")):
                    chk_dec = check_or_hint(
                        "D2_BINDING_PATTERN",
                        "คุณส่องไฟตรวจปมด้ายดำ ป้ายชื่อ 3 คน และสายกล้องของนิดโดยยังไม่แตะต้องปลายสาย — กรุณากดทอยเต๋า INT",
                        "local_fallback_check_d2_int",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ตัด", "ดึง", "กระชาก")) and "d2_qa_warn_cut" in eligible_ids:
                    return pick_script("d2_qa_warn_cut", "DM")
                if any(k in text for k in ("หลังเสา", "แม่แก้ว", "เรียก", "อ้อมผ่านเสา", "ผ่านเสาศาล", "ด้านหลังศาล", "หลังศาล", "d3")):
                    if "d2_move_to_d3" in eligible_ids:
                        return pick_script("d2_move_to_d3", "DM")
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณก้าวอ้อมผ่านเสาศาลไปยังพื้นที่ด้านหลังศาลเก่า เงาเย็นวูบหนึ่งปรากฏขึ้นขวางทางอยู่ตรงหน้า",
                        state_updates=StateUpdates(current_scene="D3"),
                        reason="local_fallback_d2_to_d3",
                    )
            if scene == "D3":
                if any(k in text for k in ("ตั้งจิต", "สัมผัส", "spi", "ความรู้สึก")):
                    chk_dec = check_or_hint(
                        "D3_KAEW_CONTACT",
                        "คุณตั้งจิตสื่อสารและสัมผัสแรงกดดันของเส้นด้ายที่รั้งร่างแม่แก้ว — กรุณากดทอยเต๋า SPI",
                        "local_fallback_check_d3_spi",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ทำไม", "หลอก", "จับคน", "คนหาย", "พาพวกเขา")) and "d3_qa_why_scare" in eligible_ids:
                    return pick_script("d3_qa_why_scare", "แม่แก้ว (นางตานี)")
                if any(k in text for k in ("ใครคุม", "ใครสั่ง", "กำไล", "วิชัย", "ผูกไว้", "ข้อมือ", "มาจากไหน")) and "d3_qa_who_controls" in eligible_ids:
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
                if any(k in text for k in ("รอยล้อ", "หลังศาล", "เดินอ้อม", "ขอทาง", "สำรวจต่อ", "d5")) and "d3_move_to_d5" in eligible_ids:
                    return pick_script("d3_move_to_d5", "DM")
            if scene == "D4":
                if any(k in text for k in ("เจรจา", "หยุดสู้", "ไม่ทำร้าย", "อ้อม", "หลังศาล", "ผ่าน", "รอยล้อ", "d5")) and "d4_reconcile_to_d5" in eligible_ids:
                    return pick_script("d4_reconcile_to_d5", "แม่แก้ว (นางตานี)")
                if any(k in text for k in ("สู้", "ปะทะ", "โจมตี", "เปิดฉาก", "รับมือ", "คุ้มกันทีม")):
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        action_kind="combat",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณตั้งท่าเตรียมรับมือแรงอาคมและเถาวัลย์ที่ฟาดลงตรงหน้า!",
                        state_updates=StateUpdates(start_combat=True),
                        reason="local_fallback_d4_start_combat",
                    )
            if scene == "D5":
                if any(k in text for k in ("ชี้ไปที่ไหน", "บอกตัวคนเข็น", "ไปที่ไหน")) and "d5_qa_tracks_direction" in eligible_ids:
                    return pick_script("d5_qa_tracks_direction", "DM")
                if any(k in text for k in ("สำรวจ", "รอยล้อ", "per", "กระสอบ", "รองเท้า")):
                    chk_dec = check_or_hint(
                        "D5_CART_TRACKS",
                        "คุณส่องไฟสำรวจรอยล้อรถเข็นหนัก เศษกระสอบข้าว และรอยรองเท้าหลังศาล — กรุณากดทอยเต๋า PER",
                        "local_fallback_check_d5_per",
                    )
                    if chk_dec:
                        return chk_dec

        elif scene.startswith("E"):
            if (
                "เชื่อมโยง" not in text
                and (
                    any(
                        k in text
                        for k in (
                            "h1",
                            "เส้นเวลา",
                            "เวรประตูน้ำ",
                            "สมุดยายบุญมี",
                            "เทียบหลักฐาน 2534",
                            "เทียบเอกสาร",
                            "เช็กและเทียบ",
                        )
                    )
                    or ("2534" in text and any(w in text for w in ("เทียบ", "เช็ก", "สมุด", "บันทึก")))
                )
            ):
                chk_dec = check_or_hint(
                    "H1_FLOOD_TIMELINE",
                    "คุณวางสมุดอพยพของยายบุญมีเทียบเวลาเข้ากับบันทึกเวรเปิดประตูน้ำปี 2534 — กรุณากดทอยเต๋า INT (H1)",
                    "local_fallback_check_h1_int",
                )
                if chk_dec:
                    return chk_dec
            if (
                scene == "E6"
                and any(k in text for k in ("คลายกำไล", "เริ่ม", "act f", "จบบท", "ลงมือ"))
                and not any(g in text for g in ("ก่อนลงมือ", "เทียบเอกสาร", "เอกสารปี 2534", "เช็กและเทียบ", "h1"))
                and "e_ending_to_act_f" in eligible_ids
            ):
                return pick_script("e_ending_to_act_f", "DM", ending="act_e_complete")
            if scene == "E1":
                if any(k in text for k in ("ใต้ถุน", "กระสอบ", "ประตู", "e2")) and "e1_open_cellar_to_e2" in eligible_ids:
                    return pick_script("e1_open_cellar_to_e2", "DM")
                if any(k in text for k in ("ชั้นสอง", "ข้างบน", "บันได", "e4")):
                    if "e1_move_to_e4" in eligible_ids:
                        return pick_script("e1_move_to_e4", "DM", current_scene="E4", reason="local_fallback_move_e4")
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณย่องขึ้นบันไดไม้เก่าไปยังห้องพิธีชั้นสองที่มีแสงเทียนสีส้ม",
                        state_updates=StateUpdates(current_scene="E4"),
                        reason="local_fallback_move_e4",
                    )
                if any(k in text for k in ("รอบเรือน", "รถเข็น", "รอยล้อ", "ลานบ้าน")):
                    if "e1_inspect_yard" in eligible_ids:
                        return pick_script("e1_inspect_yard", "DM", reason="local_fallback_e1_yard")
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="รอบเรือนไม้พบรอยล้อรถเข็นหนักหยุดอยู่ตรงตีนบันได เศษกระสอบข้าวตกเรี่ยราดไปทางกองกระสอบที่บังประตูใต้ถุนซึ่งมีเสียงเคาะเบา ๆ ดังลอดออกมา ส่วนชั้นสองยังมีแสงเทียนสีส้มสว่างอยู่",
                        reason="local_fallback_e1_yard",
                    )
            if scene == "E2":
                if any(k in text for k in ("ถีบ", "พัง", "งัด", "body", "กระแทก")):
                    chk_dec = check_or_hint(
                        "E2_DOOR_BREAK",
                        "คุณเตรียมถีบกระแทกกลอนประตูห้องใต้ถุนให้หลุด — กรุณากดทอยเต๋า BODY",
                        "local_fallback_check_e2_body",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ช่วย", "แก้มัด", "เข้าไป", "e3")) and "e2_untie_to_e3" in eligible_ids:
                    return pick_script("e2_untie_to_e3", "DM")
            if scene == "E3":
                if any(k in text for k in ("ใครทำ", "วิชัย", "ถามดล", "สมุดปกดำ", "ให้ดลดู", "เรื่องชั้นบน")) and not any(
                    k in text for k in ("พาตัวประกัน", "ไปหลบ")
                ) and "e3_don_confirm" in eligible_ids:
                    return pick_script("e3_don_confirm", "ดล")
                if any(k in text for k in ("ปลอบ", "เรียงลำดับ", "soc", "ดล")):
                    chk_dec = check_or_hint(
                        "E3_HOSTAGES_ORDER",
                        "คุณช่วยปลอบดลให้หายสั่นและถามรายละเอียดการถูกจับ — กรุณากดทอยเต๋า SOC",
                        "local_fallback_check_e3_soc",
                        filler_id=None,
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ชั้นสอง", "ขึ้นข้างบน", "ห้องพิธี", "e4")) and "e3_upstairs_to_e4" in eligible_ids:
                    return pick_script("e3_upstairs_to_e4", "DM")
            if scene == "E4":
                if any(k in text for k in ("ถอด", "ตำรา", "กำไล", "int", "ลำดับ", "คลาย")):
                    chk_dec = check_or_hint(
                        "E4_BRACELET_DECODE",
                        "คุณกางตำราพิธีบนโต๊ะชั้นสองเพื่อถอดลำดับคลายเกราะกำไล 3 ขั้น — กรุณากดทอยเต๋า INT",
                        "local_fallback_check_e4_int",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("ใต้โต๊ะ", "กระเป๋า", "หนี้", "สัญญา", "ค้น")) and "e4_search_under_table" in eligible_ids:
                    return pick_script("e4_search_under_table", "DM")
                if any(k in text for k in ("วิชัย", "เสียงฝีเท้า", "บันได", "e5")) and "e4_wichai_arrives_to_e5" in eligible_ids:
                    return pick_script("e4_wichai_arrives_to_e5", "DM")
            if scene == "E5":
                if any(k in text for k in ("กดดัน", "เจรจา", "จี้หลักฐาน", "soc", "ยอมรับ")):
                    chk_dec = check_or_hint(
                        "E5_WICHAI_NEGOTIATE",
                        "คุณชูสัญญาซื้อขายที่ดินและหนังสือทวงหนี้จี้ถามวิชัยตรง ๆ — กรุณากดทอยเต๋า SOC",
                        "local_fallback_check_e5_soc",
                        filler_id="filler_wichai_think",
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("แรงจูงใจ", "สารภาพ", "ทำไม", "หลอกแม่แก้ว")) and "e5_qa_confess_motive" in eligible_ids:
                    return pick_script("e5_qa_confess_motive", "วิชัย")
                if any(k in text for k in ("มัด", "คุมตัว", "จับ", "e6")) and "e5_capture_to_e6" in eligible_ids:
                    return pick_script("e5_capture_to_e6", "DM")

        elif scene.startswith("F"):
            if scene == "F1":
                if any(k in text for k in ("ลงมือรับมือ", "เข้าสู้", "สู้", "คลายเกราะ", "ปลดกำไล", "ปะทะ")) or (
                    "ลงมือ" in text and "ก่อนลงมือ" not in text
                ):
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        action_kind="combat",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณยื่นมือเข้าหาวงด้ายบนโต๊ะเพื่อเริ่มคลายเกราะ 3 ขั้นของแม่แก้ว!",
                        state_updates=StateUpdates(start_combat=True),
                        reason="local_fallback_f1_start_combat",
                    )
                if any(k in text for k in ("จุดเชื่อม", "โต๊ะ", "สังเกต", "ตรวจดู", "ดูจุด")):
                    if "f1_inspect_table" in eligible_ids:
                        return pick_script(
                            "f1_inspect_table",
                            "DM",
                            action_kind="inspect",
                            inspect_target_id="f1_table_knots",
                            reason="local_fallback_f1_inspect_table",
                        )
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        action_kind="inspect",
                        inspect_target_id="f1_table_knots",
                        filler_audio_id="filler_dm_think",
                        improvised_text="คุณกวาดตาดูสายด้ายบนโต๊ะทั้งสามจุดที่โยงเข้าสู่กำไลทองเหลือง — สายหนึ่งตึงรับแรงสะท้อน สายหนึ่งเชื่อมป้ายชื่อทั้งสาม และอีกสายรั้งปมหลักอยู่ พร้อมเมื่อไรสามารถเริ่มคลายเกราะได้ทันที",
                        reason="local_fallback_f1_inspect_table",
                    )
                if any(k in text for k in ("แม่แก้ว", "ไม่ทำร้าย", "ช่วย", "ฟัง", "ต้านด้าย", "ต้านแรงด้าย")):
                    if "f1_talk_kaew" in eligible_ids:
                        return pick_script("f1_talk_kaew", "แม่แก้ว (นางตานี)", reason="local_fallback_f1_talk_kaew")
                    return DMDecision(
                        mode="improvise",
                        character="แม่แก้ว (นางตานี)",
                        filler_audio_id=None,
                        improvised_text="ข้าพยายามรั้งมือไว้แล้ว... แต่ตราบใดที่ด้ายกำไลบนโต๊ะยังไม่ถูกคลาย ข้าก็ต้านแรงสั่งนี้ได้ไม่นาน!",
                        reason="local_fallback_f1_talk_kaew",
                    )
            if scene == "F5":
                if any(k in text for k in ("เจรจา", "ปรองดอง", "ขอร้อง", "soc", "เปิดเผย")):
                    chk_dec = check_or_hint(
                        "F5_KAEW_RECONCILE",
                        "คุณเอ่ยกับแม่แก้วอย่างจริงใจและแสดงความตั้งใจจะเปิดเผยความจริงให้ชาวบ้านรับรู้ — กรุณากดทอยเต๋า SOC",
                        "local_fallback_check_f5_soc",
                        filler_id=None,
                    )
                    if chk_dec:
                        return chk_dec
                if any(k in text for k in ("คุมตัว", "รับโทษ", "กฎหมาย", "พ้นทาง", "มัดวิชัย", "กันวิชัย")):
                    if "f5_detain_wichai" in eligible_ids:
                        return pick_script("f5_detain_wichai", "DM", reason="local_fallback_f5_detain_wichai")
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        filler_audio_id="filler_dm_think",
                        improvised_text="ทีมช่วยกันคุมตัววิชัยแยกออกมาให้พ้นระยะของแม่แก้วและเตรียมส่งตัวดำเนินคดีตามกฎหมาย แม่แก้วมองวิชัยด้วยสายตาเย็นชาแต่ไม่พุ่งเข้ามาทำร้าย ก่อนรอฟังคำตอบจากพวกคุณเรื่องการเปิดเผยความจริงก่อนรุ่งเช้า",
                        reason="local_fallback_f5_detain_wichai",
                    )
                if any(k in text for k in ("รุ่งเช้า", "ฟ้าสาง", "หน้าถนน", "ถนนหน้าหมู่บ้าน", "ออกจากเรือน", "ประเสริฐ", "f6")) and "f5_move_to_f6_dawn" in eligible_ids:
                    return pick_script("f5_move_to_f6_dawn", "DM")
            if scene == "F6":
                if any(k in text for k in ("ประเสริฐ", "h1", "ประตูน้ำ", "หลักฐาน", "ยื่น")) and "f6_prasert_confess" in eligible_ids:
                    return pick_script("f6_prasert_confess", "ประเสริฐ")
                if any(k in text for k in ("จบคดี", "ปิดคดี", "ปิดงาน", "สรุป", "epilogue", "รถตู้", "กลับ")) and "ending_a_epilogue" in eligible_ids:
                    return pick_script("ending_a_epilogue", "DM", ending=room_manager.resolve_final_ending(room))

        scene_cfg = room_manager.repo.get_scene(scene) or {}
        inspectable_hints: dict[str, tuple[str, ...]] = {
            "a1_folder_paper": ("แฟ้ม", "ใบรับแจ้ง", "รายชื่อคนหาย"),
            "a1_wall_board": ("กระดานข่าว", "ประกาศ", "ศาลา"),
            "a2_van_gear": ("ไฟฉาย", "ท้ายรถ", "อุปกรณ์", "รถตู้"),
            "b1_headman_files": ("แฟ้มคนหาย", "แผนที่หมู่บ้าน", "โต๊ะกลางห้อง"),
            "b3_old_photo": ("ภาพถ่ายเก่า", "รูปเก่า", "ผนัง", "2534"),
            "c1_dining_and_door": ("ประตูมุ้งลวด", "จานอาหาร", "กับข้าว"),
            "c1_desk_papers": ("โต๊ะทำงาน", "กองแฟ้ม", "กระดาษ"),
            "c2_black_notebook": ("สมุดปกดำ", "สมุดดล", "เศษด้ายดำ"),
            "c3_damp_floor": ("แผ่นไม้", "ใต้พื้น", "คราบชื้น"),
            "d1_mud_tracks": ("รอยดินยุบ", "รอยยุบ", "เส้นคู่"),
            "d2_shrine_tags_strap": ("ป้ายชื่อ", "ป้ายผ้า", "สายคล้องกล้อง", "โคนต้นกล้วย"),
            "e1_rice_sacks": ("กระสอบข้าว", "ประตูไม้ใต้ถุน"),
            "e4_ritual_table": ("กำไลทองเหลือง", "ตำราพิธี", "โต๊ะพิธี"),
            "e4_under_table": ("ใต้ผ้าคลุม", "กระเป๋าเดินทาง", "หนังสือทวงหนี้", "ใต้โต๊ะ"),
            "f1_table_knots": ("สายด้าย", "จุดเชื่อมด้าย", "สามจุด"),
        }
        inspect_verbs = ("ตรวจ", "ดู", "สำรวจ", "เปิด", "ส่อง", "ค้น", "หยิบ", "อ่าน", "เช็ก", "งัด", "สังเกต", "แตะ", "จับ", "คลี่", "พลิก")
        if any(v in text for v in inspect_verbs):
            for obj in scene_cfg.get("inspectables", []):
                obj_id = str(obj.get("id") or "")
                raw_label = str(obj.get("label") or "").lower()
                for sep in ("และ", "กับ", "บน", "ใต้", "ใน", "ที่", "ของ", "มี", "ข้าง", "ตรง", "(", ")", "/", "-", ","):
                    raw_label = raw_label.replace(sep, " ")
                label_tokens = [tok for tok in raw_label.split() if len(tok) >= 4]
                hints = inspectable_hints.get(obj_id, ())
                if obj_id.lower() in text or any(h in text for h in hints) or any(tok in text for tok in label_tokens):
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        action_kind="inspect",
                        inspect_target_id=obj_id,
                        filler_audio_id="filler_dm_think",
                        improvised_text=obj.get("description", "คุณตรวจดูจุดนั้นอย่างละเอียด"),
                        reason="local_fallback_inspectable",
                    )

        if any(k in text for k in ("เทียบ", "เชื่อม", "รวม", "ผสาน", "สังเคราะห์")):
            combine_keywords: dict[str, tuple[str, ...]] = {
                "combine_missing_report_and_map": ("ใบรับแจ้ง", "คนหาย", "จุดเกิดเหตุ", "แผนที่"),
                "combine_map_and_notebook": ("สมุดปกดำ", "สมุดดล", "แผนที่", "แปลงที่ดิน", "ที่ดิน"),
                "combine_floodgate_and_prayer_book": ("2534", "ประตูน้ำ", "อพยพ", "ยายบุญมี", "น้ำท่วม", "เอกสารปี"),
                "combine_grimoire_and_bracelet": ("ตำรา", "กำไล", "วงป้องกัน", "คลายเกราะ"),
                "combine_notebook_and_debt_docs": ("หนี้สิน", "การเงิน", "ทวงหนี้", "ซื้อขาย", "สัญญา", "วิชัย"),
            }
            ready_recipes: list[dict[str, Any]] = []
            for recipe in room_manager.repo.combine_recipes:
                req_items = recipe.get("requires_items") or []
                req_clues = recipe.get("requires_clues") or []
                if all(i in room.inventory for i in req_items) and all(c in room.clues_found for c in req_clues):
                    if recipe.get("id") not in room.completed_combines:
                        ready_recipes.append(recipe)
            if ready_recipes:
                best_recipe: Optional[dict[str, Any]] = None
                best_score = 0
                for recipe in ready_recipes:
                    rid = str(recipe.get("id") or "")
                    hints = combine_keywords.get(rid, ())
                    title = str(recipe.get("title") or "").lower()
                    for sep in ("เทียบ", "เชื่อม", "กับ", "และ", "ของ"):
                        title = title.replace(sep, " ")
                    title_tokens = [tok for tok in title.split() if len(tok) >= 4]
                    score = sum(2 for kw in hints if kw in text) + sum(1 for tok in title_tokens if tok in text)
                    if score > best_score:
                        best_score = score
                        best_recipe = recipe
                if best_recipe is None and len(ready_recipes) == 1:
                    best_recipe = ready_recipes[0]
                if best_recipe is not None:
                    return DMDecision(
                        mode="improvise",
                        character="DM",
                        action_kind="combine",
                        inspect_target_id=best_recipe["id"],
                        filler_audio_id="filler_dm_think",
                        improvised_text=best_recipe.get("result_text", f"คุณนำหลักฐานมาเทียบกัน: {best_recipe.get('title', '')}"),
                        reason="local_fallback_combine",
                    )

        guideline = room_manager.compute_guideline_snapshot(room)
        pending_main = next(
            (l for l in guideline.get("leads", []) if l.get("kind") == "main" and not l.get("done")),
            None,
        )
        lead_hint = (
            f" (แนวทางหลักตอนนี้: {pending_main['label']})"
            if pending_main and pending_main.get("label")
            else ""
        )

        default_speaker = room_manager.default_speaker_for_scene(scene)
        filler_obj = room_manager.repo.default_filler_for_speaker(default_speaker)
        default_filler = filler_obj["id"] if filler_obj else None
        if default_speaker == "ประเสริฐ":
            default_text = "ความจริงทั้งหมดอยู่ที่เอกสารตรงหน้าแล้วครับ พวกคุณตัดสินใจได้เลย" if scene == "F6" else f"ผมอยากให้เราตรวจดูข้อมูลคนหายและแฟ้มที่บ้านผมให้แน่ใจก่อนนะครับ มีอะไรอยากถามเพิ่มไหม?{lead_hint}"
        elif default_speaker == "วิชัย":
            default_text = f"ข้อมูลคนหายกับแผนที่อยู่ที่โต๊ะนี้ทั้งหมดแล้วครับ อยากตรวจสอบหรือซักถามเรื่องไหนต่อบอกได้เลย{lead_hint}"
        elif default_speaker == "ต้น":
            default_text = "ตรงนี้ไม่มีใครได้ยินหรอกพี่... อยากรู้อะไรก็รีบถามแล้วกันนะ เดี๋ยวพี่วิชัยจะสงสัย"
        elif default_speaker == "ยายบุญมี":
            default_text = "เรื่องคืนน้ำท่วมกับศาลด้ายดำ ยายจำได้เท่าที่เห็นลูก อยากถามอะไรก็รีบถาม"
        elif default_speaker == "แม่แก้ว (นางตานี)":
            default_text = "เส้นลมเย็นพัดผ่านใบกล้วย... พวกเจ้าจะทำอะไรกับความจริงก็จงเลือกเสีย"
        elif default_speaker == "ดล":
            default_text = "ผม นิด กับตาเพิ่มพอตั้งหลักได้แล้วครับพี่ รีบขึ้นไปดูข้างบนเถอะ วิชัยขึ้นไปทำอะไรบนนั้นทุกคืน!"
        elif scene == "B3":
            default_text = f"ภาพถ่ายเก่าปี 2534 และกองแฟ้มใต้ผนังยังรอให้คุณตรวจสอบละเอียด หรือเทียบกับแผนที่หมู่บ้าน{lead_hint}"
        elif scene.startswith(("C", "D", "E", "F")):
            default_text = f"แสงสลัวยังคลุมพื้นที่ตรงหน้า คุณสามารถตรวจสอบร่องรอย ซักถามรายละเอียด หรือกดจุดแผนที่เพื่อย้ายจุดต่อได้{lead_hint}"
        else:
            default_text = f"บรรยากาศรอบศาลาเงียบสงัด อากาศแห้งอบอ้าวและเงียบผิดปกติ — พวกคุณจะสอบถามอะไรเพิ่มหรือสำรวจจุดใดต่อ?{lead_hint}"
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
