import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneAspect,scenePlacement,scenePoint} from '../src/ui/case/scenePlacement';

test('scene coordinates stay fixed across desktop and mobile image sizes',()=>{
  for(const width of [340,768,1440]) {
    const rect={left:23,top:79,width,height:width/sceneAspect};
    const point=scenePoint(rect.left+width*.36,rect.top+rect.height*.82,rect);
    assert.ok(Math.abs(point.x-36)<1e-10);
    assert.ok(Math.abs(point.y-82)<1e-10);
    const actual=scenePlacement(point),expected=scenePlacement({x:36,y:82});
    for(const key of ['x','y','height','width'] as const)assert.ok(Math.abs(actual[key]-expected[key])<1e-10);
  }
});

test('cutouts stay inside the image at all edges and supported sizes',()=>{
  for(const scale of [.6,1,1.6])for(const x of [-10,0,50,100,110])for(const y of [-10,0,50,100,110]){
    const placed=scenePlacement({x,y,scale});
    assert.ok(placed.y-placed.height>=0);
    assert.ok(placed.y<=100);
    assert.ok(placed.x-placed.width/2>=0);
    assert.ok(placed.x+placed.width/2<=100);
    assert.ok(Math.abs(placed.width*sceneAspect*1.5-placed.height)<1e-10);
  }
  assert.ok(scenePlacement({x:50,y:90}).height>scenePlacement({x:50,y:50}).height);
  assert.deepEqual(scenePoint(-5,200,{left:0,top:0,width:100,height:100}),{x:0,y:100});
});
