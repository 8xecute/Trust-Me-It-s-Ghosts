import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Rooms } from './rooms.js';
import type { WorldStore } from './world.js';

type SavedRoom = {
 version:1;
 membership:ReturnType<Rooms['checkpoint']>;
 state:ReturnType<WorldStore['checkpoint']>;
};

export function openRoomSaves(directory:string,rooms:Rooms,worlds:WorldStore) {
 mkdirSync(directory,{recursive:true,mode:0o700});
 for(const file of readdirSync(directory)) {
  if(!/^[A-F0-9]{6}\.json$/.test(file)) continue;
  const save:SavedRoom=JSON.parse(readFileSync(join(directory,file),'utf8'));
  if(save.version!==1 || save.membership.room.code+'.json'!==file) throw Error('ข้อมูลห้องบันทึกไม่ถูกต้อง: '+file);
  rooms.restore(save.membership);
  worlds.restore(save.membership.room.code,save.state);
 }
 const saveRoom=(code:string)=>{
  const save:SavedRoom={version:1,membership:rooms.checkpoint(code),state:worlds.checkpoint(code)};
  const path=join(directory,code+'.json');
  writeFileSync(path+'.tmp',JSON.stringify(save),{encoding:'utf8',mode:0o600});
  renameSync(path+'.tmp',path);
 };
 return Object.assign(saveRoom,{close(code:string){
  const path=join(directory,code+'.json');
  if(existsSync(path)) renameSync(path,join(directory,code+'.'+Date.now()+'.closed'));
 }});
}
