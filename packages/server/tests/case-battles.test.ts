import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseGrid, createCharacter, startTurn } from '@baan/shared';
import { battleView, caseBattleAction, caseOpportunity, newCaseMap, startCaseBattle, syncCaseBattle } from '../src/caseBattle.js';
import { newCase, type Site } from '../src/case001.js';
import { WorldStore, type World } from '../src/world.js';

test('EN01 retains location and occupancy through movement, escape and snapshot recovery',()=>{
  const worlds=new WorldStore(()=>20);
  worlds.create('test',2);
  for(const id of ['a','b']) {
    worlds.addPlayer('test',id);
    worlds.apply('test',id,{id:'create',type:'createCharacter',profession:'medium',bonus:'body'});
  }
  const act=(id:string,type:string,details:object={})=>worlds.apply('test','a',{id,type,...details}).snapshot;
  act('start','caseStart');
  act('b','caseAction',{actionId:'travel:B'});
  act('c','caseAction',{actionId:'travel:C'});
  assert.equal(worlds.snapshot('test','b').caseMap?.site,'A');
  act('clue','caseAction',{actionId:'clue:E01'});
  const started=act('encounter','start');
  assert.equal(started.caseMap?.battle?.id,'EN01');
  assert.equal(started.caseMap?.battle?.enemies.length,1);
  assert.equal(worlds.snapshot('test','b').caseMap?.battle,undefined);
  assert.deepEqual(Object.keys(worlds.snapshot('test','b').players),['b']);
  const beforeWithdrawal=worlds.snapshot('test','b');
  assert.equal(beforeWithdrawal.caseMap?.withdrawalBlocked,true);
  const withdraw={id:'withdraw',type:'caseAction',actionId:'finish'};
  assert.throws(()=>worlds.apply('test','b',withdraw),/ยังถอนทีมไม่ได้จนกว่าการเผชิญหน้าจะจบ/);
  assert.deepEqual(worlds.snapshot('test','b'),beforeWithdrawal);
  assert.deepEqual(worlds.snapshot('test','a'),started);
  assert.throws(()=>act('blocked','move',{target:{x:2,y:2}}));
  const moved=act('move','move',{target:{x:4,y:9}});
  assert.equal(moved.turns.a.ap,2);
  const escaped=act('exit','escape');
  assert.equal(escaped.caseMap?.battle,undefined);
  assert.deepEqual(escaped.players.a,{x:4,y:9});
  assert.equal(escaped.caseMap?.opportunity,undefined);
  assert.deepEqual(worlds.snapshot('test','a'),escaped);
  assert.equal(worlds.snapshot('test','b').caseMap?.withdrawalBlocked,false);
  const closed=worlds.apply('test','b',withdraw);
  assert.match(closed.snapshot.case001?.report?.text ?? '',/ตอนจบ D/);
  assert.equal(worlds.apply('test','b',withdraw).duplicate,true);
  assert.throws(()=>worlds.apply('test','b',{...withdraw,id:'withdraw-again'}));
  assert.deepEqual(worlds.snapshot('test','b'),closed.snapshot);
});

function fixture(site:Site,count:number):World {
  const players=Object.fromEntries(Array.from({length:count},(_,i)=>['p'+i,{x:3+i,y:7}]));
  const caseMap=newCaseMap(players);
  for(const id in players) caseMap.sites[id]=site;
  return {
    players,caseMap,case001:{...newCase(),site},revision:0,
    characters:Object.fromEntries(Object.keys(players).map(id=>[id,createCharacter('medium','body')])),
    turns:Object.fromEntries(Object.keys(players).map(id=>[id,startTurn()])),
    objects:{}, inventory:{}, evidence:[], encounter:null,activePlayer:null,roundStart:null,lastCheck:null,
    scenario:{sceneId:'yard',evidence:[],objectives:[],firedTriggers:[],endingId:null},humanDmId:null,diceRequest:null,
  };
}
test('grove and Guardian battles scale their rosters for two and four investigators',()=>{
  for(const count of [2,4]) for(const site of ['D','E'] as const) {
    const w=fixture(site,count);
    w.case001!.haunt=6;w.case001!.key=true;
    startCaseBattle(w,'p0',caseGrid(site));
    const battle=battleView(w.caseMap!,site)!;
    assert.equal(battle.id,site==='D'?'EN02':'EN03');
    assert.equal(battle.enemies.length,count===2?2:3);
    assert.equal(new Set(battle.enemies.map(e=>JSON.stringify(e.position))).size,battle.enemies.length);
  }
});

test('finale is bypassable when pacified and uses projections then the third seal to advance',()=>{
  const w=fixture('E',4), grid=caseGrid('E');
  const s=w.case001!;
  s.seals=[true,true,false];s.haunt=8;s.ghost='pacified';
  assert.notEqual(caseOpportunity(s,w.caseMap!),'EN04');
  s.ghost='hostile';
  startCaseBattle(w,'p0',grid);
  const b=w.caseMap!.battle!;
  assert.equal(b.phase,'chains');
  assert.equal(b.enemies[0].state.ghostHealth,20);
  for(const projection of [...b.projections]) {
    w.players.p0={x:projection.x,y:projection.y-1};
    w.turns.p0=startTurn();
    caseBattleAction(w,'p0',{type:'caseObjective'},grid,()=>20,()=>{});
  }
  assert.equal(b.phase,'flood_memory');
  assert.equal(s.seals[2],false);
  s.seals[2]=true;syncCaseBattle(w);
  assert.equal(b.phase,'choice');
  assert.equal(b.enemies[0].tactics.profile?.anchorActive,false);
  s.ghost='freed';syncCaseBattle(w);
  assert.equal(w.caseMap!.battle,undefined);
});
