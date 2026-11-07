import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCharacter} from '@baan/shared';
import {newCase,applyCaseAction,caseOptions,type CaseState} from '../src/case001/case001.js';
import {WorldStore} from '../src/world.js';
const actor={character:createCharacter('ritual_specialist','body'),backgroundUsed:false,onBoost:()=>{}};
const act=(s:CaseState,id:string)=>applyCaseAction(s,id,()=>20,actor);
const offered=(s:CaseState,id:string)=>caseOptions(s,true).some(o=>o.id===id);
test('first interview introduces flood history before a focused revelation without a map lock',()=>{
 let s:CaseState={...newCase(true),site:'B'};
 assert(!offered(s,'talk:gate-history'));assert(!offered(s,'talk:protected'));
 s=act(s,'talk:history');assert.doesNotMatch(s.notice,/วิชัย|ประเสริฐ/);
 assert(!s.story!.firedTriggers.includes('EV16'));
 s=act(s,'talk:gate-history');assert(s.story!.firedTriggers.includes('EV15'));
 s=act(s,'talk:history');assert(s.story!.firedTriggers.includes('EV16'));
 assert(!offered(s,'talk:history'));assert.throws(()=>act(s,'talk:history'));
});
test('independent evidence and witness routes remain valid out of order',()=>{
 for(const evidence of [['E02'],['E07']]) {
  const s:CaseState={...newCase(true),site:'B',evidence};
  assert(offered(s,'talk:gate-history'));
  const revealed=act(s,'talk:history');assert(revealed.story!.firedTriggers.includes('EV16'));
  assert(!offered(revealed,'talk:history'));
 }
 const witness=act({...newCase(true),site:'B'},'talk:cart');
 assert(offered(witness,'talk:protected'));assert(act(witness,'talk:protected').evidence.includes('E08'));
 assert(offered({...newCase(true),site:'D'},'clue:E03'));
 assert(offered({...newCase(true),site:'E'},'key'));
});
test('absent NPC and hidden spirit cannot speak; custody preserves the ritual',()=>{
 let s:CaseState={...newCase(true),site:'B',wichai:{site:'E',status:'traveling',nextMove:999,sabotaged:false}};
 assert(!offered(s,'talk:grove-alibi'));assert.throws(()=>act(s,'talk:grove-alibi'));
 s={...s,site:'E'};assert(offered(s,'talk:confront-e'));
 s.wichai!.status='detained';assert(!offered(s,'talk:confront-e'));
 s=act(s,'talk:custody');assert.match(s.notice,/พิธียังทำงาน/);assert(!s.seals[2]);
 assert(!offered({...newCase(true),site:'E',seals:[true,true,true]},'talk:spirit-choice'));
});
test('Human DM and forged player requests revalidate presence and do not leak a blocked response',()=>{
 const store=new WorldStore(()=>20);store.create('r',2);let seq=0;
 for(const id of ['a','b','dm'])store.addPlayer('r',id);
 const send=(who:string,type:string,payload:object={})=>store.apply('r',who,{id:String(++seq),type,...payload});
 send('dm','claimDm');for(const id of ['a','b'])send(id,'createCharacter',{profession:'medium',bonus:'body'});
 send('a','caseStart');send('a','caseAction',{actionId:'travel:B'});
 const before=store.snapshot('r','a');assert.throws(()=>send('dm','caseDm',{targetId:'a',actionId:'talk:gate-history'}));
 assert.deepEqual(store.snapshot('r','a'),before);
 send('dm','caseDm',{targetId:'a',actionId:'talk:history'});
 assert(!JSON.stringify(store.snapshot('r','a').narrative).includes('หนึ่งในนั้นชื่อวิชัย'));
 assert.deepEqual(store.dmPreview('r','dm','a'),store.snapshot('r','a'));
});
