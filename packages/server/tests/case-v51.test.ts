import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {WorldStore, type World} from '../src/world.js';
import {newCase, tick, caseOptions, applyCaseAction} from '../src/case001/case001.js';
import {newGuided, observeGuidedScene, guidedDialogue, allowedGuidedScenes} from '../src/case001/guidedCase.js';
import {newState51, contract51, killHostage51, sceneCue51, resolveEnding51, endingText51, dmOptions51, command51, validateSave51} from '../src/case001/storyV51.js';
import {scenes51, endings51, script51} from '../src/case001/v51Content.js';
import {storyCheckHelp, storyCheckOptions, runStoryCheck, availableDialogue} from '../src/case001/storyDice.js';
import {startCaseBattle, finishCaseBattle, caseOpportunity} from '../src/case001/caseBattle.js';
import {caseGrid} from '@baan/shared';

function state(lethal=true) {
 const s=newCase(true,4,'4.1');s.guided=newGuided('5.1');s.v51=newState51(lethal);s.narrativeEvents=[];return s;
}
function room(count=2,die=20,lethal=false) {
 let serial=0;
 const store=new WorldStore(()=>die,true,true,true,false,'5.1',lethal),code='V51';
 store.create(code,2);store.addPlayer(code,'dm');
 const send=(player:string,type:string,data:object={})=>store.apply(code,player,{id:String(++serial),type,...data}).snapshot;
 send('dm','claimDm');
 const roles=['medium','field_medic','occult_engineer','ritual_specialist','containment_specialist','paranormal_investigator'];
 const players=['a','b','c','d','e','f'].slice(0,count);
 players.forEach((id,i)=>{store.addPlayer(code,id);send(id,'createCharacter',{profession:roles[i]});});
 send('dm','caseStart',{mode:'story'});
 const panel=()=>{const p=store.dmPanel(code,'dm');if(!('caseMode' in p))throw Error('not case');return p;};
 const view=()=>store.snapshot(code,'a');
 const saved=()=>store.checkpoint(code).world;
 const publish=(eventId:string)=>{const card=panel().narration.find(c=>c.eventId===eventId && c.current);assert.ok(card,eventId);send('dm','dmPublish',{cardId:card.id});};
 const scene=(id:string)=>{send('dm','guided',{command:'scene',target:id});if(!view().guided?.cue)publish('guided-cue:'+id);};
 const event=(id:string)=>send('dm','guided',{command:'v51:'+id});
 const next=()=>{send('dm','guided',{command:'propose'});const t=view().guided!.transition!;send('a','guided',{command:'confirm',target:t.id});publish('guided-cue:'+view().guided!.scene);};
 const say=(sceneId:string,predicate:(text:string)=>boolean)=>{
  const line=scenes51[sceneId].dialogue.find(l=>predicate(l.text));assert.ok(line,sceneId);
  if(!panel().investigators[0].choices.some(c=>c.id==='guided-talk:'+line.id))event('context:'+line.id);
  send('dm','caseDm',{targetId:'a',actionId:'guided-talk:'+line.id});
 };
 const act=(actionId:string)=>{
  send('a','caseAction',{actionId,site:view().caseMap!.site});
  const check=panel().investigators.find(p=>p.id==='a')?.check;
  if(check){send('dm','dmRequestRoll',{targetId:'a',checkId:check.id});send('a','dmRoll',{requestId:view().diceRequest!.id});}
 };
 const toE=(history=false)=>{
  scene('A3');next();scene('B5');next();scene('C2');
  if(history){scene('C5');say('C5',t=>t.includes('ไม่ได้เห็นคนเปิดประตู'));}
  next();scene('D2');scene('D5');next();
 };
 publish('guided-cue:A1');
 return {store,code,send,panel,view,saved,publish,scene,event,next,say,act,toE,players};
}

test('v5.1 source imports 31 complete scenes, four endings and unchanged 16 dice cards',()=>{
 assert.equal(Object.keys(scenes51).length,31);assert.deepEqual(Object.keys(endings51),['A','B','C','D']);
 const original=readFileSync(new URL('../scenarios/case-001/case-001.v4.3.DiceChecks.json',import.meta.url),'utf8');
 const checks=JSON.parse(original).checks;
 const expected=[['A2_RADIO_ECHO','SPI',14],['B2_WICHAI_TELL','PER',14],['B3_TON_DISCLOSURE','SOC',14],['B4_FLOOD_PHOTO','INT',14],['C2_LAND_PATTERN','INT',14],['C3_SPIRIT_RESIDUE','SPI',14],['C4_DROWNED_ECHO_VISION','SPI',14],['C5_EVACUATION_RECORDS','INT',17],['D2_BINDING_PATTERN','INT',14],['D3_KAEW_CONTACT','SPI',14],['D5_CART_TRACKS','PER',11],['E3_HOSTAGES_ORDER','SOC',11],['E4_BRACELET_DECODE','INT',14],['E5_WICHAI_NEGOTIATE','SOC',17],['H1_FLOOD_TIMELINE','INT',17],['F5_KAEW_RECONCILE','SOC|SPI',17]];
 assert.deepEqual(storyCheckHelp.map(c=>[c.id,c.stat,c.dc]),expected);
 for(const scene of Object.values(scenes51)) {
  for(const key of ['purpose','presence','dmReadAloud','npcLines','responses','clues','fallback','nextSceneHandoff','dmSecret'] as const) assert.ok(scene[key],scene.id+':'+key);
  assert.ok(scene.dialogue.every(l=>script51.includes(l.text)));
  assert.ok(!scene.cue.includes('🔒'));
  assert.ok(!scene.cue.includes('อ่านได้เมื่อพลิกกระดาษจริง'));
 }
 for(const c of checks)for(const result of ['full','partial','failure'])assert.ok(c[result].effects.some((e:string)=>e.includes('CHECK_RESULTS.')));
 assert.equal(scenes51.B3.dialogue.find(l=>l.text.startsWith('มืดครับ'))?.speaker,'ต้น');
 assert.equal(scenes51.C5.dialogue.find(l=>l.text.startsWith('ข้าเห็นด้าย'))?.speaker,'ยายบุญมี');
 assert.equal(scenes51.F6.dialogue.find(l=>l.text.startsWith('เพิ่ม!'))?.speaker,'ดล');
 assert.equal(scenes51.F6.dialogue.find(l=>l.text==='เขาอยู่คนเดียวไหม?')?.speaker,'ดล');
 assert.equal(scenes51.F6.dialogue.find(l=>l.text==='ตอนนั้นมีใครอยู่กับเขาหรือเปล่า?')?.speaker,'นิด');
 assert.equal(scenes51.F5.dialogue.find(l=>l.text.startsWith('ช่วยด้วย!'))?.speaker,'วิชัย');
 assert.ok(!scenes51.D3.dialogue.some(l=>l.text==='เขาเป็นคนทำพิธีใช่ไหม?'));
});

for(const count of [2,4,6])test('real v5.1 room routes forward with '+count+' investigators; optional failures never lock C2/D5',()=>{
 const r=room(count,1);r.toE();
 assert.equal(r.view().guided!.version,'5.1');assert.equal(r.view().guided!.phase,'E');
 assert.equal(r.saved().case001!.v51!.KAEW_D_RESULT,'not_met');
 assert.deepEqual(contract51(r.saved().case001!).CHECK_RESULTS,{});
 assert.throws(()=>r.scene('B3'));
 r.next();assert.equal(r.view().guided!.phase,'FINAL');
 // E4 was skipped. The same physical ritual room remains inspectable.
 assert.ok(r.view().case001!.actions.some(a=>a.id==='key'));
 r.act('key');assert.ok(r.saved().case001!.evidence.includes('E05'));
 r.act('open');assert.equal(r.saved().case001!.opened,false);
 r.act('open');assert.equal(r.saved().case001!.opened,true);
 assert.equal(r.view().case001!.rescued,0);
});

test('v5.1 does not grant scene facts or reveal DM sections before cue delivery',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B5');r.next();
 r.send('dm','guided',{command:'scene',target:'C2'});
 assert.equal(r.saved().case001!.evidence.includes('E02'),false);
 assert.equal(r.view().guided!.cue,undefined);r.publish('guided-cue:C2');
 assert.ok(r.saved().case001!.evidence.includes('E02'));
 const json=JSON.stringify(r.view());
 for(const secret of ['sourceMarkdown','dmSecret','storyState','contextConfirmed','WICHAI_DEATH_CAUSE',scenes51.C2.dmSecret])assert.ok(!json.includes(secret));
 assert.throws(()=>r.store.dmPanel(r.code,'a'));
 assert.throws(()=>r.send('a','guided',{command:'v51:collect-land'}));
});

test('B1 establishes land map before B2; Ton safe disclosure is scoped and optional',()=>{
 const r=room();r.scene('A3');r.next();
 assert.match(r.view().guided!.cue!,/งานประสานซื้อขายที่ดิน/);
 r.scene('B3');r.send('dm','guided',{command:'protect'});
 r.say('B3',t=>t.startsWith('ตอนอยู่ในสวน'));
 assert.equal(r.saved().case001!.v51!.TON_TRUST,'high');
 assert.ok(r.saved().case001!.evidence.includes('E08'));
 assert.equal(r.saved().case001!.v51!.SUSPECT_WICHAI,'suspected');
 assert.ok(!r.view().case001!.actions.some(a=>a.id.startsWith('dice:B3_')));
});

test('D3 actual conversation writes talked; F2 selects only that branch',()=>{
 const r=room();r.scene('A3');r.next();r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D2');r.scene('D3');
 assert.equal(r.saved().case001!.v51!.KAEW_D_RESULT,'not_met');
 r.say('D3',t=>t.startsWith('คนเป็นหาย'));assert.equal(r.saved().case001!.v51!.KAEW_D_RESULT,'talked');
 r.scene('D5');r.next();r.next();r.scene('F2');
 assert.match(r.view().guided!.cue!,/พยายามกดแขน/);
 assert.deepEqual(r.panel().investigators[0].choices.filter(c=>c.speaker==='แม่แก้ว').map(c=>c.id),['guided-talk:F2:talked']);
});

test('03:00 samples prestate once in E, preserves safe counts, and never ends the game',()=>{
 const s=state();s.site='E';s.guided!.phase='E';s.evacuated=['ดล','นิด','เพิ่ม'];s.minute=239;
 tick(s,1);assert.equal(s.v51!.RITUAL_0300_PRESTATE,'active');assert.equal(s.v51!.RITUAL_0300_FULL_POWER,true);
 assert.equal(s.v51!.RITUAL_STATUS,'entrenched');assert.equal(s.v51!.HOSTAGE_FATE.เพิ่ม,'dead');
 assert.equal(s.v51!.DEATH_CAUSE.เพิ่ม,'ritual_toll');assert.equal(contract51(s).HOSTAGES_SAFE,2);
 assert.equal(contract51(s).HOSTAGES_DEAD,1);assert.equal(s.report,null);
 tick(s,20);assert.equal(contract51(s).HOSTAGES_DEAD,1);
 const loaded=JSON.parse(JSON.stringify(s));validateSave51(loaded);tick(loaded,20);assert.equal(contract51(loaded).HOSTAGES_DEAD,1);
 assert.throws(()=>tick(s,-1));
});
for(const variant of ['weakened','stopped','untethered','already-dead','nonlethal'] as const)test('03:00 '+variant+' has no additional fatality',()=>{
 const s=state();s.minute=239;
 if(variant==='weakened'||variant==='stopped'){s.v51!.RITUAL_STATUS=variant;s.seals[2]=variant==='stopped';}
 if(variant==='untethered')s.v51!.RITUAL_TETHER_INTACT.เพิ่ม=false;
 if(variant==='already-dead')killHostage51(s,'เพิ่ม','crossfire_wichai');
 if(variant==='nonlethal')s.v51!.lethal=false;
 tick(s,1);
 assert.equal(contract51(s).HOSTAGES_DEAD,variant==='already-dead'?1:0);
 assert.equal(s.v51!.RITUAL_0300_FULL_POWER,!['weakened','stopped'].includes(variant));
 assert.equal(s.report,null);
});

test('save and resume preserve a real 03:00 crossing and never convert a v4.3 room',()=>{
 const r=room(2,20,true);r.toE();
 r.scene('E4');r.scene('E2');
 const checkpoint=r.store.checkpoint(r.code);checkpoint.world.case001!.minute=239;
 r.store.delete(r.code);r.store.restore(r.code,checkpoint);
 // Escort is an existing ten-minute action, reaching 03:00 in Act E.
 r.act('escort:ดล');assert.equal(r.saved().case001!.v51!.HOSTAGE_FATE.เพิ่ม,'dead');
 const restored=new WorldStore(()=>20,true,true,true,false,'5.1',true);
 restored.restore(r.code,JSON.parse(JSON.stringify(r.store.checkpoint(r.code))));
 assert.deepEqual(restored.dmPanel(r.code,'dm'),r.panel());
 assert.equal(restored.snapshot(r.code,'a').case001!.report,null);
 const old=new WorldStore(()=>20,true,true,true);old.create('OLD',2);old.addPlayer('OLD','dm');old.apply('OLD','dm',{id:'1',type:'claimDm'});
 for(const [i,id] of ['a','b'].entries()){old.addPlayer('OLD',id);old.apply('OLD',id,{id:'2'+id,type:'createCharacter',profession:i?'field_medic':'medium'});}
 old.apply('OLD','dm',{id:'4',type:'caseStart',mode:'story'});
 const upgrade=new WorldStore(()=>20,true,true,true,false,'5.1');upgrade.restore('OLD',old.checkpoint('OLD'));
 assert.equal(upgrade.snapshot('OLD','a').guided!.version,'4.3');assert.equal(upgrade.checkpoint('OLD').world.case001!.v51,undefined);
});

test('crossfire needs presence, actual shield, delivered reaction window and actual failed protection',()=>{
 const r=room(2,20,true);r.toE();r.scene('E4');r.scene('E2');
 assert.ok(!r.panel().storyEvents!.some(o=>o.id.startsWith('shield:')));
 for(const n of ['ดล','นิด'])r.act('escort:'+n); // actual time lets Wichai travel B→D→E
 r.act('escort:เพิ่ม');r.scene('E5');
 r.event('shield:นิด');assert.ok(!r.panel().storyEvents!.some(o=>o.id==='fatal'));
 assert.throws(()=>r.event('fatal'));
 r.publish('v51:crossfire-window');r.event('fatal');
 const s=r.saved().case001!;
 assert.equal(s.v51!.HOSTAGE_FATE.นิด,'dead');assert.equal(s.v51!.DEATH_CAUSE.นิด,'crossfire_wichai');
 assert.ok(!s.escorts.includes('นิด'));assert.throws(()=>r.event('fatal'));
 r.scene('E3');assert.ok(r.panel().investigators[0].choices.every(c=>c.speaker!=='นิด'));
 assert.ok(!r.view().guided!.cue!.includes('นิดห่อตัว'));
});

test('evacuated people cannot become shields; a negotiation failure does not kill',()=>{
 const r=room(2,1,true);r.toE();r.scene('E4');r.scene('E2');
 for(const n of ['ดล','นิด','เพิ่ม'])r.act('escort:'+n);
 r.send('a','guided',{command:'evacuate'});r.scene('E5');
 assert.ok(!r.panel().storyEvents!.some(o=>o.id.startsWith('shield:')));
 r.act('dice:E5_WICHAI_NEGOTIATE:SOC');
 assert.equal(contract51(r.saved().case001!).HOSTAGES_DEAD,0);
 assert.equal(r.saved().case001!.v51!.WICHAI_STATUS,'free');
});

test('v5.1 peaceful path reaches A through real check, rescue, evidence and disclosure actions',()=>{
 const r=room();r.toE(true);r.scene('E4');r.event('collect-land');r.event('collect-flood');
 r.act('dice:E4_BRACELET_DECODE:INT');assert.equal(r.saved().case001!.v51!.RITUAL_STATUS,'active');
 r.act('seal3');r.scene('E2');r.say('E2',t=>t.startsWith('อย่า... อย่าปิดประตู'));
 for(const n of ['ดล','นิด','เพิ่ม'])r.act('escort:'+n);
 r.send('a','guided',{command:'evacuate'});r.scene('H1');r.send('a','guided',{command:'history'});
 r.event('evidence-supported');r.event('plan-credible');r.event('disclosed');r.next();
 r.act('dice:F5_KAEW_RECONCILE:SOC');assert.equal(r.saved().case001!.v51!.KAEW_FINAL,'calm');
 r.act('finish');assert.equal(r.saved().case001!.report!.ending,'A');
 assert.match(r.saved().case001!.report!.text,/เปิดเผยแล้ว/);
});

test('actual forward routes resolve ordinary B and incomplete C/D without forcing A',()=>{
 for(const expected of ['B','C','D'] as const) {
  const r=room();r.toE();r.scene('E4');
  if(expected!=='D')r.act('seal3');
  if(expected==='B') {
   r.event('collect-land');r.event('evidence-supported');r.scene('E2');
   for(const n of ['ดล','นิด','เพิ่ม'])r.act('escort:'+n);
   r.send('a','guided',{command:'evacuate'});
  }
  r.next();if(expected==='B')r.event('kaew-hostile');r.act('finish');
  assert.equal(r.saved().case001!.report!.ending,expected);
 }
});

test('F5 has no remote execution and a delivered attempt can be prevented or reach Vigilante Ghost',()=>{
 for(const fatal of [false,true]) {
  const r=room(2,20,true);r.toE();r.scene('E4');r.scene('E2');
  for(const n of ['ดล','นิด','เพิ่ม'])r.act('escort:'+n);
  r.send('a','guided',{command:'evacuate'});r.scene('E4');r.act('seal3');r.next();
  r.event('evidence-insufficient');r.event('plan-insufficient');
  assert.equal(r.saved().case001!.wichai!.site,'E');r.event('attempt');
  assert.equal(r.saved().case001!.v51!.WICHAI_STATUS,'free');
  assert.throws(()=>r.event('fatal'));r.publish('v51:execution-window');r.event(fatal?'fatal':'prevented');
  if(fatal) {
   assert.equal(r.saved().case001!.v51!.WICHAI_DEATH_CAUSE,'kaew_execution');
   r.act('finish');assert.equal(r.saved().case001!.report!.ending,'B');
  } else assert.equal(r.saved().case001!.v51!.WICHAI_STATUS,'free');
 }
 const s=state();s.site='E';s.guided!.phase='FINAL';s.guided!.scene='F5';s.v51!.RITUAL_STATUS='stopped';s.seals[2]=true;s.v51!.humanCaseSupported=false;
 assert.ok(!dmOptions51(s).some(o=>o.id==='attempt'));
});

test('resolver precedence and factual reports distinguish losses, unshared documents and escaped suspect',()=>{
 const s=state();s.v51!.RITUAL_STATUS='stopped';s.seals[2]=true;s.evacuated=['ดล','นิด','เพิ่ม'];
 s.v51!.humanCaseSupported=true;s.v51!.KAEW_FINAL='calm';
 assert.equal(resolveEnding51(s),'C');s.v51!.pastDisclosed=true;assert.equal(resolveEnding51(s),'A');
 s.v51!.WICHAI_STATUS='escaped';assert.equal(resolveEnding51(s),'C');s.v51!.WICHAI_STATUS='free';
 killHostage51(s,'เพิ่ม','ritual_toll');assert.equal(resolveEnding51(s),'C');
 s.v51!.WICHAI_DEATH_CAUSE='kaew_execution';assert.equal(resolveEnding51(s),'C');
 s.v51!.PLAYER_DEATHS=1;assert.equal(resolveEnding51(s),'D');assert.equal(s.v51!.ENDING_MODIFIER,'fallen_agent');
 const text=endingText51(s,'D');assert.match(text,/พิธี หยุดแล้ว/);assert.ok(!text.includes('พิธียังไม่หยุด'));
});

test('Fallen Agent report title and body never claim an already stopped ritual still curses the village',()=>{
 const s=state();s.site='E';s.guided!.phase='FINAL';s.guided!.scene='F5';s.guided!.presented.push('F5');
 s.seals[2]=true;s.v51!.RITUAL_STATUS='stopped';s.v51!.PLAYER_DEATHS=1;
 const result=applyCaseAction(s,'finish',()=>20);
 assert.equal(result.report!.ending,'D');assert.match(result.report!.title,/Fallen Agent/);
 assert.ok(!result.report!.text.includes('หมู่บ้านต้องสาป'));
 assert.match(result.report!.text,/พิธี หยุดแล้ว/);
});

test('undefined branches stay unavailable and invalid saves do not infer state',()=>{
 const s=state();s.site='E';s.guided!.phase='FINAL';s.guided!.scene='F5';s.seals[2]=true;s.v51!.RITUAL_STATUS='stopped';s.key=true;s.evidence=['E05'];
 for(const id of ['return','ritual','suppress'])assert.ok(!caseOptions(s,true).some(o=>o.id===id));
 assert.equal(s.v51!.KAEW_FINAL,null);delete (s.v51 as any).KAEW_D_RESULT;
 assert.throws(()=>validateSave51(s),/State v5.1/);
});

test('failed B3 and D5 rolls preserve forward clues without treating skipped checks as failures',()=>{
 const r=room(2,1);r.scene('A3');r.next();r.scene('B3');r.act('dice:B3_TON_DISCLOSURE:SOC');
 r.scene('B5');r.next();r.scene('C2');r.next();r.scene('D5');r.act('dice:D5_CART_TRACKS:PER');r.next();
 const s=r.saved().case001!,c=contract51(s);
 assert.deepEqual(c.CHECK_RESULTS,{B3_TON_DISCLOSURE:'failure',D5_CART_TRACKS:'failure'});
 assert.ok(s.evidence.includes('E02'));assert.ok(s.evidence.includes('E06'));assert.equal(s.guided!.phase,'E');
});

for(const outcome of ['won','pacified','escaped','lost'] as const)test('C4 resolves '+outcome+' through the existing encounter reducer without identifying Wichai',()=>{
 const r=room(),w=r.saved(),s=w.case001!;s.site='C';s.guided!.phase='C';s.evidence=['E02'];
 for(const id of r.players)w.caseMap!.sites[id]='C';
 startCaseBattle(w,'a',caseGrid('C'),()=>20);
 for(const enemy of w.caseMap!.battle!.enemies){enemy.state.phase='resolved';enemy.state.outcome=outcome==='pacified'?'pacified':'defeated';}
 if(outcome==='lost')for(const id of r.players)w.characters![id].hp=0;
 finishCaseBattle(w,outcome==='escaped');
 assert.equal(s.v51!.GHOST_ENCOUNTER,outcome);assert.equal(s.v51!.SUSPECT_WICHAI,'unknown');
 if(outcome==='pacified')assert.equal(s.v51!.GHOST_CLUE,'vision');
 assert.ok(!s.narrativeEvents!.some(e=>e.text.includes('วิชัย')));
});

test('D4 actual victory disperses the manifestation, keeps ritual active and does not respawn it in F2',()=>{
 const r=room(),w=r.saved(),s=w.case001!;s.site='D';s.ghost='hostile';s.guided!.phase='D';
 for(const id of r.players)w.caseMap!.sites[id]='D';
 startCaseBattle(w,'a',caseGrid('D'),()=>20);
 for(const enemy of w.caseMap!.battle!.enemies){enemy.state.phase='resolved';enemy.state.outcome='defeated';}
 finishCaseBattle(w);
 assert.equal(s.v51!.KAEW_D_RESULT,'won');assert.equal(s.v51!.KAEW_TEMP_DISPERSED,true);assert.equal(s.v51!.RITUAL_STATUS,'active');
 s.site='E';s.guided!.phase='FINAL';s.guided!.scene='F2';s.guided!.presented.push('F2');
 assert.equal(sceneCue51(s,'F2'),'เสียงยังอยู่');assert.deepEqual(guidedDialogue(s),[]);
 assert.equal(caseOpportunity(s,w.caseMap!),undefined);
});

test('F4 requires the actual flood-memory phase, and E4 cannot act or leak flip notes before its cue',()=>{
 const r=room();r.toE();r.send('dm','guided',{command:'scene',target:'E4'});
 assert.throws(()=>r.act('key'));assert.equal(r.saved().case001!.key,false);
 r.publish('guided-cue:E4');
 assert.ok(!r.view().guided!.cue!.includes('ก่อนคนอื่นรู้ให้เงินเข้าก่อน'));
 assert.ok(!r.view().guided!.cue!.includes('DM บอก'));
 const w=r.saved(),s=w.case001!;s.guided!.phase='FINAL';s.guided!.scene='F1';s.seals[0]=s.seals[1]=true;s.ghost='hostile';
 startCaseBattle(w,'a',caseGrid('E'),()=>20);
 assert.equal(w.caseMap!.battle!.id,'EN04');
 assert.ok(!allowedGuidedScenes(w).some(scene=>scene.id==='F4'));
 w.caseMap!.battle!.phase='flood_memory';assert.ok(allowedGuidedScenes(w).some(scene=>scene.id==='F4'));
});

test('C5 props remain an explicit unresolved source requirement; v5.1 DC overrides are rejected before rolling',()=>{
 const r=room();r.scene('A2');
 r.send('a','caseAction',{actionId:'dice:A2_RADIO_ECHO:SPI',site:'A'});
 const pending=r.panel().investigators[0].check!;
 assert.throws(()=>r.send('dm','dmRequestRoll',{targetId:'a',checkId:pending.id,difficulty:17}),/รักษา DC/);
 assert.equal(r.view().diceRequest,null);
 const w=r.saved();let rolls=0;
 assert.throws(()=>runStoryCheck(w,'a','dice:A2_RADIO_ECHO:SPI',undefined,()=>{rolls++;return 20;},17),/รักษา DC/);
 assert.equal(rolls,0);assert.deepEqual(w.case001!.storyChecks,undefined);
 r.scene('A3');r.next();r.scene('B4');r.scene('B5');r.next();r.scene('C5');
 assert.ok(!r.view().case001!.actions.some(a=>a.id.includes('C5_EVACUATION_RECORDS')));
});

test('trauma dialogue requires actual witnessed or communicated knowledge, and dead NPCs never speak',()=>{
 const r=room(),s=r.saved().case001!;s.site='E';s.guided!.phase='FINAL';s.guided!.scene='F6';s.guided!.presented.push('F6');s.opened=true;s.ghost='cautious';
 killHostage51(s,'เพิ่ม','ritual_toll');
 assert.ok(guidedDialogue(s).every(l=>!['ดล','นิด','เพิ่ม'].includes(l.speaker)));
 s.v51!.deathKnown.ดล=['เพิ่ม'];
 assert.ok(dmOptions51(s).some(o=>o.id.startsWith('context:F6:')));
 const line=scenes51.F6.dialogue.find(l=>l.text==='เขาอยู่คนเดียวไหม?')!;s.v51!.contextConfirmed.push(line.id);
 assert.ok(guidedDialogue(s).some(l=>l.id===line.id));
 assert.ok(!guidedDialogue(s).some(l=>l.text.startsWith('เพิ่ม!')));
 killHostage51(s,'ดล','crossfire_wichai');assert.ok(!guidedDialogue(s).some(l=>l.speaker==='ดล'));
});
