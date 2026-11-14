import assert from 'node:assert/strict';
import {test} from 'node:test';
import {combatFlavour} from '../src/case001/combatFlavour.js';
const context={scene:'EN04',actor:'เมฆ',target:'แม่แก้ว',label:'ขับไล่ผี',enemyActor:false,outcome:'success',sequence:1};
test('flavour is deterministic without consuming combat dice',()=>{
 assert.deepEqual(combatFlavour(context),combatFlavour({...context}));
});
test('failed ritual action cannot narrate an opened shield',()=>{
 const result=combatFlavour({...context,label:'คลายปมเกราะ',outcome:'failure'})!;
 assert.doesNotMatch(result.text,/เปิดออก|สำเร็จ/);assert.equal(result.dialogue,undefined);
});
test('blocked attack and defeated Final body retain their actual ritual meaning',()=>{
 assert.match(combatFlavour({...context,effect:'โจมตีโดน เกราะรับความเสียหายไว้'})!.text,/เกราะ/);
 assert.match(combatFlavour({...context,dispersed:true})!.text,/พิธียังคง/);
});
test('ghost dialogue is attributed to the actor and declaration does not claim damage',()=>{
 const result=combatFlavour({...context,actor:'แม่แก้ว',target:'เมฆ',label:'ประกาศ ความทรงจำน้ำท่วม',enemyActor:true})!;
 assert.equal(result.dialogue!.speaker,'แม่แก้ว');assert.match(result.text,/ยังไม่มีการปะทะ/);
});
test('scene-specific restraint is distinct from a missed attack',()=>{
 const hit=combatFlavour({...context,scene:'EN01',actor:'ผีเงาจมน้ำ 1',target:'เมฆ',enemyActor:true,label:'มือจากใต้พื้น',effect:'ถูกพันธนาการถึงรอบหน้า'})!;
 assert.match(hit.text,/คว้าข้อเท้า เมฆ/);
 const miss=combatFlavour({...context,scene:'EN01',enemyActor:true,outcome:'failure',effect:'ไม่เสียพลังชีวิต'})!;
 assert.doesNotMatch(miss.text,/รัด|คว้าข้อเท้า/);
});
test('templates resolve names without interpreting replacement-like content',()=>{
 const result=combatFlavour({...context,actor:'$&',target:'ชื่อ{actor}'})!;
 assert.ok(result.text.includes('$&'));assert.ok(result.text.includes('ชื่อ{actor}'));
});
