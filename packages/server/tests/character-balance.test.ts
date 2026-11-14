import assert from 'node:assert/strict';
import {test} from 'node:test';
import {characterPresets,createCharacter,liteAttack,liteDefense,resolveCheck,type Profession} from '@baan/shared';
const rolls=Array.from({length:20},(_,i)=>i+1);
const character=(role:Profession)=>createCharacter(role,undefined,undefined,true);
const hitCount=(role:Profession)=>rolls.filter(roll=>liteAttack({roll,bonus:character(role).coreStats!.BODY,defense:12,damage:2,physical:true,manifestation:'MANIFESTED'}).hit).length;
const checkCount=(role:Profession,stat:keyof typeof characterPresets.medium)=>rolls.filter(die=>resolveCheck({dc:12,attribute:character(role).coreStats![stat]},()=>die).outcome==='success').length;
test('all six presets keep equal budgets and existing stat limits',()=>{
 for(const [role,stats] of Object.entries(characterPresets)) {
  assert.equal(Object.values(stats).reduce((sum,n)=>sum+n,0),18,role);
  assert.ok(Object.values(stats).every(n=>Number.isInteger(n) && n>=1 && n<=5),role);
  const c=character(role as Profession);
  assert.deepEqual([c.hp,c.sanity,c.focus],[15,10,4]);
 }
});
test('frontline specialists hit more often without receiving stronger attacks',()=>{
 assert.equal(hitCount('containment_specialist'),14);
 assert.equal(hitCount('field_medic'),14);
 assert.equal(hitCount('medium'),10);
});
test('investigator reads openings, ritual specialist solves INT, medium supports SOC',()=>{
 assert.equal(checkCount('paranormal_investigator','PER'),14);
 assert.equal(checkCount('ritual_specialist','PER'),10);
 assert.equal(checkCount('ritual_specialist','INT'),14);
 assert.equal(checkCount('field_medic','INT'),10);
 assert.equal(checkCount('medium','SOC'),14);
 assert.equal(checkCount('ritual_specialist','SOC'),11);
});
test('bodyguard resists mental attacks better than driver despite equal physical defense',()=>{
 const guard=character('containment_specialist').coreStats!,driver=character('field_medic').coreStats!;
 assert.equal(liteDefense(guard,'PDEF'),liteDefense(driver,'PDEF'));
 assert.equal(liteDefense(guard,'MDEF'),15);assert.equal(liteDefense(driver,'MDEF'),13);
});
test('creating new presets does not mutate existing characters or shared defaults',()=>{
 const saved=character('medium');saved.coreStats!.SOC=4;saved.hp=3;saved.sanity=0;saved.focus=1;
 const checkpoint=JSON.stringify(saved);
 const next=character('medium');assert.equal(next.coreStats!.SOC,5);
 next.coreStats!.SOC=1;assert.equal(characterPresets.medium.SOC,5);
 assert.equal(JSON.stringify(saved),checkpoint);
});
