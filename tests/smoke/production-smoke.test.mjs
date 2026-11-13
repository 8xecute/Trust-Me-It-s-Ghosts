import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { io } from 'socket.io-client';
import { readServerConfig } from '../../packages/server/dist/config.js';

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
    env:{...process.env,NODE_ENV:'production',CASE_STORY_VERSION:'4.1',PORT:String(port),CLIENT_ORIGIN:origin},
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
  const listing=once(v2b,'lobby:rooms');
  const v2 = await req(v2a,'room:create:v2');
  assert.deepEqual((await listing)[0].find(room=>room.code===v2.room.code),{code:v2.room.code,occupied:1,capacity:7});
  assert.equal(v2.room.version,2);
  assert.equal((await req(v2b,'room:join',v2.room.code)).ok,false);
  const joinedListing=once(v2b,'lobby:rooms');
  const v2join = await req(v2b,'room:join:v2',v2.room.code);
  assert.equal((await joinedListing)[0].find(room=>room.code===v2.room.code).occupied,2);
  assert.equal(v2join.room.version,2);
  const createdCharacter = await req(v2b,'game:action',{
    id:'character-smoke',type:'createCharacter',playerName:'  ทีมสำรวจ  ',profession:'occult_engineer',bonus:'knowledge',talent:'spirit_scanner',background:'technician',biography:{personal_secret:'owner-only'},
  });
  assert.equal(createdCharacter.snapshot.characters[v2join.playerId].coreStats.INT,3);
  assert.equal(createdCharacter.snapshot.characters[v2join.playerId].playerName,'ทีมสำรวจ');
  const v2detach = once(v2a,'room:update');
  v2b.disconnect();
  await v2detach;
  const v2c = connect('websocket');
  await once(v2c,'connect');
  const v2resume = await req(v2c,'room:resume',v2join.token);
  assert.equal(v2resume.room.version,2);
  assert.equal(v2resume.playerId,v2join.playerId);
  assert.equal(v2resume.snapshot.characters[v2join.playerId].profession,'occult_engineer');
  assert.equal(v2resume.snapshot.characters[v2join.playerId].talent,undefined);
  assert.equal(v2resume.snapshot.characters[v2join.playerId].background,undefined);
  assert.equal(JSON.stringify(v2resume.snapshot).includes('owner-only'),false);
  assert.equal(JSON.stringify((await req(v2a,'game:snapshot')).snapshot).includes('owner-only'),false);
  assert.deepEqual((await req(v2a,'character:biography')).biography,{});
  const presetBio=(await req(v2c,'character:biography')).biography;
  assert.ok(presetBio.background_story);
  assert.equal(presetBio.personal_secret,undefined);
  assert.equal((await req(v2a,'game:action',{id:'profile',type:'createCharacter',profession:'medium',bonus:'body'})).ok,true);
  const v2dm=connect('websocket');
  await once(v2dm,'connect');
  assert.equal((await req(v2dm,'room:join:v2',v2.room.code)).ok,true);
  assert.equal((await req(v2dm,'game:action',{id:'role',type:'claimDm'})).ok,true);
  assert.equal((await req(v2a,'game:action',{id:'no-grid',type:'move',target:{x:4,y:6}})).ok,false);
  const prep=await req(v2dm,'dm:panel');
  const beatIds=prep.panel.guide.flatMap(chapter=>chapter.beats.map(beat=>beat.id));
  assert.equal(new Set(beatIds).size,beatIds.length);
  assert.ok(prep.panel.guide.find(chapter=>chapter.id==='FINAL').beats.some(beat=>beat.id==='F6' && beat.read.length));
  assert.equal((await req(v2a,'dm:panel')).ok,false);
  assert.equal('guide' in (await req(v2a,'game:snapshot')).snapshot,false);
  const startedListing=new Promise(resolve=>{
    const receive=rooms=>{
      if(rooms.some(room=>room.code===v2.room.code)) return;
      v2c.off('lobby:rooms',receive);
      resolve(rooms);
    };
    v2c.on('lobby:rooms',receive);
  });
  const started = await req(v2dm,'game:action',{id:'case',type:'caseStart'});
  assert.equal((await startedListing).some(room=>room.code===v2.room.code),false);
  assert.equal(started.ok,true);
  assert.equal(started.snapshot.sceneMode,true);
  assert.equal((await req(v2a,'dm:panel')).ok,false);
  const casePanel=await req(v2dm,'dm:panel');
  assert.equal(casePanel.panel.caseMode,true);
  const briefing=casePanel.panel.narration.find(beat=>beat.eventId==='briefing');
  assert.ok(briefing);
  const before=(await req(v2a,'game:snapshot')).snapshot;
  assert.equal(JSON.stringify(before).includes(briefing.text),false);
  assert.equal((await req(v2a,'game:action',{id:'publish',type:'dmPublish',cardId:briefing.id})).ok,false);
  assert.equal((await req(v2dm,'game:action',{id:'publish',type:'dmPublish',cardId:briefing.id})).ok,true);
  const asked=await req(v2a,'game:action',{id:'arrival',type:'askGm',text:'เกิดอะไรขึ้นที่หมู่บ้าน',site:'A'});
  assert.equal(asked.ok,true);
  assert.equal(asked.snapshot.case001.time,before.case001.time);
  const panel=(await req(v2dm,'dm:panel')).panel;
  const question=panel.questions[0];
  const answer=panel.investigators.find(player=>player.id===v2.playerId).choices.find(choice=>choice.id==='talk:arrival').answer;
  assert.match(answer,/ประเสริฐ/);
  assert.equal(JSON.stringify((await req(v2c,'game:snapshot')).snapshot).includes(answer),false);
  assert.equal((await req(v2dm,'game:action',{id:'answer',type:'dmAnswer',cardId:question.id,actionId:'talk:arrival'})).ok,true);
  assert.equal((await req(v2c,'game:snapshot')).snapshot.narrative.current.text,answer);
  assert.equal(JSON.stringify((await req(v2a,'game:snapshot')).snapshot).includes(casePanel.panel.investigators[0].secret),false);
  assert.equal((await req(v2dm,'game:action',{id:'roll-card',type:'dmRequestRoll',targetId:v2.playerId})).ok,true);
  const card=(await req(v2a,'game:snapshot')).snapshot.diceRequest;
  assert.equal(card.die,null);
  assert.equal((await req(v2c,'game:snapshot')).snapshot.diceRequest,null);
  assert.equal((await req(v2c,'game:action',{id:'wrong-roll',type:'dmRoll',requestId:card.id})).ok,false);
  const rolled=await req(v2a,'game:action',{id:'roll',type:'dmRoll',requestId:card.id});
  assert.ok(rolled.snapshot.diceRequest.die>=1 && rolled.snapshot.diceRequest.die<=20);
  assert.deepEqual((await req(v2dm,'game:snapshot')).snapshot.dmLog.map(entry=>entry.kind),
    ['narration','question','answer','roll-requested','roll-result']);
  const watched=new Promise(resolve=>{
    v2c.on('game:snapshot',function observe(snapshot){
      if(snapshot.caseMap?.site==='B'){v2c.off('game:snapshot',observe);resolve(snapshot);}
    });
  });
  assert.equal((await req(v2a,'game:action',{id:'travel-b',type:'caseAction',actionId:'travel:B',site:'A'})).ok,false);
  const traveled=await req(v2dm,'game:action',{id:'travel-b',type:'dmTravel',actionId:'travel:B',site:'A'});
  assert.equal(traveled.snapshot.caseMap.site,'B');
  const otherLocation=await watched;
  assert.equal(otherLocation.caseMap.site,'B');
  assert.deepEqual(Object.keys(otherLocation.players).sort(),[v2.playerId,v2join.playerId].sort());
  const membership=once(v2a,'room:update');
  assert.equal((await req(v2dm,'room:leave')).ok,true);
  assert.equal((await membership)[0].players.length,2);
  assert.equal((await req(v2a,'game:snapshot')).snapshot.humanDmId,null);
  assert.equal((await req(v2dm,'game:snapshot')).ok,false);
  assert.equal((await req(v2a,'game:action',{id:'take-over',type:'claimDm'})).ok,true);
  assert.equal((await req(v2c,'room:leave')).ok,true);
  assert.equal((await req(v2c,'room:resume',v2join.token)).ok,false);
  assert.equal((await req(v2c,'room:create:v2')).ok,true);

});
