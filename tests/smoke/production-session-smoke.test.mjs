import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {Rooms} from '../../packages/server/dist/rooms.js';
import {WorldStore} from '../../packages/server/dist/world.js';
import {exportSession} from '../../packages/server/dist/portableSession.js';

test('portable file restores six members over Socket.IO and DM selects four for the next session',{timeout:20000},async t=>{
 const rooms=new Rooms(),worlds=new WorldStore(()=>20,true,true,true,false,'5.1');
 const {code}=rooms.create('old-dm',2),dm=rooms.playerId('old-dm');rooms.token('old-dm');
 worlds.create(code,2);worlds.addPlayer(code,dm);worlds.apply(code,dm,{id:'claim',type:'claimDm'});
 const roles=['medium','field_medic','occult_engineer','ritual_specialist','containment_specialist','paranormal_investigator'];
 const ids=roles.map((profession,i)=>{rooms.join('p'+i,code,2);const id=rooms.playerId('p'+i);rooms.token('p'+i);worlds.addPlayer(code,id);worlds.apply(code,id,{id:'character',type:'createCharacter',profession});return id;});
 worlds.apply(code,dm,{id:'start',type:'caseStart',mode:'story'});worlds.apply(code,dm,{id:'pause',type:'dmSessionControl',command:'pause'});
 const file=JSON.parse(JSON.stringify(exportSession(rooms,worlds,code,dm)));
 file.state.world.case001.notice='ท'.repeat(370000); // Exercise a multibyte save above the old 1 MB transport envelope once metadata is included.
 assert.ok(Buffer.byteLength(JSON.stringify(file),'utf8')>1_048_576);
 const reservation=createServer().listen(0,'127.0.0.1');await once(reservation,'listening');const {port}=reservation.address();await new Promise(resolve=>reservation.close(resolve));
 const origin='https://game.example';
 const server=spawn(process.execPath,['packages/server/dist/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'production',CLIENT_ORIGIN:origin,CASE_SAVE_DIR:''},stdio:['ignore','pipe','inherit']});t.after(()=>server.kill());
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server exited');})]);
 const clients=Array.from({length:5},()=>io('http://127.0.0.1:'+port,{transports:['websocket'],reconnection:false,extraHeaders:{Origin:origin}}));
 t.after(()=>clients.forEach(c=>c.disconnect()));await Promise.all(clients.map(c=>once(c,'connect')));
 const req=(c,event,...args)=>c.timeout(3000).emitWithAck(event,...args);let n=0;
 const act=(command,rest={})=>req(clients[0],'game:action',{id:String(++n),type:'dmSessionControl',command,...rest});
 const restored=await req(clients[0],'session:import',file);assert.equal(restored.ok,true,restored.error);assert.equal(restored.playerId,dm);assert.equal(restored.snapshot.paused,true);
 assert.equal((await act('resume')).ok,false);
 for(let i=0;i<4;i++){const token=file.membership.tokens.find(([,s])=>s.id===ids[i])[0];const r=await req(clients[i+1],'room:resume',token);assert.equal(r.playerId,ids[i]);assert.equal(r.snapshot.characters[ids[i]].profession,roles[i]);}
 assert.equal((await req(clients[1],'session:export')).ok,false);
 for(const id of ids.slice(4))assert.equal((await act('attendance',{targetId:id,absent:true})).ok,true);
 const backup=await req(clients[0],'session:export');assert.equal(backup.ok,true);assert.equal(backup.save.membership.room.players.length,7);
 assert.deepEqual(backup.save.state.world.inactivePlayers,ids.slice(4));
 assert.equal((await act('resume')).ok,true);
 const result=(await req(clients[1],'game:snapshot')).snapshot;assert.equal(result.paused,undefined);assert.equal(result.case001.time,'23:00');
 assert.equal(Object.keys(result.characters).length,6);
 for(const forbidden of ['membership','tokens','personal_secret'])assert.ok(!JSON.stringify(result).includes(forbidden));
});
