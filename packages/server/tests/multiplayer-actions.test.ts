import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldStore } from '../src/world.js';

test('two players cannot occupy one cell or collect one item twice', () => {
  const store = new WorldStore(() => 10);
  store.create('room'); store.addPlayer('room','a'); store.addPlayer('room','b');
  store.apply('room','a',{id:'a1',type:'move',target:{x:4,y:6}});
  store.apply('room','a',{id:'a2',type:'move',target:{x:3,y:6}});
  assert.throws(()=>store.apply('room','b',{id:'b1',type:'move',target:{x:3,y:6}}));
  store.apply('room','a',{id:'a3',type:'move',target:{x:4,y:6}});
  store.apply('room','a',{id:'a4',type:'move',target:{x:4,y:7}});
  store.apply('room','a',{id:'a5',type:'move',target:{x:4,y:8}});
  const collected=store.apply('room','a',{id:'collect',type:'collect',objectId:'clue'});
  assert.deepEqual(collected.snapshot.evidence,['evidence-1']);
  assert.equal(store.apply('room','a',{id:'collect',type:'collect',objectId:'clue'}).duplicate,true);
  store.apply('room','b',{id:'b2',type:'move',target:{x:4,y:7}});
  store.apply('room','a',{id:'a6',type:'move',target:{x:3,y:8}});
  store.apply('room','b',{id:'b3',type:'move',target:{x:4,y:8}});
  assert.throws(()=>store.apply('room','b',{id:'collect-again',type:'collect',objectId:'clue'}));
  assert.deepEqual(store.snapshot('room').inventory.b,[]);
});

test('server controls dice, focus and AP across two players', () => {
  let rolls=0; const store=new WorldStore(()=>{rolls++;return 10;});
  store.create('room');store.addPlayer('room','a');store.addPlayer('room','b');
  store.apply('room','a',{id:'start',type:'start'});
  assert.throws(()=>store.apply('room','b',{id:'outside-turn',type:'check'}));
  assert.throws(()=>store.apply('room','a',{id:'fake',type:'check',die:20}));
  assert.equal(rolls,0);
  store.apply('room','a',{id:'focus',type:'focus'});
  const result=store.apply('room','a',{id:'check',type:'check'});
  assert.equal(result.snapshot.lastCheck?.die,10);
  assert.equal(result.snapshot.lastCheck?.total,12);
  assert.equal(result.snapshot.lastCheck?.outcome,'success');
  assert.equal(result.snapshot.turns.a.ap,1);
  store.apply('room','a',{id:'last',type:'check'});
  assert.throws(()=>store.apply('room','a',{id:'overspend',type:'check'}));
  assert.equal(rolls,2);
  const next=store.apply('room','a',{id:'end',type:'endTurn'});
  assert.equal(next.snapshot.turns.b.ap,3);
  assert.equal(next.snapshot.activePlayer,'b');
});
