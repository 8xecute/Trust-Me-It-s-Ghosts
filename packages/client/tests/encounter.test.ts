import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Encounter, canPlace } from '../src/game/encounter';
const grid = {width:4,height:4,blocked:[{x:1,y:0}]};
test('mode transitions preserve token and object positions', () => { const tokens = [{id:'player',position:{x:0,y:0}},{id:'object',position:{x:2,y:2}}]; const e = new Encounter(tokens); e.setMode('encounter'); e.setMode('exploration'); assert.deepEqual(tokens.map(t=>t.position),[{x:0,y:0},{x:2,y:2}]); });
test('placement rejects occupied, blocked and out of bounds cells', () => { const tokens=[{id:'player',position:{x:0,y:0}},{id:'other',position:{x:0,y:1}}]; assert.equal(canPlace(grid,tokens,'player',{x:1,y:0}),false); assert.equal(canPlace(grid,tokens,'player',{x:0,y:1}),false); assert.equal(canPlace(grid,tokens,'player',{x:-1,y:0}),false); });
test('encounter permits one adjacent unobstructed move per turn', () => { const e=new Encounter([{id:'player',position:{x:0,y:0}}]); e.setMode('encounter'); assert.equal(e.move(grid,'player',{x:2,y:0}),false); assert.equal(e.move(grid,'player',{x:1,y:0}),false); assert.equal(e.move(grid,'player',{x:0,y:1}),true); assert.equal(e.move(grid,'player',{x:0,y:2}),true); assert.equal(e.turn.ap,1); e.endTurn(); assert.equal(e.turn.ap,3); e.setMode('exploration'); assert.deepEqual(e.tokens[0].position,{x:0,y:2}); });
