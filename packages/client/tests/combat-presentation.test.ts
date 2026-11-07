import assert from 'node:assert/strict';
import {test} from 'node:test';
import {combatPoint,movementPreview} from '../src/ui/combat/combatPresentation';
test('isometric placement preserves unique grid coordinates',()=>{
 const points=new Set<string>();
 for(let y=0;y<10;y++)for(let x=0;x<14;x++)points.add(JSON.stringify(combatPoint({x,y},10)));
 assert.equal(points.size,140);
 assert.deepEqual(combatPoint({x:2,y:3},10),{left:288,top:140});
});
test('movement preview excludes occupied, blocked and out of budget cells',()=>{
 const grid={width:6,height:3,blocked:[{x:1,y:1}]};
 const reachable=movementPreview(grid,{x:0,y:1},[{x:0,y:0}],[]);
 assert.equal(reachable.has('1,1'),false);
 assert.equal(reachable.has('0,0'),false);
 assert.equal(reachable.get('2,1'),4);
 assert.equal(reachable.has('3,1'),false);
 assert.equal(reachable.has('0,1'),false);
});
test('flooded cells consume the same extra preview distance as server movement',()=>{
 const reachable=movementPreview({width:5,height:1,blocked:[]},{x:0,y:0},[],[{x:1,y:0}]);
 assert.equal(reachable.get('1,0'),2);
 assert.equal(reachable.get('3,0'),4);
 assert.equal(reachable.has('4,0'),false);
});
