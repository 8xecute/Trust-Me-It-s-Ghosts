import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {io} from 'socket.io-client';

test('DM receives an autosave failure warning and recovery clears it',{timeout:20000},async t=>{
 const directory=mkdtempSync(join(tmpdir(),'trpg-autosave-status-'));
 const listener=createServer().listen(0,'127.0.0.1');await once(listener,'listening');const {port}=listener.address();await new Promise(resolve=>listener.close(resolve));
 const server=spawn(process.execPath,['packages/server/dist/index.js'],{env:{...process.env,PORT:String(port),CASE_SAVE_DIR:directory,CASE_STORY_VERSION:'5.5'},stdio:['ignore','pipe','ignore']});
 const clients=[];
 t.after(async()=>{for(const client of clients)client.disconnect();const exited=once(server,'exit');server.kill();await exited;assert.ok(resolve(directory).startsWith(resolve(tmpdir())));rmSync(directory,{recursive:true,force:true});});
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server startup failed');})]);
 const connect=async()=>{const client=io('http://127.0.0.1:'+port,{transports:['websocket'],reconnection:false});clients.push(client);await Promise.race([once(client,'connect'),once(client,'connect_error').then(([e])=>{throw e;})]);return client;};
 const [dm,a,b]=await Promise.all([connect(),connect(),connect()]);
 const req=(client,event,...args)=>client.timeout(4000).emitWithAck(event,...args);let serial=0;
 const act=(client,type,body={})=>req(client,'game:action',{id:'save-status-'+(++serial),type,...body});
 const saveStatus=predicate=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{dm.off('session:save-status',receive);reject(Error('autosave status timeout'));},4000);
  const receive=status=>{if(!predicate(status))return;clearTimeout(timer);dm.off('session:save-status',receive);resolve(status);};
  dm.on('session:save-status',receive);
 });
 const created=await req(dm,'room:create:v2');assert.equal(created.ok,true);
 for(const client of [a,b])assert.equal((await req(client,'room:join:v2',created.room.code)).ok,true);
 assert.equal((await act(dm,'claimDm')).ok,true);
 for(const [client,profession] of [[a,'medium'],[b,'field_medic']])assert.equal((await act(client,'createCharacter',{profession})).ok,true);
 assert.equal((await act(dm,'caseStart',{mode:'story'})).ok,true);
 // Replace only this test's own saved file with a directory to force rename failure.
 const target=join(directory,created.room.code+'.json');assert.ok(resolve(target).startsWith(resolve(directory)));
 rmSync(target);mkdirSync(target);
 const warning=saveStatus(status=>typeof status.error==='string');
 const failed=await act(dm,'dmNarrate',{text:'ตรวจสถานะสำรอง'});assert.equal(failed.ok,true);assert.equal(failed.persistent,false);
 assert.match((await warning).error,/สำรองอัตโนมัติไม่สำเร็จ/);
 rmSync(target,{recursive:true});
 const recovered=saveStatus(status=>status.error===null);
 assert.equal((await act(dm,'dmNarrate',{text:'สำรองได้อีกครั้ง'})).persistent,true);
 assert.equal((await recovered).error,null);
});
