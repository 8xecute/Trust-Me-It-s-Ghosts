import {Rooms} from './rooms.js';
import {WorldStore} from './world.js';

export function exportSession(rooms:Rooms,worlds:WorldStore,code:string,player:string) {
 const state=worlds.checkpoint(code);
 if(state.world.humanDmId!==player || !state.world.paused || !state.world.case001 || state.world.case001.report)throw Error('เฉพาะ DM ขณะพักคดีที่ยังไม่ปิด');
 const save={format:'baan-session',version:1,membership:rooms.checkpoint(code),state};
 if(Buffer.byteLength(JSON.stringify(save),'utf8')>8_000_000)throw Error('ไฟล์เซฟเกินขนาด 8 MB');
 return save;
}
export function importSession(rooms:Rooms,worlds:WorldStore,input:unknown) {
 if(!input || typeof input!=='object' || Buffer.byteLength(JSON.stringify(input),'utf8')>8_000_000)throw Error('ไฟล์เซฟไม่ถูกต้องหรือใหญ่เกินกำหนด');
 const data=input as ReturnType<typeof exportSession>;
 if(data.format!=='baan-session' || data.version!==1 || !data.membership || !data.state)throw Error('รุ่นไฟล์เซฟไม่รองรับ');
 const code=data.membership.room.code,world=data.state.world;
 if(!/^[A-F0-9]{6}$/.test(code) || rooms.has(code) || !world.humanDmId || !world.dmSession || world.case001?.report ||
  data.membership.room.players.length>7 || !data.membership.room.players.some(p=>p.id===world.humanDmId) ||
  data.membership.room.players.map(p=>p.id).sort().join()!==Object.keys(world.players).sort().join())throw Error('ห้องนี้ยังเปิดอยู่หรือข้อมูลสมาชิกไม่ตรงกัน');
 const inactive=world.inactivePlayers ?? [];
 if(!Array.isArray(inactive) || new Set(inactive).size!==inactive.length || inactive.some(id=>typeof id!=='string' || id===world.humanDmId || !world.players[id] || !world.characters?.[id]) ||
  data.membership.room.players.some(p=>!data.membership.tokens.some(([,session])=>session.id===p.id)))throw Error('รายชื่อคนพักหรือสิทธิ์กลับเข้าของสมาชิกไม่ครบ');
 const token=data.membership.tokens.find(([,s])=>s.id===world.humanDmId)?.[0];
 if(!token)throw Error('ไม่มีสิทธิ์กลับเข้าของ DM');
 // Validate both halves in isolation before publishing either into live stores.
 const trialRooms=new Rooms(),trialWorlds=new WorldStore();
 trialRooms.restore(structuredClone(data.membership));trialWorlds.restore(code,structuredClone(data.state));
 for(const p of data.membership.room.players)trialWorlds.snapshot(code,p.id);
 trialWorlds.dmPanel(code,world.humanDmId);
 rooms.restore(structuredClone(data.membership));worlds.restore(code,structuredClone(data.state));worlds.prepareSession(code);
 return {code,token};
}
