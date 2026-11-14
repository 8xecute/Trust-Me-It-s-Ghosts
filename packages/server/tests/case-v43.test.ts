import {readFileSync} from 'node:fs';
import {storyCheckOptions,runStoryCheck} from '../src/case001/storyDice.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {caseOptions} from '../src/case001/case001.js';
import {startCaseBattle,finishCaseBattle,caseOpportunity} from '../src/case001/caseBattle.js';
import {caseGrid} from '@baan/shared';
import {newGuided,observeGuidedScene,guidedDialogue,guidedCommand,allowedGuidedScenes} from '../src/case001/guidedCase.js';
import {enqueueNarrative,newNarrative} from '../src/narrative.js';

function room(count=2,die=20) {
 let serial=0,rolls=0;
 const store=new WorldStore(()=>{rolls++;return die;},true,true,true);
 const code='V43';
 store.create(code,2);
 store.addPlayer(code,'dm');
 const send=(player:string,type:string,data:object={})=>store.apply(code,player,{id:String(++serial),type,...data}).snapshot;
 send('dm','claimDm');
 const players=['a','b','c','d','e','f'].slice(0,count);
 players.forEach((id,i)=>{store.addPlayer(code,id);send(id,'createCharacter',{profession:['medium','field_medic','occult_engineer','ritual_specialist','paranormal_investigator','containment_specialist'][i]});});
 send('dm','caseStart',{mode:'story'});
 const panel=()=>{const p=store.dmPanel(code,'dm');if(!('caseMode' in p))throw Error('case');return p;};
 const view=()=>store.snapshot(code,'a');
 const publish=(id:string)=>{const card=panel().narration.find(card=>card.eventId===id && card.current)!;assert.ok(card,id);send('dm','dmPublish',{cardId:card.id});};
 const scene=(id:string)=>{send('dm','guided',{command:'scene',target:id});if(!view().guided?.cue)publish('guided-cue:'+id);};
 const openCellar=()=>{send('a','caseAction',{actionId:'open',site:'E'});publish('guided-cellar-open');};
 const next=()=>{
  send('dm','guided',{command:'propose'});
  const before=view().guided!.transition!;
  assert.ok(before);
  send('a','guided',{command:'confirm',target:before.id});
  publish('guided-cue:'+view().guided!.scene);
 };
 publish('guided-cue:A1');
 return {store,send,panel,view,publish,scene,openCellar,next,players,code,rolls:()=>rolls};
}
for(const count of [2,3,4,6]) test('v4.3 forward investigation and shared journal for '+count+' investigators',()=>{
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
 r.scene('E2');r.openCellar();
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
 assert.throws(()=>r.send('a','askGm',{text:'เรื่องที่ดินเกี่ยวอย่างไร',site:'B'}),/เลิกใช้/);
});
for(const count of [2,6]) test('v4.3 complete peaceful route reaches report A with '+count+' players',()=>{
 const r=room(count);
 const act=(actionId:string)=>{
  r.send('a','caseAction',{actionId,site:r.view().caseMap!.site});
  const check=r.panel().investigators.find(p=>p.id==='a')?.check;
  if(check){r.send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});r.send('a','dmRoll',{requestId:r.view().diceRequest!.id});}
 };
 r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();
 r.scene('D2');act('seal1');act('seal2');r.scene('D5');r.next();
 r.scene('E4');act('seal3');r.scene('E2');r.openCellar();
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
   r.scene('E2');r.openCellar();r.scene('E3');
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
 r.scene('E2');r.openCellar();
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
 assert.throws(()=>r.send('a','askGm',{text:'จดชื่อผู้สูญหายไว้ครบหรือยัง',site:'A'}),/เลิกใช้/);
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
 assert.deepEqual(restored.snapshot(r.code,'a').guided!.journals[0].open_questions,[]);
 assert.throws(()=>restored.apply(r.code,'b',{...action,id:'stale-confirmation'}));
 assert.equal(restored.snapshot(r.code,'a').guided!.phase,'B');
});


test('opening narration precedes scene dialogue and carries the authored A2 description',()=>{
 const r=room();
 r.send('dm','guided',{command:'scene',target:'A2'});
 const cue=r.panel().narration.find(card=>card.eventId==='guided-cue:A2')!;
 assert.match(cue.text,/วิทยุสื่อสารในรถส่งเสียงซ่า/);
 assert.match(cue.text,/หายใจเหมือนคนกำลังสำลักน้ำ/);
 assert(!r.panel().investigators[0].choices.some(choice=>choice.speaker==='ประเสริฐ'));
 assert.throws(()=>r.send('a','caseAction',{actionId:'dice:A2_RADIO_ECHO:SPI',site:'A'}),/ส่งบทเปิดฉาก/);
 r.publish('guided-cue:A2');
 assert.equal(r.view().narrative!.current!.text,cue.text);
 assert(r.panel().investigators[0].choices.some(choice=>choice.speaker==='ประเสริฐ'));
});

test('E2 keeps the door closed until the team acts and the DM delivers the opening',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D5');r.next();
 r.scene('E2');
 assert.match(r.view().narrative!.current!.text,/ใครน่ะ/);
 assert.equal(r.store.checkpoint(r.code).world.case001!.opened,false);
 assert(r.view().case001!.actions.some(action=>action.id==='open' && !action.check));
 assert(!r.panel().investigators[0].choices.some(choice=>choice.label==='ดล พูดหลัก'));
 assert(r.panel().investigators[0].choices.some(choice=>choice.label==='หากทีมยืนยันเป็นบริษัท'));
 assert.throws(()=>r.scene('E3'));
 r.send('a','caseAction',{actionId:'open',site:'E'});
 assert.equal(r.store.checkpoint(r.code).world.case001!.opened,false);
 assert(!r.view().case001!.actions.some(action=>action.id==='open' || action.id.startsWith('escort:')));
 assert.throws(()=>r.send('dm','guided',{command:'scene',target:'E4'}),/ส่งบทเปิดห้อง/);
 const pending=r.panel().narration.find(card=>card.eventId==='guided-cellar-open')!;
 assert.match(pending.text,/ชายสองคนและหญิงหนึ่งคน/);
 const save=r.store.checkpoint(r.code),restored=new WorldStore(()=>20,true,true,true);
 restored.restore(r.code,JSON.parse(JSON.stringify(save)));
 assert.equal(restored.checkpoint(r.code).world.case001!.opened,false);
 const restoredPanel=restored.dmPanel(r.code,'dm');assert('caseMode' in restoredPanel);
 const restoredCard=restoredPanel.narration.find(card=>card.eventId==='guided-cellar-open')!;
 restored.apply(r.code,'dm',{id:'restored-cellar',type:'dmPublish',cardId:restoredCard.id});
 assert.equal(restored.checkpoint(r.code).world.case001!.opened,true);
 r.publish('guided-cellar-open');
 assert.equal(r.store.checkpoint(r.code).world.case001!.opened,true);
 assert(r.view().case001!.actions.some(action=>action.id==='escort:ดล'));
 assert(r.panel().investigators[0].choices.some(choice=>choice.label==='ดล พูดหลัก'));
 assert(!r.panel().investigators[0].choices.some(choice=>choice.label==='หากทีมยืนยันเป็นบริษัท'));
 assert.equal(r.view().case001!.rescued,0);
});

test('E5 debt response requires a discovered source, while C5 retains the relationship testimony',()=>{
 const r=room();const saved=r.store.checkpoint(r.code);const s=saved.world.case001!;
 s.guided!.phase='E';s.guided!.scene='E5';s.guided!.presented.push('E5');s.site='E';s.wichai!.site='E';
 assert(!guidedDialogue(s).some(line=>line.id==='E5-debt-evidence'));
 s.evidence.push('E02');assert(guidedDialogue(s).some(line=>line.id==='E5-debt-evidence'));
 s.guided!.phase='C';s.guided!.scene='C5';s.guided!.presented.push('C5');s.site='C';
 assert(guidedDialogue(s).some(line=>line.id==='C5-relationship'));
});

test('DM backup follows scene progress and never exposes private guidance to players',()=>{
 const r=room();const before=r.store.checkpoint(r.code);
 const backup=r.panel().backup!;
 assert.equal(backup.phase,'A');assert(backup.hints.length);assert(backup.alternatives.length);
 assert(backup.blockers.some(text=>text.includes('A3')));
 assert(!JSON.stringify(r.view()).includes('backup'));
 assert.throws(()=>r.store.dmPanel(r.code,'a'));
 assert.deepEqual(r.store.checkpoint(r.code),before);
 r.scene('A3');assert.equal(r.panel().backup!.blockers.length,0);
 r.send('dm','guided',{command:'propose'});
 assert(r.panel().backup!.blockers.some(text=>text.includes('ยืนยัน')));
});


test('DM can pause, resume and withdraw before Final while players cannot bypass pause',()=>{
 const r=room();const before=r.view();
 assert.throws(()=>r.send('a','dmSessionControl',{command:'pause'}));
 r.send('dm','dmSessionControl',{command:'pause'});assert(r.view().paused);
 assert.throws(()=>r.send('dm','guided',{command:'scene',target:'A3'}),/พักคดี/);
 assert.throws(()=>r.send('a','askGm',{text:'ไปต่อ',site:'A'}),/เลิกใช้/);
 assert.equal(r.view().case001!.time,before.case001!.time);
 r.send('dm','dmSessionControl',{command:'resume'});assert(!r.view().paused);
 r.send('dm','dmSessionControl',{command:'withdraw'});
 const ending=r.panel().narration.find(card=>card.eventId==='ending:D')!;assert(ending);
 r.send('dm','dmPublish',{cardId:ending.id});assert.equal(r.view().case001!.report!.ending,'D');
});

test('H1 allows a delivered telephone contact before a remote confession',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D5');r.next();r.scene('E4');r.scene('H1');
 assert(!r.panel().investigators[0].choices.some(c=>c.speaker==='ประเสริฐ'));
 assert.throws(()=>r.send('dm','guided',{command:'contactPrasert'}));
 r.send('a','guided',{command:'history'});
 r.send('dm','guided',{command:'contactPrasert'});
 assert(!r.panel().investigators[0].choices.some(c=>c.speaker==='ประเสริฐ'));
 r.publish('guided-contact-prasert');
 const line=r.panel().investigators[0].choices.find(c=>c.speaker==='ประเสริฐ')!;assert(line);
 r.send('dm','caseDm',{targetId:'a',actionId:line.id});
 assert.match(r.view().narrative!.current!.text,/ทางโทรศัพท์/);
 assert(r.store.checkpoint(r.code).world.case001!.story!.objectives.includes('confessed'));
});

test('chapter rewind restores a persisted checkpoint, pauses play and keeps revisions increasing',()=>{
 const r=room();r.scene('A3');r.next();
 const beginning=r.store.checkpoint(r.code);assert(beginning.rewind);
 r.scene('B4');const revision=r.view().revision;assert(r.view().case001!.evidence>0);
 assert.throws(()=>r.send('a','dmSessionControl',{command:'rewind'}));
 const restored=new WorldStore(()=>20,true,true,true);restored.restore(r.code,JSON.parse(JSON.stringify(r.store.checkpoint(r.code))));
 restored.apply(r.code,'dm',{id:'rewind-test',type:'dmSessionControl',command:'rewind'});
 const after=restored.snapshot(r.code,'a');assert(after.paused);assert(after.revision>revision);
 assert.equal(after.guided!.scene,'B1');assert.equal(after.case001!.evidence,beginning.world.case001!.evidence.length);
 assert.throws(()=>restored.apply(r.code,'a',{id:'while-paused',type:'askGm',text:'ถาม',site:'B'}));
 restored.apply(r.code,'dm',{id:'resume-test',type:'dmSessionControl',command:'resume'});assert(!restored.snapshot(r.code,'a').paused);
});

test('ritual requests recommend INT to the DM instead of the generic PER default',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D5');r.next();r.scene('E4');
 r.send('a','caseAction',{actionId:'seal3',site:'E'});
 const check=r.panel().investigators.find(p=>p.id==='a')!.check!;assert.equal(check.stat,'INT');
 r.send('dm','dmRequestRoll',{targetId:'a',checkId:check.id,stat:check.stat,difficulty:14});
 r.send('a','dmRoll',{requestId:r.view().diceRequest!.id});
 assert.equal(r.view().latestRoll!.result!.total,20+r.view().characters!.a.coreStats!.INT);
});


test('C4 script is available before combat, opens on start and remains readable afterwards',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B5');r.next();
 assert(!r.panel().guidedScenes!.some(scene=>scene.id==='C4'));
 r.scene('C2');assert(r.panel().guidedScenes!.some(scene=>scene.id==='C4'));
 r.send('a','start');assert.equal(r.view().guided!.scene,'C4');
 const cue=r.panel().narration.find(card=>card.eventId==='guided-cue:C4')!;assert(cue?.current);
 assert.match(cue.text,/น้ำสีดำ/);
 assert(!r.panel().narration.some(card=>card.eventId==='EN01:start'));
 assert(!r.view().narrative!.history.some(beat=>beat.eventId==='guided-cue:C4'));
 r.publish('guided-cue:C4');assert(r.view().narrative!.history.some(beat=>beat.eventId==='guided-cue:C4'));
 const saved=r.store.checkpoint(r.code);finishCaseBattle(saved.world,true);
 assert(allowedGuidedScenes(saved.world).some(scene=>scene.id==='C4'));
});

test('starting combat after the DM read C4 never duplicates its opening',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.scene('C4');
 r.send('a','start');
 assert.equal(r.view().narrative!.history.filter(beat=>beat.eventId==='guided-cue:C4').length,1);
 assert(!r.panel().narration.some(card=>card.eventId==='guided-cue:C4' || card.eventId==='EN01:start'));
});
