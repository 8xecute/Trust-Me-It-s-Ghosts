import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rooms } from './rooms.js';
import { WorldStore } from './world.js';

type SavedRoom = {
 version:1;
 membership:ReturnType<Rooms['checkpoint']>;
 state:ReturnType<WorldStore['checkpoint']>;
};

export function openRoomSaves(directory:string,rooms:Rooms,worlds:WorldStore,onLoadError:(file:string,error:unknown)=>void=(file,error)=>console.error('Unable to restore saved room '+file,error)) {
 mkdirSync(directory,{recursive:true,mode:0o700});
 for(const file of readdirSync(directory)) {
  if(!/^[A-F0-9]{6}\.json$/.test(file)) continue;
  try {
   const save:SavedRoom=JSON.parse(readFileSync(join(directory,file),'utf8'));
   if(save.version!==1 || save.membership.room.code+'.json'!==file) throw Error('ข้อมูลห้องบันทึกไม่ถูกต้อง: '+file);
   // Validate both halves before publishing either into the live stores.
   const trialRooms=new Rooms(),trialWorlds=new WorldStore();
   trialRooms.restore(structuredClone(save.membership));
   trialWorlds.restore(save.membership.room.code,structuredClone(save.state));
   trialWorlds.prepareSession(save.membership.room.code);
   rooms.restore(save.membership);
   worlds.restore(save.membership.room.code,save.state);
   worlds.prepareSession(save.membership.room.code);
  } catch(error) {
   onLoadError(file,error);
   // Keep the original bytes for recovery and omit this file on the next boot.
   try {renameSync(join(directory,file),join(directory,file+'.invalid-'+Date.now()));}
   catch(renameError) {onLoadError(file,renameError);}
  }
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
