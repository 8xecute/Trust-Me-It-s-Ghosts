# ตำแหน่งไฟล์โปรเจกต์

โฟลเดอร์หลักที่ใช้พัฒนาและรันเกม:

`C:/Users/Frank/Documents/Codex/2026-11-04/create-the-initial-project-for-baan/outputs/baan-sangob-co`

เปิด terminal ในโฟลเดอร์นี้เพื่อใช้คำสั่ง npm ไม่ใช้สำเนา repo ใน Pictures/DND/github-upload หรือ game-ui-proposal/project แทนโฟลเดอร์หลัก

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| packages/client/ | หน้าเกมและภาพที่โหลดใช้งานจริง |
| packages/server/ | Multiplayer, State, เนื้อเรื่องและ API ที่ใช้งานจริง |
| packages/shared/ | กติกาและชนิดข้อมูลร่วม |
| packages/server/scenarios/case-001/ | ข้อมูล runtime แยกตามเวอร์ชัน รวม v5.5 |
| docs/case001/ | แผนงานและรายงานคดี |
| docs/case001/history/ | รายงานและเอกสารตรวจทานเวอร์ชันเก่า |
| docs/reference/case001/v4.1/ ถึง v5.5/ | ชุดต้นฉบับเนื้อเรื่อง แยกตามเวอร์ชัน |
| docs/reference/characters/ | เอกสาร Stat และความสามารถตัวละคร |
| docs/reference/encounter-analysis/ | ZIP และคำอธิบายชุดวิเคราะห์ encounter เดิม ไม่ใช่ runtime |
| docs/reference/ui-proposals/ | ตัวอย่าง UI เก่าสำหรับอ้างอิง |
| assets/source/Art/ | ภาพต้นฉบับ |
| assets/source/ART dicut/ | ภาพตัดพื้นหลังต้นฉบับ |
| scripts/ | เครื่องมือนำเข้าข้อมูลและตรวจเกม |
| tests/smoke/ | ทดสอบเซิร์ฟเวอร์ที่ build แล้วผ่าน Socket.IO |
| artifacts/previews/ | ภาพ preview แผนที่เดิม |
| artifacts/archive/ | ภาพและรายงานทดลองเก่า |
| artifacts/organization/ | รายการย้ายไฟล์และ checksum ก่อนย้าย |
| .local-session-saves/ | เซฟ local ที่กำลังใช้งาน เก็บเฉพาะเครื่อง |
| .local-logs/ | log และสคริปต์ทดสอบ local เก็บเฉพาะเครื่อง |

## คำสั่งที่ใช้

รันจากโฟลเดอร์หลัก:

```powershell
npm run dev
npm run typecheck
npm run build
node --test tests/smoke/production-smoke.test.mjs tests/smoke/production-v51-smoke.test.mjs tests/smoke/production-session-smoke.test.mjs
python scripts/import-case001-v55.py
```

สคริปต์นำเข้า v5.5 อ่านต้นฉบับจาก docs/reference/case001/v5.5/ และสร้างข้อมูลใน packages/server/scenarios/case-001/ อย่าใช้ต้นฉบับเก่าทับ runtime ล่าสุด

## ข้อมูลที่คงไว้

- โค้ดและเซฟที่กำลังใช้งานคงตำแหน่งเดิม จึงไม่เปลี่ยน path ของเซิร์ฟเวอร์ local
- ไฟล์ที่ย้ายได้รับการตรวจ SHA-256 ว่าตรงกันก่อนแก้ path ในสคริปต์ทดสอบ
- เอกสารวิเคราะห์ encounter จาก Music/Encounter คัดลอกมาเก็บที่นี่ โดยคงต้นฉบับภายนอกไว้
- สำเนา Git เก่า โฟลเดอร์ merge-scratch, cache tsx และ ghost-workflow ไม่ถูกรวมหรือลบ เพราะเป็น working tree/cache แยกกัน
- node_modules และ dist เป็นไฟล์สร้างใหม่ได้ ไม่ใช่ต้นฉบับ
- เซฟ, log, artifacts และชุดอ้างอิง local ที่ไม่ใช้เล่นจริงไม่รวมใน Git ตาม .gitignore

การจัดโฟลเดอร์ครั้งนี้ไม่ได้ commit/push และไม่ได้แก้กติกาหรือ State ของเกม
