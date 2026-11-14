import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rooms, canStart } from '../src/rooms.js';
test('room capacity, readiness and disconnect',()=>{ const r=new Rooms(); const a=r.create('a'); assert.match(a.code,/^[A-F0-9]{6}$/); assert.equal(canStart(a),false); r.join('b',a.code.toLowerCase()); r.join('c',a.code); r.join('d',a.code); assert.throws(()=>r.join('e',a.code)); for(const id of ['a','b','c','d']) r.ready(id,true); assert.equal(canStart(r.ready('a',true)),true); assert.equal(r.leave('b')?.players.length,3); r.leave('a');r.leave('c');r.leave('d'); assert.throws(()=>r.join('e',a.code)); });
test('validation and duplicate membership',()=>{const r=new Rooms();r.create('a');assert.throws(()=>r.create('a'));assert.throws(()=>r.join('b','bad!'));assert.throws(()=>r.join('b','FFFFFF'));assert.throws(()=>r.ready('a','yes'));assert.equal(r.leave('missing'),null);});


test('membership distinguishes connected players from saved identities',()=>{
 const rooms=new Rooms(),room=rooms.create('dm',2);rooms.join('player',room.code,2);
 const token=rooms.token('player'),id=rooms.playerId('player');
 assert.equal(rooms.checkpoint(room.code).room.players.find(p=>p.id===id)?.connected,true);
 rooms.detach('player');assert.equal(rooms.checkpoint(room.code).room.players.find(p=>p.id===id)?.connected,false);
 const resumed=rooms.resume('returning',token);assert.equal(resumed.id,id);
 assert.equal(resumed.room.players.find(p=>p.id===id)?.connected,true);
 const restored=new Rooms();restored.restore(rooms.checkpoint(room.code));
 assert.ok(restored.checkpoint(room.code).room.players.every(p=>p.connected===false));
});
