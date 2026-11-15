import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {NarrativeBeat,NarrativeView} from '@baan/shared';
import {sceneArtwork,siteArtwork,sceneArtFile,publishedScene} from '../src/ui/case/sceneArtCatalog';

test('all 31 authored v5.5 scenes have a backdrop assignment with valid wide assets',()=>{
 const authored=['A','B','C','D','E','F'].flatMap(act=>Object.keys(JSON.parse(readFileSync(new URL('../../server/scenarios/case-001/case-001.v5.5.'+act+'.json',import.meta.url),'utf8'))));
 assert.equal(authored.length,31);assert.deepEqual(Object.keys(sceneArtwork).sort(),authored.sort());
 assert.deepEqual(Object.entries(sceneArtwork).filter(([,art])=>!art.image).map(([id])=>id),['H1']);
 const files=new Set([...Object.values(siteArtwork),...Object.values(sceneArtwork).flatMap(art=>art.image?[art.image]:[])]);
 assert.equal(files.size,18);
 for(const file of files){
  const bytes=readFileSync(new URL('../src/assets/case-001/scenes/'+file,import.meta.url));
  assert.ok(bytes.length>100_000 && bytes.length<650_000,file+' should be a web-sized image');
  assert.equal(bytes.readUInt16BE(0),0xffd8);
  let found=false;
  for(let offset=2;offset<bytes.length;){
   assert.equal(bytes[offset],0xff);const marker=bytes[offset+1],length=bytes.readUInt16BE(offset+2);
   if(marker===0xc0 || marker===0xc2){
    assert.equal(bytes.readUInt16BE(offset+5),941,file);assert.equal(bytes.readUInt16BE(offset+7),1672,file);found=true;break;
   }
   offset+=length+2;
  }
  assert.ok(found,file+' must include JPEG dimensions');
 }
});

const opening=(scene:string,site='E',sequence=1):NarrativeBeat=>({scene,site,sequence,eventId:'guided-cue:'+scene,actor:'dm',scope:'party',text:'บทที่ส่งแล้ว'});
const view=(history:NarrativeBeat[],current:NarrativeBeat|null=history.at(-1) ?? null):NarrativeView=>({history,current,pending:0});

test('player artwork follows delivered scene openings, not a future cue or an answer',()=>{
 assert.equal(publishedScene('E',undefined),undefined);
 assert.equal(publishedScene('E',view([],opening('E4'))),undefined);
 const history=[opening('E2'),{...opening('E4','E',2),eventId:'qa:ritual-room'}];
 assert.equal(publishedScene('E',view(history)), 'E2');
 assert.equal(sceneArtFile('E',publishedScene('E',view(history))),'underhouse-room.jpg');
 history.push(opening('E4','E',3));
 assert.equal(sceneArtFile('E',publishedScene('E',view(history))),'ritual-room.jpg');
 history.push(opening('F4','E',4));
 assert.equal(sceneArtFile('E',publishedScene('E',view(history))),'ritual-memory.jpg');
 assert.equal(publishedScene('C',view(history)),undefined);
});

test('H1 and endings preserve location instead of revealing a new room or forcing a visual outcome',()=>{
 const history=[opening('E4'),opening('H1','E',2),{...opening('ENDING A','E',3),eventId:'ending:A'}];
 assert.equal(publishedScene('E',view(history)),'E4');
 assert.equal(sceneArtFile('E','B4'),'abandoned-house.jpg');
 assert.equal(sceneArtFile('E','unknown'),'abandoned-house.jpg');
 assert.equal(sceneArtFile('D'),'grove-path.jpg');
 assert.equal(sceneArtFile('D','D2'),'banana-grove.jpg');
 const before=JSON.stringify(history);publishedScene('E',view(history));assert.equal(JSON.stringify(history),before);
});
