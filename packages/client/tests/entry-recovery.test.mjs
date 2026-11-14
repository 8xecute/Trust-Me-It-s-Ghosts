import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as shared from '@baan/shared';
const {createCharacter}=shared;
async function load(file){
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/'+file,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'image-only-stubs',setup(b){
  b.onLoad({filter:/CastPortraits\.tsx$/},()=>({contents:'export const portraitUrl=(key)=>key+".jpg";',loader:'js'}));
  b.onLoad({filter:/CaseScene\.tsx$/},()=>({contents:'export const CaseScene=()=>null;',loader:'js'}));
 }}]});const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(name=>name==='@baan/shared'?shared:createRequire(import.meta.url)(name),module,module.exports);return module.exports;
}
test('selected character offers change or release, never a redundant save',async()=>{
 const {CharacterCreator}=await load('ui/characters/CharacterCreator.tsx');
 const html=renderToStaticMarkup(createElement(CharacterCreator,{character:createCharacter('medium',undefined,undefined,true),taken:[],editable:true,disabled:false,onCreate:()=>{},onRelease:()=>{}}));
 assert.match(html,/เลือกแล้ว/);assert.match(html,/เปลี่ยนตัวละคร/);assert.match(html,/ยกเลิกการเลือก/);assert.doesNotMatch(html,/บันทึกตัวละคร|บันทึกชื่อ|เลือกตัวละครนี้แทน/);
});
test('lobby separates resuming an identity from importing a DM save',async()=>{
 const {Lobby}=await load('ui/lobby/Lobby.tsx');
 const html=renderToStaticMarkup(createElement(Lobby,{connected:true,publicRooms:[],resumeRoom:()=>{},importSave:()=>{},recoverRoom:()=>{},createRoom:()=>{},joinRoom:()=>{}}));
 for(const text of ['กลับเข้าเล่นต่อ','ฉันเป็นผู้เล่น','ฉันเป็น DM','DM จัดทีมวันนี้'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/โหลดเซฟและจัดทีม/); // Selecting a file is not importing it.
});
test('DM session panel waits for an absent selected member, preserving a parked character',async()=>{
 const {SessionSaveControls}=await load('ui/gm/SessionSaveControls.tsx');
 const html=renderToStaticMarkup(createElement(SessionSaveControls,{socket:null,connected:true,paused:true,playerName:id=>id,investigators:[{id:'one',connected:true},{id:'two',connected:false},{id:'three',connected:false}],inactive:['three'],action:()=>{}}));
 assert.match(html,/รอ two กลับเข้าห้อง/);assert.match(html,/พักวันนี้/);assert.match(html,/disabled=""[^>]*>เปิดเล่นต่อ/);
});
test('save preview validates format and only projects labels, without restoring state',async()=>{
 const {savePreview}=await load('ui/lobby/savePreview.ts');
 assert.throws(()=>savePreview({}),/รูปแบบ/);
 const save={format:'baan-session',version:1,membership:{room:{code:'ABC123',players:[{}, {}, {}]}},state:{world:{humanDmId:'dm',secret:'hidden',case001:{title:'คดีทดสอบ',location:'ศาลา',guided:{version:'5.5'},secret:'DM only'}}}};
 const before=JSON.stringify(save);assert.deepEqual(savePreview(save),{room:'ABC123',title:'คดีทดสอบ',location:'ศาลา',players:2});assert.equal(JSON.stringify(save),before);
});
