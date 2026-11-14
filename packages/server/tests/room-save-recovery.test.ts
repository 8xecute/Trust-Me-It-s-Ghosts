import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Rooms} from '../src/rooms.js';
import {WorldStore} from '../src/world.js';
import {openRoomSaves} from '../src/roomSaves.js';

test('one malformed room is quarantined without preventing valid rooms from resuming',t=>{
 const directory=mkdtempSync(join(tmpdir(),'trpg-save-recovery-'));
 t.after(()=>{assert.ok(resolve(directory).startsWith(resolve(tmpdir())));rmSync(directory,{recursive:true,force:true});});
 const rooms=new Rooms(),worlds=new WorldStore(()=>20,true,true,true,false,'5.5');
 const room=rooms.create('dm',2),code=room.code,dm=rooms.playerId('dm')!;rooms.token('dm');worlds.create(code,2);worlds.addPlayer(code,dm);worlds.apply(code,dm,{id:'claim',type:'claimDm'});
 for(const [id,profession] of [['a','medium'],['b','field_medic']]){rooms.join(id,code,2);rooms.token(id);const player=rooms.playerId(id)!;worlds.addPlayer(code,player);worlds.apply(code,player,{id:'role',type:'createCharacter',profession});}
 worlds.apply(code,dm,{id:'start',type:'caseStart',mode:'story'});
 openRoomSaves(directory,rooms,worlds)(code);
 const badCode=code==='ABCDEF'?'123456':'ABCDEF';
 const invalid=JSON.parse(readFileSync(join(directory,code+'.json'),'utf8'));
 invalid.membership.room.code=badCode;for(const [,session] of invalid.membership.tokens)session.code=badCode;
 delete invalid.state.world.case001.v51.KAEW_D_RESULT;
 writeFileSync(join(directory,badCode+'.json'),JSON.stringify(invalid));
 const truncatedCode=[code,badCode].includes('000000')?'111111':'000000';
 writeFileSync(join(directory,truncatedCode+'.json'),'{"version":1,');
 const restoredRooms=new Rooms(),restored=new WorldStore(),errors:string[]=[];
 assert.doesNotThrow(()=>openRoomSaves(directory,restoredRooms,restored,file=>errors.push(file)));
 assert.equal(restoredRooms.has(code),true);assert.equal(restored.snapshot(code,dm).paused,true);
 assert.equal(restoredRooms.has(badCode),false);assert.equal(restored.hasStarted(badCode),false);
 assert.equal(restoredRooms.has(truncatedCode),false);
 assert.equal(errors.length,2);
 const quarantine=readdirSync(directory).filter(file=>file.includes('.invalid-'));assert.equal(quarantine.length,2);
 assert.equal(readFileSync(join(directory,quarantine.find(f=>f.startsWith(truncatedCode))!),'utf8'),'{"version":1,');
 const again=new WorldStore();assert.doesNotThrow(()=>openRoomSaves(directory,new Rooms(),again,()=>{throw Error('quarantine should not be retried');}));
 assert.equal(again.hasStarted(code),true);
});
