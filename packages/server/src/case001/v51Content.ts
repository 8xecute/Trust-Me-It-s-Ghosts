import { readFileSync } from 'node:fs';

export type V51Line={id:string;scene:string;speaker:string;label:string;text:string;context:string;field:string};
export type V51Scene={id:string;title:string;phase:string;purpose:string;presence:string;dmReadAloud:string;npcLines:string;responses:string;clues:string;fallback:string;nextSceneHandoff:string;dmSecret:string;sourceMarkdown:string;cue:string;questions:string[];checkId:string|null;dialogue:V51Line[]};
type EndingScript={title:string;script:string;paragraphs:string[]};
export type StoryBranch={dm:string;dialogue:string;information:string[];state?:string};
export type StoryCheck={
 id:string;scene_id:string;title:string;stat:string;dc:number;partial_margin:number;
 trigger:string;baseline:string;bypass:string;fallback:string;sourceMarkdown?:string;decision?:string;
 full:StoryBranch;partial:StoryBranch;failure:StoryBranch;
};
function loadStory(version:'5.1'|'5.2'|'5.3') {
 const path=(suffix:string)=>new URL('../../scenarios/case-001/case-001.v'+version+'.'+suffix,import.meta.url);
 const read=(suffix:string)=>JSON.parse(readFileSync(path(suffix),'utf8'));
 const scenes=Object.assign({},...['A','B','C','D','E','F'].map(act=>read(act+'.json'))) as Record<string,V51Scene>;
 const endings=read('endings.json') as Record<string,EndingScript>;
 const script=readFileSync(path('script.md'),'utf8');
 if(Object.keys(scenes).length!==31 || Object.keys(endings).join('')!=='ABCD' ||
  Object.values(scenes).some(scene=>scene.dialogue.some(line=>!script.includes(line.text)))) {
  throw Error('ต้นฉบับ CASE 001 v'+version+' ไม่ครบ');
 }
 return {scenes,endings,script,checks:version!=='5.1'?read('checks.json') as StoryCheck[]:[]};
}
const legacy=loadStory('5.1');
export const {scenes:scenes51,endings:endings51,script:script51}=legacy;
const current=loadStory('5.2');
const latest=loadStory('5.3');
export const checks52=current.checks;
export const checks53=latest.checks;
export const noTimer=(state:{guided?:{version:string}})=>['5.2','5.3'].includes(state.guided?.version ?? '');
export const storyContent=(state:{guided?:{version:string}})=>state.guided?.version==='5.3'?latest:noTimer(state)?current:legacy;

const briefs52=JSON.parse(readFileSync(new URL('../../scenarios/case-001/case-001.v5.2.briefs.json',import.meta.url),'utf8')) as Record<string,[string,string]>;
if(Object.keys(briefs52).length!==31 || Object.keys(current.scenes).some(id=>!briefs52[id]))throw Error('สรุปฉาก v5.2 ไม่ครบ');
export function sceneBrief52(id:string) {
 return briefs52[id];
}

const endingBriefs:Record<string,string>={
 A:'ทุกคนรอด พิธีหยุด ทีมมีหลักฐานเอาผิดและเปิดเผยเรื่องปี 2534 แม่แก้วยอมยุติภัยเอง',
 B:'ช่วยครบและหยุดพิธีแล้ว แต่แม่แก้วยังเป็นภัยหรือวิชัยถูกเธอฆ่า',
 C:'หยุดพิธีแล้ว แต่ยังมีคนช่วยไม่ทันหรือหลักฐานไม่ครบ',
 D:'ทีมต้องถอนตัวขณะพิธียังทำงาน หรือมีผู้สืบสวนเสียชีวิต',
};

function makeReader(content:typeof current) {return {
 scenes:Object.values(content.scenes).map(({id,title,phase,dialogue})=>({
  id,title,phase,brief:content===latest?[content.scenes[id].purpose,content.scenes[id].nextSceneHandoff]:briefs52[id], secret:content===latest?content.scenes[id].dmSecret:undefined, clues:content===latest?content.scenes[id].clues:undefined,
  dialogue:dialogue.map(({id,speaker,label,text})=>({id,speaker,label:readerLabel(label),text})),
 })),
 endings:Object.fromEntries(Object.entries(content.endings).map(([id,{title,paragraphs}])=>[id,{title:title.split(' / ')[0],brief:endingBriefs[id],paragraphs}])),
 checks:content.checks.map(({scene_id,title,stat,dc,partial_margin,decision,full,partial,failure})=>({
  scene_id,title,stat,dc,partial_margin,decision:decision?'การทอยนี้ยังไม่เปิดใช้ ทีมคุยกับยายและหาเบาะแสต่อได้':'',
  full:readerLabel(full.dm),partial:readerLabel(partial.dm),failure:readerLabel(failure.dm),
 })),
};}
export const reader52=makeReader(current);
export const reader53=makeReader(latest);

export function readerLabel(text:string) {
 return text.replace(/^\[?v\d+(?:\.\d+)+(?:\s*·)?\s*/i,'').replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b(?:\s*=\s*[a-z0-9_|]+)?/g,'').replace(/^เสนอเพิ่ม\s*·\s*/, '').replace(/[\[\]\x60*]/g,'').trim();
}
