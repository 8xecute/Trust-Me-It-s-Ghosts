import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WorldStore} from '../src/world.js';
test('validates movement, deduplicates actions and snapshots',()=>{const s=new WorldStore();s.create('room');s.addPlayer('room','p'); const a={id:'1',type:'move',target:{x:4,y:6}};const first=s.apply('room','p',a);assert.deepEqual(first.snapshot.players.p,{x:4,y:6});const retry=s.apply('room','p',a);assert.equal(retry.duplicate,true);assert.equal(retry.snapshot.revision,first.snapshot.revision);assert.throws(()=>s.apply('room','p',{id:'2',type:'move',target:{x:4,y:4}}));assert.deepEqual(s.snapshot('room').players.p,{x:4,y:6});});
test('rejects invalid object action and duplicate collection',()=>{const s=new WorldStore();s.create('r');s.addPlayer('r','p');assert.throws(()=>s.apply('r','p',{id:'x',type:'open',objectId:'locked-box'}));});
