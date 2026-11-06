import { useState } from 'react';
import type { PublicRoom } from '../../network/onlineTypes';
import { CaseScene } from '../case/CaseScene';

export function Lobby({connected,publicRooms,createRoom,joinRoom,resumeRoom}:{
  connected:boolean;
  publicRooms:PublicRoom[];
  createRoom:()=>void;
  resumeRoom?:()=>void;
  joinRoom:(code:string)=>void;
}) {
  const [code,setCode]=useState('');
  return <section className="lobby-dossier" aria-label="เข้าร่วมคดี">
      <CaseScene site="A" location="ศาลาริมทางยามค่ำ"/>
      <div className="lobby-entry">
        <p className="eyebrow">แฟ้ม 001 · รับสมัครทีมภาคสนาม</p>
        <h2>เสียงร้องจากสวนกล้วย</h2>
        <p>สร้างห้องแล้วส่งรหัสให้ทีม หรือกรอกรหัสเพื่อเข้าร่วม รองรับผู้สืบสวน 2–6 คน และ DM อีก 1 คน</p>
        {resumeRoom && <button type="button" disabled={!connected} onClick={resumeRoom}>เล่นคดีที่บันทึกไว้ต่อ</button>}
        <button className="primary" disabled={!connected} onClick={createRoom}>สร้างห้อง</button>
        <section className="public-rooms" aria-label="ห้องที่เปิดรับผู้เล่น">
          <h3>ห้องที่เปิดรับผู้เล่น</h3>
          {!connected ? <p>กำลังเชื่อมต่อเพื่อดูรายชื่อห้อง</p> : publicRooms.length ? <ul>
            {publicRooms.map(entry=><li key={entry.code}>
              <button type="button" onClick={()=>joinRoom(entry.code)}>
                เข้าห้อง {entry.code} · สมาชิก {entry.occupied}/{entry.capacity}
              </button>
            </li>)}
          </ul> : <p>ยังไม่มีห้องที่เปิดรับผู้เล่น</p>}
        </section>
        <form onSubmit={event=>{event.preventDefault();joinRoom(code);}}>
          <label>รหัสห้อง <input value={code} onChange={event=>setCode(event.target.value)} maxLength={6}/></label>
          <button disabled={!connected || code.trim().length!==6}>เข้าห้อง</button>
        </form>
      </div>
    </section>;
}
