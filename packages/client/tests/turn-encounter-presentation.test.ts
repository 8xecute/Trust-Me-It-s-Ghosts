import test from 'node:test';
import assert from 'node:assert/strict';
import type { BattleView } from '../src/ui/combat/EncounterBoard';
import { encounterBrief, encounterState, threatMessage } from '../src/ui/combat/turnEncounterPresentation';

function battle(scene='F1'):BattleView {
  return {title:'เผชิญหน้า',round:1,active:'p1',objective:true,
    turnEncounter:{scene,party:['p1','p2'],acted:[],maxHp:10,ready:true,history:[]},
    enemies:[{id:'ghost',name:'ผี',position:{x:0,y:0},hp:10}],
    danger:[],flooded:[],projections:[],reaction:{},restrained:{}};
}

test('each encounter has a distinct planning brief without displaying scene IDs',()=>{
  const goals=['C4','D4','F1'].map(scene=>encounterBrief(battle(scene)).goal);
  assert.equal(new Set(goals).size,3);
  for(const scene of ['C4','D4','F1'])assert.ok(!JSON.stringify(encounterBrief(battle(scene))).includes(scene));
});

test('dispersed Final body remains distinct from shield progress and ritual completion',()=>{
  const b=battle();
  b.final55={step:0,shield:'up'};
  assert.equal(encounterState(b),'shielded');
  b.final55={step:3,shield:'down'};
  assert.equal(encounterState(b),'exposed');
  b.enemies[0].hp=0;
  assert.equal(encounterState(b),'dispersed');
  assert.match(encounterBrief(b).plan,/ไม่ได้หยุดพิธี/);
  assert.equal(b.final55.step,3);
});

test('warnings require a published telegraph and preserve delayed attack guidance',()=>{
  const b=battle();
  assert.equal(threatMessage(b),undefined);
  b.enemies[0].telegraph={kind:'wail',cells:[],attack:{name_th:'น้ำหลากความทรงจำ',telegraphOneBossTurnBeforeUse:true}};
  assert.match(threatMessage(b)!.detail,/ล่วงหน้าหนึ่งตาผี/);
  assert.match(threatMessage(b)!.title,/น้ำหลากความทรงจำ/);
  delete b.enemies[0].telegraph.attack!.telegraphOneBossTurnBeforeUse;
  assert.doesNotMatch(threatMessage(b)!.detail,/ล่วงหน้าหนึ่งตาผี/);
});
