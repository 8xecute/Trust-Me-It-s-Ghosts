import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCharacter,startGhostEncounter,startTurn} from '@baan/shared';
import {applyTechnique,newTactics} from '../src/tacticalEncounter.js';
import type {World} from '../src/world.js';
function fixture(maxHp?:number) {
 const medic=createCharacter('field_medic',undefined,{talent:'field_first_aid'},true);
 const target={...createCharacter('medium',undefined,undefined,true),hp:maxHp===15?14:9,maxHp};
 const w={players:{a:{x:0,y:0},b:{x:1,y:0}},characters:{a:medic,b:target},turns:{a:startTurn(),b:startTurn()},tactics:newTactics(),encounter:startGhostEncounter({x:0,y:0},{x:3,y:3}),activePlayer:'a',basicMode:false} as unknown as World;
 return {w,target};
}
test('healing reaches fifteen for new characters without overhealing',()=>{
 const {w,target}=fixture(15);
 applyTechnique(w,'a',{type:'useTalent',targetId:'b'},{width:5,height:5,blocked:[]},()=>20);
 assert.equal(target.hp,15);
});
test('legacy character healing remains capped at ten',()=>{
 const {w,target}=fixture();
 applyTechnique(w,'a',{type:'useTalent',targetId:'b'},{width:5,height:5,blocked:[]},()=>20);
 assert.equal(target.hp,10);
});
