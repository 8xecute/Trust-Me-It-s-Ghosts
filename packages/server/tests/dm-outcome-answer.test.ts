import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';

function setup(count:number,die:number) {
 let serial=0,rolls=0;
 const store=new WorldStore(()=>{rolls++;return die;},true,true,true,true);
 store.create('ANSWER',2);store.addPlayer('ANSWER','dm');
 const send=(player:string,type:string,data:object={})=>store.apply('ANSWER',player,{id:String(++serial),type,...data});
 send('dm','claimDm');
 for(let i=0;i<count;i++) {store.addPlayer('ANSWER','p'+i);send('p'+i,'createCharacter',{profession:['ritual_specialist','medium','field_medic','occult_engineer'][i]});}
 send('dm','caseStart',{mode:'story'});
 const panel=()=>{const p=store.dmPanel('ANSWER','dm');if(!('caseMode' in p))throw Error('case');return p;};
 const view=(id='p0')=>store.snapshot('ANSWER',id);
 send('dm','guided',{command:'scene',target:'A2'});
 send('dm','dmPublish',{cardId:panel().narration.find(c=>c.eventId==='guided-cue:A2')!.id});
 send('p0','caseAction',{actionId:'dice:A2_RADIO_ECHO:SPI',site:'A'});
 send('dm','dmRequestRoll',{targetId:'p0',checkId:panel().investigators[0].check!.id});
 const rollId=view().diceRequest!.id;send('p0','dmRoll',{requestId:rollId});
 return {store,send,panel,view,rollId,rolls:()=>rolls};
}
for(const count of [2,3,4]) test('DM chooses authored outcome response after shared roll for '+count+' players',()=>{
 for(const [die,outcome] of [[11,'success'],[8,'partial'],[7,'failure']] as const) {
  const r=setup(count,die),card=r.panel().narration.find(c=>c.answer)!;
  assert.ok(card);assert.equal(card.answer!.outcome,outcome);assert.equal(card.answer!.total,die+3);
  assert.equal(card.answer!.statValue,3);assert.equal(card.answer!.dc,14);
  assert.ok(!JSON.stringify(r.view()).includes(card.answer!.narration));
  assert.throws(()=>r.send('p1','dmPublish',{cardId:card.id}));
  assert.throws(()=>r.send('dm','dmPublish',{cardId:card.id,part:'full'}));
  const saved=JSON.parse(JSON.stringify(r.store.checkpoint('ANSWER')));
  const restored=new WorldStore(()=>{throw Error('reroll');},true,true,true,true);restored.restore('ANSWER',saved);
  const response={id:'narration-once',type:'dmPublish' as const,cardId:card.id,part:'narration' as const};
  restored.apply('ANSWER','dm',response);
  assert.equal(restored.apply('ANSWER','dm',response).duplicate,true);
  assert.throws(()=>restored.apply('ANSWER','dm',{...response,id:'again'}));
  for(let i=0;i<count;i++) {
   const snapshot=restored.snapshot('ANSWER','p'+i);
   assert.equal(snapshot.case001!.notice,card.answer!.narration);
   assert.equal(snapshot.latestRoll!.result!.outcome,outcome);
   assert.equal(JSON.stringify(snapshot).includes('sentParts'),false);
  }
  assert.ok(card.answer!.dialogue);
  restored.apply('ANSWER','dm',{id:'dialogue',type:'dmPublish',cardId:card.id,part:'dialogue'});
  assert.equal(restored.snapshot('ANSWER','p0').case001!.notice,card.answer!.dialogue);
  assert.throws(()=>restored.apply('ANSWER','dm',{id:'dialogue-again',type:'dmPublish',cardId:card.id,part:'dialogue'}));
  assert.equal(r.rolls(),1);
 }
});
test('a rolled response cannot be released in another guided scene',()=>{
 const r=setup(2,11),card=r.panel().narration.find(c=>c.answer)!;
 r.send('dm','guided',{command:'scene',target:'A3'});
 assert.throws(()=>r.send('dm','dmPublish',{cardId:card.id}));
});
