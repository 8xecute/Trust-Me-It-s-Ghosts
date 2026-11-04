import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, isBlocked, Movement } from '../src/game/movement';

const grid = { width: 4, height: 3, blocked: [{x:1,y:0},{x:1,y:1}] };
test('blocked cells and bounds reject movement', () => {
  assert.equal(isBlocked(grid,{x:1,y:0}),true);
  assert.equal(isBlocked(grid,{x:-1,y:0}),true);
  assert.equal(isBlocked(grid,{x:0,y:1}),false);
  const movement = new Movement(grid,{x:0,y:0});
  assert.equal(movement.stepDirection(1,0),false);
  assert.deepEqual(movement.position,{x:0,y:0});
});
test('finds shortest route around blockers', () => {
  const path = findPath(grid,{x:0,y:0},{x:2,y:0});
  assert.equal(path?.length,6);
  let previous = {x:0,y:0};
  for (const cell of path!) { assert.equal(isBlocked(grid,cell),false); assert.equal(Math.abs(cell.x-previous.x)+Math.abs(cell.y-previous.y),1); previous=cell; }
  assert.deepEqual(previous,{x:2,y:0});
});
test('rejects blocked and unreachable targets and handles same cell', () => {
  assert.equal(findPath(grid,{x:0,y:0},{x:1,y:0}),null);
  assert.equal(findPath({...grid,blocked:[...grid.blocked,{x:1,y:2}]},{x:0,y:0},{x:2,y:0}),null);
  assert.deepEqual(findPath(grid,{x:0,y:0},{x:0,y:0}),[]);
});
test('movement follows route and keyboard cancels it', () => {
  const movement = new Movement(grid,{x:0,y:0});
  assert.equal(movement.moveTo({x:2,y:0}),true);
  movement.advance(); assert.deepEqual(movement.position,{x:0,y:1});
  movement.stepDirection(0,-1); movement.advance();
  assert.deepEqual(movement.position,{x:0,y:0});
});
