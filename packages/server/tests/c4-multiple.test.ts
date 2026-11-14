import assert from 'node:assert/strict';
import {test} from 'node:test';
import {caseGrid,createCharacter,startTurn,liteGhostHP} from '@baan/shared';
import {newCase} from '../src/case001/case001.js';
import {newGuided} from '../src/case001/guidedCase.js';
import {newState51} from '../src/case001/storyV51.js';
import {newCaseMap,startCaseBattle,turnEncounterAction,battleView} from '../src/case001/caseBattle.js';
import type {World} from '../src/world.js';
function room(count:number) {
 const players=Object.fromEntries(Array.from({length:count},(_,i)=>['p'+i,{x:i+2,y:7}]));
 const map=newCaseMap(players);for(const id in players)map.sites[id]='C';
 const s=newCase(true,4,'4.1');s.evidence.push('E01');s.site='C';
 s.guided=newGuided('5.5');s.guided.phase='C';s.guided.scene='C4';s.guided.presented=['C4'];s.v51=newState51(false,true);
 let w:World={players,caseMap:map,case001:s,revision:0,characters:Object.fromEntries(Object.keys(players).map(id=>[id,createCharacter('medium',undefined,undefined,true)])),turns:Object.fromEntries(Object.keys(players).map(id=>[id,startTurn()])),objects:{},inventory:{},evidence:[],encounter:null,activePlayer:null,roundStart:null,lastCheck:null,scenario:{sceneId:'yard',evidence:[],objectives:[],firedTriggers:[],endingId:null},humanDmId:'dm',diceRequest:null,basicMode:true};
 startCaseBattle(w,'p0',caseGrid('C'),()=>20);
 const turn=(actor:string,choice:string,extra:object={},die=20)=>turnEncounterAction(w,actor,{round:w.caseMap!.battle!.round,choice,...extra},()=>die,()=>{});
 return {get w(){return w;},turn,restore:()=>{w=JSON.parse(JSON.stringify(w));}};
}
for(const count of [2,3,4,5,6])test('C4 two enemies retain stats, targets, individual NPC turns and save progress: '+count,()=>{
 const r=room(count),b=r.w.caseMap!.battle!;
 assert.equal(b.enemies.length,2);assert.equal(b.enemies[0].state.ghostHealth,liteGhostHP(8,count));
 const [a,z]=b.enemies;
 assert.throws(()=>r.turn('p0','strike'));assert.throws(()=>r.turn('p0','strike',{targetId:'forged'}));
 const hp=a.state.ghostHealth;
 r.turn('p0','strike',{targetId:z.id});assert.equal(z.state.ghostHealth,hp-2);assert.equal(a.state.ghostHealth,hp);
 assert.equal(b.turnEncounter!.history.at(-1)!.target,z.id);assert.match(b.turnEncounter!.history.at(-1)!.effect!,/เสียพลังชีวิต 2/);
 for(let i=1;i<count;i++)r.turn('p'+i,i===1?'guard':'pass');
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.attacks,undefined);
 assert.throws(()=>r.turn('dm','attack',{enemyId:z.id,attackId:'WET_CLAW',targetId:'p0'}));
 const before=r.w.characters!.p1.hp;
 r.turn('dm','attack',{enemyId:a.id,attackId:'WET_CLAW',targetId:'p1'},9);
 assert.equal(r.w.characters!.p1.hp,before);assert.equal(b.round,1);assert.equal(b.active,null);
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.npcActive,z.id);
 r.restore();
 assert.throws(()=>r.turn('dm','pass',{enemyId:a.id}));
 r.turn('dm','attack',{enemyId:z.id,attackId:'WET_CLAW',targetId:'p1'},9);
 assert.equal(r.w.characters!.p1.hp,before);assert.equal(r.w.caseMap!.battle!.round,2);
 assert.equal(r.w.caseMap!.battle!.active,'p0');
 assert.deepEqual(r.w.caseMap!.battle!.turnEncounter!.acted,[]);
});
test('pacifying one enemy leaves the other active; all peaceful enemies resolve the story',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;const [a,z]=b.enemies;
 r.turn('p0','pacify',{targetId:a.id});assert.ok(r.w.caseMap!.battle);
 assert.equal(battleView(r.w.caseMap!,'C',r.w)!.enemies[0].resolved,true);
 assert.throws(()=>r.turn('p1','strike',{targetId:a.id}));
 r.turn('p1','pacify',{targetId:z.id});assert.equal(r.w.caseMap!.battle,undefined);
 assert.equal(r.w.case001!.v51!.GHOST_ENCOUNTER,'pacified');
});
test('defeated enemy is skipped by DM; victory waits for the last enemy',()=>{
 const r=room(2),b=r.w.caseMap!.battle!;const [a,z]=b.enemies;
 a.state.ghostHealth=2;r.turn('p0','strike',{targetId:a.id});assert.ok(r.w.caseMap!.battle);
 r.turn('p1','pass');assert.equal(battleView(r.w.caseMap!,'C',r.w)!.turnEncounter!.npcActive,z.id);
 r.turn('dm','withdraw',{enemyId:z.id});assert.equal(r.w.caseMap!.battle,undefined);
 assert.equal(r.w.case001!.v51!.GHOST_ENCOUNTER,'won');
});
