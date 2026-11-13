import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('DM reader renders immediately after case start with questions present',()=>{
 const bundled=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/gm/DmStoryReader.tsx',import.meta.url))],
  bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};
 new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const {DmStoryReader}=module.exports;
 const reader={scenes:[{id:'A1',title:'ทางเข้าหมู่บ้าน',phase:'A',brief:['เปิดคดี','ไปบ้านผู้ใหญ่'],dialogue:[]}],
  endings:{},checks:[],observed:['A1'],presented:[],
  sendableQaIds:['A1_Q001'],qa:[{id:'A1_Q001',scene:'A1',question:'คนหายมีใครบ้าง?',answer:'ดล นิด เพิ่ม',speaker:'ประเสริฐ',kind:'npc',aliases:[],requirements:[],dm_note:''}]};
 const html=renderToStaticMarkup(createElement(DmStoryReader,{reader,view:{scene:'A1'},connected:true,action:()=>{}}));
 assert.match(html,/คนหายมีใครบ้าง/);
 assert.match(html,/ดล นิด เพิ่ม/);
 assert.match(html,/ยังไม่ส่ง/);
 assert.match(html,/ยืนยันส่งคำตอบให้ผู้เล่น/);
 assert.doesNotMatch(html,/disabled=""[^>]*>ยืนยันส่งคำตอบให้ผู้เล่น/);
});

test('player has no DM messaging or story-control panel',()=>{
 const bundled=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/case/GuidedPanel.tsx',import.meta.url))],
  bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};
 new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const html=renderToStaticMarkup(createElement(module.exports.GuidedPanel,{
  view:{version:'5.5',phase:'A',scene:'A1',cue:'ทีมมาถึงหมู่บ้าน',prompts:['คำถามสำเร็จรูปที่ต้องไม่แสดง'],questionOptions:[{speaker:'ประเสริฐ',label:'คำถามเก่า'}],journals:[],escorting:0},
  connected:true,action:()=>{}}));
 assert.equal(html,'');
});

test('player story shows narration without Act IDs or transition confirmation',()=>{
 const bundled=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/case/CaseStoryThread.tsx',import.meta.url))],
  bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};
 new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const html=renderToStaticMarkup(createElement(module.exports.CaseStoryThread,{
  view:{phase:'A',scene:'A3',title:'ทางไปบ้านผู้ใหญ่',cue:'ประเสริฐชี้ทาง',transition:{id:'t',to:'B',known_facts:[],next_destination_rationale:'เดินทางต่อ'}},
  beats:[{sequence:1,eventId:'guided-cue:A3',scene:'A3',phase:'A',site:'A',text:'ประเสริฐชี้ทาง'}],showHistory:true,onConfirm:()=>{}}));
 assert.match(html,/ประเสริฐชี้ทาง/);
 assert.doesNotMatch(html,/A3|บท B|ยืนยันไป|พร้อมไป|ฉาก A/);
});


test('DM fallback shows current script while player controls stay absent',()=>{
 const bundled=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/case/GuidedPanel.tsx',import.meta.url))],
  bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};
 new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const html=renderToStaticMarkup(createElement(module.exports.GuidedPanel,{
  view:{phase:'A',scene:'A1',journals:[]},scenes:[{id:'A1',script:'ประเสริฐต้อนรับทีม',sent:false}],
  isDm:true,dmNavigation:false,connected:true,action:()=>{}}));
 assert.match(html,/ประเสริฐต้อนรับทีม/);
 assert.doesNotMatch(html,/รอผู้สืบสวนยืนยัน|ยืนยันไป/);
});
