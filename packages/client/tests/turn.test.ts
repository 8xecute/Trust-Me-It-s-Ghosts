import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTurn, spendAP, focus, skillCheck } from '../../shared/src/turn';
test('AP costs, exhaustion and reset',()=>{ const t=startTurn(); assert.equal(t.ap,3); assert.equal(spendAP(t,2)?.ap,1); assert.equal(spendAP(t,4),null); assert.equal(startTurn().ap,3); });
test('DC thresholds and injected d20',()=>{ const t=startTurn(); assert.equal(skillCheck(t,12,0,()=>12)?.outcome,'success'); assert.equal(skillCheck(t,12,0,()=>9)?.outcome,'partial'); assert.equal(skillCheck(t,12,0,()=>8)?.outcome,'failure'); assert.throws(()=>skillCheck(t,12,0,()=>21)); });
test('focus costs AP, boosts and is consumed by next check',()=>{ const t=focus(startTurn())!; assert.equal(t.ap,2); assert.equal(focus(t),null); const r=skillCheck(t,12,0,()=>10)!; assert.equal(r.outcome,'success'); assert.equal(r.state.focused,false); assert.equal(r.state.ap,1); });
