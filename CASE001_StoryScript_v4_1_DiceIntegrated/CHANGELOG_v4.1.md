# CHANGELOG — CASE 001 v4.1

- แทรก **16 optional Information/Dice Checks** พร้อม DM Narration, NPC/Spirit Dialogue และผล Full / Partial / Failure ลงในฉากเดิม A2, B2, B3, B4, C2, C3, C4, C5, D2, D3, D5, E3, E4, E5, H1, F5
- เพิ่ม baseline / trigger / bypass / fallback ในแต่ละจุด เพื่อไม่ให้ทอยพลาดแล้วคดีตัน
- ปรับคำกำกับ `[ตรวจละเอียด]`, `[ตรวจพิธี]`, `[ตรวจอาคม]` 4 จุดใน v4.0 เพื่อแยกการพบข้อมูลแน่นอนจากการทอยเพื่อรู้ข้อมูลเชิงลึก; ไม่เปลี่ยน lore และบทพูดหลัก
- เพิ่มไฟล์ข้อมูล 16 Checks ในรูป JSON และเชื่อมผ่าน `StoryFlow v4.1`
- เพิ่ม state ที่เสนอ `CHECK_RESULTS`, `CLUE_LEVELS`, `RITUAL_PLAN`, `WICHAI_COOPERATING` โดยไม่ลบ state เดิม
- ยึด Universal v1.3 และ Combat Lite v1.1: D20 core stat; DC11/14/17; ไม่มี Partial สำหรับ attack roll
- คง NPC และเบาะแสหลัก รวมทั้งทางเลือกความสำเร็จ/ความล้มเหลวเดิมทั้งหมด
- **สถานะ:** Playtest Draft, ยังไม่เป็นข้อกำหนดให้เปลี่ยนโค้ดโดยอัตโนมัติ
