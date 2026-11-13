import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {caseOptions, caseView, newCase, tick} from '../src/case001/case001.js';
import {allowedGuidedScenes, newGuided} from '../src/case001/guidedCase.js';
import {newState51, resolveEnding51, validateSave51} from '../src/case001/storyV51.js';
import {storyContent} from '../src/case001/v51Content.js';
import {addFact, hasFact} from '../src/case001/caseStory.js';

function room(die=20,lethal=false,version:'5.2'|'5.3'|'5.5'='5.2') {
 let serial=0;
 const store=new WorldStore(()=>die,true,true,true,false,version,lethal),code='V52';
 store.create(code,2);
 store.addPlayer(code,'dm');
 const send=(player:string,type:string,data:object={})=>store.apply(code,player,{id:String(++serial),type,...data}).snapshot;
 send('dm','claimDm');
 const roles=['medium','field_medic','occult_engineer','ritual_specialist','containment_specialist','paranormal_investigator'];
 const players=['a','b','c','d','e','f'];
 players.forEach((id,i)=>{store.addPlayer(code,id);send(id,'createCharacter',{profession:roles[i]});});
 send('dm','caseStart',{mode:'story'});
 const panel=()=>{
  const value=store.dmPanel(code,'dm');
  if(!('caseMode' in value) || !value.storyReader)throw Error('missing reader');
  return value;
 };
 const view=(id='a')=>store.snapshot(code,id);
 const saved=()=>store.checkpoint(code);
 const state=()=>saved().world.case001!;
 const publish=(eventId:string)=>{
  const card=panel().narration.find(c=>c.eventId===eventId && c.current);
  assert.ok(card,eventId);
  send('dm','dmPublish',{cardId:card.id});
 };
 const scene=(id:string)=>{
  send('dm','guided',{command:'scene',target:id});
  if(!view().guided?.cue)publish('guided-cue:'+id);
 };
 const event=(id:string)=>send('dm','guided',{command:'v51:'+id});
 const next=()=>{
  send('dm','guided',{command:'propose'});
  if(view().guided!.transition)send(version==='5.5'?'dm':'a','guided',{command:'confirm',target:view().guided!.transition!.id});
  const cue=panel().narration.find(c=>c.current && c.eventId==='guided-cue:'+view().guided!.scene);
  if(cue)publish(cue.eventId);
 };
 const act=(actionId:string)=>{
  if(version==='5.5' || panel().investigators.find(entry=>entry.id==='a')?.actions.some(option=>option.id===actionId && option.check))
   send('dm','caseDm',{targetId:'a',actionId});
  else send('a','caseAction',{actionId,site:view().caseMap!.site});
  const check=panel().investigators.find(p=>p.id==='a')?.check;
  if(check){
   send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});
   send('a','dmRoll',{requestId:view().diceRequest!.id});
  }
 };
 const say=(predicate:(text:string)=>boolean)=>{
  const id=view().guided!.scene;
  const line=panel().storyReader!.scenes.find(s=>s.id===id)!.dialogue.find(l=>predicate(l.text));
  assert.ok(line,id);
  const actionId='guided-talk:'+line.id;
  if(!panel().investigators[0].choices.some(c=>c.id===actionId))event('context:'+line.id);
  send('dm','caseDm',{targetId:'a',actionId});
 };
 const toE=({history=false,wichai=false}={})=>{
  scene('A3');next();
  if(wichai)event('wichai-depart:D');
  scene('B5');next();scene('C2');
  if(history){scene('C5');say(t=>t.includes('ไม่ได้เห็นคนเปิดประตู'));}
  next();
  if(wichai)event('wichai-depart:E');
  scene('D5');next();
 };
 const rescue=()=>{
  act('open');scene('E2');
  for(const name of ['ดล','นิด','เพิ่ม'])act('escort:'+name);
  send('a','guided',{command:'evacuate'});
 };
 publish('guided-cue:A1');
 return {store,code,send,panel,view,saved,state,publish,scene,event,next,act,say,toE,rescue,players};
}

test('v5.2 imports all 31 complete scenes, four endings and 48 source branches with original dice rules',()=>{
 const data=storyContent({guided:{version:'5.2'}});
 const ids='A1 A2 A3 B1 B2 B3 B4 B5 C1 C2 C3 C4 C5 D1 D2 D3 D4 D5 E1 E2 E3 E4 E5 E6 H1 F1 F2 F3 F4 F5 F6'.split(' ');
 assert.deepEqual(Object.keys(data.scenes).sort(),ids.sort());
 assert.deepEqual(Object.keys(data.endings),['A','B','C','D']);
 const legacy=JSON.parse(readFileSync(new URL('../scenarios/case-001/case-001.v4.3.DiceChecks.json',import.meta.url),'utf8'));
 const rules=(checks:typeof data.checks)=>checks.map(c=>[c.id,c.scene_id,c.stat,c.dc,c.partial_margin]);
 assert.deepEqual(rules(data.checks),rules(legacy.checks));
 for(const scene of Object.values(data.scenes)) {
  for(const key of ['purpose','presence','dmReadAloud','npcLines','responses','clues','fallback','nextSceneHandoff','dmSecret'] as const)assert.ok(scene[key],scene.id+':'+key);
  assert.ok(scene.dialogue.every(l=>data.script.includes(l.text)));
 }
 for(const check of data.checks)for(const key of ['full','partial','failure'] as const) {
  const branch=check[key];
  assert.ok(data.script.includes(branch.dm) && data.script.includes(branch.dialogue));
  assert.match(branch.state!,/CHECK_RESULTS\./);
 }
});

test('six-player v5.2 room: private reader is passive, DM opens A2, optional failure allows progress',()=>{
 const r=room(1);
 const start=r.state();
 assert.equal(r.panel().storyReader!.scenes.length,31);
 assert.deepEqual(r.state(),start);
 assert.throws(()=>r.store.dmPanel(r.code,'a'));
 r.scene('A2');
 assert.throws(()=>r.scene('F6'));
 r.act('dice:A2_RADIO_ECHO:SPI');
 assert.equal(r.state().storyChecks!.A2_RADIO_ECHO.at(-1)!.outcome,'failure');
 r.publish('dice:A2_RADIO_ECHO:SPI');
 assert.match(r.view().narrative!.history.at(-1)!.text,/สัญญาณหายไปแล้ว/);
 r.toE();
 for(const id of r.players) {
  const view=r.view(id);
  assert.equal(view.caseMap!.site,'E');
  assert.equal(view.guided!.version,'5.2');
  assert.equal(view.case001!.time,undefined);
  assert.ok(view.case001!.actions.every(a=>a.minutes===0));
  for(const secret of ['storyReader','sourceMarkdown','dmSecret','storyState','TIME_MINUTES','RITUAL_0300','contextConfirmed'])assert.ok(!JSON.stringify(view).includes(secret),secret);
 }
 assert.equal(r.state().minute,0);
 assert.equal(r.state().v51!.KAEW_D_RESULT,'not_met');
 assert.ok(!r.panel().guidedScenes!.some(s=>s.id==='E5'));
});

for(const version of ['5.2','5.3','5.5'] as const)test(version+' DM opens A2 and grants only a supported roll',()=>{
 const r=room(20,false,version);
 r.scene('A2');
 assert.ok(!r.state().milestones.includes('arrival-investigated'));
 const actionId='dice:A2_RADIO_ECHO:SPI';
 const before=r.saved();
 r.panel();r.panel();
 assert.deepEqual(r.saved(),before);
 assert.throws(()=>r.send('a','caseAction',{actionId,site:'A'}),/DM/);
 assert.throws(()=>r.send('dm','dmRequestRoll',{targetId:'a',stat:'SPI',difficulty:14}),/ฉากรองรับ/);
 assert.throws(()=>r.send('dm','caseDm',{targetId:'a',actionId:'dice:E4_BRACELET_DECODE:INT'}));
 r.send('dm','caseDm',{targetId:'a',actionId});
 const check=r.panel().investigators.find(entry=>entry.id==='a')!.check!;
 const original=storyContent(r.state()).checks.find(check=>check.id==='A2_RADIO_ECHO')!;
 assert.equal(check.dice!.stat,original.stat);
 assert.equal(check.dice!.dc,original.dc);
 assert.ok(!r.view().diceRequest);
 assert.throws(()=>r.send('dm','dmRequestRoll',{targetId:'a',checkId:check.id,difficulty:original.dc===14?17:14}),/รักษา DC/);
 r.send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});
 const request=r.view().diceRequest!;
 assert.equal(request.die,null);
 assert.throws(()=>r.send('b','dmRoll',{requestId:request.id}));
 r.send('a','dmRoll',{requestId:request.id});
 assert.equal(r.state().storyChecks!.A2_RADIO_ECHO.length,1);
});

test('v5.5 reader stays concise and DM sends reviewed Q&A directly without a player ticket',()=>{
 const r=room(20,false,'5.5');
 const reader=r.panel().storyReader!;
 assert.equal(reader.scenes.length,31);
 assert.equal(reader.qa!.length,262);
 for(const scene of reader.scenes) {
  assert.ok(scene.brief[0],scene.id);
  assert.doesNotMatch(scene.brief.join(' '),/ACTION-DRIVEN|Visible Cue|DM GUIDE|<a |\*\*|^>/);
 }
 assert.ok(reader.scenes.find(scene=>scene.id==='A3')!.brief[0].length<250);
 const qa=reader.qa!.find(q=>reader.sendableQaIds!.includes(q.id) && q.answer)!;
 assert.ok(qa);
 const state=r.state();
 assert.equal(r.panel().questions!.length,0);
 assert.throws(()=>r.send('a','dmSendQa',{qaId:qa.id,text:'ปลอมสิทธิ์'}));
 assert.throws(()=>r.send('dm','dmSendQa',{qaId:'E5_Q001',text:'ผิดฉาก'}));
 assert.throws(()=>r.send('dm','dmSendQa',{qaId:qa.id,text:''}));
 r.send('dm','dmSendQa',{qaId:qa.id,text:qa.answer});
 assert.deepEqual(r.state(),state);
 assert.equal(r.panel().storyReader!.answers!.at(-1)!.qaId,qa.id);
 for(const id of r.players)assert.ok(r.view(id).narrative!.history.at(-1)!.text.includes(qa.answer));
 const checkpoint=r.saved();r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 assert.equal(r.panel().storyReader!.answers!.at(-1)!.qaId,qa.id);
 r.scene('A3');
 assert.throws(()=>r.send('dm','dmSendQa',{qaId:qa.id,text:qa.answer}));
 const guide=r.panel().storyReader!.qa!.find(q=>q.kind==='action')!;
 assert.equal(guide.answer,'');
 assert.throws(()=>r.send('dm','dmSendQa',{qaId:guide.id,text:'คำสั่ง DM'}));
});

test('v5.5 DM alone controls story changes and advances without player confirmation',()=>{
 const r=room(20,false,'5.5');
 assert.throws(()=>r.send('a','askGm',{site:'A',text:'ข้อความ'}),/ไม่ใช้ระบบส่งข้อความ/);
 assert.throws(()=>r.send('a','guided',{command:'propose'}),/DM/);
 assert.throws(()=>r.send('a','caseAction',{actionId:'survey-arrival',site:'A'}),/DM/);
 assert.throws(()=>r.send('a','guided',{command:'scene',target:'A3'}),/DM/);
 r.scene('A3');
 const before=r.saved();
 assert.throws(()=>r.send('a','guided',{command:'confirm',target:'ปลอม'}),/DM/);
 r.send('dm','guided',{command:'propose'});
 assert.equal(r.state().guided!.phase,'B');
 assert.equal(r.state().guided!.scene,'B1');
 assert.equal(r.state().guided!.transition,undefined);
 assert.equal(r.state().guided!.journals.length,before.world.case001!.guided!.journals.length+1);
 assert.ok(r.players.every(id=>r.view(id).caseMap!.site==='B'));
 assert.throws(()=>r.send('a','guided',{command:'evacuate'}),/DM/);
 assert.throws(()=>r.send('a','guided',{command:'select-disclosure',target:'{}'}),/DM/);
});

test('E4 bag is required, H1 follows actual evidence and testimony without moving any player',()=>{
 const r=room();r.toE({history:true});
 assert.throws(()=>r.scene('H1'));r.scene('E4');
 assert.ok(!r.view().guided!.cue!.includes('หนังสือทวงหนี้'));
 assert.ok(!r.view().case001!.actions.some(a=>a.id==='clue:E07'));
 assert.throws(()=>r.event('collect-flood'));
 assert.throws(()=>r.send('a','guided',{command:'v51:collect-land'}));
 r.act('search-ritual-bag');r.publish('search-ritual-bag');r.event('collect-land');r.event('collect-flood');
 assert.ok(r.state().v51!.LAND_EVIDENCE_COLLECTED && r.state().v51!.FLOOD_EVIDENCE_COLLECTED);
 r.scene('H1');
 assert.equal(r.view().caseMap!.site,'E');
 assert.throws(()=>r.send('a','guided',{command:'history'}));
 r.act('dice:H1_FLOOD_TIMELINE:INT');r.publish('dice:H1_FLOOD_TIMELINE:INT');
 assert.equal(r.state().v51!.FLOOD_TRUTH,'evidence');
 assert.ok(!hasFact(r.state(),'confessed'));
 assert.ok(!r.view().narrative!.history.at(-1)!.text.includes('ผมร่วมตัดสินใจ'));
 r.send('dm','guided',{command:'contactPrasert'});r.publish('guided-contact-prasert');
 r.say(t=>t.includes('ร่วมตัดสินใจให้เปิด'));
 assert.ok(hasFact(r.state(),'confessed'));
});

test('F6 needs delivered warning and deliberate action, opens reaction before resolution, and never kills',()=>{
 const r=room(20,true);r.toE();r.scene('E4');
 assert.throws(()=>r.act('unsafe-bracelet'));
 r.act('approach-ritual-core');
 assert.throws(()=>r.act('unsafe-bracelet'));
 r.publish('approach-ritual-core');
 r.act('unsafe-bracelet');
 assert.equal(r.view().guided!.scene,'F6');
 assert.equal(r.state().v51!.backlash!.announced,false);
 assert.throws(()=>r.event('backlash-resolved'));
 r.publish('guided-cue:F6');
 r.event('backlash-resolved');
 assert.equal(r.state().v51!.RITUAL_STATUS,'active');
 assert.equal(r.state().v51!.HOSTAGE_FATE.เพิ่ม,'alive');
 assert.equal(r.state().v51!.DEATH_CAUSE.เพิ่ม,null);
 r.act('seal3');assert.equal(r.state().v51!.RITUAL_STATUS,'stopped');
 assert.deepEqual(Object.values(r.state().v51!.RITUAL_TETHER_INTACT),[false,false,false]);
 assert.throws(()=>r.scene('F6'));
});

test('rescue and seal remain independent, F6 can be skipped, v5.2 restore keeps six characters and state',()=>{
 const r=room();r.toE();r.rescue();
 assert.equal(r.state().v51!.HOSTAGES_FOUND,3);
 assert.equal(r.view().case001!.rescued,3);
 assert.deepEqual(Object.values(r.state().v51!.RITUAL_TETHER_INTACT),[true,true,true]);
 r.next();
 assert.equal(r.view().guided!.phase,'FINAL');
 assert.ok(!r.panel().guidedScenes!.some(s=>s.id==='F1'));
 r.scene('E4');r.act('seal3');r.scene('F5');
 const replacement=new WorldStore(()=>20,true,true,true,false,'5.2');
 replacement.restore(r.code,JSON.parse(JSON.stringify(r.saved())));
 assert.equal(JSON.stringify(replacement.snapshot(r.code,'f')),JSON.stringify(r.view('f')));
 assert.equal(r.state().guided!.observed.includes('F6'),false);
});

test('E5 crossfire requires real Wichai arrival, endangered hostage and published reaction',()=>{
 const r=room(20,true);r.toE({wichai:true});
 r.act('open');r.scene('E2');r.act('escort:นิด');
 r.scene('E5');
 assert.throws(()=>r.event('shield:เพิ่ม'));
 r.event('e5-threat');
 assert.throws(()=>r.event('shield:นิด'));
 r.event('shield:เพิ่ม');
 assert.throws(()=>r.event('fatal'));
 r.publish('v51:crossfire-window');
 r.event('fatal');
 assert.equal(r.state().v51!.DEATH_CAUSE.เพิ่ม,'crossfire_wichai');
 assert.throws(()=>r.event('fatal'));
 r.scene('E4');r.act('seal3');r.next();r.act('finish');
 assert.equal(r.state().report!.ending,'C');
 assert.equal(r.state().report!.time,undefined);
});

test('F5 execution uses reaction and ends in B only after actual death, with all hostages safe',()=>{
 const r=room(20,true);r.toE({wichai:true});r.rescue();r.scene('E4');r.act('seal3');r.next();
 assert.equal(r.view().guided!.scene,'F5');
 r.event('evidence-insufficient');assert.throws(()=>r.event('attempt'));
 r.event('f5-question');assert.throws(()=>r.event('attempt'));r.publish('v52:f5-question');
 r.event('attempt');assert.throws(()=>r.event('fatal'));
 r.publish('v51:execution-window');r.event('fatal');
 assert.equal(r.state().v51!.WICHAI_DEATH_CAUSE,'kaew_execution');
 r.act('finish');assert.equal(r.state().report!.ending,'B');
 assert.equal(r.state().v51!.ENDING_MODIFIER,'vigilante_ghost');
});

test('new scenes, actions and save state never use mission time',()=>{
 const state=newCase(true,4,'4.1');
 state.guided=newGuided('5.2');state.v51=newState51(true,true);
 for(const minutes of [10,240,500,10000])tick(state,minutes);
 assert.equal(state.minute,0);
 assert.equal(state.v51.RITUAL_STATUS,'active');
 assert.equal(state.v51.HOSTAGE_FATE.เพิ่ม,'alive');
 assert.equal(state.v51.PLAYER_DEATHS,0);
 assert.equal(caseView(state).time,undefined);
 assert.ok(caseOptions(state).every(option=>option.minutes===0));
 validateSave51(state);
 state.v51.RITUAL_0300_PRESTATE='active';
 assert.throws(()=>validateSave51(state),/State v5.2/);
});

test('ending priority A–D uses actual safety, evidence, disclosure and ritual state',()=>{
 const state=newCase(true,4,'4.1');
 state.guided=newGuided('5.2');const v=state.v51=newState51(false,true);
 assert.equal(resolveEnding51(state),'D');
 v.RITUAL_STATUS='stopped';v.humanCaseSupported=true;v.KAEW_FINAL='calm';
 state.evacuated=['ดล','นิด','เพิ่ม'];
 assert.equal(resolveEnding51(state),'C');
 v.pastDisclosed=true;
 assert.equal(resolveEnding51(state),'A');
 v.KAEW_FINAL='hostile';
 assert.equal(resolveEnding51(state),'B');
 v.HOSTAGE_FATE.เพิ่ม='dead';v.DEATH_CAUSE.เพิ่ม='crossfire_wichai';
 assert.equal(resolveEnding51(state),'C');
 v.PLAYER_DEATHS=1;
 assert.equal(resolveEnding51(state),'D');
 assert.equal(v.ENDING_MODIFIER,'fallen_agent');
});

test('F4 and D4 require real encounter state; F1 and F2 cannot open by passing time',()=>{
 const r=room();r.toE();
 const w=r.saved().world,s=w.case001!;
 s.guided!.phase='D';s.site='D';
 assert.ok(!allowedGuidedScenes(w).some(scene=>scene.id==='D4'));
 s.guided!.phase='FINAL';s.site='E';
 tick(s,900);
 assert.ok(!allowedGuidedScenes(w).some(scene=>['F1','F2','F3','F4','F6'].includes(scene.id)));
});
test('optional scene sequence reaches B2–B4, C3–C5 and D3–D4 with authored guards',()=>{
 const r=room();
 r.scene('A3');r.next();
 r.scene('B2');r.act('dice:B2_WICHAI_TELL:PER');
 assert.equal(r.state().v51!.SUSPECT_WICHAI,'suspected');
 r.scene('B3');r.send('dm','guided',{command:'protect'});
 r.say(text=>text.includes('ผมว่าพี่วิชัยแน่ ๆ'));
 assert.equal(r.state().v51!.TON_TRUST,'high');
 r.scene('B4');r.act('dice:B4_FLOOD_PHOTO:INT');
 assert.equal(r.state().v51!.FLOOD_TRUTH,'partial');
 r.scene('B5');r.next();r.scene('C2');r.scene('C3');
 r.send('a','start');r.publish('guided-cue:C4');
 assert.equal(r.view().caseMap!.battle!.id,'EN01');
 const active=r.view().caseMap!.battle!.active!;
 r.send(active,'turnEncounter',{round:1,choice:'withdraw'});
 assert.equal(r.state().v51!.GHOST_ENCOUNTER,'escaped');
 r.scene('C5');
 assert.ok(!r.view().case001!.actions.some(a=>a.id.startsWith('dice:C5')));
 r.next();r.scene('D2');r.scene('D3');
 r.say(text=>text.startsWith('คนเป็นหาย'));
 assert.equal(r.state().v51!.KAEW_D_RESULT,'talked');
 assert.throws(()=>r.send('a','start'));
 r.act('engage-kaew');r.send('a','start');r.scene('D4');
 assert.equal(r.view().caseMap!.battle!.id,'EN02');
});

function c4(die=20) {
 const r=room(die);
 r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.scene('C3');
 r.send('a','start');
 const turn=(id:string,choice:string,extra:object={})=>r.send(id,'turnEncounter',{
  round:r.view().caseMap!.battle!.round,choice,...extra,
 });
 return {...r,turn,publishC4:()=>r.publish('guided-cue:C4')};
}

test('D4 uses team turns and native DM attacks, retains restraint and retreat history',()=>{
 const r=room(20,false,'5.3');
 r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();
 r.scene('D2');r.scene('D3');r.act('engage-kaew');r.send('a','start');
 assert.equal(r.view().guided!.scene,'D4');
 assert.equal(r.view().caseMap!.battle!.turnEncounter!.ready,false);
 r.publish('guided-cue:D4');
 const turn=(actor:string,choice:string,extra:object={})=>r.send(actor,'turnEncounter',{round:r.view().caseMap!.battle!.round,choice,...extra});
 assert.throws(()=>turn('dm','attack'));
 for(const player of r.players)turn(player,'pass');
 const attack=r.view('dm').caseMap!.battle!.turnEncounter!.attacks!.find(attack=>attack.id==='ROOT_BIND')!;
 const before=r.view().characters!.a.hp;
 turn('dm','attack',{attackId:attack.id,targetId:'a'});
 assert.equal(r.view().characters!.a.hp,before-1);
 assert.equal(r.view().caseMap!.battle!.restrained.a,2);
 assert.equal(r.view().caseMap!.battle!.active,'a');
 const checkpoint=r.saved();r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 assert.equal(r.view().caseMap!.battle!.round,2);
 turn('a','withdraw');
 assert.equal(r.state().v51!.KAEW_D_RESULT,'fled');
 assert.equal(r.view().caseMap!.battle,undefined);
});

test('D4 negotiation preserves the existing peaceful story result',()=>{
 const r=room(20,false,'5.3');
 r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();
 r.scene('D2');r.scene('D3');r.act('engage-kaew');r.send('a','start');r.publish('guided-cue:D4');
 r.send('a','turnEncounter',{round:1,choice:'pacify'});
 assert.equal(r.state().v51!.KAEW_D_RESULT,'talked');
 assert.equal(r.state().v51!.KAEW_TEMP_DISPERSED,false);
 assert.equal(r.view().caseMap!.battle,undefined);
});

test('C4 starts with the team, validates both roles and gives the DM one action after all six players',()=>{
 const r=c4(8);
 assert.equal(r.view().caseMap!.battle!.active,'a');
 assert.throws(()=>r.turn('a','pass'),/รอ DM/);
 r.publishC4();
 const attacks=r.view('dm').caseMap!.battle!.turnEncounter!.attacks!;
 assert.equal(r.view().caseMap!.battle!.turnEncounter!.attacks,undefined);
 assert.throws(()=>r.turn('dm','pass'),/ยังไม่ถึงตา/);
 assert.throws(()=>r.turn('b','strike'),/ยังไม่ถึงตา/);
 assert.throws(()=>r.send('a','strike'),/หน้าเผชิญหน้า/);
 const start=r.saved().world;
 r.turn('a','guard');
 for(const player of ['b','c','d','e','f']) r.turn(player,'pass');
 const npcPhase=r.view('b').caseMap!.battle!;
 assert.equal(npcPhase.active,null);
 assert.deepEqual(npcPhase.turnEncounter!.acted,['a','b','c','d','e','f']);
 assert.throws(()=>r.turn('a','attack',{attackId:attacks[0].id,targetId:'b'}));
 assert.throws(()=>r.turn('dm','attack',{attackId:'forged',targetId:'a'}));
 assert.throws(()=>r.turn('dm','attack',{attackId:attacks[0].id,targetId:'dm'}));
 r.turn('dm','attack',{attackId:attacks[0].id,targetId:'a'});
 const after=r.view();
 assert.equal(after.caseMap!.battle!.round,2);
 assert.equal(after.caseMap!.battle!.active,'a');
 assert.deepEqual(after.caseMap!.battle!.turnEncounter!.acted,[]);
 assert.deepEqual(after.caseMap!.battle!.turnEncounter!.history.at(-1)!.check,{die:8,total:11,outcome:'failure'});
 assert.equal(after.characters!.a.hp,start.characters!.a.hp);
 assert.equal(r.state().minute,start.case001!.minute);
 assert.throws(()=>r.send('a','turnEncounter',{round:1,choice:'pass'}),/รอบนี้จบแล้ว/);
});

test('C4 resumes the same round, skips an absent player and does not repeat turns already taken',()=>{
 const r=c4();
 r.publishC4();r.turn('a','pass');r.send('dm','dmSessionControl',{command:'pause'});
 const saved=r.saved();
 r.store.delete(r.code);r.store.restore(r.code,saved);
 r.send('dm','dmSessionControl',{command:'attendance',targetId:'b',absent:true});
 r.send('dm','dmSessionControl',{command:'resume'});
 assert.equal(r.view().caseMap!.battle!.round,1);
 assert.equal(r.view().caseMap!.battle!.active,'c');
 assert.deepEqual(r.view().caseMap!.battle!.turnEncounter!.acted,['a']);
 assert.ok(!r.view().caseMap!.battle!.turnEncounter!.party.includes('b'));
 assert.throws(()=>r.turn('b','pass'),/ตัวละครพัก/);
 for(const player of ['c','d','e','f']) r.turn(player,'pass');
 const npcSave=r.saved();
 r.store.delete(r.code);r.store.restore(r.code,npcSave);
 assert.equal(r.view().caseMap!.battle!.active,null);
 const before=r.view().characters!.a.hp;
 r.turn('dm','attack',{attackId:'WET_CLAW',targetId:'a'});
 assert.equal(r.view().characters!.a.hp,before-2);
 assert.equal(r.view().caseMap!.battle!.round,2);
});

test('C4 vision uses the original SPI 14 card and spends a turn only when the player rolls',()=>{
 const r=c4(1);
 r.publishC4();
 const option=r.view().case001!.actions.find(a=>a.id==='dice:C4_DROWNED_ECHO_VISION:SPI')!;
 assert.equal(option.dice!.dc,14);
 r.send('dm','caseDm',{targetId:'a',actionId:option.id});
 assert.equal(r.view().caseMap!.battle!.active,'a');
 assert.throws(()=>r.turn('a','pass'),/คำขอทอย/);
 const request=r.panel().investigators.find(entry=>entry.id==='a')!.check!;
 r.send('dm','dmRequestRoll',{targetId:'a',checkId:request.id});
 r.send('a','dmRoll',{requestId:r.view().diceRequest!.id});
 const battle=r.view('b').caseMap!.battle!;
 assert.equal(battle.active,'b');
 assert.equal(battle.turnEncounter!.history.at(-1)!.check!.outcome,'failure');
 assert.equal(r.state().v51!.GHOST_CLUE,'none');
 assert.equal(r.view('b').narrative?.history.some(beat=>beat.eventId.startsWith(option.id)),false);
});

test('C4 pacification and NPC withdrawal settle with the existing story outcomes',()=>{
 const peaceful=c4();
 peaceful.publishC4();peaceful.turn('a','pacify');
 assert.equal(peaceful.state().v51!.GHOST_ENCOUNTER,'pacified');
 assert.equal(peaceful.state().v51!.GHOST_CLUE,'vision');
 assert.equal(peaceful.view().caseMap!.turnConclusion?.check?.die,20);
 const retreat=c4();
 retreat.publishC4();
 for(const player of ['a','b','c','d','e','f']) retreat.turn(player,'pass');
 retreat.turn('dm','withdraw');
 assert.equal(retreat.view().caseMap!.battle,undefined);
 assert.equal(retreat.state().v51!.GHOST_ENCOUNTER,'won');
 assert.equal(retreat.state().v51!.GHOST_CLUE,'trace');
});

test('C4 can revive a fallen investigator and resolves a total party defeat',()=>{
 const r=c4();
 r.publishC4();
 const injured=r.saved();
 injured.world.characters!.a.hp=2;
 for(const id of ['b','c','d','e','f']) injured.world.characters![id].hp=0;
 r.store.delete(r.code);r.store.restore(r.code,injured);
 r.turn('a','stabilize',{targetId:'b'});
 assert.equal(r.view().characters!.b.hp,1);
 assert.equal(r.view().caseMap!.battle!.active,'b');
 r.turn('b','strike');
 assert.equal(r.view().caseMap!.battle!.enemies[0].hp,23);
 r.turn('dm','attack',{attackId:'WET_CLAW',targetId:'b'});
 assert.equal(r.view().caseMap!.battle!.active,'a');
 r.turn('a','pass');
 r.turn('dm','attack',{attackId:'WET_CLAW',targetId:'a'});
 assert.equal(r.view().caseMap!.battle,undefined);
 assert.equal(r.state().v51!.GHOST_ENCOUNTER,'lost');
 assert.equal(r.view().caseMap!.turnConclusion?.outcome,'lost');
});

test('F1 and F2 require approach, and F4 opens after Combat clears the last projection',()=>{
 const r=room();
 r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D2');
 r.act('seal1');r.act('seal2');
 r.scene('D5');r.next();r.scene('E4');r.act('approach-ritual-core');r.publish('approach-ritual-core');
 r.scene('E6');r.next();
 assert.equal(r.view().guided!.scene,'F1');
 r.scene('F2');
 assert.equal(r.state().v51!.KAEW_D_RESULT,'not_met');
 assert.ok(r.view().guided!.cue);
 r.send('a','start');r.scene('F3');
 assert.throws(()=>r.scene('F4'));
 const checkpoint=r.saved(),battle=checkpoint.world.caseMap!.battle!;
 const active=battle.active!;
 battle.projections=[checkpoint.world.players[active]];
 r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 r.send(active,'turnEncounter',{round:battle.round,choice:'objective'});r.scene('F4');
 assert.equal(r.view().caseMap!.battle!.phase,'flood_memory');
 assert.match(r.view().guided!.cue!,/น้ำเชี่ยว/);
});

test('E4 can recover H1 by phone after skipping C5, and Wichai risk cannot bypass the warning',()=>{
 const r=room();r.toE({wichai:true});r.scene('E4');
 assert.throws(()=>r.event('wichai-risk'));
 r.event('wichai-approach');assert.throws(()=>r.event('wichai-risk'));
 r.publish('approach-ritual-core');r.event('wichai-risk');r.publish('guided-cue:F6');r.event('backlash-prevented');
 assert.equal(r.state().v51!.RITUAL_STATUS,'active');
 r.scene('E4');r.act('search-ritual-bag');r.event('collect-flood');
 r.event('contact-boonmee');assert.throws(()=>r.scene('H1'));
 r.publish('v52:boonmee-call');r.scene('H1');
 assert.equal(r.view().caseMap!.site,'E');
});

test('Ending A requires actual disclosure, and a separate voluntary withdrawal with ritual active gives D',()=>{
 const r=room();
 r.toE({history:true});r.rescue();r.scene('E4');
 r.act('search-ritual-bag');r.event('collect-land');r.event('collect-flood');
 r.scene('H1');r.event('history-supported');
 r.event('evidence-supported');r.event('plan-credible');r.event('disclosed');
 r.scene('E4');r.act('seal3');r.next();r.event('voluntary-calm');r.act('finish');
 assert.equal(r.state().report!.ending,'A');
 assert.equal(r.view().guided!.scene,'ENDING A');
 r.publish('ending:A');assert.ok(r.view().case001!.report);
 const withdrawn=room();
 withdrawn.toE();withdrawn.send('dm','dmSessionControl',{command:'withdraw'});
 assert.equal(withdrawn.state().report!.ending,'D');
 assert.equal(withdrawn.state().v51!.HOSTAGE_FATE.เพิ่ม,'alive');
});
test('E3 uses the present witnesses and preserves their identification even after a failed timeline roll',()=>{
 const r=room(1);
 r.toE();r.act('open');r.scene('E2');r.act('escort:เพิ่ม');
 r.scene('E3');
 assert.ok(!r.view().guided!.cue!.includes('เพิ่มหอบ'));
 r.act('dice:E3_HOSTAGES_ORDER:SOC');r.publish('dice:E3_HOSTAGES_ORDER:SOC');
 assert.equal(r.state().storyChecks!.E3_HOSTAGES_ORDER.at(-1)!.outcome,'failure');
 assert.equal(r.state().v51!.SUSPECT_WICHAI,'confirmed');
 assert.ok(!r.view().narrative!.history.at(-1)!.text.includes('เพิ่ม:'));
 assert.ok(hasFact(r.state(),'current-testimony'));
});
test('DM progression points to a lead, then enables the same chapter proposal the server accepts',()=>{
 const r=room();
 let next=r.panel().backup!.progression;
 assert.deepEqual(next.leadScenes,['A3']);
 assert.equal(next.canPropose,false);
 assert.throws(()=>r.send('dm','guided',{command:'propose'}),/เบาะแส/);
 r.send('dm','guided',{command:'scene',target:'A3'});
 assert.equal(r.panel().backup!.progression.canPropose,false);
 r.publish('guided-cue:A3');
 next=r.panel().backup!.progression;
 assert.equal(next.to,'B');
 assert.equal(next.canPropose,true);
 r.send('dm','guided',{command:'propose'});
 assert.equal(r.panel().backup!.progression.canPropose,false);
 r.send('a','guided',{command:'confirm',target:r.view().guided!.transition!.id});
 assert.equal(r.view().guided!.scene,'B1');
 assert.ok(r.panel().narration.some(card=>card.current && card.eventId==='guided-cue:B1'));
});
test('DM sees a short Thai case summary while the saved state keeps all gameplay data',()=>{
 const r=room(20,true);
 assert.deepEqual(r.panel().storySummary,['ยังไม่พบผู้สูญหาย']);
 const story=JSON.stringify(r.panel().storySummary);
 for(const value of ['CASE_ACCEPTED','HOSTAGE_FATE','CHECK_RESULTS','Lethal Variant'])assert.ok(!story.includes(value));
 assert.equal(r.state().v51!.lethal,true);
 assert.equal(r.panel().storyReader!.scenes.find(scene=>scene.id==='B5')!.brief.length,2);
 assert.equal(r.panel().storyReader!.checks.find(check=>check.scene_id==='C5')!.decision,'การทอยนี้ยังไม่เปิดใช้ ทีมคุยกับยายและหาเบาะแสต่อได้');
 assert.equal(Object.hasOwn(r.view().guided!,'lethal'),false);
 assert.ok(!JSON.stringify(r.view()).includes('storySummary'));
 r.toE();r.rescue();r.scene('E4');r.act('seal3');
 assert.deepEqual(r.panel().storySummary,['พบผู้สูญหาย 3/3 คน · พาไปจุดปลอดภัยแล้ว 3 คน','พิธีหยุดแล้ว']);
});
test('DM can confirm and send the matched answer directly from a player question',()=>{
 const r=room();
 r.send('a','askGm',{site:'A',text:r.view().guided!.prompts[0]});
 const card=r.panel().questions![0];
 const choice=card.suggestions[0];
 assert.equal(choice.id,'guided-talk:A1:6');
 assert.throws(()=>r.send('a','dmAnswer',{cardId:card.id,actionId:choice.id,confirmContext:true}));
 r.send('dm','dmAnswer',{cardId:card.id,actionId:choice.id,confirmContext:choice.confirmContext});
 assert.equal(r.panel().questions!.length,0);
 assert.match(r.view().narrative!.history.at(-1)!.text,/ดลหายก่อน/);
});
test('v5.3 runtime loads the story and confirms only a matching private answer',()=>{
 const r=room(20,false,'5.3');
 const reader=r.panel().storyReader!;
 assert.equal(reader.scenes.length,31);
 assert.equal(reader.checks.length,16);
 assert.equal(Object.keys(reader.endings).length,4);
 assert.throws(()=>r.store.dmPanel(r.code,'a'));
 const qa=reader.qa!.find(entry=>entry.id==='A1_Q001')!;
 assert.ok(qa);
 assert.ok(!JSON.stringify(r.view()).includes(qa.dm_note));
 r.send('a','askGm',{site:'A',text:'ใครหายไปบ้าง?'});
 const before=r.state();
 const card=r.panel().questions![0];
 assert.deepEqual(r.state(),before);
 assert.deepEqual(card.suggestions.map(choice=>choice.id),[qa.id]);
 assert.throws(()=>r.send('a','dmReply',{cardId:card.id,qaId:qa.id,text:qa.answer}));
 assert.throws(()=>r.send('dm','dmReply',{cardId:card.id,qaId:'A1_Q002',text:qa.answer}));
 r.send('dm','dmReply',{cardId:card.id,qaId:qa.id,text:qa.answer});
 assert.match(r.view().narrative!.history.at(-1)!.text,/ประเสริฐ · ดลหายก่อน/);
 const history=r.panel().storyReader!.answers!;
 assert.equal(history.length,1);
 assert.equal(history[0].qaId,qa.id);
 assert.equal(history[0].question,'ใครหายไปบ้าง?');
 assert.equal(history[0].scene,'A1');
 const compact=r.store.dmPanel(r.code,'dm',false);
 assert.ok('storyProgress' in compact);
 assert.deepEqual(compact.storyProgress!.answers,history);
 assert.ok(!('answers' in r.view()));
 const checkpoint=r.saved();r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 assert.deepEqual(r.panel().storyReader!.answers,history);
 const unchanged=r.saved();r.panel();r.panel();
 assert.deepEqual(r.saved(),unchanged);
 assert.equal(r.panel().storyReader!.qa!.length,206);
 r.send('a','askGm',{site:'A',text:'ใครเดินผ่านตรงนี้เมื่อวาน?'});
 assert.deepEqual(r.panel().questions![0].suggestions,[]);
});
test('v5.3 keeps the grove question separate from land sales and hides private testimony',()=>{
 const r=room(20,false,'5.3');
 r.scene('A3');r.next();r.scene('B2');
 r.send('a','askGm',{site:'B',text:'วิชัยเข้าสวนคืนไหนแน่?'});
 const card=r.panel().questions![0];
 assert.deepEqual(card.suggestions.map(choice=>choice.id),['B2_Q006']);
 r.send('dm','dmDismiss',{cardId:card.id});
 r.scene('B3');
 r.send('a','askGm',{site:'B',text:'คุณมั่นใจแค่ไหนว่าเป็นวิชัย?'});
 assert.deepEqual(r.panel().questions![0].suggestions,[]);
});
for(const reason of ['called','followed'])test('v5.3 requires the '+reason+' route and actual arrival before E5',()=>{
 const r=room(20,false,'5.3');
 r.toE();
 assert.throws(()=>r.event('wichai-arrived'));
 assert.throws(()=>r.scene('E5'));
 assert.throws(()=>r.send('a','guided',{command:'v51:wichai-route:'+reason}));
 r.event('wichai-route:'+reason);
 assert.throws(()=>r.scene('E5'));
 r.event('wichai-arrived');
 r.scene('E5');
 assert.deepEqual(r.state().v51!.wichaiArrival53,{reason,arrived:true});
});

test('v5.3 allows a controlled release and requires evidence selection before disclosure',()=>{
 const r=room(20,false,'5.3');
 r.toE();
 const checkpoint=r.saved(), state=checkpoint.world.case001!;
 state.guided!.scene='E4';
 state.guided!.presented.push('E4');
 state.key=true;
 state.v51!.coreApproached=true;
 state.evidence.push('E05','E07');
 state.v51!.FLOOD_EVIDENCE_COLLECTED=true;
 addFact(state,'gate-truth');
 r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 assert.throws(()=>r.event('ritual-release'));
 const warned=r.saved();
 warned.world.case001!.v51!.coreWarningDelivered=true;
 r.store.delete(r.code);r.store.restore(r.code,warned);
 assert.throws(()=>r.send('a','guided',{command:'v51:ritual-release'}));
 r.event('ritual-release');
 assert.equal(r.state().v51!.RITUAL_STATUS,'stopped');
 assert.ok(Object.values(r.state().v51!.RITUAL_TETHER_INTACT).every(tether=>!tether));
 const finale=r.saved();
 finale.world.case001!.guided!.phase='FINAL';
 finale.world.case001!.guided!.scene='F5';
 finale.world.case001!.guided!.presented.push('F5');
 r.store.delete(r.code);r.store.restore(r.code,finale);
 assert.throws(()=>r.event('disclosed'));
 const select=(evidence:string[],recipient:string)=>r.send('a','guided',{command:'select-disclosure',target:JSON.stringify({evidence,recipient})});
 assert.throws(()=>select(['E07','forged'],'ประเสริฐ'));
 select(['E07'],'ประเสริฐ');
 assert.equal(r.state().v51!.pastDisclosed,false);
 r.event('disclosed');
 assert.equal(r.state().v51!.pastDisclosed,true);
});
test('v5.3 needs two separate documents before comparing the flood timeline',()=>{
 const r=room(20,false,'5.3');
 r.scene('A3');r.next();r.scene('B4');
 r.event('read-gate:B4');
 assert.throws(()=>r.scene('H1'));
 r.scene('B5');r.next();r.scene('C2');r.scene('C5');
 assert.ok(!r.view().case001!.actions.some(action=>action.id.startsWith('dice:C5')));
 r.event('read-shelter');
 assert.equal(r.view().case001!.actions.find(action=>action.id.startsWith('dice:C5'))?.dice?.dc,17);
 r.act('dice:C5_EVACUATION_RECORDS:INT');
 assert.equal(r.state().v51!.floodSources53?.compared,true);
 assert.equal(r.state().v51!.floodSources53?.peopleProven,undefined);
 r.scene('H1');
});

test('v5.3 protection can change without affecting the ritual tether',()=>{
 const r=room(20,false,'5.3');
 r.toE();r.act('open');r.scene('E2');
 assert.equal(r.view().case001!.rescued,0);
 r.event('protect-hostage:ดล');
 assert.equal(r.view().case001!.rescued,1);
 assert.equal(r.state().v51!.RITUAL_TETHER_INTACT.ดล,true);
 r.event('lose-protection:ดล');
 assert.equal(r.view().case001!.rescued,0);
});
test('v5.3 completes Ending A after the team hands off the verified evidence',()=>{
 const r=room(20,false,'5.3');
 r.scene('A3');r.next();r.scene('B4');r.event('read-gate:B4');
 r.scene('B5');r.next();r.scene('C2');r.scene('C5');r.event('read-shelter');
 r.next();r.scene('D5');r.next();
 r.rescue();r.scene('E4');r.act('search-ritual-bag');r.event('collect-land');
 r.scene('H1');r.event('history-supported');r.event('evidence-supported');r.event('plan-credible');
 r.scene('E4');r.act('seal3');r.next();r.event('voluntary-calm');r.scene('F5');
 assert.equal(resolveEnding51(r.state()),'C');
 r.send('a','guided',{command:'select-disclosure',target:JSON.stringify({evidence:['E07'],recipient:'ประเสริฐ'})});
 assert.equal(resolveEnding51(r.state()),'C');
 r.event('disclosed');r.act('finish');
 assert.equal(r.state().report!.ending,'A');
});

test('v5.3 allows Kaew to speak through the bracelet without restoring her body',()=>{
 const r=room(20,false,'5.3');r.toE();r.scene('E4');
 const save=r.saved();
 save.world.case001!.v51!.KAEW_D_RESULT='won';
 save.world.case001!.v51!.KAEW_TEMP_DISPERSED=true;
 r.store.delete(r.code);r.store.restore(r.code,save);
 assert.throws(()=>r.event('bracelet-reacted'));
 r.act('approach-ritual-core');
 r.event('bracelet-reacted');
 assert.equal(r.state().v51!.kaewVoice53,true);
 assert.equal(r.state().v51!.KAEW_TEMP_DISPERSED,true);
});
test('v5.3 rechecks the document and witness gates before delivering a Q&A reply',()=>{
 const r=room(20,false,'5.3');
 r.scene('A3');r.next();r.scene('B3');
 r.send('a','askGm',{site:'B',text:'คุณมั่นใจแค่ไหนว่าเป็นวิชัย?'});
 assert.deepEqual(r.panel().questions![0].suggestions,[]);
 r.send('dm','guided',{command:'protect'});
 assert.equal(r.panel().questions![0].suggestions[0]?.id,'B3_Q002');
 r.send('dm','dmDismiss',{cardId:r.panel().questions![0].id});
 r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D5');r.next();r.scene('E4');
 r.send('a','askGm',{site:'E',text:'กำไลคืออะไร?'});
 const card=r.panel().questions![0];
 assert.deepEqual(card.suggestions,[]);
 assert.throws(()=>r.send('dm','dmReply',{cardId:card.id,qaId:'E4_Q001',text:'ก่อนอ่าน'}));
 r.event('read-ritual-book');
 const answer=r.panel().questions![0].suggestions[0];
 assert.equal(answer.id,'E4_Q001');
 r.send('dm','dmReply',{cardId:card.id,qaId:answer.id,text:answer.answer});
 assert.match(r.view().narrative!.history.at(-1)!.text,/กำไลทองเหลือง/);
});
test('v5.3 player prompts always resolve to an eligible answer in the current scene',()=>{
 const r=room(20,false,'5.3');
 const verify=()=>{
  const prompts=r.view().guided!.prompts;
  for(const prompt of prompts) {
   r.send('a','askGm',{site:r.view().caseMap!.site,text:prompt});
   const card=r.panel().questions![0];
   assert.equal(card.suggestions.length,1,prompt);
   r.send('dm','dmDismiss',{cardId:card.id});
  }
 };
 verify();
 r.scene('A3');r.next();r.scene('B3');verify();
 assert.ok(!r.view().guided!.prompts.includes('คุณมั่นใจแค่ไหนว่าเป็นวิชัย?'));
 r.send('dm','guided',{command:'protect'});
 assert.ok(r.view().guided!.prompts.includes('คุณมั่นใจแค่ไหนว่าเป็นวิชัย?'));
 verify();
});

test('v5.3 DM can inspect an action consequence before recording it and see the recorded result',()=>{
 const r=room(20,false,'5.3');
 r.scene('A3');r.next();r.scene('B4');
 const before=r.saved();
 const event=r.panel().storyEvents!.find(event=>event.id==='read-gate:B4')!;
 assert.match(event.when!,/เปิดแฟ้ม/);
 assert.match(event.effect!,/C5/);
 assert.deepEqual(r.saved(),before);
 r.event(event.id);
 assert.ok(!r.panel().storyEvents!.some(item=>item.id===event.id));
 assert.ok(r.panel().storySummary!.some(text=>text.includes('บันทึกแล้ว') && text.includes('เปิดแฟ้ม')));
 assert.ok(!JSON.stringify(r.view()).includes(event.effect!));
});
for(const ending of ['A','B','C','D'] as const)test('v5.3 playable route delivers Ending '+ending+' to all six investigators',()=>{
 const r=room(20,false,'5.3');
 if(ending==='A') {
  r.scene('A3');r.next();r.scene('B4');r.event('read-gate:B4');
  r.scene('B5');r.next();r.scene('C2');r.scene('C5');r.event('read-shelter');
  r.next();r.scene('D5');r.next();
 } else r.toE();
 if(ending==='D')r.send('dm','dmSessionControl',{command:'withdraw'});
 else {
  if(ending==='C') {
   r.act('open');r.scene('E2');r.act('escort:ดล');
   r.send('a','guided',{command:'evacuate'});
  } else r.rescue();
  r.scene('E4');
  if(ending!=='C') {
   r.act('search-ritual-bag');r.event('collect-land');r.event('evidence-supported');
  }
  if(ending==='A') {
   r.scene('H1');r.event('history-supported');r.event('plan-credible');r.scene('E4');
  }
  r.act('seal3');r.next();r.scene('F5');
  if(ending==='A') {
   r.event('voluntary-calm');
   r.send('a','guided',{command:'select-disclosure',target:JSON.stringify({evidence:['E07'],recipient:'ประเสริฐ'})});
   r.event('disclosed');
  }
  if(ending==='B')r.event('kaew-hostile');
  r.act('finish');
 }
 assert.equal(r.state().report!.ending,ending);
 r.publish('ending:'+ending);
 for(const player of r.players) {
  assert.ok(r.view(player).case001!.report);
  assert.ok(r.view(player).narrative!.history.some(beat=>beat.eventId==='ending:'+ending));
 }
});
test('v5.5 opens the shield encounter through the actual player action',()=>{
 const r=room(20,false,'5.5');
 r.toE();r.scene('E4');r.act('approach-ritual-core');r.scene('E6');
 assert.ok(!allowedGuidedScenes(r.saved().world).some(scene=>scene.id==='F1'));
 assert.throws(()=>r.act('seal3'));
 r.act('begin-final55');
 assert.equal(r.view().caseMap!.battle!.id,'EN04');
 assert.equal(r.state().guided!.scene,'F1');
 assert.equal(r.state().v51!.finalBody55,'embodied');
 const actorBefore=r.saved().world.caseMap!.battle!.active!;
 assert.throws(()=>r.send(actorBefore,'caseObjective',{step:0}));
 assert.equal(r.view().caseMap!.battle!.final55?.step,0);
 r.publish('guided-cue:F1');
 r.scene('F3');
 assert.equal(r.view().caseMap!.battle!.final55?.step,0);
 const checkpoint=r.saved();
 r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 assert.equal(r.view().caseMap!.battle!.final55?.shield,'up');
 assert.throws(()=>r.act('begin-final55'));
 const prepared=r.saved(),battle=prepared.world.caseMap!.battle!,actor=battle.active!;
 prepared.world.players[actor]={x:battle.focusCell!.x,y:battle.focusCell!.y-1};
 r.store.delete(r.code);r.store.restore(r.code,prepared);
 const command={id:'v55-step-zero',type:'turnEncounter',round:battle.round,choice:'objective',step:0} as const;
 r.store.apply(r.code,actor,command);
 assert.equal(r.view().caseMap!.battle!.final55?.step,1);
 const ap=r.saved().world.turns[actor].ap;
 assert.equal(r.store.apply(r.code,actor,command).duplicate,true);
 assert.equal(r.saved().world.turns[actor].ap,ap);
 const progressed=r.saved();r.store.delete(r.code);r.store.restore(r.code,progressed);
 assert.equal(r.view().caseMap!.battle!.final55?.step,1);
 assert.throws(()=>r.send(actor,'caseObjective',{step:0}));
 assert.equal(r.saved().world.turns[actor].ap,ap);
 // A declared native enemy attack is required; neither preview nor a player can consume trust.
 const declared=r.saved(),enemy=declared.world.caseMap!.battle!.enemies[0];
 declared.world.case001!.v51!.KAEW_TRUST='high';
 enemy.tactics.telegraph={kind:'lash',cells:[declared.world.players[actor]],attack:enemy.tactics.profile!.combat!.attacks[0]};
 r.store.delete(r.code);r.store.restore(r.code,declared);
 assert.throws(()=>r.send(actor,'guided',{command:'v51:forbear55'}));
 assert.ok(r.panel().storyEvents!.some(action=>action.id==='forbear55'));
 r.event('forbear55');
 assert.equal(r.saved().world.caseMap!.battle!.enemies[0].tactics.telegraph,undefined);
 assert.equal(r.saved().world.caseMap!.battle!.final55!.trustUsed,true);
 assert.equal(r.saved().world.turns[actor].ap,ap);
 assert.throws(()=>r.event('forbear55'));
 for(const step of [1,2,3]) {
  const active=r.view().caseMap!.battle!.active!;
  r.send(active,'turnEncounter',{round:1,choice:'objective',step});
 }
 assert.equal(r.view().caseMap!.battle,undefined);
 assert.equal(r.state().v51!.RITUAL_STATUS,'stopped');
 assert.equal(r.view().guided!.scene,'F5');
 assert.ok(r.panel().narration.some(card=>card.eventId==='guided-cue:F5'));
});
test('v5.5 door card opens the door without marking hostages found or safe',()=>{
 const r=room(20,false,'5.5');
 r.toE();
 assert.throws(()=>r.scene('E2'));
 r.event('door-access55');r.scene('E2');
 assert.equal(r.state().opened,false);
 r.act('dice:E2_DOOR_BREAK:BODY');
 assert.equal(r.state().v51!.doorOpened55,true);
 assert.equal(r.state().v51!.HOSTAGES_FOUND,0);
 assert.equal(r.view().case001!.rescued,0);
 r.event('enter-room55');
 assert.equal(r.state().v51!.HOSTAGES_FOUND,3);
 assert.equal(r.view().case001!.rescued,0);
});
test('v5.5 presentation replaces legacy E3/E5/H1 speech without changing the cards',()=>{
 const data=storyContent({guided:{version:'5.5'}});
 assert.equal(data.checks.length,17);
 assert.equal(Object.keys(data.scenes).length,31);
 const r=room(20,false,'5.5');
 r.toE();r.act('open');r.scene('E2');r.scene('E3');
 assert.ok(!r.view().case001!.actions.some(action=>action.id.startsWith('dice:E3')));
 r.event('ungag-dol');
 r.act('dice:E3_HOSTAGES_ORDER:SOC');
 const pending=r.panel().narration.find(card=>card.answer?.checkId==='E3_HOSTAGES_ORDER')!;
 assert.match(pending.answer!.dialogue!,/^ดล/);
 assert.ok(!pending.answer!.dialogue!.includes('นิด'));
 assert.equal(r.state().storyChecks!.E3_HOSTAGES_ORDER.at(-1)!.outcome,'full');
});
test('shared continuity follows only delivered story and keeps the previous chapter separate',()=>{
 const r=room();
 assert.equal(r.panel().sharedStory!.at(-1)!.scene,'A1');
 r.event('enable-lethal');
 const queued=r.panel().narration.find(card=>card.eventId==='v51:lethal')!;
 assert.ok(queued.current);
 r.send('dm','guided',{command:'scene',target:'A3'});
 assert.equal(r.panel().narration.find(card=>card.id===queued.id)!.current,false);
 assert.equal(r.view().guided!.title,undefined);
 assert.equal(r.panel().sharedStory!.at(-1)!.scene,'A1');
 r.publish('guided-cue:A3');
 assert.equal(r.panel().sharedStory!.at(-1)!.scene,'A3');
 assert.equal(r.view().narrative!.current!.scene,'A3');
 r.next();
 assert.match(r.view().guided!.previousLead!,/แฟ้มที่บ้านผู้ใหญ่/);
 assert.equal(r.view().narrative!.current!.scene,'B1');
 assert.deepEqual(r.panel().sharedStory!.at(-1),r.view().narrative!.current);
});
