import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
test('DM freely moves the team between v5.5 scenes without granting story facts',()=>{
 const store=new WorldStore(()=>20,true,true,true,false,'5.5');store.create('FREE',2);let n=0;
 const act=(id:string,type:string,body:object={})=>store.apply('FREE',id,{id:String(++n),type,...body});
 for(const id of ['dm','a','b'])store.addPlayer('FREE',id);
 act('dm','claimDm');act('a','createCharacter',{profession:'medium'});act('b','createCharacter',{profession:'field_medic'});act('dm','caseStart',{mode:'story'});
 const before=store.checkpoint('FREE').world.case001!;
 assert.throws(()=>act('a','guided',{command:'scene',target:'E3'}));
 for(const target of ['E3','B4','A1']){
  act('dm','guided',{command:'scene',target});
  for(const id of ['a','b']){const view=store.snapshot('FREE',id);assert.equal(view.caseMap!.site,target[0]);assert.equal(view.guided!.scene,target);}
 }
 const after=store.checkpoint('FREE').world.case001!;
 assert.deepEqual(after.evidence,before.evidence);assert.deepEqual(after.v51,before.v51);
 assert.throws(()=>act('dm','guided',{command:'scene',target:'invalid'}));
 const checkpoint=store.checkpoint('FREE');checkpoint.world.caseMap!.battle={id:'EN01'} as any;
 const battling=new WorldStore(()=>20,true,true,true,false,'5.5');battling.restore('FREE',checkpoint);
 assert.throws(()=>battling.apply('FREE','dm',{id:'battle-switch',type:'guided',command:'scene',target:'D1'}),/เผชิญหน้า/);
});
