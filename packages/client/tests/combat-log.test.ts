import assert from 'node:assert/strict';
import {test} from 'node:test';
import {combatStatuses,describeBeat,describeChanges} from '../src/ui/combat/combatLogPresentation';
import type {BattleView} from '../src/ui/combat/EncounterBoard';
import {createCharacter} from '@baan/shared';
const b=():BattleView=>({title:'ฉาก',round:3,active:'p',objective:false,enemies:[{id:'ghost',name:'ผี',hp:8,position:{x:0,y:0}}],turnEncounter:{party:['p'],acted:[],history:[],ready:true,maxHp:8},danger:[],flooded:[],projections:[],reaction:{},restrained:{}});
test('history retains event names when a participant leaves or renames and identifies interception',()=>{
 const text=describeBeat({round:1,actor:'ghost',actorName:'ผีเงาจมน้ำ 2',target:'p',targetName:'ต้น',intendedTargetName:'เมฆ',label:'มือจากใต้พื้น'},()=> 'ชื่อใหม่');
 assert.match(text,/ผีเงาจมน้ำ 2/);assert.match(text,/กับต้น/);assert.match(text,/รับแทนเมฆ/);assert.doesNotMatch(text,/ชื่อใหม่/);
});
test('historical resource changes display actual before and after amounts',()=>{
 const result=describeChanges({round:1,actor:'p',label:'ท่า',changes:[{id:'p',name:'ต้น',hp:{before:10,after:9},focus:{before:4,after:3}}]});
 assert.deepEqual(result,['ต้น · ชีวิต 10 → 9','ต้น · สมาธิ 4 → 3']);
});
test('status panel excludes expired states and explains live restrictions and expiry',()=>{
 const battle=b(),characters={p:createCharacter('medium',undefined,undefined,true)};
 battle.restrained.p=2;battle.turnEncounter!.shaken={p:3};battle.turnEncounter!.unsteady={p:2};battle.turnEncounter!.guarded={p:2};
 const statuses=combatStatuses(battle,'p',characters,id=>id);
 assert.deepEqual(statuses.map(s=>s.label),['หวาดกลัว']);assert.match(statuses[0].expiry,/3/);
 assert.match(statuses[0].effect,/ท่าอาชีพ/);
});
test('ward, cover and ghost opening describe different consumption conditions',()=>{
 const battle=b(),characters={p:createCharacter('medium',undefined,undefined,true)};
 battle.turnEncounter!.conditions={ward:{p:true},cover:{p:'protector'},silenced:{ghost:true}};
 battle.enemies[0].opening={actor:'p',until:4};
 assert.match(combatStatuses(battle,'p',characters,()=> 'บอดี้การ์ด').find(s=>s.label==='มีผู้คุ้มกัน')!.effect,/บอดี้การ์ด/);
 const statuses=combatStatuses(battle,'ghost',characters,id=>id);
 assert.ok(statuses.some(s=>s.label==='สะกดเสียง'));assert.match(statuses.find(s=>s.label==='มีช่องเปิด')!.expiry,/4/);
});
test('dispersed Final body does not claim that the ritual has stopped',()=>{
 const battle=b();battle.final55={step:3,shield:'down'};battle.enemies[0].hp=0;
 assert.match(combatStatuses(battle,'ghost',{},id=>id)[0].effect,/พิธียังไม่หยุด/);
});
