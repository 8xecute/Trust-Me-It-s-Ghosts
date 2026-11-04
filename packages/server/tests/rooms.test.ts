import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rooms, canStart } from '../src/rooms.js';
test('room capacity, readiness and disconnect',()=>{ const r=new Rooms(); const a=r.create('a'); assert.match(a.code,/^[A-F0-9]{6}$/); assert.equal(canStart(a),false); r.join('b',a.code.toLowerCase()); r.join('c',a.code); r.join('d',a.code); assert.throws(()=>r.join('e',a.code)); for(const id of ['a','b','c','d']) r.ready(id,true); assert.equal(canStart(r.ready('a',true)),true); assert.equal(r.leave('b')?.players.length,3); r.leave('a');r.leave('c');r.leave('d'); assert.throws(()=>r.join('e',a.code)); });
test('validation and duplicate membership',()=>{const r=new Rooms();r.create('a');assert.throws(()=>r.create('a'));assert.throws(()=>r.join('b','bad!'));assert.throws(()=>r.join('b','FFFFFF'));assert.throws(()=>r.ready('a','yes'));assert.equal(r.leave('missing'),null);});
