import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseGrid, createCharacter, startTurn } from '@baan/shared';
import { emitBattlePhase, battleView, caseBattleAction, caseOpportunity, finishCaseBattle, newCaseMap, startCaseBattle, syncCaseBattle } from '../src/case001/caseBattle.js';
import { newCase, type Site } from '../src/case001/case001.js';
import { WorldStore, type World } from '../src/world.js';

test('each case location exposes the expanded grid and retains its blocked cells',()=>{
  for (const site of ['A','B','C','D','E'] as const) {
    const grid=caseGrid(site);
    assert.equal(grid.width,14);
    assert.equal(grid.height,10);
    assert.ok(grid.blocked.some(cell=>cell.x===11 && cell.y===3) || grid.blocked.some(cell=>cell.x===10 && cell.y===2));
    assert.ok(!grid.blocked.some(cell=>cell.x===13 && cell.y===8));
  }
});

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
  s.story={sceneId:'E',evidence:[],objectives:[],firedTriggers:[],endingId:null};
  s.seals=[true,true,false];s.haunt=8;s.ghost='pacified';
  assert.notEqual(caseOpportunity(s,w.caseMap!),'EN04');
  s.ghost='hostile';
  startCaseBattle(w,'p0',grid);
  const b=w.caseMap!.battle!;
  assert.equal(b.phase,'chains');
  emitBattlePhase(w);emitBattlePhase(w);
  assert.equal(s.narrativeEvents!.filter(e=>e.eventId==='EN04:chains').length,1);
  assert.equal(b.enemies[0].state.ghostHealth,20);
  for(const projection of [...b.projections]) {
    w.players.p0={x:projection.x,y:projection.y-1};
    w.turns.p0=startTurn();
    caseBattleAction(w,'p0',{type:'caseObjective'},grid,()=>20,()=>{});
  }
  assert.equal(b.phase,'flood_memory');
  emitBattlePhase(w);
  assert(s.story!.objectives.includes('memory-fragment'));
  assert(!s.story!.objectives.includes('wichai-memory'));
  assert.doesNotMatch(s.narrativeEvents!.at(-1)!.text,/วิชัย/);
  assert.equal(s.seals[2],false);
  s.seals[2]=true;syncCaseBattle(w);
  assert.equal(b.phase,'choice');
  emitBattlePhase(w);emitBattlePhase(w);
  assert.deepEqual(s.narrativeEvents!.filter(e=>e.eventId.startsWith('EN04:') && ['chains','flood_memory','choice'].some(p=>e.eventId.endsWith(p))).map(e=>e.eventId),['EN04:chains','EN04:flood_memory','EN04:choice']);
  assert.equal(b.enemies[0].tactics.profile?.anchorActive,false);
  s.ghost='freed';syncCaseBattle(w);
  assert.equal(w.caseMap!.battle,undefined);
});

test('v4.1 uses only Mae Kaeo in the grove and finale and carries a grove victory forward',()=>{
  const w=fixture('D',4);
  w.case001={...newCase(true,4,'4.1'),site:'D',ghost:'cautious'};
  startCaseBattle(w,'p0',caseGrid('D'),()=>20);
  const grove=battleView(w.caseMap!,'D')!;
  assert.equal(grove.id,'EN02');
  assert.deepEqual(grove.enemies.map(enemy=>enemy.name),['แม่แก้ว']);
  w.caseMap!.battle!.enemies[0].state.outcome='defeated';
  finishCaseBattle(w);
  const s=w.case001;
  assert.equal(s.ghost,'hidden');
  assert.equal(s.seals[2],false);
  assert.ok(s.story!.objectives.includes('kaew-dispersed'));

  s.site='E';
  for(const player in w.players) w.caseMap!.sites[player]='E';
  s.key=true;
  assert.equal(caseOpportunity(s,w.caseMap!),undefined);
  s.evidence.push('E05');
  s.seals=[true,true,false];
  s.minute=210;
  startCaseBattle(w,'p0',caseGrid('E'),()=>20);
  const final=battleView(w.caseMap!,'E')!;
  assert.equal(final.id,'EN04');
  assert.deepEqual(final.enemies.map(enemy=>enemy.name),['แม่แก้ว']);
  assert.equal(final.enemies[0].hp,28);
  assert.deepEqual(final.enemies[0].defense,{PDEF:14,MDEF:16});
  assert.equal(final.projections.length,1);
  assert.match(s.narrativeEvents!.at(-1)!.text,/รอยแตกร้าว/);
  s.seals[2]=true;
  syncCaseBattle(w);
  assert.equal(w.caseMap!.battle,undefined);
  assert.equal(caseOpportunity(s,w.caseMap!),undefined);
});

test('Combat Lite scales Case 001 health and lets the ghost win initiative',()=>{
  for(const [count,hp] of [[2,8],[3,12],[4,16],[5,20],[6,24]]) {
    const w=fixture('C',count);
    w.case001={...newCase(true,4),site:'C',evidence:['E01']};
    const grid=caseGrid('C');
    let rolls=0;
    startCaseBattle(w,'p0',grid,()=>++rolls===count+1 ? 20 : 1);
    const b=w.caseMap!.battle!;
    assert.equal(b.enemies[0].state.ghostHealth,hp);
    assert.equal(b.enemies[0].tactics.profile?.movement,3);
    assert.equal(b.initiative?.[0],null);
    assert.equal(b.active,'p0');
  }
});

test('Combat Lite attacks use Defense thresholds and listed damage',()=>{
  const w=fixture('C',2), grid=caseGrid('C');
  w.case001={...newCase(true,4),site:'C',evidence:['E01']};
  w.characters!.p0=createCharacter('containment_specialist',undefined,undefined,true);
  w.characters!.p1=createCharacter('field_medic',undefined,undefined,true);
  const initiative=[20,10,1];
  startCaseBattle(w,'p0',grid,()=>initiative.shift()!);
  const b=w.caseMap!.battle!, enemy=b.enemies[0];
  w.players.p0={x:4,y:7};
  enemy.state.ghost={x:4,y:8};
  caseBattleAction(w,'p0',{type:'strike'},grid,()=>7,()=>{});
  assert.equal(enemy.state.ghostHealth,7);
  caseBattleAction(w,'p0',{type:'endTurn'},grid,()=>20,()=>{});
  caseBattleAction(w,'p1',{type:'endTurn'},grid,()=>20,()=>{});
  assert.equal(enemy.tactics.telegraph?.attack?.id,'WET_CLAW');
  caseBattleAction(w,'p0',{type:'endTurn'},grid,()=>20,()=>{});
  caseBattleAction(w,'p1',{type:'endTurn'},grid,()=>11,()=>{});
  assert.equal(w.characters!.p0.hp,10); // 11 + 3 < PDEF 15
  assert.equal(enemy.tactics.profile?.combat?.MDEF,13);
});


test('basic mode reduces attack grind and caps enemy HP scaling for a crowded six-player board',()=>{
 const w=fixture('C',6),grid=caseGrid('C');w.basicMode=true;
 w.case001={...newCase(true,4),site:'C',evidence:['E01']};
 w.characters!.p0=createCharacter('containment_specialist',undefined,undefined,true);
 const rolls=[20,10,10,10,10,10,1];startCaseBattle(w,'p0',grid,()=>rolls.shift() ?? 10);
 const enemy=w.caseMap!.battle!.enemies[0];assert.equal(enemy.state.ghostHealth,16);
 w.players.p0={x:4,y:7};enemy.state.ghost={x:4,y:8};
 caseBattleAction(w,'p0',{type:'strike'},grid,()=>7,()=>{});
 assert.equal(enemy.state.ghostHealth,14);
});
