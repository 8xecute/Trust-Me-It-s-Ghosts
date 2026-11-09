import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {WorldStore} from '../src/world.js';
import {caseOptions, caseView, newCase, tick} from '../src/case001/case001.js';
import {allowedGuidedScenes, newGuided} from '../src/case001/guidedCase.js';
import {newState51, resolveEnding51, validateSave51} from '../src/case001/storyV51.js';
import {storyContent} from '../src/case001/v51Content.js';
import {hasFact} from '../src/case001/caseStory.js';

function room(die=20,lethal=false) {
 let serial=0;
 const store=new WorldStore(()=>die,true,true,true,false,'5.2',lethal),code='V52';
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
  send('a','guided',{command:'confirm',target:view().guided!.transition!.id});
  const cue=panel().narration.find(c=>c.current && c.eventId==='guided-cue:'+view().guided!.scene);
  if(cue)publish(cue.eventId);
 };
 const act=(actionId:string)=>{
  send('a','caseAction',{actionId,site:view().caseMap!.site});
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

test('six-player v5.2 room: private reader is passive, A2 requires an action, optional failure allows progress',()=>{
 const r=room(1);
 const start=r.state();
 assert.equal(r.panel().storyReader!.scenes.length,31);
 assert.deepEqual(r.state(),start);
 assert.throws(()=>r.store.dmPanel(r.code,'a'));
 assert.throws(()=>r.scene('A2'));
 assert.throws(()=>r.scene('F6'));
 r.act('survey-arrival');r.scene('A2');r.act('dice:A2_RADIO_ECHO:SPI');
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
 const checkpoint=r.saved();
 const active=checkpoint.world.caseMap!.battle!.active!;
 checkpoint.world.players[active]={x:0,y:0};
 r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 r.send(active,'escape');
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
 r.send(active,'caseObjective');r.scene('F4');
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
