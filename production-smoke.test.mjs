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
});
