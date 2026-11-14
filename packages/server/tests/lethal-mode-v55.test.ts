import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newCase} from '../src/case001/case001.js';
import {newGuided} from '../src/case001/guidedCase.js';
import {dmOptions51,newState51} from '../src/case001/storyV51.js';

test('v5.5 story options do not require enabling lethal mode, including older saves',()=>{
 const state=newCase(true,4,'4.1');
 state.guided=newGuided('5.5');
 state.v51=newState51(false,true);
 for(const scene of ['A1','E5','F5']) {
  state.guided.scene=scene;
  state.guided.phase=scene==='A1'?'A':scene==='E5'?'E':'FINAL';
  state.guided.presented=[scene];
  state.site=scene==='A1'?'A':'E';
  const disabled=dmOptions51(state).map(option=>option.id);
  assert.ok(!disabled.includes('enable-lethal'));
  state.v51.lethal=true;
  assert.deepEqual(dmOptions51(state).map(option=>option.id),disabled);
  state.v51.lethal=false;
 }
 state.guided=newGuided('5.3');
 assert.ok(dmOptions51(state).some(option=>option.id==='enable-lethal'));
});
