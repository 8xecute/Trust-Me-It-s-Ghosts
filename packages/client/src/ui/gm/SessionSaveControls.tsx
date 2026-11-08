import {useState} from 'react';
import type {Socket} from 'socket.io-client';

export function SessionSaveControls({socket,paused,playerName}:{socket:Socket|null;paused:boolean;playerName:(id:string)=>string}) {
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const [codes,setCodes]=useState<{id:string;token:string}[]>([]);
 async function download() {
  if(!socket?.connected || busy)return;
  setBusy(true);setStatus('');
  try {
   const reply=await socket.timeout(10000).emitWithAck('session:export');
   if(!reply.ok)throw Error(reply.error);
   const save=reply.save;
   const url=URL.createObjectURL(new Blob([JSON.stringify(save)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='case-'+save.membership.room.code+'-'+new Date().toISOString().replaceAll(':','-')+'.json';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setCodes(save.membership.tokens.map(([token,s]:[string,{id:string}])=>({token,id:s.id})));
   setStatus('ส่งไฟล์ให้เบราว์เซอร์แล้ว ตรวจว่าไฟล์ดาวน์โหลดสำเร็จก่อนปิดเกม');
  } catch(error){setStatus(error instanceof Error?error.message:'ดาวน์โหลดไม่สำเร็จ');}
  finally{setBusy(false);}
 }
 return <section aria-label="สำรองคดี"><button disabled={!paused || !socket?.connected || busy} onClick={download}>ดาวน์โหลดเซฟสำหรับเล่นครั้งหน้า</button>
  <p>พักคดีก่อนดาวน์โหลด ไฟล์มีความลับ DM และสิทธิ์กลับเข้าของทุกคน เก็บไว้กับ DM ส่งให้ผู้เล่นเฉพาะรหัสส่วนตัว</p>
  <p role="status">{status}</p>
  {!!codes.length && <details><summary>รหัสกลับเข้ารายคน · เฉพาะ DM</summary>{codes.map((c,i)=><div key={i}><strong>{playerName(c.id)}</strong><input readOnly aria-label={'รหัสของ '+playerName(c.id)} value={c.token}/></div>)}</details>}
 </section>;
}
