import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/gm/DmStuckHelp.tsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external'});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const backup={phase:'A',scene:'A2',opened:true,battle:false,hints:['เสียงน้ำ','เสียงน้ำ'],alternatives:['ไปดูแฟ้มได้'],exit:'ไปดูแฟ้มได้',delivered:[{sequence:1,text:'ประวัติยาวที่ไม่ควรซ้ำ'}],blockers:[]};
const render=(data)=>renderToStaticMarkup(createElement(module.exports.DmStuckHelp,{backup:data,onReadGuide:()=>{throw Error('must not navigate on read');}}));
test('contextual help is collapsed, removes duplicate advice and does not repeat delivery history',()=>{
 const before=JSON.stringify(backup),html=render(backup);
 assert.match(html,/ทีมติดขัด/);assert.doesNotMatch(html,/<details[^>]* open/);
 assert.equal((html.match(/ไปดูแฟ้มได้/g)??[]).length,1);assert.equal((html.match(/เสียงน้ำ/g)??[]).length,1);
 assert.doesNotMatch(html,/ประวัติยาวที่ไม่ควรซ้ำ|ยืนยันส่ง|เปลี่ยนฉากทั้งทีม/);assert.equal(JSON.stringify(backup),before);
});
test('unpublished scene prompts the opening instead of exposing hints',()=>{
 const html=render({...backup,opened:false});assert.match(html,/ส่งบทเปิดฉาก/);assert.doesNotMatch(html,/เสียงน้ำ|ไปดูแฟ้มได้/);
});
test('combat help keeps the current encounter and shows blockers rather than a chapter shortcut',()=>{
 const html=render({...backup,battle:true,blockers:['ยังอยู่ในการเผชิญหน้า']});assert.match(html,/ดำเนินตามคิว/);assert.match(html,/ยังอยู่ในการเผชิญหน้า/);assert.doesNotMatch(html,/ไปดูแฟ้มได้/);
});
test('no backup means no extra help surface',()=>{assert.equal(render(undefined),'');});
