# Automated AI Game Master — CASE 001 (Act A Full TRPG Vertical Slice)

ต้นแบบเว็บเกมบอร์ด TRPG สืบสวนสยองขวัญภาษาไทยแบบ Multiplayer ที่ใช้ **AI Game Master (ไม่ต้องมีคนเป็น DM)** บนสถาปัตยกรรม Hybrid **Script-First + Safe Improvisation** พร้อมระบบต่อสู้ผลัดเทิร์นที่ **Gemini Tactical Ghost AI** เลือกท่าผีและพากย์สดให้

## ฟีเจอร์หลักในเวอร์ชันปัจจุบัน (Act A1–A3 + Combat)
- **ระบบตัวละคร TRPG (อิงฐาน CASE 001 v5.5):**
  - 6 อาชีพ (ห้ามเลือกซ้ำกันในห้องเดียวกัน) พร้อม **HP 15 / สติ (Sanity) 10 / โฟกัส 4**, ค่าสถานะ 6 ค่า และท่าประจำอาชีพเฉพาะตัว
  - รองรับ **Reconnect** กลับเข้าห้องเดิมด้วยตัวละครและค่า HP/สติเดิมอัตโนมัติ (Token ใน `localStorage`)
- **AI Game Master & Anti-Spoiler Guardrails:**
  - ถอดเสียงไทยด้วย Groq `whisper-large-v3-turbo`, ตัดสินใจด้วย Gemini `gemini-3.5-flash-lite` (JSON Structured Output), พากย์สดด้วย `gemini-3.8-flash-lite-tts`
  - ระบบ **คุมงบ Live TTS สูงสุด 25 ครั้งต่อห้อง** (หากครบโควตาจะสลับเป็นซับไตเติล + เสียง Pre-gen อัตโนมัติ)
- **ระบบต่อสู้ผลัดเทิร์น (Turn-based Combat) + Gemini Ghost AI:**
  - เดินเข้า **บ้านผู้ใหญ่บ้าน** ใน A3 = จบ Act A ตามเนื้อเรื่องหลัก
  - ฝืนเดินเข้า **ปากทางสวนกล้วย** ใน A3 (หรือกดปุ่ม **ทดสอบฉากต่อสู้**) = เผชิญหน้ากับ **ผีเงาจมน้ำ** แบบผลัดเทิร์น (โจมตี / กล่อมวิญญาณ / ดึงสติ / ท่าประจำอาชีพ / คุ้มกันถอยทัพ)
  - ฝั่ง Backend คำนวณ HP/สติ/โฟกัส/สถานะ (`พันธนาการ`, `หวาดกลัว`) แบบแม่นยำ 100% ส่วนตาผีให้ Gemini เลือกท่าและเป้าหมายอย่างมีแทคติก
- **เสียงบรรยากาศ & SFX (Web Audio API + Audio Ducking):**
  - เสียงฝนตกคลอฉากที่จะ **หรี่เสียงลงอัตโนมัติ** ทุกครั้งที่ DM/NPC/ผีพูด + เสียงเอฟเฟกต์วิทยุซ่า, ทอยเต๋า, ปะทะ และใช้สกิล

---

## วิธีใส่ API Key และเริ่มใช้งานบนเครื่อง (Local)

### 1. ขอ API Keys
1. **Google Gemini API Key (`GEMINI_API_KEY`):** สร้างได้ที่ [Google AI Studio](https://aistudio.google.com/apikey)
2. **Groq API Key (`GROQ_API_KEY`):** สร้างได้ที่ [Groq Console](https://console.groq.com/keys)

### 2. สร้างไฟล์ `ai-dm-prototype/.env`
คัดลอก [`.env.example`](.env.example) เป็นไฟล์ใหม่ชื่อ `.env` ในโฟลเดอร์ `ai-dm-prototype/` แล้วใส่คีย์ของคุณ:
```env
GEMINI_API_KEY=ใส่คีย์_Gemini_ที่นี่
GROQ_API_KEY=ใส่คีย์_Groq_ที่นี่
```

### 3. สร้างไฟล์เสียงตามสคริปต์ล่วงหน้า (`audio_assets/{act_a,act_b,combat,fillers}/`)
```powershell
cd ai-dm-prototype
.\.venv\Scripts\python.exe scripts\generate_audio.py --delay 7
```
*(ดูรายการก่อนสร้างจริงด้วย `--dry-run` หรือแยกสร้างเฉพาะบทด้วย `--bucket act_b` ได้ — ดูพื้นที่ทำงานคนเขียนบทครบทุกบท A–F และวิธีซิงก์บทพูดได้ที่ [`story/README.md`](story/README.md))*

### 4. รันเซิร์ฟเวอร์ทดสอบ
```powershell
cd ai-dm-prototype
.\.venv\Scripts\uvicorn.exe backend.main:socket_app --host 0.0.0.0 --port 8000 --reload
```
เปิดเบราว์เซอร์ไปที่ `http://localhost:8000` (เปิดหลายแท็บด้วยรหัสห้องเดียวกันเพื่อเทสเลือกอาชีพไม่ซ้ำกัน, Push-to-Talk, และปะทะผีเงาจมน้ำพร้อมกันได้เลย)

---

## วิธี Deploy ขึ้น Render
1. Deploy ด้วย Blueprint จากไฟล์ [`render.yaml`](render.yaml) (รัน `--workers 1` เพื่อให้ Socket.IO และ state ห้องซิงก์กัน)
2. ไปที่ **Render Dashboard -> Web Service -> Environment -> Add Environment Variable** แล้วเพิ่ม 2 ตัวแปร:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
3. ควร commit ไฟล์เสียงใน `ai-dm-prototype/audio_assets/` ขึ้น Git ด้วย เพื่อให้ Render มีไฟล์เสียงตามสคริปต์พร้อมเล่นทันทีหลัง Deploy
