import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScenarioJSON, applyScenarioEvent } from '@baan/shared';
import { WorldStore } from '../src/world.js';

const json = readFileSync(new URL('../scenarios/sample.json', import.meta.url), 'utf8');
test('JSON rejects invalid syntax and broken dialogue references', () => {
  assert.throws(() => parseScenarioJSON('{'));
  const data=JSON.parse(json); data.dialogue[0].npcId='unknown';
  assert.throws(() => parseScenarioJSON(JSON.stringify(data)));
});
test('room snapshot contains authoritative scenario state and one-time collection event', () => {
  const store=new WorldStore(); store.create('r'); store.addPlayer('r','a');
  const initial=store.snapshot('r');
  assert.deepEqual(initial.scenario.objectives,['investigate']);
  assert.equal(initial.scenario.dialogueId,'greeting');
  store.apply('r','a',{id:'move',type:'move',target:{x:4,y:8}});
  const result=store.apply('r','a',{id:'collect',type:'collect',objectId:'clue'});
  assert.deepEqual(result.snapshot.scenario.evidence,['evidence-1']);
  assert.deepEqual(result.snapshot.scenario.firedTriggers,['arrive','find-note']);
  assert.equal(store.apply('r','a',{id:'collect',type:'collect',objectId:'clue'}).duplicate,true);
  assert.deepEqual(store.snapshot('r').scenario,result.snapshot.scenario);
  const ending=applyScenarioEvent(parseScenarioJSON(json),result.snapshot.scenario,'pacified');
  assert.equal(ending.endingId,'resolved');
});
