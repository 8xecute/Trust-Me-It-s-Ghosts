import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCharacter, startGhostEncounter, startTurn, type Profession } from '@baan/shared';
import { advanceTactics, applyTechnique, newTactics, strikeV2 } from '../src/tacticalEncounter.js';
import type { World } from '../src/world.js';

const grid={width:10,height:10,blocked:[]};
const twenty=()=>20;
function fixture(role:Profession, talent?:string): World {
  const bonus=role==='containment_specialist'?'mind':'body';
  const players={a:{x:2,y:2},b:{x:2,y:3}};
  return {
    revision:0, players, objects:{}, inventory:{}, evidence:[], humanDmId:null, diceRequest:null,
    characters:{a:createCharacter(role,bonus,talent?{talent,background:'rescuer'}:undefined),
      b:createCharacter('field_medic','body')},
    activePlayer:'a', roundStart:'a', turns:{a:startTurn(),b:startTurn()},
    encounter:startGhostEncounter(players.a,{x:3,y:2}), tactics:newTactics(),
    scenario:{sceneId:'yard',evidence:[],objectives:[],firedTriggers:[],endingId:null},lastCheck:null,
  };
}

test('talisman and defensive line grant one defense bonus that expires after Ghost Phase', () => {
  for (const [role,talent] of [['ritual_specialist','protective_talisman'],['containment_specialist','defensive_line']] as const) {
    const w=fixture(role,talent), t=w.tactics!;
    applyTechnique(w,'a',{type:'useTalent',targetId:'b'},grid,twenty);
    assert.equal(t.defense.b,1);
    assert.equal(w.characters!.a.focus,3);
    t.telegraph={kind:'lash',cells:[w.players.b]};
    advanceTactics(w,grid,()=>11); // 13 would hit base Defense 12
    assert.equal(w.characters!.b.hp,10);
    t.telegraph={kind:'lash',cells:[w.players.b]};
    advanceTactics(w,grid,()=>11);
    assert.equal(w.characters!.b.hp,9);
  }
});

test('ritual zone and jammer each reduce a ghost check by two', () => {
  for (const [role,talent] of [['ritual_specialist','ritual_zone'],['occult_engineer','ritual_jammer']] as const) {
    const w=fixture(role,talent);
    applyTechnique(w,'a',{type:'useTalent',target:{x:1,y:2}},grid,twenty);
    w.tactics!.telegraph={kind:'lash',cells:[w.players.a]};
    advanceTactics(w,grid,()=>9);
    assert.equal(w.characters!.a.hp,10);
  }
});

test('binding prevents movement, bash pushes along legal cells and bindings can be removed', () => {
  const bind=fixture('containment_specialist','spirit_binding');
  bind.encounter!.ghost={x:4,y:2};
  applyTechnique(bind,'a',{type:'useTalent'},grid,twenty);
  advanceTactics(bind,grid,twenty);
  assert.deepEqual(bind.encounter!.ghost,{x:4,y:2});
  const bash=fixture('containment_specialist','clearing_bash');
  applyTechnique(bash,'a',{type:'useTalent'},{...grid,blocked:[{x:5,y:2}]},twenty);
  assert.deepEqual(bash.encounter!.ghost,{x:4,y:2});
  assert.equal(bash.encounter!.ghostHealth,1);
  const release=fixture('ritual_specialist','break_bindings');
  release.tactics!.restrained.b=1;
  applyTechnique(release,'a',{type:'useTalent',targetId:'b'},grid,twenty);
  assert.equal(release.tactics!.restrained.b,undefined);
});

test('weakness is consumed by the next ally attack', () => {
  const w=fixture('paranormal_investigator','weakness_analysis');
  w.players.b={x:3,y:3};
  applyTechnique(w,'a',{type:'useTalent'},grid,twenty);
  strikeV2(w,'b',()=>8);
  assert.equal(w.lastCheck?.total,14);
  assert.equal(w.tactics!.exposed,undefined);
  assert.equal(w.encounter!.outcome,'defeated');
});

test('evasion and drag require a telegraph and legal free cells, and use one reaction', () => {
  for(const [role,talent] of [['paranormal_investigator','evasive_step'],['field_medic','emergency_drag']] as const) {
    const w=fixture(role,talent);
    const action={type:'useTalent',targetId:'b',target:{x:1,y:2},allyTarget:{x:1,y:3}};
    w.activePlayer='b';
    assert.throws(()=>applyTechnique(w,'a',action,grid,twenty));
    w.tactics!.telegraph={kind:'wail',cells:[w.players.a,w.players.b]};
    assert.throws(()=>applyTechnique(w,'a',{...action,target:w.players.b},grid,twenty));
    applyTechnique(w,'a',action,grid,twenty);
    assert.equal(w.turns.a.ap,3);
    assert.equal(w.tactics!.reaction.a,1);
    assert.throws(()=>applyTechnique(w,'a',action,grid,twenty));
    advanceTactics(w,grid,twenty);
    assert.equal(w.characters!.a.sanity,10);
  }
});

test('bodyguard redirects a lash and emergency response stabilizes a recipient only once', () => {
  const w=fixture('containment_specialist');
  w.tactics!.telegraph={kind:'lash',cells:[w.players.b]};
  applyTechnique(w,'a',{type:'usePassive',targetId:'b'},grid,twenty);
  advanceTactics(w,grid,twenty);
  assert.equal(w.characters!.a.hp,9);
  assert.equal(w.characters!.b.hp,10);
  const medic=fixture('field_medic');
  medic.characters!.b.hp=0;
  applyTechnique(medic,'a',{type:'usePassive',targetId:'b'},grid,twenty);
  assert.equal(medic.characters!.b.hp,3);
  medic.characters!.b.hp=0; medic.turns.a=startTurn();
  assert.throws(()=>applyTechnique(medic,'a',{type:'usePassive',targetId:'b'},grid,twenty));
});

test('healing and composure effects cap resources and cannot be repeated for the same ally', () => {
  for(const [role,talent,resource,before,after] of [
    ['field_medic','field_first_aid','hp',9,10],
    ['field_medic','composure_kit','sanity',0,1],
    ['medium','share_composure','sanity',8,9],
  ] as const) {
    const w=fixture(role,talent);
    w.characters!.b[resource]=before;
    applyTechnique(w,'a',{type:'useTalent',targetId:'b'},grid,twenty);
    assert.equal(w.characters!.b[resource],after);
    w.characters!.b[resource]=before;
    w.turns.a=startTurn();
    assert.throws(()=>applyTechnique(w,'a',{type:'useTalent',targetId:'b'},grid,twenty));
  }
});

test('wail can be cancelled and scanner reveals only within line of effect', () => {
  const w=fixture('medium','silence_wail');
  w.tactics!.telegraph={kind:'wail',cells:[w.players.a]};
  applyTechnique(w,'a',{type:'useTalent'},grid,twenty);
  assert.equal(w.tactics!.telegraph,undefined);
  const scan=fixture('occult_engineer','spirit_scanner');
  scan.encounter!.ghost={x:4,y:2};
  scan.tactics!.concealed=true;
  assert.throws(()=>applyTechnique(scan,'a',{type:'useTalent'},{...grid,blocked:[{x:3,y:2}]},twenty));
  applyTechnique(scan,'a',{type:'useTalent'},grid,twenty);
  assert.equal(scan.tactics!.scanned,2);
});

test('the engineer places a free warning device and a paid trap triggers once on entry', () => {
  const w=fixture('occult_engineer','electric_talisman_trap');
  w.encounter!.ghost={x:4,y:2};
  const target={x:3,y:2};
  applyTechnique(w,'a',{type:'usePassive',target},grid,twenty);
  assert.equal(w.turns.a.ap,3);
  assert.throws(()=>applyTechnique(w,'a',{type:'usePassive',target},grid,twenty));
  applyTechnique(w,'a',{type:'useTalent',target},grid,twenty);
  advanceTactics(w,grid,twenty);
  assert.equal(w.tactics!.traps.a,undefined);
  assert.equal(w.encounter!.outcome,'defeated');
});

test('boss binding reduces movement and jammer cancels only a prepared special', () => {
  const bound=fixture('containment_specialist','spirit_binding');
  bound.encounter!.ghost={x:4,y:2};
  bound.tactics!.profile={boss:true,armor:1,movement:2,canPacify:false};
  applyTechnique(bound,'a',{type:'useTalent'},grid,twenty);
  advanceTactics(bound,grid,twenty);
  assert.deepEqual(bound.encounter!.ghost,{x:4,y:2});

  const jammer=fixture('occult_engineer','ritual_jammer');
  jammer.tactics!.profile={boss:true,armor:1,movement:1};
  assert.throws(()=>applyTechnique(jammer,'a',{type:'useTalent'},grid,twenty));
  jammer.tactics!.telegraph={kind:'wail',cells:[jammer.players.a]};
  applyTechnique(jammer,'a',{type:'useTalent'},grid,twenty);
  assert.equal(jammer.tactics!.telegraph,undefined);
  advanceTactics(jammer,grid,twenty);
  assert.equal(jammer.characters!.a.sanity,10);
  assert.ok(jammer.tactics!.telegraph);
});

test('boss armor, Calm and anchor-powered dispersal keep combat separate from ritual outcomes', () => {
  const w=fixture('medium','soothe_spirit');
  w.tactics!.profile={boss:true,armor:1,movement:1,canPacify:false,anchorActive:true};
  applyTechnique(w,'a',{type:'useTalent'},grid,twenty);
  assert.equal(w.encounter!.outcome,null);
  assert.equal(w.tactics!.calmUntil,1);
  advanceTactics(w,grid,twenty);
  assert.equal(w.tactics!.telegraph,undefined);
  strikeV2(w,'a',twenty);
  assert.equal(w.encounter!.ghostHealth,0);
  assert.equal(w.encounter!.outcome,null);
  assert.equal(w.tactics!.profile.anchorActive,true);
  advanceTactics(w,grid,twenty);
  assert.equal(w.encounter!.ghostHealth,0);
  advanceTactics(w,grid,twenty);
  assert.equal(w.encounter!.ghostHealth,2);
});
