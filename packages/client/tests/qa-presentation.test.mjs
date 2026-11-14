import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';

const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../src/ui/gm/qaPresentation.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node'});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {groupQuestions,importantQuestions}=module.exports;

test('question groups keep NPCs together before narration and private advice',()=>{
 const q=(id,kind,speaker)=>({id,kind,speaker});
 const questions=[q('private','action','DM'),q('doc','document','DM'),q('general','npc','ประเสริฐ'),q('ton','npc','ต้น'),q('A1_Q001','npc','ประเสริฐ'),q('env','environment','DM')];
 const original=JSON.stringify(questions),groups=groupQuestions(questions);
 assert.deepEqual(groups.map(g=>g.id),['npc:ประเสริฐ','npc:ต้น','dm','action']);
 assert.deepEqual(groups[0].items.map(q=>q.id),['A1_Q001','general']);
 assert.deepEqual(groups[2].items.map(q=>q.id),['doc','env']);
 assert.equal(JSON.stringify(questions),original);
});

test('editorial priorities reference actual authored v5.5 question IDs',()=>{
 const bank=JSON.parse(readFileSync(new URL('../../server/scenarios/case-001/case-001.v5.5.qa.json',import.meta.url),'utf8'));
 const ids=new Set(bank.scenes.flatMap(s=>s.questions.map(q=>q.id)));
 for(const [id,reason] of Object.entries(importantQuestions)){assert.ok(ids.has(id),id);assert.ok(reason.length>0,id);}
});
