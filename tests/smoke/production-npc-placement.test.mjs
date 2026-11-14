import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';

test('DM scene staging syncs to two players, protects hidden figures and survives a server restart',{timeout:25000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'ghosts-scene-'));
 const reservation=createServer().listen(0,'127.0.0.1');await once(reservation,'listening');
 const {port}=reservation.address();await new Promise(resolve=>reservation.close(resolve));
 const origin='https://game.example';let server;const clients=[];
 t.after(async()=>{
  clients.forEach(client=>client.disconnect());
  if(server?.exitCode===null){server.kill();await once(server,'exit');}
  if(dirname(resolve(directory))!==resolve(tmpdir()) || !basename(directory).startsWith('ghosts-scene-'))throw Error('Unexpected test save directory');
  await rm(directory,{recursive:true,force:true});
 });
 const boot=async()=>{
  server=spawn(process.execPath,['packages/server/dist/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'production',CLIENT_ORIGIN:origin,CASE_STORY_VERSION:'5.5',CASE_SAVE_DIR:directory},stdio:['ignore','pipe','inherit']});
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server exited');})]);
 };
 const connect=async()=>{
  const client=io('http://127.0.0.1:'+port,{transports:['websocket'],reconnection:false,extraHeaders:{Origin:origin}});
  clients.push(client);client.on('game:snapshot',snapshot=>{client.latest=snapshot;});
  await Promise.race([once(client,'connect'),once(client,'connect_error').then(([error])=>{throw error;})]);return client;
 };
 const req=(client,event,...args)=>client.timeout(3000).emitWithAck(event,...args);let sequence=0;
 const action=(client,type,body={})=>req(client,'game:action',{id:'scene-'+(++sequence),type,...body});
 const synced=async(client,revision)=>{
  for(let attempt=0;attempt<100;attempt++){
   if(client.latest?.revision>=revision)return client.latest;
   await delay(10);
  }
  throw Error('Snapshot broadcast timed out');
 };
 await boot();t.diagnostic('server ready');let dm=await connect(),a=await connect(),b=await connect();t.diagnostic('three clients connected');
 const created=await req(dm,'room:create:v2');assert.equal(created.ok,true,created.error);
 const joined=await Promise.all([a,b].map(client=>req(client,'room:join:v2',created.room.code)));
 assert.ok(joined.every(reply=>reply.ok));
 assert.equal((await action(dm,'claimDm')).ok,true);
 assert.equal((await action(a,'createCharacter',{profession:'medium'})).ok,true);
 assert.equal((await action(b,'createCharacter',{profession:'field_medic'})).ok,true);
 assert.equal((await action(dm,'caseStart',{mode:'story'})).ok,true);
 const before=(await req(a,'game:snapshot')).snapshot;t.diagnostic('case started');
 const placed={site:'A',npcId:'kaewFinal',position:{x:50,y:80,scale:1.2,hidden:true}};
 assert.equal((await action(a,'dmPlaceNpc',placed)).ok,false);
 let reply=await action(dm,'dmPlaceNpc',placed);assert.equal(reply.ok,true,reply.error);
 assert.equal(reply.snapshot.caseMap.npcs[0].id,'kaewFinal');
 for(const client of [a,b]){
  const snapshot=await synced(client,reply.snapshot.revision);assert.deepEqual(snapshot.caseMap.npcs,[]);
  assert.deepEqual(snapshot.case001,before.case001);assert.deepEqual(snapshot.turns,before.turns);
  assert.equal(JSON.stringify(snapshot).includes('kaewFinal'),false);
 }
 assert.equal((await req(a,'dm:panel')).ok,false);
 assert.equal((await req(a,'dm:preview',joined[1].playerId)).ok,false);
 const preview=await req(dm,'dm:preview',joined[0].playerId);assert.deepEqual(preview.preview.caseMap.npcs,[]);
 placed.position={x:64,y:86,scale:1.35,hidden:false};
 reply=await action(dm,'dmPlaceNpc',placed);assert.equal(reply.ok,true,reply.error);
 for(const client of [a,b])assert.deepEqual((await synced(client,reply.snapshot.revision)).caseMap.npcs,[{id:'kaewFinal',...placed.position}]);
 placed.position.hidden=true;reply=await action(dm,'dmPlaceNpc',placed);
 for(const client of [a,b])assert.deepEqual((await synced(client,reply.snapshot.revision)).caseMap.npcs,[]);
 t.diagnostic('staging and two-player sync passed');const exited=once(server,'exit');server.kill();await exited;[dm,a,b].forEach(client=>client.disconnect());
 await boot();t.diagnostic('server restarted');[dm,a,b]=await Promise.all([connect(),connect(),connect()]);
 const resumed=await Promise.all([dm,a,b].map((client,i)=>req(client,'room:resume',[created,...joined][i].token)));
 assert.ok(resumed.every(result=>result.ok));assert.equal(resumed[0].snapshot.paused,true);
 assert.deepEqual(resumed[0].snapshot.caseMap.npcs,[{id:'kaewFinal',...placed.position}]);
 for(const result of resumed.slice(1))assert.deepEqual(result.snapshot.caseMap.npcs,[]);
 assert.equal((await action(dm,'dmSessionControl',{command:'resume'})).ok,true);
 placed.position.hidden=false;reply=await action(dm,'dmPlaceNpc',placed);
 for(const client of [a,b])assert.deepEqual((await synced(client,reply.snapshot.revision)).caseMap.npcs,[{id:'kaewFinal',...placed.position}]);
 reply=await action(dm,'dmPlaceNpc',{...placed,position:null});assert.equal(reply.ok,true);
 for(const client of [dm,a,b])assert.deepEqual((await synced(client,reply.snapshot.revision)).caseMap.npcs,[]);
});
