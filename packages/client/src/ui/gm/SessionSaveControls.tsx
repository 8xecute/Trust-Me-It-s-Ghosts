import {useEffect,useState} from 'react';
import type {Socket} from 'socket.io-client';
import type {Room} from '../../network/onlineTypes';

type Action=(type:string,payload?:object,onSuccess?:()=>void,onSettled?:(error?:string)=>void)=>void;
export function SessionSaveControls({socket,connected,paused,playerName,investigators,inactive=[],action}:{
 socket:Socket|null;connected:boolean;paused:boolean;playerName:(id:string)=>string;investigators:Room['players'];inactive?:string[];action:Action;
}) {
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState('');
 const [codes,setCodes]=useState<{id:string;token:string}[]>([]);
 useEffect(()=>{
  if(!socket || !connected)return;
  let live=true;
  socket.timeout(10000).emitWithAck('session:recovery').then(reply=>{if(live){if(reply.ok)setCodes(reply.codes);else setStatus(reply.error);}}).catch(()=>{if(live)setStatus('ดึงรหัสกลับเข้าไม่ได้ ลองเปิดหน้านี้อีกครั้ง');});
  return ()=>{live=false;};
 },[socket,connected]);
 async function download() {
  if(!socket?.connected)return;
  try {
   const reply=await socket.timeout(10000).emitWithAck('session:export');
   if(!reply.ok)throw Error(reply.error);
   const save=reply.save;
   const url=URL.createObjectURL(new Blob([JSON.stringify(save)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='case-'+save.membership.room.code+'-'+new Date().toISOString().replaceAll(':','-')+'.json';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setStatus('ส่งไฟล์ให้เบราว์เซอร์แล้ว ตรวจโฟลเดอร์ดาวน์โหลดก่อนปิดเกม');
  }catch(error){setStatus(error instanceof Error?error.message:'ดาวน์โหลดไม่สำเร็จ');}
  finally{setBusy(false);}
 }
 function backup(){
  if(busy || !connected)return;
  setBusy(true);setStatus('');
  if(paused)void download();
  else action('dmSessionControl',{command:'pause'},()=>void download(),error=>{if(error){setBusy(false);setStatus(error);}});
 }
 function control(command:string,payload:object={}) {
  if(busy || !connected)return;
  setBusy(true);setStatus('');
  action('dmSessionControl',{command,...payload},undefined,error=>{setBusy(false);if(error)setStatus(error);});
 }
 async function copy(id:string,token:string){try{await navigator.clipboard.writeText(token);setCopied(id);}catch{setStatus('คัดลอกอัตโนมัติไม่ได้ เปิดดูรหัสแล้วคัดลอกเอง');}}
 const active=investigators.filter(p=>!inactive.includes(p.id));
 const waiting=active.filter(p=>p.connected===false);
 return <section className="session-center" aria-label="เซฟและเล่นต่อ">
  <header className="section-heading"><div><p className="eyebrow">เซฟและเล่นต่อ</p><h3>{paused?'เตรียมทีมก่อนเล่นต่อ':'พร้อมพักเมื่อทีมต้องการ'}</h3></div><span className={'state-badge '+(paused?'':'success')}>{paused?'พักอยู่':'กำลังเล่น'}</span></header>
  <div className="session-primary"><div><strong>{paused?'บันทึกจุดนี้ไว้เล่นครั้งหน้า':'พักคดีและเก็บความคืบหน้า'}</strong><p>ดาวน์โหลดไฟล์ไว้กับ DM ครั้งหน้าถ้าห้องหาย ให้โหลดไฟล์นี้จากหน้าแรก</p></div><button className={paused?'':'primary'} disabled={!connected || busy} onClick={backup}>{busy?'กำลังดำเนินการ…':paused?'ดาวน์โหลดเซฟ':'พักและดาวน์โหลดเซฟ'}</button></div>
  <section className="session-attendance" aria-label="จัดทีมวันนี้"><div className="section-heading"><h4>ใครเล่นวันนี้?</h4><span>{active.length}/{investigators.length} คน</span></div><p className="note">{paused?'เลือก “พักวันนี้” ให้คนที่มาไม่ได้ ตัวละครและความคืบหน้ายังอยู่':'พักคดีก่อนเปลี่ยนรายชื่อทีม'}</p>
   <ul className="attendance-list">{investigators.map(p=><li key={p.id}><div><strong>{playerName(p.id)}</strong><span className={'state-badge '+(inactive.includes(p.id)?'':'success')}>{inactive.includes(p.id)?'พักตัวละคร':'เล่นวันนี้'}</span><span className="member-presence" data-online={p.connected===true}>{p.connected===true?'อยู่ในห้อง':p.connected===false?'ยังไม่กลับเข้าห้อง':'กำลังตรวจการเชื่อมต่อ'}</span></div><button type="button" aria-label={(inactive.includes(p.id)?'ให้กลับเข้าทีม: ':'พักวันนี้: ')+playerName(p.id)} disabled={!connected || !paused || busy} onClick={()=>control('attendance',{targetId:p.id,absent:!inactive.includes(p.id)})}>{inactive.includes(p.id)?'ให้กลับเข้าทีม':'พักวันนี้'}</button></li>)}</ul>
   {paused && <div className="resume-ready"><p role="status">{active.length<2?'เลือกผู้สืบสวนอย่างน้อย 2 คน':waiting.length?'รอ '+waiting.map(p=>playerName(p.id)).join(', ')+' กลับเข้าห้อง หรือเลือกให้พักวันนี้':'ทีมพร้อม เล่นต่อจากจุดเดิมได้'}</p><button className="primary" disabled={!connected || busy || active.length<2 || waiting.length>0} onClick={()=>control('resume')}>เปิดเล่นต่อ · {active.length} คน</button></div>}
   {!paused && <button type="button" disabled={!connected || busy} onClick={()=>control('pause')}>พักคดีชั่วคราว</button>}
  </section>
  <section className="session-recovery" aria-label="รหัสกลับเข้าของทีม"><h4>ส่งรหัสให้สมาชิกกลับเข้าตัวเดิม</h4><p className="note">ส่งให้แต่ละคนเฉพาะรหัสของเขา เมื่อเข้าด้วยเครื่องเดิม ใช้ปุ่ม “กลับเข้าเล่นต่อ” ได้</p>
   {investigators.map(p=>{const entry=codes.find(c=>c.id===p.id);return <div className="recovery-row" key={p.id}><strong>{playerName(p.id)}</strong><button type="button" disabled={!entry || !connected} onClick={()=>entry && void copy(p.id,entry.token)}>{copied===p.id?'คัดลอกแล้ว':'คัดลอกรหัสส่วนตัว'}</button>{entry && <details><summary>ดูรหัส</summary><input readOnly aria-label={'รหัสของ '+playerName(p.id)} value={entry.token} onFocus={e=>e.target.select()}/></details>}</div>;})}
   <details><summary>รหัสสำรองของ DM</summary>{codes.filter(c=>!investigators.some(p=>p.id===c.id)).map(c=><input key={c.token} aria-label="รหัสสำรองของ DM" readOnly value={c.token} onFocus={e=>e.target.select()}/>)}<p className="note">ห้ามส่งรหัส DM หรือไฟล์เซฟให้ผู้เล่น</p></details>
  </section>
  {status && <p className="inline-notice" role="status">{status}</p>}
  <details className="session-advanced"><summary>จัดการคำขอที่ค้าง</summary><p>ใช้เมื่อมีคำขอทอยค้างจนเปลี่ยนทีมไม่ได้ ผลทอยที่เกิดแล้วจะยังอยู่</p><button disabled={!connected || !paused || busy} onClick={()=>{if(window.confirm('ยกเลิกเฉพาะแผนและคำขอที่ยังไม่ได้ทอย? ผลทอยที่เกิดแล้วจะยังอยู่'))control('clearPending');}}>ยกเลิกคำขอที่ยังไม่ทอย</button></details>
 </section>;
}
