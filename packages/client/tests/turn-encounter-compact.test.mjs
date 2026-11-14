import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createCharacter} from '@baan/shared';
const bundled=await build({entryPoints:[fileURLToPath(new URL('../src/ui/combat/TurnEncounter.tsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty','.png':'dataurl'},plugins:[{name:'scene-assets',setup(build){build.onResolve({filter:/^@baan\/shared$/},()=>({path:fileURLToPath(new URL('../../shared/src/index.ts',import.meta.url))}));build.onResolve({filter:/CaseScene$|CastPortraits$/},args=>({path:args.path,namespace:'scene-mock'}));build.onLoad({filter:/.*/,namespace:'scene-mock'},()=>({contents:'export const illustrations={C:"scene.png"}; export const portraitUrl=()=>"portrait.png";',loader:'js'}));}}]});
const module={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {TurnEncounter}=module.exports;
function render(isDm=false) {
 const character={...createCharacter('medium',undefined,undefined,true),playerName:'เมฆ'};
 const battle={title:'เสียงใต้พื้น',round:2,active:'p',objective:false,enemies:[{id:'g',name:'ผี',hp:6,maxHp:6,position:{x:0,y:0}}],turnEncounter:{scene:'C4',expandedActions:true,canPacify:true,npcActive:'g',ready:true,party:['p'],acted:[],maxHp:6,shaken:{p:2},history:[{round:1,actor:'g',label:'เสียงเรียก',target:'p',effect:'หวาดกลัว',flavour:{text:'เสียงหลอนแทรกใกล้หู'}}]},restrained:{},reaction:{},danger:[],flooded:[],projections:[]};
 return renderToStaticMarkup(createElement(TurnEncounter,{site:'C',battle,characters:{p:character},self:'p',isDm,enabled:true,action:()=>{}}));
}
function tag(html,className){return html.match(new RegExp('<[^>]+class="'+className+'"[^>]*>'))?.[0];}
test('player disclosures start collapsed while resources and important status remain visible',()=>{
 const html=render();
 for(const className of ['c4-team-panel','c4-status-panel','c4-extra-panel','c4-journal']) {
  assert.match(tag(html,className),/^<details/);assert.doesNotMatch(tag(html,className),/open=/);
 }
 assert.match(html,/สถานะของคุณ/);assert.match(html,/ชีวิต 15\/15/);assert.match(html,/หวาดกลัว/);
 assert.ok(html.indexOf('class="c4-controls"')<html.indexOf('เหตุการณ์ล่าสุด'));
 assert.ok(html.indexOf('class="c4-controls"')<html.indexOf('class="c4-team-panel"'));
 assert.match(html,/เสียงหลอนแทรกใกล้หู/);
});
test('DM keeps full team, expanded statuses and always-visible journal',()=>{
 const html=render(true);
 assert.match(tag(html,'c4-team-panel'),/^<div/);assert.match(tag(html,'c4-journal'),/^<aside/);
 assert.match(tag(html,'c4-status-panel'),/open=/);assert.doesNotMatch(html,/สถานะของคุณ/);
 assert.ok(html.indexOf('เหตุการณ์ล่าสุด')<html.indexOf('class="c4-controls"'));
});
