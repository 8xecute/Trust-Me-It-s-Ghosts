import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleScenario, validateScenario, applyScenarioEvent } from '../../shared/src/index.js';

test('validates references, duplicate IDs and malformed input', () => {
  assert.equal(validateScenario(sampleScenario).triggers.length, 3);
  assert.throws(() => validateScenario(null));
  assert.throws(() => validateScenario({...sampleScenario, scenes:[...sampleScenario.scenes, sampleScenario.scenes[0]]}));
  assert.throws(() => validateScenario({...sampleScenario, npcs:[{id:'x',name:'ผู้ดูแล',sceneId:'missing'}]}));
  assert.throws(() => validateScenario({...sampleScenario, triggers:[{id:'x',event:'x',once:true,conditions:[{type:'scene',id:'missing'}],actions:[{type:'end',id:'resolved'}]}]}));
});
test('three events advance state and one-time triggers do not repeat', () => {
  const start={sceneId:'yard',evidence:[],objectives:[],firedTriggers:[],endingId:null};
  const first=applyScenarioEvent(sampleScenario,start,'enter-yard');
  assert.deepEqual(applyScenarioEvent(sampleScenario,first,'enter-yard'),first);
  const second=applyScenarioEvent(sampleScenario,first,'inspect-box');
  assert.deepEqual(second.evidence,['note']);
  const third=applyScenarioEvent(sampleScenario,second,'finish-investigation');
  assert.equal(third.endingId,'resolved');
  assert.deepEqual(start.objectives,[]);
});
