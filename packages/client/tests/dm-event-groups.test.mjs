import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';

const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/gm/dmEventGroups.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node'});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {dmEventGroup,isSceneInteraction}=module.exports;

test('travel stays with NPCs and evidence stays separate from danger responses',()=>{
 for(const id of ['wichai-route:called','wichai-route:followed','wichai-arrived','wichai-depart:D','wichai-escaped'])assert.equal(dmEventGroup(id),'npc');
 for(const id of ['read-gate:E4','read-shelter','collect-land','disclosed'])assert.equal(dmEventGroup(id),'evidence');
 assert.equal(dmEventGroup('backlash-prevented'),'scene');
});

test('non-roll searches and rescues remain reachable without routine survey controls',()=>{
 for(const id of ['key','search-ritual-bag','approach-ritual-core','escort:ดล','clue:E02'])assert.equal(isSceneInteraction({id,check:false}),true);
 for(const id of ['survey-arrival','advance','finish','travel:E'])assert.equal(isSceneInteraction({id,check:false}),false);
 assert.equal(isSceneInteraction({id:'search-ritual-bag',check:true}),false);
});
