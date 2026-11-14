# รวมงานโปรเจกต์ — 14 พฤศจิกายน 2026

ผู้ใช้มอบหมายให้แชทผู้รวมงานรับผิดชอบ stage, commit และ push เพียงแชทเดียว และอนุมัติรวมงานจากทุกแชท
แชทหลัก แชท encounter และแชทจัดฉากยืนยันหยุดเขียนไฟล์ก่อนตรวจรวม

## งานที่รวม

- คลังคำถามตอบ DM แบบเปิดทีละข้อ แยก NPC, DM บรรยาย, เอกสาร และคำแนะนำเฉพาะ DM
- เครื่องมือ DM ตามเหตุการณ์จริง แยกการเดินทาง NPC เอกสาร/หลักฐาน และการค้นของหรือช่วยคนที่ไม่ต้องทอย
- หน้าแรกแนะนำ CASE002 งานวัดคืนที่ 8 และ CASE003 ในสถานะยังไม่เปิดให้เล่น
- ระบบ encounter, ท่าอาชีพ, โจมตีหนัก, สถานะ, HP และ Combat log ตามงานแชท encounter
- ย้ายภาพต้นฉบับและเอกสารอ้างอิงเก่าเข้าตำแหน่งตาม PROJECT_LAYOUT.md

## หลักฐานก่อน commit

- ไฟล์เดิมที่ถูกย้าย 62 รายการตรง SHA-256 กับสำเนาตำแหน่งใหม่ อีก 6 เอกสารตรงหลังปรับ CRLF/LF
- ตรวจ diff และปรับ world.ts ให้ใช้ LF เพื่อตัดความต่างจาก CRLF ที่ไม่เกี่ยวกับพฤติกรรม
- npm run typecheck ผ่านทั้ง workspace
- npm run build ผ่าน ด้วย VITE_SERVER_URL ตาม DEPLOYMENT.md
- Server/client tests รวม 337 รายการผ่าน
- Production Socket.IO smoke 6 รายการผ่าน รวม polling/WebSocket, คืน session, NPC placement และ restart
- เนื่องจาก tsx ใน node_modules ใช้งานไม่ได้ จึง transpile server tests ไปเรียก dist ที่เพิ่ง build และ bundle client tests ด้วย esbuild ก่อนรัน node --test; ลบเฉพาะไฟล์ทดสอบชั่วคราวที่สร้างแล้ว
- แก้ tests เดิมที่ยังคาดค่า Stat/HP ก่อนการปรับสมดุล แก้ตัวโหลด CSS ใน UI test และเปลี่ยน smoke จาก askGm/dmAnswer ที่เลิกใช้ไปเป็น DM ส่งบทโดยตรง
- git diff --check สำหรับโค้ดผ่าน; เอกสารอ้างอิง Markdown คงช่องว่างท้ายบรรทัดสำหรับ hard break ไม่พบ private-key/GitHub-token/OpenAI-key markers ในไฟล์ข้อความใหม่จากการตรวจรูปแบบเบื้องต้น

## ขอบเขตที่ยังไม่รวมใน Git

คงกฎ .gitignore เดิม: saves, artifacts, .local-logs และต้นฉบับ reference v5.2/v5.3/v5.5 ยังเป็นข้อมูล local
การปรับลำดับเปิดเผยข้อมูลในต้นฉบับ v5.5 ยังไม่ได้ import เข้า runtime; ดู DISCLOSURE_CONTINUITY_20261114.md
ไม่ใช้ importer เพื่อทับ runtime ระหว่างรวมงานรอบนี้

## ข้อจำกัด

ไม่ได้ตรวจภาพ/ลากตัวละครผ่าน browser หรือยืนยันบาลานซ์จากการเล่นจริง 4–6 รอบ
การ push เป็นการส่ง Git ไป branch ปัจจุบัน ไม่ใช่หลักฐานว่า Render deploy สำเร็จ

ปลายทางรวมคือ origin/main ซึ่งมี commit 3f2bdcf เป็นบรรพบุรุษของ HEAD ใช้ fast-forward ปกติ ไม่ force push ไปทับ branch upgrade เก่าที่มีประวัติแยก
