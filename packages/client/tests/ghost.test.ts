import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startGhostEncounter,playerGhostAction,runGhostPhase,ghostDecision} from '../../shared/src/ghost';
const grid={width:4,height:4,blocked:[{x:1,y:0}]};
test('pacification resolves encounter',()=>{const s=startGhostEncounter({x:0,y:1},{x:1,y:1}); assert.equal(playerGhostAction(s,'pacify',grid).outcome,'pacified');});
test('escape requires boundary',()=>{const s=startGhostEncounter({x:1,y:1},{x:3,y:3}); assert.equal(playerGhostAction(s,'escape',grid),s); assert.equal(playerGhostAction({...s,player:{x:0,y:1}},'escape',grid).outcome,'escaped');});
test('two strikes cause temporary defeat',()=>{const s=startGhostEncounter({x:0,y:1},{x:1,y:1}); const one=playerGhostAction(s,'strike',grid); const two=playerGhostAction(one,'strike',grid); assert.equal(two.outcome,'defeated'); assert.equal(two.manifestation,0);});
test('ghost moves around blocks and attacks deterministically',()=>{let s=startGhostEncounter({x:0,y:0},{x:2,y:0}); assert.deepEqual(ghostDecision({...s,phase:'ghost'},grid),{type:'move',target:{x:2,y:1}}); s=runGhostPhase(s,grid); assert.deepEqual(s.ghost,{x:2,y:1}); const near={...s,ghost:{x:0,y:1}}; assert.equal(runGhostPhase(near,grid).playerHealth,2);});
