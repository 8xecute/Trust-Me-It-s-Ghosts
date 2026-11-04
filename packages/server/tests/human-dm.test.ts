import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldStore } from '../src/world.js';

test('Human DM role is exclusive and private scripts never enter public snapshots', () => {
  const store = new WorldStore();
  store.create('room');
  store.addPlayer('room','a');
  store.addPlayer('room','b');
  store.apply('room','a',{id:'claim',type:'claimDm'});
  const panel = store.dmPanel('room','a');
  assert.ok(panel.secret);
  assert.ok(!JSON.stringify(store.snapshot('room')).includes(panel.secret));
  assert.throws(()=>store.dmPanel('room','b'));
  assert.throws(()=>store.apply('room','b',{id:'claim',type:'claimDm'}));
  assert.throws(()=>store.apply('room','b',{id:'event',type:'dmEvent',targetId:'dm:welcome'}));
  store.removePlayer('room','a');
  assert.equal(store.apply('room','b',{id:'claim',type:'claimDm'}).snapshot.humanDmId,'b');
});

test('Human DM uses conditional events, approved dialogue and scene routes, and server dice', () => {
  const store = new WorldStore(()=>14);
  store.create('room');
  store.addPlayer('room','a');
  store.addPlayer('room','b');
  let id = 0;
  const act = (type:string,targetId?:string) => store.apply('room','a',{id:String(++id),type,targetId});
  act('claimDm');
  assert.throws(()=>act('dmEvent','pacified'));
  assert.throws(()=>act('dmScene','unknown'));
  assert.equal(act('dmEvent','dm:welcome').snapshot.dm.dialogue?.id,'greeting');
  assert.throws(()=>act('dmEvent','dm:welcome'));
  assert.equal(act('dmScene','porch').snapshot.scenario.sceneId,'porch');
  assert.throws(()=>act('dmDialogue','greeting'));
  assert.equal(act('dmDialogue','porch-welcome').snapshot.dm.dialogue?.id,'porch-welcome');
  const request = act('dmRequestRoll','b').snapshot.diceRequest!;
  assert.throws(()=>store.apply('room','a',{id:'roll',type:'dmRoll',requestId:request.id}));
  assert.throws(()=>store.apply('room','b',{id:'fake',type:'dmRoll',requestId:request.id,die:20}));
  const result = store.apply('room','b',{id:'roll',type:'dmRoll',requestId:request.id});
  assert.equal(result.snapshot.diceRequest?.die,14);
  assert.throws(()=>store.apply('room','b',{id:'again',type:'dmRoll',requestId:request.id}));
});
