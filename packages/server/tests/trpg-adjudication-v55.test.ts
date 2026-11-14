import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {caseGrid,createCharacter,startTurn} from '@baan/shared';
import {newCase} from '../src/case001/case001.js';
import {newGuided,guidedCommand,guidedView} from '../src/case001/guidedCase.js';
import {addFact} from '../src/case001/caseStory.js';
import {reader55} from '../src/case001/v51Content.js';
import {landDocumentDisclosureId} from '../src/case001/disclosureEvidence.js';
import {newState51,dmOptions51,command51,sceneCue51} from '../src/case001/storyV51.js';
import {storyCheckOptions} from '../src/case001/storyDice.js';
import {availableQa53} from '../src/case001/qa53.js';
import {playerAnswer55} from '../src/case001/dmPresentation55.js';
import {newCaseMap,startCaseBattle,turnEncounterAction} from '../src/case001/caseBattle.js';
import {WorldStore,type World} from '../src/world.js';
import {resolveNpcAttack} from '../src/tacticalEncounter.js';
import type {CaseAttack} from '../src/case001/caseCombatStats.js';

function fixture(scene='B3',site='B') {
 const players={p0:{x:2,y:7},p1:{x:3,y:7}},map=newCaseMap(players);
 map.sites={p0:site,p1:site} as typeof map.sites;
 const s=newCase(true,4,'4.1');s.guided=newGuided('5.5');s.guided.scene=scene;s.guided.phase=site as 'B';s.guided.presented=[scene];s.guided.observed=[scene];s.site=site as 'B';s.v51=newState51(false,true);
 const w:World={players,caseMap:map,case001:s,revision:0,characters:{p0:createCharacter('medium',undefined,undefined,true),p1:createCharacter('field_medic',undefined,undefined,true)},turns:{p0:startTurn(),p1:startTurn()},objects:{},inventory:{},evidence:[],encounter:null,activePlayer:null,roundStart:null,lastCheck:null,scenario:{sceneId:'yard',evidence:[],objectives:[],firedTriggers:[],endingId:null},humanDmId:'dm',diceRequest:null,basicMode:true};
 return {w,s,v:s.v51!};
}

test('E4 land documents can be selected and disclosed without Ton testimony',()=>{
 const {w,s,v}=fixture('F5','E');s.guided!.phase='FINAL';v.RITUAL_STATUS='stopped';v.FLOOD_EVIDENCE_COLLECTED=true;s.evidence.push('E07');addFact(s,'gate-truth');
 const ids=()=>guidedView(w).disclosureOptions.map(o=>o.id);
 assert.ok(!ids().includes(landDocumentDisclosureId));
 s.evidence.push('E08');assert.ok(!ids().includes(landDocumentDisclosureId),'Ton testimony is not a land document');
 s.evidence=s.evidence.filter(id=>id!=='E08');v.LAND_EVIDENCE_COLLECTED=true;
 assert.ok(ids().includes(landDocumentDisclosureId));
 guidedCommand(w,'dm','select-disclosure',JSON.stringify({evidence:['E07',landDocumentDisclosureId],recipient:'พนักงานสอบสวน'}));
 assert.ok(dmOptions51(s).some(o=>o.id==='disclosed'));
 v.LAND_EVIDENCE_COLLECTED=false;assert.ok(!dmOptions51(s).some(o=>o.id==='disclosed'));
 v.LAND_EVIDENCE_COLLECTED=true;command51(w,'disclosed');assert.equal(v.pastDisclosed,true);
 assert.ok(!s.evidence.includes('E08'),'disclosure does not manufacture testimony');
});

test('every v5.5 scene has three beginner guidance fields',()=>{
 assert.equal(reader55.scenes.length,31);
 for(const scene of reader55.scenes)for(const field of ['see','ask','outcomes'] as const)assert.ok(scene.beginner?.[field]?.trim(),scene.id+':'+field);
});

test('DM decides whether Ton speaks; permission offers Q&A without forcing a roll',()=>{
 const {w,s}=fixture();
 const ids=()=>availableQa53(s).map(q=>q.id);
 assert.ok(!ids().includes('B3_Q002'));
 assert.throws(()=>guidedCommand(w,'p0','protect'));
 guidedCommand(w,'dm','protect');
 assert.ok(ids().includes('B3_Q002'));assert.ok(ids().includes('B3_Q003'));
 assert.equal(s.storyChecks,undefined);
 assert.ok(storyCheckOptions(w,'p0').some(o=>o.id==='dice:B3_TON_DISCLOSURE:SOC'));
 guidedCommand(w,'dm','ton-withhold');
 assert.ok(!ids().includes('B3_Q002'));
 assert.ok(!storyCheckOptions(w,'p0').some(o=>o.id==='dice:B3_TON_DISCLOSURE:SOC'));
});

test('F5 attempt follows conversation OR evidence decision, and fatal needs a response window',()=>{
 for(const talked of [false,true])for(const evidence of [false,true]) {
  const {w,s,v}=fixture('F5','E');s.guided!.phase='FINAL';v.RITUAL_STATUS='stopped';s.seals[2]=true;s.ghost='cautious';v.kaewTalked55=talked;v.humanCaseSupported=evidence;v.disclosurePlan=false;v.f5Question='delivered';v.wichaiArrival53={reason:'called',arrived:true};s.wichai!.site='E';
  assert.equal(dmOptions51(s).some(o=>o.id==='attempt'),!talked || !evidence);
  if(talked && evidence)continue;
  command51(w,'attempt');v.pending!.announced=false;
  assert.ok(!dmOptions51(s).some(o=>o.id==='fatal'));assert.throws(()=>command51(w,'fatal'));
  v.pending!.announced=true;
  const hidden=structuredClone(s);hidden.wichai!.site='B';assert.ok(!dmOptions51(hidden).some(o=>o.id==='fatal'));
  command51(w,'fatal');assert.equal(v.WICHAI_STATUS,'dead');assert.equal(v.WICHAI_DEATH_CAUSE,'kaew_execution');
 }
});

test('a prior conversation survives a later D4 result, and DM can resolve a rescue instead of death',()=>{
 const {w,s,v}=fixture('F5','E');s.guided!.phase='FINAL';v.RITUAL_STATUS='stopped';s.seals[2]=true;s.ghost='cautious';v.KAEW_D_RESULT='won';v.KAEW_TEMP_DISPERSED=false;v.kaewTalked55=true;v.humanCaseSupported=true;v.f5Question='delivered';v.wichaiArrival53={reason:'called',arrived:true};s.wichai!.site='E';
 assert.ok(!dmOptions51(s).some(o=>o.id==='attempt'));
 v.humanCaseSupported=false;command51(w,'attempt');command51(w,'prevented');
 assert.equal(v.WICHAI_STATUS,'free');assert.equal(v.pending,undefined);
});

test('DM evaluates evidence and starts a threat without reading a mandatory script first',()=>{
 const {w,s,v}=fixture('F5','E');s.guided!.phase='FINAL';v.RITUAL_STATUS='stopped';s.seals[2]=true;s.ghost='cautious';v.kaewTalked55=true;v.wichaiArrival53={reason:'called',arrived:true};s.wichai!.site='E';
 command51(w,'evidence-supported');assert.equal(v.humanCaseSupported,true);
 assert.ok(!dmOptions51(s).some(o=>o.id==='attempt'));
 command51(w,'evidence-insufficient');assert.equal(v.f5Question,undefined);
 command51(w,'attempt');assert.equal(v.pending?.kind,'execution');
 v.KAEW_FINAL='calm';assert.ok(!dmOptions51(s).some(o=>o.id==='fatal'));
 s.guided!.version='5.3';assert.throws(()=>command51(w,'evidence-supported'));
});

test('all three survivors can be brought upstairs without granting ritual safety',()=>{
 const {w,s,v}=fixture('E2','E');
 assert.throws(()=>command51(w,'hostages-upstairs'));
 s.opened=true;v.HOSTAGES_FOUND=3;command51(w,'hostages-upstairs');
 assert.equal(v.hostagesUpstairs55,true);assert.equal(s.evacuated.length,0);assert.equal(s.escorts.length,0);
 assert.deepEqual(v.RITUAL_TETHER_INTACT,{ดล:true,นิด:true,เพิ่ม:true});
 assert.match(sceneCue51(s,'E3'),/บนชานเรือน/);
 assert.throws(()=>command51(w,'hostages-upstairs'));
 s.guided!.scene='E3';s.guided!.presented.push('E3');v.dolUngagged55=true;
 assert.ok(availableQa53(s).some(q=>q.id==='E3_Q005'));
 s.escorts=['เพิ่ม'];
 assert.ok(availableQa53(s).some(q=>q.id==='E3_Q001'));
 assert.ok(!availableQa53(s).some(q=>q.id==='E3_Q005'));
});

test('ward reduces incoming damage before HP is clamped to zero',()=>{
 const {w,s}=fixture('C4','C');s.evidence.push('E01');startCaseBattle(w,'p0',caseGrid('C'),()=>20);
 const b=w.caseMap!.battle!;b.active=null;b.turnEncounter!.acted=['p0','p1'];b.turnEncounter!.conditions={ward:{p0:true},cover:{},silenced:{}};w.characters!.p0.hp=1;
 turnEncounterAction(w,'dm',{round:b.round,choice:'attack',attackId:'WET_CLAW',enemyId:b.enemies[0].id,targetId:'p0'},()=>20,()=>{});
 assert.equal(w.characters!.p0.hp,0);
 assert.deepEqual(b.turnEncounter!.history.at(-1)!.changes?.find(c=>c.id==='p0')?.hp,{before:1,after:0});
 assert.equal(b.turnEncounter!.conditions!.ward.p0,undefined);
});

test('player text never falls back to private guidance',()=>{
 assert.equal(playerAnswer55({kind:'npc',answer:'DM ONLY C3/F4 “คำพูดที่ยังไม่อนุมัติ”'}),'');
 assert.equal(playerAnswer55({kind:'npc',answer:'คำแนะนำลับ',playerAnswer:'บทพูดที่อนุมัติ'}),'บทพูดที่อนุมัติ');
 assert.equal(playerAnswer55({kind:'action',answer:'ลับ',playerAnswer:'ห้ามส่ง'}),'');
});

test('authored v5.5 player answers contain no private system or scene instructions',()=>{
 const bank=JSON.parse(readFileSync(new URL('../scenarios/case-001/case-001.v5.5.qa.json',import.meta.url),'utf8'));
 for(const scene of bank.scenes)for(const q of scene.questions) {
  assert.equal(typeof q.playerAnswer,'string',q.id);
  if(q.kind==='action')assert.equal(q.playerAnswer,'',q.id);
  assert.doesNotMatch(q.playerAnswer,/\b(?:DM|Full|Partial|Failure|ACT|Action|Runtime|Core|Check|Canon|Overlay)\b|\b[A-F][1-9]\b/,q.id);
 }
});

test('damage reduction clamps HP and Sanity only after the effective hit',()=>{
 for(const resource of ['HP','Sanity'] as const)for(const damage of [1,2,3]) {
  const c=createCharacter('medium',undefined,undefined,true);c.hp=1;c.sanity=1;
  const attack={damageResource:resource,targetDefense:resource==='HP'?'PDEF':'MDEF',damage} as CaseAttack;
  const result=resolveNpcAttack(c,attack,20,20,false,1);
  assert.equal(result.damage,damage-1);
  assert.equal(resource==='HP'?c.hp:c.sanity,Math.max(0,1-(damage-1)));
 }
});

test('DM can narrate outside the script without changing game facts or allowing player spoofing',()=>{
 const store=new WorldStore(()=>20,true,true,true,false,'5.5');store.create('TRPG',2);
 for(const id of ['dm','a','b'])store.addPlayer('TRPG',id);
 store.apply('TRPG','dm',{id:'claim',type:'claimDm'});
 for(const id of ['a','b'])store.apply('TRPG',id,{id:'role',type:'createCharacter',profession:id==='a'?'medium':'field_medic'});
 store.apply('TRPG','dm',{id:'start',type:'caseStart',mode:'story'});
 const before=store.checkpoint('TRPG').world.case001!;
 assert.throws(()=>store.apply('TRPG','a',{id:'spoof',type:'dmNarrate',text:'spoof'}));
 const command={id:'improv',type:'dmNarrate' as const,speaker:'ประเสริฐ',text:'ลองถามสิ่งที่พวกคุณสงสัยมาได้เลยครับ'};
 store.apply('TRPG','dm',command);assert.equal(store.apply('TRPG','dm',command).duplicate,true);
 const after=store.checkpoint('TRPG').world.case001!;
 assert.deepEqual(after.evidence,before.evidence);assert.deepEqual(after.v51,before.v51);
 assert.ok(JSON.stringify(store.snapshot('TRPG','a')).includes(command.text));
 const panel=store.dmPanel('TRPG','dm');assert.ok('caseMode' in panel);
 assert.equal(panel.storyProgress?.answers?.filter(a=>a.question==='บทนอกสคริปต์').length,1);
});
