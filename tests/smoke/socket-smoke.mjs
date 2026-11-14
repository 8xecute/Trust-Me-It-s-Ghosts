import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { io } = require('socket.io-client');
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['packages/server/dist/index.js'],{env:{...process.env,PORT:'39117'},stdio:['ignore','pipe','pipe']});
const clients=[];
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('Server listening'))resolve();});server.on('exit',code=>reject(Error('server exit '+code)));setTimeout(()=>reject(Error('server startup timeout')),8000);});
 const connect=()=>new Promise((resolve,reject)=>{const s=io('http://localhost:39117',{timeout:4000,reconnection:false});clients.push(s);s.on('connect',()=>resolve(s));s.on('connect_error',reject);});
 const request=(s,event,...args)=>new Promise((resolve,reject)=>{s.timeout(3000).emit(event,...args,(err,result)=>err?reject(err):resolve(result));});
 const a=await connect(), b=await connect();
 const created=await request(a,'room:create');assert.equal(created.ok,true);
 const joined=await request(b,'room:join',created.room.code);assert.equal(joined.ok,true);assert.equal(Object.keys(joined.snapshot.players).length,2);
 const broadcast=new Promise((resolve,reject)=>{b.on('game:snapshot',function onSnapshot(v){if(v.players[created.playerId]?.y===6){b.off('game:snapshot',onSnapshot);resolve(v);}});setTimeout(()=>reject(Error('broadcast timeout')),3000);});
 const action={id:'test-move',type:'move',target:{x:4,y:6}};
 const committed=await request(a,'game:action',action);assert.equal(committed.ok,true);const snap=await broadcast;assert.deepEqual(snap.players[created.playerId],{x:4,y:6});
 const duplicate=await request(a,'game:action',action);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.snapshot.revision,committed.snapshot.revision);
 const invalid=await request(a,'game:action',{id:'bad',type:'move',target:{x:4,y:4}});assert.equal(invalid.ok,false);
 const current=await request(b,'game:snapshot');assert.deepEqual(current.snapshot.players[created.playerId],{x:4,y:6});
 console.log('PASS: two clients, room creation/join, authoritative broadcast, duplicate and invalid actions, snapshot request');
} finally {for(const c of clients)c.disconnect();server.kill();}
