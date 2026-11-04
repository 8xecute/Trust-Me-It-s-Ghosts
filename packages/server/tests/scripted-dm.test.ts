import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldStore } from '../src/world.js';

function setup() {
  const store = new WorldStore();
  store.create('room');
  store.addPlayer('room','a');
  store.addPlayer('room','b');
  return store;
}

const choose = {id:'ask',type:'chooseDialogue',dialogueId:'greeting',choiceId:'ask-note'};

test('Scripted DM selects fallback dialogue when the room lacks evidence', () => {
  const store = setup();
  assert.ok(store.snapshot('room').dm.narration);
  const result = store.apply('room','a',choose);
  assert.equal(result.snapshot.dm.dialogue?.id,'note-hint');
  assert.ok(result.snapshot.scenario.firedTriggers.includes('reply-hint'));
  assert.ok(!result.snapshot.scenario.firedTriggers.includes('reply-found'));
});

test('Scripted DM rejects forged or stale choices and leaves room state unchanged', () => {
  const store = setup();
  const initial = store.snapshot('room');
  assert.throws(() => store.apply('room','b',{...choose,choiceId:'unknown'}));
  assert.deepEqual(store.snapshot('room'),initial);
  const result = store.apply('room','a',choose);
  assert.throws(() => store.apply('room','b',choose));
  assert.equal(store.apply('room','a',choose).duplicate,true);
  assert.deepEqual(store.snapshot('room'),result.snapshot);
});

test('Scripted DM chooses the higher-priority response when both triggers match', () => {
  const store = setup();
  store.apply('room','a',{id:'move',type:'move',target:{x:4,y:8}});
  store.apply('room','a',{id:'collect',type:'collect',objectId:'clue'});
  const result = store.apply('room','b',choose);
  assert.equal(result.snapshot.dm.dialogue?.id,'note-found');
  assert.ok(result.snapshot.scenario.firedTriggers.includes('reply-found'));
  assert.ok(!result.snapshot.scenario.firedTriggers.includes('reply-hint'));
  assert.equal(result.snapshot.dm.objectives.find(o => o.id === 'discover')?.complete,true);
});
