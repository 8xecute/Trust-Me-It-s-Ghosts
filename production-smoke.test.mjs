import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { io } from 'socket.io-client';
import { readServerConfig } from './packages/server/dist/config.js';

test('production configuration fails fast for missing or invalid values', () => {
  assert.throws(() => readServerConfig({NODE_ENV:'production'}), /CLIENT_ORIGIN/);
  assert.throws(() => readServerConfig({PORT:'65536'}), /PORT/);
  assert.throws(() => readServerConfig({NODE_ENV:'production', CLIENT_ORIGIN:'http://localhost:5173'}), /HTTPS/);
  assert.throws(() => readServerConfig({CLIENT_ORIGIN:'https://example.com/path'}), /bare origin/);
});

test('production room lifecycle over polling and WebSocket', {timeout:20000}, async t => {
  const reservation = createServer().listen(0,'127.0.0.1');
  await once(reservation,'listening');
  const {port} = reservation.address();
  await new Promise((resolve,reject) => reservation.close(err => err ? reject(err) : resolve()));
  const origin = 'https://game.example';
  const url = 'http://127.0.0.1:'+port;
  const server = spawn(process.execPath,['packages/server/dist/index.js'],{
    env:{...process.env,NODE_ENV:'production',PORT:String(port),CLIENT_ORIGIN:origin},
    stdio:['ignore','pipe','inherit'],
  });
  t.after(() => server.kill());
  await Promise.race([
    once(server.stdout,'data'),
    once(server,'exit').then(([code]) => {throw Error('Server exited: '+code);}),
  ]);
  assert.deepEqual(await (await fetch(url+'/healthz')).json(),{ok:true});
  const handshake = url+'/socket.io/?EIO=4&transport=polling';
  const allowed = await fetch(handshake,{headers:{Origin:origin}});
  assert.equal(allowed.status,200);
  assert.equal(allowed.headers.get('access-control-allow-origin'),origin);
  await allowed.text();
  const denied = await fetch(handshake,{headers:{Origin:'https://other.example'}});
  assert.equal(denied.status,403);
  await denied.text();
  const connect = (transport, from=origin) => {
    const client = io(url,{transports:[transport],reconnection:false,timeout:3000,extraHeaders:{Origin:from}});
    t.after(() => client.disconnect());
    return client;
  };
  const blocked = connect('websocket','https://other.example');
  await once(blocked,'connect_error');
  const a = connect('polling'), b = connect('websocket');
  await Promise.all([once(a,'connect'),once(b,'connect')]);
  const req = (client,event,...args) => client.timeout(3000).emitWithAck(event,...args);
  assert.equal((await req(b,'game:snapshot')).ok,false);
  const created = await req(a,'room:create');
  assert.equal(created.ok,true);
  const joined = await req(b,'room:join',created.room.code);
  assert.equal(joined.room.players.length,2);
  assert.equal((await req(a,'room:ready',true)).ok,true);
  assert.equal((await req(b,'room:ready',true)).ok,true);
  const moved = {id:'move-smoke',type:'move',target:{x:4,y:6}};
  const update = once(b,'game:snapshot');
  const applied = await req(a,'game:action',moved);
  assert.equal(applied.ok,true);
  assert.deepEqual((await update)[0].players[created.playerId],moved.target);
  assert.equal((await req(a,'game:action',moved)).duplicate,true);
  const detached = once(a,'room:update');
  b.disconnect();
  await detached;
  const c = connect('websocket');
  await once(c,'connect');
  const resumed = await req(c,'room:resume',joined.token);
  assert.equal(resumed.playerId,joined.playerId);
  assert.deepEqual(resumed.snapshot.players[created.playerId],moved.target);
  assert.equal((await req(a,'dm:panel')).ok,false);
  const v2a = connect('polling'), v2b = connect('websocket');
  await Promise.all([once(v2a,'connect'),once(v2b,'connect')]);
  const v2 = await req(v2a,'room:create:v2');
  assert.equal(v2.room.version,2);
  assert.equal((await req(v2b,'room:join',v2.room.code)).ok,false);
  const v2join = await req(v2b,'room:join:v2',v2.room.code);
  assert.equal(v2join.room.version,2);
  const createdCharacter = await req(v2b,'game:action',{
    id:'character-smoke',type:'createCharacter',profession:'occult_engineer',bonus:'knowledge',talent:'spirit_scanner',background:'technician',biography:{personal_secret:'owner-only'},
  });
  assert.equal(createdCharacter.snapshot.characters[v2join.playerId].stats.knowledge,4);
  const v2detach = once(v2a,'room:update');
  v2b.disconnect();
  await v2detach;
  const v2c = connect('websocket');
  await once(v2c,'connect');
  const v2resume = await req(v2c,'room:resume',v2join.token);
  assert.equal(v2resume.room.version,2);
  assert.equal(v2resume.playerId,v2join.playerId);
  assert.equal(v2resume.snapshot.characters[v2join.playerId].profession,'occult_engineer');
  assert.equal(v2resume.snapshot.characters[v2join.playerId].talent,'spirit_scanner');
  assert.equal(v2resume.snapshot.characters[v2join.playerId].background,'technician');
  assert.equal(JSON.stringify(v2resume.snapshot).includes('owner-only'),false);
  assert.equal(JSON.stringify((await req(v2a,'game:snapshot')).snapshot).includes('owner-only'),false);
  assert.deepEqual((await req(v2a,'character:biography')).biography,{});
  assert.deepEqual((await req(v2c,'character:biography')).biography,{personal_secret:'owner-only'});
  assert.equal((await req(v2a,'game:action',{id:'profile',type:'createCharacter',profession:'medium',bonus:'body'})).ok,true);
  const v2dm=connect('websocket');
  await once(v2dm,'connect');
  assert.equal((await req(v2dm,'room:join:v2',v2.room.code)).ok,true);
  assert.equal((await req(v2dm,'game:action',{id:'role',type:'claimDm'})).ok,true);
  assert.equal((await req(v2a,'game:action',{id:'case',type:'caseStart'})).ok,true);
  assert.equal((await req(v2a,'dm:panel')).ok,false);
  const casePanel=await req(v2dm,'dm:panel');
  assert.equal(casePanel.panel.caseMode,true);
  const current=await req(v2dm,'game:action',{id:'arrival',type:'caseDm',targetId:v2.playerId,actionId:'talk:arrival'});
  assert.equal(current.ok,true);
  assert.match(current.snapshot.case001.notice,/ประเสริฐ/);
  assert.equal(JSON.stringify((await req(v2a,'game:snapshot')).snapshot).includes(casePanel.panel.investigators[0].secret),false);
  const watched=new Promise(resolve=>{
    v2c.on('game:snapshot',function observe(snapshot){
      if(Object.keys(snapshot.players).length===1){v2c.off('game:snapshot',observe);resolve(snapshot);}
    });
  });
  const traveled=await req(v2a,'game:action',{id:'travel-b',type:'caseAction',actionId:'travel:B'});
  assert.equal(traveled.snapshot.caseMap.site,'B');
  const otherLocation=await watched;
  assert.equal(otherLocation.caseMap.site,'A');
  assert.deepEqual(Object.keys(otherLocation.players),[v2join.playerId]);
});
