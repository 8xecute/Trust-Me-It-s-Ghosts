import assert from 'node:assert/strict';
import {test} from 'node:test';
import {characterPresets,professionTechniques} from '@baan/shared';
import {WorldStore} from '../src/world.js';

function room() {
 let rolls=0,id=0;
 const store=new WorldStore(()=>{rolls++;return 10;},true,true,true,true);
 store.create('BASIC',2);
 const send=(player:string,type:string,data:object={})=>store.apply('BASIC',player,{id:String(++id),type,...data});
 store.addPlayer('BASIC','dm');send('dm','claimDm');
 for(const [i,profession] of Object.keys(characterPresets).entries()) {
  const player='p'+i;store.addPlayer('BASIC',player);
  send(player,'createCharacter',{profession,talent:professionTechniques[profession as keyof typeof professionTechniques].talents[0].id});
 }
 send('dm','caseStart',{mode:'story'});
 return {store,send,rolls:()=>rolls};
}
test('basic mode retains all six preset stats and does not assign advanced talents',()=>{
 const r=room(),snapshot=r.store.snapshot('BASIC','p0');
 for(const [i,profession] of Object.keys(characterPresets).entries()) {
  const c=snapshot.characters!['p'+i];
  assert.deepEqual(c.coreStats,characterPresets[profession as keyof typeof characterPresets]);
  assert.equal(c.talent,undefined);assert.equal(c.focus,4);
 }
 for(const type of ['useTalent','usePassive']) assert.throws(()=>r.send('p0',type),/โหมดพื้นฐาน/);
 for(const boost of ['deception','diagnostic']) assert.throws(()=>r.send('p0','caseAction',{actionId:'open',boost}),/โหมดพื้นฐาน/);
 assert.equal(r.rolls(),0);
});
test('basic mode removes cash advance and rejects forged advance requests',()=>{
 const r=room(),panel=r.store.dmPanel('BASIC','dm');if(!('caseMode' in panel))throw Error('case');
 r.send('dm','dmPublish',{cardId:panel.narration.find(c=>c.eventId==='guided-cue:A1')!.id});
 assert.equal(r.store.snapshot('BASIC','p0').case001!.actions.some(a=>a.id==='advance'),false);
 assert.throws(()=>r.send('p0','caseAction',{actionId:'advance',site:'A'}));
 assert.equal(r.store.checkpoint('BASIC').world.case001!.advance,0);
});
test('DM sent marks survive reload, remain private and do not count duplicate requests',()=>{
 const r=room();
 const panel=()=>{const p=r.store.dmPanel('BASIC','dm');if(!('caseMode' in p))throw Error('case');return p;};
 r.send('dm','dmPublish',{cardId:panel().narration.find(c=>c.eventId==='guided-cue:A1')!.id});
 assert.ok(panel().sent['guided-cue:A1']);
 assert.equal(panel().guidedScenes!.find(s=>s.id==='A1')!.sent,true);
 const line=panel().investigators[0].choices.find(c=>c.id.startsWith('guided-talk:'))!;
 assert.equal(panel().sent[line.id],undefined);
 const action={id:'speak-once',type:'caseDm' as const,targetId:'p0',actionId:line.id};
 r.store.apply('BASIC','dm',action);r.store.apply('BASIC','dm',action);
 assert.equal(panel().sent[line.id].count,1);
 assert.equal('sent' in r.store.snapshot('BASIC','p0'),false);
 const restored=new WorldStore(undefined,true,true,true,true);
 restored.restore('BASIC',JSON.parse(JSON.stringify(r.store.checkpoint('BASIC'))));
 const loaded=restored.dmPanel('BASIC','dm');if(!('caseMode' in loaded))throw Error('case');
 assert.equal(loaded.sent[line.id].count,1);
 assert.equal(loaded.sent[line.id].text,panel().sent[line.id].text);
});
test('old talent selections survive restore but cannot be used in basic mode',()=>{
 const r=room(),save=r.store.checkpoint('BASIC');
 save.world.characters!.p0.talent='weakness_analysis';
 delete save.world.basicMode;delete save.world.case001!.basicMode;
 const restored=new WorldStore(()=>{throw Error('must not roll');},true,true,true,true);
 restored.restore('BASIC',JSON.parse(JSON.stringify(save)));
 assert.equal(restored.snapshot('BASIC','p0').characters!.p0.talent,'weakness_analysis');
 assert.equal(restored.checkpoint('BASIC').world.case001!.basicMode,true);
 assert.throws(()=>restored.apply('BASIC','p0',{id:'old-talent',type:'useTalent'}),/โหมดพื้นฐาน/);
});
test('basic mode still resolves an authoritative scripted check with Focus',()=>{
 const r=room();
 r.send('dm','guided',{command:'scene',target:'A2'});
 const panel=r.store.dmPanel('BASIC','dm');if(!('caseMode' in panel))throw Error('case');
 const cue=panel.narration.find(card=>card.eventId==='guided-cue:A2')!;
 r.send('dm','dmPublish',{cardId:cue.id});
 const action=r.store.snapshot('BASIC','p0').case001!.actions.find(a=>a.id.startsWith('dice:A2_'))!;
 r.send('p0','caseAction',{actionId:action.id,site:'A',boost:'focus'});
 const pending=r.store.dmPanel('BASIC','dm');if(!('caseMode' in pending))throw Error('case');
 r.send('dm','dmRequestRoll',{targetId:'p0',checkId:pending.investigators[0].check!.id});
 r.send('p0','dmRoll',{requestId:r.store.snapshot('BASIC','p0').diceRequest!.id});
 assert.equal(r.rolls(),1);
 const result=r.store.snapshot('BASIC','p0');
 assert.equal(result.characters!.p0.focus,3);
 assert.equal(result.lastCheck!.total,10+result.characters!.p0.coreStats!.SPI+2);
 assert.deepEqual(r.store.snapshot('BASIC','p1').latestRoll,result.latestRoll);
});
