import assert from 'node:assert/strict';
import {test} from 'node:test';
import {caseGrid,createCharacter,startTurn,liteGhostHP} from '@baan/shared';
import {newCase} from '../src/case001/case001.js';
import {newGuided} from '../src/case001/guidedCase.js';
import {newState51} from '../src/case001/storyV51.js';
import {newCaseMap,startCaseBattle,caseBattleAction,turnEncounterAction,battleView} from '../src/case001/caseBattle.js';
import {caseCombatStats} from '../src/case001/caseCombatStats.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {storyContent,reader55} from '../src/case001/v51Content.js';
import {sceneCue51} from '../src/case001/storyV51.js';
import {learnedStoryInformation} from '../src/case001/storyDice.js';
import type {World} from '../src/world.js';

function finalRoom(count:number,dm=false) {
 const players=Object.fromEntries(Array.from({length:count},(_,i)=>['p'+i,{x:i+2,y:7}]));
 const map=newCaseMap(players);
 for(const id in players)map.sites[id]='E';
 const s=newCase(true,4,'4.1');
 s.guided=newGuided('5.5');s.guided.phase='FINAL';s.guided.scene='F1';s.guided.presented=['F1'];
 s.v51=newState51(false,true);s.v51.finalReleaseCommitted55=true;s.v51.coreApproached=true;s.site='E';s.key=true;
 const w:World={players,caseMap:map,case001:s,revision:0,
  characters:Object.fromEntries(Object.keys(players).map(id=>[id,createCharacter('medium',undefined,undefined,true)])),
  turns:Object.fromEntries(Object.keys(players).map(id=>[id,startTurn()])),
  objects:{},inventory:{},evidence:[],encounter:null,activePlayer:null,roundStart:null,lastCheck:null,
  scenario:{sceneId:'yard',evidence:[],objectives:[],firedTriggers:[],endingId:null},humanDmId:dm?'dm':null,diceRequest:null,basicMode:true};
 const grid=caseGrid('E');
 startCaseBattle(w,'p0',grid,()=>20);
 const b=map.battle!;
 const action=(type:string,step?:number,die=20)=>caseBattleAction(w,'p0',{type,step},grid,()=>die,()=>{});
 const nextRound=()=>{
  do {caseBattleAction(w,b.active!,{type:'endTurn'},grid,()=>1,()=>{});}while(b.active!=='p0');
 };
 return {w,b,action,nextRound};
}

for(const count of [2,3,4,5,6])test('v5.5 shield and ordered release with '+count+' players',()=>{
 const {w,b,action,nextRound}=finalRoom(count);
 const enemy=b.enemies[0];
 assert.equal(enemy.state.ghostHealth,liteGhostHP(caseCombatStats.EN04.baseHPFor2,count));
 w.players.p0={x:enemy.state.ghost.x,y:enemy.state.ghost.y-1};
 const hp=enemy.state.ghostHealth;
 action('strike');
 assert.equal(enemy.state.ghostHealth,hp);
 assert.equal(w.lastCheck?.outcome,'success');
 assert.equal(w.turns.p0.ap,1);
 assert.equal(b.final55!.damageBlocked,true);
 nextRound();
 const focus=b.focusCell!;
 w.players.p0={x:focus.x,y:focus.y-1};
 assert.throws(()=>action('caseObjective',2));
 action('caseObjective',0,1);
 assert.equal(b.final55!.step,0);
 assert.equal(w.turns.p0.ap,1);
 nextRound();
 for(const step of [0,1,2]) {
  action('caseObjective',step);
  assert.equal(b.final55!.step,step+1);
  assert.throws(()=>action('caseObjective',step));
  assert.equal(w.case001!.v51!.RITUAL_STATUS,'active');
  nextRound();
 }
 assert.equal(b.final55!.shield,'down');
 assert.equal(b.phase,'flood_memory');
 w.players.p0={x:enemy.state.ghost.x,y:enemy.state.ghost.y-1};
 action('strike');
 assert.equal(enemy.state.ghostHealth,hp-2);
 nextRound();
 w.players.p0={x:focus.x,y:focus.y-1};
 action('caseObjective',3);
 assert.equal(w.case001!.v51!.RITUAL_STATUS,'stopped');
 assert.ok(Object.values(w.case001!.v51!.RITUAL_TETHER_INTACT).every(value=>!value));
 assert.equal(w.caseMap!.battle,undefined);
});

for(const count of [2,3,4,5,6])test('no-board Final preserves shield actions and DM turns with '+count+' players',()=>{
 const {w,b}=finalRoom(count,true);
 const turn=(actor:string,choice:string,extra:object={},die=20)=>turnEncounterAction(w,actor,{round:b.round,choice,...extra},()=>die,()=>{});
 const nextRound=()=>{
  while(b.active)turn(b.active,'pass');
  turn('dm','pass');
 };
 assert.ok(b.turnEncounter);
 assert.equal(b.active,'p0');
 assert.throws(()=>turn('dm','attack'));
 assert.throws(()=>turn('p1','objective',{step:0}));
 const hp=b.enemies[0].state.ghostHealth;
 turn('p0','strike');
 assert.equal(b.enemies[0].state.ghostHealth,hp);
 assert.equal(b.final55!.damageBlocked,true);
 assert.equal(b.active,'p1');
 nextRound();
 turn('p0','objective',{step:0},1);
 assert.equal(b.final55!.step,0);
 nextRound();
 for(const step of [0,1,2]) {
  turn('p0','objective',{step});
  assert.equal(b.final55!.step,step+1);
  assert.throws(()=>turn('p0','objective',{step}));
  nextRound();
 }
 assert.equal(b.final55!.shield,'down');
 assert.equal(w.case001!.v51!.RITUAL_STATUS,'active');
 turn('p0','strike');
 assert.equal(b.enemies[0].state.ghostHealth,hp-2);
 while(b.active)turn(b.active,'pass');
 const attack=battleView(w.caseMap!,'E',w,true)!.turnEncounter!.attacks![0];
 assert.equal(battleView(w.caseMap!,'E',w,false)!.turnEncounter!.attacks,undefined);
 assert.throws(()=>turn('dm','attack',{attackId:attack.id,targetId:'p0'}));
 turn('dm','declareAttack',{attackId:attack.id,targetId:'p0'});
 const before=w.characters!.p0.hp;
 turn('dm','attack',{attackId:attack.id,targetId:'p0'},1);
 assert.equal(w.characters!.p0.hp,before);
 assert.equal(b.turnEncounter!.history.at(-1)!.check!.die,1);
 turn('p0','objective',{step:3});
 assert.equal(w.caseMap!.battle,undefined);
 assert.equal(w.case001!.v51!.RITUAL_STATUS,'stopped');
});

test('v5.5 body defeat cannot stop the ritual or respawn the Final body',()=>{
 const {w,b,action,nextRound}=finalRoom(2);
 const enemy=b.enemies[0], focus=b.focusCell!;
 w.players.p0={x:focus.x,y:focus.y-1};
 for(const step of [0,1,2]) {action('caseObjective',step);nextRound();}
 while(enemy.state.ghostHealth>0) {
  w.players.p0={x:enemy.state.ghost.x,y:enemy.state.ghost.y-1};
  action('strike');nextRound();
 }
 assert.equal(w.caseMap!.battle,b);
 assert.equal(w.case001!.v51!.RITUAL_STATUS,'active');
 assert.equal(w.case001!.v51!.finalBody55,'dispersed');
 assert.equal(w.case001!.v51!.KAEW_TEMP_DISPERSED,true);
 nextRound();nextRound();
 assert.equal(enemy.state.ghostHealth,0);
 w.players.p0={x:focus.x,y:focus.y-1};
 action('caseObjective',3);
 assert.equal(w.case001!.v51!.RITUAL_STATUS,'stopped');
 assert.match(sceneCue51(w.case001!,'F5'),/เงา/);
});

test('no-board Final keeps a defeated body defeated and preserves the delayed flood attack',()=>{
 const {w,b}=finalRoom(2,true);
 const turn=(actor:string,choice:string,extra:object={})=>turnEncounterAction(w,actor,{round:b.round,choice,...extra},()=>20,()=>{});
 const cycle=()=>{while(b.active)turn(b.active,'pass');turn('dm','pass');};
 for(const step of [0,1]){turn('p0','objective',{step});cycle();}
 turn('p0','objective',{step:2});turn('p1','pass');
 const flood=battleView(w.caseMap!,'E',w,true)!.turnEncounter!.attacks!.find(attack=>attack.id==='FLOOD_MEMORY')!;
 const sanity=w.characters!.p0.sanity;
 turn('dm','declareAttack',{attackId:flood.id,targetId:'p0'});
 assert.equal(w.characters!.p0.sanity,sanity);
 assert.equal(b.active,'p0');
 assert.equal(b.round,4);
 while(b.active)turn(b.active,'pass');
 turn('dm','attack',{attackId:flood.id,targetId:'p0'});
 assert.equal(w.characters!.p0.sanity,sanity-2);
 b.enemies[0].state.ghostHealth=2;
 turn('p0','strike');
 assert.equal(b.enemies[0].state.ghostHealth,0);
 assert.equal(w.case001!.v51!.RITUAL_STATUS,'active');
 assert.ok(battleView(w.caseMap!,'E',w)!.enemies.length);
 cycle();
 assert.equal(b.enemies[0].state.ghostHealth,0);
 assert.deepEqual(battleView(w.caseMap!,'E',w,true)!.turnEncounter!.attacks,[]);
 turn('p0','objective',{step:3});
 assert.equal(w.case001!.v51!.RITUAL_STATUS,'stopped');
 assert.equal(w.caseMap!.turnConclusion!.check!.outcome,'success');
});

test('v5.5 retains its complete source, 17 original cards, 262 unique Q&A and four endings',()=>{
 const read=(suffix:string)=>readFileSync(new URL('../scenarios/case-001/case-001.v5.5.'+suffix,import.meta.url),'utf8');
 const source=read('script.md'),manifest=JSON.parse(read('manifest.json'));
 assert.equal(createHash('sha256').update(source).digest('hex'),manifest.sha256);
 const content=storyContent({guided:{version:'5.5'}});
 assert.equal(Object.keys(content.scenes).length,31);
 const original=JSON.parse(read('cards-original.json')) as Record<string,string>;
 assert.equal(Object.keys(original).length,17);
 for(const check of content.checks) {
  assert.equal(check.sourceMarkdown,original[check.id]);
  assert.ok(source.includes(original[check.id]),check.id);
 }
 const bank=JSON.parse(read('qa.json'));
 const questions=bank.scenes.flatMap((scene:{questions:{id:string}[]})=>scene.questions);
 assert.equal(bank.scenes.length,31);
 assert.equal(questions.length,262);
 assert.equal(new Set(questions.map((question:{id:string})=>question.id)).size,262);
 assert.equal(manifest.qaCount,262);
 assert.deepEqual(Object.keys(content.endings),['A','B','C','D']);
 for(const ending of Object.values(content.endings))assert.ok(source.includes(ending.script));
});

test('v5.5 legacy result claims stay out of both DM summaries and player notebooks',()=>{
 const {w}=finalRoom(2);
 const s=w.case001!;
 for(const [id,scene] of [['E3_HOSTAGES_ORDER','E3'],['E5_WICHAI_NEGOTIATE','E5'],['H1_FLOOD_TIMELINE','H1']]) {
  s.storyChecks ??= {};
  s.storyChecks[id]=[{actor:'p0',stat:'SOC',dc:14,die:1,total:1,outcome:'failure',context:''}];
  assert.equal(learnedStoryInformation(s).filter(entry=>entry.id.startsWith(id)).length,0);
  const shown=reader55.checks.find(check=>check.scene_id===scene)!;
  assert.doesNotMatch(shown.failure,/คว้ามีด|จ่อมีด|คว้า.*ตัวประกัน|ประเสริฐ.*สารภาพ/);
 }
});
