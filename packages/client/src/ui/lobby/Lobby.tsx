import {useState} from 'react';
import type {PublicRoom} from '../../network/onlineTypes';
import {CaseScene} from '../case/CaseScene';
import {savePreview,type SavePreview} from './savePreview';

export function Lobby({connected,publicRooms,createRoom,joinRoom,resumeRoom,importSave,recoverRoom,busy=false,status=''}:{
 connected:boolean;publicRooms:PublicRoom[];createRoom:()=>void;joinRoom:(code:string)=>void;
 resumeRoom?:()=>void;importSave:(save:unknown)=>void;recoverRoom:(token:string)=>void;busy?:boolean;status?:string;
}) {
 const [mode,setMode]=useState<'new'|'continue'>(resumeRoom?'continue':'new');
 const [recovery,setRecovery]=useState(''),[code,setCode]=useState(''),[fileError,setFileError]=useState('');
 const [file,setFile]=useState<{name:string;data:unknown;preview:SavePreview}>();
 const disabled=!connected || busy;
 return <section className="lobby-dossier" aria-label="เข้าร่วมคดี">
  <div className="lobby-art"><CaseScene site="A" location="ศาลาริมทางยามค่ำ"/><div className="lobby-art-caption"><span className="eyebrow">CASE FILE / 001</span><h2>เสียงร้อง<br/>จากสวนกล้วย</h2><p>บางเสียง… ไม่ได้ร้องขอให้เราเข้าไป</p><span className="state-badge">ผู้สืบสวน 2–6 คน + DM</span></div></div>
  <div className="lobby-entry">
   <header><p className="eyebrow">บริษัท เรื่องผีไว้ใจผม จำกัด</p><h2>{mode==='continue'?'กลับมาสืบต่อ':'พร้อมรับคดีแล้วหรือยัง'}</h2><p className="note">{mode==='continue'?'กลับเข้าตัวละครเดิม พร้อมเรื่องราวและผลทอยครั้งก่อน':'รวมทีม เลือกตัวละคร แล้วให้ DM เปิดคดี'}</p></header>
   <nav className="entry-tabs" aria-label="วิธีเข้าเล่น"><button type="button" aria-pressed={mode==='new'} onClick={()=>setMode('new')}>เริ่มคดีใหม่</button><button type="button" aria-pressed={mode==='continue'} onClick={()=>setMode('continue')}>เล่นต่อจากเดิม</button></nav>
   {status && <p className="inline-notice" role="alert">{status}</p>}
   {busy && <p role="status">กำลังเข้าห้อง รอสักครู่…</p>}
   {mode==='new'?<div className="entry-content">
    <section className="entry-card"><h3>เป็นคนเปิดห้อง?</h3><p>สร้างห้อง แล้วส่งรหัสให้ทีม</p><button className="primary" disabled={disabled} onClick={createRoom}>สร้างห้องใหม่</button></section>
    <form className="join-room-form" onSubmit={e=>{e.preventDefault();joinRoom(code.trim().toUpperCase());}}><label>มีรหัสจากเพื่อนแล้ว<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="รหัสห้อง 6 ตัว" maxLength={6} autoComplete="off" spellCheck={false}/></label><button disabled={disabled || !/^[A-F0-9]{6}$/.test(code.trim())}>เข้าห้อง</button></form>
    <details className="public-rooms"><summary>ห้องที่เปิดรับผู้เล่น · {publicRooms.length}</summary>{!connected?<p>กำลังเชื่อมต่อ…</p>:publicRooms.length?<ul>{publicRooms.map(entry=><li key={entry.code}><button type="button" disabled={disabled} onClick={()=>joinRoom(entry.code)}>ห้อง {entry.code} <span>{entry.occupied}/{entry.capacity} คน</span></button></li>)}</ul>:<p>ยังไม่มีห้อง สร้างห้องใหม่หรือใช้รหัสจาก DM</p>}</details>
   </div>:<div className="entry-content">
    {resumeRoom && <section className="entry-card resume-shortcut"><span className="state-badge success">พบสิทธิ์เข้าเล่นในเครื่องนี้</span><h3>กลับห้องเดิม</h3><p>ใช้ได้เมื่อห้องยังอยู่ หรือ DM โหลดเซฟแล้ว</p><button className="primary" disabled={disabled} onClick={resumeRoom}>กลับเข้าเล่นต่อ</button></section>}
    <ol className="resume-steps"><li><strong>DM โหลดเซฟ</strong><span>กรณีห้องเดิมหายหรือเซิร์ฟเวอร์เริ่มใหม่</span></li><li><strong>สมาชิกกลับเข้าตัวเดิม</strong><span>ใช้ปุ่มด้านบน หรือรหัสส่วนตัวจาก DM</span></li><li><strong>DM จัดทีมวันนี้</strong><span>พักคนที่มาไม่ได้ แล้วเปิดเล่นต่อ</span></li></ol>
    <details className="entry-card" open={!resumeRoom}><summary>ฉันเป็นผู้เล่น · ใช้รหัสส่วนตัว</summary><form onSubmit={e=>{e.preventDefault();recoverRoom(recovery.trim().toLowerCase());}}><label>รหัสกลับเข้าตัวละคร<input value={recovery} onChange={e=>setRecovery(e.target.value)} placeholder="วางรหัสส่วนตัวที่ DM ส่งให้" autoComplete="off" spellCheck={false}/></label><button disabled={disabled || !/^[a-f0-9]{64}$/i.test(recovery.trim())}>กลับเข้าตัวละครเดิม</button></form><p className="note">รหัสนี้ต่างจากรหัสห้อง 6 ตัว ให้ DM โหลดเซฟก่อนถ้าห้องเดิมหาย</p></details>
    <details className="entry-card"><summary>ฉันเป็น DM · โหลดไฟล์เซฟ</summary><p>เลือกไฟล์ที่ดาวน์โหลดไว้ ตรวจชื่อคดี แล้วโหลด ทีมจะยังพักอยู่จนกว่าคุณเปิดเล่นต่อ</p>
     <label className="save-file-picker">เลือกไฟล์เซฟ JSON<input type="file" accept=".json,application/json" disabled={disabled} onChange={async e=>{const selected=e.target.files?.[0];if(!selected)return;setFile(undefined);setFileError('');try{if(selected.size>8_000_000)throw Error('ไฟล์เซฟต้องไม่เกิน 8 MB');const data=JSON.parse(await selected.text());setFile({name:selected.name,data,preview:savePreview(data)});}catch(error){setFileError(error instanceof SyntaxError?'อ่านไฟล์ไม่ได้ เลือกไฟล์ JSON ที่ดาวน์โหลดจากเกม':error instanceof Error?error.message:'อ่านไฟล์เซฟไม่ได้');}e.target.value='';}}/></label>
     {fileError && <p role="alert" className="inline-notice">{fileError}</p>}
     {file && <section className="save-preview"><span className="state-badge">พร้อมโหลด</span><h3>{file.preview.title}</h3><p>{file.preview.location} · ผู้เล่น {file.preview.players} คน</p><small>{file.name} · ห้อง {file.preview.room}</small><div className="button-row"><button className="primary" disabled={disabled} onClick={()=>importSave(file.data)}>โหลดเซฟและจัดทีม</button><button type="button" disabled={busy} onClick={()=>setFile(undefined)}>ยกเลิก</button></div></section>}
     <p className="note">ไฟล์เซฟมีข้อมูลลับ เก็บกับ DM เท่านั้น</p>
    </details>
   </div>}
  </div>
 </section>;
}
