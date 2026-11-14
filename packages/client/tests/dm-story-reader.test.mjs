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
 const reader={scenes:[{id:'A1',title:'ทางเข้าหมู่บ้าน',phase:'A',brief:['เปิดคดี','ไปบ้านผู้ใหญ่'],beginner:{see:'ประเสริฐถือแฟ้ม',ask:'คุณอยากถามอะไร?',outcomes:'เลือกคุยหรือดูแฟ้มได้'},dialogue:[
  {id:'opening',speaker:'ประเสริฐ',label:'บทหลัก',text:'ขอบคุณที่เดินทางมาครับ'},
  {id:'duplicate',speaker:'ประเสริฐ',label:'คนหาย',text:'“ดล นิด เพิ่ม”'},
 ]}],
  endings:{},checks:[],observed:['A1'],presented:[],
  sendableQaIds:['A1_Q001'],qa:[{id:'A1_Q001',scene:'A1',question:'คนหายมีใครบ้าง?',answer:'ดล นิด เพิ่ม',speaker:'ประเสริฐ',kind:'npc',aliases:[],requirements:[],dm_note:''}]};
 const html=renderToStaticMarkup(createElement(DmStoryReader,{reader,view:{scene:'A1'},connected:true,action:()=>{}}));
 assert.match(html,/คนหายมีใครบ้าง/);
 for(const label of ['เห็นอะไร','ชวนถามอะไร','เลือกผลแบบไหนได้','ประเสริฐถือแฟ้ม','คุณอยากถามอะไร','เลือกคุยหรือดูแฟ้มได้'])assert.ok(html.includes(label));
 assert.match(html,/ดล นิด เพิ่ม/);
 assert.match(html,/คำถามสำคัญ/);
 assert.match(html,/data-important="true"/);
 assert.match(html,/เฉพาะข้อสำคัญ/);
 assert.match(html,/ขอบคุณที่เดินทางมาครับ/);
 assert.match(html,/บทพูดเปิดและปฏิกิริยาในฉาก/);
 assert.equal((html.match(/ดล นิด เพิ่ม/g) ?? []).length,2,'answer appears only in its Q&A preview and editor');
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

test('DM reader distinguishes NPC dialogue, narration and private guidance',()=>{
 const bundled=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/gm/DmStoryReader.tsx',import.meta.url))],
  bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};
 new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const base={scene:'A1',aliases:[],requirements:[],guard_ids:[],dm_note:''};
 const reader={scenes:[{id:'A1',title:'ศาลา',phase:'A',brief:['',''],dialogue:[]}],endings:{},checks:[],observed:[],presented:[],
  sendableQaIds:[],qa:[
   {...base,id:'npc',question:'ใครหาย?',answer:'คนหายสามคน',speaker:'ประเสริฐ',kind:'npc'},
   {...base,id:'env',question:'เห็นอะไร?',answer:'รถจอดริมทาง',speaker:'DM',kind:'environment'},
   {...base,id:'private',question:'จัดการผลอย่างไร?',answer:'คำแนะนำลับ',speaker:'DM',kind:'action'},
  ]};
 const html=renderToStaticMarkup(createElement(module.exports.DmStoryReader,{reader,view:{scene:'A1'},connected:true,action:()=>{}}));
 assert.match(html,/NPC พูด · ประเสริฐ/);
 assert.match(html,/DM บรรยาย/);
 assert.match(html,/เฉพาะ DM · ห้ามอ่านให้ผู้เล่น/);
 assert.match(html,/คำแนะนำลับ/);
 const privateCard=html.split('data-kind="action"')[1].split('ประวัติคำตอบที่ส่งจริง')[0];
 assert.doesNotMatch(privateCard,/<form|<textarea|ยืนยันส่งคำตอบให้ผู้เล่น/);
 assert.equal((html.match(/<textarea/g) ?? []).length,2);
 assert.equal((html.match(/disabled=""[^>]*>ยืนยันส่งคำตอบให้ผู้เล่น/g) ?? []).length,2);
});

test('missing authored player text never presents private guidance as NPC dialogue or a draft',()=>{
 const bundled=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/gm/DmStoryReader.tsx',import.meta.url))],
  bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};
 new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const guidance='ข้อมูลลับสำหรับผู้ดำเนินเกมเท่านั้น C3/F4';
 const reader={scenes:[{id:'A1',title:'ศาลา',phase:'A',brief:['',''],dialogue:[]}],endings:{},checks:[],observed:[],presented:[],sendableQaIds:[],qa:[
  {id:'private-draft',scene:'A1',question:'ได้ยินเสียงใคร?',answer:'',guidance,speaker:'ประเสริฐ',kind:'npc',aliases:[],requirements:[],dm_note:''},
 ]};
 const html=renderToStaticMarkup(createElement(module.exports.DmStoryReader,{reader,view:{scene:'A1'},connected:true,action:()=>{}}));
 assert.match(html,/ยังไม่มีบทพร้อมอ่าน/);
 assert.ok(html.includes(guidance),'private guidance remains accessible to the DM');
 assert.doesNotMatch(html,/<blockquote class="dm-qa-answer">/);
 assert.match(html,/<textarea[^>]*><\/textarea>/);
});


test('conditional responses are not shown as opening dialogue',()=>{
 const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/gm/DmStoryReader.tsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const reader={scenes:[{id:'B2',title:'วิชัย',phase:'B',brief:['สอบถาม','ไปต่อ'],dialogue:[{id:'conditional',speaker:'วิชัย',label:'คำตอบตามเงื่อนไข',text:'เรื่องรอดน้ำท่วมที่ห้ามเกริ่นเอง'}]}],endings:{},checks:[],observed:[],presented:[],qa:[]};
 const html=renderToStaticMarkup(createElement(module.exports.DmStoryReader,{reader,view:{scene:'B2'},connected:true,action:()=>{}}));
 assert.doesNotMatch(html,/เรื่องรอดน้ำท่วมที่ห้ามเกริ่นเอง|บทพูดเปิดและปฏิกิริยา/);
});
