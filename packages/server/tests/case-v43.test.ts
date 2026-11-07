import {readFileSync} from 'node:fs';
import {storyCheckOptions,runStoryCheck} from '../src/case001/storyDice.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {caseOptions} from '../src/case001/case001.js';
import {startCaseBattle,finishCaseBattle,caseOpportunity} from '../src/case001/caseBattle.js';
import {caseGrid} from '@baan/shared';
import {newGuided,observeGuidedScene,guidedDialogue,guidedCommand} from '../src/case001/guidedCase.js';
import {enqueueNarrative,newNarrative} from '../src/narrative.js';

function room(count=2,die=20) {
 let serial=0,rolls=0;
 const store=new WorldStore(()=>{rolls++;return die;},true,true,true);
 const code='V43';
 store.create(code,2);
 store.addPlayer(code,'dm');
 const send=(player:string,type:string,data:object={})=>store.apply(code,player,{id:String(++serial),type,...data}).snapshot;
 send('dm','claimDm');
 const players=['a','b','c','d'].slice(0,count);
 players.forEach((id,i)=>{store.addPlayer(code,id);send(id,'createCharacter',{profession:['medium','field_medic','occult_engineer','ritual_specialist'][i]});});
 send('dm','caseStart',{mode:'story'});
 const panel=()=>{const p=store.dmPanel(code,'dm');if(!('caseMode' in p))throw Error('case');return p;};
 const view=()=>store.snapshot(code,'a');
 const publish=(id:string)=>{const card=panel().narration.find(card=>card.eventId===id && card.current)!;assert.ok(card,id);send('dm','dmPublish',{cardId:card.id});};
 const scene=(id:string)=>{send('dm','guided',{command:'scene',target:id});if(!view().guided?.cue)publish('guided-cue:'+id);};
 const next=()=>{
  send('dm','guided',{command:'propose'});
  const before=view().guided!.transition!;
  assert.ok(before);
  send('a','guided',{command:'confirm',target:before.id});
  publish('guided-cue:'+view().guided!.scene);
 };
 publish('guided-cue:A1');
 return {store,send,panel,view,publish,scene,next,players,code,rolls:()=>rolls};
}
for(const count of [2,3,4]) test('v4.3 forward investigation and shared journal for '+count+' investigators',()=>{
 const r=room(count,1);
 assert.equal(r.view().guided?.prompts.length,3);
 assert.throws(()=>r.send('dm','guided',{command:'propose'}));
 r.scene('A3');r.next();
 assert.equal(r.view().guided?.phase,'B');
 assert.throws(()=>r.send('dm','dmTravel',{actionId:'travel:A',site:'B'}));
 assert.throws(()=>r.send('dm','guided',{command:'scene',target:'A1'}));
 assert.equal(r.view().guided?.journals.length,1);
 r.scene('B3');
 const check=r.view().case001!.actions.find(action=>action.id.startsWith('dice:B3_'))!;
 assert.ok(check);
 r.send('a','caseAction',{actionId:check.id,site:'B'});
 const pending=r.panel().investigators.find(p=>p.id==='a')!.check!;
 r.send('dm','dmRequestRoll',{targetId:'a',checkId:pending.id});
 r.send('a','dmRoll',{requestId:r.view().diceRequest!.id});
 assert.equal(r.view().latestRoll?.result?.outcome,'failure');
 assert.equal(r.rolls(),1);
 r.scene('B5');r.next();
 r.scene('C2');
 assert.ok(r.view().case001!.evidence>=1);
 assert.equal(r.rolls(),1);
 r.next();
 r.scene('D5');
 const track=r.view().case001!.actions.find(action=>action.id.startsWith('dice:D5_'))!;
 r.send('a','caseAction',{actionId:track.id,site:'D'});
 const pendingTrack=r.panel().investigators.find(p=>p.id==='a')!.check!;
 r.send('dm','dmRequestRoll',{targetId:'a',checkId:pendingTrack.id});
 r.send('a','dmRoll',{requestId:r.view().diceRequest!.id});
 assert.equal(r.view().latestRoll?.result?.outcome,'failure');
 r.next();
 r.scene('E4');assert.equal(r.view().case001!.rescued,0);
 r.scene('H1');
 assert.ok(!r.view().narrative?.current?.text.includes('ผมช่วยดำเนินการ'));
 r.scene('E2');
 r.scene('E3');
 assert.equal(r.view().case001!.rescued,0);
 r.next();
 assert.equal(r.view().guided!.phase,'FINAL');
 assert.equal(r.view().case001!.rescued,0);
 assert.equal(r.view().caseMap!.battle,undefined);
 assert.throws(()=>r.send('dm','guided',{command:'scene',target:'E2'}));
 const snapshot=r.view();
 for(const id of r.players) {
  assert.deepEqual(r.store.snapshot(r.code,id).guided,snapshot.guided);
  assert.equal('guidedScenes' in r.store.snapshot(r.code,id),false);
 }
 const saved=r.store.checkpoint(r.code),restored=new WorldStore(()=>{throw Error('reroll');});
 restored.restore(r.code,JSON.parse(JSON.stringify(saved)));
 assert.deepEqual(restored.snapshot(r.code,'a').guided,snapshot.guided);
 assert.deepEqual(restored.snapshot(r.code,'a').latestRoll,snapshot.latestRoll);
});
test('cue precedes prompts, hint requests are disabled and old scene questions are blocked',()=>{
 const r=room();
 r.send('dm','guided',{command:'scene',target:'A3'});
 assert.deepEqual(r.view().guided!.prompts,[]);
 r.publish('guided-cue:A3');
 assert.throws(()=>r.send('dm','guided',{command:'hint'}),/ถูกปิด/);
 assert.throws(()=>r.send('a','guided',{command:'hint'}));
 r.next();
 assert.equal(r.view().guided!.hint,undefined);
 r.scene('B2');
 r.send('a','askGm',{text:'เรื่องที่ดินเกี่ยวอย่างไร',site:'B'});
 const card=r.panel().questions![0];
 r.scene('B3');
 assert.equal(r.panel().questions![0].open,false);
 assert.throws(()=>r.send('dm','dmReply',{cardId:card.id,text:'ตอบเป็นวิชัย',speaker:'วิชัย'}));
});
test('v4.3 complete peaceful route reaches report A without revisiting a closed phase',()=>{
 const r=room();
 const act=(actionId:string)=>{
  r.send('a','caseAction',{actionId,site:r.view().caseMap!.site});
  const check=r.panel().investigators.find(p=>p.id==='a')?.check;
  if(check){r.send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});r.send('a','dmRoll',{requestId:r.view().diceRequest!.id});}
 };
 r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();
 r.scene('D2');act('seal1');act('seal2');r.scene('D5');r.next();
 r.scene('E4');act('seal3');r.scene('E2');
 for(const name of ['ดล','นิด','เพิ่ม'])act('escort:'+name);
 r.scene('E3');
 const answer=r.panel().investigators.find(p=>p.id==='a')!.choices.find(c=>c.speaker==='ดล' && c.label==='ถามที่ดิน')!;
 assert.ok(answer);
 r.send('dm','caseDm',{targetId:'a',actionId:answer.id});
 r.scene('H1');r.send('a','guided',{command:'history'});r.send('a','guided',{command:'evacuate'});r.next();
 assert.equal(r.view().guided!.scene,'F5');
 act('return');act('ritual');act('ritual');act('ritual');act('record-truth');act('finish');
 const ending=r.panel().narration.find(card=>card.eventId==='ending:A')!;
 assert.ok(ending);
 r.send('dm','dmPublish',{cardId:ending.id});
 assert.equal(r.view().case001!.report!.ending,'A');
});
test('temporary dispersal cannot force a final boss before recovery',()=>{
 const r=room();
 const saved=r.store.checkpoint(r.code);
 const w={...saved.world,backgroundUses:new Set(saved.backgroundUses)} as import('../src/world.js').World;
 w.case001!.site='D';w.case001!.guided!.phase='D';w.case001!.ghost='cautious';
 for(const id of r.players)w.caseMap!.sites[id]='D';
 startCaseBattle(w,'a',caseGrid('D'),()=>20);
 w.caseMap!.battle!.enemies[0].state.outcome='defeated';
 finishCaseBattle(w);
 w.case001!.site='E';w.case001!.guided!.phase='FINAL';w.case001!.minute=230;
 w.case001!.seals=[true,true,false];w.case001!.evidence.push('E05');
 assert.equal(caseOpportunity(w.case001!,w.caseMap!),undefined);
 assert.equal(w.case001!.ghost,'hidden');
});

test('v4.3 can resolve B, C and D through actual forward routes',()=>{
 for(const ending of ['B','C','D']) {
  const r=room();
  const act=(actionId:string)=>{
   r.send('a','caseAction',{actionId,site:r.view().caseMap!.site});
   const check=r.panel().investigators.find(p=>p.id==='a')?.check;
   if(check){r.send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});r.send('a','dmRoll',{requestId:r.view().diceRequest!.id});}
  };
  r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D5');r.next();
  r.scene('E4');
  if(ending!=='D')act('seal3');
  if(ending==='B') {
   r.scene('E2');r.scene('E3');
   const line=r.panel().investigators.find(p=>p.id==='a')!.choices.find(c=>c.speaker==='ดล' && c.label==='ถามที่ดิน')!;
   r.send('dm','caseDm',{targetId:'a',actionId:line.id});
   for(const name of ['ดล','นิด','เพิ่ม'])act('escort:'+name);
   r.send('a','guided',{command:'evacuate'});
  }
  r.next();
  if(ending==='B'){act('suppress');act('suppress');}
  act('finish');
  const card=r.panel().narration.find(c=>c.eventId==='ending:'+ending)!;
  assert.ok(card,ending);r.send('dm','dmPublish',{cardId:card.id});
  assert.equal(r.view().case001!.report!.ending,ending);
  assert.ok(r.panel().guidedScenes!.some(scene=>scene.id==='ENDING '+ending));
  assert.ok(r.view().case001!.report!.text.includes(card.text));
 }
});
test('all sixteen v4.3 checks preserve the three authored result branches',()=>{
 const r=room();
 const base=r.store.checkpoint(r.code).world;
 const definitions=JSON.parse(readFileSync(new URL('../scenarios/case-001/case-001.v4.3.DiceChecks.json',import.meta.url),'utf8')).checks;
 for(const check of definitions)for(const stat of check.stat.split('|'))for(const margin of [0,2,4]) {
  const w=structuredClone(base) as import('../src/world.js').World;
  delete w.dmSession;
  const s=w.case001!,g=s.guided!;
  s.site=check.scene_id[0]==='H'?'B':check.scene_id[0]==='F'?'E':check.scene_id[0];
  w.caseMap!.sites.a=s.site;
  g.phase=check.scene_id[0]==='F'?'FINAL':s.site;
  g.scene=check.scene_id;g.observed.push(check.scene_id);g.presented.push(check.scene_id);
  s.evidence=['E01','E02','E03','E04','E05','E06','E07'];
  s.story!.objectives.push('met-boonmee','v41-photo','v43-evacuation-records','v43-kaew-controller-blocked');
  s.ghost='cautious';s.opened=true;s.key=true;s.wichai!.site=s.site;
  if(check.scene_id==='F5')s.seals[2]=true;
  if(check.scene_id==='C4'){
   w.turns.a.ap=3;
   w.caseMap!.battle={id:'EN01',active:'a',enemies:[{state:{phase:'player'}}]} as unknown as NonNullable<NonNullable<typeof w.caseMap>['battle']>;
  }
  const option=storyCheckOptions(w,'a').find(o=>o.id==='dice:'+check.id+':'+stat)!;
  assert.ok(option,check.id);
  const value=w.characters!.a.coreStats![stat as keyof NonNullable<typeof w.characters.a.coreStats>];
  const die=check.dc-value-margin;
  assert.ok(die>=1 && die<=20);
  runStoryCheck(w,'a',option.id,undefined,()=>die);
  const recorded=s.storyChecks![check.id][0];
  const expected=margin===0?'full':margin===2?'partial':'failure';
  assert.equal(recorded.outcome,expected);
  assert.ok(s.narrativeEvents!.find(beat=>beat.eventId===option.id)?.text.includes(check[expected].dm));
 }
});

test('guided content keeps authored replies and skips overlapping legacy scene narration',()=>{
 const r=room();
 r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D5');r.next();
 r.scene('E2');
 assert.equal(r.panel().narration.some(card=>card.eventId==='captives-open'),false);
 const line=r.panel().investigators[0].choices.find(choice=>choice.speaker==='ดล' && choice.label==='ดล พูดหลัก');
 assert.ok(line);
 const snapshot=JSON.stringify(r.view());
 assert.equal(snapshot.includes('DM ลับ'),false);
 const script=readFileSync(new URL('../scenarios/case-001/case-001.v4.3.script.md',import.meta.url),'utf8');
 const authored=JSON.parse(readFileSync(new URL('../scenarios/case-001/case-001.v4.3.dialogue.json',import.meta.url),'utf8'));
 assert.ok(authored.every((line:{text:string})=>script.includes(line.text)));
 r.send('dm','caseDm',{targetId:'a',actionId:line.id});
 assert.equal(r.view().case001!.rescued,0);
 assert.equal(r.rolls(),0);
});

test('safe testimony bypasses uncertain dice and reopening a scene never repeats its cue',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B3');
 assert.ok(r.view().case001!.actions.some(option=>option.id.startsWith('dice:B3_')));
 r.send('dm','guided',{command:'protect'});
 assert.equal(r.view().case001!.actions.some(option=>option.id.startsWith('dice:B3_')),false);
 const line=r.panel().investigators[0].choices.find(choice=>choice.label==='คุยตามลำพังและทำให้ปลอดภัย');
 assert.ok(line);
 r.send('dm','caseDm',{targetId:'a',actionId:line.id});
 const saved=r.store.checkpoint(r.code);
 assert.ok(saved.world.case001!.evidence.includes('E08'));
 r.scene('B2');r.scene('B3');
 const cues=r.panel().narration.filter(card=>card.eventId==='guided-cue:B3').length;
 const delivered=r.view().narrative!.history.filter(beat=>beat.eventId==='guided-cue:B3').length;
 assert.equal(cues+delivered,1);
 assert.equal(r.rolls(),0);
});

test('handoff journal excludes private narration and retains open questions',()=>{
 const r=room();
 const saved=r.store.checkpoint(r.code);
 const w={...saved.world,backgroundUses:new Set(saved.backgroundUses)} as import('../src/world.js').World;
 w.case001!.guided=newGuided();
 w.narrative=newNarrative();
 observeGuidedScene(w,'A3');w.case001!.guided.presented.push('A3');
 w.case001!.guided.questions.push('ยังมีใครอยู่ที่บ้านดล');
 enqueueNarrative(w.narrative,{eventId:'private',text:'ข้อมูลเฉพาะคนเดียว',site:'A'},['a']);
 enqueueNarrative(w.narrative,{eventId:'shared',text:'ข้อมูลที่ทีมรับรู้ร่วมกัน',site:'A'},['a','b']);
 guidedCommand(w,'dm','propose');
 assert.deepEqual(w.case001!.guided.transition!.known_facts,['ข้อมูลที่ทีมรับรู้ร่วมกัน']);
 assert.deepEqual(w.case001!.guided.transition!.open_questions,['ยังมีใครอยู่ที่บ้านดล']);
 assert.equal(guidedDialogue(w.case001!).some(line=>line.speaker==='แม่แก้ว'),false);
});

test('replayed confirmation cannot advance or repeat a saved chapter',()=>{
 const r=room();r.scene('A3');
 assert.throws(()=>r.send('a','guided',{command:'hint'}),/ถูกปิด/);
 r.send('a','askGm',{text:'จดชื่อผู้สูญหายไว้ครบหรือยัง',site:'A'});
 r.send('dm','guided',{command:'propose'});
 const action={id:'confirm-once',type:'guided' as const,command:'confirm',target:r.view().guided!.transition!.id};
 r.store.apply(r.code,'a',action);
 const checkpoint=JSON.parse(JSON.stringify(r.store.checkpoint(r.code)));
 const restored=new WorldStore(()=>{throw Error('must not reroll');});restored.restore(r.code,checkpoint);
 const replay=restored.apply(r.code,'a',action);
 assert.equal(replay.duplicate,true);
 assert.equal(restored.snapshot(r.code,'a').guided!.phase,'B');
 assert.equal(restored.snapshot(r.code,'a').guided!.journals.length,1);
 assert.equal(restored.checkpoint(r.code).world.case001!.guided!.hints.A,undefined);
 assert.deepEqual(restored.snapshot(r.code,'a').guided!.journals[0].open_questions,['จดชื่อผู้สูญหายไว้ครบหรือยัง']);
 assert.throws(()=>restored.apply(r.code,'b',{...action,id:'stale-confirmation'}));
 assert.equal(restored.snapshot(r.code,'a').guided!.phase,'B');
});
