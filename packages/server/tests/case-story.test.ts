import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCharacter } from '@baan/shared';
import { applyCaseAction, caseView, newCase, tick, type CaseState } from '../src/case001/case001.js';
import { WorldStore } from '../src/world.js';

const investigator={character:createCharacter('ritual_specialist','body'),backgroundUsed:false,onBoost:()=>{}};
const action=(s:CaseState,id:string,die=20)=>applyCaseAction(s,id,()=>die,investigator);

test('Case story gates testimony, tracks EV15–18 once, and publishes an earned teaser only after closure',()=>{
  let s={...newCase(true),site:'B' as const};
  assert.equal(s.story!.firedTriggers.includes('EV01'),true);
  assert.throws(()=>action(s,'talk:accuse-gate'));
  s=action(s,'talk:history');
  assert.doesNotMatch(s.notice,/ชื่อวิชัย/);
  let next=action(s,'talk:gate-history');
  assert.ok(next.story!.firedTriggers.includes('EV15'));
  next=action(next,'talk:accuse-gate');
  assert.ok(next.story!.objectives.includes('confessed'));
  next=action(next,'talk:history');
  assert.ok(next.story!.firedTriggers.includes('EV16'));
  assert.throws(()=>action(next,'talk:history'));
  next.understood=true;next.minute=200;
  tick(next,10);tick(next,10);
  assert.equal(next.story!.firedTriggers.filter(id=>id==='EV18').length,1);
  assert.equal(JSON.stringify(caseView(next,true)).includes('CASE 017'),false);
  next.site='A';next=action(next,'finish');
  assert.ok(next.story!.firedTriggers.includes('EV17'));
  assert.match(next.report!.text,/CASE 017/);
});

test('the same NPC topic gives a guarded response and unlocks its trusted response later',()=>{
  const guarded=action({...newCase(true),site:'D',ghost:'cautious'},'talk:spirit-missing');
  assert.match(guarded.notice,/ข้าได้ยินพวกเขา/);
  assert.doesNotMatch(guarded.notice,/ใต้เรือนไม้/);
  const trusted=action({...guarded,trust:2},'talk:spirit-missing');
  assert.match(trusted.notice,/ใต้เรือนไม้/);
  assert.throws(()=>action(trusted,'talk:spirit-missing'));
});

test('peaceful, safe containment, rescue-only and failed routes each settle once',()=>{
  const ready={...newCase(true),site:'E' as const,seals:[true,true,true] as CaseState['seals'],returned:true,evidence:['E02','E08'],evacuated:['ดล','นิด','เพิ่ม'],advance:2000};
  let a=action(ready,'ritual');a=action(a,'ritual');
  assert.equal(a.ghost,'freed');a=action({...a,site:'A'},'finish');
  assert.equal(a.report?.ending,'A');assert.equal(a.report?.payable,13000);
  let b=action({...ready,returned:false},'suppress');
  assert.equal(b.containment,2);assert.notEqual(b.ghost,'sealed');
  b=action(b,'suppress');b=action({...b,site:'A'},'finish');
  assert.equal(b.report?.ending,'B');assert.equal(b.report?.payable,9000);
  const c=action({...newCase(true),evacuated:['ดล','นิด','เพิ่ม'],minute:230},'finish');
  tick(c,20);assert.equal(c.report?.ending,'C');assert.equal(c.report?.rescueBonus,3000);
  const d={...newCase(true),minute:230};
  tick(d,10);assert.equal(d.report?.ending,'D');assert.equal(d.report?.rootBonus,0);
  assert.throws(()=>action(d,'finish'));
});

test('seal three on the deadline wins, and arrest prevents sabotage without stopping the ritual',()=>{
  const tied=action({...newCase(true),site:'E',seals:[true,true,false],minute:230},'seal3');
  assert.equal(tied.minute,240);assert.equal(tied.seals[2],true);
  assert.equal(tied.report,null);assert.ok(tied.story!.firedTriggers.includes('EV08'));
  assert.equal(tied.story!.firedTriggers.includes('EV10'),false);
  const s={...newCase(true),site:'B' as const,evidence:['E02','E08']};
  const restrained=action(s,'detain');
  assert.equal(restrained.wichai?.status,'detained');assert.ok(restrained.story!.firedTriggers.includes('EV11'));
  tick(restrained,30);
  assert.equal(restrained.wichai?.site,'B');assert.equal(restrained.seals[2],false);
  const moving=action(s,'confront');assert.equal(moving.wichai?.site,'B');
  tick(moving,10);assert.equal(moving.wichai?.site,'D');
  tick(moving,10);assert.equal(moving.wichai?.site,'E');
});

test('Human DM uses the same Case reducer and cannot reveal gated lines or bypass permissions',()=>{
  const worlds=new WorldStore(()=>20);
  for(const code of ['human','system']) {
    worlds.create(code,2);
    for(const id of code==='human'?['a','b','dm']:['a','b']) worlds.addPlayer(code,id);
    if(code==='human') worlds.apply(code,'dm',{id:'role',type:'claimDm'});
    for(const id of ['a','b']) worlds.apply(code,id,{id:'profile',type:'createCharacter',profession:'medium',bonus:'body'});
    worlds.apply(code,'a',{id:'start',type:'caseStart'});
  }
  assert.throws(()=>worlds.dmPanel('human','a'));
  const privatePanel=worlds.dmPanel('human','dm');
  assert.ok('investigators' in privatePanel);
  assert.doesNotMatch(JSON.stringify(worlds.snapshot('human','a')),/ปิดบังบทบาท/);
  assert.throws(()=>worlds.apply('human','a',{id:'illegal',type:'caseDm',targetId:'b',actionId:'talk:arrival'}));
  assert.throws(()=>worlds.apply('human','dm',{id:'gated',type:'caseDm',targetId:'a',actionId:'talk:accuse-gate'}));
  const dmAction={id:'speak',type:'caseDm',targetId:'a',actionId:'talk:arrival'};
  worlds.apply('human','dm',dmAction);
  worlds.apply('system','a',{id:'speak',type:'caseAction',actionId:'talk:arrival'});
  assert.deepEqual(worlds.snapshot('human','a').case001,worlds.snapshot('system','a').case001);
  assert.equal(worlds.apply('human','dm',dmAction).duplicate,true);
  const request=worlds.apply('human','dm',{id:'ask',type:'dmRequestRoll',targetId:'a'}).snapshot.diceRequest!;
  assert.throws(()=>worlds.apply('human','b',{id:'wrong',type:'dmRoll',requestId:request.id}));
  assert.equal(worlds.apply('human','a',{id:'roll',type:'dmRoll',requestId:request.id}).snapshot.diceRequest?.die,20);
});
